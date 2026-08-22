/**
 * Salary Up To Date — live liability as of any date.
 * Batch-fetches attendance/advances/payments; never silently drops employees.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attendance, SalaryRate, Role, Worker } from '../../lib/database.types'
import { monthStartISO } from '../../lib/attendanceMatrix'
import {
  buildSalaryLedgerRow,
  emptySalaryLedgerRow,
  fetchAllPaginated,
  formatINRExact,
  pickLatestSalaryRate,
  sumSalaryLedgerTotals,
  todayISO,
  withTimeout,
  type SalaryLedgerRow,
} from '../../lib/hrPayroll'
import { printReport } from '../../lib/printDocs'
import { downloadTextFile } from '../../lib/crmCustomers'
import { supabase } from '../../lib/supabase'

type Props = {
  workers: Worker[]
  salaryRates: SalaryRate[]
  roles: Role[]
  payrollRates: Array<{ role_id: string; rate_per_day: number }>
  mastersReady?: boolean
  onOpenWorker?: (workerId: string) => void
}

const PAID_STATUSES = ['Payment Processed', 'Included in Bank Salary Letter'] as const
const QUERY_TIMEOUT_MS = 90_000
const PAGE_SIZE = 1000
const CACHE_PREFIX = 'salary_up_to_date_'

type LoadPhase = 'idle' | 'fetching' | 'calculating' | 'done' | 'error'

export function SalaryUpToDatePanel({
  workers,
  salaryRates,
  roles,
  payrollRates,
  mastersReady = true,
  onOpenWorker,
}: Props) {
  const [asOfDate, setAsOfDate] = useState(() => todayISO())
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<SalaryLedgerRow[]>([])
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [progress, setProgress] = useState('')
  const loadSeq = useRef(0)
  const autoLoadedKey = useRef('')

  const fromDate = useMemo(() => monthStartISO(asOfDate.slice(0, 7)), [asOfDate])
  const activeWorkers = useMemo(() => workers.filter((w) => w.is_active), [workers])
  const busy = phase === 'fetching' || phase === 'calculating'

  const load = useCallback(async () => {
    if (!mastersReady || !activeWorkers.length) {
      setError(
        activeWorkers.length
          ? 'Loading employee and salary rate master data…'
          : 'No active employees — add employees in Employee Master first.',
      )
      return
    }

    const seq = ++loadSeq.current
    setPhase('fetching')
    setError(null)
    setProgress('Fetching attendance…')

    try {
      const attendance = await withTimeout(
        fetchAllPaginated<Attendance>(async (from, pageSize) => {
          const { data, error: aErr } = await supabase
            .from('attendance')
            .select('*')
            .gte('date', fromDate)
            .lte('date', asOfDate)
            .order('date')
            .range(from, from + pageSize - 1)
          return { data: (data as Attendance[]) ?? null, error: aErr }
        }, PAGE_SIZE),
        QUERY_TIMEOUT_MS,
        'Attendance fetch',
      )
      if (seq !== loadSeq.current) return

      setProgress('Fetching advances and payments…')

      const advances = await withTimeout(
        fetchAllPaginated<{ worker_id: string; amount: number; advance_date: string }>(
          async (from, pageSize) => {
            const { data, error: advErr } = await supabase
              .from('salary_advance_transactions')
              .select('worker_id, amount, advance_date')
              .eq('is_voided', false)
              .gte('advance_date', fromDate)
              .lte('advance_date', asOfDate)
              .range(from, from + pageSize - 1)
            if (advErr && /does not exist|schema cache|PGRST/i.test(advErr.message)) {
              return { data: [], error: null }
            }
            return {
              data: (data as Array<{ worker_id: string; amount: number; advance_date: string }>) ?? null,
              error: advErr,
            }
          },
          PAGE_SIZE,
        ),
        QUERY_TIMEOUT_MS,
        'Advance fetch',
      )
      if (seq !== loadSeq.current) return

      let paidEntries: Array<{ worker_id: string; net_payable: number }> = []
      try {
        paidEntries = await withTimeout(
          fetchAllPaginated<{ worker_id: string; net_payable: number }>(async (from, pageSize) => {
            const { data, error: pErr } = await supabase
              .from('payroll_entries')
              .select('worker_id, net_payable, status, payroll_runs!inner(from_date, to_date)')
              .in('status', [...PAID_STATUSES])
              .gte('payroll_runs.from_date', fromDate)
              .lte('payroll_runs.to_date', asOfDate)
              .range(from, from + pageSize - 1)
            if (!pErr) return { data: (data as typeof paidEntries) ?? null, error: null }
            if (/does not exist|schema cache|PGRST/i.test(pErr.message)) {
              const fallback = await supabase
                .from('payroll_entries')
                .select('worker_id, net_payable, status, payment_date')
                .in('status', [...PAID_STATUSES])
                .gte('payment_date', fromDate)
                .lte('payment_date', asOfDate)
                .range(from, from + pageSize - 1)
              return { data: (fallback.data as typeof paidEntries) ?? null, error: fallback.error }
            }
            return { data: null, error: pErr }
          }, PAGE_SIZE),
          QUERY_TIMEOUT_MS,
          'Payment fetch',
        )
      } catch (paidErr) {
        console.warn('Salary Up To Date paid entries fallback:', paidErr)
        paidEntries = []
      }
      if (seq !== loadSeq.current) return

      const paidByWorker = new Map<string, number>()
      for (const e of paidEntries) {
        const wid = String(e.worker_id)
        paidByWorker.set(wid, (paidByWorker.get(wid) || 0) + Number(e.net_payable || 0))
      }

      const advanceByWorker = new Map<string, number>()
      for (const a of advances) {
        advanceByWorker.set(a.worker_id, (advanceByWorker.get(a.worker_id) || 0) + Number(a.amount))
      }

      const attByWorker = new Map<string, Attendance[]>()
      for (const a of attendance) {
        const list = attByWorker.get(a.worker_id) || []
        list.push(a)
        attByWorker.set(a.worker_id, list)
      }

      setPhase('calculating')
      setProgress(`Calculating ${activeWorkers.length} employees…`)

      const ledger: SalaryLedgerRow[] = []
      for (const worker of activeWorkers) {
        try {
          const rate = pickLatestSalaryRate(salaryRates, worker.id, asOfDate)
          ledger.push(
            buildSalaryLedgerRow(
              worker,
              attByWorker.get(worker.id) || [],
              rate,
              advanceByWorker.get(worker.id) || 0,
              paidByWorker.get(worker.id) || 0,
              fromDate,
              asOfDate,
              roles,
              payrollRates as never,
            ),
          )
        } catch (rowErr) {
          console.error('Salary Up To Date row error:', worker.full_name, rowErr)
          ledger.push(
            emptySalaryLedgerRow(
              worker,
              rowErr instanceof Error ? rowErr.message : 'Calculation failed',
            ),
          )
        }
      }

      if (seq !== loadSeq.current) return

      setRows(ledger)
      setLoadedOnce(true)
      setPhase('done')
      setProgress('')
      try {
        sessionStorage.setItem(`${CACHE_PREFIX}${asOfDate}`, String(Date.now()))
      } catch {
        /* ignore */
      }
    } catch (e) {
      if (seq !== loadSeq.current) return
      const msg = e instanceof Error ? e.message : 'Salary calculation failed'
      console.error('Salary Up To Date calculation failed:', e)
      setError(msg)
      setRows([])
      setPhase('error')
      setProgress('')
    }
  }, [asOfDate, fromDate, activeWorkers, salaryRates, roles, payrollRates, mastersReady])

  useEffect(() => {
    if (!mastersReady || !activeWorkers.length) return
    const key = `${asOfDate}:${activeWorkers.length}:${salaryRates.length}`
    if (autoLoadedKey.current === key) return
    autoLoadedKey.current = key
    void load()
  }, [mastersReady, activeWorkers.length, salaryRates.length, asOfDate, load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const hay = [r.worker.full_name, r.worker.employee_code, r.worker.department, r.worker.designation]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, search])

  const totals = useMemo(() => sumSalaryLedgerTotals(rows), [rows])

  const completion = useMemo(() => {
    const eligible = activeWorkers.length
    const calculated = rows.length
    const rateMissing = rows.filter((r) => r.rateMissing).length
    const issues = rows.filter((r) => r.calcIssue && !r.rateMissing).length
    const complete = eligible > 0 && calculated === eligible && issues === 0
    return { eligible, calculated, rateMissing, issues, complete }
  }, [activeWorkers.length, rows])

  const issueRows = useMemo(() => rows.filter((r) => r.calcIssue), [rows])

  function exportCsv() {
    const headers = [
      'Code',
      'Name',
      'Designation',
      'Department',
      'Present',
      'Absent',
      'Leave',
      'Weekly Off',
      'Holiday',
      'Paid Days',
      'Rate',
      'Earned',
      'Advance',
      'Paid',
      'Outstanding',
      'Issue',
    ]
    const lines = rows.map((r) => [
      r.worker.employee_code || '',
      r.worker.full_name,
      r.worker.designation || '',
      r.worker.department || '',
      r.summary.present,
      r.summary.absent,
      r.summary.leave,
      r.summary.weeklyOff,
      r.summary.holiday,
      r.summary.paidDays,
      r.salaryRateLabel,
      r.earnedSalary,
      r.advancePaid,
      r.paidAmount,
      r.balanceSalary,
      r.calcIssue || '',
    ])
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.join(','), ...lines.map((r) => r.map(esc).join(','))].join('\n')
    downloadTextFile(`salary-up-to-${asOfDate}.csv`, csv)
  }

  function printTable() {
    const tableRows = rows.map((r) => [
      r.worker.employee_code || '',
      r.worker.full_name,
      r.worker.department || '',
      String(r.summary.present),
      String(r.summary.absent),
      String(r.summary.leave),
      String(r.summary.paidDays),
      formatINRExact(r.earnedSalary),
      formatINRExact(r.advancePaid),
      formatINRExact(r.paidAmount),
      formatINRExact(r.balanceSalary),
    ])
    tableRows.push([
      '',
      'TOTALS',
      '',
      '',
      '',
      '',
      '',
      formatINRExact(totals.earned),
      formatINRExact(totals.advance),
      formatINRExact(totals.paid),
      formatINRExact(totals.balance),
    ])
    printReport(
      `Salary Up To Date · As of ${asOfDate}`,
      [
        'Code',
        'Name',
        'Dept',
        'Present',
        'Absent',
        'Leave',
        'Paid Days',
        'Earned',
        'Advance',
        'Paid',
        'Outstanding',
      ],
      tableRows,
    )
  }

  return (
    <div className="form-stack hr-salary-status">
      <h2 className="section-title">Salary Up To Date</h2>
      <p className="text-muted">
        Month-to-date salary for every active employee from {fromDate} through the selected date, using
        attendance, rate master, advances, and payments.
      </p>

      {error ? (
        <div className="surface hr-salary-error" role="alert">
          <strong>Salary calculation failed</strong>
          <p>{error}</p>
          <p className="text-muted">Unable to complete the calculation for the selected period. Please retry.</p>
          <button type="button" className="primary-save" disabled={busy} onClick={() => void load()}>
            Retry Calculation
          </button>
        </div>
      ) : null}

      <div className="hr-toolbar">
        <label className="field">
          <span className="text-muted">As of Date</span>
          <input
            type="date"
            value={asOfDate}
            max={todayISO()}
            disabled={busy}
            onChange={(e) => {
              setAsOfDate(e.target.value)
              setLoadedOnce(false)
              autoLoadedKey.current = ''
            }}
          />
        </label>
        <label className="field">
          <span className="text-muted">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Employee, code, designation, department…"
          />
        </label>
        <button type="button" className="primary-save" disabled={busy || !mastersReady} onClick={() => void load()}>
          {busy ? 'Calculating…' : 'Calculate'}
        </button>
        <button type="button" className="btn-ghost" disabled={busy || !rows.length} onClick={() => void load()}>
          Refresh
        </button>
        <button type="button" className="btn-ghost" disabled={!rows.length} onClick={printTable}>
          Print
        </button>
        <button type="button" className="btn-ghost" disabled={!rows.length} onClick={exportCsv}>
          CSV
        </button>
      </div>

      {progress ? <p className="text-muted hr-salary-progress">{progress}</p> : null}

      <div className="hr-kpi-grid">
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINRExact(totals.earned)}</div>
          <div className="hr-kpi-label">Total Earned</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINRExact(totals.advance)}</div>
          <div className="hr-kpi-label">Total Advance</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINRExact(totals.paid)}</div>
          <div className="hr-kpi-label">Total Paid</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{formatINRExact(totals.balance)}</div>
          <div className="hr-kpi-label">Outstanding</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{completion.eligible}</div>
          <div className="hr-kpi-label">Total Employees</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{completion.calculated}</div>
          <div className="hr-kpi-label">Calculated</div>
        </div>
        <div className="hr-kpi surface">
          <div className="hr-kpi-value num">{completion.rateMissing}</div>
          <div className="hr-kpi-label">Rate Missing</div>
        </div>
        <div className="hr-kpi surface">
          <div className={`hr-kpi-value ${completion.complete ? 'text-success' : 'text-danger'}`}>
            {completion.complete ? 'COMPLETE' : 'INCOMPLETE'}
          </div>
          <div className="hr-kpi-label">Calculation Status</div>
        </div>
      </div>

      {!completion.complete && loadedOnce && issueRows.length ? (
        <div className="surface hr-salary-issues">
          <strong>
            {completion.eligible - completion.calculated + completion.issues} employee
            {completion.eligible - completion.calculated + completion.issues === 1 ? '' : 's'} need attention
          </strong>
          <ul>
            {issueRows.slice(0, 12).map((r) => (
              <li key={r.worker.id}>
                {r.worker.employee_code || '—'} · {r.worker.full_name}: {r.calcIssue}
              </li>
            ))}
            {issueRows.length > 12 ? <li>…and {issueRows.length - 12} more</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="hr-table-wrap">
        <table className="hr-table hr-salary-status-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Employee</th>
              <th>Designation</th>
              <th>Dept</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Leave</th>
              <th>WO</th>
              <th>Holiday</th>
              <th>Paid Days</th>
              <th>Rate</th>
              <th>Earned</th>
              <th>Advance</th>
              <th>Other Ded.</th>
              <th>Net Payable</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {busy && !rows.length ? (
              <tr>
                <td colSpan={18} className="text-muted">
                  {progress || `Calculating salary up to ${asOfDate}…`}
                </td>
              </tr>
            ) : null}
            {!busy && loadedOnce && !rows.length ? (
              <tr>
                <td colSpan={18} className="text-muted">
                  {activeWorkers.length === 0
                    ? 'No active employees — add employees in Employee Master first.'
                    : 'Click Calculate to load the salary sheet.'}
                </td>
              </tr>
            ) : null}
            {!busy && loadedOnce && rows.length > 0 && visible.length === 0 ? (
              <tr>
                <td colSpan={18} className="text-muted">
                  No rows match the current search.
                </td>
              </tr>
            ) : null}
            {visible.map((r) => (
              <tr key={r.worker.id} className={r.calcIssue ? 'hr-row-issue' : undefined}>
                <td className="num">{r.worker.employee_code || '—'}</td>
                <td>{r.worker.full_name}</td>
                <td>{r.worker.designation || '—'}</td>
                <td>{r.worker.department || '—'}</td>
                <td className="num">{r.summary.present}</td>
                <td className="num">{r.summary.absent}</td>
                <td className="num">{r.summary.leave}</td>
                <td className="num">{r.summary.weeklyOff}</td>
                <td className="num">{r.summary.holiday}</td>
                <td className="num">{r.summary.paidDays}</td>
                <td className={r.rateMissing ? 'text-danger' : undefined}>{r.salaryRateLabel}</td>
                <td className="num">{formatINRExact(r.earnedSalary)}</td>
                <td className="num">{formatINRExact(r.advancePaid)}</td>
                <td className="num">{formatINRExact(r.otherDeduction)}</td>
                <td className="num">{formatINRExact(r.netPayable)}</td>
                <td className="num">{formatINRExact(r.paidAmount)}</td>
                <td className="num">{formatINRExact(r.balanceSalary)}</td>
                <td>
                  {onOpenWorker ? (
                    <button type="button" className="btn-ghost" onClick={() => onOpenWorker(r.worker.id)}>
                      Details
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
