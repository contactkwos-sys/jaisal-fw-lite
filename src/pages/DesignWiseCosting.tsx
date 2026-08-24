import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'
import {
  CALC_FACTOR,
  CALC_HINTS,
  canEditDinCosting,
  canViewDinCosting,
  computeBuildup,
  computeProfitProjection,
  computeWarpRow,
  computeWeftRow,
  computeWastageParams,
  emptyWarp,
  emptyWeft,
  finalCostAuditLine,
  finalCostHint,
  fmtInr,
  fmtMoney,
  fmtQty,
  n,
  parseDiaryNumbers,
  type WarpDraft,
  type WeftDraft,
} from '../lib/designWiseCosting'
import { fetchFormulaMaster, FORMULA_DEFAULTS } from '../lib/formulaMaster'
import { DinCostingViewOnly, CalcInfo, type DinCostingViewRow } from '../components/dinCosting/DinCostingViewOnly'
import { syncDinCostingFromLatest } from '../lib/designToOrder'
import {
  fetchAllRates,
  formatDisplayDate as formatRateDate,
  gstLabel,
  lookupRate,
  type RateMasterRow,
} from '../lib/rateMaster'
import { rateMasterItemNames } from '../lib/dinIntakeCosting'

type Props = { initialDin?: string; viewOnly?: boolean }

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
  after_mu_per_mtr: number | null
  gst_percent: number | null
  gst_amount: number | null
  final_cost_per_mtr: number | null
  ceo_final_selling_rate: number | null
  usable_length_mtr: number | null
  is_locked: boolean | null
  diary_image_url: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
  created_by: string | null
  updated_by: string | null
}

type HistoryFilters = {
  din: string
  quality: string
  yarn: string
  dateFrom: string
  dateTo: string
  createdBy: string
  status: string
}

const EMPTY_FILTERS: HistoryFilters = {
  din: '',
  quality: '',
  yarn: '',
  dateFrom: '',
  dateTo: '',
  createdBy: '',
  status: '',
}

const HISTORY_SELECT =
  'id, din_number, quality_name, costing_date, design_length_mtr, usable_length_mtr, yarn_cost_per_mtr, total_pic, pic_conversion_rate, conversion_charge, mu_percent, after_mu_per_mtr, gst_percent, gst_amount, final_cost_per_mtr, ceo_final_selling_rate, diary_image_url, status, is_locked, created_at, updated_at, created_by, updated_by'

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

/** Prefer DIN filter only when it looks like a design number, not a module id. */
function isDinFilter(value: string | undefined): value is string {
  if (!value) return false
  const v = value.trim()
  if (!v) return false
  // Module hub ids accidentally passed as filter must not seed DIN
  if (
    v === 'reports' ||
    v === 'orders' ||
    v === 'production' ||
    v === 'inventory' ||
    v === 'dashboard' ||
    v === 'maintenance' ||
    v === 'masters' ||
    v === 'security' ||
    v === 'settings' ||
    v === 'cash-book'
  ) {
    return false
  }
  return true
}

export function DesignWiseCosting({ initialDin = '', viewOnly = false }: Props) {
  const { session, profile, isCeo, isManager, roleName } = useAuth()
  const canDeleteFinal = isCeo || isManager
  const canEdit = canEditDinCosting(roleName || '', isCeo, isManager)
  const canView = canViewDinCosting(roleName || '', isCeo, isManager)

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
  const [wastageMtr, setWastageMtr] = useState('10')
  const [wastagePercent, setWastagePercent] = useState('10')
  const [ceoFinalSellingRate, setCeoFinalSellingRate] = useState('')
  const [fixedCostPerMtr, setFixedCostPerMtr] = useState('')
  const [desiredProfitPerMtr, setDesiredProfitPerMtr] = useState('')
  const [productionMeters, setProductionMeters] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [formulaDefaults, setFormulaDefaults] = useState(FORMULA_DEFAULTS)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'draft' | 'final'>('draft')
  const [history, setHistory] = useState<CostingHistoryRow[]>([])
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [yarnByCosting, setYarnByCosting] = useState<Record<string, string>>({})
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(EMPTY_FILTERS)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lengthError, setLengthError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  /** After "Save As New", skip one DIN blur auto-load so the form is not overwritten. */
  const skipDinAutoloadRef = useRef(false)
  const [masterRates, setMasterRates] = useState<RateMasterRow[]>([])

  useEffect(() => {
    void fetchFormulaMaster()
      .then((cfg) => {
        setFormulaDefaults({
          calc_factor: cfg.calc_factor,
          default_base_length_mtr: cfg.default_base_length_mtr,
          default_wastage_mtr: cfg.default_wastage_mtr,
          default_wastage_percent: cfg.default_wastage_percent,
          default_usable_length_mtr: cfg.default_usable_length_mtr,
        })
        if (!designLength) setDesignLength(String(cfg.default_base_length_mtr))
        setWastageMtr(String(cfg.default_wastage_mtr))
        setWastagePercent(String(cfg.default_wastage_percent))
      })
      .catch(() => setFormulaDefaults(FORMULA_DEFAULTS))
  }, [])

  useEffect(() => {
    void fetchAllRates()
      .then(setMasterRates)
      .catch(() => setMasterRates([]))
  }, [])

  const applyWarpRateFromMaster = useCallback(
    (row: WarpDraft): WarpDraft => {
      if (!row.yarn_name.trim() || !costingDate) return row
      const found = lookupRate(masterRates, 'warp', row.yarn_name, costingDate, { denier: row.denier })
      if (!found) return row
      return {
        ...row,
        rate_per_kg: String(found.calc.effectiveRate),
        rate_source: 'rate_master',
        rate_master_id: found.row.id,
        rate_basic: found.calc.basicRate,
        rate_gst_percent: found.calc.gstPercent,
        rate_gst_amount: found.calc.gstAmount,
        rate_freight: found.calc.freightPerKg,
        rate_effective_from: found.row.effective_from,
      }
    },
    [masterRates, costingDate],
  )

  const applyWeftRateFromMaster = useCallback(
    (row: WeftDraft): WeftDraft => {
      if (!row.weft_name.trim() || !costingDate) return row
      const found = lookupRate(masterRates, 'weft', row.weft_name, costingDate, { denier: row.denier })
      if (!found) return row
      return {
        ...row,
        rate_per_kg: String(found.calc.effectiveRate),
        rate_source: 'rate_master',
        rate_master_id: found.row.id,
        rate_basic: found.calc.basicRate,
        rate_gst_percent: found.calc.gstPercent,
        rate_gst_amount: found.calc.gstAmount,
        rate_freight: found.calc.freightPerKg,
        rate_effective_from: found.row.effective_from,
      }
    },
    [masterRates, costingDate],
  )

  useEffect(() => {
    if (!masterRates.length || !costingDate) return
    setWarps((prev) =>
      prev.map((row) => {
        if (row.rate_source === 'manual') return row
        if (!row.yarn_name.trim()) return row
        if (row.rate_source === 'rate_master' || !row.rate_per_kg) return applyWarpRateFromMaster(row)
        return row
      }),
    )
    setWefts((prev) =>
      prev.map((row) => {
        if (row.rate_source === 'manual') return row
        if (!row.weft_name.trim()) return row
        if (row.rate_source === 'rate_master' || !row.rate_per_kg) return applyWeftRateFromMaster(row)
        return row
      }),
    )
  }, [costingDate, masterRates, applyWarpRateFromMaster, applyWeftRateFromMaster])

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
        n(wastageMtr),
        n(wastagePercent),
      ),
    [warps, wefts, designLength, picConversionRate, muPercent, gstPercent, wastageMtr, wastagePercent],
  )

  const profit = useMemo(
    () =>
      computeProfitProjection(
        buildup.finalCostPerMtr,
        n(fixedCostPerMtr),
        n(desiredProfitPerMtr),
        n(ceoFinalSellingRate),
        n(productionMeters),
      ),
    [buildup.finalCostPerMtr, fixedCostPerMtr, desiredProfitPerMtr, ceoFinalSellingRate, productionMeters],
  )

  const isReadOnly = !canEdit || isLocked

  const refreshHistory = useCallback(async () => {
    setHistoryError(null)
    const { data, error: hErr } = await supabase
      .from('design_costing')
      .select(HISTORY_SELECT)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
    let rows: CostingHistoryRow[] = []
    if (hErr) {
      // Older DBs may lack new columns — fall back to core fields
      const { data: fallback, error: fErr } = await supabase
        .from('design_costing')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (fErr) {
        setHistoryError(fErr.message)
        setHistory([])
        return
      }
      rows = (fallback as CostingHistoryRow[]) ?? []
      setHistoryError(`Using legacy columns (${hErr.message})`)
    } else {
      rows = (data as CostingHistoryRow[]) ?? []
    }
    setHistory(rows)

    const costingIds = rows.map((r) => r.id)
    if (costingIds.length) {
      const [{ data: warpYarns }, { data: weftYarns }] = await Promise.all([
        supabase.from('design_costing_warp').select('costing_id, yarn_name').in('costing_id', costingIds),
        supabase.from('design_costing_weft').select('costing_id, weft_name').in('costing_id', costingIds),
      ])
      const yarnMap: Record<string, string> = {}
      for (const w of warpYarns ?? []) {
        const key = w.costing_id as string
        yarnMap[key] = `${yarnMap[key] || ''} ${w.yarn_name || ''}`.trim()
      }
      for (const w of weftYarns ?? []) {
        const key = w.costing_id as string
        yarnMap[key] = `${yarnMap[key] || ''} ${w.weft_name || ''}`.trim()
      }
      setYarnByCosting(yarnMap)
    } else {
      setYarnByCosting({})
    }

    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.created_by, r.updated_by])
          .filter((id): id is string => Boolean(id)),
      ),
    ]
    if (!ids.length) return
    const { data: users } = await supabase.from('users').select('id, full_name').in('id', ids)
    if (users?.length) {
      const map: Record<string, string> = {}
      for (const u of users) map[u.id] = u.full_name || u.id
      setUserNames((prev) => ({ ...prev, ...map }))
    }
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
    setIsLocked(Boolean(header.is_locked))

    const lengthVal = header.design_length_mtr
    setDesignLength(lengthVal != null && lengthVal !== '' ? String(lengthVal) : '')

    setWastageMtr(String(header.wastage_mtr ?? formulaDefaults.default_wastage_mtr))
    setWastagePercent(String(header.wastage_percent ?? formulaDefaults.default_wastage_percent))
    setCeoFinalSellingRate(
      header.ceo_final_selling_rate != null ? String(header.ceo_final_selling_rate) : '',
    )
    setFixedCostPerMtr(header.fixed_cost_per_mtr != null ? String(header.fixed_cost_per_mtr) : '')
    setDesiredProfitPerMtr(
      header.desired_profit_per_mtr != null ? String(header.desired_profit_per_mtr) : '',
    )
    setProductionMeters(header.production_meters != null ? String(header.production_meters) : '')

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
  }, [formulaDefaults.default_wastage_mtr, formulaDefaults.default_wastage_percent])

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
              rate_source: (r.rate_source as WarpDraft['rate_source']) || '',
              rate_master_id: r.rate_master_id || undefined,
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
              rate_source: (r.rate_source as WeftDraft['rate_source']) || '',
              rate_master_id: r.rate_master_id || undefined,
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
      const { data: rows, error: hErr } = await supabase
        .from('design_costing')
        .select('id')
        .eq('din_number', trimmed)
        .order('created_at', { ascending: false })
        .limit(1)
      if (hErr) throw hErr
      const header = rows?.[0]
      if (!header) return
      await loadById(header.id)
    },
    [loadById],
  )

  /** Open DIN from Orders / Reports / Design register navigation */
  useEffect(() => {
    if (!isDinFilter(initialDin)) return
    const din = initialDin.trim()
    setDinNumber(din)
    setHistoryFilters((f) => ({ ...f, din }))
    void loadExisting(din).catch((e: Error) => setError(e.message))
  }, [initialDin, loadExisting])

  const filteredHistory = useMemo(() => {
    const dinQ = historyFilters.din.trim().toLowerCase()
    const qualityQ = historyFilters.quality.trim().toLowerCase()
    const yarnQ = historyFilters.yarn.trim().toLowerCase()
    const byQ = historyFilters.createdBy.trim().toLowerCase()
    const statusQ = historyFilters.status.trim().toLowerCase()

    return history.filter((row) => {
      if (dinQ && !String(row.din_number || '').toLowerCase().includes(dinQ)) return false
      if (qualityQ && !String(row.quality_name || '').toLowerCase().includes(qualityQ)) return false
      if (yarnQ) {
        const hay = `${row.quality_name || ''} ${row.din_number || ''} ${yarnByCosting[row.id] || ''}`.toLowerCase()
        if (!hay.includes(yarnQ)) return false
      }
      if (byQ) {
        const name = (row.created_by && userNames[row.created_by]) || row.created_by || ''
        if (!name.toLowerCase().includes(byQ)) return false
      }
      if (statusQ) {
        const st = (row.status === 'final' ? 'final' : 'draft').toLowerCase()
        if (st !== statusQ) return false
      }
      if (historyFilters.dateFrom && row.costing_date && row.costing_date < historyFilters.dateFrom) {
        return false
      }
      if (historyFilters.dateTo && row.costing_date && row.costing_date > historyFilters.dateTo) {
        return false
      }
      return true
    })
  }, [history, historyFilters, userNames, yarnByCosting])

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
    setWastageMtr(String(formulaDefaults.default_wastage_mtr))
    setWastagePercent(String(formulaDefaults.default_wastage_percent))
    setCeoFinalSellingRate('')
    setFixedCostPerMtr('')
    setDesiredProfitPerMtr('')
    setProductionMeters('')
    setIsLocked(false)
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

  async function logAudit(
    costingId: string,
    action: string,
    fieldName?: string,
    previousValue?: string,
    newValue?: string,
    reason?: string,
  ) {
    try {
      await supabase.from('design_costing_audit').insert({
        costing_id: costingId,
        din_number: dinNumber.trim(),
        action,
        field_name: fieldName || null,
        previous_value: previousValue ?? null,
        new_value: newValue ?? null,
        reason: reason || null,
        changed_by: session?.user?.id || null,
        changed_by_name: profile?.full_name || null,
      })
    } catch {
      /* audit must not block save */
    }
  }

  async function persist(asDraft: boolean, finalize = false) {
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
        n(wastageMtr),
        n(wastagePercent),
      )
      const profitTotals = computeProfitProjection(
        totals.finalCostPerMtr,
        n(fixedCostPerMtr),
        n(desiredProfitPerMtr),
        n(ceoFinalSellingRate),
        n(productionMeters),
      )
      const userId = session?.user?.id || null
      const prevSellingRate = ceoFinalSellingRate
      const baseHeader = {
        din_number: dinNumber.trim(),
        quality_name: qualityName.trim() || null,
        costing_date: costingDate,
        diary_image_url: diaryUrl,
        design_length_mtr: totals.enteredLengthMtr,
        wastage_mtr: totals.wastageMtr,
        wastage_percent: totals.wastagePercent,
        usable_length_mtr: totals.usableLengthMtr,
        conversion_multiplier: totals.conversionMultiplier,
        pic_conversion_rate: totals.picConversionRate,
        conversion_charge: totals.conversionCharge,
        mu_percent: totals.muPercent,
        mu_amount: totals.muAmount,
        gst_percent: totals.gstPercent,
        gst_amount: totals.gstAmount,
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
        ceo_final_selling_rate: n(ceoFinalSellingRate) || null,
        fixed_cost_per_mtr: n(fixedCostPerMtr) || null,
        desired_profit_per_mtr: n(desiredProfitPerMtr) || null,
        production_meters: n(productionMeters) || null,
        total_profit: profitTotals.totalProfit,
        margin_pct_on_cost: profitTotals.marginPctOnCost,
        margin_pct_on_selling: profitTotals.marginPctOnSelling,
        status: finalize ? 'final' : asDraft ? 'draft' : status,
        is_locked: finalize ? true : isLocked,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        created_by: userId,
      }
      const header = finalize
        ? {
            ...baseHeader,
            finalized_by: userId,
            finalized_at: new Date().toISOString(),
          }
        : baseHeader

      let costingId = savedId
      let previousWarpIds: string[] = []
      let previousWeftIds: string[] = []

      if (costingId) {
        const { created_by: _omit, ...updatePayload } = header
        void _omit
        const { error: uErr } = await supabase
          .from('design_costing')
          .update(updatePayload)
          .eq('id', costingId)
        if (uErr) throw uErr

        // Capture existing child rows so we can delete them AFTER a successful insert.
        // Deleting first caused "saved then empty" when re-insert failed (schema / RLS).
        const [{ data: oldWarps }, { data: oldWefts }] = await Promise.all([
          supabase.from('design_costing_warp').select('id').eq('costing_id', costingId),
          supabase.from('design_costing_weft').select('id').eq('costing_id', costingId),
        ])
        previousWarpIds = (oldWarps ?? []).map((r) => r.id as string)
        previousWeftIds = (oldWefts ?? []).map((r) => r.id as string)
      } else {
        const { data, error: iErr } = await supabase
          .from('design_costing')
          .insert(header)
          .select('id')
          .single()
        if (iErr) {
          if (/column .* does not exist/i.test(iErr.message)) {
            throw new Error(
              `${iErr.message} — run public/migration-design-wise-costing.sql on Supabase so Save / Report columns exist`,
            )
          }
          throw iErr
        }
        costingId = data.id
        setSavedId(costingId)
      }

      setStatus(finalize ? 'final' : asDraft ? 'draft' : status)
      if (finalize) setIsLocked(true)

      const warpPayload = warps.map((row, i) => ({
        costing_id: costingId,
        sr_no: i + 1,
        yarn_name: row.yarn_name.trim() || null,
        denier: n(row.denier) || null,
        tar_ends: n(row.tar_ends) || null,
        length_mtr: n(row.length_mtr) || null,
        rate_per_kg: n(row.rate_per_kg) || null,
        rate_source: row.rate_source || null,
        rate_master_id: row.rate_master_id || null,
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
        rate_source: row.rate_source || null,
        rate_master_id: row.rate_master_id || null,
      }))

      if (warpPayload.length) {
        const { error: wErr } = await supabase.from('design_costing_warp').insert(warpPayload)
        if (wErr) throw wErr
      }
      if (weftPayload.length) {
        const { error: fErr } = await supabase.from('design_costing_weft').insert(weftPayload)
        if (fErr) throw fErr
      }

      // Only remove previous lines after new lines are stored
      if (previousWarpIds.length) {
        const { error: dwErr } = await supabase
          .from('design_costing_warp')
          .delete()
          .in('id', previousWarpIds)
        if (dwErr) throw dwErr
      }
      if (previousWeftIds.length) {
        const { error: dfErr } = await supabase
          .from('design_costing_weft')
          .delete()
          .in('id', previousWeftIds)
        if (dfErr) throw dfErr
      }

      if (finalize && costingId) {
        await logAudit(costingId, 'finalize', 'status', status, 'final')
        if (n(prevSellingRate) > 0) {
          await logAudit(
            costingId,
            'rate_change',
            'ceo_final_selling_rate',
            undefined,
            ceoFinalSellingRate,
          )
        }
      } else if (costingId && n(ceoFinalSellingRate) > 0) {
        await logAudit(
          costingId,
          asDraft ? 'save_draft' : 'save',
          'ceo_final_selling_rate',
          undefined,
          ceoFinalSellingRate,
        )
      }

      if (!asDraft || finalize) {
        const { error: designErr } = await supabase
          .from('designs')
          .update({
            cost_per_meter: totals.finalCostPerMtr,
            total_cost: totals.finalCostPerMtr,
          })
          .eq('dno', dinNumber.trim())
        if (designErr) {
          // Costing itself is saved — surface design-register sync as a soft warning
          try {
            await syncDinCostingFromLatest(dinNumber.trim())
          } catch {
            /* optional */
          }
          setMessage(
            `Costing saved to DIN ${dinNumber.trim()} · Final ${fmtInr(totals.finalCostPerMtr)}/mtr (design register sync: ${designErr.message})`,
          )
          await refreshHistory()
          return
        }
      }

      // Sync snapshot onto Design to Order DIN master when present (same DIN number)
      try {
        await syncDinCostingFromLatest(dinNumber.trim())
      } catch {
        /* DIN table may not be migrated yet — costing still saved */
      }

      await refreshHistory()
      setMessage(
        finalize
          ? `Costing finalized & locked · CEO rate ${fmtInr(n(ceoFinalSellingRate) || totals.finalCostPerMtr)}/mtr`
          : asDraft
            ? `Draft saved · Calculated ${fmtInr(totals.finalCostPerMtr)}/mtr`
            : `Costing saved to DIN ${dinNumber.trim()} · Calculated ${fmtInr(totals.finalCostPerMtr)}/mtr`,
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

  if (!canView) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>DIN Costing</h1>
          <p className="text-muted">Restricted access.</p>
        </header>
        <p className="form-error text-danger">You do not have permission to view DIN Costing.</p>
      </div>
    )
  }

  if (viewOnly || !canEdit) {
    const viewRows: DinCostingViewRow[] = history.map((row) => ({
      id: row.id,
      din_number: row.din_number,
      quality_name: row.quality_name,
      costing_date: row.costing_date,
      design_length_mtr: row.design_length_mtr,
      usable_length_mtr: row.usable_length_mtr,
      ceo_final_selling_rate: row.ceo_final_selling_rate,
      final_cost_per_mtr: row.final_cost_per_mtr,
      diary_image_url: row.diary_image_url,
      status: row.status,
      is_locked: row.is_locked,
    }))
    return <DinCostingViewOnly rows={viewRows} onRefresh={() => void refreshHistory()} />
  }

  const wastageDisplay = computeWastageParams(n(designLength), n(wastageMtr), n(wastagePercent))

  return (
    <div className="screen dwc-screen">
      <header className="screen-header dwc-header">
        <div>
          <h1>DIN Costing (Jacquard Repair Design)</h1>
          <p className="text-muted">
            CEO Dashboard → Warp + Weft yarn cost → Total PIC → Weaving charge → Final ₹/meter (100 mtr basis)
          </p>
        </div>
        {savedId ? (
          <span className={`dwc-status-chip dwc-status-${status}`}>
            {isLocked ? 'Finalized · Locked' : status === 'final' ? 'Finalized' : 'Draft'}
          </span>
        ) : null}
      </header>

      <section className="dwc-panel">
        <h2 className="section-title">Design Details</h2>
        <div className="dwc-details-row">
          <label className="field">
            <span className="text-muted">DESI / Design No. (formerly DIN)</span>
            <input
              list="dwc-design-list"
              value={dinNumber}
              onChange={(e) => onDinSelect(e.target.value)}
              onBlur={() => {
                if (skipDinAutoloadRef.current) {
                  skipDinAutoloadRef.current = false
                  return
                }
                // Do not overwrite an in-progress new costing with a prior row for the same DIN
                if (!savedId) {
                  const hasDraftLines =
                    warps.some((r) => r.yarn_name.trim() || n(r.denier) || n(r.tar_ends) || n(r.rate_per_kg)) ||
                    wefts.some((r) => r.weft_name.trim() || n(r.denier) || n(r.pic) || n(r.rate_per_kg))
                  if (hasDraftLines) return
                }
                void loadExisting(dinNumber).catch((e: Error) => setError(e.message))
              }}
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
            <datalist id="dwc-warp-rate-items">
              {rateMasterItemNames(masterRates, 'warp').map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="dwc-weft-rate-items">
              {rateMasterItemNames(masterRates, 'weft').map((name) => (
                <option key={name} value={name} />
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
        <div className="dwc-length-summary">
          <div>
            <span className="text-muted">Entered Length</span>
            <strong className="num">{fmtQty(wastageDisplay.enteredLengthMtr, 0)} Mtr</strong>
          </div>
          <div>
            <span className="text-muted">Wastage (Lossage)</span>
            <strong className="num">
              {fmtQty(wastageDisplay.wastageMtr, 0)} Mtr ({fmtQty(wastageDisplay.wastagePercent, 0)}%)
            </strong>
            <span className="dwc-fixed-tag">Fixed</span>
          </div>
          <div className="dwc-usable-highlight">
            <span className="text-muted">Usable Length for Costing</span>
            <strong className="num">{fmtQty(wastageDisplay.usableLengthMtr, 0)} Mtr</strong>
            <span className="dwc-auto-tag">Auto</span>
          </div>
        </div>
      </section>

      <section className="dwc-panel dwc-wastage-card">
        <h2 className="section-title">Wastage / Lossage Adjustment</h2>
        <div className="dwc-wastage-grid">
          <div>
            <span className="text-muted">Entered Production Length</span>
            <strong className="num">{fmtQty(wastageDisplay.enteredLengthMtr, 0)} Mtr</strong>
          </div>
          <div>
            <span className="text-muted">Wastage</span>
            <strong className="num">{fmtQty(wastageDisplay.wastageMtr, 0)} Mtr</strong>
          </div>
          <div>
            <span className="text-muted">Lossage</span>
            <strong className="num">{fmtQty(wastageDisplay.wastagePercent, 0)}%</strong>
          </div>
          <div className="dwc-usable-highlight">
            <span className="text-muted">Usable Length for Costing</span>
            <strong className="num">{fmtQty(wastageDisplay.usableLengthMtr, 0)} Mtr</strong>
          </div>
          <div>
            <span className="text-muted">
              Conversion Multiplier <CalcInfo hint={CALC_HINTS.conversionMultiplier} />
            </span>
            <strong className="num">
              {fmtQty(wastageDisplay.enteredLengthMtr, 0)} ÷ {fmtQty(wastageDisplay.usableLengthMtr, 0)} ={' '}
              {fmtQty(wastageDisplay.conversionMultiplier, 2)}
            </strong>
          </div>
        </div>
        <p className="text-muted2 dwc-wastage-note">
          Yarn consumption on entered {fmtQty(wastageDisplay.enteredLengthMtr, 0)} mtr (incl.{' '}
          {fmtQty(wastageDisplay.wastagePercent, 0)}% wastage). Per-meter rate on{' '}
          {fmtQty(wastageDisplay.usableLengthMtr, 0)} mtr usable basis.
        </p>
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
                        list="dwc-warp-rate-items"
                        value={row.yarn_name}
                        disabled={isReadOnly}
                        placeholder="Item from Rate Master"
                        onChange={(e) => {
                          const name = e.target.value
                          setWarps((prev) =>
                            prev.map((r) => {
                              if (r.key !== row.key) return r
                              const updated = { ...r, yarn_name: name }
                              return applyWarpRateFromMaster(updated)
                            }),
                          )
                        }}
                        onBlur={() =>
                          setWarps((prev) =>
                            prev.map((r) => (r.key === row.key ? applyWarpRateFromMaster(r) : r)),
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? {
                                    ...r,
                                    rate_per_kg: e.target.value,
                                    rate_source: 'manual',
                                    rate_master_id: undefined,
                                  }
                                : r,
                            ),
                          )
                        }
                      />
                      {row.rate_source === 'rate_master' && row.rate_basic != null ? (
                        <small className="dwc-rate-meta text-muted">
                          {fmtInr(row.rate_basic)}/kg · {gstLabel(row.rate_gst_percent ?? 0)}{' '}
                          {fmtInr(row.rate_gst_amount ?? 0)} · Freight {fmtInr(row.rate_freight ?? 0)} ·{' '}
                          Rate Master · {formatRateDate(row.rate_effective_from || '')}
                        </small>
                      ) : row.rate_source === 'manual' ? (
                        <small className="dwc-rate-meta text-muted">Manual Override</small>
                      ) : null}
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
                        list="dwc-weft-rate-items"
                        value={row.weft_name}
                        disabled={isReadOnly}
                        placeholder="Item from Rate Master"
                        onChange={(e) => {
                          const name = e.target.value
                          setWefts((prev) =>
                            prev.map((r) => {
                              if (r.key !== row.key) return r
                              const updated = { ...r, weft_name: name }
                              return applyWeftRateFromMaster(updated)
                            }),
                          )
                        }}
                        onBlur={() =>
                          setWefts((prev) =>
                            prev.map((r) => (r.key === row.key ? applyWeftRateFromMaster(r) : r)),
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
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
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? {
                                    ...r,
                                    rate_per_kg: e.target.value,
                                    rate_source: 'manual',
                                    rate_master_id: undefined,
                                  }
                                : r,
                            ),
                          )
                        }
                      />
                      {row.rate_source === 'rate_master' && row.rate_basic != null ? (
                        <small className="dwc-rate-meta text-muted">
                          {fmtInr(row.rate_basic)}/kg · {gstLabel(row.rate_gst_percent ?? 0)}{' '}
                          {fmtInr(row.rate_gst_amount ?? 0)} · Freight {fmtInr(row.rate_freight ?? 0)} ·{' '}
                          Rate Master · {formatRateDate(row.rate_effective_from || '')}
                        </small>
                      ) : row.rate_source === 'manual' ? (
                        <small className="dwc-rate-meta text-muted">Manual Override</small>
                      ) : null}
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
        <h2 className="section-title">Per Meter Costing Buildup (100 mtr basis)</h2>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span className="text-muted">
              Yarn Cost / Mtr <CalcInfo hint={CALC_HINTS.yarnCostPerMtr} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.yarnCostPerMtr)} readOnly />
            <span className="dwc-hint">Total Yarn Amount ÷ Usable Length ({fmtQty(buildup.usableLengthMtr, 0)} mtr)</span>
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
              disabled={isReadOnly}
              onChange={(e) => setPicConversionRate(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">
              Conversion / Weaving Charge (₹) <CalcInfo hint={CALC_HINTS.conversionCharge} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.conversionCharge)} readOnly />
            <span className="dwc-hint">Total PIC × PIC Conversion Rate</span>
          </label>
          <label className="field">
            <span className="text-muted">
              Subtotal <CalcInfo hint={CALC_HINTS.subtotalPerMtr} />
            </span>
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
              disabled={isReadOnly}
              onChange={(e) => setMuPercent(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">
              After MU <CalcInfo hint={CALC_HINTS.afterMuPerMtr} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.afterMuPerMtr)} readOnly />
            <span className="dwc-hint">
              MU amount {fmtInr(buildup.muAmount)} <CalcInfo hint={CALC_HINTS.muAmount} />
            </span>
          </label>
          <label className="field">
            <span className="text-muted">GST %</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={gstPercent}
              disabled={isReadOnly}
              onChange={(e) => setGstPercent(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">
              GST Amount <CalcInfo hint={CALC_HINTS.gstAmount} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.gstAmount)} readOnly />
          </label>
        </div>

        <div className="dwc-gst-split" aria-label="GST separated from base costing">
          <div className="dwc-gst-card">
            <span className="text-muted">Base Cost / Mtr (Excl. GST)</span>
            <strong className="num">{fmtInr(buildup.afterMuPerMtr)}</strong>
            <span className="dwc-hint">After MU · GST not included</span>
          </div>
          <div className="dwc-gst-card">
            <span className="text-muted">GST {fmtQty(buildup.gstPercent, 0)}%</span>
            <strong className="num">{fmtInr(buildup.gstAmount)}</strong>
            <span className="dwc-hint">Shown separately from base</span>
          </div>
          <div className="dwc-gst-card dwc-gst-final">
            <span className="text-muted">
              Final Cost / Mtr (Incl. GST) <CalcInfo hint={CALC_HINTS.finalCostPerMtr} />
            </span>
            <strong className="num">{fmtInr(buildup.finalCostPerMtr)}</strong>
            <span className="dwc-hint">{finalCostHint(buildup.gstPercent)}</span>
          </div>
        </div>

        <div className="dwc-final">
          <div>
            <span>Final Design Cost / Meter (Calculated)</span>
            <p className="dwc-final-sub text-muted">
              {finalCostAuditLine(
                buildup.afterMuPerMtr,
                buildup.gstAmount,
                buildup.gstPercent,
                buildup.usableLengthMtr,
                buildup.totalPic,
              )}
            </p>
          </div>
          <strong className="num">{fmtInr(buildup.finalCostPerMtr)}</strong>
        </div>
      </section>

      <section className="dwc-panel dwc-profit-panel">
        <h2 className="section-title">Profit &amp; Target Calculator (CEO Only)</h2>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span className="text-muted">Cost / Meter (Calculated)</span>
            <input className="num dwc-auto" value={fmtMoney(profit.costPerMtr)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Fixed Cost / Meter</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={fixedCostPerMtr}
              disabled={isReadOnly}
              onChange={(e) => setFixedCostPerMtr(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Desired Profit / Meter</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={desiredProfitPerMtr}
              disabled={isReadOnly}
              onChange={(e) => setDesiredProfitPerMtr(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Target / Suggested Selling Rate</span>
            <input className="num dwc-auto" value={fmtMoney(profit.targetSellingRate)} readOnly />
          </label>
          <label className="field dwc-ceo-rate-field">
            <span className="text-muted">
              Final Sale Rate (₹/Mtr) {isLocked ? '🔒' : ''}
            </span>
            <input
              className="num dwc-ceo-rate"
              type="number"
              min="0"
              step="any"
              value={ceoFinalSellingRate}
              disabled={isLocked}
              onChange={(e) => setCeoFinalSellingRate(e.target.value)}
              placeholder={fmtMoney(buildup.finalCostPerMtr)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Production (Meters)</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={productionMeters}
              disabled={isReadOnly}
              onChange={(e) => setProductionMeters(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Profit / Meter</span>
            <input className="num dwc-auto" value={fmtMoney(profit.profitPerMtr)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">
              Total Profit <CalcInfo hint={CALC_HINTS.totalProfit} />
            </span>
            <input className="num dwc-auto dwc-emphasis" value={fmtMoney(profit.totalProfit)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Margin % on Cost</span>
            <input className="num dwc-auto" value={fmtQty(profit.marginPctOnCost)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Margin % on Selling</span>
            <input className="num dwc-auto" value={fmtQty(profit.marginPctOnSelling)} readOnly />
          </label>
        </div>
        {n(ceoFinalSellingRate) > 0 ? (
          <div className="dwc-ceo-final-banner">
            <span>CEO Final Selling Rate</span>
            <strong className="num">{fmtInr(n(ceoFinalSellingRate))}</strong>
            {isLocked ? <span className="dwc-lock-tag">🔒 Locked</span> : null}
          </div>
        ) : null}
      </section>

      <div className="dwc-actions">
        <button
          type="button"
          className="dwc-secondary-btn"
          disabled={busy || uploading}
          onClick={() => resetForm(Boolean(dinNumber))}
        >
          Reset
        </button>
        <button
          type="button"
          className="btn-warp"
          disabled={busy || uploading || isReadOnly}
          onClick={() => void persist(true)}
        >
          Save Draft
        </button>
        <button
          type="button"
          className="dwc-secondary-btn"
          disabled={busy || uploading}
          onClick={() => setMessage('Recalculated — review updated values below')}
        >
          Recalculate
        </button>
        <button
          type="button"
          className="primary-save"
          disabled={busy || uploading || isLocked}
          onClick={() => void persist(false)}
        >
          Save Costing
        </button>
        <button
          type="button"
          className="dwc-finalize-btn"
          disabled={busy || uploading || isLocked || !savedId}
          onClick={() => void persist(false, true)}
        >
          Finalize Costing
        </button>
        <button
          type="button"
          className="dwc-secondary-btn"
          disabled={busy}
          onClick={() => {
            skipDinAutoloadRef.current = true
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
          <h2 className="section-title">Saved Design Costings</h2>
          <button type="button" className="dwc-secondary-btn" onClick={() => void refreshHistory()}>
            Refresh
          </button>
        </div>
        <p className="text-muted2 dwc-history-lead">
          Design to Order / Reports → Design Wise Costing · latest first · click DESI/DIN to open full costing · Clear Filters if list looks empty
        </p>
        <div className="dwc-filters">
          <label className="field">
            <span className="text-muted">Search DIN</span>
            <input
              value={historyFilters.din}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, din: e.target.value }))}
              placeholder="e.g. JFG1591"
            />
          </label>
          <label className="field">
            <span className="text-muted">Quality</span>
            <input
              value={historyFilters.quality}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, quality: e.target.value }))}
              placeholder="Quality name"
            />
          </label>
          <label className="field">
            <span className="text-muted">Yarn</span>
            <input
              value={historyFilters.yarn}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, yarn: e.target.value }))}
              placeholder="Yarn / quality text"
            />
          </label>
          <label className="field">
            <span className="text-muted">Date From</span>
            <input
              type="date"
              value={historyFilters.dateFrom}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Date To</span>
            <input
              type="date"
              value={historyFilters.dateTo}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Created By</span>
            <input
              value={historyFilters.createdBy}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, createdBy: e.target.value }))}
              placeholder="User name"
            />
          </label>
          <label className="field">
            <span className="text-muted">Status</span>
            <select
              value={historyFilters.status}
              onChange={(e) => setHistoryFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">All</option>
              <option value="final">Final</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <div className="dwc-filter-actions">
            <button
              type="button"
              className="dwc-secondary-btn"
              onClick={() => setHistoryFilters(EMPTY_FILTERS)}
            >
              Clear Filters
            </button>
          </div>
        </div>
        {historyError ? <p className="form-error text-danger">{historyError}</p> : null}
        <div className="dwc-table-wrap">
          <table className="dwc-table dwc-history-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>DIN</th>
                <th>Quality</th>
                <th>Length</th>
                <th>Yarn ₹/Mtr</th>
                <th>Total PIC</th>
                <th>Conv. Rate</th>
                <th>Weaving ₹</th>
                <th>MU %</th>
                <th>After MU</th>
                <th>GST %</th>
                <th>GST ₹</th>
                <th>Final ₹/Mtr</th>
                <th>Final Sale Rate</th>
                <th>Photo</th>
                <th>Created By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={18} className="text-muted">
                    {history.length === 0
                      ? 'No saved costings yet'
                      : 'No costings match the current filters'}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((row) => {
                  const gstShown =
                    row.gst_amount != null
                      ? Number(row.gst_amount)
                      : row.after_mu_per_mtr != null && row.gst_percent != null
                        ? Math.round(
                            (Number(row.after_mu_per_mtr) * Number(row.gst_percent)) / 100 * 100,
                          ) / 100
                        : null
                  const creator =
                    (row.created_by && userNames[row.created_by]) ||
                    (row.created_by ? row.created_by.slice(0, 8) : '—')
                  return (
                    <tr key={row.id} className={savedId === row.id ? 'dwc-row-active' : undefined}>
                      <td>{formatDisplayDate(row.costing_date)}</td>
                      <td>
                        <button
                          type="button"
                          className="dwc-din-link"
                          title="Open costing detail"
                          onClick={() =>
                            void loadById(row.id).catch((e: Error) => setError(e.message))
                          }
                        >
                          {row.din_number}
                        </button>
                      </td>
                      <td>{row.quality_name || '—'}</td>
                      <td className="num">
                        {row.design_length_mtr != null
                          ? fmtQty(Number(row.design_length_mtr), 0)
                          : '—'}
                      </td>
                      <td className="num">
                        {row.yarn_cost_per_mtr != null
                          ? fmtMoney(Number(row.yarn_cost_per_mtr))
                          : '—'}
                      </td>
                      <td className="num">
                        {row.total_pic != null ? fmtQty(Number(row.total_pic), 0) : '—'}
                      </td>
                      <td className="num">
                        {row.pic_conversion_rate != null
                          ? fmtMoney(Number(row.pic_conversion_rate))
                          : '—'}
                      </td>
                      <td className="num">
                        {row.conversion_charge != null
                          ? fmtMoney(Number(row.conversion_charge))
                          : '—'}
                      </td>
                      <td className="num">
                        {row.mu_percent != null ? fmtQty(Number(row.mu_percent), 0) : '—'}
                      </td>
                      <td className="num">
                        {row.after_mu_per_mtr != null
                          ? fmtMoney(Number(row.after_mu_per_mtr))
                          : '—'}
                      </td>
                      <td className="num">
                        {row.gst_percent != null ? fmtQty(Number(row.gst_percent), 0) : '—'}
                      </td>
                      <td className="num">{gstShown != null ? fmtMoney(gstShown) : '—'}</td>
                      <td className="num dwc-emphasis">
                        {row.final_cost_per_mtr != null
                          ? fmtInr(Number(row.final_cost_per_mtr))
                          : '—'}
                      </td>
                      <td className="num dwc-emphasis dwc-selling-rate">
                        {row.ceo_final_selling_rate != null
                          ? fmtInr(Number(row.ceo_final_selling_rate))
                          : '—'}
                      </td>
                      <td>
                        {row.diary_image_url ? (
                          <a
                            className="dwc-link-btn"
                            href={row.diary_image_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Photo
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{creator}</td>
                      <td>
                        <span
                          className={`dwc-status-chip dwc-status-${row.status === 'final' ? 'final' : 'draft'}`}
                        >
                          {row.status === 'final' ? 'Final' : 'Draft'}
                        </span>
                      </td>
                      <td>
                        <div className="dwc-history-actions">
                          <button
                            type="button"
                            className="dwc-link-btn"
                            onClick={() =>
                              void loadById(row.id).catch((e: Error) => setError(e.message))
                            }
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="dwc-link-btn"
                            onClick={() =>
                              void loadById(row.id).catch((e: Error) => setError(e.message))
                            }
                          >
                            Edit
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
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
