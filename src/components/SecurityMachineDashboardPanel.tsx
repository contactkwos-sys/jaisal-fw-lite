/**
 * CEO Dashboard panel — Security Machine & Production sync (read-only analytics).
 * Security mobile screen does NOT show these reports.
 */
import { useCallback, useEffect, useState } from 'react'
import { todayISO } from '../lib/mutate'
import {
  formatDisplayDate,
  loadSecurityDashboard,
  type SecurityDashboardSummary,
} from '../lib/securityMachineProduction'

export function SecurityMachineDashboardPanel() {
  const [date, setDate] = useState(todayISO())
  const [data, setData] = useState<SecurityDashboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setData(await loadSecurityDashboard(date))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load security production')
    } finally {
      setBusy(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  const s = data

  return (
    <section className="dash-panel smp-dash">
      <div className="smp-dash-head" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          Security Machine &amp; Production
        </h2>
        <label className="smp-dash-date" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontWeight: 700 }}>
          <span className="text-muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="text-muted" style={{ margin: 0 }}>
        Auto-updated from Security mobile screen · {formatDisplayDate(date)}
        {busy ? ' · Loading…' : ''}
      </p>
      {error ? <p className="smp-banner smp-banner-error">{error}</p> : null}

      <div className="smp-dash-kpis">
        <div className="smp-dash-kpi">
          <span>Day Shift</span>
          <strong>{(s?.day_total ?? 0).toLocaleString('en-IN')} Mtr</strong>
        </div>
        <div className="smp-dash-kpi">
          <span>Night Shift</span>
          <strong>{(s?.night_total ?? 0).toLocaleString('en-IN')} Mtr</strong>
        </div>
        <div className="smp-dash-kpi">
          <span>Daily Total</span>
          <strong>{(s?.daily_total ?? 0).toLocaleString('en-IN')} Mtr</strong>
        </div>
        <div className="smp-dash-kpi">
          <span>Running</span>
          <strong>
            {s?.running ?? 0} / 6
          </strong>
        </div>
        <div className={`smp-dash-kpi ${(s?.stopped ?? 0) > 0 ? 'is-danger' : ''}`}>
          <span>Stopped</span>
          <strong>{s?.stopped ?? 0}</strong>
        </div>
      </div>

      <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 0 }}>
        Machine Wise Summary
      </h3>
      <div className="smp-dash-table-wrap">
        <table className="smp-dash-table">
          <thead>
            <tr>
              <th>Machine</th>
              <th>Status</th>
              <th>Day (Mtr)</th>
              <th>Night (Mtr)</th>
              <th>Total</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {(s?.machines || []).map((m) => (
              <tr key={m.machine_no}>
                <td>
                  <strong>{m.machine_no}</strong>
                </td>
                <td>
                  <span className={`smp-status-pill ${m.status === 'Running' ? 'running' : 'stopped'}`}>
                    {m.status}
                  </span>
                </td>
                <td>{m.day_production.toLocaleString('en-IN')}</td>
                <td>{m.night_production.toLocaleString('en-IN')}</td>
                <td>
                  <strong>{m.total.toLocaleString('en-IN')}</strong>
                </td>
                <td>{m.stop_reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 0 }}>
        Operator Performance (Today)
      </h3>
      <div className="smp-dash-table-wrap">
        <table className="smp-dash-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Machines</th>
              <th>Day</th>
              <th>Night</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {(s?.operators || []).length === 0 ? (
              <tr>
                <td colSpan={5} className="text-muted">
                  No operator production yet
                </td>
              </tr>
            ) : (
              (s?.operators || []).map((o) => (
                <tr key={o.operator_name}>
                  <td>
                    <strong>{o.operator_name}</strong>
                  </td>
                  <td>{o.machines.join(', ')}</td>
                  <td>{o.day_production.toLocaleString('en-IN')}</td>
                  <td>{o.night_production.toLocaleString('en-IN')}</td>
                  <td>
                    <strong>{o.total.toLocaleString('en-IN')}</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 0 }}>
        Cumulative Machine Production
      </h3>
      <div className="smp-dash-table-wrap">
        <table className="smp-dash-table">
          <thead>
            <tr>
              <th>Machine</th>
              <th>Cumulative (Mtr)</th>
            </tr>
          </thead>
          <tbody>
            {(s?.cumulative_by_machine || []).map((m) => (
              <tr key={m.machine_no}>
                <td>
                  <strong>{m.machine_no}</strong>
                </td>
                <td>{m.total.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: 0 }}>
        Operator Performance (All Time)
      </h3>
      <div className="smp-dash-table-wrap">
        <table className="smp-dash-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Shifts</th>
              <th>Total (Mtr)</th>
            </tr>
          </thead>
          <tbody>
            {(s?.operator_performance || []).length === 0 ? (
              <tr>
                <td colSpan={3} className="text-muted">
                  No history yet
                </td>
              </tr>
            ) : (
              (s?.operator_performance || []).map((o) => (
                <tr key={o.operator_name}>
                  <td>
                    <strong>{o.operator_name}</strong>
                  </td>
                  <td>{o.shifts}</td>
                  <td>
                    <strong>{o.total.toLocaleString('en-IN')}</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
