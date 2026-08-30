/**
 * Smoke-test DIN Costing corrected business logic:
 * - Base denier + 10 (no stacking)
 * - Customer: Yarn(110)÷100 + Weaving₹/Mtr + MU 5%
 * - Never (yarn+conversion)÷100 when conversion is ₹/Mtr
 * - Machine RPM default 280, Double Width Factor 2, 28-day production
 * Run: node scripts/test-design-wise-costing.mjs
 */

const CALC_FACTOR = 9_000_000
const DEFAULT_WIDTH = 52
const DEFAULT_LENGTH_MTR = 110
const DEFAULT_TAR_ENDS = 8900
const DEFAULT_CUSTOMER_USABLE_MTR = 100
const DEFAULT_MU_PERCENT = 5
const DEFAULT_MACHINE_SPEED_RPM = 280
const DEFAULT_DOUBLE_WIDTH_FACTOR = 2
const DENIER_COSTING_OFFSET = 10
const LOOM_INCHES_PER_METER = 39.37

function n(v) {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

function round2(v) {
  if (!Number.isFinite(v)) return 0
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function costingDenierFromBase(baseDenier) {
  const base = n(baseDenier)
  return base > 0 ? base + DENIER_COSTING_OFFSET : 0
}

function resolveDenierForCalc(denier, yarnName) {
  const raw = denier == null ? '' : String(denier).trim()
  if (raw && /^same$/i.test(raw)) {
    const m = String(yarnName || '').match(/(\d+(?:\.\d+)?)/)
    return m ? Number(m[1]) : 0
  }
  const direct = n(raw)
  if (direct > 0) return direct
  const fromName = String(yarnName || '').match(/^(\d+(?:\.\d+)?)/)
  return fromName ? Number(fromName[1]) : 0
}

function coerceBaseDenier(candidate, yarnName) {
  const raw = candidate == null ? '' : String(candidate).trim()
  if (!raw || /^same$/i.test(raw)) {
    const fromName = resolveDenierForCalc('Same', yarnName)
    return fromName > 0 ? String(fromName) : ''
  }
  const cand = n(raw)
  if (!(cand > 0)) return ''
  const fromName = resolveDenierForCalc('', yarnName)
  if (fromName > 0 && cand === fromName + DENIER_COSTING_OFFSET) return String(fromName)
  return String(cand)
}

function resolveCostingDenier(row) {
  if (row.base_denier != null && String(row.base_denier).trim() !== '') {
    return costingDenierFromBase(row.base_denier)
  }
  return resolveDenierForCalc(row.denier, row.yarn_name || row.weft_name)
}

function withBaseDenier(row, baseDenier) {
  const trimmed = String(baseDenier).trim()
  const costing = costingDenierFromBase(trimmed)
  return { ...row, base_denier: trimmed, denier: costing > 0 ? String(costing) : '' }
}

function syncCostingDenierFromBase(row) {
  if (!row.base_denier || !String(row.base_denier).trim()) return row
  return withBaseDenier(row, row.base_denier)
}

function ensureBaseDenier(row, candidateBase, yarnName) {
  if (row.base_denier && String(row.base_denier).trim()) return syncCostingDenierFromBase(row)
  const base = coerceBaseDenier(candidateBase, yarnName)
  if (!base) return row
  return withBaseDenier(row, base)
}

function loomPickWeftPicWarning(loomPick, totalWeftPic) {
  const loom = n(loomPick)
  const weft = n(totalWeftPic)
  if (loom <= 0 || weft <= 0) return null
  if (Math.abs(loom - weft) < 0.01) return null
  return 'Loom Pick and calculated Weft PIC differ — please verify.'
}

function warpWeightKg(denier, tarEnds, lengthMtr) {
  return (denier * tarEnds * lengthMtr) / CALC_FACTOR
}

function weftWeightKg(denier, pic, width, lengthMtr) {
  return (denier * pic * width * lengthMtr) / CALC_FACTOR
}

function computeWastageParams(enteredLengthMtr, wastageMtr = 10, wastagePercent = 10) {
  const entered = n(enteredLengthMtr)
  const wastage = n(wastageMtr)
  const usable = Math.max(entered - wastage, 0)
  const multiplier = usable > 0 ? round2(entered / usable) : 0
  return {
    enteredLengthMtr: entered,
    wastageMtr: wastage,
    wastagePercent,
    usableLengthMtr: usable,
    conversionMultiplier: multiplier,
  }
}

/**
 * CORRECTED: Yarn(110)÷100 + Weaving₹/Mtr + MU
 * Never divide per-meter conversion by 100.
 */
function computeBuildup(
  warps,
  wefts,
  enteredLengthMtr,
  picConversionRate,
  muPercent,
  gstPercent,
  wastageMtr = 10,
  wastagePercent = 10,
) {
  let totalWarpWeightKg = 0
  let totalWeftWeightKg = 0
  let totalWarpAmount = 0
  let totalWeftAmount = 0
  let totalPic = 0

  for (const w of warps) {
    const denier = resolveCostingDenier(w)
    const weight = round2(warpWeightKg(denier, n(w.tar_ends), n(w.length_mtr)))
    const amount = round2(weight * n(w.rate_per_kg))
    totalWarpWeightKg += weight
    totalWarpAmount += amount
  }
  for (const w of wefts) {
    const denier = resolveCostingDenier(w)
    const weight = round2(weftWeightKg(denier, n(w.pic), n(w.width), n(w.length_mtr)))
    const amount = round2(weight * n(w.rate_per_kg))
    totalWeftWeightKg += weight
    totalWeftAmount += amount
    totalPic += n(w.pic)
  }

  totalWarpAmount = round2(totalWarpAmount)
  totalWeftAmount = round2(totalWeftAmount)
  const totalYarnAmount = round2(totalWarpAmount + totalWeftAmount)
  const wastage = computeWastageParams(enteredLengthMtr, wastageMtr, wastagePercent)
  const customerBasis =
    wastage.usableLengthMtr > 0 ? wastage.usableLengthMtr : DEFAULT_CUSTOMER_USABLE_MTR

  const yarnCostPerMtr = customerBasis > 0 ? totalYarnAmount / customerBasis : 0
  const conversionCharge = totalPic * n(picConversionRate)
  const subtotalPerMtr = yarnCostPerMtr + conversionCharge
  const muAmount = subtotalPerMtr * (n(muPercent) / 100)
  const afterMuPerMtr = subtotalPerMtr + muAmount
  const gst = n(gstPercent)
  const gstAmount = gst > 0 ? afterMuPerMtr * (gst / 100) : 0
  const finalCostPerMtr = gst > 0 ? afterMuPerMtr + gstAmount : afterMuPerMtr

  return {
    totalYarnAmount,
    usableLengthMtr: customerBasis,
    yarnCostPerMtr,
    totalPic,
    conversionCharge,
    finalInternalCost110: totalYarnAmount,
    customerRatePerMtr: finalCostPerMtr,
    subtotalPerMtr,
    muAmount,
    afterMuPerMtr,
    gstAmount,
    finalCostPerMtr,
  }
}

function computeProductionSpeed(opts) {
  const rpm = n(opts.rpm)
  const loomPick = n(opts.loomPick)
  const efficiencyPct = n(opts.efficiencyPct) > 0 ? n(opts.efficiencyPct) : 100
  const factor = n(opts.doubleWidthFactor) > 0 ? n(opts.doubleWidthFactor) : DEFAULT_DOUBLE_WIDTH_FACTOR
  const saleRate = n(opts.customerSaleRatePerMtr)
  const profitPerMtr = n(opts.profitPerMtr)
  const denom = loomPick * LOOM_INCHES_PER_METER
  const metersPerHour =
    rpm > 0 && denom > 0
      ? round2((rpm * 60 * (efficiencyPct / 100) * factor) / denom)
      : 0
  const metersPer12Hours = round2(metersPerHour * 12)
  const metersPer24Hours = round2(metersPerHour * 24)
  const metersPer28Days = round2(metersPer24Hours * 28)
  return {
    metersPerHour,
    metersPer12Hours,
    metersPer24Hours,
    metersPer28Days,
    billingPerHour: round2(metersPerHour * saleRate),
    billingPer12Hours: round2(metersPer12Hours * saleRate),
    billingPer24Hours: round2(metersPer24Hours * saleRate),
    billingPer28Days: round2(metersPer28Days * saleRate),
    profitPer12Hours: round2(metersPer12Hours * profitPerMtr),
    profitPer28Days: round2(metersPer28Days * profitPerMtr),
    doubleWidthFactor: factor,
  }
}

const checks = []

checks.push(['Warp Base 150 → Costing 160', costingDenierFromBase(150) === 160])
checks.push(['Weft Base 300 → Costing 310 (NOT 320)', costingDenierFromBase(300) === 310])
checks.push(['Never 300 → 320', costingDenierFromBase(300) !== 320])

let warp150 = withBaseDenier(
  { yarn_name: '150 Bright', base_denier: '', denier: '', tar_ends: '8900', width: '52', length_mtr: '110', rate_per_kg: '160' },
  '150',
)
for (let i = 0; i < 10; i++) warp150 = syncCostingDenierFromBase(warp150)
checks.push(['Warp recalc ×10 still 150/160', warp150.base_denier === '150' && resolveCostingDenier(warp150) === 160])

let weft300 = withBaseDenier(
  { weft_name: '300 Tex', base_denier: '', denier: '', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '150' },
  '300',
)
for (let i = 0; i < 10; i++) weft300 = syncCostingDenierFromBase(weft300)
checks.push(['Weft2 recalc still 300/310', weft300.base_denier === '300' && resolveCostingDenier(weft300) === 310])

const fromBadRm = ensureBaseDenier(
  { weft_name: '300 Tex', base_denier: '', denier: '' },
  '310',
  '300 Tex',
)
checks.push(['RM seed 310 coerced to base 300 → costing 310', fromBadRm.base_denier === '300' && resolveCostingDenier(fromBadRm) === 310])

checks.push(['Default width 52', DEFAULT_WIDTH === 52])
checks.push(['Default length 110', DEFAULT_LENGTH_MTR === 110])
checks.push(['Default TAR 8900', DEFAULT_TAR_ENDS === 8900])
checks.push(['Default MU 5%', DEFAULT_MU_PERCENT === 5])
checks.push(['Default RPM 280', DEFAULT_MACHINE_SPEED_RPM === 280])
checks.push(['Default Double Width Factor 2', DEFAULT_DOUBLE_WIDTH_FACTOR === 2])

// Spec example: yarn 5289.58 → yarn/100 = 52.8958; weave 21.60; base = 74.4958
const yarnEx = 5289.58
const yarnPer100 = yarnEx / 100
const weaveEx = 21.6
const baseEx = yarnPer100 + weaveEx
checks.push(['Yarn/100m = 5289.58÷100', Math.abs(yarnPer100 - 52.8958) < 1e-9])
checks.push(['Base customer = yarn/100 + weave/mtr', Math.abs(baseEx - 74.4958) < 1e-9])
checks.push(['Display base rounds to 74.50', round2(baseEx) === 74.5])
checks.push(['MU 5% on base', Math.abs(baseEx * 0.05 - 3.72479) < 1e-6])
checks.push(['After MU = base + MU', Math.abs(baseEx * 1.05 - 78.22059) < 1e-6])
checks.push(['NEVER (yarn+weave110)÷100 when weave is ₹/mtr', round2((yarnEx + weaveEx) / 100) !== round2(baseEx)])

const colourWefts = [
  { weft_name: '', feeder_label: 'Colour 1', base_denier: '110', denier: '120', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '200' },
  { weft_name: '', feeder_label: 'Colour 2', base_denier: '110', denier: '120', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '200' },
  { weft_name: '300 Tex', feeder_label: 'Colour 3', base_denier: '300', denier: '310', pic: '50', width: '52', length_mtr: '110', rate_per_kg: '150' },
]
const colourBuild = computeBuildup([], colourWefts, 110, 0.45, 0, 0)
checks.push(['TOTAL WEFT PIC = 100', colourBuild.totalPic === 100])
checks.push(['Weaving = 100 × 0.45 = 45 ₹/Mtr', colourBuild.conversionCharge === 45])
checks.push(['Yarn/100 + weave (not ÷100 weave)', colourBuild.subtotalPerMtr === colourBuild.yarnCostPerMtr + 45])
checks.push(['Loom 112 ≠ Weft PIC 100 warning', loomPickWeftPicWarning(112, 100) != null])

const demo = computeBuildup(
  [{ yarn_name: 'W', base_denier: '150', denier: '160', tar_ends: '8900', length_mtr: '110', rate_per_kg: '100' }],
  [{ weft_name: 'F', base_denier: '300', denier: '310', pic: '48', width: '52', length_mtr: '110', rate_per_kg: '150' }],
  110,
  0.45,
  5,
  0,
)
checks.push(['Yarn cost/mtr = yarn ÷ 100', Math.abs(demo.yarnCostPerMtr - demo.totalYarnAmount / 100) < 1e-9])
checks.push(['Weaving = 48 × 0.45 = 21.6 /Mtr', demo.conversionCharge === 21.6])
checks.push(['Base = yarn/100 + 21.6', Math.abs(demo.subtotalPerMtr - (demo.yarnCostPerMtr + 21.6)) < 1e-9])
checks.push(['MU applied on customer base (not 110÷100 of yarn+weave)', Math.abs(demo.muAmount - demo.subtotalPerMtr * 0.05) < 1e-9])
checks.push(['Final = after MU', Math.abs(demo.finalCostPerMtr - demo.afterMuPerMtr) < 1e-9])
checks.push(['Internal 110 = yarn only', demo.finalInternalCost110 === demo.totalYarnAmount])
checks.push(['Usable / customer basis = 100', demo.usableLengthMtr === 100])

// Wrong old formula must NOT match
const wrongOld = round2((demo.totalYarnAmount + demo.conversionCharge) / 100)
checks.push(['Correct base ≠ old (yarn+weave)÷100', round2(demo.subtotalPerMtr) !== wrongOld])

const prod100 = computeProductionSpeed({
  rpm: 280,
  loomPick: 112,
  efficiencyPct: 100,
  doubleWidthFactor: 2,
  customerSaleRatePerMtr: 80,
  profitPerMtr: 10,
})
const prod85 = computeProductionSpeed({
  rpm: 280,
  loomPick: 112,
  efficiencyPct: 85,
  doubleWidthFactor: 2,
  customerSaleRatePerMtr: 80,
  profitPerMtr: 10,
})
const expectedMph =
  round2((280 * 60 * 1 * 2) / (112 * LOOM_INCHES_PER_METER))
checks.push(['Production includes double width factor', prod100.metersPerHour === expectedMph])
checks.push(['Efficiency 85% reduces production', prod85.metersPerHour < prod100.metersPerHour])
checks.push(['28-day = 24h × 28', prod100.metersPer28Days === round2(prod100.metersPer24Hours * 28)])
checks.push(['Billing = meters × sale (no second ×2)', prod100.billingPerHour === round2(prod100.metersPerHour * 80)])
checks.push(['Factor applied once only', prod100.doubleWidthFactor === 2])

const noFactor = computeProductionSpeed({
  rpm: 280,
  loomPick: 112,
  efficiencyPct: 100,
  doubleWidthFactor: 1,
  customerSaleRatePerMtr: 80,
})
checks.push(['Factor 2 doubles production vs factor 1', prod100.metersPerHour === round2(noFactor.metersPerHour * 2)])

const failed = checks.filter((c) => !c[1])
for (const [name, ok] of checks) {
  console.log(ok ? 'PASS' : 'FAIL', name)
}
console.log('---')
console.log('Demo yarn', demo.totalYarnAmount, 'yarn/100', demo.yarnCostPerMtr)
console.log('Weaving /Mtr', demo.conversionCharge)
console.log('Base customer', demo.subtotalPerMtr)
console.log('After MU 5%', demo.afterMuPerMtr)
console.log('Final', demo.finalCostPerMtr)
console.log('Prod/hr@280×2', prod100.metersPerHour, '28d', prod100.metersPer28Days)

if (failed.length) {
  console.error(`FAILED ${failed.length}/${checks.length}`)
  process.exit(1)
}
console.log(`ALL ${checks.length} CHECKS PASSED`)
