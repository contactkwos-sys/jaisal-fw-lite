/**
 * Unit smoke for filled pipe godown helpers (pure logic, no Supabase).
 */
import assert from 'node:assert/strict'

function calcTotalMeter(meter, multiplier) {
  const m = Number(meter) || 0
  const mult = Number(multiplier) || 0
  return Math.round(m * mult * 1000) / 1000
}

function calcAmount(weightKg, ratePerKg) {
  return Math.round(Number(weightKg || 0) * Number(ratePerKg || 0) * 100) / 100
}

function composeGodownLocation(godown, rack, bay) {
  const parts = [godown, rack, bay].map((p) => p.trim()).filter(Boolean)
  return parts.length ? parts.join(' / ') : 'Godown'
}

function canIssuePipe(pipe, issueMeter) {
  if (pipe.status === 'CONSUMED' || Number(pipe.balance_meter) <= 0) return false
  if (pipe.status !== 'FILLED_GODOWN') return false
  return issueMeter > 0 && issueMeter <= Number(pipe.balance_meter)
}

function pipeStockLabel(pipe) {
  if (pipe.status === 'FILLED_GODOWN') {
    if (Number(pipe.used_meter) > 0 && Number(pipe.balance_meter) > 0) return 'Partial'
    if (Number(pipe.balance_meter) <= 0) return 'Consumed'
    return 'Filled'
  }
  return pipe.status
}

function testCalcTotalMeter() {
  assert.equal(calcTotalMeter(1000, 2), 2000)
  assert.equal(calcTotalMeter(500, 3), 1500)
}

function testCalcAmount() {
  assert.equal(calcAmount(18.5, 160), 2960)
}

function testComposeLocation() {
  assert.equal(composeGodownLocation('Godown A', 'Rack 02', ''), 'Godown A / Rack 02')
}

function testCanIssuePipe() {
  const pipe = { status: 'FILLED_GODOWN', balance_meter: 2000, used_meter: 0 }
  assert.equal(canIssuePipe(pipe, 500), true)
  assert.equal(canIssuePipe(pipe, 2500), false)
  assert.equal(canIssuePipe({ ...pipe, status: 'CONSUMED' }, 100), false)
}

function testPartialIssueBalances() {
  const total = calcTotalMeter(1000, 2)
  assert.equal(total, 2000)
  const used = 500
  const balance = total - used
  assert.equal(balance, 1500)
  assert.equal(balance + 200, 1700)
  assert.equal(used - 200, 300)
}

function testPipeStockLabel() {
  assert.equal(pipeStockLabel({ status: 'FILLED_GODOWN', used_meter: 500, balance_meter: 1500 }), 'Partial')
}

let failed = 0
for (const [name, fn] of [
  ['calcTotalMeter', testCalcTotalMeter],
  ['calcAmount', testCalcAmount],
  ['composeLocation', testComposeLocation],
  ['canIssuePipe', testCanIssuePipe],
  ['partialIssueBalances', testPartialIssueBalances],
  ['pipeStockLabel', testPipeStockLabel],
]) {
  try {
    fn()
    console.log('PASS', name)
  } catch (e) {
    failed++
    console.error('FAIL', name, e)
  }
}

if (failed) process.exit(1)
console.log('All filled pipe godown helper tests passed')
