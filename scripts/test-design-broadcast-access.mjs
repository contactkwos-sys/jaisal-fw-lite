/**
 * Regression: MD / short roles must keep Orders + Design Broadcast visible.
 * Run: node scripts/test-design-broadcast-access.mjs
 */
import assert from 'node:assert/strict'

const CEO_MODULES = [
  'dashboard',
  'production',
  'inventory',
  'cash-book',
  'orders',
  'reports',
  'maintenance',
  'masters',
  'security',
  'settings',
]
const ROLE_DEFAULTS = {
  ceo: CEO_MODULES,
  md: CEO_MODULES,
  'managing director': CEO_MODULES,
  owner: CEO_MODULES,
  manager: CEO_MODULES.filter((m) => m !== 'dashboard'),
  admin: ['cash-book', 'reports', 'masters', 'security', 'settings'],
  salesman: ['orders', 'masters', 'reports', 'cash-book'],
}

function normalizeRole(name) {
  return name.trim().toLowerCase()
}

function matchDefaultModules(roleName, defaults = ROLE_DEFAULTS) {
  const n = normalizeRole(roleName)
  if (!n) return ['production']
  if (defaults[n]) return defaults[n]
  for (const [key, mods] of Object.entries(defaults)) {
    if (n.length < 4 || key.length < 4) continue
    if (n.includes(key) || key.includes(n)) return mods
  }
  return ['production']
}

/** Pre-fix defaults: no md alias → MD fell through to production-only */
const OLD_DEFAULTS = {
  ceo: CEO_MODULES,
  manager: CEO_MODULES.filter((m) => m !== 'dashboard'),
  admin: ['cash-book', 'reports', 'masters', 'security', 'settings'],
  salesman: ['orders', 'masters', 'reports', 'cash-book'],
}

function oldMatch(roleName) {
  const n = normalizeRole(roleName)
  if (OLD_DEFAULTS[n]) return OLD_DEFAULTS[n]
  for (const [key, mods] of Object.entries(OLD_DEFAULTS)) {
    if (n.includes(key) || key.includes(n)) return mods
  }
  return ['production']
}

assert.equal(oldMatch('MD').includes('orders'), false, 'sanity: old MD had no Orders')
assert.equal(matchDefaultModules('MD').includes('orders'), true, 'MD keeps Orders / Design Broadcast')
assert.equal(matchDefaultModules('CEO').includes('orders'), true)
assert.equal(matchDefaultModules('Manager').includes('orders'), true)
assert.equal(matchDefaultModules('Salesman').includes('orders'), true)
assert.equal(matchDefaultModules('admin').includes('orders'), false)
assert.equal(matchDefaultModules('Operator').includes('orders'), false)

console.log('PASS  Design Broadcast access regressions')
