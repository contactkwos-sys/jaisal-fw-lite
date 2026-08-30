/**
 * Local draft persistence for DIN Costing.
 * Survives route changes (Quality Master / Rate Master) and page refresh.
 * Cleared only on explicit Reset / Finalize / Save As New / Discard.
 */

import type { DesignImportSource } from './designOcr'
import type { WarpDraft, WeftDraft } from './designWiseCosting'

export const DIN_COSTING_DRAFT_KEY = 'jaisal-din-costing-working-draft-v1'

/** Prefer keeping drafts until explicit clear — 10+ minutes inactivity floor. */
export const DIN_COSTING_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type DinCostingWorkingDraft = {
  version: 1
  updatedAt: number
  dinNumber: string
  costingDate: string
  qualityName: string
  qualityMasterId: string
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
  machineType: string
  machineSpeedRpm: string
  efficiencyPct: string
  doubleWidthFactor: string
  productionBasis: 'hour' | '12h' | '24h' | '28d'
  designImageUrl: string | null
  sampleImageUrl: string | null
  diaryUrl: string | null
  importSource: DesignImportSource | null
  savedId: string | null
  savedCreatedAt: string | null
  status: 'draft' | 'final'
  isLocked: boolean
}

export function saveDinCostingDraft(draft: DinCostingWorkingDraft): void {
  try {
    if (typeof localStorage === 'undefined') return
    const payload: DinCostingWorkingDraft = {
      ...draft,
      version: 1,
      updatedAt: Date.now(),
    }
    localStorage.setItem(DIN_COSTING_DRAFT_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadDinCostingDraft(): DinCostingWorkingDraft | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(DIN_COSTING_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DinCostingWorkingDraft
    if (!parsed || parsed.version !== 1) return null
    if (
      typeof parsed.updatedAt === 'number' &&
      Date.now() - parsed.updatedAt > DIN_COSTING_DRAFT_MAX_AGE_MS
    ) {
      clearDinCostingDraft()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearDinCostingDraft(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(DIN_COSTING_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

/** True when the draft has any user-entered content worth restoring. */
export function dinCostingDraftHasContent(d: DinCostingWorkingDraft | null | undefined): boolean {
  if (!d) return false
  if (d.savedId) return true
  if (d.dinNumber?.trim()) return true
  if (d.qualityName?.trim()) return true
  if (d.loomPick?.trim()) return true
  if (d.designImageUrl || d.sampleImageUrl || d.diaryUrl) return true
  if (d.warps?.some((w) => w.yarn_name?.trim() || w.base_denier?.trim() || w.rate_per_kg?.trim())) {
    return true
  }
  if (
    d.wefts?.some(
      (w) => w.weft_name?.trim() || w.pic?.trim() || w.colour?.trim() || w.rate_per_kg?.trim(),
    )
  ) {
    return true
  }
  if (d.ceoFinalSellingRate?.trim() || d.fixedCostPerMtr?.trim() || d.desiredProfitPerMtr?.trim()) {
    return true
  }
  return false
}
