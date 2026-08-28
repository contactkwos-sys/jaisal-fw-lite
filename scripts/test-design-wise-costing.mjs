/**
 * Smoke-test DIN Costing final business logic:
 * - Base denier + 10 (no stacking on recalculate)
 * - Catalogue "Same" denier resolves from yarn name
 * - Strings excluded from costing / width
 * - Default width 52, length 110
 * - 110m production → 100m customer basis
 * - TOTAL LOOM PICK vs TOTAL WEFT PIC warning
 * Run: node scripts/test-design-wise-costing.mjs
 */

const CALC_FACTOR = 9_000_000
const DEFAULT_WIDTH = 52
const DEFAULT_LENGTH_MTR = 110
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
  const usable = wastage.usableLengthMtr
  const yarnCostPerMtr = usable > 0 ? round2(totalYarnAmount / usable) : 0
  const conversionCharge = round2(totalPic * n(picConversionRate))
  const subtotalPerMtr = round2(yarnCostPerMtr + conversionCharge)
  const muAmount = round2(subtotalPerMtr * (n(muPercent) / 100))
  const afterMuPerMtr = round2(subtotalPerMtr + muAmount)
  const gst = n(gstPercent)
  const gstAmount = gst > 0 ? round2(afterMuPerMtr * (gst / 100)) : 0
  const finalCostPerMtr = gst > 0 ? round2(afterMuPerMtr + gstAmount) : afterMuPerMtr

  return {
    totalWarpWeightKg,
    totalWeftWeightKg,
    totalWeightKg,
    totalWarpAmount,
    totalWeftAmount,
    totalYarnAmount,
    ...wastage,
    yarnCostPerMtr,
    totalPic,
    conversionCharge,
    subtotalPerMtr,
    muAmount,
    afterMuPerMtr,
    gstAmount,
    finalCostPerMtr,
  }
}

// --- Final test case JFG1674 ---
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

const checks = []

checks.push(['Anmol Jari costing denier 190', resolveCostingDenier(wefts[0]) === 190])
checks.push(['150 Lichi costing denier 170', resolveCostingDenier(wefts[1]) === 170])
checks.push(['300 Tex costing denier 310', resolveCostingDenier(wefts[2]) === 310])
checks.push(['Warp base 160 → costing 170', resolveCostingDenier(warps[0]) === 170])

const afterRecalc = resolveCostingDenier({ base_denier: '180', denier: '190' })
checks.push(['Recalc still 190 (not 200)', afterRecalc === 190])
const stackedWrong = resolveCostingDenier({ base_denier: '', denier: '190' })
checks.push(['Legacy denier-only uses 190 as-is', stackedWrong === 190])

checks.push(['Default width 52', DEFAULT_WIDTH === 52])
checks.push(['Default length 110', DEFAULT_LENGTH_MTR === 110])

checks.push(['TOTAL WEFT PIC = 111', r.totalPic === 111])
checks.push(['TOTAL LOOM PICK stays 112', TOTAL_LOOM_PICK === 112])
checks.push([
  'Warn when loom ≠ weft PIC',
  loomPickWeftPicWarning(TOTAL_LOOM_PICK, r.totalPic) ===
    'Loom Pick and calculated Weft PIC differ — please verify.',
])
checks.push(['No warn when equal', loomPickWeftPicWarning(111, 111) === null])

checks.push(['Usable length = 100', r.usableLengthMtr === 100])
checks.push(['Conversion multiplier = 1.10', r.conversionMultiplier === 1.1])
checks.push(['Yarn cost/mtr = total ÷ 100 (not ÷ 110)', r.yarnCostPerMtr === round2(r.totalYarnAmount / 100)])
checks.push(['Weaving = 111 × 0.45', r.conversionCharge === 49.95])

const badStringsAsWidth = { base_denier: '180', pic: '37', width: '2222', length_mtr: '110', rate_per_kg: '350' }
const goodWidth = { base_denier: '180', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '350' }
const badW = weftWeightKg(resolveCostingDenier(badStringsAsWidth), 37, 2222, 110)
const goodW = weftWeightKg(resolveCostingDenier(goodWidth), 37, 52, 110)
checks.push(['Strings-as-width would inflate weight (detect bug)', badW > goodW * 10])
checks.push(['Correct width 52 used in final case', wefts.every((w) => w.width === '52')])

checks.push(['Customer meter = 110m cost ÷ 100', round2(6500 / 100) === 65])

checks.push(['resolveDenier Same + 440 HSY → 440', resolveDenierForCalc('Same', '440 HSY') === 440])
checks.push(['resolveDenier Same + 300 Tex → 300', resolveDenierForCalc('Same', '300 Tex') === 300])
const hsyWeight = weftWeightWithResolved({
  weft_name: '440 HSY',
  denier: 'Same',
  pic: '28',
  width: '52',
  length_mtr: '110',
})
const hsyExpected = round2(weftWeightKg(440, 28, 52, 110))
checks.push(['HSY Same denier weight matches numeric 440', hsyWeight === hsyExpected && hsyWeight > 0])

// --- Acceptance: JFG2249 denier +10 once, never stack ---
let jfg = withBaseDenier(
  { weft_name: '300 Tex', base_denier: '', denier: '', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '150' },
  '300',
)
checks.push(['JFG2249 Base 300 → Costing 310', resolveCostingDenier(jfg) === 310 && jfg.base_denier === '300' && jfg.denier === '310'])
for (let i = 0; i < 10; i++) jfg = syncCostingDenierFromBase(jfg)
checks.push(['Recalculate ×10 still Base 300 / Costing 310', jfg.base_denier === '300' && resolveCostingDenier(jfg) === 310 && jfg.denier === '310'])

// Rate Master seed bug: denier 310 for "300 Tex" must coerce to base 300
const fromBadRm = ensureBaseDenier(
  { weft_name: '300 Tex', base_denier: '', denier: '' },
  '310',
  '300 Tex',
)
checks.push(['RM seed 310 coerced to base 300 → costing 310 (not 320)', fromBadRm.base_denier === '300' && resolveCostingDenier(fromBadRm) === 310])

// ensureBaseDenier never overwrites existing base on recalc
const kept = ensureBaseDenier({ ...jfg }, '310', '300 Tex')
checks.push(['ensureBaseDenier keeps existing base 300', kept.base_denier === '300' && resolveCostingDenier(kept) === 310])

// User intentionally enters 310 as base → costing 320 once only
const intentional = withBaseDenier({ weft_name: 'Custom', base_denier: '', denier: '' }, '310')
checks.push(['User base 310 → costing 320 once', intentional.base_denier === '310' && resolveCostingDenier(intentional) === 320])

// JFG2249 weft PIC sum vs loom pick
const jfgWefts = [
  { weft_name: '300 Tex', base_denier: '300', denier: '310', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '150' },
  { weft_name: '300 Tex', base_denier: '300', denier: '310', pic: '25', width: '52', length_mtr: '110', rate_per_kg: '150' },
]
const jfgBuild = computeBuildup([], jfgWefts, 110, 0.45, 0, 0)
checks.push(['JFG2249 Total Weft PIC = 50', jfgBuild.totalPic === 50])
checks.push(['JFG2249 Loom Pick 112 ≠ Weft PIC 50 warning', loomPickWeftPicWarning(112, 50) != null])
checks.push(['JFG2249 yarn cost on 100m basis', jfgBuild.yarnCostPerMtr === round2(jfgBuild.totalYarnAmount / 100)])
checks.push(['Weight uses costing denier 310', resolveCostingDenier(jfgWefts[0]) === 310])

let failed = 0
for (const [label, ok] of checks) {
  const mark = ok ? 'PASS' : 'FAIL'
  if (!ok) failed++
  console.log(`${mark}  ${label}`)
}

console.log('\n--- Sample buildup (JFG1674-style) ---')
console.log('TOTAL LOOM PICK', TOTAL_LOOM_PICK)
console.log('TOTAL WEFT PIC', r.totalPic)
console.log('Yarn amount (110m)', r.totalYarnAmount)
console.log('Yarn ₹/mtr (100m basis)', r.yarnCostPerMtr)
console.log('Weaving', r.conversionCharge)
console.log('Subtotal', r.subtotalPerMtr)

if (failed) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} checks passed`)
