/**
 * Order to Program (Machine-wise) — Sales & Production data layer.
 * Design Module (dins / design_costing / rate_master) remains the master source.
 * Max feeders = 6. Recipe overrides save to program_recipe_feeders only.
 */

import { MACHINES } from './database.types'
import {
  fetchDinByNumber,
  fetchDins,
  matchingColourLabel,
  type DinMatching,
  type DinWithMatchings,
} from './designToOrder'
import { finalSaleRate, fmtInr, round2, weftWeightKg } from './designWiseCosting'
import {
  buildMatchingGroups,
  loadCostingWeftsForDin,
  rolesForMatching,
  type CostingWeftParams,
} from './machineWiseProduction'
import { nextDocNo, todayISO } from './mutate'
import { loadTrackingTotals } from './programDispatch'
import { supabase } from './supabase'

export { MACHINES }
export const MAX_FEEDERS = 6
export const DEFAULT_ADD_WEIGHT_PCT = 2

export const ITEM_NAME_OPTIONS = ['Curtain Fabric', 'Fabric', 'Others'] as const

export const OTP_STEPS = [
  { id: 'order-entry', label: 'Order Entry' },
  { id: 'order-status', label: 'Order Status' },
  { id: 'program', label: 'Program to Machine' },
  { id: 'reports', label: 'Reports & Status' },
] as const

export type OtpStepId = (typeof OTP_STEPS)[number]['id']

export const ORDER_STATUS_FLOW = [
  'ORDER RECEIVED',
  'ORDER CONFIRMED',
  'PROGRAM PENDING',
  'PROGRAM CREATED',
  'IN PRODUCTION',
  'PRODUCTION COMPLETE',
  'CHECKING',
  'READY FOR DISPATCH',
  'DISPATCHED',
] as const

export type DesignForOrder = {
  dinId: string
  dinNumber: string
  designName: string
  previewUrl: string | null
  qualityName: string
  widthLabel: string
  salesRate: number
  costingId: string | null
  partyName: string | null
  commonWarp: string | null
  matchings: DinMatching[]
  wefts: CostingWeftParams[]
  designLengthMtr: number
}

export type MatchingOrderLine = {
  key: string
  matchingNo: number
  matchingId: string | null
  matchingName: string
  mainColour: string
  otherInfo: string
  orderedMeter: number
  rate: number
  amount: number
}

export type FeederRow = {
  feederNo: number
  yarnWeft: string
  colour: string
  denierTex: string
  quality: string
  pickEnds: number
  weightKg: number
  costingWeftId: string | null
}

export type MachineWarpInfo = {
  machineNo: string
  label: string
  status: 'Active' | 'Maintenance' | 'Idle'
  warpName: string
  yarnCount: string
  quality: string
  colour: string
  pipeNo: string | null
  isManual: boolean
}

export type OrderStatusRow = {
  orderId: string
  orderNo: string
  orderDate: string
  party: string
  din: string
  previewUrl: string | null
  quality: string
  totalMeter: number
  matchingCount: number
  programStatus: string
  productionStatus: string
  checkingStatus: string
  dispatchStatus: string
  overallStatus: string
  salesRate: number
  netAmount: number
}

export type RecipeTotals = {
  totalPick: number
  totalWeftWeight: number
  addWeightPct: number
  finalWeight: number
}

export function fmtInrIn(n: number | null | undefined): string {
  return fmtInr(Number(n) || 0)
}

export function emptyFeeder(no: number): FeederRow {
  return {
    feederNo: no,
    yarnWeft: '',
    colour: '',
    denierTex: '',
    quality: '',
    pickEnds: 0,
    weightKg: 0,
    costingWeftId: null,
  }
}

export function calcRecipeTotals(feeders: FeederRow[], addPct = DEFAULT_ADD_WEIGHT_PCT): RecipeTotals {
  const totalPick = round2(feeders.reduce((s, f) => s + (Number(f.pickEnds) || 0), 0))
  const totalWeftWeight = round2(feeders.reduce((s, f) => s + (Number(f.weightKg) || 0), 0))
  const pct = Number(addPct) || 0
  const finalWeight = round2(totalWeftWeight * (1 + pct / 100))
  return { totalPick, totalWeftWeight, addWeightPct: pct, finalWeight }
}

export async function loadDesignForOrder(dinNumber: string): Promise<DesignForOrder | null> {
  const trimmed = dinNumber.trim()
  if (!trimmed) return null

  const [din, costingBundle, costingHeader] = await Promise.all([
    fetchDinByNumber(trimmed),
    loadCostingWeftsForDin(trimmed),
    supabase
      .from('design_costing')
      .select(
        'id, din_number, quality_name, diary_image_url, ceo_final_selling_rate, final_cost_per_mtr, design_length_mtr, status, created_at',
      )
      .eq('din_number', trimmed)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (costingHeader.error) throw costingHeader.error

  const header =
    (costingHeader.data ?? []).find((h) => h.status === 'final') || (costingHeader.data ?? [])[0] || null

  if (!din && !header) return null

  let widthLabel = '—'
  if (costingBundle.wefts.length) {
    const widths = costingBundle.wefts.map((w) => Number(w.width) || 0).filter((w) => w > 0)
    if (widths.length) widthLabel = `${Math.max(...widths)} INCH`
  }

  const salesRate = finalSaleRate(
    header?.ceo_final_selling_rate ?? null,
    header?.final_cost_per_mtr ?? din?.final_cost_per_mtr ?? null,
  )

  const matchings = (din?.din_matchings || []).slice().sort((a, b) => a.matching_no - b.matching_no)

  return {
    dinId: din?.id || '',
    dinNumber: din?.din_number || header?.din_number || trimmed,
    designName: din?.design_name || header?.quality_name || trimmed,
    previewUrl: header?.diary_image_url || din?.din_image_url || null,
    qualityName: header?.quality_name || din?.common_warp || '—',
    widthLabel,
    salesRate: salesRate ?? 0,
    costingId: header?.id || costingBundle.costingId,
    partyName: din?.party_name || null,
    commonWarp: din?.common_warp || null,
    matchings,
    wefts: costingBundle.wefts,
    designLengthMtr: costingBundle.designLengthMtr || Number(header?.design_length_mtr) || 100,
  }
}

export async function listDinOptions(limit = 200): Promise<DinWithMatchings[]> {
  return fetchDins(limit)
}

export async function listParties(): Promise<string[]> {
  const { data, error } = await supabase.from('party_master').select('party_name').order('party_name').limit(400)
  if (error) throw error
  return (data ?? []).map((p) => String(p.party_name)).filter(Boolean)
}

export async function listOperators(): Promise<string[]> {
  const { data, error } = await supabase
    .from('workers')
    .select('full_name')
    .eq('is_active', true)
    .order('full_name')
    .limit(200)
  if (error) {
    console.warn('[orderToProgram] operators', error.message)
    return []
  }
  return (data ?? []).map((w) => String(w.full_name)).filter(Boolean)
}

export async function loadMachineWarpBoard(): Promise<MachineWarpInfo[]> {
  const { data, error } = await supabase
    .from('warp_pipes')
    .select('pipe_no, yarn_quality, yarn_specification, machine_no, status, meter, balance_meter')
    .eq('status', 'ON_MACHINE')
    .order('pipe_no')
  if (error) console.warn('[orderToProgram] warp board', error.message)

  const byMachine = new Map<string, NonNullable<typeof data>[number]>()
  for (const p of data ?? []) {
    const m = normalizeMachine(p.machine_no)
    if (!m) continue
    if (!byMachine.has(m)) byMachine.set(m, p)
  }

  const maintSet = new Set<string>()
  try {
    const { data: bd } = await supabase
      .from('machine_breakdowns')
      .select('machine_no, status')
      .in('status', ['OPEN', 'CALL', 'ARRIVED', 'Open', 'Pending'])
      .limit(50)
    for (const b of bd ?? []) {
      const m = normalizeMachine(b.machine_no)
      if (m) maintSet.add(m)
    }
  } catch {
    /* optional */
  }

  return MACHINES.map((code, idx) => {
    const pipe = byMachine.get(code)
    const inMaint = maintSet.has(code)
    const warpName = pipe?.yarn_quality || ''
    return {
      machineNo: code,
      label: `Machine ${idx + 1}`,
      status: inMaint ? 'Maintenance' : pipe ? 'Active' : 'Idle',
      warpName: warpName || '—',
      yarnCount: extractCount(pipe?.yarn_specification || pipe?.yarn_quality || ''),
      quality: pipe?.yarn_specification || pipe?.yarn_quality || '—',
      colour: extractColour(pipe?.yarn_specification || ''),
      pipeNo: pipe?.pipe_no || null,
      isManual: !warpName,
    }
  })
}

function normalizeMachine(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return null
  const m = s.match(/^M(?:ACHINE)?\s*[-_]?\s*(\d)$/i) || s.match(/^(\d)$/)
  if (m) return `M${m[1]}`
  if ((MACHINES as readonly string[]).includes(s)) return s
  return null
}

function extractCount(spec: string): string {
  const m = spec.match(/(\d{2,3})\s*(s|ne|count|d|#)?/i)
  return m ? m[1] : '—'
}

function extractColour(spec: string): string {
  const m = spec.match(/\b(white|off\s*white|ivory|beige|cream|black|grey|gray)\b/i)
  return m ? m[1].toUpperCase() : '—'
}

export function buildRecipeFeeders(
  matching: DinMatching | null,
  wefts: CostingWeftParams[],
  meterToWeave: number,
  designLengthMtr: number,
): FeederRow[] {
  if (!matching) {
    return wefts.slice(0, MAX_FEEDERS).map((w, i) => {
      const kg =
        meterToWeave > 0
          ? round2(weftWeightKg(w.denier, w.pic, w.width, meterToWeave))
          : Number(w.weight_kg) || 0
      return {
        feederNo: i + 1,
        yarnWeft: w.weft_name || `Weft ${i + 1}`,
        colour: w.weft_name || '',
        denierTex: w.denier ? String(w.denier) : '',
        quality: '',
        pickEnds: Number(w.pic) || 0,
        weightKg: kg,
        costingWeftId: w.id,
      }
    })
  }

  const groups = buildMatchingGroups(
    [matching],
    wefts,
    meterToWeave || designLengthMtr || 100,
    new Map(),
    matching.matching_no,
  )
  const lines = groups[0]?.lines || []
  const roles = rolesForMatching(matching)

  const feeders: FeederRow[] = []
  const count = Math.min(MAX_FEEDERS, Math.max(lines.length, roles.length, 1))
  for (let i = 0; i < count && i < MAX_FEEDERS; i++) {
    const line = lines[i]
    const role = roles[i]
    feeders.push({
      feederNo: i + 1,
      yarnWeft: line?.role_label || role?.role_label || `Feeder ${i + 1}`,
      colour: line?.colour_name || role?.colour_name || '',
      denierTex: line?.denier != null ? String(line.denier) : '',
      quality: '',
      pickEnds: Number(line?.pic) || 0,
      weightKg: Number(line?.required_kg) || 0,
      costingWeftId: line?.costing_weft_id || null,
    })
  }
  return feeders
}

export function matchingMainColour(m: DinMatching): string {
  return (m.ground_colour || '').trim() || matchingColourLabel(m)
}

export async function nextOrderNo(): Promise<string> {
  const { data } = await supabase.from('order_book').select('order_no').not('order_no', 'is', null).limit(500)
  return nextDocNo(
    'ORD',
    (data ?? []).map((r) => String(r.order_no || '')),
  )
}

export async function nextJobCardNo(): Promise<string> {
  const { data } = await supabase.from('programs').select('job_card_no').not('job_card_no', 'is', null).limit(500)
  return nextDocNo(
    'JC',
    (data ?? []).map((r) => String(r.job_card_no || '')),
  )
}

export async function nextProgramNo(orderNo?: string): Promise<string> {
  const prefix = orderNo ? `${orderNo}-P` : 'PRG'
  const { data } = await supabase.from('programs').select('program_no').not('program_no', 'is', null).limit(500)
  return nextDocNo(
    prefix,
    (data ?? []).map((r) => String(r.program_no || '')),
  )
}

export type SaveCustomerOrderInput = {
  partyName: string
  orderDate: string
  itemName: string
  dinId: string | null
  dinNumber: string
  qualityName: string
  salesRate: number
  previewUrl: string | null
  deliveryWithinDays: number | null
  paymentTerms: string
  remarks: string
  discountPct: number
  discountAmount: number
  lines: MatchingOrderLine[]
}

export async function saveCustomerOrder(input: SaveCustomerOrderInput): Promise<{ orderId: string; orderNo: string }> {
  const orderNo = await nextOrderNo()
  const totalMeter = round2(input.lines.reduce((s, l) => s + (Number(l.orderedMeter) || 0), 0))
  const totalAmount = round2(totalMeter * (Number(input.salesRate) || 0))
  const discAmt =
    input.discountAmount > 0
      ? round2(input.discountAmount)
      : round2((totalAmount * (Number(input.discountPct) || 0)) / 100)
  const netAmount = round2(totalAmount - discAmt)

  const header = {
    order_no: orderNo,
    party_name: input.partyName.trim(),
    order_date: input.orderDate || todayISO(),
    item_name: input.itemName || null,
    din_id: input.dinId || null,
    quality_name: input.qualityName || null,
    sales_rate: input.salesRate,
    design_preview_url: input.previewUrl,
    delivery_within_days: input.deliveryWithinDays,
    payment_terms: input.paymentTerms || null,
    remarks: input.remarks || null,
    discount_pct: input.discountPct || null,
    discount_amount: discAmt,
    total_order_meter: totalMeter,
    total_amount: totalAmount,
    net_amount: netAmount,
    overall_status: 'ORDER RECEIVED',
    status: 'ORDER RECEIVED',
  }

  const { data, error } = await supabase.from('order_book').insert(header).select('id, order_no').single()
  if (error) throw error

  const items = input.lines
    .filter((l) => Number(l.orderedMeter) > 0)
    .map((l) => ({
      order_id: data.id,
      design_no: input.dinNumber,
      colour: l.mainColour.trim() || `Matching ${l.matchingNo}`,
      matching_name: l.matchingName || `M-${String(l.matchingNo).padStart(2, '0')}`,
      matching_no: l.matchingNo,
      matching_id: l.matchingId,
      other_info: l.otherInfo || null,
      qty_meter: Number(l.orderedMeter) || 0,
      rate: Number(input.salesRate) || 0,
      din_id: input.dinId,
      quality: input.qualityName || null,
      status: 'ORDER RECEIVED',
    }))

  if (!items.length) {
    await supabase.from('order_book').delete().eq('id', data.id)
    throw new Error('Add at least one matching with ordered meter')
  }

  const { error: iErr } = await supabase.from('order_book_items').insert(items)
  if (iErr) throw iErr

  if (input.dinId) {
    await supabase.from('dins').update({ status: 'Order Booked' }).eq('id', input.dinId)
  }

  return { orderId: data.id, orderNo: data.order_no || orderNo }
}

export type BookedOrderOption = {
  orderId: string
  orderNo: string
  party: string
  din: string
  dinId: string | null
  quality: string
  salesRate: number
  previewUrl: string | null
  orderDate: string
  totalMeter: number
  items: Array<{
    itemId: string
    matchingNo: number
    matchingId: string | null
    matchingName: string
    mainColour: string
    orderedMeter: number
    rate: number
  }>
}

export async function loadBookedOrders(limit = 100): Promise<BookedOrderOption[]> {
  const { data, error } = await supabase
    .from('order_book')
    .select(
      'id, order_no, party_name, order_date, din_id, quality_name, sales_rate, design_preview_url, total_order_meter, overall_status, order_book_items(id, design_no, colour, matching_no, matching_id, matching_name, qty_meter, rate, din_id)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error

  return (data ?? []).map((o: any) => {
    const items = (o.order_book_items || []).map((it: any) => ({
      itemId: it.id,
      matchingNo: Number(it.matching_no) || 0,
      matchingId: it.matching_id || null,
      matchingName:
        it.matching_name || (it.matching_no != null ? `M-${String(it.matching_no).padStart(2, '0')}` : '—'),
      mainColour: it.colour || '—',
      orderedMeter: Number(it.qty_meter) || 0,
      rate: Number(it.rate) || Number(o.sales_rate) || 0,
    }))
    return {
      orderId: o.id,
      orderNo: o.order_no || '—',
      party: o.party_name || '—',
      din: (o.order_book_items?.[0]?.design_no as string) || '—',
      dinId: o.din_id || o.order_book_items?.[0]?.din_id || null,
      quality: o.quality_name || '—',
      salesRate: Number(o.sales_rate) || Number(items[0]?.rate) || 0,
      previewUrl: o.design_preview_url || null,
      orderDate: o.order_date || '',
      totalMeter:
        Number(o.total_order_meter) ||
        items.reduce((s: number, i: { orderedMeter: number }) => s + i.orderedMeter, 0),
      items,
    }
  })
}

export type SaveProgramInput = {
  orderId: string
  orderItemId: string
  orderNo: string
  partyName: string
  dinNumber: string
  dinId: string | null
  matchingNo: number
  matchingId: string | null
  mainColour: string
  quality: string
  machineNo: string
  warpName: string
  warpManual: string
  warpIsManual: boolean
  programDate: string
  operatorName: string
  meterToWeave: number
  taka: number | null
  salesRate: number
  previewUrl: string | null
  feeders: FeederRow[]
  addWeightPct: number
  remarks: string
  recipeIsOverride: boolean
}

export async function saveProgramWithJobCard(input: SaveProgramInput): Promise<{
  programId: string
  programNo: string
  jobCardNo: string
}> {
  const programNo = await nextProgramNo(input.orderNo)
  const jobCardNo = await nextJobCardNo()
  const totals = calcRecipeTotals(input.feeders, input.addWeightPct)
  const warp = input.warpIsManual ? input.warpManual.trim() : input.warpName

  const payload = {
    order_id: input.orderId,
    order_item_id: input.orderItemId,
    machine_no: input.machineNo,
    status: 'PROGRAM CREATED',
    production_status: 'PENDING',
    program_no: programNo,
    job_card_no: jobCardNo,
    party_name: input.partyName,
    design_no: input.dinNumber,
    din_number: input.dinNumber,
    colour: input.mainColour,
    quality: input.quality,
    matching_no: input.matchingNo,
    matching_id: input.matchingId,
    total_meter: input.meterToWeave,
    required_meter: input.meterToWeave,
    total_pick: totals.totalPick,
    program_date: input.programDate || todayISO(),
    planned_date: input.programDate || todayISO(),
    operator_name: input.operatorName || null,
    warp_name: warp || null,
    warp_manual: input.warpIsManual ? input.warpManual : null,
    warp_is_manual: input.warpIsManual,
    taka: input.taka,
    total_weft_weight_kg: totals.totalWeftWeight,
    add_weight_pct: totals.addWeightPct,
    final_weight_kg: totals.finalWeight,
    recipe_is_override: input.recipeIsOverride,
    remarks: input.remarks || null,
    design_preview_url: input.previewUrl,
  }

  const { data, error } = await supabase.from('programs').insert(payload).select('id').single()
  if (error) throw error

  if (input.meterToWeave > 0) {
    await supabase.from('program_petty').insert({
      program_id: data.id,
      petty_label: 'Main',
      item_name: input.dinNumber,
      meter: input.meterToWeave,
    })
  }

  const feederRows = input.feeders.slice(0, MAX_FEEDERS).map((f) => ({
    program_id: data.id,
    feeder_no: f.feederNo,
    yarn_weft: f.yarnWeft,
    colour: f.colour,
    denier_tex: f.denierTex,
    quality: f.quality,
    pick_ends: f.pickEnds,
    weight_kg: f.weightKg,
    costing_weft_id: f.costingWeftId,
    is_override: input.recipeIsOverride,
  }))
  if (feederRows.length) {
    const { error: fErr } = await supabase.from('program_recipe_feeders').insert(feederRows)
    if (fErr) throw fErr
  }

  await supabase.from('order_book_items').update({ status: 'PROGRAM CREATED' }).eq('id', input.orderItemId)
  await supabase
    .from('order_book')
    .update({ overall_status: 'PROGRAM CREATED', status: 'PROGRAM CREATED' })
    .eq('id', input.orderId)

  try {
    await supabase.from('job_cards').insert({
      program_id: data.id,
      job_card_no: jobCardNo,
      colour: input.mainColour,
      total_meter: input.meterToWeave,
      issued_at: new Date().toISOString(),
    })
  } catch {
    /* optional */
  }

  return { programId: data.id, programNo, jobCardNo }
}

export type ProductionCompleteInput = {
  programId: string
  orderId: string | null
  productionDate: string
  producedMeter: number
  producedTaka: number | null
  actualWeftWeight: number | null
  shortageExcess: number | null
  remarks: string
}

export async function completeProduction(input: ProductionCompleteInput): Promise<void> {
  const { error } = await supabase
    .from('programs')
    .update({
      production_status: 'COMPLETED',
      status: 'PRODUCTION COMPLETE',
      production_date: input.productionDate || todayISO(),
      produced_meter: input.producedMeter,
      produced_taka: input.producedTaka,
      actual_weft_weight_kg: input.actualWeftWeight,
      shortage_excess_kg: input.shortageExcess,
      production_remarks: input.remarks || null,
    })
    .eq('id', input.programId)
  if (error) throw error

  if (input.orderId) {
    await supabase
      .from('order_book')
      .update({ overall_status: 'PRODUCTION COMPLETE', status: 'PRODUCTION COMPLETE' })
      .eq('id', input.orderId)
  }

  try {
    await supabase.from('production_entries').insert({
      program_id: input.programId,
      entry_date: input.productionDate || todayISO(),
      total_meter: input.producedMeter,
      remarks: input.remarks || null,
    })
  } catch {
    /* optional */
  }
}

export async function loadOrderStatusRows(limit = 200): Promise<OrderStatusRow[]> {
  const [{ data: orders, error }, { data: programs }, { data: lots }, { data: challans }] = await Promise.all([
    supabase
      .from('order_book')
      .select(
        'id, order_no, order_date, party_name, din_id, quality_name, sales_rate, design_preview_url, total_order_meter, net_amount, overall_status, status, order_book_items(id, design_no, matching_no)',
      )
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('programs')
      .select('id, order_id, order_item_id, status, production_status, produced_meter, dispatched_meter'),
    supabase.from('checking_lots').select('program_id, final_meter, status, challan_id'),
    supabase.from('challans').select('id, program_id, meter, status'),
  ])
  if (error) throw error

  const progsByOrder = new Map<string, NonNullable<typeof programs>>()
  for (const p of programs ?? []) {
    const oid = p.order_id
    if (!oid) continue
    const list = progsByOrder.get(oid) || []
    list.push(p)
    progsByOrder.set(oid, list)
  }

  const checkedByProg = new Map<string, number>()
  for (const l of lots ?? []) {
    if (!l.program_id) continue
    checkedByProg.set(l.program_id, (checkedByProg.get(l.program_id) || 0) + Number(l.final_meter || 0))
  }

  const dispatchedByProg = new Map<string, number>()
  for (const c of challans ?? []) {
    if (!c.program_id) continue
    dispatchedByProg.set(c.program_id, (dispatchedByProg.get(c.program_id) || 0) + Number(c.meter || 0))
  }

  return (orders ?? []).map((o: any) => {
    const items = o.order_book_items || []
    const progs = progsByOrder.get(o.id) || []
    const hasProgram = progs.length > 0
    const prodComplete = progs.some(
      (p) => String(p.production_status).toUpperCase() === 'COMPLETED' || /COMPLETE/i.test(String(p.status)),
    )
    const inProd = progs.some((p) => Number(p.produced_meter || 0) > 0) && !prodComplete
    let checked = 0
    let dispatched = 0
    for (const p of progs) {
      checked += checkedByProg.get(p.id) || 0
      dispatched += dispatchedByProg.get(p.id) || Number(p.dispatched_meter || 0)
    }

    const programStatus = hasProgram ? 'PROGRAM CREATED' : 'PROGRAM PENDING'
    let productionStatus = 'PENDING'
    if (prodComplete) productionStatus = 'COMPLETED'
    else if (inProd) productionStatus = 'IN PRODUCTION'

    const checkingStatus = checked > 0 ? 'CHECKING' : 'PENDING'
    const dispatchStatus = dispatched > 0 ? 'DISPATCHED' : checked > 0 ? 'READY FOR DISPATCH' : 'PENDING'

    let overall = String(o.overall_status || o.status || 'ORDER RECEIVED').toUpperCase()
    if (dispatched > 0) overall = 'DISPATCHED'
    else if (checked > 0) overall = 'READY FOR DISPATCH'
    else if (prodComplete) overall = 'PRODUCTION COMPLETE'
    else if (inProd) overall = 'IN PRODUCTION'
    else if (hasProgram) overall = 'PROGRAM CREATED'
    else if (!overall || overall === 'PENDING') overall = 'ORDER RECEIVED'

    return {
      orderId: o.id,
      orderNo: o.order_no || '—',
      orderDate: o.order_date || '',
      party: o.party_name || '—',
      din: items[0]?.design_no || '—',
      previewUrl: o.design_preview_url || null,
      quality: o.quality_name || '—',
      totalMeter: Number(o.total_order_meter) || 0,
      matchingCount: items.length,
      programStatus,
      productionStatus,
      checkingStatus,
      dispatchStatus,
      overallStatus: overall,
      salesRate: Number(o.sales_rate) || 0,
      netAmount: Number(o.net_amount) || 0,
    }
  })
}

export type ReportFilters = {
  dateFrom: string
  dateTo: string
  party: string
  din: string
  design: string
  orderNo: string
  machine: string
  matching: string
  status: string
}

export type ReportRow = Record<string, string | number | null>

export async function loadOtpReports(
  kind: string,
  filters: ReportFilters,
): Promise<{ columns: string[]; rows: ReportRow[] }> {
  const statusRows = await loadOrderStatusRows(300)
  let filtered = statusRows.filter((r) => {
    if (filters.dateFrom && r.orderDate && r.orderDate < filters.dateFrom) return false
    if (filters.dateTo && r.orderDate && r.orderDate > filters.dateTo) return false
    if (filters.party && !r.party.toLowerCase().includes(filters.party.toLowerCase())) return false
    if (filters.din && !r.din.toLowerCase().includes(filters.din.toLowerCase())) return false
    if (filters.orderNo && !r.orderNo.toLowerCase().includes(filters.orderNo.toLowerCase())) return false
    if (filters.status && !r.overallStatus.toLowerCase().includes(filters.status.toLowerCase())) return false
    return true
  })

  if (kind === 'pending-production') {
    filtered = filtered.filter((r) => r.productionStatus !== 'COMPLETED' && r.programStatus === 'PROGRAM CREATED')
  } else if (kind === 'completed-production') {
    filtered = filtered.filter((r) => r.productionStatus === 'COMPLETED')
  } else if (kind === 'dispatch-pending') {
    filtered = filtered.filter(
      (r) => r.dispatchStatus !== 'DISPATCHED' && /READY|CHECKING|PRODUCTION/i.test(r.overallStatus),
    )
  } else if (kind === 'dispatch-completed') {
    filtered = filtered.filter((r) => r.dispatchStatus === 'DISPATCHED')
  }

  if (kind === 'machine-wise' || kind === 'production') {
    const { data: progs } = await supabase
      .from('programs')
      .select(
        'program_no, machine_no, design_no, colour, matching_no, party_name, required_meter, produced_meter, status, production_status',
      )
      .order('created_at', { ascending: false })
      .limit(300)
    const rows = (progs ?? []).filter((p) => {
      if (filters.machine && !String(p.machine_no || '').toLowerCase().includes(filters.machine.toLowerCase()))
        return false
      if (filters.matching && String(p.matching_no || '') !== filters.matching) return false
      if (filters.din && !String(p.design_no || '').toLowerCase().includes(filters.din.toLowerCase())) return false
      if (filters.party && !String(p.party_name || '').toLowerCase().includes(filters.party.toLowerCase())) return false
      return true
    })
    return {
      columns: ['Program', 'Machine', 'DIN', 'Matching', 'Colour', 'Party', 'Meter', 'Produced', 'Status'],
      rows: rows.map((p) => ({
        Program: p.program_no,
        Machine: p.machine_no,
        DIN: p.design_no,
        Matching: p.matching_no,
        Colour: p.colour,
        Party: p.party_name,
        Meter: Number(p.required_meter) || 0,
        Produced: Number(p.produced_meter) || 0,
        Status: p.production_status || p.status,
      })),
    }
  }

  if (kind === 'matching-wise') {
    const { data: items } = await supabase
      .from('order_book_items')
      .select(
        'design_no, matching_no, matching_name, colour, qty_meter, rate, amount, order_book(order_no, party_name, order_date)',
      )
      .order('created_at', { ascending: false })
      .limit(400)
    const rows = (items ?? [])
      .filter((it: any) => {
        if (filters.din && !String(it.design_no || '').toLowerCase().includes(filters.din.toLowerCase())) return false
        if (
          filters.party &&
          !String(it.order_book?.party_name || '')
            .toLowerCase()
            .includes(filters.party.toLowerCase())
        )
          return false
        if (filters.matching && String(it.matching_no || '') !== filters.matching) return false
        return true
      })
      .map((it: any) => ({
        Order: it.order_book?.order_no || '—',
        Date: it.order_book?.order_date || '',
        Party: it.order_book?.party_name || '—',
        DIN: it.design_no,
        Matching: it.matching_name || it.matching_no,
        Colour: it.colour,
        Meter: Number(it.qty_meter) || 0,
        Rate: Number(it.rate) || 0,
        Amount: Number(it.amount) || 0,
      }))
    return {
      columns: ['Order', 'Date', 'Party', 'DIN', 'Matching', 'Colour', 'Meter', 'Rate', 'Amount'],
      rows,
    }
  }

  if (kind === 'order-dispatch-summary') {
    const totals = await loadTrackingTotals()
    return {
      columns: ['Stage', 'Meter'],
      rows: [
        { Stage: 'Order Meter', Meter: round2(totals.orderMeter) },
        { Stage: 'Program Meter', Meter: round2(totals.programmedMeter) },
        { Stage: 'Produced Meter', Meter: round2(totals.producedMeter) },
        { Stage: 'Checked Meter', Meter: round2(totals.checkedMeter) },
        { Stage: 'Dispatched Meter', Meter: round2(totals.dispatchedMeter) },
        { Stage: 'Balance Meter', Meter: round2(totals.pendingMeter) },
      ],
    }
  }

  if (kind === 'din-wise') {
    const map = new Map<string, { din: string; meter: number; orders: number; amount: number }>()
    for (const r of filtered) {
      const cur = map.get(r.din) || { din: r.din, meter: 0, orders: 0, amount: 0 }
      cur.meter += r.totalMeter
      cur.orders += 1
      cur.amount += r.netAmount
      map.set(r.din, cur)
    }
    return {
      columns: ['DIN', 'Orders', 'Total Meter', 'Net Amount'],
      rows: [...map.values()].map((x) => ({
        DIN: x.din,
        Orders: x.orders,
        'Total Meter': round2(x.meter),
        'Net Amount': round2(x.amount),
      })),
    }
  }

  if (kind === 'party-wise') {
    const map = new Map<string, { party: string; meter: number; orders: number; amount: number }>()
    for (const r of filtered) {
      const cur = map.get(r.party) || { party: r.party, meter: 0, orders: 0, amount: 0 }
      cur.meter += r.totalMeter
      cur.orders += 1
      cur.amount += r.netAmount
      map.set(r.party, cur)
    }
    return {
      columns: ['Party', 'Orders', 'Total Meter', 'Net Amount'],
      rows: [...map.values()].map((x) => ({
        Party: x.party,
        Orders: x.orders,
        'Total Meter': round2(x.meter),
        'Net Amount': round2(x.amount),
      })),
    }
  }

  return {
    columns: ['Order No.', 'Date', 'Party', 'DIN', 'Quality', 'Meter', 'Matchings', 'Status', 'Net Amount'],
    rows: filtered.map((r) => ({
      'Order No.': r.orderNo,
      Date: r.orderDate,
      Party: r.party,
      DIN: r.din,
      Quality: r.quality,
      Meter: r.totalMeter,
      Matchings: r.matchingCount,
      Status: r.overallStatus,
      'Net Amount': r.netAmount,
    })),
  }
}

export function buildWhatsAppStatusMessage(input: {
  party: string
  orderNo: string
  din: string
  design: string
  matching: string
  producedMeter: number | string
  status: string
  dispatchStatus: string
}): string {
  return [
    '*JAISAL FW – Fashionweave Industries*',
    'Order Status Update',
    '',
    `Party: ${input.party}`,
    `Order No.: ${input.orderNo}`,
    `DIN: ${input.din}`,
    `Design: ${input.design}`,
    `Matching: ${input.matching}`,
    `Produced Meter: ${input.producedMeter}`,
    `Status: ${input.status}`,
    `Dispatch: ${input.dispatchStatus}`,
  ].join('\n')
}

export function rowsToCsv(columns: string[], rows: ReportRow[]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [columns.map(esc).join(',')]
  for (const r of rows) {
    lines.push(columns.map((c) => esc(r[c])).join(','))
  }
  return lines.join('\n')
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function statusBadgeClass(status: string): string {
  const s = status.toUpperCase()
  if (/DISPATCH/.test(s)) return 'otp-badge otp-badge-dispatch'
  if (/COMPLETE|READY|APPROVED|CREATED/.test(s)) return 'otp-badge otp-badge-ok'
  if (/PRODUCTION|CHECKING|PROGRESS/.test(s)) return 'otp-badge otp-badge-prog'
  if (/PENDING|RECEIVED|CONFIRMED/.test(s)) return 'otp-badge otp-badge-pending'
  return 'otp-badge'
}
