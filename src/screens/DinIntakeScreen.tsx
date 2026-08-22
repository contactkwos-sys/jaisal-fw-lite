import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageLightbox } from '../components/ImageLightbox'
import { useAuth } from '../lib/auth'
import {
  createDin,
  DIN_INTAKE_EMAIL,
  emptyMatchingDraft,
  fetchWarpYarnOptions,
  getGmailConnection,
  previewNextDinNumber,
  setGmailConnectionStatus,
  uploadDinImage,
  type DinMatchingDraft,
  type GmailConnection,
} from '../lib/designToOrder'
import { todayISO } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'

type Props = { onNavigate: (t: NavTarget) => void }

export function DinIntakeScreen({ onNavigate }: Props) {
  const { session, profile } = useAuth()
  const [dinNumber, setDinNumber] = useState('')
  const [receivedDate, setReceivedDate] = useState(todayISO())
  const [designName, setDesignName] = useState('')
  const [partyName, setPartyName] = useState('')
  const [parties, setParties] = useState<string[]>([])
  const [commonWarp, setCommonWarp] = useState('')
  const [warpOther, setWarpOther] = useState('')
  const [warpOptions, setWarpOptions] = useState<string[]>([])
  const [remarks, setRemarks] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [matchings, setMatchings] = useState<DinMatchingDraft[]>([emptyMatchingDraft(1)])
  const [source, setSource] = useState('upload')
  const [gmail, setGmail] = useState<GmailConnection | null>(null)
  const [gmailStep, setGmailStep] = useState<'idle' | 'authorize' | 'select' | 'import'>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [next, warps, partyRows] = await Promise.all([
      previewNextDinNumber(),
      fetchWarpYarnOptions(),
      supabase.from('party_master').select('party_name').order('party_name').limit(400),
    ])
    setDinNumber(next)
    setWarpOptions(warps)
    setParties((partyRows.data ?? []).map((p) => String(p.party_name)).filter(Boolean))
    if (session?.user?.id) {
      const conn = await getGmailConnection(session.user.id).catch(() => null)
      setGmail(conn)
      if (conn?.status === 'connected') setGmailStep('select')
      else if (conn?.status === 'pending') setGmailStep('authorize')
    }
  }, [session?.user?.id])

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message))
  }, [refresh])

  async function handleFile(file: File | null, src: string) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const url = await uploadDinImage(file)
      setImageUrl(url)
      setSource(src)
      setMessage('DIN image uploaded')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function updateMatching(key: string, patch: Partial<DinMatchingDraft>) {
    setMatchings((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  async function startGmailConnect() {
    if (!session?.user?.id) return
    setBusy(true)
    setError(null)
    try {
      const conn = await setGmailConnectionStatus(session.user.id, 'pending')
      setGmail(conn)
      setGmailStep('authorize')
      setMessage(
        'Gmail OAuth is not configured on this project yet. Use Authorize to record connect intent, then finish Google Cloud OAuth setup to enable real inbox import.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Gmail connect')
    } finally {
      setBusy(false)
    }
  }

  async function authorizeGmail() {
    if (!session?.user?.id) return
    setBusy(true)
    try {
      // Placeholder until Google OAuth client IDs / edge function are deployed.
      // Status stays pending — we never claim a live inbox.
      setGmailStep('select')
      setMessage(
        'Authorize step recorded. Live Gmail API is not connected — import will stay disabled until OAuth credentials are added.',
      )
      const conn = await setGmailConnectionStatus(session.user.id, 'pending')
      setGmail(conn)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authorize failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveDin(e: React.FormEvent) {
    e.preventDefault()
    if (!imageUrl) {
      setError('DIN image is required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const warp = commonWarp === 'Other' ? warpOther.trim() : commonWarp
      const cleaned = matchings
        .map((m, i) => ({
          ...m,
          matching_no: i + 1,
          common_warp: m.common_warp || warp,
        }))
        .filter(
          (m) =>
            m.ground_colour.trim() ||
            m.weft_1.trim() ||
            m.weft_2.trim() ||
            m.weft_3.trim() ||
            m.weft_4.trim(),
        )

      const din = await createDin({
        din_number: dinNumber,
        received_date: receivedDate,
        design_name: designName,
        party_name: partyName,
        din_image_url: imageUrl,
        common_warp: warp,
        remarks,
        source,
        source_email: source === 'gmail' || source === 'email' ? DIN_INTAKE_EMAIL : undefined,
        created_by: session?.user?.id || null,
        matchings: cleaned.length ? cleaned : undefined,
      })
      setMessage(`Saved ${din.din_number}`)
      onNavigate({ screen: 'dto-hub', module: 'design-to-order' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const gmailConnected = gmail?.status === 'connected'

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>DESIGN Intake</h1>
          <p className="text-muted">Receive DIN by photo, upload, or Gmail — creates a unique DIN master record.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="dto-intake-grid">
        <section className="surface dto-panel">
          <h2 className="section-title">Receive DIN Image</h2>
          <div className="dto-receive-actions">
            <button type="button" className="btn-warp" onClick={() => fileRef.current?.click()} disabled={uploading}>
              Upload DIN Photo
            </button>
            <button type="button" className="btn-warp" onClick={() => cameraRef.current?.click()} disabled={uploading}>
              Take Photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'upload')}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null, 'camera')}
            />
          </div>

          <label
            className={dragOver ? 'dto-dropzone drag-over' : 'dto-dropzone'}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              void handleFile(e.dataTransfer.files?.[0] ?? null, 'upload')
            }}
          >
            {imageUrl ? (
              <ImageLightbox src={imageUrl} alt="DIN" thumbClassName="dto-thumb-preview" />
            ) : (
              <span>Drag &amp; drop DIN photo here</span>
            )}
          </label>
        </section>

        <section className="surface dto-panel">
          <h2 className="section-title">Import from Email / Gmail</h2>
          <p className="dto-email-line">
            From Email · <strong>{DIN_INTAKE_EMAIL}</strong>
          </p>
          <ol className="dto-gmail-steps">
            <li className={gmailStep !== 'idle' || gmail ? 'is-done' : undefined}>
              <button type="button" className="primary-save" disabled={busy || gmailConnected} onClick={() => void startGmailConnect()}>
                Connect Gmail
              </button>
            </li>
            <li className={gmailStep === 'authorize' || gmailStep === 'select' || gmailStep === 'import' ? 'is-done' : undefined}>
              <button type="button" className="btn-warp" disabled={busy || gmailStep === 'idle'} onClick={() => void authorizeGmail()}>
                Authorize
              </button>
            </li>
            <li>
              <button type="button" className="btn-warp" disabled title="Requires live Gmail OAuth">
                Select Email
              </button>
            </li>
            <li>
              <button type="button" className="btn-warp" disabled title="Requires live Gmail OAuth">
                Import DIN Attachment
              </button>
            </li>
          </ol>
          <p className="text-muted dto-gmail-note">
            {gmailConnected
              ? 'Gmail marked connected — inbox sync still requires OAuth credentials.'
              : 'No fake inbox. Import stays disabled until Google OAuth / Gmail API is configured for this project.'}
          </p>
          {gmail ? (
            <p className="text-muted">
              Status: <strong>{gmail.status}</strong>
              {gmail.connected_at ? ` · ${new Date(gmail.connected_at).toLocaleString()}` : ''}
            </p>
          ) : null}
        </section>
      </div>

      <form className="surface dto-panel dto-intake-form" onSubmit={(e) => void saveDin(e)}>
        <h2 className="section-title">DIN Master Record</h2>
        <div className="dto-form-grid">
          <label className="field">
            <span>DESIGN No. (formerly DIN)</span>
            <input value={dinNumber} onChange={(e) => setDinNumber(e.target.value)} required />
          </label>
          <label className="field">
            <span>Received Date</span>
            <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Design Name</span>
            <input value={designName} onChange={(e) => setDesignName(e.target.value)} placeholder="e.g. Floral Net" />
          </label>
          <label className="field">
            <span>Customer / Party</span>
            <input
              list="dto-party-list"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="If known"
            />
            <datalist id="dto-party-list">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Common Warp</span>
            <select
              value={commonWarp}
              onChange={(e) => setCommonWarp(e.target.value)}
            >
              <option value="">Select warp…</option>
              {warpOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
              <option value="Other">Other</option>
            </select>
          </label>
          {commonWarp === 'Other' ? (
            <label className="field">
              <span>Other Warp</span>
              <input value={warpOther} onChange={(e) => setWarpOther(e.target.value)} required />
            </label>
          ) : null}
          <label className="field dto-span-2">
            <span>Remarks</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </label>
        </div>

        <div className="dto-matchings-block">
          <div className="dto-panel-head">
            <h3 className="section-title">Matchings</h3>
            <button
              type="button"
              className="btn-warp"
              onClick={() => setMatchings((m) => [...m, emptyMatchingDraft(m.length + 1)])}
            >
              + Add Matching
            </button>
          </div>
          {matchings.map((m, idx) => (
            <div key={m.key} className="dto-matching-card">
              <strong>Matching {idx + 1}</strong>
              <div className="dto-form-grid">
                <label className="field">
                  <span>Main Ground Colour</span>
                  <input
                    value={m.ground_colour}
                    onChange={(e) => updateMatching(m.key, { ground_colour: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Weft Colour 1</span>
                  <input value={m.weft_1} onChange={(e) => updateMatching(m.key, { weft_1: e.target.value })} />
                </label>
                <label className="field">
                  <span>Weft Colour 2</span>
                  <input value={m.weft_2} onChange={(e) => updateMatching(m.key, { weft_2: e.target.value })} />
                </label>
                <label className="field">
                  <span>Weft Colour 3</span>
                  <input value={m.weft_3} onChange={(e) => updateMatching(m.key, { weft_3: e.target.value })} />
                </label>
                <label className="field">
                  <span>Weft Colour 4</span>
                  <input value={m.weft_4} onChange={(e) => updateMatching(m.key, { weft_4: e.target.value })} />
                </label>
                <label className="field">
                  <span>Common Warp</span>
                  <input
                    value={m.common_warp}
                    onChange={(e) => updateMatching(m.key, { common_warp: e.target.value })}
                    placeholder={commonWarp === 'Other' ? warpOther : commonWarp || 'Same as DIN'}
                  />
                </label>
                <label className="field dto-span-2">
                  <span>Remarks</span>
                  <input value={m.remarks} onChange={(e) => updateMatching(m.key, { remarks: e.target.value })} />
                </label>
              </div>
              {matchings.length > 1 ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    setMatchings((prev) =>
                      prev.filter((x) => x.key !== m.key).map((x, i) => ({ ...x, matching_no: i + 1 })),
                    )
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <div className="dto-form-actions">
          <span className="text-muted">Logged in as {profile?.full_name || 'User'}</span>
          <button type="submit" className="primary-save" disabled={busy || uploading}>
            Save DIN
          </button>
        </div>
      </form>
    </div>
  )
}
