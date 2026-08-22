import { useCallback, useEffect, useMemo, useState } from 'react'
import { shareDesignBroadcast } from '../lib/designBroadcast'
import { useAuth } from '../lib/auth'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type DesignOpt = {
  id: string
  dno: string
  design_date: string | null
  image_url: string | null
  colour: string | null
}

type Props = {
  initialDesignId?: string
}

function defaultCaption(dno: string) {
  return `Naya Design ${dno || '[Dno]'} aa gaya hai — sabhi colour options attached. Order ke liye contact karein.`
}

async function uploadDesignImage(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('design-images').upload(path, file, { upsert: false })
  if (error) throw error
  return supabase.storage.from('design-images').getPublicUrl(path).data.publicUrl
}

export function DesignBroadcastScreen({ initialDesignId }: Props) {
  const { isCeo, profile } = useAuth()
  const [designs, setDesigns] = useState<DesignOpt[]>([])
  const [designId, setDesignId] = useState(initialDesignId || '')
  const [designDate, setDesignDate] = useState(todayISO())
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [chartFile, setChartFile] = useState<File | null>(null)
  const [mainPreview, setMainPreview] = useState<string | null>(null)
  const [chartPreview, setChartPreview] = useState<string | null>(null)
  const [mainUrl, setMainUrl] = useState<string | null>(null)
  const [chartUrl, setChartUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState(defaultCaption(''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const selected = useMemo(
    () => designs.find((d) => d.id === designId) || null,
    [designs, designId],
  )

  const loadDesigns = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('designs')
      .select('id, dno, design_date, image_url, colour')
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) throw err
    const list = (data ?? []) as DesignOpt[]
    setDesigns(list)
    setDesignId((prev) => {
      if (prev && list.some((d) => d.id === prev)) return prev
      if (initialDesignId && list.some((d) => d.id === initialDesignId)) return initialDesignId
      return list[0]?.id || prev || ''
    })
  }, [initialDesignId])

  useEffect(() => {
    void loadDesigns().catch((e: Error) => setError(e.message))
  }, [loadDesigns])

  useEffect(() => {
    if (initialDesignId) setDesignId(initialDesignId)
  }, [initialDesignId])

  useEffect(() => {
    if (!selected) return
    setDesignDate(selected.design_date || todayISO())
    setCaption(defaultCaption(selected.dno))
    if (selected.image_url && !mainFile && !mainUrl) {
      setMainUrl(selected.image_url)
      setMainPreview(selected.image_url)
    }
  }, [selected, mainFile, mainUrl])

  useEffect(() => {
    if (!mainFile) return
    const url = URL.createObjectURL(mainFile)
    setMainPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [mainFile])

  useEffect(() => {
    if (!chartFile) return
    const url = URL.createObjectURL(chartFile)
    setChartPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [chartFile])

  const ready = Boolean((mainUrl || mainFile) && (chartUrl || chartFile) && designId && caption.trim())

  async function ensureUploaded(): Promise<{ main: string; chart: string }> {
    let main = mainUrl
    let chart = chartUrl
    if (mainFile) {
      main = await uploadDesignImage(mainFile, 'broadcast-main')
      setMainUrl(main)
      setMainFile(null)
    }
    if (chartFile) {
      chart = await uploadDesignImage(chartFile, 'broadcast-colour')
      setChartUrl(chart)
      setChartFile(null)
    }
    if (!main || !chart) throw new Error('Upload both Main Design and Colour Chart photos')
    return { main, chart }
  }

  async function saveBroadcast(main: string, chart: string) {
    if (!profile) return
    const payload = {
      design_id: designId,
      main_photo_url: main,
      colour_chart_url: chart,
      caption: caption.trim(),
    }
    await applyOrQueue({
      isCeo,
      userId: profile.id,
      tableName: 'design_broadcasts',
      action: 'insert',
      recordId: null,
      payload,
      apply: async () => {
        const { error: insErr } = await supabase.from('design_broadcasts').insert(payload)
        if (insErr) throw insErr
      },
    })
  }

  async function handleShare(kind: 'whatsapp' | 'business') {
    if (!profile || !ready) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { main, chart } = await ensureUploaded()
      await saveBroadcast(main, chart)
      const result = await shareDesignBroadcast({
        caption: caption.trim(),
        mainPhotoUrl: main,
        colourChartUrl: chart,
      })
      if (result === 'shared') {
        setMessage(
          kind === 'business'
            ? 'Share sheet opened — pick WhatsApp Business if listed'
            : 'Share sheet opened — pick WhatsApp if listed',
        )
      } else if (result === 'cancelled') {
        setMessage('Share cancelled')
      } else if (result === 'fallback-text') {
        setMessage(
          'Browser could not attach both images. Caption shared — attach Colour Chart manually if needed.',
        )
      } else {
        setMessage('Opened WhatsApp text fallback')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Share failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Design Broadcast</h1>
        <p className="text-muted">Post 2 photos + caption → device share sheet (WhatsApp / Business)</p>
      </header>

      <div className="form-stack">
        {!designs.length && !error ? (
          <p className="text-muted">Loading designs…</p>
        ) : null}
        {error && !designs.length ? (
          <p className="form-error text-danger">
            Could not load designs ({error}). You can still stay on this page — retry by reopening Design Broadcast.
          </p>
        ) : null}

        <label className="field">
          <span className="text-muted">Design No.</span>
          <select
            value={designId}
            onChange={(e) => {
              setDesignId(e.target.value)
              setMainFile(null)
              setChartFile(null)
              setMainUrl(null)
              setChartUrl(null)
              setMainPreview(null)
              setChartPreview(null)
            }}
            required
          >
            <option value="">Select design</option>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.dno}
                {d.colour ? ` · ${d.colour}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="text-muted">Date</span>
          <input type="date" value={designDate} onChange={(e) => setDesignDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="text-muted">Main Design Photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setMainFile(f)
              if (f) setMainUrl(null)
            }}
          />
        </label>
        {mainPreview ? (
          <div className="broadcast-preview surface">
            <img src={mainPreview} alt="Main design" />
          </div>
        ) : null}

        <label className="field">
          <span className="text-muted">Colour Chart Photo</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setChartFile(f)
              if (f) setChartUrl(null)
            }}
          />
        </label>
        {chartPreview ? (
          <div className="broadcast-preview surface">
            <img src={chartPreview} alt="Colour chart" />
          </div>
        ) : null}

        <label className="field">
          <span className="text-muted">Caption</span>
          <textarea
            className="broadcast-caption"
            rows={4}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>

        <div className="broadcast-share-row">
          <button
            type="button"
            className="btn-wa broadcast-share-btn"
            disabled={busy || !ready}
            onClick={() => void handleShare('whatsapp')}
          >
            WhatsApp
          </button>
          <button
            type="button"
            className="btn-wa broadcast-share-btn broadcast-share-business"
            disabled={busy || !ready}
            onClick={() => void handleShare('business')}
          >
            WhatsApp Business
          </button>
        </div>
        <p className="text-muted2">
          No phone numbers stored — pick contacts / broadcast lists in the share sheet.
        </p>
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
