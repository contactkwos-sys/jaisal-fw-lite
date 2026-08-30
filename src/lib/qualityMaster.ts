/**
 * Quality Master — recipe templates that auto-fill Warp/Weft in DIN Costing.
 * Everything remains editable after apply.
 */

import { supabase } from './supabase'
import { assertDesignMasterWrite } from './permissions'
import { DEFAULT_LENGTH_MTR, DEFAULT_TAR_ENDS, DEFAULT_WIDTH, n } from './designWiseCosting'

export type QualityWarpRecipeRow = {
  yarn_name: string
  base_denier: string
  tar_ends?: string
}

export type QualityWeftRecipeRow = {
  feeder_no?: number
  colour?: string
  weft_name: string
  base_denier: string
  pic?: string
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
  const name = input.quality_name.trim()
  if (!name) throw new Error('Quality Name is required')

  const payload = {
    quality_name: name,
    is_active: input.is_active !== false,
    warp_base_denier: input.warp_base_denier ?? null,
    weft_base_denier: input.weft_base_denier ?? null,
    default_width: input.default_width ?? DEFAULT_WIDTH,
    default_length_mtr: input.default_length_mtr ?? DEFAULT_LENGTH_MTR,
    default_tar_ends: input.default_tar_ends ?? DEFAULT_TAR_ENDS,
    warp_recipe: input.warp_recipe ?? [],
    weft_recipe: input.weft_recipe ?? [],
    notes: input.notes ?? null,
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

export async function deleteQualityMaster(id: string): Promise<void> {
  await assertDesignMasterWrite()
  const { error } = await supabase.from('quality_master').delete().eq('id', id)
  if (error) throw error
}
