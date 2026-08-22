import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { getSetting, setSetting } from '../lib/appSettings'
import { WASTAGE_PCT } from '../lib/designCosting'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'
import {
  computeBuildup,
  computeWarpRow,
  computeWeftRow,
  emptyWarp,
  emptyWeft,
  fmtMoney,
  fmtQty,
  n,
  parseDiaryNumbers,
  type WarpDraft,
  type WeftDraft,
} from '../lib/designWiseCosting'

type Props = {
  initialDin?: string
  /** Compact embed for Sample Program Card workflow */
  embedded?: boolean
  onCostingSaved?: (info: {
    din: string
    designId: string | null
    costPerMeter: number
    sellRate: number
    difference: number
  }) => void
}

type DesignOpt = { id: string; dno: string; colour: string | null }

/**
 * Diary OCR: best-effort via dynamic `tesseract.js` import.
 * If OCR quality is poor on handwritten pages, fields stay editable.
 * For higher accuracy, set VITE_OCR_API_URL to an external OCR endpoint
 * (may require an API key from the user / env).
 */
async function ocrDiaryImage(file: File): Promise<string> {
  const endpoint = import.meta.env.VITE_OCR_API_URL as string | undefined
  if (endpoint) {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(endpoint, { method: 'POST', body })
    if (!res.ok) throw new Error(`OCR API ${res.status}`)
    const json = (await res.json()) as { text?: string }
    return json.text || ''
  }

  try {
    const mod = await import('tesseract.js')
    const result = await mod.recognize(file, 'eng')
    return result.data.text || ''
  } catch {
    // tesseract not available / failed — manual entry remains the fallback
    return ''
  }
}

export function DesignWiseCosting({ initialDin = '', embedded = false, onCostingSaved }: Props) {
  const { session, profile } = useAuth()
  const [dinNumber, setDinNumber] = useState(initialDin)
  const [costingDate, setCostingDate] = useState(todayISO())
  const [qualityName, setQualityName] = useState('')
  const [designOpts, setDesignOpts] = useState<DesignOpt[]>([])
  const [diaryUrl, setDiaryUrl] = useState<string | null>(null)
  const [ocrNote, setOcrNote] = useState<string | null>(null)
  const [warps, setWarps] = useState<WarpDraft[]>([emptyWarp(1)])
  const [wefts, setWefts] = useState<WeftDraft[]>([emptyWeft(1)])
  const [conversion, setConversion] = useState('0')
  const [muPercent, setMuPercent] = useState('5')
  const [gstPercent, setGstPercent] = useState('5')
  const [gstEnabled, setGstEnabled] = useState(true)
  const [ratePerMeter, setRatePerMeter] = useState('0')
  const [sellRate, setSellRate] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (initialDin) setDinNumber(initialDin)
  }, [initialDin])

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('designs')
        .select('id, dno, colour')
        .order('created_at', { ascending: false })
        .limit(100)
      setDesignOpts((data as DesignOpt[]) ?? [])
      try {
        const persisted = await getSetting('design_rate_per_meter', '0')
        if (persisted) setRatePerMeter(persisted)
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const effectiveGst = gstEnabled ? n(gstPercent) : 0

  const buildup = useMemo(
    () => computeBuildup(warps, wefts, n(conversion), n(muPercent), effectiveGst),
    [warps, wefts, conversion, muPercent, effectiveGst],
  )

  /** Factory register formula: yarn + 5% wastage + conversion (± GST). */
  const formula = useMemo(() => {
    const totalYarn = buildup.totalYarnAmount
    const wastage = totalYarn * WASTAGE_PCT
    const base = totalYarn + wastage + n(conversion)
    const withGst = gstEnabled ? base * (1 + n(gstPercent) / 100) : base
    const perMtr =
      buildup.designLengthMtr > 0 ? withGst / buildup.designLengthMtr : withGst
    return { totalYarn, wastage, base, withGst, perMtr }
  }, [buildup.totalYarnAmount, buildup.designLengthMtr, conversion, gstEnabled, gstPercent])

  const costPerMeter = formula.perMtr
  const sell = n(sellRate)
  const difference = sell - costPerMeter

  const loadExisting = useCallback(async (din: string) => {
    const trimmed = din.trim()
    if (!trimmed) return
    const { data: header, error: hErr } = await supabase
      .from('design_costing')
      .select('*')
      .eq('din_number', trimmed)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hErr) throw hErr
    if (!header) return

    setSavedId(header.id)
    setDinNumber(header.din_number)
    setQualityName(header.quality_name || '')
    setCostingDate(header.costing_date || todayISO())
    setDiaryUrl(header.diary_image_url)
    setConversion(String(header.conversion_charge ?? 0))
    setMuPercent(String(header.mu_percent ?? 5))
    setGstPercent(String(header.gst_percent ?? 5))
    setGstEnabled(header.gst_enabled !== false)
    if (header.rate_per_meter != null) setRatePerMeter(String(header.rate_per_meter))
    if (header.sell_rate != null) setSellRate(String(header.sell_rate))

    const [{ data: warpRows }, { data: weftRows }] = await Promise.all([
      supabase.from('design_costing_warp').select('*').eq('costing_id', header.id).order('sr_no'),
      supabase.from('design_costing_weft').select('*').eq('costing_id', header.id).order('sr_no'),
    ])

    setWarps(
      (warpRows ?? []).length
        ? (warpRows ?? []).map((r, i) => ({
            key: r.id || crypto.randomUUID(),
            sr_no: r.sr_no ?? i + 1,
            yarn_name: r.yarn_name || '',
            denier: r.denier != null ? String(r.denier) : '',
            tar_ends: r.tar_ends != null ? String(r.tar_ends) : '',
            length_mtr: r.length_mtr != null ? String(r.length_mtr) : '',
            rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
          }))
        : [emptyWarp(1)],
    )
    setWefts(
      (weftRows ?? []).length
        ? (weftRows ?? []).map((r, i) => ({
            key: r.id || crypto.randomUUID(),
            sr_no: r.sr_no ?? i + 1,
            weft_name: r.weft_name || '',
            denier: r.denier != null ? String(r.denier) : '',
            pic: r.pic != null ? String(r.pic) : '',
            width: r.width != null ? String(r.width) : '',
            length_mtr: r.length_mtr != null ? String(r.length_mtr) : '',
            rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
          }))
        : [emptyWeft(1)],
    )
    setMessage(`Loaded saved costing for ${trimmed}`)
  }, [])

  async function handleDiaryFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setError(null)
    setOcrNote(null)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('costing-diary-images')
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('costing-diary-images').getPublicUrl(path)
      setDiaryUrl(pub.publicUrl)

      const text = await ocrDiaryImage(file)
      const parsed = parseDiaryNumbers(text)
      if (parsed.denier || parsed.tar || parsed.length || parsed.pic || parsed.width) {
        setWarps((prev) => {
          const row = { ...prev[0] }
          if (parsed.denier) row.denier = parsed.denier
          if (parsed.tar) row.tar_ends = parsed.tar
          if (parsed.length) row.length_mtr = parsed.length
          if (parsed.rate) row.rate_per_kg = parsed.rate
          return [row, ...prev.slice(1)]
        })
        setWefts((prev) => {
          const row = { ...prev[0] }
          if (parsed.denier && !parsed.tar) row.denier = parsed.denier
          if (parsed.pic) row.pic = parsed.pic
          if (parsed.width) row.width = parsed.width
          if (parsed.length) row.length_mtr = parsed.length
          if (parsed.rate) row.rate_per_kg = parsed.rate
          return [row, ...prev.slice(1)]
        })
        setOcrNote(
          'Photo padh li gayi — values neeche auto-fill hue hain, check karke confirm karein',
        )
      } else {
        setOcrNote(
          'Photo upload ho gayi. OCR se clear numbers nahi mile — fields manually bhariye.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diary upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function persist(asDraftLabel: boolean) {
    if (!dinNumber.trim()) {
      setError('DIN / Design No. required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const totals = computeBuildup(warps, wefts, n(conversion), n(muPercent), effectiveGst)
      const totalYarn = totals.totalYarnAmount
      const wastage = totalYarn * WASTAGE_PCT
      const formulaBase = totalYarn + wastage + n(conversion)
      const formulaWithGst = gstEnabled ? formulaBase * (1 + n(gstPercent) / 100) : formulaBase
      const formulaPerMtr =
        totals.designLengthMtr > 0 ? formulaWithGst / totals.designLengthMtr : formulaWithGst
      const sell = n(sellRate)
      const diff = sell - formulaPerMtr

      // Persist rate-per-meter until user changes it
      await setSetting('design_rate_per_meter', String(n(ratePerMeter)))

      const header = {
        din_number: dinNumber.trim(),
        quality_name: qualityName.trim() || null,
        costing_date: costingDate,
        diary_image_url: diaryUrl,
        conversion_charge: totals.conversionCharge,
        mu_percent: totals.muPercent,
        gst_percent: n(gstPercent),
        gst_enabled: gstEnabled,
        rate_per_meter: n(ratePerMeter),
        sell_rate: sell || null,
        difference: sell ? diff : null,
        wastage_amount: wastage,
        formula_cost_per_mtr: formulaPerMtr,
        total_weight_kg: totals.totalWeightKg,
        total_yarn_amount: totals.totalYarnAmount,
        yarn_cost_per_mtr: totals.yarnCostPerMtr,
        subtotal_per_mtr: totals.subtotalPerMtr,
        after_mu_per_mtr: totals.afterMuPerMtr,
        final_cost_per_mtr: formulaPerMtr,
        created_by: session?.user?.id || null,
      }

      let costingId = savedId
      if (costingId) {
        const { error: uErr } = await supabase.from('design_costing').update(header).eq('id', costingId)
        if (uErr) throw uErr
        await supabase.from('design_costing_warp').delete().eq('costing_id', costingId)
        await supabase.from('design_costing_weft').delete().eq('costing_id', costingId)
      } else {
        const { data, error: iErr } = await supabase
          .from('design_costing')
          .insert(header)
          .select('id')
          .single()
        if (iErr) throw iErr
        costingId = data.id
        setSavedId(costingId)
      }

      const warpPayload = warps.map((row, i) => ({
        costing_id: costingId,
        sr_no: i + 1,
        yarn_name: row.yarn_name.trim() || null,
        denier: n(row.denier) || null,
        tar_ends: n(row.tar_ends) || null,
        length_mtr: n(row.length_mtr) || null,
        rate_per_kg: n(row.rate_per_kg) || null,
      }))
      const weftPayload = wefts.map((row, i) => ({
        costing_id: costingId,
        sr_no: i + 1,
        weft_name: row.weft_name.trim() || null,
        denier: n(row.denier) || null,
        pic: n(row.pic) || null,
        width: n(row.width) || null,
        length_mtr: n(row.length_mtr) || null,
        rate_per_kg: n(row.rate_per_kg) || null,
      }))

      if (warpPayload.length) {
        const { error: wErr } = await supabase.from('design_costing_warp').insert(warpPayload)
        if (wErr) throw wErr
      }
      if (weftPayload.length) {
        const { error: fErr } = await supabase.from('design_costing_weft').insert(weftPayload)
        if (fErr) throw fErr
      }

      // Mirror final cost onto designs when DIN matches a Design Master row
      const { data: designRow } = await supabase
        .from('designs')
        .update({
          cost_per_meter: formulaPerMtr,
          total_cost: formulaPerMtr,
          rate_per_meter: n(ratePerMeter),
          sell_rate: sell || null,
          gst_percent: n(gstPercent),
        })
        .eq('dno', dinNumber.trim())
        .select('id')
        .maybeSingle()

      setMessage(
        asDraftLabel
          ? `Draft saved · Cost ₹${fmtMoney(formulaPerMtr)}/mtr`
          : `Costing saved to DIN ${dinNumber.trim()} · Cost ₹${fmtMoney(formulaPerMtr)}/mtr`,
      )
      onCostingSaved?.({
        din: dinNumber.trim(),
        designId: designRow?.id ?? null,
        costPerMeter: formulaPerMtr,
        sellRate: sell,
        difference: diff,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={embedded ? 'dwc-screen dwc-embedded' : 'screen dwc-screen'}>
      {!embedded ? (
        <header className="screen-header">
          <h1>Design Wise Costing</h1>
          <p className="text-muted">Diary OCR → warp/weft formula → cost/mtr · sell · difference</p>
        </header>
      ) : (
        <h2 className="section-title">1. New Design / DIN Costing</h2>
      )}

      <section className="dwc-panel">
        <h2 className="section-title text-warp">Design Details</h2>
        <div className="dwc-details-row">
          <label className="field">
            <span className="text-muted">DIN / Design No.</span>
            <input
              list="dwc-design-list"
              value={dinNumber}
              onChange={(e) => setDinNumber(e.target.value)}
              onBlur={() => void loadExisting(dinNumber).catch((e: Error) => setError(e.message))}
              placeholder="e.g. JFG1653"
              required
            />
            <datalist id="dwc-design-list">
              {designOpts.map((d) => (
                <option key={d.id} value={d.dno}>
                  {d.colour || ''}
                </option>
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={costingDate} onChange={(e) => setCostingDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Quality Name</span>
            <input value={qualityName} onChange={(e) => setQualityName(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="dwc-panel">
        <h2 className="section-title text-warp">Diary Page Upload</h2>
        <div className="dwc-upload-row">
          <label
            className={dragOver ? 'dwc-dropzone drag-over' : 'dwc-dropzone'}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              void handleDiaryFile(e.dataTransfer.files?.[0] ?? null)
            }}
          >
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => void handleDiaryFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-muted">
              {uploading ? 'Uploading / OCR…' : 'Drag & drop, click, or Take Photo'}
            </span>
          </label>
          {diaryUrl ? (
            <div className="dwc-diary-preview" style={{ backgroundImage: `url(${diaryUrl})` }} />
          ) : (
            <div className="dwc-diary-preview empty">Preview</div>
          )}
        </div>
        {ocrNote ? <p className="form-ok text-sage">{ocrNote}</p> : null}
      </section>

      <section className="dwc-panel">
        <div className="dwc-panel-head">
          <h2 className="section-title text-warp">Warp Details</h2>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Yarn Name</th>
                <th>Denier</th>
                <th>TAR (Ends)</th>
                <th>Length (mtr)</th>
                <th>Weight (kg)</th>
                <th>Rate (₹/kg)</th>
                <th>Amount (₹)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {warps.map((row, idx) => {
                const calc = computeWarpRow(row)
                return (
                  <tr key={row.key}>
                    <td className="num">{idx + 1}</td>
                    <td>
                      <input
                        value={row.yarn_name}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, yarn_name: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.denier}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, denier: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.tar_ends}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, tar_ends: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.length_mtr}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, length_mtr: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input className="num dwc-auto" value={fmtQty(calc.weight)} readOnly />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.rate_per_kg}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, rate_per_kg: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input className="num dwc-auto" value={fmtMoney(calc.amount)} readOnly />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dwc-icon-btn"
                        disabled={warps.length <= 1}
                        onClick={() =>
                          setWarps((prev) =>
                            prev.length <= 1
                              ? prev
                              : prev.filter((r) => r.key !== row.key).map((r, i) => ({ ...r, sr_no: i + 1 })),
                          )
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="btn-warp"
          onClick={() => setWarps((prev) => [...prev, emptyWarp(prev.length + 1)])}
        >
          + Add Warp Yarn
        </button>
      </section>

      <section className="dwc-panel">
        <div className="dwc-panel-head">
          <h2 className="section-title text-warp">Weft Details</h2>
          <span className="dwc-pic-total text-weft">Total PIC: {fmtQty(buildup.totalPic, 1)}</span>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Weft Name</th>
                <th>Denier</th>
                <th>PIC</th>
                <th>Width</th>
                <th>Length (mtr)</th>
                <th>Weight (kg)</th>
                <th>Rate (₹/kg)</th>
                <th>Amount (₹)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {wefts.map((row, idx) => {
                const calc = computeWeftRow(row)
                return (
                  <tr key={row.key}>
                    <td className="num">{idx + 1}</td>
                    <td>
                      <input
                        value={row.weft_name}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, weft_name: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.denier}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, denier: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.pic}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, pic: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.width}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, width: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.length_mtr}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, length_mtr: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input className="num dwc-auto" value={fmtQty(calc.weight)} readOnly />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        step="any"
                        value={row.rate_per_kg}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, rate_per_kg: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input className="num dwc-auto" value={fmtMoney(calc.amount)} readOnly />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dwc-icon-btn"
                        disabled={wefts.length <= 1}
                        onClick={() =>
                          setWefts((prev) =>
                            prev.length <= 1
                              ? prev
                              : prev.filter((r) => r.key !== row.key).map((r, i) => ({ ...r, sr_no: i + 1 })),
                          )
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="btn-warp"
          onClick={() => setWefts((prev) => [...prev, emptyWeft(prev.length + 1)])}
        >
          + Add Weft Yarn
        </button>
      </section>

      <div className="dwc-totals-strip">
        <div>
          <span className="text-muted">Total Weight (kg)</span>
          <strong className="num">{fmtQty(buildup.totalWeightKg)}</strong>
        </div>
        <div>
          <span className="text-muted">Total Yarn Amount (₹)</span>
          <strong className="num text-weft">{fmtMoney(buildup.totalYarnAmount)}</strong>
        </div>
      </div>

      <section className="dwc-panel dwc-buildup">
        <h2 className="section-title text-warp">Per Meter Costing Buildup</h2>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span className="text-muted">Rate / Meter (persists)</span>
            <input
              className="num"
              type="number"
              step="any"
              value={ratePerMeter}
              onChange={(e) => setRatePerMeter(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Yarn Cost / Mtr</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.yarnCostPerMtr)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Conversion / Weaving Charge (₹)</span>
            <input
              className="num"
              type="number"
              step="any"
              value={conversion}
              onChange={(e) => setConversion(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Wastage 5% (auto)</span>
            <input className="num dwc-auto" value={fmtMoney(formula.wastage)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Subtotal</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.subtotalPerMtr)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">MU %</span>
            <input
              className="num"
              type="number"
              step="any"
              value={muPercent}
              onChange={(e) => setMuPercent(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">After MU</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.afterMuPerMtr)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">GST</span>
            <div className="cashbook-type-toggle" role="group">
              <button
                type="button"
                className={gstEnabled ? 'cashbook-type-btn credit active' : 'cashbook-type-btn credit'}
                onClick={() => setGstEnabled(true)}
              >
                On
              </button>
              <button
                type="button"
                className={!gstEnabled ? 'cashbook-type-btn debit active' : 'cashbook-type-btn debit'}
                onClick={() => setGstEnabled(false)}
              >
                Off
              </button>
            </div>
          </label>
          <label className="field">
            <span className="text-muted">GST %</span>
            <input
              className="num"
              type="number"
              step="any"
              value={gstPercent}
              disabled={!gstEnabled}
              onChange={(e) => setGstPercent(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Sell Rate (₹/mtr)</span>
            <input
              className="num"
              type="number"
              step="any"
              value={sellRate}
              onChange={(e) => setSellRate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Difference (Sell − Cost)</span>
            <input
              className="num dwc-auto"
              value={fmtMoney(difference)}
              readOnly
              style={{ color: difference >= 0 ? undefined : 'var(--color-danger, #b33)' }}
            />
          </label>
        </div>
        <div className="dwc-final">
          <span>Cost / Meter (Yarn + 5% wastage + Conversion{gstEnabled ? ' + GST' : ''})</span>
          <strong className="num">₹{fmtMoney(costPerMeter)}</strong>
        </div>
        <p className="text-muted2">
          Formula: Warp=(D×TAR×L)/9e6 · Weft=(D×Pic×W×L)/9e6 · Wastage=Yarn×5% · Final=Yarn+Wastage+Conv
        </p>
      </section>

      <div className="dwc-actions">
        <button
          type="button"
          className="btn-warp"
          disabled={busy || uploading}
          onClick={() => void persist(true)}
        >
          Save Draft
        </button>
        <button
          type="button"
          className="primary-save"
          disabled={busy || uploading}
          onClick={() => void persist(false)}
        >
          Save Costing to DIN
        </button>
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
      <p className="text-muted2 dwc-user-hint">
        Signed in as {profile?.full_name || 'User'} · length base {fmtQty(buildup.designLengthMtr, 0)} mtr
      </p>
    </div>
  )
}
