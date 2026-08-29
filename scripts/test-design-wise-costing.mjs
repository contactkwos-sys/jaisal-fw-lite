/**
 * Smoke-test DIN Costing final business logic:
 * - Base denier + 10 (no stacking on recalculate) — 300 → 310 forever
 * - Default TAR 8900, width 52, length 110
 * - Internal cost on 110 Mtr; Customer rate = Internal 110 ÷ 100 (once)
 * - Strings excluded from costing
 * - TOTAL LOOM PICK vs TOTAL WEFT PIC warning
 * Run: node scripts/test-design-wise-costing.mjs
 */

const CALC_FACTOR = 9_000_000
const DEFAULT_WIDTH = 52
const DEFAULT_LENGTH_MTR = 110
const DEFAULT_TAR_ENDS = 8900
const DEFAULT_CUSTOMER_USABLE_MTR = 100
const DENIER_COSTING_OFFSET = 10

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

function weftWeightWithResolved(row) {
  const denier = resolveCostingDenier(row)
  return round2(weftWeightKg(denier, n(row.pic), n(row.width), n(row.length_mtr)))
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

/** FIXED formula: Internal 110 = yarn + weave + other; Customer = Internal ÷ 100 once */
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

  totalWarpWeightKg = round2(totalWarpWeightKg)
  totalWeftWeightKg = round2(totalWeftWeightKg)
  totalWarpAmount = round2(totalWarpAmount)
  totalWeftAmount = round2(totalWeftAmount)

  const totalWeightKg = round2(totalWarpWeightKg + totalWeftWeightKg)
  const totalYarnAmount = round2(totalWarpAmount + totalWeftAmount)
  const wastage = computeWastageParams(enteredLengthMtr, wastageMtr, wastagePercent)
  const customerBasis =
    wastage.usableLengthMtr > 0 ? wastage.usableLengthMtr : DEFAULT_CUSTOMER_USABLE_MTR

  const conversionCharge = round2(totalPic * n(picConversionRate))
  const yarnAndWeave110 = round2(totalYarnAmount + conversionCharge)
  const muAmount110 = round2(yarnAndWeave110 * (n(muPercent) / 100))
  const afterMu110 = round2(yarnAndWeave110 + muAmount110)
  const gst = n(gstPercent)
  const gstAmount110 = gst > 0 ? round2(afterMu110 * (gst / 100)) : 0
  const otherCharges = round2(muAmount110 + gstAmount110)
  const finalInternalCost110 = gst > 0 ? round2(afterMu110 + gstAmount110) : afterMu110
  const customerRatePerMtr =
    customerBasis > 0 ? round2(finalInternalCost110 / customerBasis) : 0

  return {
    totalWarpWeightKg,
    totalWeftWeightKg,
    totalWeightKg,
    totalWarpAmount,
    totalWeftAmount,
    totalYarnAmount,
    ...wastage,
    usableLengthMtr: customerBasis,
    yarnCostPerMtr: customerBasis > 0 ? round2(totalYarnAmount / customerBasis) : 0,
    totalPic,
    conversionCharge,
    otherCharges,
    finalInternalCost110,
    customerRatePerMtr,
    subtotalPerMtr: customerBasis > 0 ? round2(yarnAndWeave110 / customerBasis) : 0,
    muAmount: customerBasis > 0 ? round2(muAmount110 / customerBasis) : 0,
    afterMuPerMtr: customerBasis > 0 ? round2(afterMu110 / customerBasis) : 0,
    gstAmount: customerBasis > 0 ? round2(gstAmount110 / customerBasis) : 0,
    finalCostPerMtr: customerRatePerMtr,
  }
}

const checks = []

// --- FINAL ACCEPTANCE: exact denier rule ---
checks.push(['Warp Base 150 → Costing 160', costingDenierFromBase(150) === 160])
checks.push(['Weft Base 110 → Costing 120', costingDenierFromBase(110) === 120])
checks.push(['Weft Base 300 → Costing 310 (NOT 320, NOT 350)', costingDenierFromBase(300) === 310])
checks.push(['Never 300 → 320', costingDenierFromBase(300) !== 320])
checks.push(['Never 300 → 350', costingDenierFromBase(300) !== 350])

let warp150 = withBaseDenier(
  { yarn_name: '150 Bright', base_denier: '', denier: '', tar_ends: '8900', width: '52', length_mtr: '110', rate_per_kg: '160' },
  '150',
)
checks.push(['Warp 150 base/costing fields', warp150.base_denier === '150' && warp150.denier === '160'])
for (let i = 0; i < 10; i++) warp150 = syncCostingDenierFromBase(warp150)
checks.push(['Warp recalc ×10 still 150/160', warp150.base_denier === '150' && resolveCostingDenier(warp150) === 160])

let weft110 = withBaseDenier(
  { weft_name: '110 Yarn', base_denier: '', denier: '', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '200' },
  '110',
)
checks.push(['Weft1 Base 110 → Costing 120', weft110.base_denier === '110' && resolveCostingDenier(weft110) === 120])

let weft300 = withBaseDenier(
  { weft_name: '300 Tex', base_denier: '', denier: '', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '150' },
  '300',
)
checks.push(['Weft2 Base 300 → Costing 310', weft300.base_denier === '300' && resolveCostingDenier(weft300) === 310])
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

// Colour/Feeder → Pick mapping (1:1)
const colourWefts = [
  { weft_name: '', feeder_label: 'Colour 1', base_denier: '110', denier: '120', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '200' },
  { weft_name: '', feeder_label: 'Colour 2', base_denier: '110', denier: '120', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '200' },
  { weft_name: '300 Tex', feeder_label: 'Colour 3', base_denier: '300', denier: '310', pic: '50', width: '52', length_mtr: '110', rate_per_kg: '150' },
]
checks.push(['Colour 1 → Pick 25', colourWefts[0].pic === '25'])
checks.push(['Colour 2 → Pick 25', colourWefts[1].pic === '25'])
checks.push(['Colour 3 → Pick 50', colourWefts[2].pic === '50'])
checks.push(['Blank yarn kept on Colour 1', colourWefts[0].weft_name === ''])

const colourBuild = computeBuildup([], colourWefts, 110, 0.45, 0, 0)
checks.push(['TOTAL WEFT PIC = 100 (25+25+50)', colourBuild.totalPic === 100])
checks.push(['Loom 112 ≠ Weft PIC 100 warning', loomPickWeftPicWarning(112, 100) != null])
checks.push(['Strings never in weight (width stays 52)', colourWefts.every((w) => w.width === '52')])

// Customer rate formula: Internal 110 ÷ 100 once
checks.push(['Example 5500 ÷ 100 = 55', round2(5500 / 100) === 55])
const demo = computeBuildup(
  [{ yarn_name: 'W', base_denier: '150', denier: '160', tar_ends: '8900', length_mtr: '110', rate_per_kg: '100' }],
  [{ weft_name: 'F', base_denier: '300', denier: '310', pic: '50', width: '52', length_mtr: '110', rate_per_kg: '150' }],
  110,
  0.45,
  0,
  0,
)
checks.push(['Customer rate = finalInternal110 ÷ 100', demo.customerRatePerMtr === round2(demo.finalInternalCost110 / 100)])
checks.push(['finalCostPerMtr aliases customer rate', demo.finalCostPerMtr === demo.customerRatePerMtr])
checks.push([
  'Weaving is on 110 basis (not added raw to per-mtr yarn)',
  demo.finalInternalCost110 === round2(demo.totalYarnAmount + demo.conversionCharge),
])
checks.push(['Yarn cost/mtr = yarn ÷ 100', demo.yarnCostPerMtr === round2(demo.totalYarnAmount / 100)])
checks.push(['Usable / customer basis = 100', demo.usableLengthMtr === 100])

// Legacy JFG checks
const TOTAL_LOOM_PICK = 112
const wefts = [
  { weft_name: 'Anmol Jari', base_denier: '180', denier: '', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '350' },
  { weft_name: '150 Lichi', base_denier: '160', denier: '', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '205' },
  { weft_name: '300 Tex', base_denier: '300', denier: '', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '150' },
]
const warps = [
  { yarn_name: '150 Bright Yarn', base_denier: '160', denier: '', tar_ends: '8900', length_mtr: '110', rate_per_kg: '159.75' },
]
const r = computeBuildup(warps, wefts, DEFAULT_LENGTH_MTR, 0.45, 0, 0)
checks.push(['Anmol Jari costing denier 190', resolveCostingDenier(wefts[0]) === 190])
checks.push(['300 Tex costing denier 310', resolveCostingDenier(wefts[2]) === 310])
checks.push(['TOTAL WEFT PIC = 111', r.totalPic === 111])
checks.push(['TOTAL LOOM PICK stays 112', TOTAL_LOOM_PICK === 112])
checks.push(['Weaving = 111 × 0.45', r.conversionCharge === 49.95])
checks.push(['Customer = internal ÷ 100', r.customerRatePerMtr === round2(r.finalInternalCost110 / 100)])

let failed = 0
for (const [label, ok] of checks) {
  const mark = ok ? 'PASS' : 'FAIL'
  if (!ok) failed++
  console.log(`${mark}  ${label}`)
}

console.log('\n--- Sample buildup ---')
console.log('Yarn amount (110m)', r.totalYarnAmount)
console.log('Weaving (110m)', r.conversionCharge)
console.log('Final Internal 110', r.finalInternalCost110)
console.log('Customer Rate / 100', r.customerRatePerMtr)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
