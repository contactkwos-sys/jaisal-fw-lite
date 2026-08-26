/**
 * Rate Master — date-wise warp/weft yarn rates linked to Design-wise Costing.
 *
 * Calculation:
 *   GST Amount = Basic Rate × GST%
 *   Effective Rate = Basic Rate + GST Amount + Freight
 *
 * Rounding: each monetary field rounded to 2 dp (half-up).
 */

import { supabase } from './supabase'
import { round2 } from './designWiseCosting'
import { assertDesignMasterWrite } from './permissions'

export type RateCategory = 'warp' | 'weft'

export type RateMasterConfig = {
  id: string
  default_gst_percent: number
  default_freight_per_kg: number
  updated_by: string | null
  updated_at: string | null
}

export type RateMasterRow = {
  id: string
  category: RateCategory
  item_name: string
  denier: string | null
  supplier_name: string | null
  basic_rate: number
  gst_percent: number
  gst_amount: number
  freight_per_kg: number
  effective_rate: number
  effective_from: string
  is_active: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export type RateCalc = {
  basicRate: number
  gstPercent: number
  gstAmount: number
  freightPerKg: number
  effectiveRate: number
}

export type RateLookupResult = {
  row: RateMasterRow
  calc: RateCalc
}

export const WARP_CATALOGUE = [
  { item_name: '80 Roto Black', denier: '80' },
  { item_name: '150 Roto Black & White', denier: '150' },
  { item_name: '150 Bright Yarn', denier: '150' },
  { item_name: 'Others (Warp)', denier: '' },
] as const

export const WEFT_CATALOGUE = [
  { item_name: '440 HSY', denier: 'Same' },
  { item_name: '550 HSY', denier: 'Same' },
  { item_name: '660 HSY', denier: 'Same' },
  { item_name: '300 Tex', denier: '310', supplier_name: 'Santosh Zari' },
  { item_name: '300 NSY', denier: '' },
  { item_name: 'Others (Weft)', denier: '' },
] as const

export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeDenier(denier: string | number | null | undefined): string {
  if (denier == null || denier === '') return ''
  const s = String(denier).trim().toLowerCase()
  if (s === 'same') return 'same'
  const n = Number(s)
  return Number.isFinite(n) ? String(n) : s
}

/** GST Amount = Basic × GST%; Effective = Basic + GST + Freight */
export function calcEffectiveRate(
  basicRate: number,
  gstPercent: number,
  freightPerKg: number,
): RateCalc {
  const basic = round2(basicRate)
  const gst = round2(basic * (gstPercent / 100))
  const freight = round2(freightPerKg)
  const effective = round2(basic + gst + freight)
  return {
    basicRate: basic,
    gstPercent: round2(gstPercent),
    gstAmount: gst,
    freightPerKg: freight,
    effectiveRate: effective,
  }
}

export function gstLabel(gstPercent: number): string {
  return `GST ${round2(gstPercent)}%`
}

/** Pick latest rate where effective_from <= asOfDate */
export function pickLatestRate(
  rates: RateMasterRow[],
  category: RateCategory,
  itemName: string,
  asOfDate: string,
  opts?: { denier?: string; supplier?: string },
): RateMasterRow | null {
  const itemNorm = normalizeItemName(itemName)
  const denierNorm = normalizeDenier(opts?.denier)
  const supplierNorm = (opts?.supplier || '').trim().toLowerCase()

  let candidates = rates.filter(
    (r) =>
      r.category === category &&
      r.is_active &&
      r.effective_from <= asOfDate &&
      normalizeItemName(r.item_name) === itemNorm,
  )

  if (denierNorm) {
    const byDenier = candidates.filter((r) => {
      const rd = normalizeDenier(r.denier)
      return !rd || rd === 'same' || rd === denierNorm || denierNorm === 'same'
    })
    if (byDenier.length) candidates = byDenier
  }

  if (supplierNorm) {
    const bySupplier = candidates.filter(
      (r) => (r.supplier_name || '').trim().toLowerCase() === supplierNorm,
    )
    if (bySupplier.length) candidates = bySupplier
  }

  return (
    candidates.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
  )
}

/** Fuzzy match: exact name, partial, then Others fallback */
export function lookupRate(
  rates: RateMasterRow[],
  category: RateCategory,
  yarnName: string,
  asOfDate: string,
  opts?: { denier?: string; supplier?: string },
): RateLookupResult | null {
  const trimmed = yarnName.trim()
  if (!trimmed) return null

  const exact = pickLatestRate(rates, category, trimmed, asOfDate, opts)
  if (exact) return { row: exact, calc: calcEffectiveRate(exact.basic_rate, exact.gst_percent, exact.freight_per_kg) }

  const yarnNorm = normalizeItemName(trimmed)
  const partial = rates
    .filter(
      (r) =>
        r.category === category &&
        r.is_active &&
        r.effective_from <= asOfDate &&
        (normalizeItemName(r.item_name).includes(yarnNorm) ||
          yarnNorm.includes(normalizeItemName(r.item_name))),
    )
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]

  if (partial) {
    return { row: partial, calc: calcEffectiveRate(partial.basic_rate, partial.gst_percent, partial.freight_per_kg) }
  }

  const othersName = category === 'warp' ? 'Others (Warp)' : 'Others (Weft)'
  const fallback = pickLatestRate(rates, category, othersName, asOfDate)
  if (fallback) {
    return { row: fallback, calc: calcEffectiveRate(fallback.basic_rate, fallback.gst_percent, fallback.freight_per_kg) }
  }

  return null
}

/** Latest display rate per catalogue item as of a date */
export function latestRateForItem(
  rates: RateMasterRow[],
  category: RateCategory,
  itemName: string,
  asOfDate: string,
): RateMasterRow | null {
  return pickLatestRate(rates, category, itemName, asOfDate)
}

export function historyForItem(
  rates: RateMasterRow[],
  category: RateCategory,
  itemName: string,
): RateMasterRow[] {
  const norm = normalizeItemName(itemName)
  return rates
    .filter((r) => r.category === category && normalizeItemName(r.item_name) === norm && r.is_active)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
}

export async function fetchRateMasterConfig(): Promise<RateMasterConfig> {
  const { data, error } = await supabase.from('rate_master_config').select('*').eq('id', 'default').maybeSingle()
  if (error) throw error
  return (
    (data as RateMasterConfig) ?? {
      id: 'default',
      default_gst_percent: 5,
      default_freight_per_kg: 2.25,
      updated_by: null,
      updated_at: null,
    }
  )
}

export async function updateRateMasterConfig(
  patch: Partial<Pick<RateMasterConfig, 'default_gst_percent' | 'default_freight_per_kg'>>,
  userId: string | null,
): Promise<void> {
  await assertDesignMasterWrite()
  const { error } = await supabase
    .from('rate_master_config')
    .update({
      ...patch,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'default')
  if (error) throw error
}

export async function fetchAllRates(): Promise<RateMasterRow[]> {
  const { data, error } = await supabase
    .from('rate_master')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('item_name')
    .order('effective_from', { ascending: false })
  if (error) {
    if (error.code === 'PGRST205' || error.message?.includes('rate_master')) {
      throw new Error('Rate Master tables not found. Run public/migration-rate-master.sql in Supabase SQL editor.')
    }
    throw error
  }
  return (data as RateMasterRow[]) ?? []
}

export async function rateMasterTablesReady(): Promise<boolean> {
  const { error } = await supabase.from('rate_master').select('id').limit(1)
  return !error
}

function friendlyDbError(error: { message?: string; code?: string; details?: string }): string {
  if (error.code === 'PGRST205') {
    return 'Rate Master tables not found. Run public/migration-rate-master.sql in Supabase SQL editor.'
  }
  if (error.code === '23503') {
    return 'Save failed: user session invalid. Please sign out and sign in again.'
  }
  return error.message || error.details || 'Database error'
}

export type RateMasterInput = {
  category: RateCategory
  item_name: string
  denier?: string | null
  supplier_name?: string | null
  basic_rate: number
  gst_percent: number
  freight_per_kg: number
  effective_from: string
}

export async function saveRateMasterEntry(
  input: RateMasterInput,
  userId: string | null,
  existingId?: string,
): Promise<RateMasterRow> {
  await assertDesignMasterWrite()
  const calc = calcEffectiveRate(input.basic_rate, input.gst_percent, input.freight_per_kg)
  const payload = {
    category: input.category,
    item_name: input.item_name.trim(),
    denier: input.denier?.trim() || null,
    supplier_name: input.supplier_name?.trim() || null,
    basic_rate: calc.basicRate,
    gst_percent: calc.gstPercent,
    gst_amount: calc.gstAmount,
    freight_per_kg: calc.freightPerKg,
    effective_rate: calc.effectiveRate,
    effective_from: input.effective_from,
    is_active: true,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }

  if (existingId) {
    const { data, error } = await supabase
      .from('rate_master')
      .update(payload)
      .eq('id', existingId)
      .select('*')
      .single()
    if (error) throw new Error(friendlyDbError(error))
    return data as RateMasterRow
  }

  const { data, error } = await supabase
    .from('rate_master')
    .insert({ ...payload, created_by: userId })
    .select('*')
    .single()
  if (error) throw new Error(friendlyDbError(error))
  return data as RateMasterRow
}

/** Soft-delete — preserves history */
export async function deactivateRate(id: string, userId: string | null): Promise<void> {
  await assertDesignMasterWrite()
  const { error } = await supabase
    .from('rate_master')
    .update({ is_active: false, updated_by: userId, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export function fmtInrRate(v: number): string {
  return `₹${v.toFixed(2)}`
}

export function formatDisplayDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
