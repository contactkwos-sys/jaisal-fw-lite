/**
 * DESIGN Intake ↔ Design-wise Costing bridge.
 * After photo upload, intake can draft warp/weft lines with Rate Master rates.
 */

import {
  DEFAULT_LENGTH_MTR,
  DEFAULT_WIDTH,
  computeBuildup,
  emptyWarp,
  emptyWeft,
  withBaseDenier,
  type WarpDraft,
  type WeftDraft,
} from './designWiseCosting'
import { FORMULA_DEFAULTS, fetchFormulaMaster } from './formulaMaster'
import {
  WARP_CATALOGUE,
  WEFT_CATALOGUE,
  fetchAllRates,
  lookupRateForCosting,
  rememberedBaseDenier,
  type RateMasterRow,
} from './rateMaster'
import { todayISO } from './mutate'
import { supabase } from './supabase'

export type IntakeCostingDraft = {
  costingId: string | null
  status: 'draft' | 'final'
  isLocked: boolean
  costingDate: string
  designLength: string
  loomPick: string
  warps: WarpDraft[]
  wefts: WeftDraft[]
  picConversionRate: string
  muPercent: string
  gstPercent: string
  wastageMtr: string
  wastagePercent: string
}

export function emptyIntakeCostingDraft(): IntakeCostingDraft {
  return {
    costingId: null,
    status: 'draft',
    isLocked: false,
    costingDate: todayISO(),
    designLength: String(FORMULA_DEFAULTS.default_base_length_mtr || DEFAULT_LENGTH_MTR),
    loomPick: '',
    warps: [emptyWarp(1)],
    wefts: [emptyWeft(1)],
    picConversionRate: '0.45',
    muPercent: '0',
    gstPercent: '0',
    wastageMtr: String(FORMULA_DEFAULTS.default_wastage_mtr),
    wastagePercent: String(FORMULA_DEFAULTS.default_wastage_percent),
  }
}

export function rateMasterItemNames(rates: RateMasterRow[], category: 'warp' | 'weft'): string[] {
  const catalogue = category === 'warp' ? WARP_CATALOGUE : WEFT_CATALOGUE
  const fromCat = catalogue.map((c) => c.item_name)
  const fromDb = rates.filter((r) => r.category === category && r.is_active).map((r) => r.item_name)
  return [...new Set([...fromCat, ...fromDb])].sort((a, b) => a.localeCompare(b))
}

function applyRememberedBaseDenier<T extends { base_denier: string; denier: string }>(
  row: T,
  masterDenier: string | null | undefined,
  catalogueDenier?: string,
): T {
  if (row.base_denier.trim()) return row
  const fromMaster = rememberedBaseDenier(masterDenier)
  if (fromMaster) return withBaseDenier(row, fromMaster)
  const fromCat = rememberedBaseDenier(catalogueDenier)
  if (fromCat) return withBaseDenier(row, fromCat)
  return row
}

export function applyWarpItemFromMaster(
  row: WarpDraft,
  itemName: string,
  rates: RateMasterRow[],
  asOfDate: string,
): WarpDraft {
  const name = itemName.trim()
  let next: WarpDraft = { ...row, yarn_name: name }
  if (!name || !asOfDate) return next
  const cat = WARP_CATALOGUE.find((c) => c.item_name === name)
  const found = lookupRateForCosting(rates, 'warp', name, asOfDate, {
    denier: next.base_denier || next.denier,
  })
  next = applyRememberedBaseDenier(next, found?.row.denier, cat?.denier)
  if (!found) return next
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
}

export function applyWeftItemFromMaster(
  row: WeftDraft,
  itemName: string,
  rates: RateMasterRow[],
  asOfDate: string,
): WeftDraft {
  const name = itemName.trim()
  let next: WeftDraft = { ...row, weft_name: name }
  if (!name || !asOfDate) return next
  if (!next.width) next.width = String(DEFAULT_WIDTH)
  if (!next.length_mtr) next.length_mtr = String(DEFAULT_LENGTH_MTR)
  const cat = WEFT_CATALOGUE.find((c) => c.item_name === name)
  const found = lookupRateForCosting(rates, 'weft', name, asOfDate, {
    denier: next.base_denier || next.denier,
  })
  next = applyRememberedBaseDenier(next, found?.row.denier, cat?.denier)
  if (!found) return next
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
}

export async function loadIntakeCostingDefaults(): Promise<{
  rates: RateMasterRow[]
  draft: IntakeCostingDraft
}> {
  const [rates, formula] = await Promise.all([
    fetchAllRates().catch(() => [] as RateMasterRow[]),
    fetchFormulaMaster().catch(() => ({ id: '', ...FORMULA_DEFAULTS, updated_by: null, updated_at: null })),
  ])
  const draft = emptyIntakeCostingDraft()
  draft.designLength = String(formula.default_base_length_mtr)
  draft.wastageMtr = String(formula.default_wastage_mtr)
  draft.wastagePercent = String(formula.default_wastage_percent)
  return { rates, draft }
}

function mapWarpRow(r: Record<string, unknown>, i: number): WarpDraft {
  const base =
    r.base_denier != null && String(r.base_denier).trim() !== ''
      ? String(r.base_denier)
      : ''
  const denier = r.denier != null ? String(r.denier) : ''
  const row: WarpDraft = {
    key: crypto.randomUUID(),
    sr_no: Number(r.sr_no) || i + 1,
    yarn_name: String(r.yarn_name || ''),
    base_denier: base,
    denier,
    tar_ends: r.tar_ends != null ? String(r.tar_ends) : '',
    length_mtr: r.length_mtr != null ? String(r.length_mtr) : String(DEFAULT_LENGTH_MTR),
    rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
    rate_source: (r.rate_source as WarpDraft['rate_source']) || undefined,
    rate_master_id: (r.rate_master_id as string) || undefined,
  }
  // Legacy: only denier stored — treat as base so +10 applies going forward when user edits;
  // until then resolveCostingDenier uses denier as-is when base_denier empty.
  return row
}

function mapWeftRow(r: Record<string, unknown>, i: number): WeftDraft {
  const base =
    r.base_denier != null && String(r.base_denier).trim() !== ''
      ? String(r.base_denier)
      : ''
  const feederNo = r.feeder_no != null ? Number(r.feeder_no) : i + 1
  return {
    key: crypto.randomUUID(),
    sr_no: Number(r.sr_no) || i + 1,
    feeder_label: String(r.feeder_label || `Colour ${feederNo}`),
    feeder_no: Number.isFinite(feederNo) ? feederNo : i + 1,
    weft_name: String(r.weft_name || ''),
    base_denier: base,
    denier: r.denier != null ? String(r.denier) : '',
    pic: r.pic != null ? String(r.pic) : '',
    width: r.width != null ? String(r.width) : String(DEFAULT_WIDTH),
    length_mtr: r.length_mtr != null ? String(r.length_mtr) : String(DEFAULT_LENGTH_MTR),
    rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
    rate_source: (r.rate_source as WeftDraft['rate_source']) || undefined,
    rate_master_id: (r.rate_master_id as string) || undefined,
    strings_ref: r.strings_ref != null ? String(r.strings_ref) : '',
  }
}

export async function loadExistingCostingForDin(dinNumber: string): Promise<IntakeCostingDraft | null> {
  const trimmed = dinNumber.trim()
  if (!trimmed) return null
  const { data: header, error } = await supabase
    .from('design_costing')
    .select(
      'id, costing_date, design_length_mtr, loom_pick, wastage_mtr, wastage_percent, pic_conversion_rate, mu_percent, gst_percent, status, is_locked',
    )
    .eq('din_number', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !header) {
    // Fallback without loom_pick if column missing
    if (error && /loom_pick/i.test(error.message)) {
      const { data: h2, error: e2 } = await supabase
        .from('design_costing')
        .select(
          'id, costing_date, design_length_mtr, wastage_mtr, wastage_percent, pic_conversion_rate, mu_percent, gst_percent, status, is_locked',
        )
        .eq('din_number', trimmed)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (e2 || !h2) return null
      return loadDraftFromHeader(h2 as Record<string, unknown>, '')
    }
    return null
  }

  return loadDraftFromHeader(header as Record<string, unknown>, String(header.loom_pick ?? ''))
}

async function loadDraftFromHeader(
  header: Record<string, unknown>,
  loomPick: string,
): Promise<IntakeCostingDraft> {
  const [{ data: warpRows }, { data: weftRows }] = await Promise.all([
    supabase
      .from('design_costing_warp')
      .select(
        'sr_no, yarn_name, denier, base_denier, tar_ends, length_mtr, rate_per_kg, rate_source, rate_master_id',
      )
      .eq('costing_id', header.id)
      .order('sr_no'),
    supabase
      .from('design_costing_weft')
      .select(
        'sr_no, weft_name, denier, base_denier, pic, width, length_mtr, rate_per_kg, rate_source, rate_master_id, feeder_no, feeder_label, strings_ref',
      )
      .eq('costing_id', header.id)
      .order('sr_no'),
  ])

  // Soft fallback if new columns missing
  let warpsMapped: Record<string, unknown>[] | null = (warpRows as Record<string, unknown>[] | null) ?? null
  let weftsMapped: Record<string, unknown>[] | null = (weftRows as Record<string, unknown>[] | null) ?? null
  if (!warpRows && !weftRows) {
    const [w2, f2] = await Promise.all([
      supabase
        .from('design_costing_warp')
        .select('sr_no, yarn_name, denier, tar_ends, length_mtr, rate_per_kg, rate_source, rate_master_id')
        .eq('costing_id', header.id)
        .order('sr_no'),
      supabase
        .from('design_costing_weft')
        .select('sr_no, weft_name, denier, pic, width, length_mtr, rate_per_kg, rate_source, rate_master_id')
        .eq('costing_id', header.id)
        .order('sr_no'),
    ])
    warpsMapped = (w2.data as Record<string, unknown>[] | null) ?? null
    weftsMapped = (f2.data as Record<string, unknown>[] | null) ?? null
  }

  const warps: WarpDraft[] =
    (warpsMapped ?? []).length > 0
      ? (warpsMapped ?? []).map((r, i) => mapWarpRow(r as Record<string, unknown>, i))
      : [emptyWarp(1)]

  const wefts: WeftDraft[] =
    (weftsMapped ?? []).length > 0
      ? (weftsMapped ?? []).map((r, i) => mapWeftRow(r as Record<string, unknown>, i))
      : [emptyWeft(1)]

  return {
    costingId: header.id as string,
    status: header.status === 'final' ? 'final' : 'draft',
    isLocked: Boolean(header.is_locked),
    costingDate: String(header.costing_date || todayISO()),
    designLength:
      header.design_length_mtr != null
        ? String(header.design_length_mtr)
        : String(FORMULA_DEFAULTS.default_base_length_mtr),
    loomPick,
    warps,
    wefts,
    picConversionRate: header.pic_conversion_rate != null ? String(header.pic_conversion_rate) : '0.45',
    muPercent: header.mu_percent != null ? String(header.mu_percent) : '0',
    gstPercent: header.gst_percent != null ? String(header.gst_percent) : '0',
    wastageMtr:
      header.wastage_mtr != null ? String(header.wastage_mtr) : String(FORMULA_DEFAULTS.default_wastage_mtr),
    wastagePercent:
      header.wastage_percent != null
        ? String(header.wastage_percent)
        : String(FORMULA_DEFAULTS.default_wastage_percent),
  }
}

export function intakeDraftHasYarn(draft: IntakeCostingDraft): boolean {
  return draft.warps.some((w) => w.yarn_name.trim()) || draft.wefts.some((w) => w.weft_name.trim())
}

function numericOrNull(v: string | number | null | undefined): number | null {
  if (v === '' || v == null) return null
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : null
}

/** Persist denier for generated columns: prefer costing (base+10) when base set. */
function persistDenier(row: { base_denier?: string; denier: string }): number | null {
  if (row.base_denier != null && String(row.base_denier).trim() !== '') {
    const base = Number(row.base_denier)
    if (Number.isFinite(base) && base > 0) return base + 10
  }
  return numericOrNull(row.denier)
}

export async function saveIntakeCostingDraft(input: {
  dinNumber: string
  qualityName: string
  diaryImageUrl: string | null
  draft: IntakeCostingDraft
  userId: string | null
}): Promise<string> {
  const dinNumber = input.dinNumber.trim()
  if (!dinNumber) throw new Error('DESIGN No. required for costing')

  const totals = computeBuildup(
    input.draft.warps,
    input.draft.wefts,
    Number(input.draft.designLength) || 0,
    Number(input.draft.picConversionRate) || 0,
    Number(input.draft.muPercent) || 0,
    Number(input.draft.gstPercent) || 0,
    Number(input.draft.wastageMtr) || 0,
    Number(input.draft.wastagePercent) || 0,
  )

  const header: Record<string, unknown> = {
    din_number: dinNumber,
    quality_name: input.qualityName.trim() || null,
    costing_date: input.draft.costingDate || todayISO(),
    diary_image_url: input.diaryImageUrl,
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
    status: 'draft' as const,
    is_locked: false,
    updated_by: input.userId,
    updated_at: new Date().toISOString(),
    created_by: input.userId,
  }
  if (input.draft.loomPick.trim()) {
    header.loom_pick = Number(input.draft.loomPick) || null
  }

  let costingId = input.draft.costingId
  let previousWarpIds: string[] = []
  let previousWeftIds: string[] = []

  if (costingId) {
    const { created_by: _omit, ...updatePayload } = header
    void _omit
    const { error: uErr } = await supabase.from('design_costing').update(updatePayload).eq('id', costingId)
    if (uErr) {
      // Retry without loom_pick if column not migrated yet
      if (/loom_pick/i.test(uErr.message)) {
        const { loom_pick: _lp, ...rest } = updatePayload
        void _lp
        const { error: u2 } = await supabase.from('design_costing').update(rest).eq('id', costingId)
        if (u2) throw u2
      } else {
        throw uErr
      }
    }
    const [{ data: oldWarps }, { data: oldWefts }] = await Promise.all([
      supabase.from('design_costing_warp').select('id').eq('costing_id', costingId),
      supabase.from('design_costing_weft').select('id').eq('costing_id', costingId),
    ])
    previousWarpIds = (oldWarps ?? []).map((r) => r.id as string)
    previousWeftIds = (oldWefts ?? []).map((r) => r.id as string)
  } else {
    const { data, error: iErr } = await supabase.from('design_costing').insert(header).select('id').single()
    if (iErr) {
      if (/loom_pick/i.test(iErr.message)) {
        const { loom_pick: _lp, ...rest } = header
        void _lp
        const { data: d2, error: i2 } = await supabase.from('design_costing').insert(rest).select('id').single()
        if (i2) throw i2
        costingId = d2.id as string
      } else {
        throw iErr
      }
    } else {
      costingId = data.id as string
    }
  }

  const warpPayload = input.draft.warps.map((row, i) => ({
    costing_id: costingId,
    sr_no: i + 1,
    yarn_name: row.yarn_name.trim() || null,
    base_denier: numericOrNull(row.base_denier),
    denier: persistDenier(row),
    tar_ends: numericOrNull(row.tar_ends),
    length_mtr: numericOrNull(row.length_mtr),
    rate_per_kg: numericOrNull(row.rate_per_kg),
    rate_source: row.rate_source || null,
    rate_master_id: row.rate_master_id || null,
  }))
  const weftPayload = input.draft.wefts.map((row, i) => ({
    costing_id: costingId,
    sr_no: i + 1,
    weft_name: row.weft_name.trim() || null,
    base_denier: numericOrNull(row.base_denier),
    denier: persistDenier(row),
    pic: numericOrNull(row.pic),
    width: numericOrNull(row.width) ?? DEFAULT_WIDTH,
    length_mtr: numericOrNull(row.length_mtr) ?? DEFAULT_LENGTH_MTR,
    rate_per_kg: numericOrNull(row.rate_per_kg),
    rate_source: row.rate_source || null,
    rate_master_id: row.rate_master_id || null,
    feeder_no: row.feeder_no,
    feeder_label: row.feeder_label || null,
    strings_ref: row.strings_ref || null,
  }))

  const insertWarp = async (payload: typeof warpPayload) => {
    const { error } = await supabase.from('design_costing_warp').insert(payload)
    if (error && /base_denier/i.test(error.message)) {
      const slim = payload.map(({ base_denier: _b, ...rest }) => {
        void _b
        return rest
      })
      const { error: e2 } = await supabase.from('design_costing_warp').insert(slim)
      if (e2) throw e2
      return
    }
    if (error) throw error
  }
  const insertWeft = async (payload: typeof weftPayload) => {
    const { error } = await supabase.from('design_costing_weft').insert(payload)
    if (error && /base_denier|feeder_|strings_ref/i.test(error.message)) {
      const slim = payload.map(
        ({ base_denier: _b, feeder_no: _f, feeder_label: _l, strings_ref: _s, ...rest }) => {
          void _b
          void _f
          void _l
          void _s
          return rest
        },
      )
      const { error: e2 } = await supabase.from('design_costing_weft').insert(slim)
      if (e2) throw e2
      return
    }
    if (error) throw error
  }

  await insertWarp(warpPayload)
  await insertWeft(weftPayload)

  if (previousWarpIds.length) {
    await supabase.from('design_costing_warp').delete().in('id', previousWarpIds)
  }
  if (previousWeftIds.length) {
    await supabase.from('design_costing_weft').delete().in('id', previousWeftIds)
  }

  return costingId
}
