import { useCallback, useEffect, useMemo, useState } from 'react'
import { DtoEmpty, DtoQuickNav, DtoStatusPill, ImageLightbox } from '../components/ImageLightbox'
import { RecordActions } from '../components/RecordActions'
import { useAuth } from '../lib/auth'
import {
  deleteDin,
  fetchDinById,
  fetchDins,
  fetchDtoStats,
  fmtInrIn,
  type DinWithMatchings,
} from '../lib/designToOrder'
import { perMeterCostSuffix } from '../lib/designWiseCosting'
import type { NavTarget } from '../lib/nav'
import { canEditDesignMaster } from '../lib/permissions'
import { applyEditDeleteOrQueue, isWithinEditWindow } from '../lib/pendingApprovals'
import { confirmDeleteRecord } from '../lib/recordCrud'

type Props = { onNavigate: (t: NavTarget) => void }

/**
 * DESIGN MASTER — Design / Technical team & management only.
 * Sales/Production (Customer Order → Program) lives in Order to Program module.
 */
export function DesignToOrderHub({ onNavigate }: Props) {
  const { isCeo, profile, roleName } = useAuth()
  const canMutate = canEditDesignMaster(roleName || '')
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<DinWithMatchings | null>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'matchings' | 'job' | 'timeline'>('matchings')
  const [stats, setStats] = useState({
    activeDins: 0,
    sampleUnderDev: 0,
    approvedMatches: 0,
    pendingOrders: 0,
    totalOrderValue: 0,
    dispatchedMt: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [list, s] = await Promise.all([fetchDins(80), fetchDtoStats()])
    setDins(list)
    setStats(s)
    if (!selectedId && list[0]) setSelectedId(list[0].id)
  }, [selectedId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void fetchDinById(selectedId)
      .then(setDetail)
      .catch((e: Error) => setError(e.message))
  }, [selectedId])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return dins
    return dins.filter((d) =>
      [d.din_number, d.design_name, d.party_name, d.common_warp, d.status]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(needle)),
    )
  }, [dins, q])

  const matchings = detail?.din_matchings?.slice().sort((a, b) => a.matching_no - b.matching_no) || []

  function openCosting(dinNumber: string) {
    onNavigate({
      screen: 'design-wise-costing',
      filter: dinNumber,
      module: 'design-to-order',
    })
  }

  async function handleDeleteDin(row: DinWithMatchings) {
    if (!canMutate) {
      setError('You do not have permission to delete DINs')
      return
    }
    const within =
      isCeo || !row.created_at || isWithinEditWindow(row.created_at)
    const ok = confirmDeleteRecord({
      message: within
        ? 'Delete this DIN? This cannot be undone'
        : 'Delete this DIN? This cannot be undone. This record is older than 7 days — delete will go to CEO for approval.',
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at || new Date().toISOString(),
        tableName: 'dins',
        recordId: row.id,
        action: 'delete',
        requestedBy: profile?.id || 'unknown',
        apply: async () => {
          await deleteDin(row.id)
        },
      })
      if (result === 'applied') {
        setDins((prev) => prev.filter((d) => d.id !== row.id))
        if (selectedId === row.id) {
          setSelectedId(null)
          setDetail(null)
        }
        setMessage(`DIN ${row.din_number} deleted`)
      } else {
        setMessage('Delete sent for CEO approval — not deleted until CEO approves')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const quickDesign = [
    {
      id: 'costing',
      label: 'DIN / Design Costing',
      onClick: () =>
        onNavigate({
          screen: 'design-wise-costing',
          filter: detail?.din_number,
          module: 'design-to-order',
        }),
    },
    {
      id: 'formula',
      label: 'Formula Master',
      onClick: () => onNavigate({ screen: 'formula-master', module: 'design-to-order' }),
    },
    {
      id: 'rate-master',
      label: 'Rate Master',
      onClick: () => onNavigate({ screen: 'rate-master', module: 'design-to-order' }),
    },
    {
      id: 'sample',
      label: 'Sample Job Card',
      onClick: () => onNavigate({ screen: 'dto-sample-job', filter: detail?.id, module: 'design-to-order' }),
    },
    {
      id: 'track',
      label: 'Sample Tracking',
      onClick: () => onNavigate({ screen: 'dto-tracking', filter: detail?.id, module: 'design-to-order' }),
    },
    {
      id: 'promo',
      label: 'Sample Promotion',
      onClick: () => onNavigate({ screen: 'dto-promotion', filter: detail?.id, module: 'design-to-order' }),
    },
    {
      id: 'reports',
      label: 'Design Reports',
      onClick: () => onNavigate({ screen: 'dto-reports', module: 'design-to-order' }),
    },
  ]

  return (
    <div className="screen dto-screen">
      <header className="screen-header dto-header">
        <div>
          <h1>Design Master</h1>
          <p className="text-muted">
            Design / Technical module — DIN Costing · Formula · Rate · Sample · Reports
          </p>
        </div>
        <div className="dto-header-actions">
          <button
            type="button"
            className="primary-save"
            onClick={() => onNavigate({ screen: 'design-wise-costing', module: 'design-to-order' })}
          >
            Create DIN Costing
          </button>
        </div>
      </header>

      <div className="dto-nav-sections">
        <div className="dto-nav-section">
          <h3>Design Module</h3>
          <DtoQuickNav items={quickDesign} />
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      <section className="dto-kpi-row">
        {(
          [
            ['Active DINs', stats.activeDins],
            ['Sample Under Dev', stats.sampleUnderDev],
            ['Approved Matches', stats.approvedMatches],
            ['Costing Done', dins.filter((d) => /costing done|approved/i.test(d.status)).length],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="dto-kpi surface">
            <span className="text-muted">{label}</span>
            <strong className="num">{value}</strong>
          </div>
        ))}
      </section>

      <div className="dto-main-grid dto-main-grid-single">
        <section className="surface dto-table-panel">
          <div className="dto-panel-head">
            <h2 className="section-title">Recent DINs</h2>
            <input
              className="dto-search"
              placeholder="Search DIN / party / design…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <DtoEmpty>No DESIGN records yet. Start with DIN Costing.</DtoEmpty>
          ) : (
            <div className="table-wrap">
              <table className="data-table dto-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>DESIGN No.</th>
                    <th>Design</th>
                    <th>Party</th>
                    <th>Warp</th>
                    <th>Matchings</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr
                      key={d.id}
                      className={selectedId === d.id ? 'is-selected' : undefined}
                      onClick={() => setSelectedId(d.id)}
                    >
                      <td>{d.received_date}</td>
                      <td>
                        <div className="dto-din-cell">
                          <ImageLightbox src={d.din_image_url} alt={d.din_number} thumbClassName="dto-thumb-sm" />
                          <strong>{d.din_number}</strong>
                        </div>
                      </td>
                      <td>{d.design_name || '—'}</td>
                      <td>{d.party_name || '—'}</td>
                      <td>{d.common_warp || '—'}</td>
                      <td className="num">{d.matching_count}</td>
                      <td>
                        <DtoStatusPill status={d.status} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <RecordActions
                          busy={busy}
                          canView
                          canEdit={canMutate}
                          canDelete={canMutate}
                          onView={() => setSelectedId(d.id)}
                          onEdit={() => openCosting(d.din_number)}
                          onDelete={() => void handleDeleteDin(d)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {detail ? (
        <section className="surface dto-detail">
          <div className="dto-detail-head">
            <div className="dto-detail-visual">
              <ImageLightbox src={detail.din_image_url} alt={detail.design_name || detail.din_number} thumbClassName="dto-thumb-lg" />
              <div>
                <h2>{detail.design_name || detail.din_number}</h2>
                <p className="text-muted">
                  {detail.din_number} · {detail.received_date} · <DtoStatusPill status={detail.status} />
                </p>
                <p className="dto-cost-line">
                  Costing:{' '}
                  <strong>
                    {detail.final_cost_per_mtr != null
                      ? `${fmtInrIn(detail.final_cost_per_mtr)} ${perMeterCostSuffix(detail.gst_percent)}`
                      : detail.costing_status}
                  </strong>
                </p>
                {detail.base_cost_per_mtr != null ? (
                  <p className="text-muted dto-cost-split">
                    Base {fmtInrIn(detail.base_cost_per_mtr)} · GST {detail.gst_percent ?? 0}% (
                    {fmtInrIn(detail.gst_amount)}) · Final {fmtInrIn(detail.final_cost_per_mtr)}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="dto-detail-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => openCosting(detail.din_number)}
              >
                View Costing
              </button>
              {canMutate ? (
                <button
                  type="button"
                  className="btn-warp"
                  onClick={() => openCosting(detail.din_number)}
                >
                  Edit Costing
                </button>
              ) : null}
              {canMutate ? (
                <button
                  type="button"
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => void handleDeleteDin(detail)}
                >
                  Delete DIN
                </button>
              ) : null}
              <button
                type="button"
                className="primary-save"
                onClick={() =>
                  onNavigate({ screen: 'dto-sample-job', filter: detail.id, module: 'design-to-order' })
                }
              >
                Sample Job Card
              </button>
            </div>
          </div>

          <div className="dto-tabs">
            {(
              [
                ['matchings', 'Matchings'],
                ['job', 'Sample Job'],
                ['timeline', 'Timeline'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? 'is-active' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'matchings' ? (
            matchings.length === 0 ? (
              <DtoEmpty>No matchings yet. Add them from Sample Job Card or Sample Tracking.</DtoEmpty>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Ground</th>
                      <th>Weft 1</th>
                      <th>Weft 2</th>
                      <th>Weft 3</th>
                      <th>Status</th>
                      <th>Photo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchings.map((m) => (
                      <tr key={m.id}>
                        <td>{m.matching_no}</td>
                        <td>{m.ground_colour || '—'}</td>
                        <td>{m.weft_1 || '—'}</td>
                        <td>{m.weft_2 || '—'}</td>
                        <td>{m.weft_3 || '—'}</td>
                        <td>
                          <DtoStatusPill status={m.status} />
                        </td>
                        <td>
                          <ImageLightbox
                            src={m.approved_photo_url || m.sample_photo_url}
                            alt={`Matching ${m.matching_no}`}
                            thumbClassName="dto-thumb-sm"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          {tab === 'job' ? (
            <p className="text-muted">
              Open{' '}
              <button
                type="button"
                className="link-btn"
                onClick={() => onNavigate({ screen: 'dto-sample-job', filter: detail.id, module: 'design-to-order' })}
              >
                Sample Job Card
              </button>{' '}
              to issue cards for this DIN. Customer orders are booked in Order to Program (linked by DIN).
            </p>
          ) : null}

          {tab === 'timeline' ? (
            <ul className="dto-timeline">
              <li>
                Received {detail.received_date} · source {detail.source}
              </li>
              <li>
                Costing {detail.costing_status}
                {detail.costing_date ? ` · ${detail.costing_date}` : ''}
              </li>
              <li>Status · {detail.status}</li>
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
