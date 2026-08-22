/**
 * Warp Beam Stock — machine entry, item master, gate pass, production consumption.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_MULTIPLIER,
  calcTotalMeter,
  insertTxn,
  meterFields,
  todayISO,
  type WarpPipe,
} from './warpYarn'

/** Machines for warp beam stock (includes Others) */
export const WARP_MACHINES = [
  { id: 'M1', label: 'Machine 1', code: 'M-01' },
  { id: 'M2', label: 'Machine 2', code: 'M-02' },
  { id: 'M3', label: 'Machine 3', code: 'M-03' },
  { id: 'M4', label: 'Machine 4', code: 'M-04' },
  { id: 'M5', label: 'Machine 5', code: 'M-05' },
  { id: 'M6', label: 'Machine 6', code: 'M-06' },
  { id: 'OTR', label: 'Others', code: 'OTR' },
] as const

export type WarpMachineId = (typeof WARP_MACHINES)[number]['id']

export type WarpYarnItem = {
  id: string
  item_name: string
  name_key: string
  yarn_type: string
  created_by: string | null
  created_at: string
}

export type WarpMachineEntry = {
  id: string
  entry_date: string
  pipe_no: string
  item_name: string
  yarn_type: string
  notes: string | null
  total_single_meter: number
  total_double_meter: number
  status: string
  created_by: string | null
  created_at: string
  lines?: WarpMachineEntryLine[]
}

export type WarpMachineEntryLine = {
  id: string
  entry_id: string
  machine_no: string
  single_meter: number
  double_meter: number
  pipe_id: string | null
  beam_loading_id: string | null
  status: string
  created_at: string
}

export type WarpGatePass = {
  id: string
  gate_pass_no: string
  pass_date: string
  party_name: string
  pipe_no: string
  item_yarn: string | null
  single_meter: number
  double_meter: number
  purpose: string
  issued_by: string | null
  vehicle_no: string | null
  driver_name: string | null
  expected_return_date: string | null
  remarks: string | null
  status: string
  warper_job_id: string | null
  created_at: string
}

export type MachineMeterInput = {
  machine_no: WarpMachineId
  single_meter: number
}

export type SaveMachineEntryInput = {
  entry_date: string
  pipe_no: string
  item_name: string
  yarn_type: string
  notes: string
  machines: MachineMeterInput[]
  created_by: string
}

export type TodaySummary = {
  entry_count: number
  total_single_meter: number
  total_double_meter: number
}

export function itemNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function machineLabel(id: string): string {
  const m = WARP_MACHINES.find((x) => x.id === id)
  return m ? `${m.label} (${m.code})` : id
}

export function machineShort(id: string): string {
  const m = WARP_MACHINES.find((x) => x.id === id)
  return m?.code || id
}

export async function loadWarpItems(client: SupabaseClient): Promise<WarpYarnItem[]> {
  const { data, error } = await client.from('warp_yarn_items').select('*').order('item_name')
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as WarpYarnItem[]) ?? []
}

export async function ensureWarpItem(
  client: SupabaseClient,
  itemName: string,
  yarnType: string,
  createdBy: string,
): Promise<WarpYarnItem> {
  const trimmed = itemName.trim()
  if (!trimmed) throw new Error('Item name required')
  const key = itemNameKey(trimmed)
  const { data: existing } = await client
    .from('warp_yarn_items')
    .select('*')
    .eq('name_key', key)
    .maybeSingle()
  if (existing) return existing as WarpYarnItem

  const { data, error } = await client
    .from('warp_yarn_items')
    .insert({
      item_name: trimmed,
      name_key: key,
      yarn_type: yarnType || 'Wet Yarn',
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as WarpYarnItem
}

export async function loadMachineEntries(
  client: SupabaseClient,
  limit = 50,
): Promise<WarpMachineEntry[]> {
  const { data, error } = await client
    .from('warp_machine_entries')
    .select('*, warp_machine_entry_lines(*)')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return ((data as WarpMachineEntry[]) ?? []).map((e) => {
    const raw = e as WarpMachineEntry & { warp_machine_entry_lines?: WarpMachineEntryLine[] }
    return {
      ...e,
      lines: (e.lines ?? raw.warp_machine_entry_lines ?? []) as WarpMachineEntryLine[],
    }
  })
}

export async function loadTodaySummary(client: SupabaseClient): Promise<TodaySummary> {
  const today = todayISO()
  const { data, error } = await client
    .from('warp_machine_entries')
    .select('total_single_meter, total_double_meter')
    .eq('entry_date', today)
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) {
      return { entry_count: 0, total_single_meter: 0, total_double_meter: 0 }
    }
    throw error
  }
  const rows = data ?? []
  return {
    entry_count: rows.length,
    total_single_meter: rows.reduce((s, r) => s + Number(r.total_single_meter || 0), 0),
    total_double_meter: rows.reduce((s, r) => s + Number(r.total_double_meter || 0), 0),
  }
}

export async function loadGatePasses(client: SupabaseClient, limit = 100): Promise<WarpGatePass[]> {
  const { data, error } = await client
    .from('warp_gate_passes')
    .select('*')
    .order('pass_date', { ascending: false })
    .limit(limit)
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as WarpGatePass[]) ?? []
}

export async function nextGatePassNo(client: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `GP-${year}-`
  const { data } = await client
    .from('warp_gate_passes')
    .select('gate_pass_no')
    .like('gate_pass_no', `${prefix}%`)
    .order('gate_pass_no', { ascending: false })
    .limit(50)
  let max = 0
  for (const row of data ?? []) {
    const m = String(row.gate_pass_no || '').match(/GP-\d{4}-(\d+)$/i)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function createWarperGatePass(
  client: SupabaseClient,
  input: {
    party_name: string
    pipe_no: string
    item_yarn: string | null
    single_meter: number
    double_meter: number
    pass_date: string
    expected_return_date?: string | null
    vehicle_no?: string | null
    driver_name?: string | null
    remarks?: string | null
    issued_by: string
    warper_job_id?: string | null
    ref_id?: string | null
  },
): Promise<WarpGatePass> {
  const gate_pass_no = await nextGatePassNo(client)
  const { data, error } = await client
    .from('warp_gate_passes')
    .insert({
      gate_pass_no,
      pass_date: input.pass_date || todayISO(),
      party_name: input.party_name,
      pipe_no: input.pipe_no,
      item_yarn: input.item_yarn,
      single_meter: input.single_meter,
      double_meter: input.double_meter,
      purpose: 'Warper / Job Work',
      issued_by: input.issued_by,
      vehicle_no: input.vehicle_no || null,
      driver_name: input.driver_name || null,
      expected_return_date: input.expected_return_date || null,
      remarks: input.remarks || null,
      status: 'Issued',
      warper_job_id: input.warper_job_id || null,
      ref_type: 'warper',
      ref_id: input.ref_id || null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as WarpGatePass
}

/**
 * Save machine stock entry — installs beams on machines with double-width calculation.
 */
export async function saveMachineStockEntry(
  client: SupabaseClient,
  input: SaveMachineEntryInput,
): Promise<WarpMachineEntry> {
  const pipeNo = input.pipe_no.trim().toUpperCase()
  const itemName = input.item_name.trim()
  if (!pipeNo) throw new Error('Pipe No. is required')
  if (!itemName) throw new Error('Item / Material is required')
  if (!input.entry_date) throw new Error('Entry Date is required')

  const activeMachines = input.machines.filter((m) => Number(m.single_meter) > 0)
  if (!activeMachines.length) throw new Error('Enter meter on at least one machine')

  // One pipe can only be on one machine per entry
  if (activeMachines.length > 1) {
    throw new Error('Enter meter on one machine at a time for a given pipe')
  }

  // Validate no duplicate machine assignment
  for (const m of activeMachines) {
    const { data: existing } = await client
      .from('warp_pipes')
      .select('id, pipe_no, machine_no')
      .eq('status', 'ON_MACHINE')
      .eq('machine_no', m.machine_no)
      .maybeSingle()
    if (existing && existing.pipe_no !== pipeNo) {
      throw new Error(`${machineLabel(m.machine_no)} already has pipe ${existing.pipe_no}`)
    }
  }

  await ensureWarpItem(client, itemName, input.yarn_type, input.created_by)

  const totalSingle = activeMachines.reduce((s, m) => s + Number(m.single_meter), 0)
  const totalDouble = calcTotalMeter(totalSingle, DEFAULT_MULTIPLIER)

  // Create entry header
  const { data: entry, error: eErr } = await client
    .from('warp_machine_entries')
    .insert({
      entry_date: input.entry_date,
      pipe_no: pipeNo,
      item_name: itemName,
      yarn_type: input.yarn_type || 'Wet Yarn',
      notes: input.notes.trim() || null,
      total_single_meter: totalSingle,
      total_double_meter: totalDouble,
      status: 'ACTIVE',
      created_by: input.created_by,
    })
    .select('*')
    .single()
  if (eErr) throw eErr

  const lines: WarpMachineEntryLine[] = []

  for (const m of activeMachines) {
    const singleMeter = Number(m.single_meter)
    const doubleMeter = calcTotalMeter(singleMeter, DEFAULT_MULTIPLIER)
    const fields = meterFields(singleMeter, DEFAULT_MULTIPLIER, 0)

    // Find or create pipe
    let pipe: WarpPipe | null = null
    const { data: existingPipe } = await client
      .from('warp_pipes')
      .select('*')
      .eq('pipe_no', pipeNo)
      .maybeSingle()

    if (existingPipe) {
      pipe = existingPipe as WarpPipe
      if (pipe.status === 'ON_MACHINE' && pipe.machine_no !== m.machine_no) {
        throw new Error(`Pipe ${pipeNo} is already on ${machineLabel(pipe.machine_no || '')}`)
      }
      if (!['EMPTY', 'FILLED_GODOWN', 'ON_MACHINE', 'ISSUED'].includes(pipe.status)) {
        throw new Error(`Pipe ${pipeNo} is ${pipe.status} — cannot install on machine`)
      }
    } else {
      const { data: newPipe, error: pErr } = await client
        .from('warp_pipes')
        .insert({
          pipe_no: pipeNo,
          serial_no: pipeNo,
          location: `Machine ${m.machine_no}`,
          status: 'ON_MACHINE',
          yarn_quality: itemName,
          yarn_type: input.yarn_type || 'Wet Yarn',
          machine_no: m.machine_no,
          ...fields,
        })
        .select('*')
        .single()
      if (pErr) throw pErr
      pipe = newPipe as WarpPipe
    }

    // Stop existing beam_loading on this machine if any
    const { data: oldLoading } = await client
      .from('beam_loading')
      .select('id')
      .eq('machine_no', m.machine_no)
      .eq('status', 'RUNNING')
      .maybeSingle()
    if (oldLoading?.id && pipe.beam_loading_id !== oldLoading.id) {
      await client.from('beam_loading').update({ status: 'STOP' }).eq('id', oldLoading.id)
    }

    // Create beam_loading for production consumption
    const loadingPayload = {
      machine_no: m.machine_no,
      item_name: itemName,
      quality: itemName,
      pipe_no: pipeNo,
      beam_count: DEFAULT_MULTIPLIER,
      meter_per_beam: singleMeter,
      remaining_meter: doubleMeter,
      loaded_date: input.entry_date,
      status: 'RUNNING',
    }
    const { data: loading, error: lErr } = await client
      .from('beam_loading')
      .insert(loadingPayload)
      .select('id')
      .single()
    if (lErr) throw lErr

    // Update pipe
    const { error: uErr } = await client
      .from('warp_pipes')
      .update({
        status: 'ON_MACHINE',
        location: `Machine ${m.machine_no}`,
        machine_no: m.machine_no,
        yarn_quality: itemName,
        yarn_type: input.yarn_type || 'Wet Yarn',
        ...fields,
        beam_loading_id: loading.id,
        updated_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
      })
      .eq('id', pipe.id)
    if (uErr) throw uErr

    // Entry line
    const { data: line, error: lnErr } = await client
      .from('warp_machine_entry_lines')
      .insert({
        entry_id: entry.id,
        machine_no: m.machine_no,
        single_meter: singleMeter,
        double_meter: doubleMeter,
        pipe_id: pipe.id,
        beam_loading_id: loading.id,
        status: 'ON_MACHINE',
      })
      .select('*')
      .single()
    if (lnErr) throw lnErr
    lines.push(line as WarpMachineEntryLine)

    // Ledger transaction
    await insertTxn(client, {
      txn_date: input.entry_date,
      pipe_id: pipe.id,
      pipe_no: pipeNo,
      txn_type: 'Issue to Machine',
      from_location: existingPipe ? (existingPipe as WarpPipe).location : 'Direct Entry',
      to_location: `Machine ${m.machine_no}`,
      quality: itemName,
      kg: 0,
      meter: singleMeter,
      multiplier: DEFAULT_MULTIPLIER,
      total_meter: doubleMeter,
      balance_meter: doubleMeter,
      machine_no: m.machine_no,
      warper_name: null,
      user_name: input.created_by,
      reference: entry.id,
      status: 'ON_MACHINE',
      remarks: input.notes.trim() || null,
    })
  }

  return { ...(entry as WarpMachineEntry), lines }
}

/**
 * Deduct warp beam meter from production entry.
 * Writes daily_beam_production → trigger updates beam_loading.remaining_meter.
 */
export async function deductWarpBeamConsumption(
  client: SupabaseClient,
  machineNo: string,
  productionDate: string,
  productionMeter: number,
): Promise<boolean> {
  if (productionMeter <= 0) return false

  const { data: loading, error: lErr } = await client
    .from('beam_loading')
    .select('id, remaining_meter')
    .eq('machine_no', machineNo)
    .eq('status', 'RUNNING')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lErr) throw lErr
  if (!loading?.id) return false

  const { data: existing, error: eErr } = await client
    .from('daily_beam_production')
    .select('id, production_meter')
    .eq('beam_loading_id', loading.id)
    .eq('production_date', productionDate)
    .maybeSingle()
  if (eErr) throw eErr

  if (existing?.id) {
    const newMeter = Number(existing.production_meter || 0) + productionMeter
    const { error: uErr } = await client
      .from('daily_beam_production')
      .update({ production_meter: newMeter })
      .eq('id', existing.id)
    if (uErr) throw uErr
  } else {
    const { error: iErr } = await client.from('daily_beam_production').insert({
      beam_loading_id: loading.id,
      production_date: productionDate,
      production_meter: productionMeter,
    })
    if (iErr) throw iErr
  }

  // Record consumption in warp ledger
  const { data: pipe } = await client
    .from('warp_pipes')
    .select('id, pipe_no, yarn_quality, balance_meter')
    .eq('beam_loading_id', loading.id)
    .maybeSingle()

  if (pipe) {
    await insertTxn(client, {
      txn_date: productionDate,
      pipe_id: pipe.id,
      pipe_no: pipe.pipe_no,
      txn_type: 'Machine Consumption',
      from_location: `Machine ${machineNo}`,
      to_location: 'Production',
      quality: pipe.yarn_quality,
      kg: 0,
      meter: productionMeter,
      multiplier: DEFAULT_MULTIPLIER,
      total_meter: productionMeter,
      balance_meter: Math.max(0, Number(pipe.balance_meter || 0) - productionMeter),
      machine_no: machineNo,
      warper_name: null,
      user_name: 'System',
      reference: `production:${productionDate}`,
      status: 'CONSUMED',
      remarks: `Production consumption ${productionMeter} m`,
    })
  }

  return true
}

export function gatePassPrintHtml(gp: WarpGatePass): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gate Pass ${gp.gate_pass_no}</title>
<style>
body{font-family:system-ui,sans-serif;padding:2rem;max-width:800px;margin:0 auto}
h1{text-align:center;color:#1a5276;margin-bottom:0}
.sub{text-align:center;color:#666;margin-top:0}
table{width:100%;border-collapse:collapse;margin:1.5rem 0}
td,th{padding:0.5rem 0.75rem;border:1px solid #ddd;text-align:left}
th{background:#f0f4f8;width:35%}
.footer{margin-top:2rem;font-size:0.85rem;color:#666}
</style></head><body>
<h1>JAISAL FASHIONWEAV INDUSTRIES</h1>
<p class="sub">Gate Pass</p>
<table>
<tr><th>Gate Pass No.</th><td><strong>${gp.gate_pass_no}</strong></td></tr>
<tr><th>Date</th><td>${gp.pass_date}</td></tr>
<tr><th>Party Name</th><td>${gp.party_name}</td></tr>
<tr><th>Pipe No.</th><td>${gp.pipe_no}</td></tr>
<tr><th>Item / Yarn</th><td>${gp.item_yarn || '—'}</td></tr>
<tr><th>Meter (Single)</th><td>${gp.single_meter}</td></tr>
<tr><th>Double Width Meter</th><td>${gp.double_meter}</td></tr>
<tr><th>Purpose</th><td>${gp.purpose}</td></tr>
<tr><th>Issued By</th><td>${gp.issued_by || '—'}</td></tr>
<tr><th>Vehicle No.</th><td>${gp.vehicle_no || '—'}</td></tr>
<tr><th>Driver Name</th><td>${gp.driver_name || '—'}</td></tr>
<tr><th>Expected Return</th><td>${gp.expected_return_date || '—'}</td></tr>
<tr><th>Status</th><td>${gp.status}</td></tr>
<tr><th>Remarks</th><td>${gp.remarks || '—'}</td></tr>
</table>
<p class="footer">Generated ${new Date().toLocaleString('en-IN')}</p>
</body></html>`
}

export function printGatePass(gp: WarpGatePass) {
  const w = window.open('', '_blank', 'width=800,height=900')
  if (!w) return
  w.document.write(gatePassPrintHtml(gp))
  w.document.close()
  w.focus()
  w.print()
}
