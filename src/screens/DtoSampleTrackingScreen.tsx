import { useCallback, useEffect, useMemo, useState } from 'react'
import { DtoStatusPill, ImageLightbox } from '../components/ImageLightbox'
import {
  fetchDinById,
  fetchDins,
  matchingColourLabel,
  updateDin,
  updateMatching,
  uploadDinImage,
  type DinMatching,
  type DinWithMatchings,
} from '../lib/designToOrder'
import { todayISO } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'

type Props = { onNavigate: (t: NavTarget) => void; initialDinId?: string }

export function DtoSampleTrackingScreen({ onNavigate, initialDinId }: Props) {
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [dinId, setDinId] = useState(initialDinId || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [receivedBy, setReceivedBy] = useState('')
  const [actualMeter, setActualMeter] = useState('')
  const [remarks, setRemarks] = useState('')

  const load = useCallback(async () => {
    const list = await fetchDins(200)
    setDins(list)
    setDinId((prev) => prev || initialDinId || list[0]?.id || '')
  }, [initialDinId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const din = useMemo(() => dins.find((d) => d.id === dinId) || null, [dins, dinId])
  const matchings = useMemo(
    () => din?.din_matchings?.slice().sort((a, b) => a.matching_no - b.matching_no) || [],
    [din],
  )

  async function refreshDin() {
    if (!dinId) return
    const full = await fetchDinById(dinId)
    if (full) setDins((prev) => prev.map((d) => (d.id === dinId ? full : d)))
  }

  async function markProduced(m: DinMatching) {
    setBusy(true)
    setError(null)
    try {
      await updateMatching(m.id, {
        status: 'Sample Produced',
        sample_produced_at: new Date().toISOString(),
      })
      if (din) await updateDin(din.id, { status: 'Sampling' })
      setMessage(`Matching ${m.matching_no} marked Sample Produced`)
      await refreshDin()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveReceived(m: DinMatching) {
    setBusy(true)
    setError(null)
    try {
      await updateMatching(m.id, {
        status: 'Sample Received',
        sample_received_date: receivedDate,
        sample_received_by: receivedBy || null,
        actual_meter: actualMeter ? Number(actualMeter) : null,
        remarks: remarks || m.remarks,
      })
      if (din) await updateDin(din.id, { status: 'Sample Received' })
      setMessage(`Matching ${m.matching_no} sample received`)
      setEditId(null)
      await refreshDin()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function uploadPhoto(m: DinMatching, file: File | null, kind: 'sample' | 'approved') {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const url = await uploadDinImage(file)
      await updateMatching(m.id, kind === 'sample' ? { sample_photo_url: url } : { approved_photo_url: url })
      setMessage('Photo uploaded')
      await refreshDin()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function setDecision(m: DinMatching, status: 'Approved' | 'Rejected') {
    setBusy(true)
    setError(null)
    try {
      await updateMatching(m.id, { status })
      if (din && status === 'Approved') await updateDin(din.id, { status: 'Approved' })
      setMessage(`Matching ${m.matching_no} ${status}`)
      await refreshDin()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>Sample Tracking</h1>
          <p className="text-muted">Mark produced · receive sample · approve / reject matching with photos.</p>
        </div>
        <button
          type="button"
          className="btn-warp"
          onClick={() => onNavigate({ screen: 'dto-promotion', filter: dinId, module: 'design-to-order' })}
        >
          Sample Promotion
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="surface dto-panel">
        <label className="field">
          <span>DIN</span>
          <select value={dinId} onChange={(e) => setDinId(e.target.value)}>
            <option value="">Select…</option>
            {dins.map((d) => (
              <option key={d.id} value={d.id}>
                {d.din_number} · {d.design_name || '—'}
              </option>
            ))}
          </select>
        </label>

        {din ? (
          <div className="dto-din-preview">
            <ImageLightbox
              src={din.main_sample_photo_url || din.din_image_url}
              alt={din.din_number}
              thumbClassName="dto-thumb-lg"
            />
            <div>
              <h2>{din.design_name || din.din_number}</h2>
              <p className="text-muted">
                {din.main_sample_photo_url
                  ? 'Main sample photo (sales-facing)'
                  : 'Internal DIN reference (CEO only until final sample photos uploaded)'}{' '}
                · <DtoStatusPill status={din.status} />
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {din ? (
        <section className="surface dto-panel">
          <h2 className="section-title">Final Sample (Sales / Customer)</h2>
          <p className="text-muted2">
            After physical sample: upload exactly two sales photos — Main Sample Photo + ONE Combined Matching
            Photo (all matchings together). Internal DIN sheet images stay private.
          </p>
          <div className="dto-photo-row">
            <div>
              <span className="text-muted">1. Main Sample Photo</span>
              <ImageLightbox src={din.main_sample_photo_url} alt="Main sample" thumbClassName="dto-thumb-md" />
              <label className="link-btn">
                Upload main sample
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    void (async () => {
                      setBusy(true)
                      try {
                        const url = await uploadDinImage(f)
                        await updateDin(din.id, { main_sample_photo_url: url })
                        setMessage('Main sample photo saved')
                        await refreshDin()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Upload failed')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                />
              </label>
            </div>
            <div>
              <span className="text-muted">2. Combined Matching Photo (all matchings in one)</span>
              <ImageLightbox
                src={din.combined_matching_photo_url}
                alt="Combined matchings"
                thumbClassName="dto-thumb-md"
              />
              <label className="link-btn">
                Upload combined matching photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    void (async () => {
                      setBusy(true)
                      try {
                        const url = await uploadDinImage(f)
                        await updateDin(din.id, { combined_matching_photo_url: url })
                        setMessage('Combined matching photo saved')
                        await refreshDin()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Upload failed')
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                />
              </label>
            </div>
          </div>
        </section>
      ) : null}

      <section className="surface dto-panel">
        <h2 className="section-title">Matchings</h2>
        {matchings.length === 0 ? (
          <p className="text-muted">No matchings on this DIN.</p>
        ) : (
          <div className="dto-track-list">
            {matchings.map((m) => (
              <article key={m.id} className="dto-track-card">
                <div className="dto-track-head">
                  <strong>
                    Matching {m.matching_no} · {matchingColourLabel(m)}
                  </strong>
                  <DtoStatusPill status={m.status} />
                </div>
                <div className="dto-photo-row">
                  <div>
                    <span className="text-muted">Sample photo</span>
                    <ImageLightbox src={m.sample_photo_url} alt="Sample" thumbClassName="dto-thumb-md" />
                    <label className="link-btn">
                      Upload sample photo
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => void uploadPhoto(m, e.target.files?.[0] ?? null, 'sample')}
                      />
                    </label>
                  </div>
                  <div>
                    <span className="text-muted">Approved matching photo</span>
                    <ImageLightbox src={m.approved_photo_url} alt="Approved" thumbClassName="dto-thumb-md" />
                    <label className="link-btn">
                      Upload approved photo
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(e) => void uploadPhoto(m, e.target.files?.[0] ?? null, 'approved')}
                      />
                    </label>
                  </div>
                </div>
                <div className="dto-row-actions">
                  <button type="button" className="btn-warp" disabled={busy} onClick={() => void markProduced(m)}>
                    Sample Produced
                  </button>
                  <button
                    type="button"
                    className="btn-warp"
                    disabled={busy}
                    onClick={() => {
                      setEditId(m.id)
                      setReceivedDate(m.sample_received_date || todayISO())
                      setReceivedBy(m.sample_received_by || '')
                      setActualMeter(m.actual_meter != null ? String(m.actual_meter) : '')
                      setRemarks(m.remarks || '')
                    }}
                  >
                    Sample Received
                  </button>
                  <button type="button" className="primary-save" disabled={busy} onClick={() => void setDecision(m, 'Approved')}>
                    Approved Matching
                  </button>
                  <button type="button" className="btn-danger" disabled={busy} onClick={() => void setDecision(m, 'Rejected')}>
                    Rejected Matching
                  </button>
                </div>
                {editId === m.id ? (
                  <div className="dto-form-grid dto-receive-form">
                    <label className="field">
                      <span>Sample Received Date</span>
                      <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Sample Received By</span>
                      <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Actual Meter</span>
                      <input className="num" type="number" value={actualMeter} onChange={(e) => setActualMeter(e.target.value)} />
                    </label>
                    <label className="field">
                      <span>Remarks</span>
                      <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    </label>
                    <div className="dto-form-actions dto-span-2">
                      <button type="button" className="primary-save" disabled={busy} onClick={() => void saveReceived(m)}>
                        Save received
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
