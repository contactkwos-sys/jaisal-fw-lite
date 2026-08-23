/**
 * Smoke-test DIN Costing calculation chain (Jacquard Repair Design / JFG1558).
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

function computeWastageParams(enteredLengthMtr, wastageMtr = 10, wastagePercent = 10) {
  const entered = n(enteredLengthMtr)
  const wastage = n(wastageMtr)
  const usable = Math.max(entered - wastage, 0)
  const multiplier = usable > 0 ? round2(entered / usable) : 0
  return { enteredLengthMtr: entered, wastageMtr: wastage, wastagePercent, usableLengthMtr: usable, conversionMultiplier: multiplier }
}

function computeBuildup(warps, wefts, enteredLengthMtr, picConversionRate, muPercent, gstPercent, wastageMtr = 10, wastagePercent = 10) {
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
  const wastage = computeWastageParams(enteredLengthMtr, wastageMtr, wastagePercent)
  const length = wastage.enteredLengthMtr
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

function computeProfitProjection(finalCostPerMtr, fixedCostPerMtr, desiredProfitPerMtr, ceoFinalSellingRate, productionMeters) {
  const cost = n(finalCostPerMtr)
  const selling = n(ceoFinalSellingRate)
  const prod = n(productionMeters)
  const profitPerMtr = round2(selling - cost)
  const totalProfit = round2(profitPerMtr * prod)
  return { profitPerMtr, totalProfit }
}

function chainFromYarnTotals(totalYarnAmount, enteredLength, totalPic, picRate, muPercent, gstPercent, wastageMtr = 10) {
  const usable = Math.max(n(enteredLength) - n(wastageMtr), 0)
  const yarnCostPerMtr = usable > 0 ? round2(totalYarnAmount / usable) : 0
  const conversionCharge = round2(totalPic * picRate)
  const subtotalPerMtr = round2(yarnCostPerMtr + conversionCharge)
  const muAmount = round2(subtotalPerMtr * (muPercent / 100))
  const afterMuPerMtr = round2(subtotalPerMtr + muAmount)
  const gst = n(gstPercent)
  const gstAmount = gst > 0 ? round2(afterMuPerMtr * (gst / 100)) : 0
  const finalCostPerMtr = gst > 0 ? round2(afterMuPerMtr + gstAmount) : afterMuPerMtr
  return { yarnCostPerMtr, conversionCharge, subtotalPerMtr, afterMuPerMtr, gstAmount, finalCostPerMtr }
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
  ['Yarn cost/mtr = total ÷ usable 100', r.yarnCostPerMtr === round2(r.totalYarnAmount / 100)],
  ['Subtotal = yarn + weaving', r.subtotalPerMtr === round2(r.yarnCostPerMtr + r.conversionCharge)],
  ['Final = subtotal when MU/GST 0', r.finalCostPerMtr === r.subtotalPerMtr],
  ['Usable length = 100', r.usableLengthMtr === 100],
  ['Conversion multiplier = 1.10', r.conversionMultiplier === 1.1],
]

const r2 = computeBuildup(warps, wefts, 110, 0.5, 0, 0)
checks.push(['Rate 0.50 → charge 55.50', r2.conversionCharge === 55.5])

const r3 = computeBuildup(warps, wefts, 110, 0.45, 5, 5)
const expectedAfterMu = round2(r.subtotalPerMtr * 1.05)
const expectedFinal = round2(expectedAfterMu * 1.05)
checks.push(['After MU ≈ subtotal × 1.05', Math.abs(r3.afterMuPerMtr - expectedAfterMu) < 0.02])
checks.push(['Final ≈ after MU × 1.05', Math.abs(r3.finalCostPerMtr - expectedFinal) < 0.02])

// JFG1558 acceptance — yarn on 110 mtr, per-meter on 100 mtr usable basis
const jfg1558Chain = chainFromYarnTotals(5679.73, 110, 111, 0.45, 5, 5)
const jfg1558Wastage = computeWastageParams(110, 10, 10)
checks.push(['JFG1558 total PIC = 111', jfg1558Chain.conversionCharge === 49.95])
checks.push(['JFG1558 yarn cost/mtr ≈ 56.80', Math.abs(jfg1558Chain.yarnCostPerMtr - 56.8) < 0.02])
checks.push(['JFG1558 subtotal ≈ 106.75', Math.abs(jfg1558Chain.subtotalPerMtr - 106.75) < 0.02])
checks.push(['JFG1558 after MU ≈ 112.09', Math.abs(jfg1558Chain.afterMuPerMtr - 112.09) < 0.02])
checks.push(['JFG1558 GST ≈ 5.60', Math.abs(jfg1558Chain.gstAmount - 5.6) < 0.02])
checks.push(['JFG1558 calculated final ≈ 117.69', Math.abs(jfg1558Chain.finalCostPerMtr - 117.69) < 0.05])
checks.push(['JFG1558 usable length = 100', jfg1558Wastage.usableLengthMtr === 100])
checks.push(['JFG1558 conversion multiplier = 1.10', jfg1558Wastage.conversionMultiplier === 1.1])

// CEO selling rate separate from calculated cost
const profit = computeProfitProjection(jfg1558Chain.finalCostPerMtr, 0, 0, 112, 400)
checks.push(['CEO profit/mtr at rate 112', profit.profitPerMtr === round2(112 - jfg1558Chain.finalCostPerMtr)])
checks.push(['Total profit at 400 mtr', profit.totalProfit === round2(profit.profitPerMtr * 400)])

const jfg = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 0)
checks.push(['Jfg1872 yarn cost/mtr = 47.14', jfg.yarnCostPerMtr === 47.14])
checks.push(['Jfg1872 weaving = 25.20', jfg.conversionCharge === 25.2])
checks.push(['Jfg1872 subtotal = 72.34', jfg.subtotalPerMtr === 72.34])
checks.push(['Jfg1872 after MU = 75.96', jfg.afterMuPerMtr === 75.96])
checks.push(['GST 0% → amount 0', jfg.gstAmount === 0])
checks.push(['GST 0% → final = after MU', jfg.finalCostPerMtr === jfg.afterMuPerMtr])

const jfg5 = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 5)
checks.push(['GST 5% → amount 3.80', jfg5.gstAmount === 3.8])
checks.push(['GST 5% → final 79.76', jfg5.finalCostPerMtr === 79.76])

const jfg12 = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 12)
checks.push(['GST 12% → amount 9.12', jfg12.gstAmount === 9.12])
checks.push(['GST 12% → final 85.08', jfg12.finalCostPerMtr === 85.08])

function isGstApplied(gstPercent) {
  return n(gstPercent) > 0
}
function finalCostLabel(gstPercent) {
  return isGstApplied(gstPercent) ? 'Final Cost Including GST' : 'Final Cost — Excl. GST'
}
checks.push(['Label GST 0% excludes GST', finalCostLabel(0) === 'Final Cost — Excl. GST'])
checks.push(['Label GST 5% includes GST', finalCostLabel(5) === 'Final Cost Including GST'])

const toggled = chainFromYarnTotals(4713.86, 110, 56, 0.45, 5, 0)
checks.push(['GST 5→0: final drops to after MU', toggled.finalCostPerMtr === 75.96 && toggled.gstAmount === 0])

// Jfg1872 screenshot case — yarn ₹4750.58 on 110 mtr, per mtr on 100 mtr basis
const jfg1872Live = chainFromYarnTotals(4750.58, 110, 56, 0.31, 0, 0)
checks.push(['Jfg1872 live yarn cost/mtr = 47.51', jfg1872Live.yarnCostPerMtr === 47.51])
checks.push(['Jfg1872 live weaving = 17.36', jfg1872Live.conversionCharge === 17.36])
checks.push(['Jfg1872 live subtotal = 64.87', jfg1872Live.subtotalPerMtr === 64.87])

const r0 = computeBuildup(warps, wefts, 0, 0.45, 0, 0)
checks.push(['Design length 0 → yarn cost 0', r0.yarnCostPerMtr === 0])

let failed = 0
console.log('DIN Costing — calculation smoke test\n')
console.log(JSON.stringify(jfg1558Chain, null, 2))
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
