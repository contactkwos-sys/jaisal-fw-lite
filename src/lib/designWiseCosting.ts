/** Design Wise Costing — factory diary formulas (÷ 9_000_000) */

export const CALC_FACTOR = 9_000_000

/** Default fabric width (inches) for every new DIN Costing warp/weft row. */
export const DEFAULT_WIDTH = 52

/** Default production / warp / weft length (meters). Yarn consumption uses this basis. */
export const DEFAULT_LENGTH_MTR = 110

/** Default TAR / Ends for every new warp row (editable). */
export const DEFAULT_TAR_ENDS = 8900

/** Default wastage meters → usable customer basis = 110 − 10 = 100. */
export const DEFAULT_WASTAGE_MTR = 10

/**
 * Customer selling-rate basis (meters).
 * Customer Rate / 100 Mtr = Final Internal Cost (110 Mtr) ÷ 100 — never applied twice.
 */
export const DEFAULT_CUSTOMER_USABLE_MTR = 100

/**
 * Costing denier offset: Working/Costing Denier = Base (Entered) Denier + 10.
 * ONLY derived from base_denier — never add offset to costing denier / denier column.
 * Recalculate must re-derive from the same base (300 → 310 forever, never 320 or 350).
 *
 * DB fields: base_denier (entered) + denier (costing_denier snapshot = base + 10).
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
 * Coerce an incoming denier candidate into a true BASE denier.
 * If Rate Master / legacy data already stored costing (name 300 + candidate 310),
 * recover the yarn-name base so we never do 300 → 310 → 320.
 */
export function coerceBaseDenier(
  candidate: string | number | null | undefined,
  yarnName?: string | null,
): string {
  const raw = candidate == null ? '' : String(candidate).trim()
  if (!raw || /^same$/i.test(raw)) {
    const fromName = resolveDenierForCalc('Same', yarnName)
    return fromName > 0 ? String(fromName) : ''
  }
  const cand = n(raw)
  if (!(cand > 0)) return ''
  const fromName = resolveDenierForCalc('', yarnName)
  // Candidate already looks like costing denier of the yarn-name base → use name base
  if (fromName > 0 && cand === fromName + DENIER_COSTING_OFFSET) {
    return String(fromName)
  }
  return String(cand)
}

/**
 * Resolve denier used in weight formulas.
 * Prefer base_denier → base + 10 (ONCE). Legacy rows without base_denier use denier as-is
 * — never add +10 on top of an already-stored costing denier.
 */
export function resolveCostingDenier(row: {
  base_denier?: string | null
  denier?: string | number | null
  /** Alias: denier column stores costing_denier */
  costing_denier?: string | number | null
  yarn_name?: string | null
  weft_name?: string | null
}): number {
  const baseRaw = row.base_denier
  if (baseRaw != null && String(baseRaw).trim() !== '') {
    return costingDenierFromBase(baseRaw)
  }
  // Legacy / snapshot only — use stored costing denier as-is (NO second +10)
  const stored = row.denier ?? row.costing_denier
  return resolveDenierForCalc(stored, row.yarn_name || row.weft_name)
}

/** Display string for costing denier column. */
export function formatCostingDenier(row: {
  base_denier?: string | null
  denier?: string | number | null
  costing_denier?: string | number | null
  yarn_name?: string | null
  weft_name?: string | null
}): string {
  const c = resolveCostingDenier(row)
  return c > 0 ? String(c) : ''
}

/**
 * Persistable costing denier for DB `denier` column (generated weight formulas).
 * Always base + 10 when base set; never adds offset to an existing costing value.
 */
export function persistCostingDenier(
  row: { base_denier?: string | null; denier?: string | number | null },
  yarnName?: string | null,
): number | null {
  if (row.base_denier != null && String(row.base_denier).trim() !== '') {
    const costing = costingDenierFromBase(row.base_denier)
    return costing > 0 ? costing : null
  }
  return denierForDb(row.denier, yarnName)
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
  /** Fabric width (inches) — default 52; editable reference (warp weight formula uses TAR × length). */
  width: string
  length_mtr: string
  rate_per_kg: string
} & RateRowMeta

export type WeftDraft = {
  key: string
  sr_no: number
  /** Feeder/Colour position label e.g. "Colour 1" / "Feeder 1" */
  feeder_label: string
  feeder_no: number | null
  /** Colour name from Colour Master / OCR (White, Black, …) */
  colour: string
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
  /** Total Warp + Total Weft Amount — 110 Mtr yarn cost */
  totalYarnAmount: number
  enteredLengthMtr: number
  wastageMtr: number
  wastagePercent: number
  /** Customer selling basis (default 100 Mtr) */
  usableLengthMtr: number
  conversionMultiplier: number
  /** @deprecated use enteredLengthMtr */
  designLengthMtr: number
  /**
   * Yarn portion of customer rate: Total Yarn (110) ÷ 100.
   * Not the full customer rate — see customerRatePerMtr / finalCostPerMtr.
   */
  yarnCostPerMtr: number
  totalPic: number
  picConversionRate: number
  /** Weaving / conversion on 110 Mtr basis = TOTAL WEFT PIC × PIC Conversion Rate */
  conversionCharge: number
  /** MU + GST amounts on 110 Mtr internal basis (other applicable internal charges) */
  otherCharges: number
  /** Total Yarn + Weaving + Other — FINAL INTERNAL COST / 110 MTR */
  finalInternalCost110: number
  /**
   * Customer Rate per 100 Mtr basis = Final Internal Cost (110) ÷ 100.
   * Alias of finalCostPerMtr for UI labelling.
   */
  customerRatePerMtr: number
  /** (Total Yarn + Weaving) ÷ 100 — before MU/GST on customer basis */
  subtotalPerMtr: number
  muPercent: number
  muAmount: number
  afterMuPerMtr: number
  gstPercent: number
  gstAmount: number
  /** Same as customerRatePerMtr — persisted as final_cost_per_mtr */
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
    tar_ends: String(DEFAULT_TAR_ENDS),
    width: String(DEFAULT_WIDTH),
    length_mtr: String(lengthMtr || DEFAULT_LENGTH_MTR),
    rate_per_kg: '',
  }
}

export function emptyWeft(
  sr = 1,
  opts?: {
    lengthMtr?: string | number
    width?: string | number
    feederNo?: number
    colour?: string
  },
): WeftDraft {
  const feederNo = opts?.feederNo ?? sr
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    feeder_label: `Feeder ${feederNo}`,
    feeder_no: feederNo,
    colour: opts?.colour ?? '',
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
 * Apply base denier edit from the user: store base as typed and sync costing = base + 10.
 * Does NOT coerce — if the user enters 310 as base, costing is 320 (once).
 * Recalculate re-derives from the same base — never stacks.
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

/**
 * Re-sync costing denier from stored base (idempotent).
 * Safe to call on Recalculate / load / save — never stacks +10.
 */
export function syncCostingDenierFromBase<T extends { base_denier: string; denier: string }>(
  row: T,
): T {
  if (!row.base_denier.trim()) return row
  return withBaseDenier(row, row.base_denier)
}

/**
 * Fill base denier from Rate Master / catalogue / OCR only when empty.
 * Coerces mistaken costing values (RM seed 310 for "300 Tex" → base 300).
 * Never overwrites an existing base (prevents stacking on Recalculate).
 */
export function ensureBaseDenier<T extends { base_denier: string; denier: string }>(
  row: T,
  candidateBase: string,
  yarnName?: string | null,
): T {
  if (row.base_denier.trim()) return syncCostingDenierFromBase(row)
  const fromRow =
    'yarn_name' in row
      ? String((row as { yarn_name?: string }).yarn_name || '')
      : 'weft_name' in row
        ? String((row as { weft_name?: string }).weft_name || '')
        : ''
  const yarn = (yarnName != null && String(yarnName).trim() !== '' ? String(yarnName) : fromRow) || undefined
  const base = coerceBaseDenier(candidateBase, yarn)
  if (!base) return row
  return withBaseDenier(row, base)
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
 * Full costing chain — FIXED business rules:
 *
 * INTERNAL (110 Mtr basis):
 *   Total Warp + Total Weft = Total Yarn Cost
 *   + Weaving / Conversion (TOTAL WEFT PIC × PIC Rate)
 *   + Other (MU, GST on the 110 Mtr total)
 *   = FINAL INTERNAL COST / 110 MTR
 *
 * CUSTOMER (100 Mtr basis) — divide ONCE, never twice:
 *   Customer Rate = Final Internal Cost (110) ÷ 100
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
  // Customer basis is always 100 Mtr by default (not derived from wastage for the ÷100 rule)
  const customerBasis =
    wastage.usableLengthMtr > 0 ? wastage.usableLengthMtr : DEFAULT_CUSTOMER_USABLE_MTR

  const rate = n(picConversionRate)
  // Weaving charge is on the 110 Mtr piece (TOTAL WEFT PIC × rate) — not per meter
  const conversionCharge = round2(totalPic * rate)
  const yarnAndWeave110 = round2(totalYarnAmount + conversionCharge)

  const mu = n(muPercent)
  const gst = n(gstPercent)
  // Apply MU / GST once on the 110 Mtr internal total, then ÷ 100 for customer rate
  const muAmount110 = round2(yarnAndWeave110 * (mu / 100))
  const afterMu110 = round2(yarnAndWeave110 + muAmount110)
  const gstAmount110 = gst > 0 ? round2(afterMu110 * (gst / 100)) : 0
  const otherCharges = round2(muAmount110 + gstAmount110)
  const finalInternalCost110 =
    gst > 0 ? round2(afterMu110 + gstAmount110) : afterMu110

  const customerRatePerMtr =
    customerBasis > 0 ? round2(finalInternalCost110 / customerBasis) : 0
  const yarnCostPerMtr = customerBasis > 0 ? round2(totalYarnAmount / customerBasis) : 0
  const subtotalPerMtr = customerBasis > 0 ? round2(yarnAndWeave110 / customerBasis) : 0
  const muAmount = customerBasis > 0 ? round2(muAmount110 / customerBasis) : 0
  const afterMuPerMtr = customerBasis > 0 ? round2(afterMu110 / customerBasis) : 0
  const gstAmount = customerBasis > 0 ? round2(gstAmount110 / customerBasis) : 0
  const finalCostPerMtr = customerRatePerMtr

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
    usableLengthMtr: customerBasis,
    conversionMultiplier: wastage.conversionMultiplier,
    designLengthMtr: length,
    yarnCostPerMtr,
    totalPic,
    picConversionRate: rate,
    conversionCharge,
    otherCharges,
    finalInternalCost110,
    customerRatePerMtr,
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
  // Profit = Customer Sale Rate − applicable cost (internal + fixed)
  const profitPerMtr = round2(effectiveSelling - cost - fixed)
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

/** Default Jacquard Repair machine speed (RPM). */
export const DEFAULT_MACHINE_SPEED_RPM = 450

/** Default weaving efficiency %. */
export const DEFAULT_EFFICIENCY_PCT = 100

/**
 * Inches-per-meter constant used in loom production formula.
 * Meters/Hour = (RPM × 60 × Efficiency%) / (TOTAL LOOM PICK × 39.37)
 */
export const LOOM_INCHES_PER_METER = 39.37

export type ProductionSpeedResult = {
  rpm: number
  loomPick: number
  widthInch: number
  efficiencyPct: number
  metersPerHour: number
  metersPer12Hours: number
  metersPer24Hours: number
  billingPerHour: number
  billingPer12Hours: number
  billingPer24Hours: number
  profitPerHour: number
  profitPer12Hours: number
  profitPer24Hours: number
}

/**
 * Jacquard Repair production / weaving speed.
 *
 * Meters/Hour = (RPM × 60 × Efficiency/100) / (TOTAL LOOM PICK × 39.37)
 *
 * Billing uses FINAL CUSTOMER SALE RATE (100 Mtr commercial basis) — never internal 110m cost.
 * Profit/period = Profit per meter × meters for that period.
 */
export function computeProductionSpeed(opts: {
  rpm: number | string | null | undefined
  loomPick: number | string | null | undefined
  widthInch?: number | string | null | undefined
  efficiencyPct?: number | string | null | undefined
  /** Final customer sale rate ₹/m (100 Mtr basis) */
  customerSaleRatePerMtr: number | string | null | undefined
  /** Profit ₹/m after cost + fixed */
  profitPerMtr?: number | string | null | undefined
}): ProductionSpeedResult {
  const rpm = n(opts.rpm)
  const loomPick = n(opts.loomPick)
  const widthInch = n(opts.widthInch) || DEFAULT_WIDTH
  const efficiencyPct = n(opts.efficiencyPct) > 0 ? n(opts.efficiencyPct) : DEFAULT_EFFICIENCY_PCT
  const saleRate = n(opts.customerSaleRatePerMtr)
  const profitPerMtr = n(opts.profitPerMtr)

  const denom = loomPick * LOOM_INCHES_PER_METER
  const metersPerHour =
    rpm > 0 && denom > 0 ? round2((rpm * 60 * (efficiencyPct / 100)) / denom) : 0
  const metersPer12Hours = round2(metersPerHour * 12)
  const metersPer24Hours = round2(metersPerHour * 24)

  return {
    rpm,
    loomPick,
    widthInch,
    efficiencyPct,
    metersPerHour,
    metersPer12Hours,
    metersPer24Hours,
    billingPerHour: round2(metersPerHour * saleRate),
    billingPer12Hours: round2(metersPer12Hours * saleRate),
    billingPer24Hours: round2(metersPer24Hours * saleRate),
    profitPerHour: round2(metersPerHour * profitPerMtr),
    profitPer12Hours: round2(metersPer12Hours * profitPerMtr),
    profitPer24Hours: round2(metersPer24Hours * profitPerMtr),
  }
}

/** Calculation hints for info-icon tooltips (auditable chain). */
export const CALC_HINTS = {
  yarnCostPerMtr:
    'Total Yarn Amount (110 Mtr) ÷ 100 — yarn portion only of customer rate',
  conversionCharge: 'TOTAL WEFT PIC × PIC Conversion Rate (₹) — 110 Mtr weaving charge',
  subtotalPerMtr: '(Total Yarn + Weaving on 110 Mtr) ÷ 100',
  muAmount: 'MU applied once on 110 Mtr internal total, then ÷ 100 for display',
  afterMuPerMtr: 'After MU on customer 100 Mtr basis',
  gstAmount: 'GST applied once on 110 Mtr after-MU total, then ÷ 100 for display',
  finalCostPerMtr:
    'Customer Rate / 100 Mtr = Final Internal Cost (110 Mtr) ÷ 100 — never convert twice',
  conversionMultiplier: 'Production Length ÷ Customer Usable Length (110 ÷ 100 = 1.10) — display only',
  totalProfit: '(CEO Final Selling Rate − Cost/Mtr − Fixed Cost/Mtr) × Production Meters',
  costingDenier: 'Costing Denier = Base Denier + 10 (derived each time from base — never stacked)',
  finalInternalCost110:
    'Total Yarn Cost + Weaving / Conversion + Other Charges (MU/GST) on 110 Mtr basis',
  customerRatePerMtr: 'Final Internal Cost for 110 Mtr ÷ 100',
  productionSpeed:
    'Meters/Hour = (RPM × 60 × Efficiency%) / (TOTAL LOOM PICK × 39.37). Billing uses Final Customer Sale Rate.',
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
