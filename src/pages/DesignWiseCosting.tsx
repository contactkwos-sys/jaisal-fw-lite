import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'
import {
  sortDesignNosBySeries,
  suggestNextDesignNo,
  uniqueDesignNosFromCostings,
  type DesignNoSeriesRow,
} from '../lib/designNoSeries'
import { DesignNoCombobox } from '../components/dinCosting/DesignNoCombobox'
import {
  CALC_HINTS,
  DEFAULT_DOUBLE_WIDTH_FACTOR,
  DEFAULT_EFFICIENCY_PCT,
  DEFAULT_LENGTH_MTR,
  DEFAULT_MACHINE_SPEED_RPM,
  DEFAULT_MU_PERCENT,
  DEFAULT_TAR_ENDS,
  DEFAULT_WIDTH,
  canEditDinCosting,
  canViewDinCosting,
  computeBuildup,
  computeProductionSpeed,
  computeProfitProjection,
  computeWarpRow,
  computeWeftRow,
  computeWastageParams,
  emptyWarp,
  emptyWeft,
  ensureBaseDenier,
  finalCostAuditLine,
  finalCostHint,
  finalSaleRate,
  formatCostingDenier,
  fmtInr,
  fmtMoney,
  fmtQty,
  loomPickWeftPicWarning,
  n,
  persistCostingDenier,
  syncCostingDenierFromBase,
  withBaseDenier,
  type WarpDraft,
  type WeftDraft,
} from '../lib/designWiseCosting'
import {
  fetchAllQualities,
  findQualityByName,
  qualityMasterTablesReady,
  type QualityMasterRow,
} from '../lib/qualityMaster'
import {
  FALLBACK_COLOURS,
  fetchAllColours,
} from '../lib/colourMaster'
import { fetchFormulaMaster, FORMULA_DEFAULTS } from '../lib/formulaMaster'
import { DinCostingViewOnly, CalcInfo, type DinCostingViewRow } from '../components/dinCosting/DinCostingViewOnly'
import { syncDinCostingFromLatest } from '../lib/designToOrder'
import { ensureDinMasterForCosting, findSharedDesign, normalizeDesignNumber } from '../lib/designIdentity'
import { handleUserError } from '../lib/userError'
import {
  fetchAllRates,
  lookupRateForCosting,
  rememberYarnBaseDenier,
  type RateMasterRow,
} from '../lib/rateMaster'
import { rateMasterItemNames } from '../lib/dinIntakeCosting'
import {
  DinDesignImportSection,
  type DinImageAttachPayload,
  type MissingRateItem,
} from '../components/dinCosting/DinDesignImportSection'
import { RateMasterYarnSelect } from '../components/dinCosting/RateMasterYarnSelect'
import { CompactRateCell } from '../components/dinCosting/CompactRateCell'
import {
  clearDinCostingDraft,
  dinCostingDraftHasContent,
  loadDinCostingDraft,
  saveDinCostingDraft,
  type DinCostingWorkingDraft,
} from '../lib/dinCostingDraftPersist'
import {
  detectMissingRates,
  uploadSampleImage,
  type DesignImportSource,
} from '../lib/designOcr'
import { applyEditDeleteOrQueue, isWithinEditWindow } from '../lib/pendingApprovals'
import type { NavTarget } from '../lib/nav'

type Props = { initialDin?: string; viewOnly?: boolean; onNavigate?: (t: NavTarget) => void }

const HISTORY_PAGE_SIZE = 40

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

export function DesignWiseCosting({ initialDin = '', viewOnly = false, onNavigate }: Props) {
  const { session, profile, isCeo, isManager, roleName } = useAuth()
  const canDeleteFinal = isCeo || isManager
  const canEdit = canEditDinCosting(roleName || '', isCeo, isManager)
  const canView = canViewDinCosting(roleName || '', isCeo, isManager)

  // Sync-restore working draft before first paint (survives Quality/Rate Master navigation)
  const bootDraftRef = useRef<DinCostingWorkingDraft | null | undefined>(undefined)
  if (bootDraftRef.current === undefined) {
    if (viewOnly || (initialDin && String(initialDin).trim())) {
      bootDraftRef.current = null
    } else {
      const d = loadDinCostingDraft()
      bootDraftRef.current = dinCostingDraftHasContent(d) ? d : null
    }
  }
  const boot = bootDraftRef.current

  const [dinNumber, setDinNumber] = useState(() => boot?.dinNumber || initialDin || '')
  const [costingDate, setCostingDate] = useState(() => boot?.costingDate || todayISO())
  const [qualityName, setQualityName] = useState(() => boot?.qualityName || '')
  const [designLength, setDesignLength] = useState(() => boot?.designLength || '')
  const [loomPick, setLoomPick] = useState(() => boot?.loomPick || '')
  const [designNoSeries, setDesignNoSeries] = useState<DesignNoSeriesRow[]>([])
  const [diaryUrl, setDiaryUrl] = useState<string | null>(() => boot?.diaryUrl || null)
  const [warps, setWarps] = useState<WarpDraft[]>(() =>
    boot?.warps?.length ? boot.warps : [emptyWarp(1)],
  )
  const [wefts, setWefts] = useState<WeftDraft[]>(() =>
    boot?.wefts?.length ? boot.wefts : [emptyWeft(1)],
  )
  const [picConversionRate, setPicConversionRate] = useState(() => boot?.picConversionRate || '0.45')
  const [muPercent, setMuPercent] = useState(
    () => boot?.muPercent || String(DEFAULT_MU_PERCENT),
  )
  const [gstPercent, setGstPercent] = useState(() => boot?.gstPercent || '0')
  const [wastageMtr, setWastageMtr] = useState(() => boot?.wastageMtr || '10')
  const [wastagePercent, setWastagePercent] = useState(() => boot?.wastagePercent || '10')
  const [ceoFinalSellingRate, setCeoFinalSellingRate] = useState(() => boot?.ceoFinalSellingRate || '')
  const [fixedCostPerMtr, setFixedCostPerMtr] = useState(() => boot?.fixedCostPerMtr || '')
  const [desiredProfitPerMtr, setDesiredProfitPerMtr] = useState(() => boot?.desiredProfitPerMtr || '')
  const [productionMeters, setProductionMeters] = useState(() => boot?.productionMeters || '')
  const [isLocked, setIsLocked] = useState(() => Boolean(boot?.isLocked))
  const [formulaDefaults, setFormulaDefaults] = useState(FORMULA_DEFAULTS)
  const [savedId, setSavedId] = useState<string | null>(() => boot?.savedId || null)
  const [status, setStatus] = useState<'draft' | 'final'>(() =>
    boot?.status === 'final' ? 'final' : 'draft',
  )
  const [history, setHistory] = useState<CostingHistoryRow[]>([])
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [listTab, setListTab] = useState<'costings' | 'series'>('costings')
  const [seriesQuery, setSeriesQuery] = useState('')
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  const [yarnByCosting, setYarnByCosting] = useState<Record<string, string>>({})
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>(EMPTY_FILTERS)
  const [debouncedHistoryFilters, setDebouncedHistoryFilters] =
    useState<HistoryFilters>(EMPTY_FILTERS)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(() =>
    boot ? 'Restored unsaved DIN Costing draft' : null,
  )
  const [dragOver, setDragOver] = useState(false)
  const [lengthError, setLengthError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const skipDinAutoloadRef = useRef(false)
  const draftHydratedRef = useRef(Boolean(boot))
  const skipDraftSaveRef = useRef(false)
  const restoredFromDraftRef = useRef(Boolean(boot))
  const [masterRates, setMasterRates] = useState<RateMasterRow[]>([])
  const [designImageUrl, setDesignImageUrl] = useState<string | null>(() => boot?.designImageUrl || null)
  const [sampleImageUrl, setSampleImageUrl] = useState<string | null>(() => boot?.sampleImageUrl || null)
  const [sampleUploading, setSampleUploading] = useState(false)
  const [qualities, setQualities] = useState<QualityMasterRow[]>([])
  const [colourOptions, setColourOptions] = useState<string[]>([...FALLBACK_COLOURS])
  const [qualityMasterId, setQualityMasterId] = useState(() => boot?.qualityMasterId || '')
  const [machineType, setMachineType] = useState(() => boot?.machineType || 'Jacquard')
  const [machineSpeedRpm, setMachineSpeedRpm] = useState(
    () => boot?.machineSpeedRpm || String(DEFAULT_MACHINE_SPEED_RPM),
  )
  const [efficiencyPct, setEfficiencyPct] = useState(
    () => boot?.efficiencyPct || String(DEFAULT_EFFICIENCY_PCT),
  )
  const [doubleWidthFactor, setDoubleWidthFactor] = useState(
    () => boot?.doubleWidthFactor || String(DEFAULT_DOUBLE_WIDTH_FACTOR),
  )
  const [productionBasis, setProductionBasis] = useState<'hour' | '12h' | '24h' | '28d'>(
    () => boot?.productionBasis || '12h',
  )
  const [importSource, setImportSource] = useState<DesignImportSource | null>(
    () => boot?.importSource || null,
  )
  const [missingRates, setMissingRates] = useState<MissingRateItem[]>([])
  const [savedCreatedAt, setSavedCreatedAt] = useState<string | null>(() => boot?.savedCreatedAt || null)

  const warpYarnOptions = useMemo(() => rateMasterItemNames(masterRates, 'warp'), [masterRates])
  const weftYarnOptions = useMemo(() => rateMasterItemNames(masterRates, 'weft'), [masterRates])

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
        if (!restoredFromDraftRef.current) {
          setDesignLength((prev) => prev || String(cfg.default_base_length_mtr))
          setWastageMtr(String(cfg.default_wastage_mtr))
          setWastagePercent(String(cfg.default_wastage_percent))
        } else {
          setDesignLength((prev) => prev || String(cfg.default_base_length_mtr))
        }
      })
      .catch(() => setFormulaDefaults(FORMULA_DEFAULTS))
  }, [])

  useEffect(() => {
    void fetchAllRates()
      .then(setMasterRates)
      .catch(() => setMasterRates([]))
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const ready = await qualityMasterTablesReady()
        if (ready) {
          const rows = await fetchAllQualities({ activeOnly: true })
          setQualities(rows)
        }
      } catch {
        /* Quality Master optional until migration */
      }
      try {
        const rows = await fetchAllColours({ activeOnly: true })
        if (rows.length) setColourOptions(rows.map((c) => c.colour_name))
      } catch {
        /* Colour Master optional — keep FALLBACK_COLOURS */
      }
    })()
  }, [])

  // Auto-save working draft so Quality Master / Rate Master navigation does not lose data
  useEffect(() => {
    if (skipDraftSaveRef.current || viewOnly || isLocked) return
    draftHydratedRef.current = true
    const buildPayload = (): DinCostingWorkingDraft => ({
      version: 1,
      updatedAt: Date.now(),
      dinNumber,
      costingDate,
      qualityName,
      qualityMasterId,
      designLength,
      loomPick,
      warps,
      wefts,
      picConversionRate,
      muPercent,
      gstPercent,
      wastageMtr,
      wastagePercent,
      ceoFinalSellingRate,
      fixedCostPerMtr,
      desiredProfitPerMtr,
      productionMeters,
      machineType,
      machineSpeedRpm,
      efficiencyPct,
      doubleWidthFactor,
      productionBasis,
      designImageUrl,
      sampleImageUrl,
      diaryUrl,
      importSource,
      savedId,
      savedCreatedAt,
      status,
      isLocked,
    })
    const t = window.setTimeout(() => {
      const payload = buildPayload()
      if (dinCostingDraftHasContent(payload)) saveDinCostingDraft(payload)
    }, 250)
    return () => {
      window.clearTimeout(t)
      // Flush on unmount / navigation so nothing is lost mid-debounce
      if (skipDraftSaveRef.current || viewOnly || isLocked) return
      const payload = buildPayload()
      if (dinCostingDraftHasContent(payload)) saveDinCostingDraft(payload)
    }
  }, [
    viewOnly,
    isLocked,
    dinNumber,
    costingDate,
    qualityName,
    qualityMasterId,
    designLength,
    loomPick,
    warps,
    wefts,
    picConversionRate,
    muPercent,
    gstPercent,
    wastageMtr,
    wastagePercent,
    ceoFinalSellingRate,
    fixedCostPerMtr,
    desiredProfitPerMtr,
    productionMeters,
    machineType,
    machineSpeedRpm,
    efficiencyPct,
    doubleWidthFactor,
    productionBasis,
    designImageUrl,
    sampleImageUrl,
    diaryUrl,
    importSource,
    savedId,
    savedCreatedAt,
    status,
  ])

  const applyWarpRateFromMaster = useCallback(
    (row: WarpDraft): WarpDraft => {
      if (!row.yarn_name.trim() || !costingDate) return row
      let next = syncCostingDenierFromBase(row)
      if (!next.tar_ends) next = { ...next, tar_ends: String(DEFAULT_TAR_ENDS) }
      if (!next.width) next = { ...next, width: String(DEFAULT_WIDTH) }
      if (!next.length_mtr) next = { ...next, length_mtr: String(DEFAULT_LENGTH_MTR) }
      const costingDenier = formatCostingDenier(next)
      const found = lookupRateForCosting(masterRates, 'warp', next.yarn_name, costingDate, {
        denier: costingDenier || next.base_denier || undefined,
      })
      if (!found) return next
      if (found.row.denier) {
        next = ensureBaseDenier(next, String(found.row.denier), next.yarn_name)
      }
      return {
        ...next,
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
      let next = syncCostingDenierFromBase(row)
      if (!next.width) next = { ...next, width: String(DEFAULT_WIDTH) }
      if (!next.length_mtr) next = { ...next, length_mtr: String(DEFAULT_LENGTH_MTR) }
      const costingDenier = formatCostingDenier(next)
      const found = lookupRateForCosting(masterRates, 'weft', next.weft_name, costingDate, {
        denier: costingDenier || next.base_denier || undefined,
      })
      if (!found) return next
      if (found.row.denier) {
        next = ensureBaseDenier(next, String(found.row.denier), next.weft_name)
      }
      return {
        ...next,
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

  const applyQualityRecipe = useCallback(
    (q: QualityMasterRow) => {
      setQualityMasterId(q.id)
      setQualityName(q.quality_name)
      if (q.default_length_mtr) setDesignLength(String(q.default_length_mtr))

      const nextWarps =
        q.warp_recipe.length > 0
          ? q.warp_recipe.map((wr, i) => {
              let row = emptyWarp(i + 1, wr.length_mtr ? Number(wr.length_mtr) : q.default_length_mtr)
              const width = wr.width || (q.default_width ? String(q.default_width) : '')
              if (width) row = { ...row, width: String(width) }
              if (wr.yarn_name) row = { ...row, yarn_name: wr.yarn_name }
              if (wr.base_denier) row = withBaseDenier(row, String(wr.base_denier))
              if (wr.tar_ends) row = { ...row, tar_ends: String(wr.tar_ends) }
              else if (q.default_tar_ends) row = { ...row, tar_ends: String(q.default_tar_ends) }
              if (wr.rate_master_id) row = { ...row, rate_master_id: wr.rate_master_id }
              return applyWarpRateFromMaster(row)
            })
          : [
              (() => {
                let row = emptyWarp(1, q.default_length_mtr)
                if (q.default_width) row = { ...row, width: String(q.default_width) }
                if (q.default_tar_ends) row = { ...row, tar_ends: String(q.default_tar_ends) }
                return row
              })(),
            ]
      setWarps(nextWarps)

      setWefts((prevWefts) => {
        if (!q.weft_recipe.length) {
          return [emptyWeft(1, { lengthMtr: q.default_length_mtr, width: q.default_width })]
        }
        return q.weft_recipe.map((wr, i) => {
          const feederNo = wr.feeder_no != null ? Number(wr.feeder_no) : i + 1
          const lengthMtr = wr.length_mtr ? Number(wr.length_mtr) : q.default_length_mtr
          const width = wr.width ? Number(wr.width) : q.default_width
          let row = emptyWeft(i + 1, {
            feederNo,
            colour: wr.colour ?? '',
            lengthMtr,
            width,
          })
          if (wr.weft_name) row = { ...row, weft_name: wr.weft_name }
          if (wr.base_denier) row = withBaseDenier(row, String(wr.base_denier))
          if (wr.rate_master_id) row = { ...row, rate_master_id: wr.rate_master_id }
          const recipePic = wr.pic != null && String(wr.pic).trim() !== '' ? String(wr.pic) : ''
          if (recipePic) {
            row = { ...row, pic: recipePic }
          } else {
            const existing = prevWefts.find((w) => w.feeder_no === feederNo)
            if (existing?.pic) row = { ...row, pic: existing.pic }
          }
          return applyWeftRateFromMaster(row)
        })
      })
    },
    [applyWarpRateFromMaster, applyWeftRateFromMaster],
  )

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedHistoryFilters(historyFilters), 280)
    return () => window.clearTimeout(t)
  }, [historyFilters])

  useEffect(() => {
    if (!masterRates.length || !costingDate || isLocked) return
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
  }, [costingDate, masterRates, applyWarpRateFromMaster, applyWeftRateFromMaster, isLocked])

  useEffect(() => {
    if (isLocked) return
    setMissingRates(detectMissingRates(warps, wefts, masterRates, costingDate))
  }, [warps, wefts, masterRates, costingDate, isLocked])

  const refreshDesignNoSeries = useCallback(async () => {
    const { data, error: sErr } = await supabase
      .from('design_costing')
      .select('id, din_number, quality_name, status, updated_at, created_at')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (sErr) {
      // Soft-fail — combobox can still accept free text
      console.warn('Design No. series load failed', sErr.message)
      return
    }
    setDesignNoSeries(uniqueDesignNosFromCostings(data ?? []))
  }, [])

  useEffect(() => {
    void refreshDesignNoSeries()
  }, [refreshDesignNoSeries])

  const designNoOptions = useMemo(
    () =>
      designNoSeries.map((r) => ({
        dinNumber: r.dinNumber,
        qualityName: r.qualityName || undefined,
        latestAt: r.latestAt,
      })),
    [designNoSeries],
  )

  const seriesSorted = useMemo(() => {
    const q = seriesQuery.trim().toLowerCase()
    const base = sortDesignNosBySeries(designNoSeries)
    if (!q) return base
    return base.filter(
      (r) =>
        r.dinNumber.toLowerCase().includes(q) || r.qualityName.toLowerCase().includes(q),
    )
  }, [designNoSeries, seriesQuery])

  const nextDesignSuggestion = useMemo(
    () => suggestNextDesignNo(designNoSeries),
    [designNoSeries],
  )

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

  const saleRateForBilling =
    finalSaleRate(ceoFinalSellingRate, buildup.finalCostPerMtr) ?? buildup.customerRatePerMtr
  const production = useMemo(
    () =>
      computeProductionSpeed({
        rpm: machineSpeedRpm,
        loomPick: loomPick || buildup.totalPic,
        widthInch: warps[0]?.width || wefts[0]?.width || DEFAULT_WIDTH,
        efficiencyPct,
        doubleWidthFactor,
        customerSaleRatePerMtr: saleRateForBilling,
        profitPerMtr: profit.profitPerMtr,
      }),
    [
      machineSpeedRpm,
      loomPick,
      buildup.totalPic,
      warps,
      wefts,
      efficiencyPct,
      doubleWidthFactor,
      saleRateForBilling,
      profit.profitPerMtr,
    ],
  )

  useEffect(() => {
    const m =
      productionBasis === 'hour'
        ? production.metersPerHour
        : productionBasis === '24h'
          ? production.metersPer24Hours
          : productionBasis === '28d'
            ? production.metersPer28Days
            : production.metersPer12Hours
    if (m > 0) setProductionMeters(String(m))
  }, [
    efficiencyPct,
    machineSpeedRpm,
    doubleWidthFactor,
    loomPick,
    productionBasis,
    buildup.totalPic,
    production.metersPerHour,
    production.metersPer12Hours,
    production.metersPer24Hours,
    production.metersPer28Days,
  ])

  const isReadOnly = !canEdit || isLocked

  const refreshHistory = useCallback(async (opts?: { append?: boolean }) => {
    const append = Boolean(opts?.append)
    setHistoryLoading(true)
    setHistoryError(null)
    const from = append ? history.length : 0
    const to = from + HISTORY_PAGE_SIZE - 1
    try {
      const { data, error: hErr } = await supabase
        .from('design_costing')
        .select(HISTORY_SELECT)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)
      let rows: CostingHistoryRow[] = []
      if (hErr) {
        // Older DBs may lack new columns — fall back to core fields
        const { data: fallback, error: fErr } = await supabase
          .from('design_costing')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (fErr) {
          setHistoryError(fErr.message)
          if (!append) setHistory([])
          return
        }
        rows = (fallback as CostingHistoryRow[]) ?? []
        setHistoryError(`Using legacy columns (${hErr.message})`)
      } else {
        rows = (data as CostingHistoryRow[]) ?? []
      }

      setHistory((prev) => (append ? [...prev, ...rows] : rows))
      setHistoryHasMore(rows.length === HISTORY_PAGE_SIZE)

      const costingIds = rows.map((r) => r.id)
      // Yarn enrichment only when yarn filter is active — avoids N+2 queries on every refresh
      const yarnQ = historyFilters.yarn.trim()
      if (yarnQ && costingIds.length) {
        const [{ data: warpYarns }, { data: weftYarns }] = await Promise.all([
          supabase.from('design_costing_warp').select('costing_id, yarn_name').in('costing_id', costingIds),
          supabase.from('design_costing_weft').select('costing_id, weft_name').in('costing_id', costingIds),
        ])
        setYarnByCosting((prev) => {
          const yarnMap = append ? { ...prev } : {}
          for (const w of warpYarns ?? []) {
            const key = w.costing_id as string
            yarnMap[key] = `${yarnMap[key] || ''} ${w.yarn_name || ''}`.trim()
          }
          for (const w of weftYarns ?? []) {
            const key = w.costing_id as string
            yarnMap[key] = `${yarnMap[key] || ''} ${w.weft_name || ''}`.trim()
          }
          return yarnMap
        })
      } else if (!append) {
        setYarnByCosting({})
      }

      const ids = [
        ...new Set(
          rows
            .flatMap((r) => [r.created_by, r.updated_by])
            .filter((id): id is string => Boolean(id)),
        ),
      ]
      if (ids.length) {
        const { data: users } = await supabase.from('users').select('id, full_name').in('id', ids)
        if (users?.length) {
          const map: Record<string, string> = {}
          for (const u of users) map[u.id] = u.full_name || u.id
          setUserNames((prev) => ({ ...prev, ...map }))
        }
      }
    } finally {
      setHistoryLoading(false)
    }
  }, [history.length, historyFilters.yarn])

  useEffect(() => {
    void refreshHistory()
  }, []) // initial load only — Refresh / Load more / save/delete call explicitly

  // When yarn filter becomes active, enrich yarns for currently loaded rows
  useEffect(() => {
    const yarnQ = debouncedHistoryFilters.yarn.trim()
    if (!yarnQ || !history.length) return
    const costingIds = history.map((r) => r.id)
    let cancelled = false
    void (async () => {
      const [{ data: warpYarns }, { data: weftYarns }] = await Promise.all([
        supabase.from('design_costing_warp').select('costing_id, yarn_name').in('costing_id', costingIds),
        supabase.from('design_costing_weft').select('costing_id, weft_name').in('costing_id', costingIds),
      ])
      if (cancelled) return
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
    })()
    return () => {
      cancelled = true
    }
  }, [debouncedHistoryFilters.yarn, history])

  const applyHeader = useCallback((header: Record<string, unknown>) => {
    setSavedId(String(header.id))
    setSavedCreatedAt(header.created_at ? String(header.created_at) : null)
    setDinNumber(String(header.din_number || ''))
    setQualityName(String(header.quality_name || ''))
    setCostingDate(String(header.costing_date || todayISO()))
    setDiaryUrl((header.diary_image_url as string | null) || null)
    setDesignImageUrl((header.design_image_url as string | null) || null)
    setSampleImageUrl((header.sample_image_url as string | null) || null)
    setImportSource((header.import_source as DesignImportSource | null) || null)
    setStatus(header.status === 'final' ? 'final' : 'draft')
    setIsLocked(Boolean(header.is_locked))

    const lengthVal = header.design_length_mtr
    setDesignLength(lengthVal != null && lengthVal !== '' ? String(lengthVal) : '')
    setLoomPick(header.loom_pick != null && header.loom_pick !== '' ? String(header.loom_pick) : '')
    setMachineType(header.machine_type != null && header.machine_type !== '' ? String(header.machine_type) : 'Jacquard')
    setMachineSpeedRpm(
      header.machine_speed_rpm != null && header.machine_speed_rpm !== ''
        ? String(header.machine_speed_rpm)
        : String(DEFAULT_MACHINE_SPEED_RPM),
    )
    setEfficiencyPct(
      header.efficiency_pct != null && header.efficiency_pct !== ''
        ? String(header.efficiency_pct)
        : '100',
    )
    setQualityMasterId(header.quality_master_id != null ? String(header.quality_master_id) : '')

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
    setMuPercent(
      header.mu_percent != null && header.mu_percent !== ''
        ? String(header.mu_percent)
        : String(DEFAULT_MU_PERCENT),
    )
    setGstPercent(String(header.gst_percent ?? 0))
    setDoubleWidthFactor(String(DEFAULT_DOUBLE_WIDTH_FACTOR))
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
          ? (warpRows ?? []).map((r, i) => {
              const base = r.base_denier != null ? String(r.base_denier) : ''
              const row: WarpDraft = {
                key: r.id || crypto.randomUUID(),
                sr_no: r.sr_no ?? i + 1,
                yarn_name: r.yarn_name || '',
                base_denier: base,
                denier: r.denier != null ? String(r.denier) : '',
                tar_ends: r.tar_ends != null ? String(r.tar_ends) : String(DEFAULT_TAR_ENDS),
                width: String(DEFAULT_WIDTH),
                length_mtr: r.length_mtr != null ? String(r.length_mtr) : String(DEFAULT_LENGTH_MTR),
                rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
                // Drafts without explicit manual flag re-bind to Rate Master on refresh
                rate_source:
                  r.rate_source === 'manual'
                    ? 'manual'
                    : r.rate_source === 'rate_master' || r.rate_master_id
                      ? 'rate_master'
                      : r.rate_per_kg != null
                        ? 'rate_master'
                        : '',
                rate_master_id: r.rate_master_id || undefined,
              }
              return base ? syncCostingDenierFromBase(row) : row
            })
          : [emptyWarp(1)]

      const mappedWefts: WeftDraft[] =
        (weftRows ?? []).length > 0
          ? (weftRows ?? []).map((r, i) => {
              const feederNo = r.feeder_no != null ? Number(r.feeder_no) : i + 1
              const base = r.base_denier != null ? String(r.base_denier) : ''
              const row: WeftDraft = {
                key: r.id || crypto.randomUUID(),
                sr_no: r.sr_no ?? i + 1,
                feeder_label: r.feeder_label || `Colour ${feederNo}`,
                feeder_no: Number.isFinite(feederNo) ? feederNo : i + 1,
                colour: (r as { colour?: string | null }).colour != null
                  ? String((r as { colour?: string | null }).colour)
                  : '',
                weft_name: r.weft_name || '',
                base_denier: base,
                denier: r.denier != null ? String(r.denier) : '',
                pic: r.pic != null ? String(r.pic) : '',
                width: r.width != null ? String(r.width) : String(DEFAULT_WIDTH),
                length_mtr: r.length_mtr != null ? String(r.length_mtr) : String(DEFAULT_LENGTH_MTR),
                rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
                rate_source:
                  r.rate_source === 'manual'
                    ? 'manual'
                    : r.rate_source === 'rate_master' || r.rate_master_id
                      ? 'rate_master'
                      : r.rate_per_kg != null
                        ? 'rate_master'
                        : '',
                rate_master_id: r.rate_master_id || undefined,
                strings_ref: r.strings_ref != null ? String(r.strings_ref) : '',
              }
              return base ? syncCostingDenierFromBase(row) : row
            })
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
      const trimmed = normalizeDesignNumber(din)
      if (!trimmed) return
      const { data: rows, error: hErr } = await supabase
        .from('design_costing')
        .select('id')
        .eq('din_number', trimmed)
        .order('created_at', { ascending: false })
        .limit(1)
      if (hErr) throw hErr
      const header = rows?.[0]
      if (header) {
        await loadById(header.id)
        return
      }
      // Bridge: Design Intake may store the same fabric under dins.design_name / din_number
      const shared = await findSharedDesign(trimmed)
      if (shared?.costingId) {
        await loadById(shared.costingId)
        return
      }
      if (shared?.din) {
        setDinNumber(shared.din.din_number)
        if (shared.din.design_name) setQualityName(shared.din.design_name)
        if (shared.din.din_image_url) {
          setDesignImageUrl(shared.din.din_image_url)
          setDiaryUrl((prev) => prev || shared.din!.din_image_url)
        }
        setMessage(`Opened design master ${shared.din.din_number} — enter costing below`)
      }
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
    const dinQ = debouncedHistoryFilters.din.trim().toLowerCase()
    const qualityQ = debouncedHistoryFilters.quality.trim().toLowerCase()
    const yarnQ = debouncedHistoryFilters.yarn.trim().toLowerCase()
    const byQ = debouncedHistoryFilters.createdBy.trim().toLowerCase()
    const statusQ = debouncedHistoryFilters.status.trim().toLowerCase()

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
      if (
        debouncedHistoryFilters.dateFrom &&
        row.costing_date &&
        row.costing_date < debouncedHistoryFilters.dateFrom
      ) {
        return false
      }
      if (
        debouncedHistoryFilters.dateTo &&
        row.costing_date &&
        row.costing_date > debouncedHistoryFilters.dateTo
      ) {
        return false
      }
      return true
    })
  }, [history, debouncedHistoryFilters, userNames, yarnByCosting])

  function resetForm(keepDin = false) {
    skipDraftSaveRef.current = true
    clearDinCostingDraft()
    if (!keepDin) setDinNumber('')
    setCostingDate(todayISO())
    setQualityName('')
    setQualityMasterId('')
    setDesignLength(String(formulaDefaults.default_base_length_mtr || DEFAULT_LENGTH_MTR))
    setLoomPick('')
    setMachineType('Jacquard')
    setMachineSpeedRpm(String(DEFAULT_MACHINE_SPEED_RPM))
    setEfficiencyPct(String(DEFAULT_EFFICIENCY_PCT))
    setDoubleWidthFactor(String(DEFAULT_DOUBLE_WIDTH_FACTOR))
    setProductionBasis('12h')
    setDiaryUrl(null)
    setDesignImageUrl(null)
    setSampleImageUrl(null)
    setImportSource(null)
    setMissingRates([])
    setWarps([emptyWarp(1)])
    setWefts([emptyWeft(1)])
    setPicConversionRate('0.45')
    setMuPercent(String(DEFAULT_MU_PERCENT))
    setGstPercent('0')
    setWastageMtr(String(formulaDefaults.default_wastage_mtr))
    setWastagePercent(String(formulaDefaults.default_wastage_percent))
    setCeoFinalSellingRate('')
    setFixedCostPerMtr('')
    setDesiredProfitPerMtr('')
    setProductionMeters('')
    setIsLocked(false)
    setSavedId(null)
    setSavedCreatedAt(null)
    setStatus('draft')
    setLengthError(null)
    setError(null)
    setMessage(null)
    restoredFromDraftRef.current = false
    window.setTimeout(() => {
      skipDraftSaveRef.current = false
    }, 0)
  }

  async function handleDiaryFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('costing-diary-images')
        .upload(path, file, { upsert: false, contentType: file.type || undefined })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('costing-diary-images').getPublicUrl(path)
      setDiaryUrl(pub.publicUrl)
      setMessage('Diary photo uploaded — enter values manually from the photo')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Diary upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSampleImageFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file for the sample')
      return
    }
    setSampleUploading(true)
    setError(null)
    try {
      const url = await uploadSampleImage(file, dinNumber || undefined)
      setSampleImageUrl(url)
      setMessage('Sample image uploaded — save costing to keep it on this Design No.')
      if (savedId && !isLocked) {
        const { error: uErr } = await supabase
          .from('design_costing')
          .update({ sample_image_url: url, updated_at: new Date().toISOString() })
          .eq('id', savedId)
        if (uErr && /sample_image_url/i.test(uErr.message)) {
          setMessage(
            'Sample image uploaded locally — run migration-din-sample-image.sql on Supabase, then Save.',
          )
        } else if (uErr) {
          throw uErr
        } else {
          setMessage('Sample image saved for this Design No.')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sample image upload failed')
    } finally {
      setSampleUploading(false)
    }
  }

  type PersistOverrides = {
    dinNumber?: string
    qualityName?: string
    designLength?: string
    loomPick?: string
    warps?: WarpDraft[]
    wefts?: WeftDraft[]
    designImageUrl?: string | null
    sampleImageUrl?: string | null
    diaryUrl?: string | null
    importSource?: DesignImportSource | null
    /** When true, always insert a new design_costing row (ignore current savedId). */
    forceNew?: boolean
  }

  function validateBeforeSave(overrides?: PersistOverrides, finalize = false): boolean {
    const din = (overrides?.dinNumber ?? dinNumber).trim()
    const quality = (overrides?.qualityName ?? qualityName).trim()
    const length = overrides?.designLength ?? designLength
    const warpsCheck = overrides?.warps ?? warps
    const weftsCheck = overrides?.wefts ?? wefts
    const loom = overrides?.loomPick ?? loomPick
    if (!din) {
      setError('DI / Design Number is required')
      return false
    }
    if (!costingDate) {
      setError('Date is required')
      return false
    }
    if (!quality) {
      setError('Quality Name is required')
      return false
    }
    if (n(length) <= 0) {
      setLengthError('Length must be greater than zero')
      setError('Length must be greater than zero (default 110 Mtr)')
      return false
    }
    setLengthError(null)
    if (n(picConversionRate) < 0 || n(muPercent) < 0 || n(gstPercent) < 0) {
      setError('Conversion Rate, MU % and GST % cannot be negative')
      return false
    }

    if (finalize) {
      if (n(loom) <= 0) {
        setError('TOTAL LOOM PICK is required before Finalize Costing')
        return false
      }
      const hasWarp = warpsCheck.some((r) => r.yarn_name.trim())
      const hasWeft = weftsCheck.some((r) => n(r.pic) > 0 || r.weft_name.trim())
      if (!hasWarp) {
        setError('At least one Warp yarn row is required before Finalize')
        return false
      }
      if (!hasWeft) {
        setError('At least one Weft / Colour-Feeder row is required before Finalize')
        return false
      }
      for (const row of warpsCheck) {
        if (!row.yarn_name.trim()) continue
        if (!(n(row.base_denier) > 0)) {
          setError(`Warp "${row.yarn_name}": Base Denier is required`)
          return false
        }
        const costing = n(formatCostingDenier(row))
        if (costing !== n(row.base_denier) + 10) {
          setError(`Warp "${row.yarn_name}": Costing Denier must equal Base Denier + 10`)
          return false
        }
        if (!(n(row.length_mtr) > 0) || !(n(row.width || DEFAULT_WIDTH) > 0)) {
          setError(`Warp "${row.yarn_name}": Width and Length must be valid`)
          return false
        }
        if (row.rate_source !== 'manual' && !(n(row.rate_per_kg) > 0)) {
          setError(`Rate not found in Rate Master for warp "${row.yarn_name}"`)
          return false
        }
      }
      for (const row of weftsCheck) {
        if (!row.weft_name.trim() && !(n(row.pic) > 0)) continue
        if (row.weft_name.trim() && !(n(row.base_denier) > 0)) {
          setError(`Weft "${row.weft_name || row.feeder_label}": Base Denier is required`)
          return false
        }
        if (n(row.base_denier) > 0) {
          const costing = n(formatCostingDenier(row))
          if (costing !== n(row.base_denier) + 10) {
            setError(
              `Weft "${row.weft_name || row.feeder_label}": Costing Denier must equal Base Denier + 10`,
            )
            return false
          }
        }
        if (!(n(row.width) > 0) || !(n(row.length_mtr) > 0)) {
          setError(`Weft "${row.weft_name || row.feeder_label}": Width and Length must be valid`)
          return false
        }
        if (row.weft_name.trim() && row.rate_source !== 'manual' && !(n(row.rate_per_kg) > 0)) {
          setError(`Rate not found in Rate Master for weft "${row.weft_name}"`)
          return false
        }
      }
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
    dinOverride?: string,
  ) {
    try {
      await supabase.from('design_costing_audit').insert({
        costing_id: costingId,
        din_number: (dinOverride ?? dinNumber).trim(),
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

  async function persist(asDraft: boolean, finalize = false, overrides?: PersistOverrides) {
    if (!validateBeforeSave(overrides, finalize)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const din = (overrides?.dinNumber ?? dinNumber).trim()
      const quality = (overrides?.qualityName ?? qualityName).trim()
      const lengthStr = overrides?.designLength ?? designLength
      const warpsToSave = overrides?.warps ?? warps
      const weftsToSave = overrides?.wefts ?? wefts
      const diaryToSave = overrides?.diaryUrl !== undefined ? overrides.diaryUrl : diaryUrl
      const designImgToSave =
        overrides?.designImageUrl !== undefined ? overrides.designImageUrl : designImageUrl
      const sampleImgToSave =
        overrides?.sampleImageUrl !== undefined ? overrides.sampleImageUrl : sampleImageUrl
      const importToSave =
        overrides?.importSource !== undefined ? overrides.importSource : importSource
      const totals = computeBuildup(
        warpsToSave,
        weftsToSave,
        n(lengthStr),
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
        din_number: din,
        quality_name: quality || null,
        costing_date: costingDate,
        diary_image_url: diaryToSave,
        design_image_url: designImgToSave,
        sample_image_url: sampleImgToSave,
        import_source: importToSave,
        design_length_mtr: totals.enteredLengthMtr,
        loom_pick: n(overrides?.loomPick ?? loomPick) || null,
        machine_type: machineType || null,
        machine_speed_rpm: n(machineSpeedRpm) || null,
        efficiency_pct: n(efficiencyPct) || null,
        quality_master_id: qualityMasterId || null,
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

      let costingId = overrides?.forceNew ? null : savedId
      let previousWarpIds: string[] = []
      let previousWeftIds: string[] = []

      const stripProdCols = <T extends Record<string, unknown>>(payload: T) => {
        const {
          machine_type: _mt,
          machine_speed_rpm: _ms,
          efficiency_pct: _ep,
          quality_master_id: _qm,
          ...rest
        } = payload
        void _mt
        void _ms
        void _ep
        void _qm
        return rest
      }
      const missingProdCol = /machine_type|machine_speed_rpm|efficiency_pct|quality_master_id/i

      if (costingId) {
        const { created_by: _omit, ...updatePayload } = header
        void _omit
        const { error: uErr } = await supabase
          .from('design_costing')
          .update(updatePayload)
          .eq('id', costingId)
        if (uErr) {
          if (/sample_image_url/i.test(uErr.message)) {
            const { sample_image_url: _si, ...rest } = updatePayload as Record<string, unknown>
            void _si
            const { error: uSample } = await supabase
              .from('design_costing')
              .update(rest)
              .eq('id', costingId)
            if (uSample && /loom_pick/i.test(uSample.message)) {
              const { loom_pick: _lp, ...rest2 } = rest
              void _lp
              const { error: u2 } = await supabase.from('design_costing').update(rest2).eq('id', costingId)
              if (u2 && missingProdCol.test(u2.message)) {
                const { error: u3 } = await supabase
                  .from('design_costing')
                  .update(stripProdCols(rest2))
                  .eq('id', costingId)
                if (u3) throw u3
              } else if (u2) {
                throw u2
              }
            } else if (uSample && missingProdCol.test(uSample.message)) {
              const { error: u3 } = await supabase
                .from('design_costing')
                .update(stripProdCols(rest))
                .eq('id', costingId)
              if (u3) throw u3
            } else if (uSample) {
              throw uSample
            }
          } else if (/loom_pick/i.test(uErr.message)) {
            const { loom_pick: _lp, ...rest } = updatePayload as Record<string, unknown>
            void _lp
            const { error: u2 } = await supabase.from('design_costing').update(rest).eq('id', costingId)
            if (u2 && missingProdCol.test(u2.message)) {
              const { error: u3 } = await supabase
                .from('design_costing')
                .update(stripProdCols(rest))
                .eq('id', costingId)
              if (u3) throw u3
            } else if (u2) {
              throw u2
            }
          } else if (missingProdCol.test(uErr.message)) {
            const { error: u2 } = await supabase
              .from('design_costing')
              .update(stripProdCols(updatePayload as Record<string, unknown>))
              .eq('id', costingId)
            if (u2) throw u2
          } else if (/column .* does not exist/i.test(uErr.message)) {
            throw new Error(
              `${uErr.message} — run public/migration-din-costing-final-logic.sql (and design-wise-costing) on Supabase`,
            )
          } else {
            throw uErr
          }
        }

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
          if (/sample_image_url/i.test(iErr.message)) {
            const { sample_image_url: _si, ...rest } = header as Record<string, unknown>
            void _si
            const { data: dSample, error: iSample } = await supabase
              .from('design_costing')
              .insert(rest)
              .select('id')
              .single()
            if (iSample && /loom_pick/i.test(iSample.message)) {
              const { loom_pick: _lp, ...rest2 } = rest
              void _lp
              const { data: d2, error: i2 } = await supabase
                .from('design_costing')
                .insert(rest2)
                .select('id')
                .single()
              if (i2 && missingProdCol.test(i2.message)) {
                const { data: d3, error: i3 } = await supabase
                  .from('design_costing')
                  .insert(stripProdCols(rest2))
                  .select('id')
                  .single()
                if (i3) throw i3
                costingId = d3.id
                setSavedId(costingId)
              } else if (i2) {
                throw i2
              } else {
                costingId = d2.id
                setSavedId(costingId)
              }
            } else if (iSample && missingProdCol.test(iSample.message)) {
              const { data: d3, error: i3 } = await supabase
                .from('design_costing')
                .insert(stripProdCols(rest))
                .select('id')
                .single()
              if (i3) throw i3
              costingId = d3.id
              setSavedId(costingId)
            } else if (iSample) {
              throw iSample
            } else {
              costingId = dSample.id
              setSavedId(costingId)
            }
          } else if (/loom_pick/i.test(iErr.message)) {
            const { loom_pick: _lp, ...rest } = header as Record<string, unknown>
            void _lp
            const { data: d2, error: i2 } = await supabase
              .from('design_costing')
              .insert(rest)
              .select('id')
              .single()
            if (i2 && missingProdCol.test(i2.message)) {
              const { data: d3, error: i3 } = await supabase
                .from('design_costing')
                .insert(stripProdCols(rest))
                .select('id')
                .single()
              if (i3) throw i3
              costingId = d3.id
              setSavedId(costingId)
            } else if (i2) {
              if (/column .* does not exist/i.test(i2.message)) {
                throw new Error(
                  `${i2.message} — run public/migration-design-wise-costing.sql on Supabase so Save / Report columns exist`,
                )
              }
              throw i2
            } else {
              costingId = d2.id
              setSavedId(costingId)
            }
          } else if (missingProdCol.test(iErr.message)) {
            const { data: d2, error: i2 } = await supabase
              .from('design_costing')
              .insert(stripProdCols(header as Record<string, unknown>))
              .select('id')
              .single()
            if (i2) throw i2
            costingId = d2.id
            setSavedId(costingId)
          } else if (/column .* does not exist/i.test(iErr.message)) {
            throw new Error(
              `${iErr.message} — run public/migration-din-costing-final-logic.sql (and design-wise-costing) on Supabase`,
            )
          } else {
            throw iErr
          }
        } else {
          costingId = data.id
          setSavedId(costingId)
        }
      }

      setStatus(finalize ? 'final' : asDraft ? 'draft' : status)
      if (finalize) setIsLocked(true)

      const persistDenier = (
        row: { base_denier?: string; denier: string },
        yarnName: string,
      ): number | null => persistCostingDenier(row, yarnName)

      const warpPayload = warpsToSave.map((row, i) => ({
        costing_id: costingId,
        sr_no: i + 1,
        yarn_name: row.yarn_name.trim() || null,
        base_denier: n(row.base_denier) || null,
        denier: persistDenier(row, row.yarn_name),
        tar_ends: n(row.tar_ends) || null,
        length_mtr: n(row.length_mtr) || null,
        rate_per_kg: n(row.rate_per_kg) || null,
        rate_source: row.rate_source || null,
        rate_master_id: row.rate_master_id || null,
      }))
      const weftPayload = weftsToSave.map((row, i) => ({
        costing_id: costingId,
        sr_no: i + 1,
        weft_name: row.weft_name.trim() || null,
        base_denier: n(row.base_denier) || null,
        denier: persistDenier(row, row.weft_name),
        pic: n(row.pic) || null,
        width: n(row.width) || DEFAULT_WIDTH,
        length_mtr: n(row.length_mtr) || DEFAULT_LENGTH_MTR,
        rate_per_kg: n(row.rate_per_kg) || null,
        rate_source: row.rate_source || null,
        rate_master_id: row.rate_master_id || null,
        feeder_no: row.feeder_no,
        feeder_label: row.feeder_label || null,
        colour: row.colour || null,
        strings_ref: row.strings_ref || null,
      }))

      const insertWarps = async () => {
        if (!warpPayload.length) return
        const { error: wErr } = await supabase.from('design_costing_warp').insert(warpPayload)
        if (wErr && /base_denier/i.test(wErr.message)) {
          const slim = warpPayload.map(({ base_denier: _b, ...rest }) => {
            void _b
            return rest
          })
          const { error: w2 } = await supabase.from('design_costing_warp').insert(slim)
          if (w2) throw w2
          return
        }
        if (wErr) throw wErr
      }
      const insertWefts = async () => {
        if (!weftPayload.length) return
        const { error: fErr } = await supabase.from('design_costing_weft').insert(weftPayload)
        if (fErr && /colour/i.test(fErr.message) && !/base_denier|feeder_|strings_ref/i.test(fErr.message)) {
          const slimColour = weftPayload.map(({ colour: _c, ...rest }) => {
            void _c
            return rest
          })
          const { error: fColour } = await supabase.from('design_costing_weft').insert(slimColour)
          if (fColour && /base_denier|feeder_|strings_ref/i.test(fColour.message)) {
            const slim = slimColour.map(
              ({ base_denier: _b, feeder_no: _f, feeder_label: _l, strings_ref: _s, ...rest }) => {
                void _b
                void _f
                void _l
                void _s
                return rest
              },
            )
            const { error: f2 } = await supabase.from('design_costing_weft').insert(slim)
            if (f2) throw f2
            return
          }
          if (fColour) throw fColour
          return
        }
        if (fErr && /base_denier|feeder_|strings_ref|colour/i.test(fErr.message)) {
          const slim = weftPayload.map(
            ({
              base_denier: _b,
              feeder_no: _f,
              feeder_label: _l,
              strings_ref: _s,
              colour: _c,
              ...rest
            }) => {
              void _b
              void _f
              void _l
              void _s
              void _c
              return rest
            },
          )
          const { error: f2 } = await supabase.from('design_costing_weft').insert(slim)
          if (f2) throw f2
          return
        }
        if (fErr) throw fErr
      }

      await insertWarps()
      await insertWefts()

      // Remember base denier on Rate Master for next selection
      for (const row of warpsToSave) {
        if (row.yarn_name.trim() && n(row.base_denier) > 0) {
          void rememberYarnBaseDenier('warp', row.yarn_name, row.base_denier, userId)
        }
      }
      for (const row of weftsToSave) {
        if (row.weft_name.trim() && n(row.base_denier) > 0) {
          void rememberYarnBaseDenier('weft', row.weft_name, row.base_denier, userId)
        }
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

      // Ensure shared Design Intake master uses the SAME Design Number (no orphan costing)
      try {
        await ensureDinMasterForCosting({
          designNumber: din,
          qualityName: quality,
          imageUrl: designImgToSave || diaryToSave,
          source: importToSave || 'din_costing',
          userId,
        })
        await syncDinCostingFromLatest(din)
      } catch {
        /* DIN master sync is best-effort — costing row is already saved */
      }

      if (!asDraft || finalize) {
        const { error: designErr } = await supabase
          .from('designs')
          .update({
            cost_per_meter: totals.finalCostPerMtr,
            total_cost: totals.finalCostPerMtr,
          })
          .eq('dno', din)
        if (designErr) {
          clearDinCostingDraft()
          setMessage(
            `Costing saved to DIN ${din} · Final ${fmtInr(totals.finalCostPerMtr)}/mtr (design register sync: ${designErr.message})`,
          )
          await refreshHistory()
          await refreshDesignNoSeries()
          return
        }
      }

      await refreshHistory()
      await refreshDesignNoSeries()
      clearDinCostingDraft()
      const idHint = costingId ? ` · ID ${String(costingId).slice(0, 8)}` : ''
      setMessage(
        finalize
          ? `Saved successfully — Costing finalized & locked for ${din}${idHint} · CEO rate ${fmtInr(n(ceoFinalSellingRate) || totals.finalCostPerMtr)}/mtr`
          : asDraft
            ? `Saved successfully — Draft for ${din}${idHint} · ${fmtInr(totals.finalCostPerMtr)}/mtr`
            : `Saved successfully — Costing for ${din}${idHint} · ${fmtInr(totals.finalCostPerMtr)}/mtr`,
      )
    } catch (e) {
      setError(handleUserError('DinCosting.persist', e, 'Save failed — check Design No., rates, and try again'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteCosting(
    id: string,
    rowStatus: string | null,
    createdAt?: string | null,
  ) {
    if (rowStatus === 'final' && !canDeleteFinal) {
      setError('Only authorized users (CEO / Manager) can delete finalized costings')
      return
    }
    const ok = window.confirm(
      (() => {
        const within =
          isCeo ||
          !createdAt ||
          isWithinEditWindow(createdAt || savedCreatedAt || new Date().toISOString())
        if (within) return 'Delete this DIN costing? Cannot be undone'
        return 'Delete this DIN costing? Cannot be undone. This record is older than 7 days — delete will go to CEO for approval.'
      })(),
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const requestedBy = profile?.id || session?.user?.id || 'unknown'
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: createdAt || savedCreatedAt || new Date().toISOString(),
        tableName: 'design_costing',
        recordId: id,
        action: 'delete',
        requestedBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('design_costing').delete().eq('id', id)
          if (dErr) throw dErr
        },
      })
      if (savedId === id) resetForm()
      await refreshHistory()
      await refreshDesignNoSeries()
      setMessage(
        result === 'applied'
          ? 'Costing deleted'
          : 'Delete sent for CEO approval — not deleted until CEO approves',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function onDinSelect(value: string) {
    setDinNumber(value)
    const match = designNoSeries.find((d) => d.dinNumber === value.trim().toUpperCase())
    if (match?.qualityName && !qualityName) setQualityName(match.qualityName)
  }

  /** DIN sheet image attached as reference only — no auto-read. */
  function handleDesignImageAttach(payload: DinImageAttachPayload) {
    setDesignImageUrl(payload.designImageUrl)
    setImportSource(payload.importSource)
    setMessage('DIN sheet image attached — enter Design No., Quality, Loom Pick, Warp & Weft manually')
    requestAnimationFrame(() => {
      document.getElementById('dwc-design-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function refreshRatesFromMaster() {
    setBusy(true)
    setError(null)
    try {
      const rates = await fetchAllRates()
      setMasterRates(rates)
      setWarps((prev) =>
        prev.map((row) => {
          let synced = syncCostingDenierFromBase({
            ...row,
            tar_ends: row.tar_ends || String(DEFAULT_TAR_ENDS),
            width: row.width || String(DEFAULT_WIDTH),
            length_mtr: row.length_mtr || String(DEFAULT_LENGTH_MTR),
          })
          if (synced.rate_source === 'manual') return synced
          if (!synced.yarn_name.trim()) return synced
          const costingDenier = formatCostingDenier(synced)
          const found = lookupRateForCosting(rates, 'warp', synced.yarn_name, costingDate, {
            denier: costingDenier || synced.base_denier || undefined,
          })
          if (!found) {
            return {
              ...synced,
              rate_per_kg: '',
              rate_source: undefined,
              rate_master_id: undefined,
            }
          }
          if (found.row.denier) {
            synced = ensureBaseDenier(synced, String(found.row.denier), synced.yarn_name)
          }
          return {
            ...synced,
            rate_per_kg: String(found.calc.effectiveRate),
            rate_source: 'rate_master' as const,
            rate_master_id: found.row.id,
            rate_basic: found.calc.basicRate,
            rate_gst_percent: found.calc.gstPercent,
            rate_gst_amount: found.calc.gstAmount,
            rate_freight: found.calc.freightPerKg,
            rate_effective_from: found.row.effective_from,
          }
        }),
      )
      setWefts((prev) =>
        prev.map((row) => {
          let synced = syncCostingDenierFromBase({
            ...row,
            width: row.width || String(DEFAULT_WIDTH),
            length_mtr: row.length_mtr || String(DEFAULT_LENGTH_MTR),
          })
          if (synced.rate_source === 'manual') return synced
          const name = synced.weft_name.trim()
          if (!name || name === '-' || name === '—' || name === '–') return synced
          const costingDenier = formatCostingDenier(synced)
          const found = lookupRateForCosting(rates, 'weft', name, costingDate, {
            denier: costingDenier || synced.base_denier || undefined,
          })
          if (!found) {
            return {
              ...synced,
              rate_per_kg: '',
              rate_source: undefined,
              rate_master_id: undefined,
            }
          }
          if (found.row.denier) {
            synced = ensureBaseDenier(synced, String(found.row.denier), name)
          }
          return {
            ...synced,
            rate_per_kg: String(found.calc.effectiveRate),
            rate_source: 'rate_master' as const,
            rate_master_id: found.row.id,
            rate_basic: found.calc.basicRate,
            rate_gst_percent: found.calc.gstPercent,
            rate_gst_amount: found.calc.gstAmount,
            rate_freight: found.calc.freightPerKg,
            rate_effective_from: found.row.effective_from,
          }
        }),
      )
      setMessage('Rates refreshed from Rate Master — costing recalculated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rate refresh failed')
    } finally {
      setBusy(false)
    }
  }

  function resetWarpToRateMaster(rowKey: string) {
    setWarps((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        const cleared = { ...row, rate_source: undefined as WarpDraft['rate_source'], rate_master_id: undefined }
        return applyWarpRateFromMaster(cleared)
      }),
    )
    setMessage('Rate Master rate applied — row recalculated')
  }

  function resetWeftToRateMaster(rowKey: string) {
    setWefts((prev) =>
      prev.map((row) => {
        if (row.key !== rowKey) return row
        const cleared = { ...row, rate_source: undefined as WeftDraft['rate_source'], rate_master_id: undefined }
        return applyWeftRateFromMaster(cleared)
      }),
    )
    setMessage('Rate Master rate applied — row recalculated')
  }

  async function recalculateFromUi() {
    if (isLocked) {
      setMessage('Finalized costing is locked — historical rates are preserved')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rates = await fetchAllRates()
      setMasterRates(rates)

      const nextWarps = warps.map((row) => {
        let synced = syncCostingDenierFromBase({
          ...row,
          tar_ends: row.tar_ends || String(DEFAULT_TAR_ENDS),
          width: row.width || String(DEFAULT_WIDTH),
          length_mtr: row.length_mtr || String(DEFAULT_LENGTH_MTR),
        })
        if (synced.rate_source === 'manual') return synced
        if (!synced.yarn_name.trim()) return synced
        const costingDenier = formatCostingDenier(synced)
        const found = lookupRateForCosting(rates, 'warp', synced.yarn_name, costingDate, {
          denier: costingDenier || synced.base_denier || undefined,
        })
        if (!found) {
          return { ...synced, rate_per_kg: '', rate_source: undefined, rate_master_id: undefined }
        }
        if (found.row.denier) {
          synced = ensureBaseDenier(synced, String(found.row.denier), synced.yarn_name)
        }
        return {
          ...synced,
          rate_per_kg: String(found.calc.effectiveRate),
          rate_source: 'rate_master' as const,
          rate_master_id: found.row.id,
          rate_basic: found.calc.basicRate,
          rate_gst_percent: found.calc.gstPercent,
          rate_gst_amount: found.calc.gstAmount,
          rate_freight: found.calc.freightPerKg,
          rate_effective_from: found.row.effective_from,
        }
      })

      const nextWefts = wefts.map((row) => {
        let synced = syncCostingDenierFromBase({
          ...row,
          width: row.width || String(DEFAULT_WIDTH),
          length_mtr: row.length_mtr || String(DEFAULT_LENGTH_MTR),
        })
        if (synced.rate_source === 'manual') return synced
        const name = synced.weft_name.trim()
        if (!name || name === '-' || name === '—' || name === '–') return synced
        const costingDenier = formatCostingDenier(synced)
        const found = lookupRateForCosting(rates, 'weft', name, costingDate, {
          denier: costingDenier || synced.base_denier || undefined,
        })
        if (!found) {
          return { ...synced, rate_per_kg: '', rate_source: undefined, rate_master_id: undefined }
        }
        if (found.row.denier) {
          synced = ensureBaseDenier(synced, String(found.row.denier), name)
        }
        return {
          ...synced,
          rate_per_kg: String(found.calc.effectiveRate),
          rate_source: 'rate_master' as const,
          rate_master_id: found.row.id,
          rate_basic: found.calc.basicRate,
          rate_gst_percent: found.calc.gstPercent,
          rate_gst_amount: found.calc.gstAmount,
          rate_freight: found.calc.freightPerKg,
          rate_effective_from: found.row.effective_from,
        }
      })

      setWarps(nextWarps)
      setWefts(nextWefts)
      setMissingRates(detectMissingRates(nextWarps, nextWefts, rates, costingDate))
      setBusy(false)
      setMessage('Calculation updated — saving latest values…')
      await persist(true, false, { warps: nextWarps, wefts: nextWefts })
      setMessage('Recalculated and saved — reopen will show these values')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recalculate failed')
      setBusy(false)
    }
  }

  function openRateMasterForItem(category: 'warp' | 'weft', itemName: string) {
    if (!onNavigate) return
    onNavigate({ screen: 'rate-master', module: 'masters', filter: `add:${category}:${itemName}` })
  }

  function isWarpRateMissing(row: WarpDraft): boolean {
    if (isLocked || !row.yarn_name.trim()) return false
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return false
    const costingDenier = formatCostingDenier(row)
    return !lookupRateForCosting(masterRates, 'warp', row.yarn_name, costingDate, {
      denier: costingDenier || row.base_denier || undefined,
    })
  }

  function isWeftRateMissing(row: WeftDraft): boolean {
    if (isLocked || !row.weft_name.trim()) return false
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return false
    const costingDenier = formatCostingDenier(row)
    return !lookupRateForCosting(masterRates, 'weft', row.weft_name, costingDate, {
      denier: costingDenier || row.base_denier || undefined,
    })
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
      // Never pass internal diary/DIN sheet image to program/sales view
      diary_image_url: null,
      status: row.status,
      is_locked: row.is_locked,
    }))
    return <DinCostingViewOnly rows={viewRows} onRefresh={() => void refreshHistory()} />
  }

  const wastageDisplay = computeWastageParams(n(designLength), n(wastageMtr), n(wastagePercent))

  return (
    <div className="screen dwc-screen dwc-single-page">
      <header className="screen-header dwc-header">
        <div>
          <h1>DIN Costing</h1>
          <p className="text-muted">
            Upload DIN sheet (reference) → Enter details manually → Auto Costing (Base+10 denier, 110 Mtr internal / 100 Mtr customer)
          </p>
        </div>
        {savedId ? (
          <span className={`dwc-status-chip dwc-status-${status}`}>
            {isLocked ? 'Finalized · Locked' : status === 'final' ? 'Finalized' : 'Draft'}
          </span>
        ) : null}
      </header>

      {!isReadOnly ? (
        <DinDesignImportSection
          disabled={isReadOnly}
          designImageUrl={designImageUrl}
          onAttach={handleDesignImageAttach}
          onOpenRateMaster={
            onNavigate ? () => onNavigate({ screen: 'rate-master', module: 'masters' }) : undefined
          }
        />
      ) : null}

      {missingRates.length > 0 && !isLocked ? (
        <section className="dwc-panel dwc-missing-rates" role="alert">
          <h2 className="section-title">Missing Rates</h2>
          <ul className="dwc-missing-rates-list">
            {missingRates.map((m, i) => (
              <li key={`${m.category}-${m.itemName}-${i}`}>
                Rate not found in Rate Master for <strong>{m.itemName}</strong> ({m.category})
                {onNavigate ? (
                  <button
                    type="button"
                    className="btn-link dwc-add-rate-link"
                    onClick={() => openRateMasterForItem(m.category, m.itemName)}
                  >
                    Add Rate
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="dwc-missing-rates-actions">
            {onNavigate ? (
              <button
                type="button"
                className="btn-warp"
                onClick={() => onNavigate({ screen: 'rate-master', module: 'masters' })}
              >
                Open Rate Master
              </button>
            ) : null}
            <button type="button" className="primary-save" disabled={busy} onClick={() => void refreshRatesFromMaster()}>
              Use Latest Rate
            </button>
          </div>
        </section>
      ) : null}

      <section className="dwc-panel dwc-compact-block" id="dwc-design-details">
        <h2 className="section-title">2 · Design Details</h2>
        <div className="dwc-details-row">
          <label className="field">
            <span className="text-muted">DESI / Design No. (formerly DIN)</span>
            <DesignNoCombobox
              value={dinNumber}
              options={designNoOptions}
              disabled={isReadOnly}
              required
              placeholder="Search or type new Design No."
              onChange={onDinSelect}
              onPick={(opt) => {
                onDinSelect(opt.dinNumber)
                if (opt.qualityName && !qualityName) setQualityName(opt.qualityName)
              }}
              onBlur={() => {
                if (skipDinAutoloadRef.current) {
                  skipDinAutoloadRef.current = false
                  return
                }
                if (!savedId) {
                  const hasDraftLines =
                    warps.some((r) => r.yarn_name.trim() || n(r.denier) || n(r.tar_ends) || n(r.rate_per_kg)) ||
                    wefts.some((r) => r.weft_name.trim() || n(r.denier) || n(r.pic) || n(r.rate_per_kg))
                  if (hasDraftLines) return
                }
                void loadExisting(dinNumber).catch((e: Error) => setError(e.message))
              }}
            />
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
              list="dwc-quality-master"
              value={qualityName}
              disabled={isReadOnly}
              onChange={(e) => {
                const next = e.target.value
                setQualityName(next)
                const q = findQualityByName(qualities, next)
                if (q) applyQualityRecipe(q)
              }}
              onBlur={() => {
                const q = findQualityByName(qualities, qualityName)
                if (q) applyQualityRecipe(q)
              }}
              placeholder="Select from Quality Master"
              required
            />
            <datalist id="dwc-quality-master">
              {qualities.map((q) => (
                <option key={q.id} value={q.quality_name} />
              ))}
            </datalist>
            {onNavigate ? (
              <button
                type="button"
                className="btn-link"
                onClick={() => onNavigate({ screen: 'quality-master', module: 'design-to-order' })}
              >
                Open Quality Master
              </button>
            ) : null}
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
          <label className="field">
            <span className="text-muted">TOTAL LOOM PICK</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={loomPick}
              disabled={isReadOnly}
              onChange={(e) => setLoomPick(e.target.value)}
              placeholder="Type manually"
            />
            <span className="dwc-hint">Enter manually from DIN sheet — verify before finalize</span>
          </label>
        </div>
        {loomPickWeftPicWarning(loomPick, buildup.totalPic) ? (
          <p className="form-error dwc-pic-warn" role="alert">
            {loomPickWeftPicWarning(loomPick, buildup.totalPic)}
          </p>
        ) : null}
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

      <section className="dwc-panel dwc-compact-block" id="dwc-sample-image">
        <h2 className="section-title">Sample Image</h2>
        <p className="text-muted2">
          Upload the physical fabric sample photo later (after cutting from the DIN sheet). Separate from
          DIN sheet reference image (not shown to sales).
        </p>
        <p className="dwc-hint">
          Salesman sees Final Sample Photo + Matching Collage only — never DIN sheet.
        </p>
        <div className="dwc-upload-row">
          <label className="dwc-dropzone">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={isReadOnly || sampleUploading}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                void handleSampleImageFile(f)
                e.target.value = ''
              }}
            />
            <span className="text-muted">
              {sampleUploading
                ? 'Uploading sample…'
                : sampleImageUrl
                  ? 'Replace sample image'
                  : 'Upload sample photo'}
            </span>
          </label>
          {sampleImageUrl ? (
            <div className="dwc-sample-preview-col">
              <a
                className="dwc-diary-preview"
                href={sampleImageUrl}
                target="_blank"
                rel="noreferrer"
                title="Open sample image"
                style={{ backgroundImage: `url(${sampleImageUrl})`, display: 'block' }}
              />
              <div className="dwc-sample-actions">
                <a className="btn-ghost btn-sm" href={sampleImageUrl} target="_blank" rel="noreferrer" download>
                  Download
                </a>
                {!isReadOnly ? (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setSampleImageUrl(null)
                      setMessage('Sample image cleared — Save to update record.')
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="dwc-diary-preview empty">No sample image</div>
          )}
        </div>
      </section>

      <details className="dwc-panel dwc-wastage-card dwc-accordion">
        <summary className="section-title">Wastage / Lossage (fixed 10%)</summary>
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
      </details>

      <details className="dwc-panel dwc-accordion">
        <summary className="section-title">Diary Page Upload (optional)</summary>
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
              {uploading ? 'Uploading…' : 'Drag & drop, click, or Take Photo'}
            </span>
          </label>
          {diaryUrl ? (
            <div className="dwc-diary-preview" style={{ backgroundImage: `url(${diaryUrl})` }} />
          ) : (
            <div className="dwc-diary-preview empty">Preview</div>
          )}
        </div>
      </details>

      <section className="dwc-panel dwc-compact-block">
        <div className="dwc-panel-head">
          <h2 className="section-title">3 · Warp Details</h2>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Warp Name</th>
                <th>Base Denier</th>
                <th>Costing Denier</th>
                <th>TAR / Ends</th>
                <th>Width</th>
                <th>Length (mtr)</th>
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
                    <td className="num" data-label="S.R.">{idx + 1}</td>
                    <td data-label="Warp Name">
                      <RateMasterYarnSelect
                        value={row.yarn_name}
                        options={warpYarnOptions}
                        disabled={isReadOnly}
                        placeholder="Select yarn from Rate Master"
                        aria-label="Warp yarn name"
                        onChange={(name) => {
                          setWarps((prev) =>
                            prev.map((r) => {
                              if (r.key !== row.key) return r
                              return { ...r, yarn_name: name }
                            }),
                          )
                        }}
                        onSelect={(name) => {
                          setWarps((prev) =>
                            prev.map((r) => {
                              if (r.key !== row.key) return r
                              return applyWarpRateFromMaster({ ...r, yarn_name: name })
                            }),
                          )
                        }}
                      />
                    </td>
                    <td data-label="Base Denier">
                      <input
                        className="num"
                        type="number"
                        min="0"
                        step="any"
                        value={row.base_denier}
                        disabled={isReadOnly}
                        title="Edit / Change Denier"
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? withBaseDenier(r, e.target.value) : r,
                            ),
                          )
                        }
                        onBlur={() => {
                          if (row.yarn_name.trim() && n(row.base_denier) > 0) {
                            void rememberYarnBaseDenier(
                              'warp',
                              row.yarn_name,
                              row.base_denier,
                              session?.user?.id || null,
                            )
                          }
                        }}
                      />
                    </td>
                    <td data-label="Costing Denier">
                      <input
                        className="num dwc-auto"
                        value={formatCostingDenier(row)}
                        readOnly
                        title={CALC_HINTS.costingDenier}
                      />
                    </td>
                    <td data-label="TAR / Ends">
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
                    <td data-label="Width">
                      <input
                        className="num"
                        type="number"
                        min="0"
                        step="any"
                        value={row.width || String(DEFAULT_WIDTH)}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setWarps((prev) =>
                            prev.map((r) => (r.key === row.key ? { ...r, width: e.target.value } : r)),
                          )
                        }
                      />
                    </td>
                    <td data-label="Length (mtr)">
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
                    <td data-label="Weight (kg)">
                      <input className="num dwc-auto" value={fmtQty(calc.weight)} readOnly />
                    </td>
                    <td data-label="Rate (₹/kg)">
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
                      <CompactRateCell
                        yarnLabel={row.yarn_name}
                        ratePerKg={row.rate_per_kg}
                        meta={row}
                        disabled={isReadOnly}
                        onUseRateMaster={() => resetWarpToRateMaster(row.key)}
                        isMissing={isWarpRateMissing(row)}
                        onAddRate={
                          onNavigate
                            ? () => openRateMasterForItem('warp', row.yarn_name)
                            : undefined
                        }
                      />
                    </td>
                    <td data-label="Amount (₹)">
                      <input className="num dwc-auto" value={fmtMoney(calc.amount)} readOnly />
                    </td>
                    <td data-label="Action">
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

      <section className="dwc-panel dwc-compact-block">
        <div className="dwc-panel-head">
          <h2 className="section-title">4 · Weft Details</h2>
          <span className="dwc-pic-total">TOTAL WEFT PIC: {fmtQty(buildup.totalPic, 0)}</span>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Feeder No.</th>
                <th>Colour</th>
                <th>Weft Name</th>
                <th>Base Denier</th>
                <th>Costing Denier</th>
                <th>PIC</th>
                <th>Width</th>
                <th>Length (mtr)</th>
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
                    <td className="num" data-label="S.R.">{idx + 1}</td>
                    <td data-label="Feeder">
                      <input
                        value={row.feeder_label || (row.feeder_no != null ? `Feeder ${row.feeder_no}` : '')}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, feeder_label: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td data-label="Colour">
                      <input
                        list="dwc-colours"
                        value={row.colour}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, colour: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="Colour"
                      />
                    </td>
                    <td data-label="Weft Name">
                      <RateMasterYarnSelect
                        value={row.weft_name}
                        options={weftYarnOptions}
                        disabled={isReadOnly}
                        placeholder="Select yarn from Rate Master"
                        aria-label="Weft yarn name"
                        onChange={(name) => {
                          setWefts((prev) =>
                            prev.map((r) => {
                              if (r.key !== row.key) return r
                              return { ...r, weft_name: name }
                            }),
                          )
                        }}
                        onSelect={(name) => {
                          setWefts((prev) =>
                            prev.map((r) => {
                              if (r.key !== row.key) return r
                              return applyWeftRateFromMaster({ ...r, weft_name: name })
                            }),
                          )
                        }}
                      />
                    </td>
                    <td data-label="Base Denier">
                      <input
                        className="num"
                        type="number"
                        min="0"
                        step="any"
                        value={row.base_denier}
                        disabled={isReadOnly}
                        title="Edit / Change Denier"
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? withBaseDenier(r, e.target.value) : r,
                            ),
                          )
                        }
                        onBlur={() => {
                          if (row.weft_name.trim() && n(row.base_denier) > 0) {
                            void rememberYarnBaseDenier(
                              'weft',
                              row.weft_name,
                              row.base_denier,
                              session?.user?.id || null,
                            )
                          }
                        }}
                      />
                    </td>
                    <td data-label="Costing Denier">
                      <input
                        className="num dwc-auto"
                        value={formatCostingDenier(row)}
                        readOnly
                        title={CALC_HINTS.costingDenier}
                      />
                    </td>
                    <td data-label="PIC">
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
                    <td data-label="Width">
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
                    <td data-label="Length (mtr)">
                      <input
                        className="num"
                        type="number"
                        min="0"
                        step="any"
                        value={row.length_mtr}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setWefts((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, length_mtr: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </td>
                    <td data-label="Weight (kg)">
                      <input className="num dwc-auto" value={fmtQty(calc.weight)} readOnly />
                    </td>
                    <td data-label="Rate (₹/kg)">
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
                      <CompactRateCell
                        yarnLabel={row.weft_name}
                        ratePerKg={row.rate_per_kg}
                        meta={row}
                        disabled={isReadOnly}
                        onUseRateMaster={() => resetWeftToRateMaster(row.key)}
                        isMissing={isWeftRateMissing(row)}
                        onAddRate={
                          onNavigate
                            ? () => openRateMasterForItem('weft', row.weft_name)
                            : undefined
                        }
                      />
                    </td>
                    <td data-label="Amount (₹)">
                      <input className="num dwc-auto" value={fmtMoney(calc.amount)} readOnly />
                    </td>
                    <td data-label="Action">
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
        <datalist id="dwc-colours">
          {colourOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        </div>
        <button
          type="button"
          className="btn-warp"
          onClick={() => setWefts((prev) => [...prev, emptyWeft(prev.length + 1)])}
        >
          + Add Weft Yarn
        </button>
      </section>

      <section className="dwc-panel dwc-summary-panel dwc-compact-block">
        <h2 className="section-title">5 · INTERNAL COST SUMMARY</h2>
        <p className="dwc-hint" style={{ marginTop: 0 }}>
          INTERNAL COSTING BASIS · 110 Mtr (yarn consumption)
        </p>
        <div className="dwc-totals-grid">
          <div>
            <span className="text-muted">Total Warp Cost</span>
            <strong className="num">{fmtMoney(buildup.totalWarpAmount)}</strong>
          </div>
          <div>
            <span className="text-muted">Total Weft Cost</span>
            <strong className="num">{fmtMoney(buildup.totalWeftAmount)}</strong>
          </div>
          <div>
            <span className="text-muted">TOTAL YARN COST / 110 Mtr</span>
            <strong className="num dwc-emphasis">{fmtMoney(buildup.totalYarnAmount)}</strong>
          </div>
        </div>
      </section>

      <section className="dwc-panel dwc-buildup dwc-compact-block" id="dwc-customer-rate">
        <h2 className="section-title">6 · CUSTOMER RATE CARD</h2>
        <div className="dwc-totals-grid" style={{ marginBottom: '0.75rem' }}>
          <div>
            <span className="text-muted">INTERNAL COSTING BASIS</span>
            <strong className="num">110 Mtr</strong>
          </div>
          <div>
            <span className="text-muted">CUSTOMER SELLING BASIS</span>
            <strong className="num">100 Mtr</strong>
          </div>
        </div>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span className="text-muted">TOTAL YARN COST</span>
            <input className="num dwc-auto" value={fmtMoney(buildup.totalYarnAmount)} readOnly />
            <span className="dwc-hint">₹ / 110 Mtr</span>
          </label>
          <label className="field">
            <span className="text-muted">
              YARN COST / 100 Mtr <CalcInfo hint={CALC_HINTS.yarnCostPerMtr} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.yarnCostPerMtr)} readOnly />
            <span className="dwc-hint">Total Yarn (110) ÷ 100</span>
          </label>
          <label className="field">
            <span className="text-muted">TOTAL WEFT PIC</span>
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
              WEAVING / CONVERSION <CalcInfo hint={CALC_HINTS.conversionCharge} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.conversionCharge)} readOnly />
            <span className="dwc-hint">₹ / Mtr · TOTAL WEFT PIC × PIC Rate</span>
          </label>
          <label className="field">
            <span className="text-muted">
              BASE CUSTOMER COST <CalcInfo hint={CALC_HINTS.subtotalPerMtr} />
            </span>
            <input className="num dwc-auto dwc-emphasis" value={fmtMoney(buildup.subtotalPerMtr)} readOnly />
            <span className="dwc-hint">Yarn / 100 Mtr + Weaving / Mtr</span>
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
            <span className="dwc-hint">Default 5%</span>
          </label>
          <label className="field">
            <span className="text-muted">
              MU AMOUNT / Mtr <CalcInfo hint={CALC_HINTS.muAmount} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.muAmount)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">
              After MU / Mtr <CalcInfo hint={CALC_HINTS.afterMuPerMtr} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.afterMuPerMtr)} readOnly />
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
              GST Amount / Mtr <CalcInfo hint={CALC_HINTS.gstAmount} />
            </span>
            <input className="num dwc-auto" value={fmtMoney(buildup.gstAmount)} readOnly />
          </label>
        </div>

        <div className="dwc-gst-split" aria-label="Customer rate summary">
          <div className="dwc-gst-card">
            <span className="text-muted">BASE CUSTOMER COST</span>
            <strong className="num">{fmtInr(buildup.subtotalPerMtr)}</strong>
            <span className="dwc-hint">/ Mtr</span>
          </div>
          <div className="dwc-gst-card">
            <span className="text-muted">MU</span>
            <strong className="num">{fmtQty(buildup.muPercent, 0)}%</strong>
            <span className="dwc-hint">{fmtInr(buildup.muAmount)} / Mtr</span>
          </div>
          <div className="dwc-gst-card">
            <span className="text-muted">FINAL CUSTOMER COST</span>
            <strong className="num">{fmtInr(buildup.finalCostPerMtr)}</strong>
            <span className="dwc-hint">{finalCostHint(buildup.gstPercent)} · / Mtr</span>
          </div>
          <div className="dwc-gst-card dwc-gst-final">
            <span className="text-muted">
              FINAL CUSTOMER SALE RATE <CalcInfo hint={CALC_HINTS.customerRatePerMtr} />
            </span>
            <strong className="num">
              {fmtInr(finalSaleRate(ceoFinalSellingRate, buildup.finalCostPerMtr) ?? buildup.finalCostPerMtr)}
            </strong>
            <span className="dwc-hint">/ Mtr</span>
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


      <section className="dwc-panel dwc-production-panel dwc-compact-block">
        <h2 className="section-title">
          7 · Production / Billing <CalcInfo hint={CALC_HINTS.productionSpeed} />
        </h2>
        <div className="dwc-buildup-grid">
          <label className="field">
            <span className="text-muted">Machine Type</span>
            <input
              value={machineType}
              disabled={isReadOnly}
              onChange={(e) => setMachineType(e.target.value)}
              placeholder="Jacquard"
            />
          </label>
          <label className="field">
            <span className="text-muted">Machine Speed RPM</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={machineSpeedRpm}
              disabled={isReadOnly}
              onChange={(e) => setMachineSpeedRpm(e.target.value)}
            />
            <span className="dwc-hint">Default 280 · editable</span>
          </label>
          <label className="field">
            <span className="text-muted">Double Width Factor</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={doubleWidthFactor}
              disabled={isReadOnly}
              onChange={(e) => setDoubleWidthFactor(e.target.value)}
            />
            <span className="dwc-hint">Default 2.00 · applied once in production</span>
          </label>
          <label className="field">
            <span className="text-muted">TOTAL LOOM PICK</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={loomPick}
              disabled={isReadOnly}
              onChange={(e) => setLoomPick(e.target.value)}
              placeholder="Manual entry"
            />
          </label>
          <label className="field">
            <span className="text-muted">Width</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={warps[0]?.width || wefts[0]?.width || String(DEFAULT_WIDTH)}
              disabled={isReadOnly}
              onChange={(e) => {
                const v = e.target.value
                setWarps((prev) =>
                  prev.length
                    ? prev.map((r, i) => (i === 0 ? { ...r, width: v } : r))
                    : prev,
                )
                setWefts((prev) =>
                  prev.length
                    ? prev.map((r, i) => (i === 0 ? { ...r, width: v } : r))
                    : prev,
                )
              }}
            />
          </label>
          <label className="field">
            <span className="text-muted">Efficiency %</span>
            <input
              className="num"
              type="number"
              min="0"
              max="100"
              step="any"
              value={efficiencyPct}
              disabled={isReadOnly}
              onChange={(e) => setEfficiencyPct(e.target.value)}
            />
          </label>
        </div>
        <div className="dwc-table-wrap">
          <table className="dwc-table dwc-production-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Production (Mtr)</th>
                <th>Billing (₹)</th>
                <th>Profit (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr
                className={productionBasis === 'hour' ? 'dwc-basis-selected' : undefined}
                onClick={() => !isReadOnly && setProductionBasis('hour')}
              >
                <td data-label="Period">Per Hour</td>
                <td data-label="Production" className="num">
                  {fmtQty(production.metersPerHour)}
                </td>
                <td data-label="Billing" className="num">
                  {fmtMoney(production.billingPerHour)}
                </td>
                <td data-label="Profit" className="num">
                  {fmtMoney(production.profitPerHour)}
                </td>
              </tr>
              <tr
                className={productionBasis === '12h' ? 'dwc-basis-selected' : undefined}
                onClick={() => !isReadOnly && setProductionBasis('12h')}
              >
                <td data-label="Period">12 Hours</td>
                <td data-label="Production" className="num">
                  {fmtQty(production.metersPer12Hours)}
                </td>
                <td data-label="Billing" className="num">
                  {fmtMoney(production.billingPer12Hours)}
                </td>
                <td data-label="Profit" className="num">
                  {fmtMoney(production.profitPer12Hours)}
                </td>
              </tr>
              <tr
                className={productionBasis === '24h' ? 'dwc-basis-selected' : undefined}
                onClick={() => !isReadOnly && setProductionBasis('24h')}
              >
                <td data-label="Period">24 Hours</td>
                <td data-label="Production" className="num">
                  {fmtQty(production.metersPer24Hours)}
                </td>
                <td data-label="Billing" className="num">
                  {fmtMoney(production.billingPer24Hours)}
                </td>
                <td data-label="Profit" className="num">
                  {fmtMoney(production.profitPer24Hours)}
                </td>
              </tr>
              <tr
                className={productionBasis === '28d' ? 'dwc-basis-selected' : undefined}
                onClick={() => !isReadOnly && setProductionBasis('28d')}
              >
                <td data-label="Period">28 Days</td>
                <td data-label="Production" className="num">
                  {fmtQty(production.metersPer28Days)}
                </td>
                <td data-label="Billing" className="num">
                  {fmtMoney(production.billingPer28Days)}
                </td>
                <td data-label="Profit" className="num">
                  {fmtMoney(production.profitPer28Days)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="dwc-totals-grid" style={{ marginTop: '0.75rem' }}>
          <div>
            <span className="text-muted">Theoretical Production</span>
            <strong className="num">
              {fmtQty(
                productionBasis === 'hour'
                  ? production.metersPerHour
                  : productionBasis === '24h'
                    ? production.metersPer24Hours
                    : productionBasis === '28d'
                      ? production.metersPer28Days
                      : production.metersPer12Hours,
              )}{' '}
              Mtr
            </strong>
          </div>
          <div>
            <span className="text-muted">ACTUAL PRODUCTION</span>
            <strong className="text-muted">Waiting for Production Data</strong>
            <span className="dwc-hint">Future machine / production module integration</span>
          </div>
        </div>
        <p className="dwc-hint">
          Billing = Production × Final Customer Sale Rate · Double Width Factor already in production
          (not applied twice)
        </p>
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
            <span className="text-muted">Efficiency %</span>
            <input
              className="num"
              type="number"
              min="0"
              max="100"
              step="any"
              value={efficiencyPct}
              disabled={isReadOnly}
              onChange={(e) => setEfficiencyPct(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Production (Meters) — auto from basis</span>
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
          <label className="field">
            <span className="text-muted">Profit / Hour</span>
            <input className="num dwc-auto" value={fmtMoney(production.profitPerHour)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Profit / 12 Hours</span>
            <input className="num dwc-auto" value={fmtMoney(production.profitPer12Hours)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Profit / 24 Hours</span>
            <input className="num dwc-auto" value={fmtMoney(production.profitPer24Hours)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Profit / 28 Days</span>
            <input className="num dwc-auto" value={fmtMoney(production.profitPer28Days)} readOnly />
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
          onClick={() => void recalculateFromUi()}
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
            onClick={() => void deleteCosting(savedId, status, savedCreatedAt)}
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
          <h2 className="section-title">
            {listTab === 'series' ? 'Design No. Series' : 'Saved Design Costings'}
          </h2>
          <div className="dwc-history-head-actions">
            <button
              type="button"
              className="dwc-secondary-btn"
              onClick={() => {
                void refreshHistory()
                void refreshDesignNoSeries()
              }}
              disabled={historyLoading}
            >
              {historyLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="dwc-list-tabs" role="tablist" aria-label="Saved costings views">
          <button
            type="button"
            role="tab"
            aria-selected={listTab === 'costings'}
            className={listTab === 'costings' ? 'dwc-list-tab active' : 'dwc-list-tab'}
            onClick={() => setListTab('costings')}
          >
            Saved Costings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={listTab === 'series'}
            className={listTab === 'series' ? 'dwc-list-tab active' : 'dwc-list-tab'}
            onClick={() => setListTab('series')}
          >
            Design No. Series
          </button>
        </div>

        {listTab === 'series' ? (
          <div className="dwc-series-panel">
            <p className="text-muted2 dwc-history-lead">
              All unique Design Nos. used so far, sorted by letter series then number. Click a row to
              open the latest costing for edit.
              {nextDesignSuggestion ? (
                <>
                  {' '}
                  Suggested next:{' '}
                  <button
                    type="button"
                    className="dwc-din-link"
                    onClick={() => {
                      setDinNumber(nextDesignSuggestion)
                      setListTab('costings')
                      requestAnimationFrame(() => {
                        document
                          .getElementById('dwc-design-details')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      })
                    }}
                  >
                    {nextDesignSuggestion}
                  </button>
                </>
              ) : null}
            </p>
            <label className="field dwc-series-search">
              <span className="text-muted">Search Design No.</span>
              <input
                value={seriesQuery}
                onChange={(e) => setSeriesQuery(e.target.value.toUpperCase())}
                placeholder="Filter e.g. JFG22"
              />
            </label>
            <div className="dwc-table-wrap">
              <table className="dwc-table dwc-series-table">
                <thead>
                  <tr>
                    <th>Design No.</th>
                    <th>Quality</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {seriesSorted.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-muted">
                        No Design Nos. yet
                      </td>
                    </tr>
                  ) : (
                    seriesSorted.map((row) => (
                      <tr key={row.dinNumber}>
                        <td>
                          <strong>{row.dinNumber}</strong>
                        </td>
                        <td>{row.qualityName || '—'}</td>
                        <td>
                          <span
                            className={`dwc-status-chip dwc-status-${row.status === 'final' ? 'final' : 'draft'}`}
                          >
                            {row.status === 'final' ? 'Final' : 'Draft'}
                          </span>
                        </td>
                        <td>{row.latestAt ? formatDisplayDate(row.latestAt.slice(0, 10)) : '—'}</td>
                        <td>
                          <div className="dwc-history-actions">
                            <button
                              type="button"
                              className="dwc-action-btn dwc-action-edit"
                              title="Edit latest costing"
                              onClick={() =>
                                void loadById(row.costingId).catch((e: Error) => setError(e.message))
                              }
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="dwc-action-btn"
                              title="Use this Design No. for a new costing"
                              onClick={() => {
                                resetForm()
                                setDinNumber(row.dinNumber)
                                if (row.qualityName) setQualityName(row.qualityName)
                                requestAnimationFrame(() => {
                                  document
                                    .getElementById('dwc-design-details')
                                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                })
                              }}
                            >
                              Use No.
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-muted2">
              Showing {seriesSorted.length} of {designNoSeries.length} unique Design Nos.
            </p>
          </div>
        ) : (
          <>
            <p className="text-muted2 dwc-history-lead">
              Latest first · Edit opens full costing · Delete asks for confirmation (7-day CEO rule
              applies) · filters are debounced
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
                    <th>TOTAL WEFT PIC</th>
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
                        {historyLoading
                          ? 'Loading…'
                          : history.length === 0
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
                              title="Edit this costing"
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
                                className="dwc-action-btn dwc-action-edit"
                                title="Edit costing"
                                onClick={() =>
                                  void loadById(row.id).catch((e: Error) => setError(e.message))
                                }
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="dwc-action-btn dwc-action-delete"
                                title="Delete costing"
                                disabled={row.status === 'final' && !canDeleteFinal}
                                onClick={() =>
                                  void deleteCosting(row.id, row.status, row.created_at)
                                }
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
            <div className="dwc-history-footer">
              <span className="text-muted2">
                Showing {filteredHistory.length} on screen · {history.length} loaded
                {historyHasMore ? ' · more available' : ''}
              </span>
              {historyHasMore ? (
                <button
                  type="button"
                  className="dwc-secondary-btn"
                  disabled={historyLoading}
                  onClick={() => void refreshHistory({ append: true })}
                >
                  {historyLoading ? 'Loading…' : 'Load more'}
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
