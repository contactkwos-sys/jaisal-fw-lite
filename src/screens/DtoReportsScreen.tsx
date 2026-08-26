import { useCallback, useEffect, useState } from 'react'
import { DtoStatusPill, ImageLightbox } from '../components/ImageLightbox'
import { fetchDins, fetchDtoStats, fmtInrIn, type DinWithMatchings } from '../lib/designToOrder'
import { finalPerMeterColumnLabel } from '../lib/designWiseCosting'
import type { NavTarget } from '../lib/nav'

type Props = { onNavigate: (t: NavTarget) => void }

export function DtoReportsScreen({ onNavigate }: Props) {
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [stats, setStats] = useState({
    activeDins: 0,
    sampleUnderDev: 0,
    approvedMatches: 0,
    pendingOrders: 0,
    totalOrderValue: 0,
    dispatchedMt: 0,
  })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [list, s] = await Promise.all([fetchDins(300), fetchDtoStats()])
    setDins(list)
    setStats(s)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const byStatus = dins.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>Design Reports</h1>
          <p className="text-muted">Design Master pipeline — DIN → Costing → Sample.</p>
        </div>
        <button
          type="button"
          className="btn-warp"
          onClick={() => onNavigate({ screen: 'design-wise-costing', module: 'design-to-order' })}
        >
          Open Design-wise Costing
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="dto-kpi-row">
        {(
          [
            ['Active DINs', stats.activeDins],
            ['Sampling', stats.sampleUnderDev],
            ['Approved Matches', stats.approvedMatches],
            ['Pending Order Lines', stats.pendingOrders],
            ['Order Value', fmtInrIn(stats.totalOrderValue)],
            ['Dispatched m', Math.round(stats.dispatchedMt)],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="dto-kpi surface">
            <span className="text-muted">{label}</span>
            <strong className="num">{value}</strong>
          </div>
        ))}
      </section>

      <div className="dto-main-grid">
        <section className="surface dto-panel">
          <h2 className="section-title">By status</h2>
          <ul className="dto-timeline">
            {Object.entries(byStatus).map(([status, count]) => (
              <li key={status}>
                <DtoStatusPill status={status} /> · {count}
              </li>
            ))}
          </ul>
        </section>

        <section className="surface dto-panel">
          <h2 className="section-title">Costing completed</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>DIN</th>
                  <th>Design</th>
                  <th>Base</th>
                  <th>GST</th>
                  <th>{finalPerMeterColumnLabel()}</th>
                </tr>
              </thead>
              <tbody>
                {dins
                  .filter((d) => d.costing_status === 'Completed' || d.final_cost_per_mtr != null)
                  .slice(0, 40)
                  .map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="dto-din-cell">
                          <ImageLightbox src={d.din_image_url} alt={d.din_number} thumbClassName="dto-thumb-sm" />
                          {d.din_number}
                        </div>
                      </td>
                      <td>{d.design_name || '—'}</td>
                      <td className="num">{fmtInrIn(d.base_cost_per_mtr)}</td>
                      <td className="num">
                        {d.gst_percent ?? '—'}% ({fmtInrIn(d.gst_amount)})
                      </td>
                      <td className="num">{fmtInrIn(d.final_cost_per_mtr)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
