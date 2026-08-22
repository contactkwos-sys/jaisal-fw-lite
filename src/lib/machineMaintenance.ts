/**
 * Machine-wise Maintenance — helpers, constants, report printing
 * JAISAL FW / Fashionweave Industries
 */
import { MACHINES } from './database.types'
import { printSummary } from './share'

export const MACHINE_LABELS: Record<string, string> = {
  M1: 'Machine 1',
  M2: 'Machine 2',
  M3: 'Machine 3',
  M4: 'Machine 4',
  M5: 'Machine 5',
  M6: 'Machine 6',
}

export function machineLabel(no: string): string {
  return MACHINE_LABELS[no] || no
}

export const FAULT_TYPES = [
  'Electrical Fault',
  'Mechanical Fault',
  'Maintenance Fault',
  'Other',
] as const

export const PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'] as const

export const SHIFTS = ['Day', 'Night', 'General'] as const

export const CONTACT_CATEGORIES = ['Electrical', 'Mechanical', 'Fitter', 'Welder', 'Other'] as const

export const BREAKDOWN_STATUSES = ['OPEN', 'CALL_DONE', 'ARRIVED', 'WORK_STARTED', 'RESOLVED'] as const

export const COMPLAINT_STATUSES = ['Open', 'In Progress', 'Resolved', 'Pending'] as const

export const PAYMENT_MODES = ['Cash', 'Bank', 'UPI', 'Other'] as const

export const PAYMENT_STATUSES = ['Pending', 'Paid'] as const

export const SCHEDULE_STATUSES = ['Upcoming', 'Due Today', 'Overdue', 'Completed'] as const

export const MACHINE_STATUSES = [
  'Running',
  'Attention',
  'Breakdown',
  'Under Maintenance',
  'Idle',
] as const

export type MachineStatus = (typeof MACHINE_STATUSES)[number]

export type MaintContact = {
  id: string
  contact_name: string
  category: string
  mobile1: string | null
  mobile2: string | null
  company: string | null
  remarks: string | null
  is_active: boolean
  created_at: string
  updated_at?: string
}

export type MachineBreakdown = {
  id: string
  machine_no: string
  breakdown_date: string
  breakdown_time: string
  shift: string
  fault_type: string
  sub_fault: string | null
  priority: string
  description: string | null
  contact_id: string | null
  contact_name: string | null
  contact_mobile1: string | null
  contact_mobile2: string | null
  status: string
  breakdown_at: string
  called_at: string | null
  arrived_at: string | null
  work_started_at: string | null
  resolved_at: string | null
  response_minutes: number | null
  repair_minutes: number | null
  downtime_minutes: number | null
  done_by: string | null
  work_performed: string | null
  root_cause: string | null
  action_taken: string | null
  remarks: string | null
  labour_charges: number
  parts_charges: number
  other_charges: number
  total_amount: number
  payment_mode: string | null
  payment_status: string
  payment_date: string | null
  payment_remarks: string | null
  created_at: string
  updated_at?: string
}

export type BreakdownPart = {
  id: string
  breakdown_id: string
  spare_part_id: string | null
  part_name: string
  part_number: string | null
  qty: number
  amount: number
  created_at: string
}

export type MaintComplaint = {
  id: string
  complaint_date: string
  machine_no: string
  complaint: string
  reported_by: string | null
  priority: string
  assigned_to: string | null
  status: string
  resolution: string | null
  resolved_date: string | null
  remarks: string | null
  created_at: string
}

export type MaintSchedule = {
  id: string
  machine_no: string
  maintenance_type: string
  last_done: string | null
  next_due: string
  assigned_person: string | null
  status: string
  remarks: string | null
  created_at: string
}

export type MaintSparePart = {
  id: string
  part_name: string
  part_number: string | null
  machine_no: string | null
  opening_stock: number
  received: number
  used: number
  min_stock: number
  rate: number
  supplier: string | null
  created_at: string
}

export type MaintEntry = {
  id: string
  machine_no: string
  priority: string
  problem: string | null
  item_needed: string | null
  photo_url: string | null
  assigned_to: string | null
  status: string
  cost: number
  created_at: string
  entry_date?: string | null
  maintenance_type?: string | null
  work_details?: string | null
  parts_used?: string | null
  next_maintenance_date?: string | null
  remarks?: string | null
  technician?: string | null
}

export function spareBalance(p: MaintSparePart): number {
  return Number(p.opening_stock || 0) + Number(p.received || 0) - Number(p.used || 0)
}

export function isLowStock(p: MaintSparePart): boolean {
  return spareBalance(p) <= Number(p.min_stock || 0)
}

export function minutesBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  return Math.round((b - a) / 60000)
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(Number(mins))) return '—'
  const m = Math.round(Number(mins))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

export function formatINR(n: number | null | undefined): string {
  const v = Number(n || 0)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v)
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function nowTimeHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function computeTimelineMinutes(row: Partial<MachineBreakdown>) {
  const response = minutesBetween(row.breakdown_at, row.called_at ?? row.arrived_at)
  const repair = minutesBetween(row.work_started_at ?? row.arrived_at, row.resolved_at)
  const downtime = minutesBetween(row.breakdown_at, row.resolved_at)
  return {
    response_minutes: response,
    repair_minutes: repair,
    downtime_minutes: downtime,
  }
}

export function deriveScheduleStatus(nextDue: string, current?: string): string {
  if (current === 'Completed') return 'Completed'
  const today = todayISO()
  if (nextDue < today) return 'Overdue'
  if (nextDue === today) return 'Due Today'
  return 'Upcoming'
}

export function statusBadgeClass(status: string): string {
  const s = status.toLowerCase()
  if (s === 'running' || s === 'resolved' || s === 'completed' || s === 'paid') return 'mwm-badge mwm-badge-ok'
  if (s === 'breakdown' || s === 'open' || s === 'emergency' || s === 'overdue') return 'mwm-badge mwm-badge-danger'
  if (s === 'attention' || s === 'due today' || s === 'pending' || s === 'high') return 'mwm-badge mwm-badge-warn'
  if (s === 'under maintenance' || s === 'call_done' || s === 'arrived' || s === 'work_started' || s === 'in progress') {
    return 'mwm-badge mwm-badge-info'
  }
  if (s === 'idle' || s === 'upcoming' || s === 'low') return 'mwm-badge mwm-badge-muted'
  return 'mwm-badge'
}

export type MachineOverviewCard = {
  machine_no: string
  label: string
  status: MachineStatus
  lastMaintenance: string | null
  lastBreakdown: string | null
  currentProblem: string | null
  downtimeMinutes: number
  mtbfHours: number | null
  lastUpdated: string | null
  openBreakdowns: number
  pendingComplaints: number
}

export function buildMachineOverview(
  machines: readonly string[] = MACHINES,
  breakdowns: MachineBreakdown[],
  entries: MaintEntry[],
  complaints: MaintComplaint[],
  schedules: MaintSchedule[],
): MachineOverviewCard[] {
  return machines.map((m) => {
    const mBd = breakdowns.filter((b) => b.machine_no === m)
    const open = mBd.filter((b) => b.status !== 'RESOLVED')
    const latestOpen = open[0] ?? null
    const lastResolved = mBd.find((b) => b.status === 'RESOLVED')
    const mEntries = entries.filter((e) => e.machine_no === m)
    const lastEntry = mEntries[0]
    const pendingComplaints = complaints.filter(
      (c) => c.machine_no === m && c.status !== 'Resolved',
    ).length
    const overdueSched = schedules.some(
      (s) => s.machine_no === m && (s.status === 'Overdue' || deriveScheduleStatus(s.next_due, s.status) === 'Overdue'),
    )

    let status: MachineStatus = 'Running'
    if (latestOpen) {
      if (latestOpen.status === 'WORK_STARTED' || latestOpen.status === 'ARRIVED') {
        status = 'Under Maintenance'
      } else {
        status = 'Breakdown'
      }
    } else if (overdueSched || pendingComplaints > 0) {
      status = 'Attention'
    } else if (!lastEntry && mBd.length === 0) {
      status = 'Idle'
    }

    const downtimeMinutes = open.reduce((sum, b) => {
      if (b.downtime_minutes != null) return sum + Number(b.downtime_minutes)
      const mins = minutesBetween(b.breakdown_at, new Date().toISOString())
      return sum + (mins || 0)
    }, 0)

    // MTBF: average hours between resolved breakdown starts
    const resolved = mBd.filter((b) => b.status === 'RESOLVED').slice(0, 20)
    let mtbfHours: number | null = null
    if (resolved.length >= 2) {
      const times = resolved
        .map((b) => new Date(b.breakdown_at).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => a - b)
      if (times.length >= 2) {
        let total = 0
        for (let i = 1; i < times.length; i++) total += times[i] - times[i - 1]
        mtbfHours = Math.round(total / (times.length - 1) / 3600000)
      }
    }

    const lastUpdated =
      latestOpen?.updated_at ||
      latestOpen?.created_at ||
      lastResolved?.resolved_at ||
      lastEntry?.created_at ||
      null

    return {
      machine_no: m,
      label: machineLabel(m),
      status,
      lastMaintenance: lastEntry?.entry_date || lastEntry?.created_at?.slice(0, 10) || null,
      lastBreakdown: mBd[0]?.breakdown_date || null,
      currentProblem: latestOpen?.sub_fault || latestOpen?.description || null,
      downtimeMinutes,
      mtbfHours,
      lastUpdated,
      openBreakdowns: open.length,
      pendingComplaints,
    }
  })
}

export function callPhone(mobile: string | null | undefined) {
  const n = (mobile || '').replace(/[^\d+]/g, '')
  if (!n) return
  window.location.href = `tel:${n}`
}

export function whatsAppTo(mobile: string | null | undefined, text?: string) {
  const digits = (mobile || '').replace(/\D/g, '')
  if (!digits) return
  const phone = digits.length === 10 ? `91${digits}` : digits
  const url = text
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${phone}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type ReportFilter = {
  dateFrom: string
  dateTo: string
  machine: string
  faultType: string
  status: string
}

export function filterBreakdowns(
  rows: MachineBreakdown[],
  f: ReportFilter,
  search = '',
): MachineBreakdown[] {
  const q = search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.machine && r.machine_no !== f.machine) return false
    if (f.faultType && r.fault_type !== f.faultType) return false
    if (f.status && r.status !== f.status) return false
    if (f.dateFrom && r.breakdown_date < f.dateFrom) return false
    if (f.dateTo && r.breakdown_date > f.dateTo) return false
    if (!q) return true
    const hay = [
      r.sub_fault,
      r.description,
      r.contact_name,
      r.done_by,
      r.fault_type,
      r.root_cause,
      r.work_performed,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export function printMaintenanceReport(opts: {
  reportName: string
  dateFrom?: string
  dateTo?: string
  machine?: string
  columns: string[]
  rows: Array<Array<string | number | null | undefined>>
}) {
  const meta = [
    ['Report', opts.reportName],
    ['Date Range', `${opts.dateFrom || '—'} to ${opts.dateTo || '—'}`],
    ['Machine', opts.machine ? machineLabel(opts.machine) : 'All Machines'],
  ]
  const head = opts.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')
  const body = opts.rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${escapeHtml(String(c ?? '—'))}</td>`).join('')}</tr>`,
    )
    .join('')
  const html = `
<div style="text-align:center;margin-bottom:16px">
  <div style="font-size:20px;font-weight:700">JAISAL FW</div>
  <div style="color:#555">Fashionweave Industries</div>
  <div style="margin-top:8px;font-size:16px;font-weight:600">${escapeHtml(opts.reportName)}</div>
</div>
<table style="margin-bottom:12px">${meta
    .map(([k, v]) => `<tr><th style="width:28%">${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>`)
    .join('')}</table>
<table>
  <thead><tr>${head}</tr></thead>
  <tbody>${body || `<tr><td colspan="${opts.columns.length}">No records</td></tr>`}</tbody>
</table>
<p class="muted">Printed ${new Date().toLocaleString()} · Page 1</p>
`
  printSummary(opts.reportName, html)
}

export function csvDownload(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const esc = (v: unknown) => {
    const s = String(v ?? '')
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const MIGRATION_HINT =
  'Run public/migration-machine-wise-maintenance.sql in the Supabase SQL editor, then refresh.'

export function isMigrationError(msg: string): boolean {
  return /does not exist|schema cache|PGRST/i.test(msg)
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export { MACHINES }
