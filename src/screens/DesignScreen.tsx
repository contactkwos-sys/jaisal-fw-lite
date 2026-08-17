import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  WASTAGE_PCT,
  fmtQty,
  num,
  rowAmount,
  summarizeCosting,
  warpWeight,
  weftWeight,
} from '../lib/designCosting'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type WarpRow = {
  item_colour: string
  denier: string
  tar: string
  length: string
  rate: string
  conversion_rate: string
}

type WeftRow = {
  key: string
  item_colour: string
  denier: string
  pic: string
  width: string
  length: string
  rate: string
  conversion_rate: string
  rateSuggested: boolean
}

function emptyWarp(): WarpRow {
  return {
    item_colour: '',
    denier: '',
    tar: '',
    length: '',
    rate: '',
    conversion_rate: '',
  }
}

function emptyWeft(): WeftRow {
  return {
    key: crypto.randomUUID(),
    item_colour: '',
    denier: '',
    pic: '',
    width: '',
    length: '',
    rate: '',
    conversion_rate: '',
    rateSuggested: false,
  }
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

async function suggestWeftRate(itemColour: string): Promise<number | null> {
  const trimmed = itemColour.trim()
  if (!trimmed) return null
  const { data, error } = await supabase
    .from('design_weft')
    .select('rate, item_colour, created_at')
    .ilike('item_colour', escapeIlike(trimmed))
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  const row = data?.[0]
  if (!row || row.rate == null) return null
  return Number(row.rate)
}

export function DesignScreen({ onBroadcast }: { onBroadcast?: () => void }) {
  const { profile } = useAuth()
  const [dno, setDno] = useState('')
  const [designDate, setDesignDate] = useState(todayISO())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [warp, setWarp] = useState<WarpRow>(emptyWarp)
  const [wefts, setWefts] = useState<WeftRow[]>([emptyWeft()])
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

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null)
      return
    }
    const url = URL.createObjectURL(imageFile)
    setImagePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const warpW = useMemo(
    () => warpWeight(num(warp.denier), num(warp.tar), num(warp.length)),
    [warp.denier, warp.tar, warp.length],
  )
  const warpAmt = useMemo(() => rowAmount(warpW, num(warp.rate)), [warpW, warp.rate])

  const weftCalcs = useMemo(
    () =>
      wefts.map((row) => {
        const w = weftWeight(num(row.denier), num(row.pic), num(row.width), num(row.length))
        return { weight: w, amount: rowAmount(w, num(row.rate)) }
      }),
    [wefts],
  )

  const summary = useMemo(
    () =>
      summarizeCosting({
        warpWeight: warpW,
        warpAmount: warpAmt,
        warpConversion: num(warp.conversion_rate),
        weftWeights: weftCalcs.map((c) => c.weight),
        weftAmounts: weftCalcs.map((c) => c.amount),
        weftConversions: wefts.map((r) => num(r.conversion_rate)),
        wastagePct: WASTAGE_PCT,
      }),
    [warpW, warpAmt, warp.conversion_rate, weftCalcs, wefts],
  )

  const onImagePicked = (file: File | null) => {
    setImageFile(file)
    setMessage(null)
    setError(null)
    if (file) {
      // TODO(Phase 9): OCR — auto-extract Design No. and Pick count from uploaded design photos.
      setFormOpen(true)
    }
  }

  const updateWarp = (patch: Partial<WarpRow>) => setWarp((prev) => ({ ...prev, ...patch }))

  const updateWeft = (key: string, patch: Partial<WeftRow>) => {
    setWefts((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  const onWeftItemBlur = useCallback(async (key: string, itemColour: string) => {
    try {
      const suggested = await suggestWeftRate(itemColour)
      if (suggested == null) return
      setWefts((prev) =>
        prev.map((r) => {
          if (r.key !== key) return r
          // Only auto-fill when blank or previously suggested (user override preserved)
          if (r.rate !== '' && !r.rateSuggested) return r
          return { ...r, rate: String(suggested), rateSuggested: true }
        }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rate suggest failed')
    }
  }, [])

  const addWeft = () => setWefts((prev) => [...prev, emptyWeft()])

  const removeWeft = (key: string) => {
    setWefts((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  async function handleSave() {
    if (!profile) return
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

      const header = {
        dno,
        colour: warp.item_colour || wefts[0]?.item_colour || null,
        image_url,
        design_date: designDate,
      }

      const warpPayload = {
        item_colour: warp.item_colour || null,
        denier: num(warp.denier) || null,
        tar: num(warp.tar) || null,
        length: num(warp.length) || null,
        rate: num(warp.rate) || null,
        conversion_rate: num(warp.conversion_rate) || null,
      }

      const weftPayloads = wefts.map((row) => ({
        item_colour: row.item_colour || null,
        denier: num(row.denier) || null,
        pic: num(row.pic) || null,
        width: num(row.width) || null,
        length: num(row.length) || null,
        rate: row.rate === '' ? null : num(row.rate),
        conversion_rate: num(row.conversion_rate) || null,
      }))

      // Inserts allowed for all authenticated roles.
      await (async () => {
        const { data: design, error: insErr } = await supabase
          .from('designs')
          .insert(header)
          .select('id')
          .single()
        if (insErr) throw insErr
        const designId = design.id as string

        const { error: wErr } = await supabase.from('design_warp').insert({
          design_id: designId,
          ...warpPayload,
        })
        if (wErr) throw wErr

        if (weftPayloads.length) {
          const { error: fErr } = await supabase.from('design_weft').insert(
            weftPayloads.map((w) => ({ design_id: designId, ...w })),
          )
          if (fErr) throw fErr
        }
      })()

      setMessage('Design + costing saved')
      setWarp(emptyWarp())
      setWefts([emptyWeft()])
      setImageFile(null)
      setFormOpen(false)
      setDesignDate(todayISO())
      const nextNum = (Number.parseInt(dno.replace(/\D/g, ''), 10) || 0) + 1
      setDno(String(nextNum))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen design-costing">
      <header className="screen-header design-costing-header">
        <h1>Design Master</h1>
        <p className="text-muted design-costing-sub">Factory costing register</p>
        {onBroadcast ? (
          <button type="button" className="btn-wa" onClick={() => onBroadcast()}>
            Broadcast
          </button>
        ) : null}
      </header>

      <div className="design-costing-card">
        <label className="field field-manual">
          <span>Design No.</span>
          <input value={dno} onChange={(e) => setDno(e.target.value)} required />
        </label>

        <label className="field field-manual">
          <span>Date</span>
          <input
            type="date"
            value={designDate}
            onChange={(e) => setDesignDate(e.target.value)}
          />
        </label>

        <label className="field field-manual">
          <span>Design Image / Email File</span>
          <input
            type="file"
            accept="image/*,.pdf,.eml,.msg"
            onChange={(e) => onImagePicked(e.target.files?.[0] ?? null)}
          />
        </label>

        {imagePreview ? (
          <div className="design-costing-preview">
            <img src={imagePreview} alt="Design preview" />
          </div>
        ) : null}
      </div>

      {!formOpen ? (
        <p className="design-costing-hint text-muted">
          Upload a design image or email file to open the costing form.
        </p>
      ) : (
        <form
          className="design-costing-form"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <section className="design-section">
            <h2>WARP</h2>
            <p className="text-muted section-note">Exactly one row</p>
            <div className="design-row-grid">
              <label className="field field-manual">
                <span>Item / Colour</span>
                <input
                  value={warp.item_colour}
                  onChange={(e) => updateWarp({ item_colour: e.target.value })}
                  placeholder="e.g. 150 Black and White"
                />
              </label>
              <label className="field field-manual">
                <span>Denier</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={warp.denier}
                  onChange={(e) => updateWarp({ denier: e.target.value })}
                />
              </label>
              <label className="field field-manual">
                <span>TAR</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={warp.tar}
                  onChange={(e) => updateWarp({ tar: e.target.value })}
                />
              </label>
              <label className="field field-manual">
                <span>Length</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={warp.length}
                  onChange={(e) => updateWarp({ length: e.target.value })}
                />
              </label>
              <label className="field field-manual">
                <span>Rate</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={warp.rate}
                  onChange={(e) => updateWarp({ rate: e.target.value })}
                />
              </label>
              <label className="field field-auto">
                <span>Weight (kg)</span>
                <input className="num" value={fmtQty(warpW)} readOnly />
              </label>
              <label className="field field-auto">
                <span>Amount</span>
                <input className="num" value={fmtQty(warpAmt)} readOnly />
              </label>
              <label className="field field-manual">
                <span>Conversion Rate / mtr</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={warp.conversion_rate}
                  onChange={(e) => updateWarp({ conversion_rate: e.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="design-section">
            <div className="section-head">
              <div>
                <h2>WEFT</h2>
                <p className="text-muted section-note">Add as many rows as needed</p>
              </div>
              <button type="button" className="btn-add-weft" onClick={addWeft}>
                + Add Weft Row
              </button>
            </div>

            {wefts.map((row, idx) => {
              const calc = weftCalcs[idx]
              return (
                <div key={row.key} className="design-weft-block">
                  <div className="weft-block-head">
                    <strong>Weft {idx + 1}</strong>
                    {wefts.length > 1 ? (
                      <button
                        type="button"
                        className="btn-remove-weft"
                        onClick={() => removeWeft(row.key)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="design-row-grid">
                    <label className="field field-manual">
                      <span>Item / Colour</span>
                      <input
                        value={row.item_colour}
                        onChange={(e) =>
                          updateWeft(row.key, { item_colour: e.target.value, rateSuggested: false })
                        }
                        onBlur={() => void onWeftItemBlur(row.key, row.item_colour)}
                        placeholder="e.g. 150 Lichi"
                      />
                    </label>
                    <label className="field field-manual">
                      <span>Denier</span>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.denier}
                        onChange={(e) => updateWeft(row.key, { denier: e.target.value })}
                      />
                    </label>
                    <label className="field field-manual">
                      <span>Pic</span>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.pic}
                        onChange={(e) => updateWeft(row.key, { pic: e.target.value })}
                      />
                    </label>
                    <label className="field field-manual">
                      <span>Width</span>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.width}
                        onChange={(e) => updateWeft(row.key, { width: e.target.value })}
                      />
                    </label>
                    <label className="field field-manual">
                      <span>Length</span>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.length}
                        onChange={(e) => updateWeft(row.key, { length: e.target.value })}
                      />
                    </label>
                    <label className={`field ${row.rateSuggested ? 'field-auto' : 'field-manual'}`}>
                      <span>Rate{row.rateSuggested ? ' (suggested)' : ''}</span>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.rate}
                        onChange={(e) =>
                          updateWeft(row.key, { rate: e.target.value, rateSuggested: false })
                        }
                      />
                    </label>
                    <label className="field field-auto">
                      <span>Weight (kg)</span>
                      <input className="num" value={fmtQty(calc.weight)} readOnly />
                    </label>
                    <label className="field field-auto">
                      <span>Amount</span>
                      <input className="num" value={fmtQty(calc.amount)} readOnly />
                    </label>
                    <label className="field field-manual">
                      <span>Conversion Rate / mtr</span>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.conversion_rate}
                        onChange={(e) => updateWeft(row.key, { conversion_rate: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </section>

          <section className="design-summary">
            <h2>Summary</h2>
            <div className="summary-grid">
              <div className="summary-row field-auto">
                <span>Total Weight</span>
                <strong className="num">{fmtQty(summary.totalWeight)} kg</strong>
              </div>
              <div className="summary-row field-auto">
                <span>Total Yarn Cost</span>
                <strong className="num">₹{fmtQty(summary.totalYarnCost)}</strong>
              </div>
              <div className="summary-row field-auto">
                <span>Total Conversion</span>
                <strong className="num">₹{fmtQty(summary.totalConversion)}</strong>
              </div>
              <div className="summary-row field-auto">
                <span>Wastage ({(WASTAGE_PCT * 100).toFixed(0)}%)</span>
                <strong className="num">₹{fmtQty(summary.wastage)}</strong>
              </div>
            </div>
            <div className="final-cost">
              <span>Final Cost / Meter</span>
              <strong className="num">₹{fmtQty(summary.finalCostPerMeter)}</strong>
            </div>
          </section>

          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-ok">{message}</p> : null}

          <button type="submit" className="btn-save-design" disabled={busy}>
            {busy ? 'Saving…' : 'Save Design + Costing'}
          </button>
        </form>
      )}

      {!formOpen && error ? <p className="form-error">{error}</p> : null}
      {!formOpen && message ? <p className="form-ok">{message}</p> : null}
    </div>
  )
}
