import { useCallback, useEffect, useState } from 'react'
import { SampleJobCardPrint } from '../components/SampleJobCardPrint'
import { useAuth } from '../lib/auth'
import { MACHINES } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import {
  colourSwatchHex,
  newColourPair,
  newMatching,
  previewNextDin,
  saveSampleJobCard,
  uploadSampleDesign,
  whatsappSampleMessage,
  type IssuedCardData,
  type SampleMatchingDraft,
} from '../lib/sampleJobCard'

export function SampleJobCard() {
  const { profile, session } = useAuth()
  const [dinPreview, setDinPreview] = useState('DIN-…')
  const [jobDate, setJobDate] = useState(todayISO())
  const [machineNo, setMachineNo] = useState<string>(MACHINES[0])
  const [workQuality, setWorkQuality] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [matchings, setMatchings] = useState<SampleMatchingDraft[]>([newMatching(1)])
  const [savedId, setSavedId] = useState<string | null>(null)
  const [issued, setIssued] = useState<IssuedCardData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const refreshDin = useCallback(async () => {
    const din = await previewNextDin()
    setDinPreview(din)
  }, [])

  useEffect(() => {
    void refreshDin().catch((e: Error) => setError(e.message))
  }, [refreshDin])

  async function handleFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const url = await uploadSampleDesign(file)
      setImageUrl(url)
      setMessage('Design uploaded')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function updateMatching(key: string, fn: (m: SampleMatchingDraft) => SampleMatchingDraft) {
    setMatchings((prev) => prev.map((m) => (m.key === key ? fn(m) : m)))
  }

  function removeMatching(key: string) {
    setMatchings((prev) => {
      if (prev.length <= 1) return prev
      return prev
        .filter((m) => m.key !== key)
        .map((m, i) => ({ ...m, matching_no: i + 1 }))
    })
  }

  async function persist(showPrint: boolean) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const cleaned = matchings
        .map((m, i) => ({
          ...m,
          matching_no: i + 1,
          colours: m.colours.filter((c) => c.colour_name.trim() || c.colour_number.trim()),
        }))
        .filter((m) => m.colours.length > 0)

      if (!cleaned.length) throw new Error('Add at least one colour matching')

      const card = await saveSampleJobCard({
        existingId: savedId,
        design_image_url: imageUrl,
        job_date: jobDate,
        machine_no: machineNo,
        work_quality: workQuality,
        created_by: session?.user?.id || null,
        matchings: cleaned,
      })
      card.issued_by = profile?.full_name || profile?.roles?.role_name || '—'
      setSavedId(card.id || null)
      setDinPreview(card.din_number)
      if (showPrint) {
        setIssued(card)
        setMessage(`Issued ${card.din_number}`)
      } else {
        setIssued(null)
        setMessage(`Draft saved as ${card.din_number}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function openWhatsApp() {
    if (!issued) return
    const url = `https://wa.me/?text=${encodeURIComponent(whatsappSampleMessage(issued))}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  function openWhatsAppBusiness() {
    // WhatsApp Business uses the same wa.me URL scheme on mobile; OS may show an app chooser.
    // There is no separate public deep-link that forces WhatsApp Business specifically.
    openWhatsApp()
  }

  return (
    <div className="screen sample-job-screen">
      <header className="screen-header no-print">
        <h1>Sample Job Card</h1>
      </header>

      <div className="no-print sample-job-form">
        <section className="surface sample-section">
          <h2 className="section-title text-warp">Design Upload</h2>
          <div className="sample-upload-row">
            <label
              className={dragOver ? 'sample-dropzone drag-over' : 'sample-dropzone'}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                void handleFile(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
              />
              <span className="text-muted">
                {uploading ? 'Uploading…' : 'Drag & drop or click to upload design'}
              </span>
            </label>
            {imageUrl ? (
              <div className="sample-upload-preview" style={{ backgroundImage: `url(${imageUrl})` }} />
            ) : (
              <div className="sample-upload-preview sample-upload-preview-empty">Preview</div>
            )}
          </div>
        </section>

        <section className="surface sample-section">
          <h2 className="section-title text-warp">Job Card Details</h2>
          <div className="sample-details-row">
            <div className="field">
              <span className="text-muted">DIN Number</span>
              <span className="sample-din-badge">{savedId ? dinPreview : dinPreview}</span>
            </div>
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Machine Number</span>
              <select value={machineNo} onChange={(e) => setMachineNo(e.target.value)}>
                {MACHINES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Work / Quality</span>
              <input
                value={workQuality}
                onChange={(e) => setWorkQuality(e.target.value)}
                placeholder="e.g. Sample / Soft"
              />
            </label>
          </div>
        </section>

        <section className="surface sample-section">
          <h2 className="section-title text-warp">Colour Matchings</h2>
          <div className="sample-matchings">
            {matchings.map((m) => (
              <div key={m.key} className="sample-matching-row">
                <div className="sample-matching-head">
                  <strong>Matching No. {m.matching_no}</strong>
                  <button
                    type="button"
                    className="sample-icon-btn"
                    aria-label="Remove matching"
                    onClick={() => removeMatching(m.key)}
                    disabled={matchings.length <= 1}
                  >
                    ✕
                  </button>
                </div>
                <div className="sample-colour-list">
                  {m.colours.map((c) => (
                    <div key={c.key} className="sample-colour-pair">
                      <span
                        className="sample-swatch"
                        style={{ background: colourSwatchHex(c.colour_name) }}
                      />
                      <input
                        placeholder="Colour name"
                        value={c.colour_name}
                        onChange={(e) =>
                          updateMatching(m.key, (row) => ({
                            ...row,
                            colours: row.colours.map((x) =>
                              x.key === c.key ? { ...x, colour_name: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                      <input
                        placeholder="Colour / HSV no."
                        value={c.colour_number}
                        onChange={(e) =>
                          updateMatching(m.key, (row) => ({
                            ...row,
                            colours: row.colours.map((x) =>
                              x.key === c.key ? { ...x, colour_number: e.target.value } : x,
                            ),
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="sample-icon-btn"
                        aria-label="Remove colour"
                        onClick={() =>
                          updateMatching(m.key, (row) => ({
                            ...row,
                            colours:
                              row.colours.length <= 1
                                ? row.colours
                                : row.colours.filter((x) => x.key !== c.key),
                          }))
                        }
                        disabled={m.colours.length <= 1}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-warp"
                  onClick={() =>
                    updateMatching(m.key, (row) => ({
                      ...row,
                      colours: [...row.colours, newColourPair()],
                    }))
                  }
                >
                  + Colour
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-warp"
            onClick={() => setMatchings((prev) => [...prev, newMatching(prev.length + 1)])}
          >
            + Add Matching
          </button>
        </section>

        <div className="sample-actions">
          <button
            type="button"
            className="btn-warp"
            disabled={busy || uploading}
            onClick={() => void persist(false)}
          >
            Save Draft
          </button>
          <button
            type="button"
            className="primary-save"
            disabled={busy || uploading}
            onClick={() => void persist(true)}
          >
            Issue Job Card
          </button>
        </div>

        {error ? <p className="form-error text-danger">{error}</p> : null}
        {message ? <p className="form-ok text-sage">{message}</p> : null}
      </div>

      {issued ? (
        <section className="sample-issue-result">
          <SampleJobCardPrint card={issued} />
          <div className="sample-share-actions no-print">
            <button type="button" className="btn-wa" onClick={openWhatsApp}>
              Share on WhatsApp
            </button>
            <button type="button" className="btn-wa" onClick={openWhatsAppBusiness}>
              Share on WhatsApp Business
            </button>
            <button type="button" className="btn-warp" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
