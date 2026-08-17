/** Design Master costing math — factory register formula */

/** Wastage fraction of Total Yarn Cost. Edit here if factory % changes. */
export const WASTAGE_PCT = 0.05

const DENOM = 9_000_000

export function num(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Warp weight (kg) = (Denier × TAR × Length) / 9_000_000 */
export function warpWeight(denier: number, tar: number, length: number): number {
  return (denier * tar * length) / DENOM
}

/** Weft weight (kg) = (Denier × Pic × Width × Length) / 9_000_000 */
export function weftWeight(
  denier: number,
  pic: number,
  width: number,
  length: number,
): number {
  return (denier * pic * width * length) / DENOM
}

export function rowAmount(weight: number, rate: number): number {
  return weight * rate
}

export type CostingSummary = {
  totalWeight: number
  totalYarnCost: number
  totalConversion: number
  wastage: number
  finalCostPerMeter: number
}

export function summarizeCosting(args: {
  warpWeight: number
  warpAmount: number
  warpConversion: number
  weftWeights: number[]
  weftAmounts: number[]
  weftConversions: number[]
  wastagePct?: number
}): CostingSummary {
  const wastagePct = args.wastagePct ?? WASTAGE_PCT
  const totalWeight =
    args.warpWeight + args.weftWeights.reduce((s, w) => s + w, 0)
  const totalYarnCost =
    args.warpAmount + args.weftAmounts.reduce((s, a) => s + a, 0)
  const totalConversion =
    args.warpConversion + args.weftConversions.reduce((s, c) => s + c, 0)
  const wastage = totalYarnCost * wastagePct
  const finalCostPerMeter = totalYarnCost + wastage + totalConversion
  return { totalWeight, totalYarnCost, totalConversion, wastage, finalCostPerMeter }
}

/** Format kg / ₹ for display (trim trailing zeros lightly). */
export function fmtQty(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '0'
  return n.toFixed(digits)
}
