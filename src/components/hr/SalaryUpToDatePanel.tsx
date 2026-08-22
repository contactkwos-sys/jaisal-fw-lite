/**
 * Salary Up To Date — live liability as of any date.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Attendance, SalaryRate, Role, Worker } from '../../lib/database.types'
import { monthStartISO } from '../../lib/attendanceMatrix'
import {
  buildSalaryLedgerRow,
  formatINRExact,
  formatUserError,
  pickLatestSalaryRate,
  todayISO,
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
  onOpenWorker?: (workerId: string) => void
}

const PAID_STATUSES = ['Payment Processed', 'Included in Bank Salary Letter'] as const

export function SalaryUpToDatePanel({ workers, salaryRates, roles, payrollRates, onOpenWorker }: Props) {
  const [asOfDate, setAsOfDate] = useState(() => todayISO())
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<SalaryLedgerRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [calcStats, setCalcStats] = useState<{ eligible: number; calculated: number } | null>(null)

  const fromDate = useMemo(() => monthStartISO(asOfDate.slice(0, 7)), [asOfDate])
  const activeWorkers = useMemo(() => workers.filter((w) => w.is_active), [workers])

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const { data: att, error: aErr } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', fromDate)
        .lte('date', asOfDate)
      if (aErr) throw aErr

      let paidEntries: Array<{ worker_id: string; net_payable: number; status?: string }> = []
      const { data: paid, error: pErr } = await supabase
        .from('payroll_entries')
        .select('worker_id, net_payable, status')
        .in('status', [...PAID_STATUSES])
      if (!pErr) {
        paidEntries = (paid ?? []) as typeof paidEntries
      } else if (!/does not exist|schema cache|PGRST/i.test(pErr.message)) {
        throw pErr
      }

      const paidByWorker = new Map<string, number>()
      for (const e of paidEntries) {
        const wid = String(e.worker_id)
        paidByWorker.set(wid, (paidByWorker.get(wid) || 0) + Number(e.net_payable || 0))
      }

      let advRows: Array<{ worker_id: string; amount: number; advance_date: string }> = []
      const { data: adv, error: advErr } = await supabase
        .from('salary_advance_transactions')
        .select('worker_id, amount, advance_date')
        .eq('is_voided', false)
        .gte('advance_date', fromDate)
        .lte('advance_date', asOfDate)
      if (!advErr) {
        advRows = (adv ?? []) as typeof advRows
      } else if (!/does not exist|schema cache|PGRST/i.test(advErr.message)) {
        throw advErr
      }

      const advanceByWorker = new Map<string, number>()
      for (const a of advRows) {
        advanceByWorker.set(a.worker_id, (advanceByWorker.get(a.worker_id) || 0) + Number(a.amount))
      }

      const attByWorker = new Map<string, Attendance[]>()
      for (const a of (att as Attendance[]) ?? []) {
        const list = attByWorker.get(a.worker_id) || []
        list.push(a)
        attByWorker.set(a.worker_id, list)
      }

      const ledger: SalaryLedgerRow[] = []
      let calculated = 0
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
          calculated++
        } catch (rowErr) {
          console.warn('Salary Up To Date row skipped:', worker.full_name, rowErr)
        }
      }
      setRows(ledger)
      setCalcStats({ eligible: activeWorkers.length, calculated })
      setLoadedOnce(true)
    } catch (e) {
      console.error('Salary Up To Date load failed:', e)
      setError(formatUserError(e, 'Unable to load salary up to date data. Please retry.'))
      setRows([])
      setCalcStats(null)
    } finally {
      setBusy(false)
    }
  }, [asOfDate, fromDate, activeWorkers, salaryRates, roles, payrollRates])

  useEffect(() => {
    if (!workers.length) return
    void load()
  }, [load, workers.length])

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

  const totals = useMemo(() => {
    const t = { earned: 0, advance: 0, paid: 0, balance: 0 }
    for (const r of visible) {
      t.earned += r.earnedSalary
      t.advance += r.advancePaid
      t.paid += r.paidAmount
      t.balance += r.balanceSalary
    }
    return t
  }, [visible])

  function exportCsv() {
    const headers = ['Code', 'Name', 'Earned', 'Advance', 'Paid', 'Balance']
    const lines = visible.map((r) => [
      r.worker.employee_code || '',
      r.worker.full_name,
      r.earnedSalary,
      r.advancePaid,
      r.paidAmount,
      r.balanceSalary,
    ])
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [headers.join(','), ...lines.map((r) => r.map(esc).join(','))].join('\n')
    downloadTextFile(`salary-up-to-${asOfDate}.csv`, csv)
  }

  function printTable() {
    printReport(
      `Salary Up To Date · ${asOfDate}`,
      ['Code', 'Name', 'Earned', 'Advance', 'Paid', 'Balance'],
      visible.map((r) => [
        r.worker.employee_code || '',
        r.worker.full_name,
        formatINRExact(r.earnedSalary),
        formatINRExact(r.advancePaid),
        formatINRExact(r.paidAmount),
        formatINRExact(r.balanceSalary),
      ]),
    )
  }

  return (
    <div className="form-stack">
      <h2 className="section-title">Salary Up To Date</h2>
      <p className="text-muted">
        Current salary status for every employee based on attendance entered up to the selected date (month-to-date).
      </p>

      {error ? (
        <p className="form-error text-danger">
          {error}{' '}
          <button type="button" className="btn-ghost" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}

      {calcStats && calcStats.eligible > calcStats.calculated ? (
        <p className="form-error text-danger">
          Calculation incomplete: {calcStats.calculated} of {calcStats.eligible} employees calculated.{' '}
          {calcStats.eligible - calcStats.calculated} could not be processed — check console for details.
        </p>
      ) : null}

      {loadedOnce && calcStats && calcStats.eligible === calcStats.calculated && calcStats.eligible > 0 ? (
        <p className="text-muted">
          Complete: {calcStats.calculated} of {calcStats.eligible} eligible employees calculated.
        </p>
      ) : null}

      <div className="hr-toolbar">
        <label className="field">
          <span className="text-muted">As of Date</span>
          <input type="date" value={asOfDate} max={todayISO()} onChange={(e) => setAsOfDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Employee…" />
        </label>
        <button type="button" className="primary-save" disabled={busy} onClick={() => void load()}>
          {busy ? 'Calculating…' : 'Calculate'}
        </button>
        <button type="button" className="btn-ghost" disabled={!visible.length} onClick={printTable}>
          Print
        </button>
        <button type="button" className="btn-ghost" disabled={!visible.length} onClick={exportCsv}>
          CSV
        </button>
      </div>

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
      </div>

      <div className="hr-table-wrap hr-force-table">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Employee</th>
              <th>Designation</th>
              <th>Dept</th>
              <th>Rate</th>
              <th>Attendance Days</th>
              <th>Earned</th>
              <th>Advance</th>
              <th>Other Ded.</th>
              <th>Net Payable</th>
              <th>Paid</th>
              <th>Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {busy && !visible.length ? (
              <tr>
                <td colSpan={13} className="text-muted">
                  Calculating salary up to {asOfDate}…
                </td>
              </tr>
            ) : null}
            {!busy && loadedOnce && visible.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-muted">
                  {activeWorkers.length === 0
                    ? 'No active employees — add employees in Employee Master first.'
                    : 'No rows match the current search.'}
                </td>
              </tr>
            ) : null}
            {visible.map((r) => (
              <tr key={r.worker.id}>
                <td className="num">{r.worker.employee_code || '—'}</td>
                <td>{r.worker.full_name}</td>
                <td>{r.worker.designation || '—'}</td>
                <td>{r.worker.department || '—'}</td>
                <td>{r.salaryRateLabel}</td>
                <td className="num">{r.summary.paidDays}</td>
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
