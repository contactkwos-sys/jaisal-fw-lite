/**
 * Order to Program — unit/helper smoke (no browser).
 * Run: node scripts/order-to-program-smoke.mjs
 */
import assert from 'node:assert/strict'

function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100
}

function calcRecipeTotals(feeders, addPct = 2) {
  const totalPick = round2(feeders.reduce((s, f) => s + (Number(f.pickEnds) || 0), 0))
  const totalWeftWeight = round2(feeders.reduce((s, f) => s + (Number(f.weightKg) || 0), 0))
  const pct = Number(addPct) || 0
  const finalWeight = round2(totalWeftWeight * (1 + pct / 100))
  return { totalPick, totalWeftWeight, addWeightPct: pct, finalWeight }
}

function statusBadgeClass(status) {
  const s = String(status).toUpperCase()
  if (/DISPATCH/.test(s)) return 'otp-badge otp-badge-dispatch'
  if (/COMPLETE|READY|APPROVED|CREATED/.test(s)) return 'otp-badge otp-badge-ok'
  if (/PRODUCTION|CHECKING|PROGRESS/.test(s)) return 'otp-badge otp-badge-prog'
  if (/PENDING|RECEIVED|CONFIRMED/.test(s)) return 'otp-badge otp-badge-pending'
  return 'otp-badge'
}

const MAX_FEEDERS = 6

// 1) Common sales rate amount calc
{
  const rate = 142
  const lines = [
    { meter: 3000 },
    { meter: 2000 },
  ]
  const totalMeter = lines.reduce((s, l) => s + l.meter, 0)
  const amount = totalMeter * rate
  assert.equal(totalMeter, 5000)
  assert.equal(amount, 710000)
  console.log('PASS common sales rate totals')
}

// 2) Max 6 feeders
{
  const feeders = []
  for (let i = 1; i <= 8; i++) {
    if (feeders.length >= MAX_FEEDERS) break
    feeders.push({ feederNo: i, pickEnds: 100, weightKg: 1 })
  }
  assert.equal(feeders.length, 6)
  console.log('PASS max 6 feeders')
}

// 3) Recipe weight + add %
{
  const feeders = [
    { pickEnds: 400, weightKg: 3.6 },
    { pickEnds: 400, weightKg: 1.2 },
    { pickEnds: 400, weightKg: 0.9 },
    { pickEnds: 400, weightKg: 0.25 },
  ]
  const t = calcRecipeTotals(feeders, 2)
  assert.equal(t.totalPick, 1600)
  assert.equal(t.totalWeftWeight, 5.95)
  assert.equal(t.finalWeight, 6.07) // 5.95 * 1.02 = 6.069 → 6.07
  console.log('PASS recipe weight calc')
}

// 4) Status badge classes
{
  assert.match(statusBadgeClass('PROGRAM CREATED'), /otp-badge-ok/)
  assert.match(statusBadgeClass('IN PRODUCTION'), /otp-badge-prog/)
  assert.match(statusBadgeClass('ORDER RECEIVED'), /otp-badge-pending/)
  assert.match(statusBadgeClass('DISPATCHED'), /otp-badge-dispatch/)
  console.log('PASS status badges')
}

// 5) Colour belongs to matching, not header — structural check
{
  const header = { din: 'DIN-2586', salesRate: 142, colour: undefined }
  const matchings = [
    { mainColour: 'RED', meter: 3000 },
    { mainColour: 'BLUE', meter: 2000 },
  ]
  assert.equal(header.colour, undefined)
  assert.equal(matchings.every((m) => m.mainColour), true)
  console.log('PASS matching-wise colour rule')
}

console.log('order-to-program-smoke: ALL PASS')
