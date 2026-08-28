/**
 * Shared design identity helpers (pure) — no DB.
 * Run: node scripts/test-design-identity.mjs
 */

function normalizeDesignNumber(value) {
  return value.trim()
}

function designNumberKey(value) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function isBusinessDesignNumber(value) {
  const v = designNumberKey(value)
  return /^[A-Z]{2,5}\d{3,6}$/.test(v)
}

const checks = []
checks.push(['trim only', normalizeDesignNumber('  JFG2249  ') === 'JFG2249'])
checks.push(['preserve exact', normalizeDesignNumber('JFG2249') === 'JFG2249'])
checks.push(['key ignore case/space', designNumberKey('jfg 2249') === 'JFG2249'])
checks.push(['JFG2249 is business', isBusinessDesignNumber('JFG2249')])
checks.push(['JFG2248 is business', isBusinessDesignNumber('JFG2248')])
checks.push(['DIN-2026-001 not business JFG-style', !isBusinessDesignNumber('DIN-2026-001')])
checks.push(['empty rejected', !isBusinessDesignNumber('')])

let failed = 0
console.log('Design identity helper tests\n')
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed += 1
}
if (failed) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('\nAll identity checks passed')
