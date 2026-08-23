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

export type RateRowMeta = {
  rate_source?: 'rate_master' | 'manual' | ''
  rate_master_id?: string
  rate_basic?: number
  rate_gst_percent?: number
  rate_gst_amount?: number
  rate_freight?: number
  rate_effective_from?: string
}

export type WarpDraft = {
  key: string
  sr_no: number
  yarn_name: string
  denier: string
  tar_ends: string
  length_mtr: string
  rate_per_kg: string
} & RateRowMeta

export type WeftDraft = {
  key: string
  sr_no: number
  weft_name: string
  denier: string
  pic: string
  width: string
  length_mtr: string
  rate_per_kg: string
} & RateRowMeta

export type WastageParams = {
  enteredLengthMtr: number
  wastageMtr: number
  wastagePercent: number
  usableLengthMtr: number
  conversionMultiplier: number
}

export type ProfitProjection = {
  costPerMtr: number
  fixedCostPerMtr: number
  desiredProfitPerMtr: number
  targetSellingRate: number
  ceoFinalSellingRate: number
  productionMeters: number
  profitPerMtr: number
  totalProfit: number
  marginPctOnCost: number
  marginPctOnSelling: number
}

export type CostingBuildup = {
  totalWarpWeightKg: number
  totalWeftWeightKg: number
  totalWeightKg: number
  totalWarpAmount: number
  totalWeftAmount: number
  totalYarnAmount: number
  enteredLengthMtr: number
  wastageMtr: number
  wastagePercent: number
  usableLengthMtr: number
  conversionMultiplier: number
  /** @deprecated use enteredLengthMtr */
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

/** Compute wastage / usable length from entered production length. */
export function computeWastageParams(
  enteredLengthMtr: number,
  wastageMtr = 10,
  wastagePercent = 10,
): WastageParams {
  const entered = n(enteredLengthMtr)
  const wastage = n(wastageMtr)
  const pct = n(wastagePercent)
  const usable = Math.max(entered - wastage, 0)
  const multiplier = usable > 0 ? round2(entered / usable) : 0
  return {
    enteredLengthMtr: entered,
    wastageMtr: wastage,
    wastagePercent: pct,
    usableLengthMtr: usable,
    conversionMultiplier: multiplier,
  }
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
 * Full per-meter costing chain (Jacquard Repair Design).
 * Yarn rows consume on entered length (incl. wastage); per-meter yarn cost divides total yarn
 * by usable length (100 mtr basis). Weaving charge = Total Weft PIC × PIC Conversion Rate.
 */
export function computeBuildup(
  warps: WarpDraft[],
  wefts: WeftDraft[],
  enteredLengthMtr: number,
  picConversionRate: number,
  muPercent: number,
  gstPercent: number,
  wastageMtr = 10,
  wastagePercent = 10,
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
  const wastage = computeWastageParams(enteredLengthMtr, wastageMtr, wastagePercent)
  const length = wastage.enteredLengthMtr
  const usable = wastage.usableLengthMtr
  const yarnCostPerMtr = usable > 0 ? round2(totalYarnAmount / usable) : 0
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
    enteredLengthMtr: length,
    wastageMtr: wastage.wastageMtr,
    wastagePercent: wastage.wastagePercent,
    usableLengthMtr: wastage.usableLengthMtr,
    conversionMultiplier: wastage.conversionMultiplier,
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

/** CEO profit & projection calculator — uses CEO final selling rate when set. */
export function computeProfitProjection(
  finalCostPerMtr: number,
  fixedCostPerMtr: number,
  desiredProfitPerMtr: number,
  ceoFinalSellingRate: number,
  productionMeters: number,
): ProfitProjection {
  const cost = n(finalCostPerMtr)
  const fixed = n(fixedCostPerMtr)
  const desired = n(desiredProfitPerMtr)
  const selling = n(ceoFinalSellingRate)
  const prod = n(productionMeters)
  const targetSellingRate = round2(cost + fixed + desired)
  const effectiveSelling = selling > 0 ? selling : targetSellingRate
  const profitPerMtr = round2(effectiveSelling - cost)
  const totalProfit = round2(profitPerMtr * prod)
  const marginPctOnCost = cost > 0 ? round2((profitPerMtr / cost) * 100) : 0
  const marginPctOnSelling = effectiveSelling > 0 ? round2((profitPerMtr / effectiveSelling) * 100) : 0
  return {
    costPerMtr: cost,
    fixedCostPerMtr: fixed,
    desiredProfitPerMtr: desired,
    targetSellingRate,
    ceoFinalSellingRate: selling,
    productionMeters: prod,
    profitPerMtr,
    totalProfit,
    marginPctOnCost,
    marginPctOnSelling,
  }
}

/** Calculation hints for info-icon tooltips (auditable chain). */
export const CALC_HINTS = {
  yarnCostPerMtr: 'Total Yarn Amount ÷ Usable Length (yarn on entered mtr, rate on 100 mtr basis)',
  conversionCharge: 'Total PIC × Conversion Rate (₹/PIC)',
  subtotalPerMtr: 'Yarn Cost/Mtr + Conversion / Weaving Charge',
  muAmount: 'Subtotal × MU %',
  afterMuPerMtr: 'Subtotal + MU Amount',
  gstAmount: 'After MU × GST %',
  finalCostPerMtr: 'After MU + GST Amount',
  conversionMultiplier: 'Entered Length ÷ Usable Length',
  totalProfit: '(CEO Final Selling Rate − Cost/Mtr) × Production Meters',
} as const

/** Role helpers for DIN Costing access */
export function canEditDinCosting(roleName: string, isCeo: boolean, isManager: boolean): boolean {
  const r = (roleName || '').trim().toLowerCase()
  return (
    isCeo ||
    isManager ||
    r === 'md' ||
    r === 'managing director' ||
    r === 'owner' ||
    r.includes('ceo') ||
    r === 'admin'
  )
}

export function canViewDinCosting(roleName: string, isCeo: boolean, isManager: boolean): boolean {
  if (canEditDinCosting(roleName, isCeo, isManager)) return true
  const r = (roleName || '').trim().toLowerCase()
  return (
    r.includes('program') ||
    r === 'programmer' ||
    r === 'program supervisor' ||
    r === 'production incharge' ||
    r === 'mill incharge' ||
    r === 'mill' ||
    r === 'machine supervisor'
  )
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
