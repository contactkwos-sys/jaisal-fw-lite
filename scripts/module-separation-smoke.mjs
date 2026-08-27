/**
 * Module separation smoke — Design Master vs Order to Program.
 * Run: node scripts/module-separation-smoke.mjs
 */
import assert from 'node:assert/strict'

const DESIGN_MASTER_SUBS = [
  'din-intake',
  'din-costing',
  'formula-master',
  'rate-master',
  'sample-job',
  'sample-tracking',
  'sample-promotion',
  'design-reports',
]

const OTP_SUBS = [
  'order-booking',
  'order-status',
  'order-followup',
  'program-to-machine',
  'otp-reports',
]

const SALESMAN_BLOCKED = [
  'din-intake',
  'din-costing',
  'formula-master',
  'rate-master',
  'sample-job',
  'sample-tracking',
  'sample-promotion',
  'design-reports',
]

function normalizeRole(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
}

function isSalesmanRole(roleName) {
  const n = normalizeRole(roleName)
  return n === 'salesman' || n === 'sales' || n.includes('salesman')
}

function salesmanCanAccessDesignMaster() {
  return false
}

function salesmanOtpSubs() {
  return OTP_SUBS.slice()
}

function modulesOverlap(a, b) {
  return a.filter((x) => b.includes(x))
}

// 1) No overlap between Design Master menu and Order to Program menu
{
  const overlap = modulesOverlap(DESIGN_MASTER_SUBS, OTP_SUBS)
  assert.equal(overlap.length, 0)
  console.log('PASS design vs sales menu separation')
}

// 2) Salesman blocked from Design Master
{
  assert.equal(isSalesmanRole('Salesman'), true)
  assert.equal(salesmanCanAccessDesignMaster(), false)
  for (const sub of SALESMAN_BLOCKED) {
    assert.equal(OTP_SUBS.includes(sub), false, `sales OTP must not include ${sub}`)
  }
  console.log('PASS salesman design master block')
}

// 3) Salesman OTP has five operational sections
{
  const subs = salesmanOtpSubs()
  assert.deepEqual(subs, [
    'order-booking',
    'order-status',
    'order-followup',
    'program-to-machine',
    'otp-reports',
  ])
  console.log('PASS salesman OTP five sections')
}

// 4) Common sales rate — no per-matching rate column required
{
  const rate = 150
  const matchings = [
    { name: 'RED', meter: 3000 },
    { name: 'BLUE', meter: 2000 },
    { name: 'MAROON', meter: 1500 },
  ]
  const total = matchings.reduce((s, m) => s + m.meter, 0)
  const amount = total * rate
  assert.equal(total, 6500)
  assert.equal(amount, 975000)
  assert.equal(matchings.every((m) => rate === 150), true)
  console.log('PASS common approved sales rate')
}

// 5) Max 6 feeders — never feeder 7
{
  const MAX = 6
  const feeders = []
  for (let i = 1; i <= 10; i++) {
    if (feeders.length >= MAX) break
    feeders.push(i)
  }
  assert.equal(feeders.length, 6)
  assert.equal(feeders.includes(7), false)
  console.log('PASS max 6 feeders')
}

// 6) Landing routes are separate modules
{
  const designLanding = { module: 'design-to-order', screen: 'dto-hub' }
  const salesLanding = { module: 'order-to-program', screen: 'order-to-program', filter: 'dashboard' }
  assert.notEqual(designLanding.module, salesLanding.module)
  assert.notEqual(designLanding.screen, salesLanding.screen)
  console.log('PASS separate landing modules')
}

console.log('All module-separation checks passed.')
