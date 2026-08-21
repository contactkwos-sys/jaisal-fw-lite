import { useCallback, useEffect, useState } from 'react'
import {
  fmtMeter,
  loadMachinePrograms,
  loadTrackingTotals,
  type MachineProgramRow,
  type TrackingTotals,
} from '../../lib/programDispatch'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type Props = { onGo: (s: PdSub) => void }

export function PdTracking({ onGo }: Props) {
  const [totals, setTotals] = useState<TrackingTotals | null>(null)
  const [machines, setMachines] = useState<MachineProgramRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [t, m] = await Promise.all([loadTrackingTotals(), loadMachinePrograms()])
    setTotals(t)
    setMachines(m)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Production Tracking</h1>
        <p className="pd-lead">Live order → program → produce → check → dispatch meters.</p>
        <button type="button" className="btn-sm" onClick={() => onGo('pto')}>
          Back to Program
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      {totals ? (
        <>
          <div className="pd-kpi-row">
            <div className="pd-kpi pd-kpi-blue">
              <span>Order Meter</span>
              <strong>{fmtMeter(totals.orderMeter)}</strong>
            </div>
            <div className="pd-kpi pd-kpi-slate">
              <span>Programmed</span>
              <strong>{fmtMeter(totals.programmedMeter)}</strong>
            </div>
            <div className="pd-kpi pd-kpi-green">
              <span>Produced</span>
              <strong>{fmtMeter(totals.producedMeter)}</strong>
            </div>
            <div className="pd-kpi pd-kpi-purple">
              <span>Checked</span>
              <strong>{fmtMeter(totals.checkedMeter)}</strong>
            </div>
            <div className="pd-kpi pd-kpi-teal">
              <span>Dispatched</span>
              <strong>{fmtMeter(totals.dispatchedMeter)}</strong>
            </div>
            <div className="pd-kpi pd-kpi-orange">
              <span>Pending</span>
              <strong>{fmtMeter(totals.pendingMeter)}</strong>
            </div>
          </div>
          <div className="pd-progress-track pd-progress-lg">
            <div className="pd-progress-fill" style={{ width: `${totals.progressPct}%` }} />
            <span>{totals.progressPct.toFixed(1)}% dispatched</span>
          </div>
        </>
      ) : null}

      <section className="pd-panel">
        <header className="pd-panel-h">
          <h2>Machine-wise Active Programs</h2>
        </header>
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Program No.</th>
                <th>Design</th>
                <th>Colour</th>
                <th>Party</th>
                <th>Marka</th>
                <th>Total Pick</th>
                <th>Total Meter</th>
                <th>Produced</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((p) => (
                <tr key={p.id}>
                  <td>{p.machine_no}</td>
                  <td className="num">{p.program_no}</td>
                  <td>{p.design_no}</td>
                  <td>{p.colour}</td>
                  <td>{p.party_name}</td>
                  <td>{p.marka}</td>
                  <td className="num">{p.total_pick || '—'}</td>
                  <td className="num">{fmtMeter(p.total_meter)}</td>
                  <td className="num">{fmtMeter(p.produced)}</td>
                  <td className="num">{fmtMeter(p.balance)}</td>
                  <td>
                    <span className="pd-pill ok">{p.status}</span>
                  </td>
                </tr>
              ))}
              {!machines.length ? (
                <tr>
                  <td colSpan={11} className="text-muted">
                    No active programs
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
