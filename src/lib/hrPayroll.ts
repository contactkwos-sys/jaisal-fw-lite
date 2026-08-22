/**
 * HR & Payroll helpers — attendance hours, salary calc, bank letter utilities.
 * Reuses existing attendance status rules; does not invent a second system.
 */

import { computeAttendanceStatus } from './attendanceStatus'

export const PAYROLL_STATUSES = [
  'Draft',
  'Attendance Complete',
  'Payroll Calculated',
  'Approved',
  'Ready for Salary Payment',
  'Included in Bank Salary Letter',
  'Payment Processed',
] as const

export type PayrollStatus = (typeof PAYROLL_STATUSES)[number]

export const ATTENDANCE_STATUSES = [
  'Present',
  'Absent',
  'Half Day',
  'Leave',
  'Weekly Off',
  'Holiday',
  'Completed',
  'On Break',
] as const

export const PAY_TYPES = ['Monthly', 'Daily', 'Hourly'] as const
export type PayType = (typeof PAY_TYPES)[number]

export const SHIFTS = ['Day', 'Night', 'General'] as const

/** Employee Master pay types — includes Other for custom entry (payroll treats unknown as Daily). */
export const EMPLOYEE_PAY_TYPES = ['Daily', 'Monthly', 'Hourly', 'Other'] as const

/** Employee Master shifts — includes Other for custom entry. */
export const EMPLOYEE_SHIFTS = ['Day', 'Night', 'General', 'Other'] as const

/** Common factory designations for Employee Master dropdowns (merged with Job Master / existing workers). */
export const COMMON_DESIGNATIONS = [
  'Operator',
  'Supervisor',
  'Helper',
  'Fitter',
  'Electrician',
  'Welder',
  'Engineer',
  'Manager',
  'Accountant',
  'Clerk',
  'Security',
  'Driver',
  'Quality Inspector',
  'Store',
  'Maintenance',
  'Other',
] as const

/** Common departments for Employee Master dropdowns (merged with existing worker departments). */
export const COMMON_DEPARTMENTS = [
  'Weaving',
  'Warping',
  'Production',
  'Quality',
  'Maintenance',
  'Store',
  'Security',
  'Accounts',
  'HR',
  'Dispatch',
  'Admin',
  'Other',
] as const

/** Merge option lists case-insensitively; always keep a single trailing "Other". */
export function mergeSelectOptions(...lists: Array<Iterable<string | null | undefined>>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list) {
      const name = (raw || '').trim()
      if (!name) continue
      if (name.toLowerCase() === 'other') continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(name)
    }
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  out.push('Other')
  return out
}

/** Map a stored value onto a dropdown choice + optional custom "Other" text. */
export function splitSelectChoice(
  value: string | null | undefined,
  options: string[],
): { choice: string; other: string } {
  const v = (value || '').trim()
  if (!v) return { choice: '', other: '' }
  const match = options.find((o) => o.toLowerCase() !== 'other' && o.toLowerCase() === v.toLowerCase())
  if (match) return { choice: match, other: '' }
  return { choice: 'Other', other: v }
}

/** Resolve dropdown choice (+ Other text) to the value stored on the worker. */
export function resolveSelectValue(choice: string, other: string): string {
  const c = (choice || '').trim()
  if (!c) return ''
  if (c.toLowerCase() === 'other') return (other || '').trim()
  return c
}

/** Default working days used when deriving daily rate from monthly. */
export const DEFAULT_MONTHLY_DIVISOR = 26

/** Statutory defaults (toggleable per run / employee). */
export const ESI_EMPLOYEE_PCT = 0.0075
export const PF_EMPLOYEE_PCT = 0.12
export const PT_DEFAULT_AMOUNT = 200

export type CompanyProfile = {
  name: string
  brand: string
  address: string
  phone: string
  email: string
  gstin: string
}

export const DEFAULT_COMPANY: CompanyProfile = {
  name: 'JAISAL FASHIONWEAVE INDUSTRIES',
  brand: 'JAISAL FW',
  address: 'Fashionweave Industries',
  phone: '',
  email: '',
  gstin: '',
}

export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const s = t.slice(0, 5)
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Total working hours from in/break/out times (minutes → hours). */
export function computeTotalHours(times: {
  in_time: string | null
  break_out: string | null
  break_in: string | null
  out_time: string | null
}): number {
  const inn = parseTimeToMinutes(times.in_time)
  const out = parseTimeToMinutes(times.out_time)
  if (inn == null || out == null) return 0
  let mins = out - inn
  if (mins < 0) mins += 24 * 60
  const bo = parseTimeToMinutes(times.break_out)
  const bi = parseTimeToMinutes(times.break_in)
  if (bo != null && bi != null) {
    let br = bi - bo
    if (br < 0) br += 24 * 60
    mins -= br
  }
  return Math.max(0, Math.round((mins / 60) * 100) / 100)
}

/** Payable day fraction from status / hours (existing JAISAL status + Half Day / Leave / WO / Holiday). */
export function payableDayFromAttendance(status: string, totalHours: number): number {
  const s = (status || '').trim().toLowerCase()
  if (s === 'absent') return 0
  if (s === 'half day') return 0.5
  if (s === 'leave') return 0
  if (s === 'weekly off' || s === 'holiday') return 0
  if (s === 'present' || s === 'completed' || s === 'on break') {
    if (totalHours > 0 && totalHours < 4) return 0.5
    return 1
  }
  if (totalHours >= 4) return 1
  if (totalHours > 0) return 0.5
  return 0
}

/**
 * Prefer manual / extended statuses when set; otherwise reuse computeAttendanceStatus.
 * Half Day / Leave / Weekly Off / Holiday stay as operator overrides.
 */
export function resolveAttendanceStatus(
  times: {
    in_time: string | null
    break_out: string | null
    break_in: string | null
    out_time: string | null
  },
  manualStatus?: string | null,
): string {
  const manual = (manualStatus || '').trim()
  const locked = ['Leave', 'Weekly Off', 'Holiday', 'Half Day', 'Absent']
  if (manual && locked.includes(manual)) return manual
  const auto = computeAttendanceStatus(times)
  if (manual === 'Present' && auto === 'Absent') return 'Present'
  return auto
}

export function dailyFromMonthly(monthly: number, divisor = DEFAULT_MONTHLY_DIVISOR): number {
  if (!monthly || !divisor) return 0
  return Math.round((monthly / divisor) * 100) / 100
}

export function monthlyFromDaily(daily: number, divisor = DEFAULT_MONTHLY_DIVISOR): number {
  return Math.round(daily * divisor * 100) / 100
}

export function maskAccountNumber(acct: string | null | undefined): string {
  const s = (acct || '').replace(/\s+/g, '')
  if (!s) return '—'
  if (s.length <= 4) return s
  return `${'X'.repeat(Math.min(6, s.length - 4))}${s.slice(-4)}`
}

export function formatINR(n: number | null | undefined): string {
  const v = Number(n) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v)
}

export function formatINRExact(n: number | null | undefined): string {
  const v = Number(n) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v)
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`.trim()
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n)
  return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${twoDigits(n % 100)}` : ''}`.trim()
}

/** Indian numbering: Rupees … Only */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return 'Rupees Zero Only'
  const crore = Math.floor(n / 1_00_00_000)
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000)
  const thousand = Math.floor((n % 1_00_000) / 1000)
  const hundred = n % 1000
  const parts: string[] = []
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`)
  if (hundred) parts.push(threeDigits(hundred))
  return `Rupees ${parts.join(' ')} Only`
}

export function monthBounds(ym: string): { from: string; to: string; label: string } {
  const [y, m] = ym.split('-').map(Number)
  const from = `${ym}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${ym}-${String(last).padStart(2, '0')}`
  const label = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  return { from, to, label }
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function statusBadgeClass(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('payment processed') || s.includes('approved') || s.includes('ready') || s === 'present' || s === 'completed') {
    return 'hr-badge hr-badge-ok'
  }
  if (s.includes('absent') || s.includes('error') || s.includes('rejected')) return 'hr-badge hr-badge-danger'
  if (s.includes('draft') || s.includes('pending') || s.includes('calculated') || s.includes('attendance')) {
    return 'hr-badge hr-badge-warn'
  }
  if (s.includes('leave') || s.includes('holiday') || s.includes('weekly')) return 'hr-badge hr-badge-info'
  return 'hr-badge'
}

export type CalcInput = {
  payType: PayType | string
  monthlyRate: number
  dailyRate: number
  hourlyRate: number
  otRate: number
  presentDays: number
  payableDays: number
  workingDays: number
  otHours?: number
  allowances?: number
  advance?: number
  otherDeduction?: number
  esiOn: boolean
  pfOn: boolean
  ptOn: boolean
  otherOn: boolean
}

export type CalcResult = {
  basic: number
  allowances: number
  ot: number
  gross: number
  esi: number
  pf: number
  pt: number
  other: number
  advance: number
  totalDeduction: number
  net: number
}

export function calculateEmployeePayroll(input: CalcInput): CalcResult {
  const allowances = Number(input.allowances) || 0
  const advance = Number(input.advance) || 0
  const otherRaw = Number(input.otherDeduction) || 0
  const otHours = Number(input.otHours) || 0
  const ot = Math.round(otHours * (Number(input.otRate) || 0) * 100) / 100

  let basic = 0
  const pay = (input.payType || 'Daily').toString()
  if (pay === 'Monthly') {
    const rate = Number(input.monthlyRate) || 0
    const wd = Number(input.workingDays) || DEFAULT_MONTHLY_DIVISOR
    const pd = Number(input.payableDays) || 0
    basic = wd > 0 ? Math.round((rate * pd) / wd * 100) / 100 : 0
  } else if (pay === 'Hourly') {
    basic = Math.round((Number(input.hourlyRate) || 0) * (Number(input.payableDays) || 0) * 8 * 100) / 100
  } else {
    basic = Math.round((Number(input.dailyRate) || 0) * (Number(input.payableDays) || 0) * 100) / 100
  }

  const gross = Math.round((basic + allowances + ot) * 100) / 100
  const esi = input.esiOn ? Math.round(gross * ESI_EMPLOYEE_PCT * 100) / 100 : 0
  const pfBase = Math.min(basic, 15000)
  const pf = input.pfOn ? Math.round(pfBase * PF_EMPLOYEE_PCT * 100) / 100 : 0
  const pt = input.ptOn ? PT_DEFAULT_AMOUNT : 0
  const other = input.otherOn ? otherRaw : 0
  const totalDeduction = Math.round((esi + pf + pt + other + advance) * 100) / 100
  const net = Math.round((gross - totalDeduction) * 100) / 100

  return {
    basic,
    allowances,
    ot,
    gross,
    esi,
    pf,
    pt,
    other,
    advance,
    totalDeduction,
    net,
  }
}

/** Present-day statuses used by legacy Admin payroll (keep compatible). */
export function isPresentStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim()
  return s === 'Present' || s === 'On Break' || s === 'Completed' || s === 'Half Day'
}
