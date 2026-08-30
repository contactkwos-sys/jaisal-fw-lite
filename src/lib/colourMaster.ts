/**
 * Colour Master — dropdown source for Weft Colour in DIN Costing.
 */

import { supabase } from './supabase'
import { assertDesignMasterWrite } from './permissions'

export type ColourMasterRow = {
  id: string
  colour_name: string
  is_active: boolean
  sort_order: number
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

function mapRow(r: Record<string, unknown>): ColourMasterRow {
  return {
    id: String(r.id),
    colour_name: String(r.colour_name || ''),
    is_active: r.is_active !== false,
    sort_order: Number(r.sort_order) || 0,
    created_by: r.created_by != null ? String(r.created_by) : null,
    updated_by: r.updated_by != null ? String(r.updated_by) : null,
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  }
}

export async function colourMasterTablesReady(): Promise<boolean> {
  const { error } = await supabase.from('colour_master').select('id').limit(1)
  if (!error) return true
  if (/does not exist|schema cache|relation/i.test(error.message)) return false
  return true
}

export async function fetchAllColours(opts?: { activeOnly?: boolean }): Promise<ColourMasterRow[]> {
  let q = supabase.from('colour_master').select('*').order('sort_order').order('colour_name')
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}

export async function saveColourMaster(
  colourName: string,
  userId: string | null,
  opts?: { id?: string; is_active?: boolean; sort_order?: number },
): Promise<ColourMasterRow> {
  await assertDesignMasterWrite()
  const name = colourName.trim()
  if (!name) throw new Error('Colour name is required')
  const payload = {
    colour_name: name,
    is_active: opts?.is_active !== false,
    sort_order: opts?.sort_order ?? 0,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }
  if (opts?.id) {
    const { data, error } = await supabase
      .from('colour_master')
      .update(payload)
      .eq('id', opts.id)
      .select('*')
      .single()
    if (error) throw error
    return mapRow(data as Record<string, unknown>)
  }
  const { data, error } = await supabase
    .from('colour_master')
    .insert({ ...payload, created_by: userId })
    .select('*')
    .single()
  if (error) throw error
  return mapRow(data as Record<string, unknown>)
}

export async function setColourActive(
  id: string,
  isActive: boolean,
  userId: string | null,
): Promise<void> {
  await assertDesignMasterWrite()
  const { error } = await supabase
    .from('colour_master')
    .update({
      is_active: isActive,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

/** Fallback colours when Colour Master table is not migrated yet. */
export const FALLBACK_COLOURS = [
  'White',
  'Black',
  'Gold',
  'Silver',
  'Red',
  'Blue',
  'Green',
  'Yellow',
  'Maroon',
  'Others',
] as const
