import { useCallback, useEffect, useMemo, useState } from 'react'
import { SampleJobCardPrint } from '../components/SampleJobCardPrint'
import {
  colourSwatchHex,
  fetchSampleRegister,
  markSampleDone,
  type IssuedCardData,
} from '../lib/sampleJobCard'

type Filter = 'all' | 'pending' | 'done'

type RegisterRow = {
  id: string
  din_number: string
  design_image_url: string | null
  job_date: string
  machine_no: string | null
  work_quality: string | null
  status: string
  done_date: string | null
  sample_matchings?: Array<{
    id: string
    matching_no: number
    sample_matching_colours?: Array<{
      id: string
      colour_name: string
      colour_number: string
      sort_order: number | null
    }>
  }>
}

function toIssued(row: RegisterRow): IssuedCardData {
  const matchings = [...(row.sample_matchings ?? [])]
    .sort((a, b) => a.matching_no - b.matching_no)
    .map((m) => ({
      matching_no: m.matching_no,
      colours: [...(m.sample_matching_colours ?? [])]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((c) => ({ colour_name: c.colour_name, colour_number: c.colour_number })),
    }))
  return {
    id: row.id,
    din_number: row.din_number,
    design_image_url: row.design_image_url,
    job_date: row.job_date,
    machine_no: row.machine_no || '',
    work_quality: row.work_quality || '',
    status: row.status,
    done_date: row.done_date,
    matchings,
  }
}

export function SampleRegister() {
  const [rows, setRows] = useState<RegisterRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [viewCard, setViewCard] = useState<IssuedCardData | null>(null)

  const load = useCallback(async () => {
    const data = (await fetchSampleRegister()) as RegisterRow[]
    setRows(data)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const stats = useMemo(() => {
    const total = rows.length
    const pending = rows.filter((r) => r.status === 'pending').length
    const done = rows.filter((r) => r.status === 'done').length
    const matchings = rows.reduce((s, r) => s + (r.sample_matchings?.length ?? 0), 0)
    return { total, pending, done, matchings }
  }, [rows])

  async function onMarkDone(id: string) {
    setBusyId(id)
    setError(null)
    setMessage(null)
    try {
      const doneDate = await markSampleDone(id)
      setMessage(`Marked done · ${doneDate}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="screen sample-register-screen">
      <header className="screen-header no-print">
        <h1>Sample Register (Archive)</h1>
        <p className="text-muted">Archive / report · live DESI workflow is Sample Tracking</p>
      </header>

      <div className="no-print sample-stats">
        <article className="surface sample-stat">
          <span className="text-muted">Total DESI Issued</span>
          <strong className="num text-weft">{stats.total}</strong>
        </article>
        <article className="surface sample-stat">
          <span className="text-muted">Pending Samples</span>
          <strong className="num">{stats.pending}</strong>
        </article>
        <article className="surface sample-stat">
          <span className="text-muted">Completed</span>
          <strong className="num text-sage">{stats.done}</strong>
        </article>
        <article className="surface sample-stat">
          <span className="text-muted">Total Matchings</span>
          <strong className="num text-warp">{stats.matchings}</strong>
        </article>
      </div>

      <div className="no-print sample-filter-chips">
        {(['all', 'pending', 'done'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'sample-chip active' : 'sample-chip'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'pending' ? 'Pending' : 'Done'}
          </button>
        ))}
      </div>

      <div className="no-print dash-table-wrap surface">
        <table className="dash-table sample-register-table">
          <thead>
            <tr>
              <th>DESI No.</th>
              <th>Date</th>
              <th>Machine</th>
              <th>Work/Quality</th>
              <th className="num">Matchings</th>
              <th>Colours</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const colours =
                r.sample_matchings?.flatMap((m) => m.sample_matching_colours ?? []) ?? []
              return (
                <tr key={r.id}>
                  <td>
                    <div className="sample-din-cell">
                      {r.design_image_url ? (
                        <img src={r.design_image_url} alt="" className="sample-table-thumb" />
                      ) : (
                        <span className="sample-table-thumb empty" />
                      )}
                      <strong>{r.din_number}</strong>
                    </div>
                  </td>
                  <td>{r.job_date}</td>
                  <td>{r.machine_no || '—'}</td>
                  <td>{r.work_quality || '—'}</td>
                  <td className="num">{r.sample_matchings?.length ?? 0}</td>
                  <td>
                    <span className="sample-swatch-row">
                      {colours.slice(0, 12).map((c) => (
                        <span
                          key={c.id}
                          className="sample-swatch"
                          style={{ background: colourSwatchHex(c.colour_name) }}
                          title={`${c.colour_name} ${c.colour_number}`}
                        />
                      ))}
                      {!colours.length ? <span className="text-muted">—</span> : null}
                    </span>
                  </td>
                  <td>
                    {r.status === 'done' ? (
                      <span className="sample-status done">Done · {r.done_date || '—'}</span>
                    ) : (
                      <span className="sample-status pending">Pending</span>
                    )}
                  </td>
                  <td>
                    <div className="sample-row-actions">
                      <button type="button" className="btn-warp" onClick={() => setViewCard(toIssued(r))}>
                        View
                      </button>
                      {r.status === 'pending' ? (
                        <button
                          type="button"
                          className="primary-save"
                          disabled={busyId === r.id}
                          onClick={() => void onMarkDone(r.id)}
                        >
                          Mark Done
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length ? (
              <tr>
                <td colSpan={8} className="text-muted">
                  No sample job cards
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {error ? <p className="form-error text-danger no-print">{error}</p> : null}
      {message ? <p className="form-ok text-sage no-print">{message}</p> : null}

      {viewCard ? (
        <div className="sample-modal" role="dialog" aria-modal="true">
          <div className="sample-modal-backdrop no-print" onClick={() => setViewCard(null)} />
          <div className="sample-modal-panel">
            <div className="sample-modal-toolbar no-print">
              <strong>{viewCard.din_number}</strong>
              <button type="button" className="btn-warp" onClick={() => window.print()}>
                Print
              </button>
              <button type="button" className="sample-icon-btn" onClick={() => setViewCard(null)}>
                ✕
              </button>
            </div>
            <SampleJobCardPrint card={viewCard} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
