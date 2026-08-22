/**
 * HR & Payroll — unified reports with print / CSV export.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Attendance, PayrollEntry, Role, SalaryRate, Worker } from '../../lib/database.types'
import {
  datesBetween,
  formatDateHeader,
  matrixBadgeClass,
  statusToMatrixCode,
} from '../../lib/attendanceMatrix'
import {
  buildSalaryLedgerRow,
  formatINR,
  formatINRExact,
  monthBounds,
  pickLatestSalaryRate,
  statusBadgeClass,
  todayISO,
  type SalaryLedgerRow,
} from '../../lib/hrPayroll'
import { fetchSalaryAdvances, type SalaryAdvanceRow } from '../../lib/ceoPinManagement'
import { printReport } from '../../lib/printDocs'
import { downloadTextFile } from '../../lib/crmCustomers'
import { supabase } from '../../lib/supabase'

export type HrReportKind =
  | 'daily-attendance'
  | 'date-range-attendance'
  | 'employee-attendance'
  | 'monthly-attendance'
  | 'salary-register'
  | 'employee-salary-history'
  | 'advance-salary'
  | 'salary-payment'
  | 'outstanding-salary'
  | 'department-payroll'
  | 'shift-attendance'
  | 'payroll-summary'
  | 'combined'

const REPORT_NAV: Array<{ id: HrReportKind; label: string }> = [
  { id: 'daily-attendance', label: 'Daily Attendance' },
  { id: 'date-range-attendance', label: 'Date Range Attendance' },
  { id: 'employee-attendance', label: 'Employee Attendance' },
  { id: 'monthly-attendance', label: 'Monthly Attendance' },
  { id: 'salary-register', label: 'Salary Register' },
  { id: 'employee-salary-history', label: 'Employee Salary History' },
  { id: 'advance-salary', label: 'Advance Salary Report' },
  { id: 'salary-payment', label: 'Salary Payment Report' },
  { id: 'outstanding-salary', label: 'Outstanding Salary' },
  { id: 'department-payroll', label: 'Department-wise Payroll' },
  { id: 'shift-attendance', label: 'Shift-wise Attendance' },
  { id: 'payroll-summary', label: 'Payroll Summary' },
  { id: 'combined', label: 'Salary & Attendance (Combined)' },
]

type Props = {
  workers: Worker[]
  salaryRates: SalaryRate[]
  roles: Role[]
  payrollRates: Array<{ role_id: string; rate_per_day: number }>
  initialWorkerId?: string
  onOpenWorkerHistory?: (workerId: string) => void
}

export function HrPayrollReportsPanel({
  workers,
  salaryRates,
  roles,
  payrollRates,
  initialWorkerId,
  onOpenWorkerHistory,
}: Props) {
  const [reportKind, setReportKind] = useState<HrReportKind>('combined')
  const [fromDate, setFromDate] = useState(() => monthBounds(todayISO().slice(0, 7)).from)
  const [toDate, setToDate] = useState(() => todayISO())
  const [filterDept, setFilterDept] = useState('')
  const [filterDesig, setFilterDesig] = useState('')
  const [filterShift, setFilterShift] = useState('')
  const [filterWorkerId, setFilterWorkerId] = useState(initialWorkerId || '')
  const [filterStatus, setFilterStatus] = useState('')
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [advances, setAdvances] = useState<SalaryAdvanceRow[]>([])
  const [ledgerRows, setLedgerRows] = useState<SalaryLedgerRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeWorkers = useMemo(() => workers.filter((w) => w.is_active), [workers])
  const departments = useMemo(
    () => [...new Set(activeWorkers.map((w) => w.department).filter(Boolean))].sort() as string[],
    [activeWorkers],
  )
  const designations = useMemo(
    () => [...new Set(activeWorkers.map((w) => w.designation).filter(Boolean))].sort() as string[],
    [activeWorkers],
  )

  useEffect(() => {
    if (initialWorkerId) {
      setFilterWorkerId(initialWorkerId)
      setReportKind('employee-salary-history')
    }
  }, [initialWorkerId])

  const loadData = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const { data: att, error: aErr } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
      if (aErr) throw aErr
      setAttendance((att as Attendance[]) ?? [])

      const { data: entries, error: pErr } = await supabase
        .from('payroll_entries')
        .select('*, payroll_runs!inner(from_date, to_date, payroll_month)')
        .gte('payroll_runs.from_date', fromDate)
        .lte('payroll_runs.to_date', toDate)
      const entryRows = (pErr
        ? ((await supabase.from('payroll_entries').select('*').limit(500)).data as PayrollEntry[]) ?? []
        : (entries as PayrollEntry[]) ?? [])

      const adv = await fetchSalaryAdvances()
      setAdvances(adv.filter((a) => a.advance_date >= fromDate && a.advance_date <= toDate))

      const paidByWorker = new Map<string, number>()
      for (const e of entryRows) {
        if (e.status === 'Payment Processed' || e.status === 'Included in Bank Salary Letter') {
          paidByWorker.set(e.worker_id, (paidByWorker.get(e.worker_id) || 0) + Number(e.net_payable))
        }
      }
      const advanceByWorker = new Map<string, number>()
      for (const a of adv.filter((x) => x.advance_date >= fromDate && x.advance_date <= toDate)) {
        advanceByWorker.set(a.worker_id, (advanceByWorker.get(a.worker_id) || 0) + Number(a.amount))
      }
      const attByWorker = new Map<string, Attendance[]>()
      for (const a of (att as Attendance[]) ?? []) {
        const list = attByWorker.get(a.worker_id) || []
        list.push(a)
        attByWorker.set(a.worker_id, list)
      }

      const rows: SalaryLedgerRow[] = activeWorkers.map((worker) => {
        const rate = pickLatestSalaryRate(salaryRates, worker.id, toDate)
        return buildSalaryLedgerRow(
          worker,
          attByWorker.get(worker.id) || [],
          rate,
          advanceByWorker.get(worker.id) || 0,
          paidByWorker.get(worker.id) || 0,
          fromDate,
          toDate,
          roles,
          payrollRates as never,
        )
      })
      setLedgerRows(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [fromDate, toDate, activeWorkers, salaryRates, roles, payrollRates])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredLedger = useMemo(() => {
    return ledgerRows.filter((row) => {
      if (filterDept && row.worker.department !== filterDept) return false
      if (filterDesig && row.worker.designation !== filterDesig) return false
      if (filterShift && (row.worker.shift || 'Day') !== filterShift) return false
      if (filterWorkerId && row.worker.id !== filterWorkerId) return false
      if (filterStatus && row.netPayable > 0 && filterStatus === 'paid' && row.balanceSalary > 0) return false
      if (filterStatus === 'outstanding' && row.balanceSalary <= 0) return false
      return true
    })
  }, [ledgerRows, filterDept, filterDesig, filterShift, filterWorkerId, filterStatus])

  const summaryCards = useMemo(() => {
    const t = {
      employees: filteredLedger.length,
      present: 0,
      absent: 0,
      paidDays: 0,
      gross: 0,
      advance: 0,
      deduction: 0,
      paid: 0,
      payable: 0,
      balance: 0,
    }
    for (const r of filteredLedger) {
      t.present += r.summary.present
      t.absent += r.summary.absent
      t.paidDays += r.summary.paidDays
      t.gross += r.earnedSalary
      t.advance += r.advancePaid
      t.deduction += r.statutoryDeduction + r.otherDeduction
      t.paid += r.paidAmount
      t.payable += r.netPayable
      t.balance += r.balanceSalary
    }
    t.paidDays = Math.round(t.paidDays * 100) / 100
    return t
  }, [filteredLedger])

  function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
    downloadTextFile(filename, csv)
  }

  function printCombined() {
    const headers = [
      'Code',
      'Name',
      'Designation',
      'Dept',
      'Shift',
      'Present',
      'Absent',
      'Half',
      'Leave',
      'Paid Days',
      'Rate',
      'Earned',
      'Advance',
      'Deduction',
      'Paid',
      'Balance',
    ]
    const rows = filteredLedger.map((r) => [
      r.worker.employee_code || '',
      r.worker.full_name,
      r.worker.designation || '',
      r.worker.department || '',
      r.worker.shift || '',
      r.summary.present,
      r.summary.absent,
      r.summary.halfDay,
      r.summary.leave,
      r.summary.paidDays,
      r.salaryRateLabel,
      formatINRExact(r.earnedSalary),
      formatINRExact(r.advancePaid),
      formatINRExact(r.statutoryDeduction + r.otherDeduction),
      formatINRExact(r.paidAmount),
      formatINRExact(r.balanceSalary),
    ])
    printReport(`HR Payroll Report ${fromDate} to ${toDate}`, headers, rows)
  }

  const dates = datesBetween(fromDate, toDate)

  const dailyRows = useMemo(() => {
    if (reportKind !== 'daily-attendance') return []
    const day = toDate
    const byWorker = new Map(attendance.filter((a) => a.date === day).map((a) => [a.worker_id, a]))
    return activeWorkers.map((w) => {
      const a = byWorker.get(w.id)
      const code = a ? statusToMatrixCode(a.status) : 'A'
      return { worker: w, status: a?.status || 'Absent', code }
    })
  }, [reportKind, attendance, activeWorkers, toDate])

  return (
    <div className="form-stack hr-reports-panel">
      <h2 className="section-title">HR & Payroll Reports</h2>
      <div className="hr-report-grid">
        {REPORT_NAV.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`hr-report-card${reportKind === r.id ? ' active' : ''}`}
            onClick={() => setReportKind(r.id)}
          >
            <strong>{r.label}</strong>
          </button>
        ))}
      </div>

      <div className="hr-toolbar">
        <label className="field">
          <span className="text-muted">From</span>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">To</span>
          <input type="date" value={toDate} max={todayISO()} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Department</span>
          <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Designation</span>
          <select value={filterDesig} onChange={(e) => setFilterDesig(e.target.value)}>
            <option value="">All</option>
            {designations.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Shift</span>
          <select value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
            <option value="">All</option>
            <option value="Day">Day</option>
            <option value="Night">Night</option>
            <option value="General">General</option>
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Employee</span>
          <select value={filterWorkerId} onChange={(e) => setFilterWorkerId(e.target.value)}>
            <option value="">All</option>
            {activeWorkers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.employee_code ? `${w.employee_code} · ` : ''}{w.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Status</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="outstanding">Outstanding balance</option>
            <option value="paid">Fully paid</option>
          </select>
        </label>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void loadData()}>
          Refresh
        </button>
      </div>

      <div className="hr-kpi-grid">
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{summaryCards.employees}</div>
          <div className="hr-kpi-label">Total Employees</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{summaryCards.present}</div>
          <div className="hr-kpi-label">Present (days)</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{summaryCards.absent}</div>
          <div className="hr-kpi-label">Absent (days)</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{summaryCards.paidDays}</div>
          <div className="hr-kpi-label">Total Paid Days</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINR(summaryCards.gross)}</div>
          <div className="hr-kpi-label">Gross Salary Earned</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINR(summaryCards.advance)}</div>
          <div className="hr-kpi-label">Total Advance</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINR(summaryCards.paid)}</div>
          <div className="hr-kpi-label">Total Paid</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINR(summaryCards.balance)}</div>
          <div className="hr-kpi-label">Outstanding Salary</div>
        </div>
      </div>

      <div className="hr-quick-actions share-actions">
        <button type="button" className="btn-ghost" onClick={printCombined}>Print</button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() =>
            exportCsv(
              `hr-payroll-${fromDate}-${toDate}.csv`,
              ['Code', 'Name', 'Dept', 'Present', 'Absent', 'Paid Days', 'Earned', 'Advance', 'Paid', 'Balance'],
              filteredLedger.map((r) => [
                r.worker.employee_code || '',
                r.worker.full_name,
                r.worker.department || '',
                r.summary.present,
                r.summary.absent,
                r.summary.paidDays,
                r.earnedSalary,
                r.advancePaid,
                r.paidAmount,
                r.balanceSalary,
              ]),
            )
          }
        >
          Excel / CSV
        </button>
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}

      {reportKind === 'daily-attendance' ? (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dept</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.worker.id}>
                  <td>{r.worker.full_name}</td>
                  <td>{r.worker.department || '—'}</td>
                  <td><span className={statusBadgeClass(r.status)}>{r.code}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reportKind === 'advance-salary' ? (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Amount</th>
                <th>Mode</th>
                <th>Reference</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((a) => (
                <tr key={a.id}>
                  <td>{a.advance_date}</td>
                  <td>{a.workers?.full_name || a.worker_id}</td>
                  <td className="num">{formatINRExact(a.amount)}</td>
                  <td>{a.payment_mode}</td>
                  <td>{a.reference_no || '—'}</td>
                  <td>{a.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reportKind === 'department-payroll' ? (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Employees</th>
                <th>Paid Days</th>
                <th>Gross</th>
                <th>Advance</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(
                filteredLedger.reduce<Record<string, { n: number; paid: number; gross: number; adv: number; bal: number }>>(
                  (acc, r) => {
                    const d = r.worker.department || 'Other'
                    const cur = acc[d] || { n: 0, paid: 0, gross: 0, adv: 0, bal: 0 }
                    cur.n++
                    cur.paid += r.summary.paidDays
                    cur.gross += r.earnedSalary
                    cur.adv += r.advancePaid
                    cur.bal += r.balanceSalary
                    acc[d] = cur
                    return acc
                  },
                  {},
                ),
              ).map(([dept, v]) => (
                <tr key={dept}>
                  <td>{dept}</td>
                  <td className="num">{v.n}</td>
                  <td className="num">{Math.round(v.paid * 100) / 100}</td>
                  <td className="num">{formatINRExact(v.gross)}</td>
                  <td className="num">{formatINRExact(v.adv)}</td>
                  <td className="num">{formatINRExact(v.bal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reportKind === 'shift-attendance' ? (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Shift</th>
                <th>Employees</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Paid Days</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(
                filteredLedger.reduce<Record<string, { n: number; p: number; a: number; paid: number }>>((acc, r) => {
                  const s = r.worker.shift || 'Day'
                  const cur = acc[s] || { n: 0, p: 0, a: 0, paid: 0 }
                  cur.n++
                  cur.p += r.summary.present
                  cur.a += r.summary.absent
                  cur.paid += r.summary.paidDays
                  acc[s] = cur
                  return acc
                }, {}),
              ).map(([shift, v]) => (
                <tr key={shift}>
                  <td>{shift}</td>
                  <td className="num">{v.n}</td>
                  <td className="num">{v.p}</td>
                  <td className="num">{v.a}</td>
                  <td className="num">{Math.round(v.paid * 100) / 100}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {(reportKind === 'combined' ||
        reportKind === 'salary-register' ||
        reportKind === 'outstanding-salary' ||
        reportKind === 'payroll-summary' ||
        reportKind === 'salary-payment' ||
        reportKind === 'date-range-attendance' ||
        reportKind === 'monthly-attendance' ||
        reportKind === 'employee-attendance') ? (
        <div className="hr-table-wrap hr-reports-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Designation</th>
                <th>Dept</th>
                <th>Shift</th>
                <th>Present</th>
                <th>Absent</th>
                <th>Half</th>
                <th>Leave</th>
                <th>Paid Days</th>
                <th>Rate</th>
                <th>Earned</th>
                <th>Advance</th>
                <th>Deduction</th>
                <th>Paid</th>
                <th>Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((r) => (
                <tr key={r.worker.id}>
                  <td className="num">{r.worker.employee_code || '—'}</td>
                  <td>{r.worker.full_name}</td>
                  <td>{r.worker.designation || '—'}</td>
                  <td>{r.worker.department || '—'}</td>
                  <td>{r.worker.shift || 'Day'}</td>
                  <td className="num">{r.summary.present}</td>
                  <td className="num">{r.summary.absent}</td>
                  <td className="num">{r.summary.halfDay}</td>
                  <td className="num">{r.summary.leave}</td>
                  <td className="num">{r.summary.paidDays}</td>
                  <td>{r.salaryRateLabel}</td>
                  <td className="num">{formatINRExact(r.earnedSalary)}</td>
                  <td className="num">{formatINRExact(r.advancePaid)}</td>
                  <td className="num">{formatINRExact(r.statutoryDeduction + r.otherDeduction)}</td>
                  <td className="num">{formatINRExact(r.paidAmount)}</td>
                  <td className="num">{formatINRExact(r.balanceSalary)}</td>
                  <td>
                    {onOpenWorkerHistory ? (
                      <button type="button" className="btn-ghost" onClick={() => onOpenWorkerHistory(r.worker.id)}>
                        History
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reportKind === 'employee-salary-history' && filterWorkerId ? (
        <EmployeeSalaryHistoryInline workerId={filterWorkerId} fromDate={fromDate} toDate={toDate} advances={advances} />
      ) : null}

      {reportKind === 'date-range-attendance' && filterWorkerId ? (
        <div className="hr-att-matrix-wrap compact">
          <table className="hr-att-matrix">
            <thead>
              <tr>
                {dates.map((d) => (
                  <th key={d}>{formatDateHeader(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {dates.map((d) => {
                  const a = attendance.find((x) => x.worker_id === filterWorkerId && x.date === d)
                  const code = a ? statusToMatrixCode(a.status) : ''
                  return <td key={d}><span className={matrixBadgeClass(code)}>{code || '—'}</span></td>
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function EmployeeSalaryHistoryInline({
  workerId,
  fromDate,
  toDate,
  advances,
}: {
  workerId: string
  fromDate: string
  toDate: string
  advances: SalaryAdvanceRow[]
}) {
  const [att, setAtt] = useState<Attendance[]>([])
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .eq('worker_id', workerId)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date')
      setAtt((data as Attendance[]) ?? [])
    })()
  }, [workerId, fromDate, toDate])

  const workerAdv = advances.filter((a) => a.worker_id === workerId)

  return (
    <div className="form-stack">
      <h3 className="section-title">Daily salary history</h3>
      <div className="hr-table-wrap">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Attendance</th>
              <th>Payable day</th>
            </tr>
          </thead>
          <tbody>
            {att.map((a) => (
              <tr key={a.id}>
                <td>{a.date}</td>
                <td>{statusToMatrixCode(a.status) || a.status}</td>
                <td className="num">{a.payable_day ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {workerAdv.length ? (
        <div>
          <h4>Advances</h4>
          <ul>
            {workerAdv.map((a) => (
              <li key={a.id}>
                {a.advance_date} — {formatINRExact(a.amount)} {a.payment_mode}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
