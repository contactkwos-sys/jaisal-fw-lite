import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'
import {
  CALC_FACTOR,
  computeBuildup,
  computeWarpRow,
  computeWeftRow,
  emptyWarp,
  emptyWeft,
  fmtInr,
  fmtMoney,
  fmtQty,
  n,
  parseDiaryNumbers,
  type WarpDraft,
  type WeftDraft,
} from '../lib/designWiseCosting'

type Props = { initialDin?: string }

type DesignOpt = { id: string; dno: string; colour: string | null }

type CostingHistoryRow = {
  id: string
  din_number: string
  quality_name: string | null
  costing_date: string
  design_length_mtr: number | null
  yarn_cost_per_mtr: number | null
  total_pic: number | null
  pic_conversion_rate: number | null
  conversion_charge: number | null
  mu_percent: number | null
  gst_percent: number | null
  final_cost_per_mtr: number | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  updated_by: string | null
}

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
    return ''
  }
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DesignWiseCosting({ initialDin = '' }: Props) {
  const { session, profile, isCeo, isManager } = useAuth()
  const canDeleteFinal = isCeo || isManager

  const [dinNumber, setDinNumber] = useState(initialDin)
  const [costingDate, setCostingDate] = useState(todayISO())
  const [qualityName, setQualityName] = useState('')
  const [designLength, setDesignLength] = useState('')
  const [designOpts, setDesignOpts] = useState<DesignOpt[]>([])
  const [diaryUrl, setDiaryUrl] = useState<string | null>(null)
  const [ocrNote, setOcrNote] = useState<string | null>(null)
  const [warps, setWarps] = useState<WarpDraft[]>([emptyWarp(1)])
  const [wefts, setWefts] = useState<WeftDraft[]>([emptyWeft(1)])
  const [picConversionRate, setPicConversionRate] = useState('0.45')
  const [muPercent, setMuPercent] = useState('0')
  const [gstPercent, setGstPercent] = useState('0')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'final'>('draft')
  const [history, setHistory] = useState<CostingHistoryRow[]>([])
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lengthError, setLengthError] = useState<string | null>(null)

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
    })()
  }, [])

  const buildup = useMemo(
    () =>
      computeBuildup(
        warps,
        wefts,
        n(designLength),
        n(picConversionRate),
        n(muPercent),
        n(gstPercent),
      ),
    [warps, wefts, designLength, picConversionRate, muPercent, gstPercent],
  )

  const refreshHistory = useCallback(async () => {
    const { data, error: hErr } = await supabase
      .from('design_costing')
      .select(
        'id, din_number, quality_name, costing_date, design_length_mtr, yarn_cost_per_mtr, total_pic, pic_conversion_rate, conversion_charge, mu_percent, gst_percent, final_cost_per_mtr, status, created_at, updated_at, created_by, updated_by',
      )
      .order('updated_at', { ascending: false })
      .limit(50)
    if (hErr) {
      // Older DBs may lack new columns — fall back to core fields
      const { data: fallback } = await supabase
        .from('design_costing')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      setHistory((fallback as CostingHistoryRow[]) ?? [])
      return
    }
    setHistory((data as CostingHistoryRow[]) ?? [])
  }, [])

  useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  const applyHeader = useCallback((header: Record<string, unknown>) => {
    setSavedId(String(header.id))
    setDinNumber(String(header.din_number || ''))
    setQualityName(String(header.quality_name || ''))
    setCostingDate(String(header.costing_date || todayISO()))
    setDiaryUrl((header.diary_image_url as string | null) || null)
    setStatus(header.status === 'final' ? 'final' : 'draft')

    const lengthVal = header.design_length_mtr
    setDesignLength(lengthVal != null && lengthVal !== '' ? String(lengthVal) : '')

    // Prefer dedicated rate column; legacy rows stored rate in conversion_charge
    const rate =
      header.pic_conversion_rate != null
        ? header.pic_conversion_rate
        : header.conversion_charge != null && Number(header.conversion_charge) <= 10
          ? header.conversion_charge
          : 0.45
    setPicConversionRate(String(rate ?? 0.45))
    setMuPercent(String(header.mu_percent ?? 0))
    setGstPercent(String(header.gst_percent ?? 0))
  }, [])

  const loadById = useCallback(
    async (id: string, quiet = false) => {
      const { data: header, error: hErr } = await supabase
        .from('design_costing')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (hErr) throw hErr
      if (!header) return

      applyHeader(header as Record<string, unknown>)

      const [{ data: warpRows }, { data: weftRows }] = await Promise.all([
        supabase.from('design_costing_warp').select('*').eq('costing_id', id).order('sr_no'),
        supabase.from('design_costing_weft').select('*').eq('costing_id', id).order('sr_no'),
      ])

      const mappedWarps: WarpDraft[] =
        (warpRows ?? []).length > 0
          ? (warpRows ?? []).map((r, i) => ({
              key: r.id || crypto.randomUUID(),
              sr_no: r.sr_no ?? i + 1,
              yarn_name: r.yarn_name || '',
              denier: r.denier != null ? String(r.denier) : '',
              tar_ends: r.tar_ends != null ? String(r.tar_ends) : '',
              length_mtr: r.length_mtr != null ? String(r.length_mtr) : '',
              rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
            }))
          : [emptyWarp(1)]

      const mappedWefts: WeftDraft[] =
        (weftRows ?? []).length > 0
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
          : [emptyWeft(1)]

      setWarps(mappedWarps)
      setWefts(mappedWefts)

      // Backfill design length from warp/weft if missing on legacy rows
      if (header.design_length_mtr == null || header.design_length_mtr === '') {
        const fromWeft = mappedWefts.find((r) => n(r.length_mtr) > 0)
        const fromWarp = mappedWarps.find((r) => n(r.length_mtr) > 0)
        if (fromWeft) setDesignLength(fromWeft.length_mtr)
        else if (fromWarp) setDesignLength(fromWarp.length_mtr)
      }

      if (!quiet) setMessage(`Loaded costing for ${header.din_number}`)
    },
    [applyHeader],
  )

  const loadExisting = useCallback(
    async (din: string) => {
      const trimmed = din.trim()
      if (!trimmed) return
      const { data: header, error: hErr } = await supabase
        .from('design_costing')
        .select('id')
        .eq('din_number', trimmed)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (hErr) throw hErr
      if (!header) return
      await loadById(header.id)
    },
    [loadById],
  )

  function resetForm(keepDin = false) {
    if (!keepDin) setDinNumber('')
    setCostingDate(todayISO())
    setQualityName('')
    setDesignLength('')
    setDiaryUrl(null)
    setOcrNote(null)
    setWarps([emptyWarp(1)])
    setWefts([emptyWeft(1)])
    setPicConversionRate('0.45')
    setMuPercent('0')
    setGstPercent('0')
    setSavedId(null)
    setStatus('draft')
    setLengthError(null)
    setError(null)
    setMessage(null)
  }

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
        if (parsed.length && !designLength) setDesignLength(parsed.length)
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

  function validateBeforeSave(): boolean {
    if (!dinNumber.trim()) {
      setError('DIN / Design No. required')
      return false
    }
    if (!costingDate) {
      setError('Date is required')
      return false
    }
    if (!qualityName.trim()) {
      setError('Quality Name is required')
      return false
    }
    if (n(designLength) <= 0) {
      setLengthError('Design Length must be greater than zero')
      setError('Design Length must be greater than zero (cannot divide by zero)')
      return false
    }
    setLengthError(null)
    if (n(picConversionRate) < 0 || n(muPercent) < 0 || n(gstPercent) < 0) {
      setError('Conversion Rate, MU % and GST % cannot be negative')
      return false
    }
    return true
  }

  async function persist(asDraft: boolean) {
    if (!validateBeforeSave()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const totals = computeBuildup(
        warps,
        wefts,
        n(designLength),
        n(picConversionRate),
        n(muPercent),
        n(gstPercent),
      )
      const nextStatus: 'draft' | 'final' = asDraft ? 'draft' : 'final'
      const userId = session?.user?.id || null
      const header = {
        din_number: dinNumber.trim(),
        quality_name: qualityName.trim() || null,
        costing_date: costingDate,
        diary_image_url: diaryUrl,
        design_length_mtr: totals.designLengthMtr,
        pic_conversion_rate: totals.picConversionRate,
        conversion_charge: totals.conversionCharge,
        mu_percent: totals.muPercent,
        gst_percent: totals.gstPercent,
        total_pic: totals.totalPic,
        total_warp_weight_kg: totals.totalWarpWeightKg,
        total_weft_weight_kg: totals.totalWeftWeightKg,
        total_warp_amount: totals.totalWarpAmount,
        total_weft_amount: totals.totalWeftAmount,
        total_weight_kg: totals.totalWeightKg,
        total_yarn_amount: totals.totalYarnAmount,
        yarn_cost_per_mtr: totals.yarnCostPerMtr,
        subtotal_per_mtr: totals.subtotalPerMtr,
        after_mu_per_mtr: totals.afterMuPerMtr,
        final_cost_per_mtr: totals.finalCostPerMtr,
        status: nextStatus,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        created_by: userId,
      }

      let costingId = savedId
      if (costingId) {
        const { created_by: _omit, ...updatePayload } = header
        void _omit
        const { error: uErr } = await supabase
          .from('design_costing')
          .update(updatePayload)
          .eq('id', costingId)
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

      setStatus(nextStatus)

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

      if (!asDraft) {
        await supabase
          .from('designs')
          .update({
            cost_per_meter: totals.finalCostPerMtr,
            total_cost: totals.finalCostPerMtr,
          })
          .eq('dno', dinNumber.trim())
      }

      await refreshHistory()
      setMessage(
        asDraft
          ? `Draft saved · Final ${fmtInr(totals.finalCostPerMtr)}/mtr`
          : `Costing saved to DIN ${dinNumber.trim()} · Final ${fmtInr(totals.finalCostPerMtr)}/mtr`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteCosting(id: string, rowStatus: string | null) {
    if (rowStatus === 'final' && !canDeleteFinal) {
      setError('Only authorized users (CEO / Manager) can delete finalized costings')
      return
    }
    const ok = window.confirm('Are you sure you want to delete this costing?')
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const { error: dErr } = await supabase.from('design_costing').delete().eq('id', id)
      if (dErr) throw dErr
      if (savedId === id) resetForm()
      await refreshHistory()
      setMessage('Costing deleted')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function onDinSelect(value: string) {
    setDinNumber(value)
    const match = designOpts.find((d) => d.dno === value)
    if (match?.colour && !qualityName) setQualityName(match.colour)
  }

  return (
    <div className="screen dwc-screen">
      <header className="screen-header dwc-header">
        <div>
          <h1>Design Wise Costing</h1>
          <p className="text-muted">
            Warp + Weft yarn cost → Total PIC → Weaving charge → Final ₹/meter
          </p>
        </div>
        {savedId ? (
          <span className={`dwc-status-chip dwc-status-${status}`}>
            {status === 'final' ? 'Finalized' : 'Draft'}
          </span>
        ) : null}
      </header>

      <section className="dwc-panel">
        <h2 className="section-title">Design Details</h2>
        <div className="dwc-details-row">
          <label className="field">
            <span className="text-muted">DIN / Design No.</span>
            <input
              list="dwc-design-list"
              value={dinNumber}
              onChange={(e) => onDinSelect(e.target.value)}
              onBlur={() => void loadExisting(dinNumber).catch((e: Error) => setError(e.message))}
              placeholder="e.g. JFG1591"
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
            <input
              value={qualityName}
              onChange={(e) => setQualityName(e.target.value)}
              placeholder="e.g. 150 ROTO B & W"
            />
          </label>
          <label className={`field${lengthError ? ' dwc-field-error' : ''}`}>
            <span className="text-muted">Design Length / Base Length (Meter)</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={designLength}
              onChange={(e) => {
                setDesignLength(e.target.value)
                if (n(e.target.value) > 0) setLengthError(null)
              }}
              placeholder="e.g. 110"
            />
            {lengthError ? <span className="dwc-inline-error">{lengthError}</span> : null}
          </label>
        </div>
      </section>

      <section className="dwc-panel">
        <h2 className="section-title">Diary Page Upload</h2>
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
          <h2 className="section-title">Warp Details</h2>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Yarn Name</th>
                <th>Denier</th>
                <th>TAR / Ends</th>
                <th>Length (mtr)</th>
                <th>Calc. Factor</th>
                <th>Weight (kg)</th>
                <th>Rate (₹/kg)</th>
                <th>Amount (₹)</th>
                <th>Action</th>
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
                        min="0"
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
                        min="0"
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
                        min="0"
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
                      <input className="num dwc-auto" value={CALC_FACTOR.toLocaleString('en-IN')} readOnly />
                    </td>
                    <td>
                      <input className="num dwc-auto" value={fmtQty(calc.weight)} readOnly />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        min="0"
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
                        className="dwc-icon-btn dwc-icon-delete"
                        title="Delete row"
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
          <h2 className="section-title">Weft Details</h2>
          <span className="dwc-pic-total">Total PIC: {fmtQty(buildup.totalPic, 0)}</span>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Weft Name</th>
                <th>Denier / Spec</th>
                <th>PIC</th>
                <th>Width</th>
                <th>Length (mtr)</th>
                <th>Calc. Factor</th>
                <th>Weight (kg)</th>
                <th>Rate (₹/kg)</th>
                <th>Amount (₹)</th>
                <th>Action</th>
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
                        min="0"
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
                        min="0"
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
                        min="0"
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
                        min="0"
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
                      <input className="num dwc-auto" value={CALC_FACTOR.toLocaleString('en-IN')} readOnly />
                    </td>
                    <td>
                      <input className="num dwc-auto" value={fmtQty(calc.weight)} readOnly />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        min="0"
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
                        className="dwc-icon-btn dwc-icon-delete"
                        title="Delete row"
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

      <section className="dwc-panel dwc-summary-panel">
        <h2 className="section-title">Weight &amp; Yarn Amount Summary</h2>
        <div className="dwc-totals-grid">
          <div>
            <span className="text-muted">Total Warp Weight (kg)</span>
            <strong className="num">{fmtQty(buildup.totalWarpWeightKg)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Weft Weight (kg)</span>
            <strong className="num">{fmtQty(buildup.totalWeftWeightKg)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Yarn Weight (kg)</span>
            <strong className="num dwc-emphasis">{fmtQty(buildup.totalWeightKg)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Warp Amount (₹)</span>
            <strong className="num">{fmtMoney(buildup.totalWarpAmount)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Weft Amount (₹)</span>
            <strong className="num">{fmtMoney(buildup.totalWeftAmount)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Yarn Amount (₹)</span>
            <strong className="num dwc-emphasis">{fmtMoney(buildup.totalYarnAmount)}</strong>
          </div>
        </div>
      </section>

      <section className="dwc-panel dwc-buildup">
        <h2 className="section-title">Per Meter Costing Buildup</h2>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span className="text-muted">Yarn Cost / Mtr</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.yarnCostPerMtr)} readOnly />
            <span className="dwc-hint">Total Yarn Amount ÷ Design Length</span>
          </label>
          <label className="field">
            <span className="text-muted">Total Weft PIC</span>
            <input className="num dwc-auto" value={fmtQty(buildup.totalPic, 0)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">PIC Conversion Rate (₹ / PIC)</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={picConversionRate}
              onChange={(e) => setPicConversionRate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Conversion / Weaving Charge (₹)</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.conversionCharge)} readOnly />
            <span className="dwc-hint">Total PIC × PIC Conversion Rate</span>
          </label>
          <label className="field">
            <span className="text-muted">Subtotal</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.subtotalPerMtr)} readOnly />
            <span className="dwc-hint">Yarn Cost/Mtr + Weaving Charge</span>
          </label>
          <label className="field">
            <span className="text-muted">MU %</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={muPercent}
              onChange={(e) => setMuPercent(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">After MU</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.afterMuPerMtr)} readOnly />
            <span className="dwc-hint">MU amount {fmtInr(buildup.muAmount)}</span>
          </label>
          <label className="field">
            <span className="text-muted">GST %</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">GST Amount</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.gstAmount)} readOnly />
          </label>
        </div>
        <div className="dwc-final">
          <div>
            <span>Final Design Cost / Meter</span>
            <p className="dwc-final-sub text-muted">
              Auditable chain · length {fmtQty(buildup.designLengthMtr, 0)} mtr · PIC {fmtQty(buildup.totalPic, 0)}
            </p>
          </div>
          <strong className="num">{fmtInr(buildup.finalCostPerMtr)}</strong>
        </div>
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
        <button
          type="button"
          className="dwc-secondary-btn"
          disabled={busy}
          onClick={() => {
            setSavedId(null)
            setStatus('draft')
            setMessage('Editing as new costing — save to create a separate record')
          }}
        >
          Save As New
        </button>
        {savedId ? (
          <button
            type="button"
            className="dwc-danger-btn"
            disabled={busy || (status === 'final' && !canDeleteFinal)}
            onClick={() => void deleteCosting(savedId, status)}
          >
            Delete
          </button>
        ) : null}
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
      <p className="text-muted2 dwc-user-hint">
        Signed in as {profile?.full_name || 'User'}
        {savedId ? ` · editing ${status}` : ' · new costing'}
      </p>

      <section className="dwc-panel dwc-history">
        <div className="dwc-panel-head">
          <h2 className="section-title">Costing History</h2>
          <button type="button" className="dwc-secondary-btn" onClick={() => void refreshHistory()}>
            Refresh
          </button>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table dwc-history-table">
            <thead>
              <tr>
                <th>DIN</th>
                <th>Quality</th>
                <th>Date</th>
                <th>Length</th>
                <th>Yarn ₹/Mtr</th>
                <th>Total PIC</th>
                <th>Conv. Rate</th>
                <th>Weaving ₹</th>
                <th>MU %</th>
                <th>GST %</th>
                <th>Final ₹/Mtr</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-muted">
                    No saved costings yet
                  </td>
                </tr>
              ) : (
                history.map((row) => (
                  <tr key={row.id} className={savedId === row.id ? 'dwc-row-active' : undefined}>
                    <td>{row.din_number}</td>
                    <td>{row.quality_name || '—'}</td>
                    <td>{formatDisplayDate(row.costing_date)}</td>
                    <td className="num">{row.design_length_mtr != null ? fmtQty(Number(row.design_length_mtr), 0) : '—'}</td>
                    <td className="num">{row.yarn_cost_per_mtr != null ? fmtMoney(Number(row.yarn_cost_per_mtr)) : '—'}</td>
                    <td className="num">{row.total_pic != null ? fmtQty(Number(row.total_pic), 0) : '—'}</td>
                    <td className="num">
                      {row.pic_conversion_rate != null
                        ? fmtMoney(Number(row.pic_conversion_rate))
                        : '—'}
                    </td>
                    <td className="num">
                      {row.conversion_charge != null ? fmtMoney(Number(row.conversion_charge)) : '—'}
                    </td>
                    <td className="num">{row.mu_percent != null ? fmtQty(Number(row.mu_percent), 0) : '—'}</td>
                    <td className="num">{row.gst_percent != null ? fmtQty(Number(row.gst_percent), 0) : '—'}</td>
                    <td className="num dwc-emphasis">
                      {row.final_cost_per_mtr != null ? fmtInr(Number(row.final_cost_per_mtr)) : '—'}
                    </td>
                    <td>
                      <span className={`dwc-status-chip dwc-status-${row.status === 'final' ? 'final' : 'draft'}`}>
                        {row.status === 'final' ? 'Final' : 'Draft'}
                      </span>
                    </td>
                    <td>{formatDisplayDate(row.updated_at || row.created_at)}</td>
                    <td>
                      <div className="dwc-history-actions">
                        <button
                          type="button"
                          className="dwc-link-btn"
                          onClick={() =>
                            void loadById(row.id).catch((e: Error) => setError(e.message))
                          }
                        >
                          View / Edit
                        </button>
                        <button
                          type="button"
                          className="dwc-link-btn dwc-link-danger"
                          disabled={row.status === 'final' && !canDeleteFinal}
                          onClick={() => void deleteCosting(row.id, row.status)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
