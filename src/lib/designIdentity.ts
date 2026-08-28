/**
 * Shared Design / DIN identity — one master record for Design Intake + DIN Costing.
 * Primary key is the business Design Number (e.g. JFG2249), not a parallel auto-id.
 */

import { createDin, fetchDinByNumber, updateDin, type DinWithMatchings } from './designToOrder'
import { supabase } from './supabase'

/** Trim only — preserve exact design number characters (no silent rewrite). */
export function normalizeDesignNumber(value: string): string {
  return value.trim()
}

/** Compact form for equality checks (spaces / case). Does not rewrite the stored value. */
export function designNumberKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function isBusinessDesignNumber(value: string): boolean {
  const v = designNumberKey(value)
  return /^[A-Z]{2,5}\d{3,6}$/.test(v)
}

export type SharedDesignHit = {
  designNumber: string
  din: DinWithMatchings | null
  costingId: string | null
  costingStatus: string | null
  isLocked: boolean
  designsId: string | null
}

/**
 * Find the shared design across dins / design_costing / designs.
 * Matches din_number and design_name (case-insensitive, trimmed).
 */
export async function findSharedDesign(designNumber: string): Promise<SharedDesignHit | null> {
  const trimmed = normalizeDesignNumber(designNumber)
  if (!trimmed) return null
  const key = designNumberKey(trimmed)

  const [byDinNumber, byDesignName, costingExact, designsExact] = await Promise.all([
    fetchDinByNumber(trimmed).catch(() => null),
    supabase
      .from('dins')
      .select('*, din_matchings(*)')
      .ilike('design_name', trimmed)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('design_costing')
      .select('id, din_number, status, is_locked')
      .eq('din_number', trimmed)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('designs').select('id, dno').eq('dno', trimmed).limit(1).maybeSingle(),
  ])

  let din = byDinNumber
  if (!din && byDesignName.data?.length) {
    const match = (byDesignName.data as DinWithMatchings[]).find(
      (row) => designNumberKey(row.design_name || '') === key || designNumberKey(row.din_number) === key,
    )
    din = match || (byDesignName.data[0] as DinWithMatchings)
  }

  // Also try din_number case-insensitive when exact miss
  if (!din) {
    const { data } = await supabase
      .from('dins')
      .select('*, din_matchings(*)')
      .ilike('din_number', trimmed)
      .limit(5)
    const match = (data as DinWithMatchings[] | null)?.find((row) => designNumberKey(row.din_number) === key)
    if (match) din = match
  }

  let costingId = (costingExact.data?.id as string | undefined) || null
  let costingStatus = (costingExact.data?.status as string | undefined) || null
  let isLocked = Boolean(costingExact.data?.is_locked)

  if (!costingId && din) {
    const { data: viaDin } = await supabase
      .from('design_costing')
      .select('id, status, is_locked')
      .eq('din_number', din.din_number)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (viaDin) {
      costingId = viaDin.id as string
      costingStatus = viaDin.status as string
      isLocked = Boolean(viaDin.is_locked)
    } else if (din.costing_id) {
      costingId = din.costing_id
      costingStatus = din.costing_status
    }
  }

  const designsId = (designsExact.data?.id as string | undefined) || null

  if (!din && !costingId && !designsId) return null

  return {
    designNumber: din?.din_number || costingExact.data?.din_number || trimmed,
    din,
    costingId,
    costingStatus,
    isLocked,
    designsId,
  }
}

/**
 * Ensure a `dins` master row exists for this Design Number after DIN Costing save.
 * Does not create a second row when one already exists (by number or design_name).
 */
export async function ensureDinMasterForCosting(input: {
  designNumber: string
  qualityName?: string | null
  imageUrl?: string | null
  source?: string
  userId?: string | null
}): Promise<DinWithMatchings | null> {
  const trimmed = normalizeDesignNumber(input.designNumber)
  if (!trimmed) return null

  const existing = await findSharedDesign(trimmed)
  if (existing?.din) {
    const patch: Parameters<typeof updateDin>[1] = {}
    if (input.qualityName && !existing.din.design_name) patch.design_name = input.qualityName
    if (input.imageUrl && !existing.din.din_image_url) patch.din_image_url = input.imageUrl
    if (Object.keys(patch).length) {
      try {
        await updateDin(existing.din.id, patch)
      } catch {
        /* optional enrichment */
      }
    }
    return existing.din
  }

  try {
    return await createDin({
      din_number: trimmed,
      design_name: input.qualityName || trimmed,
      din_image_url: input.imageUrl || null,
      source: input.source || 'din_costing',
      created_by: input.userId || null,
    })
  } catch (e) {
    // Race: another client created the same number — re-fetch
    const again = await findSharedDesign(trimmed)
    if (again?.din) return again.din
    throw e
  }
}
