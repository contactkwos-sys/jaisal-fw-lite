import { useCallback, useEffect, useState } from 'react'
import { InputModePanel } from '../components/InputModePanel'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { BeamPipeOut, BeamPipeStock } from '../lib/database.types'
import { applyOrQueue, nowTimeHHMM, todayISO, uploadFactoryPhoto } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type Sub = 'weft' | 'beam_out' | 'beam_in' | 'warp'
type Mode = 'scan' | 'manual' | 'photo'

type Props = { initialSub?: Sub }

export function PurchaseScreen({ initialSub = 'weft' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Weft purchase
  const [mode, setMode] = useState<Mode>('manual')
  const [quality, setQuality] = useState('')
  const [weight, setWeight] = useState('')
  const [rate, setRate] = useState('')
  const [supplier, setSupplier] = useState('')
  const [barcode, setBarcode] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [suppliers, setSuppliers] = useState<string[]>([])

  // Beam out
  const [varieties, setVarieties] = useState<BeamPipeStock[]>([])
  const [pipeVariety, setPipeVariety] = useState('')
  const [vendor, setVendor] = useState('')
  const [dateOut, setDateOut] = useState(todayISO())
  const [timeOut, setTimeOut] = useState(nowTimeHHMM())
  const [pendingOut, setPendingOut] = useState<BeamPipeOut[]>([])

  // Beam in
  const [inVariety, setInVariety] = useState('')
  const [kg, setKg] = useState('')
  const [tar, setTar] = useState('')
  const [meter, setMeter] = useState('')
  const [challanNo, setChallanNo] = useState('')
  const [gstNo, setGstNo] = useState('')
  const [gstAmt, setGstAmt] = useState('')
  const [outId, setOutId] = useState('')

  // Warp inward
  const [warpMode, setWarpMode] = useState<Mode>('manual')
  const [colour, setColour] = useState('')
  const [qty, setQty] = useState('')
  const [warpSupplier, setWarpSupplier] = useState('')
  const [warpGst, setWarpGst] = useState('')
  const [invoice, setInvoice] = useState('')
  const [warpPhoto, setWarpPhoto] = useState<File | null>(null)

  const loadMeta = useCallback(async () => {
    const [{ data: yarns }, { data: beams }, { data: outs }] = await Promise.all([
      supabase.from('weft_yarn_stock').select('supplier'),
      supabase.from('beam_pipe_stock').select('*').order('variety_name'),
      supabase
        .from('beam_pipe_out')
        .select('*')
        .eq('status', 'pending_return')
        .order('created_at', { ascending: false }),
    ])
    const uniq = [
      ...new Set((yarns ?? []).map((y) => y.supplier).filter(Boolean) as string[]),
    ]
    setSuppliers(uniq)
    setVarieties((beams as BeamPipeStock[]) ?? [])
    if (!pipeVariety && beams?.[0]) setPipeVariety(beams[0].variety_name)
    if (!inVariety && beams?.[0]) setInVariety(beams[0].variety_name)
    setPendingOut((outs as BeamPipeOut[]) ?? [])
  }, [pipeVariety, inVariety])

  useEffect(() => {
    void loadMeta().catch((e: Error) => setError(e.message))
  }, [loadMeta])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  async function saveWeft(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let photo_url: string | null = null
      if (mode === 'photo' && photoFile) {
        photo_url = await uploadFactoryPhoto(photoFile, 'weft-purchases')
      }
      const payload = {
        quality: quality.trim(),
        weight_kg: Number(weight) || 0,
        rate: Number(rate) || 0,
        supplier: supplier.trim() || null,
        input_mode: mode,
        photo_url,
        barcode,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'weft_purchases',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('weft_purchases').insert(payload)
          if (iErr) throw iErr
          // Upsert weft_yarn_stock by supplier + colour(quality)
          const { data: existing } = await supabase
            .from('weft_yarn_stock')
            .select('*')
            .eq('supplier', supplier.trim())
            .eq('colour_name', quality.trim())
            .maybeSingle()
          if (existing) {
            const { error: uErr } = await supabase
              .from('weft_yarn_stock')
              .update({
                stock_kg: Number(existing.stock_kg) + (Number(weight) || 0),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
            if (uErr) throw uErr
          } else {
            const { error: sErr } = await supabase.from('weft_yarn_stock').insert({
              supplier: supplier.trim() || null,
              colour_name: quality.trim(),
              colour_no: barcode,
              stock_kg: Number(weight) || 0,
            })
            if (sErr) throw sErr
          }
        },
      })
      setMessage(result === 'applied' ? 'Weft purchase saved + stock updated' : 'Sent to approval queue')
      setQuality('')
      setWeight('')
      setRate('')
      setBarcode(null)
      setPhotoFile(null)
      await loadMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveBeamOut(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        pipe_variety: pipeVariety,
        vendor_name: vendor.trim(),
        date_out: dateOut,
        time_out: timeOut.length === 5 ? `${timeOut}:00` : timeOut,
        status: 'pending_return',
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'beam_pipe_out',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('beam_pipe_out').insert(payload)
          if (iErr) throw iErr
          const row = varieties.find((v) => v.variety_name === pipeVariety)
          if (row && row.quantity_pcs > 0) {
            await supabase
              .from('beam_pipe_stock')
              .update({
                quantity_pcs: row.quantity_pcs - 1,
                is_filled: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', row.id)
          }
        },
      })
      setMessage(result === 'applied' ? 'Beam pipe OUT recorded' : 'Sent to approval queue')
      setVendor('')
      await loadMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveBeamIn(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        pipe_variety: inVariety,
        kg: Number(kg) || 0,
        tar_count: Number(tar) || 0,
        meter: Number(meter) || 0,
        challan_no: challanNo || null,
        gst_no: gstNo || null,
        gst_amount: Number(gstAmt) || 0,
        out_id: outId || null,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'beam_pipe_in',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('beam_pipe_in').insert(payload)
          if (iErr) throw iErr
          if (outId) {
            await supabase
              .from('beam_pipe_out')
              .update({ status: 'returned' })
              .eq('id', outId)
          }
          const row = varieties.find((v) => v.variety_name === inVariety)
          if (row) {
            await supabase
              .from('beam_pipe_stock')
              .update({
                quantity_pcs: row.quantity_pcs + 1,
                is_filled: true,
                updated_at: new Date().toISOString(),
              })
              .eq('id', row.id)
          } else {
            await supabase.from('beam_pipe_stock').insert({
              variety_name: inVariety,
              quantity_pcs: 1,
              is_filled: true,
            })
          }
        },
      })
      setMessage(result === 'applied' ? 'Beam pipe IN saved (filled)' : 'Sent to approval queue')
      setKg('')
      setTar('')
      setMeter('')
      setChallanNo('')
      setGstNo('')
      setGstAmt('')
      setOutId('')
      await loadMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveWarp(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let photo_url: string | null = null
      if (warpMode === 'photo' && warpPhoto) {
        photo_url = await uploadFactoryPhoto(warpPhoto, 'warp-inward')
      }
      const payload = {
        colour: colour.trim(),
        qty_kg: Number(qty) || 0,
        supplier: warpSupplier.trim() || null,
        gst_no: warpGst || null,
        invoice_no: invoice || null,
        input_mode: warpMode,
        photo_url,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'warp_yarn_inward',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('warp_yarn_inward').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Warp yarn inward saved' : 'Sent to approval queue')
      setColour('')
      setQty('')
      setWarpGst('')
      setInvoice('')
      setWarpPhoto(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Purchase & Inward</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'weft', label: 'Weft Buy' },
            { id: 'beam_out', label: 'Beam Out' },
            { id: 'beam_in', label: 'Beam In' },
            { id: 'warp', label: 'Warp In' },
          ]}
        />
      </header>

      {sub === 'weft' ? (
        <form className="form-stack" onSubmit={(e) => void saveWeft(e)}>
          <InputModePanel
            value={mode}
            onChange={setMode}
            onBarcode={(c) => {
              setBarcode(c)
              if (!quality) setQuality(c)
            }}
            onPhoto={setPhotoFile}
          >
            <label className="field">
              <span className="text-muted">Quality</span>
              <input value={quality} onChange={(e) => setQuality(e.target.value)} required placeholder="150 Bright" />
            </label>
            <label className="field">
              <span className="text-muted">Weight (kg)</span>
              <input className="num" type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Rate (₹/kg)</span>
              <input className="num" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Supplier</span>
              <input list="supplier-list" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              <datalist id="supplier-list">
                {suppliers.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
          </InputModePanel>
          <button type="submit" className="primary-save" disabled={busy}>Save</button>
        </form>
      ) : null}

      {sub === 'beam_out' ? (
        <form className="form-stack" onSubmit={(e) => void saveBeamOut(e)}>
          <label className="field">
            <span className="text-muted">Pipe No / Colour</span>
            <select value={pipeVariety} onChange={(e) => setPipeVariety(e.target.value)} required>
              {varieties.map((v) => (
                <option key={v.id} value={v.variety_name}>
                  {v.variety_name} ({v.quantity_pcs} pcs{v.is_filled ? ', filled' : ''})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Kisko Gaya</span>
            <input value={vendor} onChange={(e) => setVendor(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={dateOut} onChange={(e) => setDateOut(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Time</span>
            <input type="time" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
          </label>
          <p className="text-muted2">Status: Pending Return</p>
          <button type="submit" className="primary-save" disabled={busy}>Save OUT</button>
        </form>
      ) : null}

      {sub === 'beam_in' ? (
        <form className="form-stack" onSubmit={(e) => void saveBeamIn(e)}>
          <label className="field">
            <span className="text-muted">Match pending OUT</span>
            <select value={outId} onChange={(e) => {
              setOutId(e.target.value)
              const p = pendingOut.find((o) => o.id === e.target.value)
              if (p) setInVariety(p.pipe_variety)
            }}>
              <option value="">— optional —</option>
              {pendingOut.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.pipe_variety} → {o.vendor_name} ({o.date_out})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Pipe No / Colour</span>
            <select value={inVariety} onChange={(e) => setInVariety(e.target.value)} required>
              {varieties.map((v) => (
                <option key={v.id} value={v.variety_name}>{v.variety_name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Kg Aaya</span>
            <input className="num" type="number" step="0.01" value={kg} onChange={(e) => setKg(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Tar count</span>
            <input className="num" type="number" value={tar} onChange={(e) => setTar(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Meter Bhara</span>
            <input className="num" type="number" step="0.01" value={meter} onChange={(e) => setMeter(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Challan No</span>
            <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">GST No</span>
            <input value={gstNo} onChange={(e) => setGstNo(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">GST Amount</span>
            <input className="num" type="number" step="0.01" value={gstAmt} onChange={(e) => setGstAmt(e.target.value)} />
          </label>
          <button type="submit" className="primary-save" disabled={busy}>Save IN</button>
        </form>
      ) : null}

      {sub === 'warp' ? (
        <form className="form-stack" onSubmit={(e) => void saveWarp(e)}>
          <InputModePanel
            value={warpMode}
            onChange={setWarpMode}
            onBarcode={(c) => { if (!colour) setColour(c) }}
            onPhoto={setWarpPhoto}
          >
            <label className="field">
              <span className="text-muted">Colour</span>
              <input value={colour} onChange={(e) => setColour(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Qty (kg)</span>
              <input className="num" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Supplier</span>
              <input value={warpSupplier} onChange={(e) => setWarpSupplier(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">GST No</span>
              <input value={warpGst} onChange={(e) => setWarpGst(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Invoice No</span>
              <input value={invoice} onChange={(e) => setInvoice(e.target.value)} />
            </label>
          </InputModePanel>
          <button type="submit" className="primary-save" disabled={busy}>Save</button>
        </form>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
