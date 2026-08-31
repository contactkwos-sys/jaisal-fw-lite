/**
 * Quality Master — recipe templates that auto-fill Warp/Weft in DIN Costing.
 * Everything remains editable after apply.
 *
 * Recipe rows are stored as jsonb arrays (existing architecture). Optional fields
 * (rate_master_id, costing_denier, sr, width, length) are additive and backward-compatible.
 */

import { supabase } from './supabase'
import { assertDesignMasterWrite } from './permissions'
import {
  costingDenierFromBase,
  DEFAULT_LENGTH_MTR,
  DEFAULT_TAR_ENDS,
  DEFAULT_WIDTH,
  n,
} from './designWiseCosting'
import {
  lookupRateForCosting,
  normalizeItemName,
  type RateMasterRow,
} from './rateMaster'
import { todayISO } from './mutate'

export type QualityWarpRecipeRow = {
  /** Serial / row no. (display) */
  sr?: number
  yarn_name: string
  base_denier: string
  /** Derived: base + 10 — stored for template clarity; recalculated on apply */
  costing_denier?: string
  tar_ends?: string
  width?: string
  length_mtr?: string
  /** Optional FK-style reference to Rate Master row (not duplicated rates) */
  rate_master_id?: string | null
}

export type QualityWeftRecipeRow = {
  sr?: number
  feeder_no?: number
  colour?: string
  weft_name: string
  base_denier: string
  costing_denier?: string
  pic?: string
  width?: string
  length_mtr?: string
  rate_master_id?: string | null
}

export type QualityMasterRow = {
  id: string
  quality_name: string
  is_active: boolean
  warp_base_denier: number | null
  weft_base_denier: number | null
  default_width: number
  default_length_mtr: number
  default_tar_ends: number
  warp_recipe: QualityWarpRecipeRow[]
  weft_recipe: QualityWeftRecipeRow[]
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export type QualityMasterInput = {
  quality_name: string
  is_active?: boolean
  warp_base_denier?: number | null
  weft_base_denier?: number | null
  default_width?: number
  default_length_mtr?: number
  default_tar_ends?: number
  warp_recipe?: QualityWarpRecipeRow[]
  weft_recipe?: QualityWeftRecipeRow[]
  notes?: string | null
}

function parseRecipeArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    } catch {
      return []
    }
  }
  return []
}

function mapRow(r: Record<string, unknown>): QualityMasterRow {
  return {
    id: String(r.id),
    quality_name: String(r.quality_name || ''),
    is_active: r.is_active !== false,
    warp_base_denier: r.warp_base_denier != null ? n(r.warp_base_denier as number) : null,
    weft_base_denier: r.weft_base_denier != null ? n(r.weft_base_denier as number) : null,
    default_width: n(r.default_width as string | number | null | undefined) || DEFAULT_WIDTH,
    default_length_mtr: n(r.default_length_mtr as string | number | null | undefined) || DEFAULT_LENGTH_MTR,
    default_tar_ends: n(r.default_tar_ends as string | number | null | undefined) || DEFAULT_TAR_ENDS,
    warp_recipe: parseRecipeArray<QualityWarpRecipeRow>(r.warp_recipe),
    weft_recipe: parseRecipeArray<QualityWeftRecipeRow>(r.weft_recipe),
    notes: r.notes != null ? String(r.notes) : null,
    created_by: r.created_by != null ? String(r.created_by) : null,
    updated_by: r.updated_by != null ? String(r.updated_by) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  }
}

export async function qualityMasterTablesReady(): Promise<boolean> {
  const { error } = await supabase.from('quality_master').select('id').limit(1)
  if (!error) return true
  if (/does not exist|schema cache|relation/i.test(error.message)) return false
  return true
}

export async function fetchAllQualities(opts?: { activeOnly?: boolean }): Promise<QualityMasterRow[]> {
  let q = supabase.from('quality_master').select('*').order('quality_name')
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export function findQualityByName(
  rows: QualityMasterRow[],
  name: string,
): QualityMasterRow | null {
  const norm = name.trim().toLowerCase()
  if (!norm) return null
  return rows.find((r) => r.quality_name.trim().toLowerCase() === norm) ?? null
}

export async function saveQualityMaster(
  input: QualityMasterInput,
  userId: string | null,
  existingId?: string | null,
): Promise<QualityMasterRow> {
  await assertDesignMasterWrite()
  const normalized = normalizeQualityRecipes(input)
  const name = normalized.quality_name.trim()
  if (!name) throw new Error('Quality Name is required')

  const payload = {
    quality_name: name,
    is_active: normalized.is_active !== false,
    warp_base_denier: normalized.warp_base_denier ?? null,
    weft_base_denier: normalized.weft_base_denier ?? null,
    default_width: normalized.default_width ?? DEFAULT_WIDTH,
    default_length_mtr: normalized.default_length_mtr ?? DEFAULT_LENGTH_MTR,
    default_tar_ends: normalized.default_tar_ends ?? DEFAULT_TAR_ENDS,
    warp_recipe: normalized.warp_recipe ?? [],
    weft_recipe: normalized.weft_recipe ?? [],
    notes: normalized.notes ?? null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }

  if (existingId) {
    const { data, error } = await supabase
      .from('quality_master')
      .update(payload)
      .eq('id', existingId)
      .select('*')
      .single()
    if (error) throw error
    return mapRow(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('quality_master')
    .insert({ ...payload, created_by: userId })
    .select('*')
    .single()
  if (error) throw error
  return mapRow(data as Record<string, unknown>)
}

export async function setQualityActive(
  id: string,
  isActive: boolean,
  userId: string | null,
): Promise<void> {
  await assertDesignMasterWrite()
  const { error } = await supabase
    .from('quality_master')
    .update({
      is_active: isActive,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export type DeleteQualityResult =
  | { mode: 'deleted' }
  | { mode: 'inactivated'; message: string }

export async function deleteQualityMaster(id: string): Promise<DeleteQualityResult> {
  await assertDesignMasterWrite()

  // Prefer soft-deactivate when already referenced by DIN Costing
  const { count, error: cErr } = await supabase
    .from('design_costing')
    .select('id', { count: 'exact', head: true })
    .eq('quality_master_id', id)
  if (!cErr && (count || 0) > 0) {
    const { error } = await supabase
      .from('quality_master')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return {
      mode: 'inactivated',
      message:
        'Cannot delete: this quality is already used in existing DIN Costing. It was set Inactive instead.',
    }
  }

  // Also block when quality_name matches existing costings (legacy rows without FK)
  const { data: qm } = await supabase.from('quality_master').select('quality_name').eq('id', id).maybeSingle()
  if (qm?.quality_name) {
    const { count: byName } = await supabase
      .from('design_costing')
      .select('id', { count: 'exact', head: true })
      .ilike('quality_name', qm.quality_name)
    if ((byName || 0) > 0) {
      const { error } = await supabase
        .from('quality_master')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return {
        mode: 'inactivated',
        message:
          'Cannot delete: this quality is already used in existing DIN Costing. It was set Inactive instead.',
      }
    }
  }

  const { error } = await supabase.from('quality_master').delete().eq('id', id)
  if (error) throw error
  return { mode: 'deleted' }
}

/** Resolve base denier + costing denier (+ rate_master_id) from Rate Master for a yarn pick. */
export function fillRecipeDenierFromRateMaster(
  category: 'warp' | 'weft',
  yarnName: string,
  rates: RateMasterRow[],
  asOfDate = todayISO(),
): { base_denier: string; costing_denier: string; rate_master_id: string | null } {
  const name = yarnName.trim()
  if (!name) return { base_denier: '', costing_denier: '', rate_master_id: null }

  const found = lookupRateForCosting(rates, category, name, asOfDate)
  let base = ''
  if (found?.row.denier != null && String(found.row.denier).trim() !== '') {
    const raw = String(found.row.denier).trim()
    if (/^same$/i.test(raw)) {
      const m = name.match(/^(\d+(?:\.\d+)?)/)
      base = m ? m[1] : ''
    } else {
      const num = n(raw)
      // Recover base when RM accidentally stored costing (e.g. 310 for 300 Tex)
      const fromName = name.match(/^(\d+(?:\.\d+)?)/)
      const nameBase = fromName ? n(fromName[1]) : 0
      if (nameBase > 0 && num === nameBase + 10) base = String(nameBase)
      else if (num > 0) base = String(num)
    }
  }
  if (!base) {
    const m = name.match(/^(\d+(?:\.\d+)?)/)
    if (m) base = m[1]
  }
  const costing = base ? String(costingDenierFromBase(base) || '') : ''
  return {
    base_denier: base,
    costing_denier: costing,
    rate_master_id: found?.row.id || null,
  }
}

/** Ensure costing_denier = base + 10 on recipe rows before save. */
export function normalizeQualityRecipes(input: QualityMasterInput): QualityMasterInput {
  const warp_recipe = (input.warp_recipe || []).map((r, i) => {
    const base = String(r.base_denier || '').trim()
    const costing = base ? String(costingDenierFromBase(base) || '') : String(r.costing_denier || '')
    return {
      ...r,
      sr: r.sr ?? i + 1,
      yarn_name: r.yarn_name.trim(),
      base_denier: base,
      costing_denier: costing,
      rate_master_id: r.rate_master_id || null,
    }
  })
  const weft_recipe = (input.weft_recipe || []).map((r, i) => {
    const base = String(r.base_denier || '').trim()
    const costing = base ? String(costingDenierFromBase(base) || '') : String(r.costing_denier || '')
    return {
      ...r,
      sr: r.sr ?? i + 1,
      weft_name: r.weft_name.trim(),
      colour: r.colour?.trim() || '',
      base_denier: base,
      costing_denier: costing,
      rate_master_id: r.rate_master_id || null,
    }
  })
  return { ...input, warp_recipe, weft_recipe }
}

export function qualityNameExists(rows: QualityMasterRow[], name: string, excludeId?: string | null): boolean {
  const norm = normalizeItemName(name)
  if (!norm) return false
  return rows.some(
    (r) => normalizeItemName(r.quality_name) === norm && (!excludeId || r.id !== excludeId),
  )
}
