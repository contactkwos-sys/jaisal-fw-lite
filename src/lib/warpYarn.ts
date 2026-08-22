/**
 * Warp Yarn Management — shared helpers & types.
 * Pipe-level stock is the source of truth; beam_loading remains the
 * production consumption engine (multiplier ≈ beam_count).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from './mutate'

export const WARP_PIPE_STATUSES = [
  'EMPTY',
  'FILLED_GODOWN',
  'ON_MACHINE',
  'AT_WARPER',
  'DAMAGED',
  'UNDER_REPAIR',
  'ISSUED',
] as const

export type WarpPipeStatus = (typeof WARP_PIPE_STATUSES)[number]

export const WARP_TXN_TYPES = [
  'Purchase Yarn',
  'Send to Warper',
  'Receive from Warper',
  'Issue to Machine',
  'Return from Machine',
  'Machine Consumption',
  'Move to Godown',
  'Empty Pipe',
  'Adjustment',
  'Manual Stock Entry',
] as const

export const FILLED_PIPE_ENTRY_TYPES = [
  'Purchase / Yarn Inward',
  'Receive from Warper',
  'Return from Machine',
  'Manual Stock Entry',
] as const

export type FilledPipeEntryType = (typeof FILLED_PIPE_ENTRY_TYPES)[number]

export const GODOWN_OPTIONS = ['Godown A', 'Godown B', 'Godown C', 'Godown'] as const

export const PIPE_STOCK_LABELS = [
  'Filled',
  'Available',
  'Reserved',
  'Issued',
  'Partial',
  'Consumed',
  'Returned',
] as const

export type WarpTxnType = (typeof WARP_TXN_TYPES)[number]

export const WARPER_JOB_STATUSES = ['SENT', 'IN_PROCESS', 'RECEIVED', 'DIFFERENCE'] as const
export type WarperJobStatus = (typeof WARPER_JOB_STATUSES)[number]

export const DEFAULT_MULTIPLIER = 2

export type WarpPipe = {
  id: string
  pipe_no: string
  serial_no: string | null
  location: string
  status: WarpPipeStatus | string
  yarn_quality: string | null
  yarn_specification: string | null
  meter: number
  multiplier: number
  total_meter: number
  used_meter: number
  balance_meter: number
  weight_kg: number
  machine_no: string | null
  warper_name: string | null
  last_used_at: string | null
  remarks: string | null
  beam_loading_id: string | null
  rate_per_kg?: number
  amount?: number
  rate_source?: string | null
  rate_effective_from?: string | null
  rate_master_id?: string | null
  godown_name?: string | null
  rack?: string | null
  bay?: string | null
  entry_date?: string | null
  entry_type?: string | null
  original_weight_kg?: number | null
  balance_weight_kg?: number | null
  entered_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export type WarpYarnTransaction = {
  id: string
  txn_date: string
  pipe_id: string | null
  pipe_no: string
  txn_type: string
  from_location: string | null
  to_location: string | null
  quality: string | null
  kg: number
  meter: number
  multiplier: number
  total_meter: number
  balance_meter: number | null
  machine_no: string | null
  warper_name: string | null
  user_name: string | null
  reference: string | null
  status: string | null
  remarks: string | null
  rate_per_kg?: number
  amount?: number
  rate_source?: string | null
  rate_effective_from?: string | null
  issue_meter?: number | null
  updated_by?: string | null
  created_at: string
}

export type WarpYarnPurchase = {
  id: string
  purchase_date: string
  supplier: string
  invoice_no: string | null
  yarn_quality: string
  yarn_specification: string | null
  quantity_kg: number
  rate: number
  amount: number
  gst_pct: number
  total_amount: number
  destination: string | null
  remarks: string | null
  entered_by: string | null
  created_at: string
}

export type WarpWarperJob = {
  id: string
  pipe_id: string | null
  pipe_no: string
  warper_name: string
  yarn_quality: string | null
  sent_date: string
  yarn_sent_kg: number
  expected_meter: number
  multiplier: number
  expected_total_meter: number
  challan_no: string | null
  remarks: string | null
  received_date: string | null
  received_meter: number | null
  received_kg: number | null
  meter_difference: number | null
  kg_difference: number | null
  status: WarperJobStatus | string
  entered_by: string | null
  created_at: string
  updated_at: string
}

export type WarpYarnKpis = {
  onMachines: number
  filledGodown: number
  emptyPipes: number
  atWarper: number
  totalAvailableMeter: number
  totalUsedMeter: number
  totalBalanceMeter: number
}

export type WarpYarnFilters = {
  search: string
  dateFrom: string
  dateTo: string
  quality: string
  pipeNo: string
  machine: string
  warper: string
  status: string
  godown: string
}

export type FilledPipeEntryInput = {
  entry_date: string
  entry_type: FilledPipeEntryType
  yarn_quality: string
  yarn_specification: string
  meter: number
  multiplier: number
  weight_kg: number
  rate_per_kg: number
  amount: number
  rate_source: string
  rate_effective_from: string | null
  rate_master_id: string | null
  godown_name: string
  rack: string
  bay: string
  stock_label: string
  warper_name: string
  machine_no: string
  supplier: string
  remarks: string
  manual_rate_override: boolean
}

export function emptyWarpFilters(): WarpYarnFilters {
  return {
    search: '',
    dateFrom: '',
    dateTo: '',
    quality: '',
    pipeNo: '',
    machine: '',
    warper: '',
    status: '',
    godown: '',
  }
}

export function calcTotalMeter(meter: number, multiplier: number): number {
  const m = Number(meter) || 0
  const mult = Number(multiplier) || 0
  return Math.round(m * mult * 1000) / 1000
}

export function calcBalanceMeter(totalMeter: number, usedMeter: number): number {
  return Math.max(0, Math.round((Number(totalMeter) - Number(usedMeter)) * 1000) / 1000)
}

export function formatNum(n: number | null | undefined, digits = 0): string {
  const v = Number(n || 0)
  return v.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function statusBadgeClass(status: string): string {
  const s = (status || '').toUpperCase()
  if (['EMPTY', 'AVAILABLE', 'RECEIVED', 'FILLED_GODOWN', 'RUNNING'].includes(s)) return 'wym-badge wym-badge-ok'
  if (['SENT', 'IN_PROCESS', 'AT_WARPER', 'PENDING', 'ISSUED'].includes(s)) return 'wym-badge wym-badge-pending'
  if (['DIFFERENCE', 'DAMAGED', 'UNDER_REPAIR', 'SHORTAGE'].includes(s)) return 'wym-badge wym-badge-danger'
  if (['ON_MACHINE'].includes(s)) return 'wym-badge wym-badge-info'
  return 'wym-badge'
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    EMPTY: 'Available',
    FILLED_GODOWN: 'Filled · Godown',
    ON_MACHINE: 'On Machine',
    AT_WARPER: 'At Warper',
    DAMAGED: 'Damaged',
    UNDER_REPAIR: 'Under Repair',
    ISSUED: 'Issued',
    SENT: 'Sent',
    IN_PROCESS: 'In Process',
    RECEIVED: 'Received',
    DIFFERENCE: 'Difference',
    CONSUMED: 'Consumed',
    PARTIAL: 'Partial',
    Filled: 'Filled',
    Available: 'Available',
    Reserved: 'Reserved',
    Issued: 'Issued',
    Partial: 'Partial',
    Consumed: 'Consumed',
    Returned: 'Returned',
  }
  return map[status] || status
}

export function pipeStockLabel(pipe: WarpPipe): string {
  if (pipe.remarks?.startsWith('stock:')) {
    const label = pipe.remarks.replace(/^stock:/, '').split('|')[0]
    if (label) return label
  }
  if (pipe.status === 'FILLED_GODOWN') {
    if (Number(pipe.used_meter) > 0 && Number(pipe.balance_meter) > 0) return 'Partial'
    if (Number(pipe.balance_meter) <= 0) return 'Consumed'
    return 'Filled'
  }
  if (pipe.status === 'ON_MACHINE') return 'Issued'
  if (pipe.status === 'EMPTY' && Number(pipe.balance_meter) > 0) return 'Returned'
  return statusLabel(pipe.status)
}

export function composeGodownLocation(godown: string, rack: string, bay: string): string {
  const parts = [godown, rack, bay].map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts.join(' / ') : 'Godown'
}

export function calcAmount(weightKg: number, ratePerKg: number): number {
  return Math.round(Number(weightKg || 0) * Number(ratePerKg || 0) * 100) / 100
}

export function entryTypeToTxnType(entryType: FilledPipeEntryType): WarpTxnType {
  switch (entryType) {
    case 'Purchase / Yarn Inward':
      return 'Purchase Yarn'
    case 'Receive from Warper':
      return 'Receive from Warper'
    case 'Return from Machine':
      return 'Return from Machine'
    default:
      return 'Manual Stock Entry'
  }
}

export function canIssuePipe(pipe: WarpPipe, issueMeter: number): boolean {
  if (pipe.status === 'CONSUMED' || Number(pipe.balance_meter) <= 0) return false
  if (pipe.status !== 'FILLED_GODOWN') return false
  return issueMeter > 0 && issueMeter <= Number(pipe.balance_meter)
}

export function canReturnPipe(pipe: WarpPipe): boolean {
  return pipe.status === 'ON_MACHINE' || (pipe.status === 'FILLED_GODOWN' && Number(pipe.used_meter) > 0)
}

export function lastTxnForPipe(pipe: WarpPipe, txns: WarpYarnTransaction[]): WarpYarnTransaction | null {
  const rows = txns
    .filter((t) => t.pipe_no === pipe.pipe_no || t.pipe_id === pipe.id)
    .sort((a, b) => `${b.txn_date}${b.created_at}`.localeCompare(`${a.txn_date}${a.created_at}`))
  return rows[0] ?? null
}

export function computeKpis(pipes: WarpPipe[]): WarpYarnKpis {
  const onMachines = pipes.filter((p) => p.status === 'ON_MACHINE').length
  const filledGodown = pipes.filter((p) => p.status === 'FILLED_GODOWN').length
  const emptyPipes = pipes.filter((p) =>
    ['EMPTY', 'DAMAGED', 'UNDER_REPAIR', 'ISSUED'].includes(p.status),
  ).length
  const atWarper = pipes.filter((p) => p.status === 'AT_WARPER').length
  const active = pipes.filter((p) =>
    ['ON_MACHINE', 'FILLED_GODOWN', 'AT_WARPER'].includes(p.status),
  )
  return {
    onMachines,
    filledGodown,
    emptyPipes,
    atWarper,
    totalAvailableMeter: active.reduce((s, p) => s + Number(p.total_meter || 0), 0),
    totalUsedMeter: active.reduce((s, p) => s + Number(p.used_meter || 0), 0),
    totalBalanceMeter: active.reduce((s, p) => s + Number(p.balance_meter || 0), 0),
  }
}

export function filterPipes(pipes: WarpPipe[], f: WarpYarnFilters): WarpPipe[] {
  const q = f.search.trim().toLowerCase()
  return pipes.filter((p) => {
    if (f.status && p.status !== f.status && pipeStockLabel(p) !== f.status) return false
    if (f.godown && !(p.godown_name || p.location || '').toLowerCase().includes(f.godown.toLowerCase())) {
      return false
    }
    if (f.quality && !(p.yarn_quality || '').toLowerCase().includes(f.quality.toLowerCase())) return false
    if (f.pipeNo && !(p.pipe_no || '').toLowerCase().includes(f.pipeNo.toLowerCase())) return false
    if (f.machine && (p.machine_no || '') !== f.machine) return false
    if (f.warper && !(p.warper_name || '').toLowerCase().includes(f.warper.toLowerCase())) return false
    if (!q) return true
    const hay = [
      p.pipe_no,
      p.serial_no,
      p.yarn_quality,
      p.location,
      p.machine_no,
      p.warper_name,
      p.status,
      p.remarks,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function filterTxns(rows: WarpYarnTransaction[], f: WarpYarnFilters): WarpYarnTransaction[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.dateFrom && r.txn_date < f.dateFrom) return false
    if (f.dateTo && r.txn_date > f.dateTo) return false
    if (f.status && (r.status || '') !== f.status) return false
    if (f.quality && !(r.quality || '').toLowerCase().includes(f.quality.toLowerCase())) return false
    if (f.pipeNo && !(r.pipe_no || '').toLowerCase().includes(f.pipeNo.toLowerCase())) return false
    if (f.machine && (r.machine_no || '') !== f.machine) return false
    if (f.warper && !(r.warper_name || '').toLowerCase().includes(f.warper.toLowerCase())) return false
    if (!q) return true
    const hay = [
      r.pipe_no,
      r.txn_type,
      r.from_location,
      r.to_location,
      r.quality,
      r.user_name,
      r.reference,
      r.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function filterWarperJobs(rows: WarpWarperJob[], f: WarpYarnFilters): WarpWarperJob[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.dateFrom && r.sent_date < f.dateFrom) return false
    if (f.dateTo && r.sent_date > f.dateTo) return false
    if (f.status && r.status !== f.status) return false
    if (f.quality && !(r.yarn_quality || '').toLowerCase().includes(f.quality.toLowerCase())) return false
    if (f.pipeNo && !(r.pipe_no || '').toLowerCase().includes(f.pipeNo.toLowerCase())) return false
    if (f.warper && !(r.warper_name || '').toLowerCase().includes(f.warper.toLowerCase())) return false
    if (!q) return true
    const hay = [r.pipe_no, r.warper_name, r.yarn_quality, r.challan_no, r.status, r.remarks]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export async function nextPipeNo(client: SupabaseClient): Promise<string> {
  const { data } = await client.from('warp_pipes').select('pipe_no').order('pipe_no', { ascending: false }).limit(500)
  let max = 0
  for (const row of data || []) {
    const m = String((row as { pipe_no: string }).pipe_no || '').match(/^BP-(\d+)$/i)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `BP-${String(max + 1).padStart(5, '0')}`
}

export async function saveFilledPipeEntry(
  client: SupabaseClient,
  input: FilledPipeEntryInput,
  userName: string,
): Promise<WarpPipe> {
  if (!input.yarn_quality.trim()) throw new Error('Yarn quality required')
  if (!(Number(input.meter) > 0)) throw new Error('Meter must be greater than 0')
  if (!(Number(input.multiplier) > 0)) throw new Error('Multiplier must be greater than 0')
  if (Number(input.weight_kg) < 0) throw new Error('Weight cannot be negative')
  if (Number(input.rate_per_kg) < 0) throw new Error('Rate cannot be negative')
  if (input.entry_type === 'Receive from Warper' && !input.warper_name.trim()) {
    throw new Error('Warper name required for Receive from Warper')
  }

  const pipeNo = await nextPipeNo(client)
  const { data: dup } = await client.from('warp_pipes').select('id').eq('pipe_no', pipeNo).maybeSingle()
  if (dup) throw new Error(`Pipe number ${pipeNo} already exists`)

  const fields = meterFields(Number(input.meter), Number(input.multiplier), 0)
  const location = composeGodownLocation(input.godown_name, input.rack, input.bay)
  const amount = calcAmount(input.weight_kg, input.rate_per_kg)
  const stockRemark = `stock:${input.stock_label || 'Filled'}${input.remarks ? `|${input.remarks}` : ''}`

  const payload = {
    pipe_no: pipeNo,
    serial_no: pipeNo,
    location,
    status: 'FILLED_GODOWN',
    yarn_quality: input.yarn_quality.trim(),
    yarn_specification: input.yarn_specification.trim() || null,
    ...fields,
    weight_kg: Number(input.weight_kg) || 0,
    original_weight_kg: Number(input.weight_kg) || 0,
    balance_weight_kg: Number(input.weight_kg) || 0,
    warper_name: input.warper_name.trim() || null,
    machine_no: input.machine_no.trim() || null,
    rate_per_kg: Number(input.rate_per_kg) || 0,
    amount,
    rate_source: input.rate_source,
    rate_effective_from: input.rate_effective_from,
    rate_master_id: input.rate_master_id,
    godown_name: input.godown_name.trim() || 'Godown A',
    rack: input.rack.trim() || null,
    bay: input.bay.trim() || null,
    entry_date: input.entry_date || todayISO(),
    entry_type: input.entry_type,
    entered_by: userName,
    updated_by: userName,
    remarks: stockRemark,
    last_used_at: new Date().toISOString(),
  }

  const { data, error } = await client.from('warp_pipes').insert(payload).select('*').single()
  if (error) throw error
  const pipe = data as WarpPipe

  const txnType = entryTypeToTxnType(input.entry_type)
  await insertTxn(client, {
    txn_date: input.entry_date || todayISO(),
    pipe_id: pipe.id,
    pipe_no: pipe.pipe_no,
    txn_type: txnType,
    from_location:
      input.entry_type === 'Receive from Warper'
        ? `Warper · ${input.warper_name}`
        : input.supplier.trim() || input.entry_type,
    to_location: location,
    quality: pipe.yarn_quality,
    kg: pipe.weight_kg,
    meter: pipe.meter,
    multiplier: pipe.multiplier,
    total_meter: pipe.total_meter,
    balance_meter: pipe.balance_meter,
    machine_no: pipe.machine_no,
    warper_name: pipe.warper_name,
    user_name: userName,
    reference: null,
    status: input.stock_label || 'Filled',
    remarks: input.remarks.trim() || null,
    rate_per_kg: pipe.rate_per_kg ?? 0,
    amount: pipe.amount ?? 0,
    rate_source: pipe.rate_source ?? null,
    rate_effective_from: pipe.rate_effective_from ?? null,
  })

  if (input.entry_type === 'Purchase / Yarn Inward' && input.supplier.trim()) {
    await client.from('warp_yarn_purchases').insert({
      purchase_date: input.entry_date || todayISO(),
      supplier: input.supplier.trim(),
      invoice_no: null,
      yarn_quality: input.yarn_quality.trim(),
      yarn_specification: input.yarn_specification.trim() || null,
      quantity_kg: Number(input.weight_kg) || 0,
      rate: Number(input.rate_per_kg) || 0,
      amount,
      gst_pct: 0,
      total_amount: amount,
      destination: location,
      remarks: `Filled pipe ${pipeNo}`,
      entered_by: userName,
    })
  }

  return pipe
}

export async function insertTxn(
  client: SupabaseClient,
  row: Omit<WarpYarnTransaction, 'id' | 'created_at'> & { id?: string; created_at?: string },
) {
  const { error } = await client.from('warp_yarn_transactions').insert(row)
  if (error) throw error
}

export async function loadWarpBundle(client: SupabaseClient) {
  const [pipes, txns, jobs, purchases] = await Promise.all([
    client.from('warp_pipes').select('*').order('pipe_no'),
    client.from('warp_yarn_transactions').select('*').order('txn_date', { ascending: false }).limit(500),
    client.from('warp_warper_jobs').select('*').order('sent_date', { ascending: false }).limit(300),
    client.from('warp_yarn_purchases').select('*').order('purchase_date', { ascending: false }).limit(200),
  ])
  if (pipes.error) throw pipes.error
  if (txns.error) throw txns.error
  if (jobs.error) throw jobs.error
  if (purchases.error) throw purchases.error
  return {
    pipes: (pipes.data as WarpPipe[]) ?? [],
    txns: (txns.data as WarpYarnTransaction[]) ?? [],
    jobs: (jobs.data as WarpWarperJob[]) ?? [],
    purchases: (purchases.data as WarpYarnPurchase[]) ?? [],
  }
}

export function meterFields(meter: number, multiplier: number, used = 0) {
  const total = calcTotalMeter(meter, multiplier)
  const balance = calcBalanceMeter(total, used)
  return { meter, multiplier, total_meter: total, used_meter: used, balance_meter: balance }
}

export { todayISO }
