import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

export const PHOTO_CATEGORIES = [
  'Cotton Catalogue',
  'Garment Catalogue',
  'Design Catalogue',
] as const

export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]

export type PhotoCatalogueRow = {
  id: string
  category: PhotoCategory
  image_url: string
  thumbnail_url: string | null
  design_number: string | null
  colour: string | null
  tags: string[] | null
  uploaded_by: string | null
  created_at: string
}

type TabId = 'gallery' | 'upload'

type Props = {
  /** When embedded in Sales Tracker picker */
  pickMode?: boolean
  onPick?: (row: PhotoCatalogueRow) => void
  initialCategory?: PhotoCategory | 'Recent'
}

const PAGE = 48

export function PhotoCatalogueScreen({
  pickMode = false,
  onPick,
  initialCategory = 'Recent',
}: Props) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>(pickMode ? 'gallery' : 'gallery')
  const [filter, setFilter] = useState<PhotoCategory | 'Recent'>(initialCategory)
  const [rows, setRows] = useState<PhotoCatalogueRow[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)
  const loadingRef = useRef(false)

  const [category, setCategory] = useState<PhotoCategory>('Design Catalogue')
  const [designNumber, setDesignNumber] = useState('')
  const [colour, setColour] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const fetchPage = useCallback(
    async (pageIndex: number, reset: boolean) => {
      if (loadingRef.current) return
      loadingRef.current = true
      try {
        const from = pageIndex * PAGE
        let q = supabase
          .from('photo_catalogue')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
        if (filter !== 'Recent') q = q.eq('category', filter)
        const { data, error: err } = await q
        if (err) throw err
        const batch = (data as PhotoCatalogueRow[]) ?? []
        setRows((prev) => (reset ? batch : [...prev, ...batch]))
        setHasMore(batch.length === PAGE)
        setPage(pageIndex)
      } finally {
        loadingRef.current = false
      }
    },
    [filter],
  )

  useEffect(() => {
    setRows([])
    setPage(0)
    setHasMore(true)
    void fetchPage(0, true).catch((e: Error) => setError(e.message))
  }, [filter, fetchPage])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        void fetchPage(page + 1, false).catch((e: Error) => setError(e.message))
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, page, fetchPage])

  useEffect(() => {
    return () => {
      for (const u of previews) URL.revokeObjectURL(u)
    }
  }, [previews])

  function stageFiles(list: FileList | null) {
    if (!list?.length) return
    const next = [...files, ...Array.from(list)]
    setFiles(next)
    setPreviews(next.map((f) => URL.createObjectURL(f)))
  }

  async function uploadAll() {
    if (!files.length) {
      setError('Select photos first')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${category.replace(/\s+/g, '_').toLowerCase()}/${Date.now()}-${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('photo-catalogue')
          .upload(path, file, { upsert: false, contentType: file.type || undefined })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('photo-catalogue').getPublicUrl(path)
        const { error: iErr } = await supabase.from('photo_catalogue').insert({
          category,
          image_url: pub.publicUrl,
          thumbnail_url: pub.publicUrl,
          design_number: designNumber.trim() || null,
          colour: colour.trim() || null,
          tags: [category, designNumber.trim(), colour.trim()].filter(Boolean),
          uploaded_by: enteredBy,
        })
        if (iErr) throw iErr
      }
      setMessage(`Uploaded ${files.length} photo(s)`)
      setFiles([])
      setPreviews([])
      setDesignNumber('')
      setColour('')
      setFilter('Recent')
      setTab('gallery')
      await fetchPage(0, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const filterTabs = useMemo(
    () => [{ id: 'Recent' as const, label: 'Recent' }, ...PHOTO_CATEGORIES.map((c) => ({ id: c, label: c }))],
    [],
  )

  return (
    <div className="screen">
      {!pickMode ? (
        <header className="screen-header">
          <h1>Photo Catalogue</h1>
          <p className="text-muted">Bulk gallery · Cotton / Garment / Design</p>
          <SubTabs
            value={tab}
            onChange={(id) => setTab(id as TabId)}
            options={[
              { id: 'gallery', label: 'Gallery' },
              { id: 'upload', label: 'Bulk Upload' },
            ]}
          />
        </header>
      ) : (
        <h2 className="section-title">Select catalogue photo</h2>
      )}

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'upload' && !pickMode ? (
        <div className="form-stack">
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as PhotoCategory)}>
              {PHOTO_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Design number (optional tag)</span>
            <input value={designNumber} onChange={(e) => setDesignNumber(e.target.value)} />
          </label>
          <label className="field">
            <span>Colour (optional tag)</span>
            <input value={colour} onChange={(e) => setColour(e.target.value)} />
          </label>
          <button type="button" onClick={() => fileRef.current?.click()}>
            Pick photos
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => stageFiles(e.target.files)}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {previews.map((src) => (
              <img key={src} src={src} alt="" style={{ width: '100%', borderRadius: 8, aspectRatio: '1', objectFit: 'cover' }} />
            ))}
          </div>
          <button type="button" className="primary-save" disabled={busy || !files.length} onClick={() => void uploadAll()}>
            {busy ? 'Uploading…' : `Upload ${files.length || ''} photo(s)`}
          </button>
        </div>
      ) : null}

      {tab === 'gallery' || pickMode ? (
        <div className="form-stack">
          <div className="share-actions" style={{ flexWrap: 'wrap' }}>
            {filterTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={filter === t.id ? undefined : 'btn-ghost'}
                onClick={() => setFilter(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 10,
            }}
          >
            {rows.map((row) => (
              <article key={row.id} className="surface" style={{ padding: 8 }}>
                <button
                  type="button"
                  style={{ padding: 0, border: 'none', background: 'none', width: '100%' }}
                  onClick={() => {
                    if (pickMode && onPick) onPick(row)
                    else setZoomUrl(row.image_url)
                  }}
                >
                  <img
                    src={row.thumbnail_url || row.image_url}
                    alt={row.design_number || row.category}
                    loading="lazy"
                    style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6 }}
                  />
                </button>
                <div className="text-muted2" style={{ fontSize: 11, marginTop: 4 }}>
                  {row.category.replace(' Catalogue', '')}
                  {row.design_number ? ` · ${row.design_number}` : ''}
                  {row.colour ? ` · ${row.colour}` : ''}
                </div>
                {!pickMode ? (
                  <ShareActions
                    onWhatsApp={() =>
                      shareWhatsApp(
                        `Catalogue photo\n${row.category}\nDesign ${row.design_number || '—'}\nColour ${row.colour || '—'}\n${row.image_url}`,
                      )
                    }
                    extra={
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() =>
                          shareWhatsApp(
                            `Share to Customer\n${row.category}\n${row.design_number || ''}\n${row.image_url}`,
                          )
                        }
                      >
                        Share to Customer
                      </button>
                    }
                  />
                ) : (
                  <button type="button" onClick={() => onPick?.(row)}>
                    Select
                  </button>
                )}
              </article>
            ))}
          </div>
          <div ref={sentinelRef} style={{ height: 24 }} />
          {!rows.length ? <p className="text-muted">No photos yet</p> : null}
        </div>
      ) : null}

      {zoomUrl ? (
        <div
          className="dna-modal"
          role="dialog"
          onClick={() => setZoomUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <img src={zoomUrl} alt="Zoom" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 8 }} />
        </div>
      ) : null}
    </div>
  )
}
