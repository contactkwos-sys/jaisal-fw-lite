/**
 * DESIGN Intake ↔ Design-wise Costing bridge.
 * After photo upload, intake can draft warp/weft lines with Rate Master rates.
 */

import {
  computeBuildup,
  emptyWarp,
  emptyWeft,
  type WarpDraft,
  type WeftDraft,
} from './designWiseCosting'
import { FORMULA_DEFAULTS, fetchFormulaMaster } from './formulaMaster'
import {
  WARP_CATALOGUE,
  WEFT_CATALOGUE,
  fetchAllRates,
  lookupRateForCosting,
  resolveNumericDenier,
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
    designLength: String(FORMULA_DEFAULTS.default_base_length_mtr),
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

export function applyWarpItemFromMaster(
  row: WarpDraft,
  itemName: string,
  rates: RateMasterRow[],
  asOfDate: string,
): WarpDraft {
  const name = itemName.trim()
  const next: WarpDraft = { ...row, yarn_name: name }
  if (!name || !asOfDate) return next
  const cat = WARP_CATALOGUE.find((c) => c.item_name === name)
  if (cat?.denier && !next.denier) next.denier = cat.denier
  const found = lookupRateForCosting(rates, 'warp', name, asOfDate, { denier: next.denier })
  if (!found) return next
  return {
    ...next,
    denier: next.denier || found.row.denier || '',
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
  const next: WeftDraft = { ...row, weft_name: name }
  if (!name || !asOfDate) return next
  const cat = WEFT_CATALOGUE.find((c) => c.item_name === name)
  if (cat?.denier && !next.denier) {
    next.denier = cat.denier === 'Same' ? resolveNumericDenier('Same', name) || 'Same' : cat.denier
  }
  const found = lookupRateForCosting(rates, 'weft', name, asOfDate, { denier: next.denier })
  if (!found) {
    // Still resolve Same → numeric for weight calc even when rate missing
    if (next.denier.toLowerCase() === 'same') {
      next.denier = resolveNumericDenier('Same', name)
    }
    return next
  }
  const denier =
    resolveNumericDenier(next.denier || found.row.denier || '', name) || next.denier || found.row.denier || ''
  return {
    ...next,
    denier,
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

export async function loadExistingCostingForDin(dinNumber: string): Promise<IntakeCostingDraft | null> {
  const trimmed = dinNumber.trim()
  if (!trimmed) return null
  const { data: header, error } = await supabase
    .from('design_costing')
    .select(
      'id, costing_date, design_length_mtr, wastage_mtr, wastage_percent, pic_conversion_rate, mu_percent, gst_percent, status, is_locked',
    )
    .eq('din_number', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !header) return null

  const [{ data: warpRows }, { data: weftRows }] = await Promise.all([
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

  const warps: WarpDraft[] =
    (warpRows ?? []).length > 0
      ? (warpRows ?? []).map((r, i) => ({
          key: crypto.randomUUID(),
          sr_no: Number(r.sr_no) || i + 1,
          yarn_name: String(r.yarn_name || ''),
          denier: r.denier != null ? String(r.denier) : '',
          tar_ends: r.tar_ends != null ? String(r.tar_ends) : '',
          length_mtr: r.length_mtr != null ? String(r.length_mtr) : '',
          rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
          rate_source: (r.rate_source as WarpDraft['rate_source']) || undefined,
          rate_master_id: r.rate_master_id || undefined,
        }))
      : [emptyWarp(1)]

  const wefts: WeftDraft[] =
    (weftRows ?? []).length > 0
      ? (weftRows ?? []).map((r, i) => ({
          key: crypto.randomUUID(),
          sr_no: Number(r.sr_no) || i + 1,
          weft_name: String(r.weft_name || ''),
          denier: r.denier != null ? String(r.denier) : '',
          pic: r.pic != null ? String(r.pic) : '',
          width: r.width != null ? String(r.width) : '',
          length_mtr: r.length_mtr != null ? String(r.length_mtr) : '',
          rate_per_kg: r.rate_per_kg != null ? String(r.rate_per_kg) : '',
          rate_source: (r.rate_source as WeftDraft['rate_source']) || undefined,
          rate_master_id: r.rate_master_id || undefined,
        }))
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

  const header = {
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

  let costingId = input.draft.costingId
  let previousWarpIds: string[] = []
  let previousWeftIds: string[] = []

  if (costingId) {
    const { created_by: _omit, ...updatePayload } = header
    void _omit
    const { error: uErr } = await supabase.from('design_costing').update(updatePayload).eq('id', costingId)
    if (uErr) throw uErr
    const [{ data: oldWarps }, { data: oldWefts }] = await Promise.all([
      supabase.from('design_costing_warp').select('id').eq('costing_id', costingId),
      supabase.from('design_costing_weft').select('id').eq('costing_id', costingId),
    ])
    previousWarpIds = (oldWarps ?? []).map((r) => r.id as string)
    previousWeftIds = (oldWefts ?? []).map((r) => r.id as string)
  } else {
    const { data, error: iErr } = await supabase.from('design_costing').insert(header).select('id').single()
    if (iErr) throw iErr
    costingId = data.id as string
  }

  const warpPayload = input.draft.warps.map((row, i) => ({
    costing_id: costingId,
    sr_no: i + 1,
    yarn_name: row.yarn_name.trim() || null,
    denier: Number(resolveNumericDenier(row.denier, row.yarn_name)) || null,
    tar_ends: Number(row.tar_ends) || null,
    length_mtr: Number(row.length_mtr) || null,
    rate_per_kg: Number(row.rate_per_kg) || null,
    rate_source: row.rate_source || null,
    rate_master_id: row.rate_master_id || null,
  }))
  const weftPayload = input.draft.wefts.map((row, i) => ({
    costing_id: costingId,
    sr_no: i + 1,
    weft_name: row.weft_name.trim() || null,
    denier: Number(resolveNumericDenier(row.denier, row.weft_name)) || null,
    pic: Number(row.pic) || null,
    width: Number(row.width) || null,
    length_mtr: Number(row.length_mtr) || null,
    rate_per_kg: Number(row.rate_per_kg) || null,
    rate_source: row.rate_source || null,
    rate_master_id: row.rate_master_id || null,
  }))

  const { error: wErr } = await supabase.from('design_costing_warp').insert(warpPayload)
  if (wErr) throw wErr
  const { error: fErr } = await supabase.from('design_costing_weft').insert(weftPayload)
  if (fErr) throw fErr

  if (previousWarpIds.length) {
    await supabase.from('design_costing_warp').delete().in('id', previousWarpIds)
  }
  if (previousWeftIds.length) {
    await supabase.from('design_costing_weft').delete().in('id', previousWeftIds)
  }

  return costingId
}
