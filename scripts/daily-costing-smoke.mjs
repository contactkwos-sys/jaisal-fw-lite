/**
 * Pure helper smoke checks for Daily Costing aggregate math.
 * No Supabase calls — verifies period roll-up and INR formatting contracts.
 */
import assert from 'node:assert/strict'

function inr(v) {
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function monthStart(date) {
  return `${date.slice(0, 7)}-01`
}

function eachDate(from, to) {
  const out = []
  const d = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

assert.equal(monthStart('2026-08-21'), '2026-08-01')
assert.deepEqual(eachDate('2026-08-01', '2026-08-03'), ['2026-08-01', '2026-08-02', '2026-08-03'])

const days = [
  { productionMeters: 100, dispatchMeters: 80, revenue: 10000, totalCost: 7000, netProfit: 3000 },
  { productionMeters: 50, dispatchMeters: 40, revenue: 5000, totalCost: 4000, netProfit: 1000 },
]
const mtd = {
  productionMeters: days.reduce((s, d) => s + d.productionMeters, 0),
  dispatchMeters: days.reduce((s, d) => s + d.dispatchMeters, 0),
  revenue: days.reduce((s, d) => s + d.revenue, 0),
  totalCost: days.reduce((s, d) => s + d.totalCost, 0),
  netProfit: days.reduce((s, d) => s + d.netProfit, 0),
}
assert.equal(mtd.productionMeters, 150)
assert.equal(mtd.revenue, 15000)
assert.equal(mtd.netProfit, 4000)
assert.ok(inr(15000).includes('15'))

// Factory P&L identity: net = revenue - totalCost
for (const d of days) {
  assert.equal(d.netProfit, d.revenue - d.totalCost)
}

// Production share allocation
const factoryCost = 1000
const shares = [600, 400]
const alloc = shares.map((m) => factoryCost * (m / 1000))
assert.deepEqual(alloc, [600, 400])

console.log('daily-costing-smoke: OK')
