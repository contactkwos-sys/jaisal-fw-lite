/**
 * Rate Master calculation & date-wise lookup tests.
 * Run: node scripts/test-rate-master.mjs
 */

function round2(v) {
  if (!Number.isFinite(v)) return 0
  return Math.round((v + Number.EPSILON) * 100) / 100
}

function calcEffectiveRate(basicRate, gstPercent, freightPerKg) {
  const basic = round2(basicRate)
  const gstAmount = round2(basic * (gstPercent / 100))
  const freight = round2(freightPerKg)
  const effectiveRate = round2(basic + gstAmount + freight)
  return { basicRate: basic, gstPercent, gstAmount, freightPerKg: freight, effectiveRate }
}

function normalizeItemName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function pickLatestRate(rates, category, itemName, asOfDate) {
  const itemNorm = normalizeItemName(itemName)
  const candidates = rates.filter(
    (r) => r.category === category && r.is_active && r.effective_from <= asOfDate && normalizeItemName(r.item_name) === itemNorm,
  )
  return candidates.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
}

const checks = []

// Mandatory 300 Tex case
const tex300 = calcEffectiveRate(195, 5, 2.25)
checks.push(['300 Tex GST = 9.75', tex300.gstAmount === 9.75])
checks.push(['300 Tex Effective = 207.00', tex300.effectiveRate === 207])

const tex300Future = calcEffectiveRate(200, 5, 2.25)
checks.push(['300 Tex future GST = 10.00', tex300Future.gstAmount === 10])
checks.push(['300 Tex future Effective = 212.25', tex300Future.effectiveRate === 212.25])

// Date-wise lookup
const rates = [
  {
    category: 'weft',
    item_name: '300 Tex',
    basic_rate: 195,
    gst_percent: 5,
    freight_per_kg: 2.25,
    effective_from: '2026-08-22',
    is_active: true,
  },
  {
    category: 'weft',
    item_name: '300 Tex',
    basic_rate: 200,
    gst_percent: 5,
    freight_per_kg: 2.25,
    effective_from: '2026-09-10',
    is_active: true,
  },
]

const aug = pickLatestRate(rates, 'weft', '300 Tex', '2026-08-25')
const sep = pickLatestRate(rates, 'weft', '300 Tex', '2026-09-15')
checks.push(['Design 25 Aug → rate 195', aug?.basic_rate === 195])
checks.push(['Design 15 Sep → rate 200', sep?.basic_rate === 200])

// GST 0% label logic
function gstLabel(gstPercent) {
  return `GST ${round2(gstPercent)}%`
}
checks.push(['GST 0% label', gstLabel(0) === 'GST 0%'])
checks.push(['GST 5% label', gstLabel(5) === 'GST 5%'])

let failed = 0
console.log('Rate Master — calculation smoke test\n')
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
