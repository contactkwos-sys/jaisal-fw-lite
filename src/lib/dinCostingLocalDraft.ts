/**
 * DIN Costing unsaved local draft — localStorage only.
 * Never written to design_costing / Saved Design Costings list.
 */
import type { WarpDraft, WeftDraft } from './designWiseCosting'
import type { DesignImportSource } from './designOcr'

export const DIN_LOCAL_DRAFT_KEY_PREFIX = 'jaisal-din-costing-local-draft'

export type DinLocalDraft = {
  v: 1
  savedAt: string
  dinNumber: string
  qualityName: string
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
  ceoFinalSellingRate: string
  fixedCostPerMtr: string
  desiredProfitPerMtr: string
  productionMeters: string
  designImageUrl: string | null
  sampleImageUrl?: string | null
  diaryUrl: string | null
  importSource: DesignImportSource | null
}

function storageKey(userId: string | null | undefined): string {
  return `${DIN_LOCAL_DRAFT_KEY_PREFIX}:${userId || 'anon'}`
}

export function hasMeaningfulDinDraft(draft: Partial<DinLocalDraft> | null | undefined): boolean {
  if (!draft) return false
  if (String(draft.dinNumber || '').trim()) return true
  if (String(draft.qualityName || '').trim()) return true
  if (String(draft.loomPick || '').trim()) return true
  const warps = draft.warps || []
  const wefts = draft.wefts || []
  if (
    warps.some(
      (r) =>
        String(r.yarn_name || '').trim() ||
        String(r.base_denier || r.denier || '').trim() ||
        String(r.tar_ends || '').trim() ||
        String(r.rate_per_kg || '').trim(),
    )
  ) {
    return true
  }
  if (
    wefts.some(
      (r) =>
        String(r.weft_name || '').trim() ||
        String(r.feeder_label || '').trim() ||
        String(r.base_denier || r.denier || '').trim() ||
        String(r.pic || '').trim() ||
        String(r.rate_per_kg || '').trim(),
    )
  ) {
    return true
  }
  return false
}

export function loadDinLocalDraft(userId: string | null | undefined): DinLocalDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DinLocalDraft
    if (!parsed || parsed.v !== 1) return null
    if (!hasMeaningfulDinDraft(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDinLocalDraft(
  userId: string | null | undefined,
  draft: Omit<DinLocalDraft, 'v' | 'savedAt'>,
): void {
  if (!hasMeaningfulDinDraft(draft)) {
    clearDinLocalDraft(userId)
    return
  }
  try {
    const payload: DinLocalDraft = {
      ...draft,
      v: 1,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(storageKey(userId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearDinLocalDraft(userId: string | null | undefined): void {
  try {
    localStorage.removeItem(storageKey(userId))
  } catch {
    /* ignore */
  }
}
