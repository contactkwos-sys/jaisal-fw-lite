/** Design Wise Costing — factory diary formulas (÷ 9_000_000) */

export const CALC_FACTOR = 9_000_000

export function n(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Financial / weight rounding — avoids float noise in ₹ and kg displays.
 * Rule: round each monetary step to 2 dp (half-up via Math.round) so UI rows
 * (Weight × Rate = Amount) stay auditable; GST is applied once on after-MU only.
 */
export function round2(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round((v + Number.EPSILON) * 100) / 100
}

/** True when a positive GST % is applied to after-MU cost. */
export function isGstApplied(gstPercent: number | string | null | undefined): boolean {
  return n(gstPercent) > 0
}

/** Final cost card title — "Including GST" only when GST is actually added. */
export function finalCostLabel(gstPercent: number | string | null | undefined): string {
  return isGstApplied(gstPercent) ? 'Final Cost Including GST' : 'Final Cost — Excl. GST'
}

/** Banner title for per-meter final design cost. */
export function finalDesignCostMeterLabel(gstPercent: number | string | null | undefined): string {
  return isGstApplied(gstPercent)
    ? 'Final Design Cost / Meter (Inc. GST)'
    : 'Final Design Cost / Meter (Excl. GST)'
}

/** Hint under the final cost card in the GST split panel. */
export function finalCostHint(gstPercent: number | string | null | undefined): string {
  return isGstApplied(gstPercent) ? 'Base + GST' : 'After MU · no GST applied'
}

/** Auditable subtitle under the final design cost banner. */
export function finalCostAuditLine(
  afterMuPerMtr: number,
  gstAmount: number,
  gstPercent: number | string | null | undefined,
  designLengthMtr: number,
  totalPic: number,
): string {
  const chain = `length ${fmtQty(designLengthMtr, 0)} mtr · PIC ${fmtQty(totalPic, 0)}`
  if (isGstApplied(gstPercent)) {
    return `Auditable chain · ${chain} · base ${fmtInr(afterMuPerMtr)} + GST ${fmtInr(gstAmount)}`
  }
  return `Auditable chain · ${chain} · ${fmtInr(afterMuPerMtr)} (excl. GST)`
}

/** DTO / order screens: "/ Mtr (Inc. GST)" vs "/ Mtr (Excl. GST)". */
export function perMeterCostSuffix(gstPercent: number | string | null | undefined): string {
  return isGstApplied(gstPercent) ? '/ Mtr (Inc. GST)' : '/ Mtr (Excl. GST)'
}

/** Reports table header for final per-meter column. */
export function finalPerMeterColumnLabel(): string {
  return 'Final ₹/Mtr'
}

/** Warp weight (kg) = (denier × tar_ends × length_mtr) / 9_000_000 */
export function warpWeightKg(denier: number, tarEnds: number, lengthMtr: number): number {
  return (denier * tarEnds * lengthMtr) / CALC_FACTOR
}

/** Weft weight (kg) = (denier × pic × width × length_mtr) / 9_000_000 */
export function weftWeightKg(
  denier: number,
  pic: number,
  width: number,
  lengthMtr: number,
): number {
  return (denier * pic * width * lengthMtr) / CALC_FACTOR
}

export function rowAmount(weightKg: number, ratePerKg: number): number {
  return weightKg * ratePerKg
}

export type WarpDraft = {
  key: string
  sr_no: number
  yarn_name: string
  denier: string
  tar_ends: string
  length_mtr: string
  rate_per_kg: string
}

export type WeftDraft = {
  key: string
  sr_no: number
  weft_name: string
  denier: string
  pic: string
  width: string
  length_mtr: string
  rate_per_kg: string
}

export type CostingBuildup = {
  totalWarpWeightKg: number
  totalWeftWeightKg: number
  totalWeightKg: number
  totalWarpAmount: number
  totalWeftAmount: number
  totalYarnAmount: number
  designLengthMtr: number
  yarnCostPerMtr: number
  totalPic: number
  picConversionRate: number
  /** Total Weft PIC × PIC Conversion Rate */
  conversionCharge: number
  subtotalPerMtr: number
  muPercent: number
  muAmount: number
  afterMuPerMtr: number
  gstPercent: number
  gstAmount: number
  finalCostPerMtr: number
}

export function emptyWarp(sr = 1): WarpDraft {
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    yarn_name: '',
    denier: '',
    tar_ends: '',
    length_mtr: '',
    rate_per_kg: '',
  }
}

export function emptyWeft(sr = 1): WeftDraft {
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    weft_name: '',
    denier: '',
    pic: '',
    width: '',
    length_mtr: '',
    rate_per_kg: '',
  }
}

export function computeWarpRow(row: WarpDraft) {
  const denier = n(row.denier)
  const tar = n(row.tar_ends)
  const length = n(row.length_mtr)
  const rate = n(row.rate_per_kg)
  // Round weight first so displayed Weight × Rate equals Amount
  const weight = round2(warpWeightKg(denier, tar, length))
  const amount = round2(rowAmount(weight, rate))
  return {
    weight,
    amount,
    length,
    calcFactor: CALC_FACTOR,
  }
}

export function computeWeftRow(row: WeftDraft) {
  const denier = n(row.denier)
  const pic = n(row.pic)
  const width = n(row.width)
  const length = n(row.length_mtr)
  const rate = n(row.rate_per_kg)
  const weight = round2(weftWeightKg(denier, pic, width, length))
  const amount = round2(rowAmount(weight, rate))
  return {
    weight,
    amount,
    pic,
    calcFactor: CALC_FACTOR,
  }
}

/**
 * Full per-meter costing chain.
 * Weaving charge = Total Weft PIC × PIC Conversion Rate (not the rate alone).
 * Yarn Cost / Mtr = Total Yarn Amount ÷ Design Length.
 */
export function computeBuildup(
  warps: WarpDraft[],
  wefts: WeftDraft[],
  designLengthMtr: number,
  picConversionRate: number,
  muPercent: number,
  gstPercent: number,
): CostingBuildup {
  let totalWarpWeightKg = 0
  let totalWeftWeightKg = 0
  let totalWarpAmount = 0
  let totalWeftAmount = 0
  let totalPic = 0

  for (const w of warps) {
    const c = computeWarpRow(w)
    totalWarpWeightKg += c.weight
    totalWarpAmount += c.amount
  }
  for (const w of wefts) {
    const c = computeWeftRow(w)
    totalWeftWeightKg += c.weight
    totalWeftAmount += c.amount
    totalPic += c.pic
  }

  totalWarpWeightKg = round2(totalWarpWeightKg)
  totalWeftWeightKg = round2(totalWeftWeightKg)
  totalWarpAmount = round2(totalWarpAmount)
  totalWeftAmount = round2(totalWeftAmount)

  const totalWeightKg = round2(totalWarpWeightKg + totalWeftWeightKg)
  const totalYarnAmount = round2(totalWarpAmount + totalWeftAmount)
  const length = n(designLengthMtr)
  const yarnCostPerMtr = length > 0 ? round2(totalYarnAmount / length) : 0
  const rate = n(picConversionRate)
  const conversionCharge = round2(totalPic * rate)
  const subtotalPerMtr = round2(yarnCostPerMtr + conversionCharge)
  const mu = n(muPercent)
  const gst = n(gstPercent)
  const muAmount = round2(subtotalPerMtr * (mu / 100))
  const afterMuPerMtr = round2(subtotalPerMtr + muAmount)
  // GST applied exactly once: after MU × GST% (0% → no GST added to final)
  const gstAmount = gst > 0 ? round2(afterMuPerMtr * (gst / 100)) : 0
  const finalCostPerMtr = gst > 0 ? round2(afterMuPerMtr + gstAmount) : afterMuPerMtr

  return {
    totalWarpWeightKg,
    totalWeftWeightKg,
    totalWeightKg,
    totalWarpAmount,
    totalWeftAmount,
    totalYarnAmount,
    designLengthMtr: length,
    yarnCostPerMtr,
    totalPic,
    picConversionRate: rate,
    conversionCharge,
    subtotalPerMtr,
    muPercent: mu,
    muAmount,
    afterMuPerMtr,
    gstPercent: gst,
    gstAmount,
    finalCostPerMtr,
  }
}

export function fmtMoney(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(digits)
}

export function fmtQty(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(digits)
}

export function fmtInr(v: number): string {
  return `₹${fmtMoney(v)}`
}

/** Best-effort parse of OCR / diary text into field hints. */
export function parseDiaryNumbers(text: string): {
  denier?: string
  tar?: string
  pic?: string
  width?: string
  length?: string
  rate?: string
} {
  const out: Record<string, string> = {}
  const patterns: Array<[string, RegExp]> = [
    ['denier', /denier\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['tar', /(?:tar|ends)\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['pic', /pic\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['width', /width\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['length', /(?:length|mtr|meter)\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['rate', /rate\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
  ]
  for (const [key, re] of patterns) {
    const m = text.match(re)
    if (m?.[1]) out[key] = m[1]
  }
  return out
}
