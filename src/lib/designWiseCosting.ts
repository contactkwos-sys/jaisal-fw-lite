/** Design Wise Costing — factory diary formulas (÷ 9_000_000) */

export const CALC_FACTOR = 9_000_000

/** Default fabric width (inches) for every new DIN Costing weft row. */
export const DEFAULT_WIDTH = 52

/** Default production / warp / weft length (meters). Yarn consumption uses this basis. */
export const DEFAULT_LENGTH_MTR = 110

/** Default wastage meters → usable customer basis = 110 − 10 = 100. */
export const DEFAULT_WASTAGE_MTR = 10

/** Customer-facing costing basis (meters). Yarn ₹/mtr = total yarn cost ÷ this. */
export const DEFAULT_CUSTOMER_USABLE_MTR = 100

/**
 * Costing denier offset: Working/Costing Denier = Base (Entered) Denier + 10.
 * Always derived from base_denier — never re-add on Recalculate.
 */
export const DENIER_COSTING_OFFSET = 10

export function n(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Costing denier from entered base denier (base + 10). Returns 0 when base is empty. */
export function costingDenierFromBase(baseDenier: string | number | null | undefined): number {
  const base = n(baseDenier)
  return base > 0 ? base + DENIER_COSTING_OFFSET : 0
}

/**
 * Resolve denier used in weight formulas.
 * Prefer base_denier → base + 10. Legacy rows without base_denier use denier as-is
 * (or catalogue "Same" → number from yarn name) — avoids re-applying +10 on historical data.
 */
export function resolveCostingDenier(row: {
  base_denier?: string | null
  denier?: string | number | null
  yarn_name?: string | null
  weft_name?: string | null
}): number {
  const baseRaw = row.base_denier
  if (baseRaw != null && String(baseRaw).trim() !== '') {
    return costingDenierFromBase(baseRaw)
  }
  return resolveDenierForCalc(row.denier, row.yarn_name || row.weft_name)
}

/** Display string for costing denier column. */
export function formatCostingDenier(row: {
  base_denier?: string | null
  denier?: string | number | null
  yarn_name?: string | null
  weft_name?: string | null
}): string {
  const c = resolveCostingDenier(row)
  return c > 0 ? String(c) : ''
}

/**
 * Warn when source TOTAL LOOM PICK differs from Σ weft PIC rows.
 * Do not silently overwrite either value.
 */
export function loomPickWeftPicWarning(
  loomPick: number | string | null | undefined,
  totalWeftPic: number | string | null | undefined,
): string | null {
  const loom = n(loomPick)
  const weft = n(totalWeftPic)
  if (loom <= 0 || weft <= 0) return null
  if (Math.abs(loom - weft) < 0.01) return null
  return 'Loom Pick and calculated Weft PIC differ — please verify.'
}

/**
 * Resolve denier for weight formulas.
 * Catalogue "Same" (HSY) means use the numeric denier embedded in the yarn name
 * (e.g. "440 HSY" → 440). Does not invent rates — only denier for ÷ 9_000_000 math.
 */
export function resolveDenierForCalc(
  denier: string | number | null | undefined,
  yarnName?: string | null,
): number {
  const raw = denier == null ? '' : String(denier).trim()
  if (raw && /^same$/i.test(raw)) {
    const m = String(yarnName || '').match(/(\d+(?:\.\d+)?)/)
    return m ? Number(m[1]) : 0
  }
  const direct = n(raw)
  if (direct > 0) return direct
  // Blank denier but yarn name starts with denier (e.g. "300 Tex")
  const fromName = String(yarnName || '').match(/^(\d+(?:\.\d+)?)/)
  return fromName ? Number(fromName[1]) : 0
}

/** Persistable numeric denier (null when unresolved) — never store the word "Same". */
export function denierForDb(
  denier: string | number | null | undefined,
  yarnName?: string | null,
): number | null {
  const v = resolveDenierForCalc(denier, yarnName)
  return v > 0 ? v : null
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
  /** User / Rate Master entered denier (base). Costing uses base + 10. */
  base_denier: string
  /**
   * Costing denier snapshot (base + 10 when base_denier set).
   * Legacy rows may only have this field — then it is used as-is.
   */
  denier: string
  tar_ends: string
  length_mtr: string
  rate_per_kg: string
} & RateRowMeta

export type WeftDraft = {
  key: string
  sr_no: number
  /** Feeder/Colour position label e.g. "Colour 1" / "Feeder 1" */
  feeder_label: string
  feeder_no: number | null
  weft_name: string
  /** User / Rate Master entered denier (base). Costing uses base + 10. */
  base_denier: string
  /** Costing denier snapshot — see WarpDraft.denier */
  denier: string
  pic: string
  width: string
  length_mtr: string
  rate_per_kg: string
  /**
   * OCR Strings reference only — NEVER used in pick / weight / costing formulas.
   */
  strings_ref?: string
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

export function emptyWarp(sr = 1, lengthMtr: string | number = DEFAULT_LENGTH_MTR): WarpDraft {
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    yarn_name: '',
    base_denier: '',
    denier: '',
    tar_ends: '',
    length_mtr: String(lengthMtr || DEFAULT_LENGTH_MTR),
    rate_per_kg: '',
  }
}

export function emptyWeft(
  sr = 1,
  opts?: { lengthMtr?: string | number; width?: string | number; feederNo?: number },
): WeftDraft {
  const feederNo = opts?.feederNo ?? sr
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    feeder_label: `Colour ${feederNo}`,
    feeder_no: feederNo,
    weft_name: '',
    base_denier: '',
    denier: '',
    pic: '',
    width: String(opts?.width ?? DEFAULT_WIDTH),
    length_mtr: String(opts?.lengthMtr ?? DEFAULT_LENGTH_MTR),
    rate_per_kg: '',
    strings_ref: '',
  }
}

/**
 * Apply base denier edit: store base separately and sync costing denier = base + 10.
 * Recalculate always re-derives from base — never base+10+10.
 */
export function withBaseDenier<T extends { base_denier: string; denier: string }>(
  row: T,
  baseDenier: string,
): T {
  const trimmed = baseDenier.trim()
  const costing = costingDenierFromBase(trimmed)
  return {
    ...row,
    base_denier: trimmed,
    denier: costing > 0 ? String(costing) : '',
  }
}

export function computeWarpRow(row: WarpDraft) {
  const denier = resolveCostingDenier({ ...row, yarn_name: row.yarn_name })
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
    costingDenier: denier,
    calcFactor: CALC_FACTOR,
  }
}

export function computeWeftRow(row: WeftDraft) {
  const denier = resolveCostingDenier({ ...row, weft_name: row.weft_name })
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
    costingDenier: denier,
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
  yarnCostPerMtr:
    'Total Yarn Amount ÷ Customer Usable Length (yarn consumed on 110 m production; ₹/mtr on 100 m basis)',
  conversionCharge: 'TOTAL WEFT PIC × PIC Conversion Rate (₹/PIC) — not Total Loom Pick',
  subtotalPerMtr: 'Yarn Cost/Mtr + Conversion / Weaving Charge',
  muAmount: 'Subtotal × MU %',
  afterMuPerMtr: 'Subtotal + MU Amount',
  gstAmount: 'After MU × GST %',
  finalCostPerMtr: 'After MU + GST Amount',
  conversionMultiplier: 'Production Length ÷ Customer Usable Length (110 ÷ 100 = 1.10)',
  totalProfit: '(CEO Final Selling Rate − Cost/Mtr) × Production Meters',
  costingDenier: 'Costing Denier = Base Denier + 10 (derived each time from base — never stacked)',
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

/** CEO-approved sale rate for program/order screens; falls back to calculated final cost. */
export function finalSaleRate(
  ceoFinalSellingRate: number | string | null | undefined,
  finalCostPerMtr?: number | string | null | undefined,
): number | null {
  const ceo = n(ceoFinalSellingRate)
  if (ceo > 0) return round2(ceo)
  const calc = n(finalCostPerMtr)
  return calc > 0 ? round2(calc) : null
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
