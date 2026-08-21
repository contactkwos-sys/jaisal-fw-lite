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
  'Move to Godown',
  'Empty Pipe',
  'Adjustment',
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
  }
  return map[status] || status
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
    if (f.status && p.status !== f.status) return false
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
  const { data } = await client.from('warp_pipes').select('pipe_no').order('pipe_no', { ascending: false }).limit(200)
  let max = 0
  for (const row of data || []) {
    const m = String((row as { pipe_no: string }).pipe_no || '').match(/^BP-(\d+)$/i)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `BP-${String(max + 1).padStart(3, '0')}`
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
