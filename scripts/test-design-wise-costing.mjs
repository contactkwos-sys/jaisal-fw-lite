/**
 * Smoke-test Design Wise Costing calculation chain (manual sheet example).
 * Run: node scripts/test-design-wise-costing.mjs
 */

const CALC_FACTOR = 9_000_000

function n(v) {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

function round2(v) {
  if (!Number.isFinite(v)) return 0
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function warpWeightKg(denier, tarEnds, lengthMtr) {
  return (denier * tarEnds * lengthMtr) / CALC_FACTOR
}

function weftWeightKg(denier, pic, width, lengthMtr) {
  return (denier * pic * width * lengthMtr) / CALC_FACTOR
}

function computeBuildup(warps, wefts, designLengthMtr, picConversionRate, muPercent, gstPercent) {
  let totalWarpWeightKg = 0
  let totalWeftWeightKg = 0
  let totalWarpAmount = 0
  let totalWeftAmount = 0
  let totalPic = 0

  for (const w of warps) {
    const weight = round2(warpWeightKg(n(w.denier), n(w.tar_ends), n(w.length_mtr)))
    const amount = round2(weight * n(w.rate_per_kg))
    totalWarpWeightKg += weight
    totalWarpAmount += amount
  }
  for (const w of wefts) {
    const weight = round2(weftWeightKg(n(w.denier), n(w.pic), n(w.width), n(w.length_mtr)))
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
  const length = n(designLengthMtr)
  const yarnCostPerMtr = length > 0 ? round2(totalYarnAmount / length) : 0
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
    yarnCostPerMtr,
    totalPic,
    conversionCharge,
    subtotalPerMtr,
    afterMuPerMtr,
    gstAmount,
    finalCostPerMtr,
  }
}

const warps = [
  {
    yarn_name: '150 ROTO B & W',
    denier: '155',
    tar_ends: '8900',
    length_mtr: '100',
    rate_per_kg: '137.50',
  },
]

const wefts = [
  { weft_name: '150 Lichi', denier: '160', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '205' },
  { weft_name: 'Anmol Jari', denier: '120', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '350' },
  { weft_name: '150 Lichi', denier: '160', pic: '37', width: '52', length_mtr: '110', rate_per_kg: '205' },
]

const r = computeBuildup(warps, wefts, 110, 0.45, 0, 0)

const checks = [
  ['Warp weight ≈ 15.33', Math.abs(r.totalWarpWeightKg - 15.33) < 0.02],
  ['Weft weight ≈ 10.34', Math.abs(r.totalWeftWeightKg - 10.34) < 0.05],
  ['Total yarn weight ≈ 25.67', Math.abs(r.totalWeightKg - 25.67) < 0.05],
  ['Total PIC = 111', r.totalPic === 111],
  ['Weaving charge = 111 × 0.45 = 49.95', r.conversionCharge === 49.95],
  ['Yarn cost/mtr = total ÷ 110', r.yarnCostPerMtr === round2(r.totalYarnAmount / 110)],
  ['Subtotal = yarn + weaving', r.subtotalPerMtr === round2(r.yarnCostPerMtr + r.conversionCharge)],
  ['Final = subtotal when MU/GST 0', r.finalCostPerMtr === r.subtotalPerMtr],
]

// Rate change check
const r2 = computeBuildup(warps, wefts, 110, 0.5, 0, 0)
checks.push(['Rate 0.50 → charge 55.50', r2.conversionCharge === 55.5])

// MU / GST
const r3 = computeBuildup(warps, wefts, 110, 0.45, 5, 5)
const expectedAfterMu = round2(r.subtotalPerMtr * 1.05)
const expectedFinal = round2(expectedAfterMu * 1.05)
checks.push(['After MU ≈ subtotal × 1.05', Math.abs(r3.afterMuPerMtr - expectedAfterMu) < 0.02])
checks.push(['Final ≈ after MU × 1.05', Math.abs(r3.finalCostPerMtr - expectedFinal) < 0.02])

// GST matrix — Jfg1872-style chain (yarn ₹4713.86 / 110 mtr, PIC 56, MU 5%)
function chainFromYarnTotals(totalYarnAmount, designLength, totalPic, picRate, muPercent, gstPercent) {
  const yarnCostPerMtr = round2(totalYarnAmount / designLength)
  const conversionCharge = round2(totalPic * picRate)
  const subtotalPerMtr = round2(yarnCostPerMtr + conversionCharge)
  const muAmount = round2(subtotalPerMtr * (muPercent / 100))
  const afterMuPerMtr = round2(subtotalPerMtr + muAmount)
  const gst = n(gstPercent)
  const gstAmount = gst > 0 ? round2(afterMuPerMtr * (gst / 100)) : 0
  const finalCostPerMtr = gst > 0 ? round2(afterMuPerMtr + gstAmount) : afterMuPerMtr
  return { yarnCostPerMtr, conversionCharge, subtotalPerMtr, afterMuPerMtr, gstAmount, finalCostPerMtr }
}

const jfg = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 0)
checks.push(['Jfg1872 yarn cost/mtr = 42.85', jfg.yarnCostPerMtr === 42.85])
checks.push(['Jfg1872 weaving = 25.20', jfg.conversionCharge === 25.2])
checks.push(['Jfg1872 subtotal = 68.05', jfg.subtotalPerMtr === 68.05])
checks.push(['Jfg1872 after MU = 71.45', jfg.afterMuPerMtr === 71.45])
checks.push(['GST 0% → amount 0', jfg.gstAmount === 0])
checks.push(['GST 0% → final = after MU', jfg.finalCostPerMtr === jfg.afterMuPerMtr])

const jfg5 = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 5)
checks.push(['GST 5% → amount 3.57', jfg5.gstAmount === 3.57])
checks.push(['GST 5% → final 75.02', jfg5.finalCostPerMtr === 75.02])

const jfg12 = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 12)
checks.push(['GST 12% → amount 8.57', jfg12.gstAmount === 8.57])
checks.push(['GST 12% → final 80.02', jfg12.finalCostPerMtr === 80.02])

// GST label helpers (mirror designWiseCosting.ts)
function isGstApplied(gstPercent) {
  return n(gstPercent) > 0
}
function finalCostLabel(gstPercent) {
  return isGstApplied(gstPercent) ? 'Final Cost Including GST' : 'Final Cost — Excl. GST'
}
checks.push(['Label GST 0% excludes GST', finalCostLabel(0) === 'Final Cost — Excl. GST'])
checks.push(['Label GST 5% includes GST', finalCostLabel(5) === 'Final Cost Including GST'])
checks.push(['Label GST 12% includes GST', finalCostLabel(12) === 'Final Cost Including GST'])

// GST toggle: 5 → 0
const toggled = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 0)
checks.push(['GST 5→0: final drops to after MU', toggled.finalCostPerMtr === 71.45 && toggled.gstAmount === 0])

// Div by zero guard
const r0 = computeBuildup(warps, wefts, 0, 0.45, 0, 0)
checks.push(['Design length 0 → yarn cost 0', r0.yarnCostPerMtr === 0])

let failed = 0
console.log('Design Wise Costing — calculation smoke test\n')
console.log(JSON.stringify(r, null, 2))
console.log('')
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed += 1
}
console.log('')
if (failed) {
  console.error(`${failed} check(s) failed`)
  process.exit(1)
}
console.log('All checks passed')
