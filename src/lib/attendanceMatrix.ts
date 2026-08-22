/**
 * Date-range attendance matrix — quick P/A/HD/L/WO/H codes.
 * Reuses hrPayroll payable-day rules; stores full status names in attendance table.
 */
import { payableDayFromAttendance } from './hrPayroll'

export const MATRIX_CODES = ['P', 'A', 'HD', 'L', 'WO', 'H'] as const
export type MatrixCode = (typeof MATRIX_CODES)[number]

export const MATRIX_CODE_TO_STATUS: Record<MatrixCode, string> = {
  P: 'Present',
  A: 'Absent',
  HD: 'Half Day',
  L: 'Leave',
  WO: 'Weekly Off',
  H: 'Holiday',
}

export const STATUS_TO_MATRIX_CODE: Record<string, MatrixCode> = {
  Present: 'P',
  Completed: 'P',
  'On Break': 'P',
  Absent: 'A',
  'Half Day': 'HD',
  Leave: 'L',
  'Weekly Off': 'WO',
  Holiday: 'H',
}

export type DateRangePreset =
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'previous-month'
  | 'current-month'
  | 'custom'

export type AttendanceSummary = {
  present: number
  absent: number
  halfDay: number
  leave: number
  weeklyOff: number
  holiday: number
  paidDays: number
}

export function statusToMatrixCode(status: string | null | undefined): MatrixCode | '' {
  const s = (status || '').trim()
  if (!s) return ''
  return STATUS_TO_MATRIX_CODE[s] ?? ''
}

export function matrixCodeToStatus(code: MatrixCode): string {
  return MATRIX_CODE_TO_STATUS[code]
}

export function nextMatrixCode(current: MatrixCode | '', defaultCode: MatrixCode = 'A'): MatrixCode {
  if (!current) return defaultCode
  const idx = MATRIX_CODES.indexOf(current)
  return MATRIX_CODES[(idx + 1) % MATRIX_CODES.length]
}

export function formatDateHeader(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`)
  return String(d.getDate()).padStart(2, '0')
}

export function datesBetween(from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  const cur = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function monthStartISO(ym?: string): string {
  const ref = ym || todayISO().slice(0, 7)
  return `${ref}-01`
}

export function resolveDateRangePreset(preset: DateRangePreset, customFrom?: string, customTo?: string): {
  from: string
  to: string
} {
  const today = todayISO()
  const [y, m] = today.split('-').map(Number)
  if (preset === 'today') return { from: today, to: today }
  if (preset === 'this-week' || preset === 'current-month' || preset === 'this-month') {
    if (preset === 'this-week') {
      const d = new Date(`${today}T12:00:00`)
      const day = d.getDay()
      const diff = day === 0 ? 6 : day - 1
      d.setDate(d.getDate() - diff)
      return { from: d.toISOString().slice(0, 10), to: today }
    }
    return { from: monthStartISO(), to: today }
  }
  if (preset === 'previous-month') {
    const prev = new Date(y, m - 2, 1)
    const last = new Date(y, m - 1, 0)
    const py = prev.getFullYear()
    const pm = String(prev.getMonth() + 1).padStart(2, '0')
    const lastDay = last.getDate()
    return { from: `${py}-${pm}-01`, to: `${py}-${pm}-${String(lastDay).padStart(2, '0')}` }
  }
  return { from: customFrom || monthStartISO(), to: customTo || today }
}

export function summarizeStatuses(
  statusByDate: Map<string, string> | Record<string, string>,
  dates?: string[],
): AttendanceSummary {
  const get = (d: string) => {
    if (statusByDate instanceof Map) return statusByDate.get(d) || ''
    return statusByDate[d] || ''
  }
  const keys = dates ?? (statusByDate instanceof Map ? [...statusByDate.keys()] : Object.keys(statusByDate))
  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    weeklyOff: 0,
    holiday: 0,
    paidDays: 0,
  }
  for (const date of keys) {
    const st = get(date).trim() || 'Absent'
    const code = statusToMatrixCode(st)
    if (code === 'P') summary.present++
    else if (code === 'A') summary.absent++
    else if (code === 'HD') summary.halfDay++
    else if (code === 'L') summary.leave++
    else if (code === 'WO') summary.weeklyOff++
    else if (code === 'H') summary.holiday++
    summary.paidDays += payableDayFromAttendance(st, 0)
  }
  summary.paidDays = Math.round(summary.paidDays * 100) / 100
  return summary
}

export function summarizeAttendanceRows(
  rows: Array<{ date: string; status?: string | null; payable_day?: number | null; total_hours?: number | null }>,
): AttendanceSummary {
  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    halfDay: 0,
    leave: 0,
    weeklyOff: 0,
    holiday: 0,
    paidDays: 0,
  }
  for (const row of rows) {
    const st = (row.status || 'Absent').trim()
    const code = statusToMatrixCode(st)
    if (code === 'P') summary.present++
    else if (code === 'A') summary.absent++
    else if (code === 'HD') summary.halfDay++
    else if (code === 'L') summary.leave++
    else if (code === 'WO') summary.weeklyOff++
    else if (code === 'H') summary.holiday++
    const pd =
      row.payable_day != null && row.payable_day !== undefined
        ? Number(row.payable_day)
        : payableDayFromAttendance(st, Number(row.total_hours) || 0)
    summary.paidDays += pd
  }
  summary.paidDays = Math.round(summary.paidDays * 100) / 100
  return summary
}

export function matrixBadgeClass(code: MatrixCode | ''): string {
  if (code === 'P') return 'hr-att-cell hr-att-p'
  if (code === 'A') return 'hr-att-cell hr-att-a'
  if (code === 'HD') return 'hr-att-cell hr-att-hd'
  if (code === 'L') return 'hr-att-cell hr-att-l'
  if (code === 'WO') return 'hr-att-cell hr-att-wo'
  if (code === 'H') return 'hr-att-cell hr-att-h'
  return 'hr-att-cell hr-att-empty'
}

export function buildMatrixAttendancePayload(args: {
  worker_id: string
  date: string
  code: MatrixCode
  shift?: string | null
}): {
  worker_id: string
  date: string
  status: string
  shift: string | null
  in_time: string | null
  break_out: string | null
  break_in: string | null
  out_time: string | null
  total_hours: number
  payable_day: number
  updated_at: string
} {
  const status = matrixCodeToStatus(args.code)
  const total_hours = args.code === 'P' ? 8 : args.code === 'HD' ? 4 : 0
  const payable_day = payableDayFromAttendance(status, total_hours)
  return {
    worker_id: args.worker_id,
    date: args.date,
    status,
    shift: args.shift || null,
    in_time: args.code === 'P' || args.code === 'HD' ? '09:00' : null,
    break_out: null,
    break_in: null,
    out_time: args.code === 'P' ? '18:00' : args.code === 'HD' ? '13:00' : null,
    total_hours,
    payable_day,
    updated_at: new Date().toISOString(),
  }
}

export const ATTENDANCE_STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'P', label: 'Present' },
  { id: 'A', label: 'Absent' },
  { id: 'HD', label: 'Half Day' },
  { id: 'L', label: 'Leave' },
  { id: 'WO', label: 'Weekly Off' },
  { id: 'H', label: 'Holiday' },
] as const

export function workerMatchesAttendanceFilter(
  summary: AttendanceSummary,
  statusFilter: string,
  search: string,
  worker: { full_name: string; employee_code?: string | null; designation?: string | null; department?: string | null; shift?: string | null },
): boolean {
  const q = search.trim().toLowerCase()
  if (q) {
    const hay = [
      worker.full_name,
      worker.employee_code,
      worker.designation,
      worker.department,
      worker.shift,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (!statusFilter) return true
  if (statusFilter === 'P') return summary.present > 0
  if (statusFilter === 'A') return summary.absent > 0
  if (statusFilter === 'HD') return summary.halfDay > 0
  if (statusFilter === 'L') return summary.leave > 0
  if (statusFilter === 'WO') return summary.weeklyOff > 0
  if (statusFilter === 'H') return summary.holiday > 0
  return true
}
