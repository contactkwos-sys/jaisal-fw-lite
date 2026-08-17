import { useCallback, useEffect, useState } from 'react'
import { DesignImageCropModal } from '../components/DesignImageCropModal'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type DesignRow = {
  id: string
  dno: string
  design_date: string
  image_url: string | null
  colour: string | null
  cost_per_meter?: number | null
}

type Props = {
  onOpenDesignCosting?: (dno?: string) => void
}

export function DesignScreen({ onOpenDesignCosting }: Props) {
  const { profile } = useAuth()
  const [dno, setDno] = useState('')
  const [designDate, setDesignDate] = useState(todayISO())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropFileName, setCropFileName] = useState('design.jpg')
  const [pendingRawFile, setPendingRawFile] = useState<File | null>(null)
  const [designs, setDesigns] = useState<DesignRow[]>([])
  const [costByDin, setCostByDin] = useState<Record<string, number>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadDesigns = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('designs')
      .select('id, dno, design_date, image_url, colour, cost_per_meter')
      .order('created_at', { ascending: false })
      .limit(40)
    if (err) throw err
    const rows = (data as DesignRow[]) ?? []
    setDesigns(rows)

    const dinList = [...new Set(rows.map((r) => r.dno).filter(Boolean))]
    if (!dinList.length) {
      setCostByDin({})
      return
    }
    const { data: costs } = await supabase
      .from('design_costing')
      .select('din_number, final_cost_per_mtr, created_at')
      .in('din_number', dinList)
      .order('created_at', { ascending: false })
    const map: Record<string, number> = {}
    for (const c of costs ?? []) {
      if (map[c.din_number] == null && c.final_cost_per_mtr != null) {
        map[c.din_number] = Number(c.final_cost_per_mtr)
      }
    }
    for (const r of rows) {
      if (map[r.dno] == null && r.cost_per_meter != null) {
        map[r.dno] = Number(r.cost_per_meter)
      }
    }
    setCostByDin(map)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from('designs')
          .select('id, dno, design_date, image_url, colour, cost_per_meter')
          .order('created_at', { ascending: false })
          .limit(40)
        if (err) throw err
        const rows = (data as DesignRow[]) ?? []
        setDesigns(rows)

        const nums = rows
          .map((d) => Number.parseInt(String(d.dno).replace(/\D/g, ''), 10))
          .filter((n) => !Number.isNaN(n))
        setDno(String(nums.length ? Math.max(...nums) + 1 : 1))

        const dinList = [...new Set(rows.map((r) => r.dno).filter(Boolean))]
        if (!dinList.length) {
          setCostByDin({})
          return
        }
        const { data: costs, error: cErr } = await supabase
          .from('design_costing')
          .select('din_number, final_cost_per_mtr, created_at')
          .in('din_number', dinList)
          .order('created_at', { ascending: false })
        const map: Record<string, number> = {}
        if (!cErr) {
          for (const c of costs ?? []) {
            if (map[c.din_number] == null && c.final_cost_per_mtr != null) {
              map[c.din_number] = Number(c.final_cost_per_mtr)
            }
          }
        }
        for (const r of rows) {
          if (map[r.dno] == null && r.cost_per_meter != null) {
            map[r.dno] = Number(r.cost_per_meter)
          }
        }
        setCostByDin(map)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load failed')
      }
    })()
  }, [])

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  function onImagePicked(file: File | null) {
    setMessage(null)
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      // Non-image (pdf/eml): use as-is without crop
      setImageFile(file)
      return
    }
    const url = URL.createObjectURL(file)
    setPendingRawFile(file)
    setCropFileName(file.name || 'design.jpg')
    setCropSrc(url)
  }

  function clearCropModal() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setPendingRawFile(null)
  }

  function applyImageFile(file: File) {
    setImageFile(file)
    clearCropModal()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!dno.trim()) {
      setError('Design No. required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let image_url: string | null = null
      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'jpg'
        const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('design-images')
          .upload(path, imageFile, {
            upsert: false,
            contentType: imageFile.type || undefined,
          })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('design-images').getPublicUrl(path)
        image_url = pub.publicUrl
      }

      const { error: insErr } = await supabase.from('designs').insert({
        dno: dno.trim(),
        colour: null,
        image_url,
        design_date: designDate,
      })
      if (insErr) throw insErr

      setMessage(`Design ${dno.trim()} registered`)
      setImageFile(null)
      setDesignDate(todayISO())
      await loadDesigns()
      const nextNum = (Number.parseInt(dno.replace(/\D/g, ''), 10) || 0) + 1
      setDno(String(nextNum))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen design-register-screen">
      <header className="screen-header">
        <h1>Design Master</h1>
        <p className="text-muted">Design master entry — naya design register / upload</p>
      </header>

      <form className="form-stack design-register-form surface" onSubmit={(e) => void handleSave(e)}>
        <label className="field">
          <span className="text-muted">DIN / Design No.</span>
          <input value={dno} onChange={(e) => setDno(e.target.value)} required />
        </label>

        <label className="field">
          <span className="text-muted">Date</span>
          <input type="date" value={designDate} onChange={(e) => setDesignDate(e.target.value)} />
        </label>

        <label className="field">
          <span className="text-muted">Design Image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onImagePicked(e.target.files?.[0] ?? null)}
          />
        </label>

        {imagePreview ? (
          <div className="design-register-preview">
            <img src={imagePreview} alt="Design preview" />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setImageFile(null)
              }}
            >
              Clear image
            </button>
          </div>
        ) : null}

        <button type="submit" className="primary-save" disabled={busy}>
          {busy ? 'Saving…' : 'Save Design'}
        </button>
      </form>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      <section className="design-register-list">
        <h2 className="section-title text-warp">Registered designs</h2>
        <div className="list">
          {designs.map((row) => {
            const finalCost = costByDin[row.dno]
            return (
              <article key={row.id} className="card-row surface design-register-card">
                <div className="design-register-card-main">
                  {row.image_url ? (
                    <img src={row.image_url} alt="" className="design-register-thumb" />
                  ) : (
                    <span className="design-register-thumb empty" />
                  )}
                  <div>
                    <strong>{row.dno}</strong>
                    <div className="text-muted">{row.design_date}</div>
                    {finalCost != null ? (
                      <span className="dwc-cost-badge">Final ₹{finalCost.toFixed(2)}/mtr</span>
                    ) : null}
                  </div>
                </div>
                {onOpenDesignCosting ? (
                  <button
                    type="button"
                    className="btn-warp"
                    onClick={() => onOpenDesignCosting(row.dno)}
                  >
                    Add Costing
                  </button>
                ) : null}
              </article>
            )
          })}
          {!designs.length ? <p className="text-muted">No designs registered yet</p> : null}
        </div>
      </section>

      {cropSrc ? (
        <DesignImageCropModal
          imageSrc={cropSrc}
          fileName={cropFileName}
          onCancel={clearCropModal}
          onSkipFull={() => {
            if (pendingRawFile) applyImageFile(pendingRawFile)
            else clearCropModal()
          }}
          onCropped={(file) => applyImageFile(file)}
        />
      ) : null}
    </div>
  )
}
