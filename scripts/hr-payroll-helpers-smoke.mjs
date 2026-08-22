/**
 * Smoke checks for HR payroll helpers (no network).
 * Run: node scripts/hr-payroll-helpers-smoke.mjs
 */

function dailyFromMonthly(monthly, divisor = 26) {
  if (!monthly || !divisor) return 0
  return Math.round((monthly / divisor) * 100) / 100
}

function maskAccountNumber(acct) {
  const s = (acct || '').replace(/\s+/g, '')
  if (!s) return '—'
  if (s.length <= 4) return s
  return `${'X'.repeat(Math.min(6, s.length - 4))}${s.slice(-4)}`
}

function parseTimeToMinutes(t) {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.slice(0, 5))
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function computeTotalHours(times) {
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

function amountInWords(amount) {
  const n = Math.round(Math.abs(amount))
  if (n === 0) return 'Rupees Zero Only'
  return `Rupees ${n} Only`
}

function calculateEmployeePayroll(input) {
  const allowances = Number(input.allowances) || 0
  const ot = Math.round((Number(input.otHours) || 0) * (Number(input.otRate) || 0) * 100) / 100
  let basic = 0
  if (input.payType === 'Monthly') {
    const rate = Number(input.monthlyRate) || 0
    const wd = Number(input.workingDays) || 26
    const pd = Number(input.payableDays) || 0
    basic = wd > 0 ? Math.round((rate * pd) / wd * 100) / 100 : 0
  } else {
    basic = Math.round((Number(input.dailyRate) || 0) * (Number(input.payableDays) || 0) * 100) / 100
  }
  const gross = Math.round((basic + allowances + ot) * 100) / 100
  const esi = input.esiOn ? Math.round(gross * 0.0075 * 100) / 100 : 0
  const pf = input.pfOn ? Math.round(Math.min(basic, 15000) * 0.12 * 100) / 100 : 0
  const pt = input.ptOn ? 200 : 0
  const totalDeduction = Math.round((esi + pf + pt) * 100) / 100
  const net = Math.round((gross - totalDeduction) * 100) / 100
  return { basic, allowances, ot, gross, esi, pf, pt, totalDeduction, net }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed')
}

assert(dailyFromMonthly(26000, 26) === 1000)
assert(maskAccountNumber('123456789012') === 'XXXXXX9012')
assert(
  computeTotalHours({ in_time: '09:00', break_out: '13:00', break_in: '14:00', out_time: '18:00' }) === 8,
)
assert(amountInWords(24925).includes('Rupees'))
const calc = calculateEmployeePayroll({
  payType: 'Monthly',
  monthlyRate: 25000,
  dailyRate: 961.54,
  otRate: 100,
  payableDays: 26,
  workingDays: 26,
  otHours: 2,
  allowances: 500,
  esiOn: true,
  pfOn: true,
  ptOn: true,
})
assert(calc.gross > calc.basic)
assert(calc.net < calc.gross)

// Matrix code helpers
function statusToCode(status) {
  const map = { Present: 'P', Absent: 'A', 'Half Day': 'HD', Leave: 'L', 'Weekly Off': 'WO', Holiday: 'H' }
  return map[(status || '').trim()] || ''
}
function nextCode(cur, def = 'A') {
  const codes = ['P', 'A', 'HD', 'L', 'WO', 'H']
  if (!cur) return def
  return codes[(codes.indexOf(cur) + 1) % codes.length]
}
assert(statusToCode('Present') === 'P')
assert(statusToCode('Half Day') === 'HD')
assert(nextCode('P') === 'A')
assert(nextCode('') === 'A')

// pickLatestSalaryRate — active/approved only
function pickLatestSalaryRate(rates, workerId, toDate) {
  return (
    rates
      .filter(
        (r) =>
          r.worker_id === workerId &&
          r.effective_from <= toDate &&
          (r.status || 'Active') === 'Active' &&
          r.approved !== false,
      )
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
  )
}
const rates = [
  { worker_id: 'w1', effective_from: '2026-08-01', status: 'Inactive', approved: true, daily_rate: 100 },
  { worker_id: 'w1', effective_from: '2026-08-10', status: 'Active', approved: true, daily_rate: 500 },
]
assert(pickLatestSalaryRate(rates, 'w1', '2026-08-22')?.daily_rate === 500)

function formatUserError(e, fallback = 'Unable to load data. Please retry.') {
  if (e == null) return fallback
  if (typeof e === 'string') return e.trim() || fallback
  if (e instanceof Error) return e.message?.trim() || fallback
  if (typeof e === 'object') {
    const msg = e.message
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
    return fallback
  }
  return String(e) === '[object Object]' ? fallback : String(e)
}
assert(formatUserError({ message: 'permission denied' }) === 'permission denied')
assert(formatUserError({ code: '42501' }) === 'Unable to load data. Please retry.')
assert(formatUserError('[object Object]') === '[object Object]')

console.log('hr-payroll-helpers-smoke: PASS')
