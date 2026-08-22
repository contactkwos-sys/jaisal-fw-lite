import { useCallback, useEffect, useRef, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { YarnInward } from '../lib/database.types'
import { todayISO, uploadInvoicePhoto } from '../lib/mutate'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
import { supabase } from '../lib/supabase'

type TabId = 'scan' | 'list'
type YarnType = 'warp' | 'weft'

type OcrFields = {
  supplier_name: string
  item: string
  qty: string
  amount: string
}

export function YarnInwardScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('scan')
  const [rows, setRows] = useState<YarnInward[]>([])
  const [busy, setBusy] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [yarnType, setYarnType] = useState<YarnType>('weft')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [fields, setFields] = useState<OcrFields>({
    supplier_name: '',
    item: '',
    qty: '',
    amount: '',
  })
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraOn, setCameraOn] = useState(false)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('yarn_inward')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80)
    if (err) throw err
    setRows((data as YarnInward[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraOn(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera unavailable')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraOn(false)
  }

  async function fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  }

  async function runOcr(file: File) {
    setOcrBusy(true)
    setError(null)
    setMessage(null)
    try {
      const localUrl = URL.createObjectURL(file)
      setPreview(localUrl)
      const uploaded = await uploadInvoicePhoto(file, yarnType)
      setImageUrl(uploaded)

      const base64 = await fileToBase64(file)
      const { data, error: fnErr } = await supabase.functions.invoke('invoice-ocr', {
        body: {
          image_base64: base64,
          media_type: file.type || 'image/jpeg',
          yarn_type: yarnType,
        },
      })
      if (fnErr) throw new Error(fnErr.message || 'OCR failed')
      if (data?.error) throw new Error(String(data.error))

      setFields({
        supplier_name: String(data?.supplier_name ?? ''),
        item: String(data?.item ?? ''),
        qty: data?.qty != null ? String(data.qty) : '',
        amount: data?.amount != null ? String(data.amount) : '',
      })
      setMessage('OCR complete — confirm fields and save')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed')
    } finally {
      setOcrBusy(false)
    }
  }

  async function captureFromCamera() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return
    const file = new File([blob], `invoice-${Date.now()}.jpg`, { type: 'image/jpeg' })
    stopCamera()
    await runOcr(file)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!fields.supplier_name.trim()) {
      setError('Supplier name is required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        yarn_type: yarnType,
        supplier_name: fields.supplier_name.trim(),
        item: fields.item.trim() || null,
        qty: Number(fields.qty) || null,
        amount: Number(fields.amount) || null,
        invoice_image_url: imageUrl,
        entry_date: entryDate,
        entered_by: enteredBy,
      }
      const { error: iErr } = await supabase.from('yarn_inward').insert(payload)
      if (iErr) throw iErr
      setMessage('Yarn inward saved')
      setFields({ supplier_name: '', item: '', qty: '', amount: '' })
      setImageUrl(null)
      setPreview(null)
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(row: YarnInward) {
    if (!profile) return
    if (!window.confirm(`Delete inward for ${row.supplier_name}?`)) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at,
        tableName: 'yarn_inward',
        recordId: row.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('yarn_inward').delete().eq('id', row.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Deleted' : 'Delete queued for CEO approval')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Yarn Inward OCR</h1>
        <p className="text-muted">Capture supplier invoice → auto-read → confirm & save</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'scan', label: 'Scan / Entry' },
            { id: 'list', label: 'List' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'scan' ? (
        <div className="form-stack">
          <div className="field">
            <span>Yarn type</span>
            <div className="cashbook-type-toggle" role="group">
              <button
                type="button"
                className={yarnType === 'weft' ? 'cashbook-type-btn credit active' : 'cashbook-type-btn credit'}
                onClick={() => setYarnType('weft')}
              >
                Weft Yarn
              </button>
              <button
                type="button"
                className={yarnType === 'warp' ? 'cashbook-type-btn debit active' : 'cashbook-type-btn debit'}
                onClick={() => setYarnType('warp')}
              >
                Warp Yarn
              </button>
            </div>
          </div>

          <label className="field">
            <span>Entry date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </label>

          <div className="share-actions">
            {!cameraOn ? (
              <button type="button" disabled={ocrBusy} onClick={() => void startCamera()}>
                Open camera
              </button>
            ) : (
              <>
                <button type="button" disabled={ocrBusy} onClick={() => void captureFromCamera()}>
                  Capture invoice
                </button>
                <button type="button" className="btn-ghost" onClick={stopCamera}>
                  Close camera
                </button>
              </>
            )}
            <button type="button" className="btn-ghost" disabled={ocrBusy} onClick={() => fileRef.current?.click()}>
              Upload photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void runOcr(f)
              }}
            />
          </div>

          {cameraOn ? (
            <video ref={videoRef} playsInline muted className="surface" style={{ width: '100%', maxHeight: 280 }} />
          ) : null}
          {preview ? <img src={preview} alt="Invoice preview" style={{ maxWidth: '100%', borderRadius: 8 }} /> : null}
          {ocrBusy ? <p className="text-muted">Reading invoice via OCR…</p> : null}

          <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
            <label className="field">
              <span>Supplier name</span>
              <input
                value={fields.supplier_name}
                onChange={(e) => setFields((f) => ({ ...f, supplier_name: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Item</span>
              <input value={fields.item} onChange={(e) => setFields((f) => ({ ...f, item: e.target.value }))} />
            </label>
            <label className="field">
              <span>Qty</span>
              <input
                className="num"
                type="number"
                step="0.01"
                value={fields.qty}
                onChange={(e) => setFields((f) => ({ ...f, qty: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Amount</span>
              <input
                className="num"
                type="number"
                step="0.01"
                value={fields.amount}
                onChange={(e) => setFields((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={busy || ocrBusy}>
              {busy ? 'Saving…' : 'Confirm & save'}
            </button>
          </form>
        </div>
      ) : null}

      {tab === 'list' ? (
        <div className="list">
          {rows.map((row) => (
            <article key={row.id} className="card-row surface row-top">
              <div>
                <strong>
                  {row.yarn_type.toUpperCase()} · {row.supplier_name}
                </strong>
                <div className="text-muted">
                  {row.item || '—'} · Qty {row.qty ?? '—'} · ₹{row.amount ?? '—'}
                </div>
                <div className="text-muted2">
                  {row.entry_date} · {row.entered_by}
                  {row.invoice_image_url ? (
                    <>
                      {' · '}
                      <a href={row.invoice_image_url} target="_blank" rel="noreferrer">
                        Invoice
                      </a>
                    </>
                  ) : null}
                </div>
              </div>
              <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void handleDelete(row)}>
                Del
              </button>
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No yarn inward yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
