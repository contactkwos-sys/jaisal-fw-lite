import { nextDocNo, todayISO } from './mutate'
import { supabase } from './supabase'

export type TrackingTotals = {
  orderMeter: number
  programmedMeter: number
  producedMeter: number
  checkedMeter: number
  dispatchedMeter: number
  pendingMeter: number
  progressPct: number
}

export type TodayKpis = {
  todayProduction: number
  todayChecked: number
  todayDispatched: number
  pendingChecking: number
  pendingDispatch: number
}

export type MachineProgramRow = {
  id: string
  program_no: string | null
  machine_no: string | null
  design_no: string | null
  colour: string | null
  party_name: string | null
  marka: string | null
  total_pick: number
  total_meter: number
  produced: number
  balance: number
  status: string
}

const DAMAGE_TYPES = [
  'Stain',
  'Hole',
  'Weaving Fault',
  'Cut',
  'Oil Mark',
  'Printing Fault',
  'Other',
] as const

export { DAMAGE_TYPES }

export async function loadTrackingTotals(): Promise<TrackingTotals> {
  const [{ data: items }, { data: programs }, { data: petty }, { data: entries }, { data: lots }] =
    await Promise.all([
      supabase.from('order_book_items').select('qty_meter').eq('settled', false),
      supabase.from('programs').select('id, dispatched_meter, total_meter, required_meter, status'),
      supabase.from('program_petty').select('program_id, meter'),
      supabase.from('production_entries').select('total_meter, program_id'),
      supabase.from('checking_lots').select('final_meter, status, challan_id'),
    ])

  const orderMeter = (items ?? []).reduce((s, r) => s + Number(r.qty_meter || 0), 0)

  const pettyByProgram = new Map<string, number>()
  for (const p of petty ?? []) {
    pettyByProgram.set(p.program_id, (pettyByProgram.get(p.program_id) || 0) + Number(p.meter || 0))
  }

  let programmedMeter = 0
  let dispatchedMeter = 0
  for (const p of programs ?? []) {
    const fromPetty = pettyByProgram.get(p.id) || 0
    const fromCol = Number(p.total_meter || p.required_meter || 0)
    programmedMeter += fromPetty || fromCol
    dispatchedMeter += Number(p.dispatched_meter || 0)
  }

  const producedMeter = (entries ?? []).reduce((s, r) => s + Number(r.total_meter || 0), 0)
  const checkedMeter = (lots ?? []).reduce((s, r) => s + Number(r.final_meter || 0), 0)
  const pendingMeter = Math.max(0, orderMeter - dispatchedMeter)
  const progressPct = orderMeter > 0 ? Math.min(100, (dispatchedMeter / orderMeter) * 100) : 0

  return {
    orderMeter,
    programmedMeter,
    producedMeter,
    checkedMeter,
    dispatchedMeter,
    pendingMeter,
    progressPct,
  }
}

export async function loadTodayKpis(): Promise<TodayKpis> {
  const today = todayISO()
  const [{ data: prod }, { data: lots }, { data: challans }, { data: allLots }, { data: allProd }] =
    await Promise.all([
      supabase.from('production_entries').select('total_meter').eq('entry_date', today),
      supabase.from('checking_lots').select('final_meter').eq('entry_date', today),
      supabase.from('challans').select('meter, created_at').gte('created_at', `${today}T00:00:00`),
      supabase.from('checking_lots').select('final_meter, challan_id, status, program_id'),
      // Only program-linked production counts toward Checking Pending (matches PdFolding).
      // Orphan/smoke rows with null program_id must not inflate this KPI.
      supabase.from('production_entries').select('total_meter, program_id').not('program_id', 'is', null),
    ])

  const todayProduction = (prod ?? []).reduce((s, r) => s + Number(r.total_meter || 0), 0)
  const todayChecked = (lots ?? []).reduce((s, r) => s + Number(r.final_meter || 0), 0)
  const todayDispatched = (challans ?? []).reduce((s, r) => s + Number(r.meter || 0), 0)

  const producedByProgram = new Map<string, number>()
  for (const e of allProd ?? []) {
    if (!e.program_id) continue
    producedByProgram.set(
      e.program_id,
      (producedByProgram.get(e.program_id) || 0) + Number(e.total_meter || 0),
    )
  }
  const checkedByProgram = new Map<string, number>()
  for (const l of allLots ?? []) {
    if (!l.program_id) continue
    const st = String(l.status || '')
    if (/hold|reject/i.test(st)) continue
    checkedByProgram.set(
      l.program_id,
      (checkedByProgram.get(l.program_id) || 0) + Number(l.final_meter || 0),
    )
  }
  let pendingChecking = 0
  for (const [programId, produced] of producedByProgram) {
    const checked = checkedByProgram.get(programId) || 0
    pendingChecking += Math.max(0, produced - checked)
  }

  const pendingDispatch = (allLots ?? [])
    .filter((l) => !l.challan_id && l.status !== 'Dispatched')
    .reduce((s, r) => s + Number(r.final_meter || 0), 0)

  return {
    todayProduction,
    todayChecked,
    todayDispatched,
    pendingChecking,
    pendingDispatch,
  }
}

export async function nextProgramNo(orderNo: string): Promise<string> {
  const prefix = `PRG-${(orderNo || '0000').replace(/^ORD-/i, '')}-`
  const { data } = await supabase
    .from('programs')
    .select('program_no')
    .like('program_no', `${prefix}%`)
    .order('program_no', { ascending: false })
    .limit(50)
  const existing = (data ?? []).map((r) => r.program_no || '')
  let max = 0
  for (const n of existing) {
    const m = n.match(/-(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

export async function nextLotNo(): Promise<string> {
  const { data } = await supabase
    .from('checking_lots')
    .select('lot_no')
    .order('created_at', { ascending: false })
    .limit(200)
  return nextDocNo('LOT-', (data ?? []).map((r) => r.lot_no))
}

export { nextCustomerOrderNo as nextOrderNo } from './orderBookShared'

export async function nextInvoiceNo(): Promise<string> {
  const { data } = await supabase
    .from('gst_invoices')
    .select('invoice_no')
    .order('created_at', { ascending: false })
    .limit(200)
  return nextDocNo('INV-', (data ?? []).map((r) => r.invoice_no))
}

export async function loadMachinePrograms(): Promise<MachineProgramRow[]> {
  const { data: progs } = await supabase
    .from('programs')
    .select(
      'id, program_no, machine_no, design_no, colour, party_name, marka, total_pick, total_meter, required_meter, status, order_item_id',
    )
    .neq('status', 'Cancelled')
    .neq('status', 'completed')
    .order('machine_no')
    .limit(300)

  const ids = (progs ?? []).map((p) => p.id)
  const producedMap = new Map<string, number>()
  if (ids.length) {
    const { data: entries } = await supabase
      .from('production_entries')
      .select('program_id, total_meter')
      .in('program_id', ids)
    for (const e of entries ?? []) {
      if (!e.program_id) continue
      producedMap.set(e.program_id, (producedMap.get(e.program_id) || 0) + Number(e.total_meter || 0))
    }
  }

  // Fill design/party from order items when denormalized cols empty
  const itemIds = [...new Set((progs ?? []).map((p) => p.order_item_id).filter(Boolean))] as string[]
  const itemMeta = new Map<string, { design_no: string; colour: string; party: string }>()
  if (itemIds.length) {
    const { data: items } = await supabase
      .from('order_book_items')
      .select('id, design_no, colour, order_book(party_name)')
      .in('id', itemIds)
    for (const it of items ?? []) {
      itemMeta.set(it.id, {
        design_no: it.design_no || '—',
        colour: it.colour || '—',
        party: (it as { order_book?: { party_name?: string } }).order_book?.party_name || '—',
      })
    }
  }

  const pettyMap = new Map<string, number>()
  if (ids.length) {
    const { data: petty } = await supabase
      .from('program_petty')
      .select('program_id, meter')
      .in('program_id', ids)
    for (const p of petty ?? []) {
      pettyMap.set(p.program_id, (pettyMap.get(p.program_id) || 0) + Number(p.meter || 0))
    }
  }

  return (progs ?? []).map((p) => {
    const meta = p.order_item_id ? itemMeta.get(p.order_item_id) : null
    const total =
      Number(p.total_meter || p.required_meter || 0) || pettyMap.get(p.id) || 0
    const produced = producedMap.get(p.id) || 0
    return {
      id: p.id,
      program_no: p.program_no,
      machine_no: p.machine_no,
      design_no: p.design_no || meta?.design_no || null,
      colour: p.colour || meta?.colour || null,
      party_name: p.party_name || meta?.party || null,
      marka: p.marka,
      total_pick: Number(p.total_pick || 0),
      total_meter: total,
      produced,
      balance: Math.max(0, total - produced),
      status: p.status,
    }
  })
}

export function fmtMeter(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 1 })
}
