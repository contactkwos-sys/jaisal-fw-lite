import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

function conversionPreview(warp: number, weft: number, selling: number) {
  return selling - (warp + weft) * 0.08
}

export function DesignScreen() {
  const [dno, setDno] = useState('')
  const [colour, setColour] = useState('')
  const [warpRate, setWarpRate] = useState('0')
  const [weftRate, setWeftRate] = useState('0')
  const [sellingRate, setSellingRate] = useState('0')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('designs')
        .select('dno')
        .order('created_at', { ascending: false })
        .limit(50)
      if (err) {
        setError(err.message)
        return
      }
      const nums = (data ?? [])
        .map((d) => Number.parseInt(String(d.dno).replace(/\D/g, ''), 10))
        .filter((n) => !Number.isNaN(n))
      const next = nums.length ? Math.max(...nums) + 1 : 1
      setDno(String(next))
    })()
  }, [])

  const conversion = useMemo(() => {
    const w = Number(warpRate) || 0
    const f = Number(weftRate) || 0
    const s = Number(sellingRate) || 0
    return conversionPreview(w, f, s)
  }, [warpRate, weftRate, sellingRate])

  async function handleSave() {
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
          .upload(path, imageFile, { upsert: false })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from('design-images').getPublicUrl(path)
        image_url = pub.publicUrl
      }

      const { error: insErr } = await supabase.from('designs').insert({
        dno,
        colour: colour || null,
        image_url,
        warp_rate: Number(warpRate) || 0,
        weft_rate: Number(weftRate) || 0,
        selling_rate: Number(sellingRate) || 0,
      })
      if (insErr) throw insErr
      setMessage('Design saved')
      setColour('')
      setWarpRate('0')
      setWeftRate('0')
      setSellingRate('0')
      setImageFile(null)
      const nextNum = (Number.parseInt(dno.replace(/\D/g, ''), 10) || 0) + 1
      setDno(String(nextNum))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Design Master</h1>
      </header>

      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
      >
        <label className="field">
          <span className="text-muted">Image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <label className="field">
          <span className="text-muted">Dno</span>
          <input value={dno} onChange={(e) => setDno(e.target.value)} required />
        </label>

        <label className="field">
          <span className="text-muted">Colour</span>
          <input value={colour} onChange={(e) => setColour(e.target.value)} />
        </label>

        <label className="field">
          <span className="text-muted">Warp Rate</span>
          <input
            type="number"
            step="0.01"
            value={warpRate}
            onChange={(e) => setWarpRate(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="text-muted">Weft Rate</span>
          <input
            type="number"
            step="0.01"
            value={weftRate}
            onChange={(e) => setWeftRate(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="text-muted">Selling Rate</span>
          <input
            type="number"
            step="0.01"
            value={sellingRate}
            onChange={(e) => setSellingRate(e.target.value)}
          />
        </label>

        <label className="field">
          <span className="text-muted">Conversion Charge</span>
          <input value={conversion.toFixed(2)} readOnly className="readonly" />
        </label>

        {error ? <p className="form-error text-danger">{error}</p> : null}
        {message ? <p className="form-ok text-sage">{message}</p> : null}

        <button type="submit" className="primary-save" disabled={busy}>
          Save
        </button>
      </form>
    </div>
  )
}
