/**
 * CEO Dashboard panel — Security Machine & Production daily summary.
 * Auto-updated from Security Mobile submissions.
 */
import { useCallback, useEffect, useState } from 'react'
import { todayISO } from '../lib/mutate'
import {
  formatDisplayDate,
  fmtMtr,
  loadSecurityDashboardSummary,
  type SecurityDashboardSummary,
} from '../lib/securityMachineUpdate'

export function SecurityMachineDashboardPanel() {
  const [summary, setSummary] = useState<SecurityDashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const data = await loadSecurityDashboardSummary(todayISO())
      setSummary(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load security summary')
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(t)
  }, [load])

  if (!summary) {
    return (
      <section className="smu-dash">
        <div className="smu-dash-head">
          <h2 className="section-title">Security Machine Update</h2>
        </div>
        <p className="text-muted">{error || 'Loading…'}</p>
      </section>
    )
  }

  const updated = summary.last_updated
    ? new Date(summary.last_updated).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '—'

  return (
    <section className="smu-dash">
      <div className="smu-dash-head">
        <h2 className="section-title">
          Dashboard (Auto Updated) · {formatDisplayDate(summary.entry_date)}
        </h2>
        <span className="text-muted">Last updated {updated}</span>
      </div>

      <div className="smu-dash-kpis">
        <div className="smu-dash-kpi">
          <span>Day Shift Production</span>
          <strong>{fmtMtr(summary.day_total)} Mtr</strong>
        </div>
        <div className="smu-dash-kpi">
          <span>Night Shift Production</span>
          <strong>{fmtMtr(summary.night_total)} Mtr</strong>
        </div>
        <div className="smu-dash-kpi">
          <span>Total (Today)</span>
          <strong>{fmtMtr(summary.daily_total)} Mtr</strong>
        </div>
        <div className="smu-dash-kpi">
          <span>Machine Status</span>
          <strong>
            Running {summary.running_count}/6
            {summary.stopped_count > 0 ? (
              <>
                {' '}
                · <span className="danger">Stopped {summary.stopped_count}</span>
              </>
            ) : null}
          </strong>
        </div>
      </div>

      <div className="smu-dash-table-wrap">
        <table className="smu-dash-table">
          <thead>
            <tr>
              <th>Machine</th>
              <th>Status</th>
              <th>Day (Mtr)</th>
              <th>Night (Mtr)</th>
              <th>Total</th>
              <th>Operator</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {summary.machines.map((m) => (
              <tr key={m.machine_no}>
                <td>
                  <strong>{m.machine_no}</strong>
                </td>
                <td>
                  <span className={`smu-dash-pill ${m.status === 'running' ? 'run' : 'stop'}`}>
                    {m.status === 'running' ? 'Running' : 'Stopped'}
                  </span>
                </td>
                <td className="num">{fmtMtr(m.day_mtr)}</td>
                <td className="num">{fmtMtr(m.night_mtr)}</td>
                <td className="num">
                  <strong>{fmtMtr(m.total_mtr)}</strong>
                </td>
                <td>
                  {[m.day_operator, m.night_operator].filter(Boolean).join(' / ') || '—'}
                </td>
                <td>{m.stop_reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.operators.length > 0 ? (
        <div className="smu-dash-table-wrap">
          <table className="smu-dash-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Machines</th>
                <th>Day (Mtr)</th>
                <th>Night (Mtr)</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.operators.map((op) => (
                <tr key={op.operator_name}>
                  <td>
                    <strong>{op.operator_name}</strong>
                  </td>
                  <td>{op.machines.join(', ')}</td>
                  <td className="num">{fmtMtr(op.day_mtr)}</td>
                  <td className="num">{fmtMtr(op.night_mtr)}</td>
                  <td className="num">
                    <strong>{fmtMtr(op.total_mtr)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="smu-dash-note">
        All reports sent by Security auto-update this dashboard in real time.
      </p>
      {error ? <p className="text-danger">{error}</p> : null}
    </section>
  )
}
