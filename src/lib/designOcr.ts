/**
 * DIN Design Import helpers — image upload + Rate Master checks only.
 * DIN sheet photos are reference attachments. No OCR / auto-read.
 */

import {
  formatCostingDenier,
  type WarpDraft,
  type WeftDraft,
} from './designWiseCosting'
import { findSharedDesign } from './designIdentity'
import { lookupRateForCosting, type RateMasterRow } from './rateMaster'
import { uploadDinStorageObject } from './dinStorage'
import { supabase } from './supabase'

export type DesignImportSource = 'gmail' | 'photo' | 'file' | 'direct' | 'diary'

export type MissingRateItem = {
  category: 'warp' | 'weft'
  itemName: string
  rowIndex: number
}

/** Payload when a DIN sheet image is attached (reference only). */
export type DinImageAttachPayload = {
  designImageUrl: string
  importSource: DesignImportSource
}

function n(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

function isBlankYarnName(name: string | null | undefined): boolean {
  const t = (name || '').trim()
  return !t || t === '-'
}

export function detectMissingRates(
  warps: WarpDraft[],
  wefts: WeftDraft[],
  rates: RateMasterRow[],
  costingDate: string,
): MissingRateItem[] {
  const missing: MissingRateItem[] = []
  warps.forEach((row, idx) => {
    const name = row.yarn_name.trim()
    if (isBlankYarnName(name)) return
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return
    const costingDenier = formatCostingDenier(row)
    const found = lookupRateForCosting(rates, 'warp', name, costingDate, {
      denier: costingDenier || row.base_denier || undefined,
    })
    if (!found && !n(row.rate_per_kg)) {
      missing.push({ category: 'warp', itemName: name, rowIndex: idx })
    }
  })
  wefts.forEach((row, idx) => {
    const name = row.weft_name.trim()
    if (isBlankYarnName(name)) return
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return
    const costingDenier = formatCostingDenier(row)
    const found = lookupRateForCosting(rates, 'weft', name, costingDate, {
      denier: costingDenier || row.base_denier || undefined,
    })
    if (!found && !n(row.rate_per_kg)) {
      missing.push({ category: 'weft', itemName: name, rowIndex: idx })
    }
  })
  return missing
}

export async function checkDuplicateDin(dinNumber: string): Promise<{
  exists: boolean
  costingId?: string
  status?: string
  isLocked?: boolean
  source?: 'design_costing' | 'dins' | 'designs'
}> {
  const trimmed = dinNumber.trim()
  if (!trimmed) return { exists: false }

  const { data } = await supabase
    .from('design_costing')
    .select('id, status, is_locked')
    .eq('din_number', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (data) {
    return {
      exists: true,
      costingId: data.id as string,
      status: data.status as string | undefined,
      isLocked: Boolean(data.is_locked),
      source: 'design_costing',
    }
  }

  const shared = await findSharedDesign(trimmed)
  if (shared) {
    return {
      exists: true,
      costingId: shared.costingId || undefined,
      status: shared.costingStatus || undefined,
      isLocked: shared.isLocked,
      source: shared.din ? 'dins' : shared.designsId ? 'designs' : 'design_costing',
    }
  }
  return { exists: false }
}

export async function uploadDesignReferenceImage(
  file: File,
  source: DesignImportSource,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const folder = source === 'gmail' ? 'gmail' : source
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  if (source === 'diary') {
    const { error } = await supabase.storage.from('costing-diary-images').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    })
    if (error) throw error
    const { data: pub } = supabase.storage.from('costing-diary-images').getPublicUrl(path)
    return pub.publicUrl
  }

  return uploadDinStorageObject(path, file)
}

/** Upload physical fabric sample photo — separate from DIN sheet reference image. */
export async function uploadSampleImage(file: File, dinNumber?: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const din = (dinNumber || 'sample').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'sample'
  const path = `sample-images/${din}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  return uploadDinStorageObject(path, file)
}
