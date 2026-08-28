/**
 * DIN Costing deep-audit helper checks (no DB).
 * Run: node scripts/test-din-costing-identity.mjs
 */

function resolveNumericDenier(denier, itemName) {
  const d = (denier || '').trim()
  if (d && d.toLowerCase() !== 'same') return d
  const m = String(itemName || '')
    .trim()
    .match(/^(\d+(?:\.\d+)?)/)
  return m ? m[1] : ''
}

function isBlankYarnName(name) {
  const v = (name || '').trim()
  return !v || v === '-' || v === '—' || v === '–' || v === '.' || v === '_'
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

assert(resolveNumericDenier('Same', '440 HSY') === '440', 'Same → 440 from HSY name')
assert(resolveNumericDenier('Same', '550 HSY') === '550', 'Same → 550')
assert(resolveNumericDenier('310', '300 Tex') === '310', 'Explicit denier kept')
assert(resolveNumericDenier('', 'Marble') === '', 'No digits → empty')
assert(isBlankYarnName('-') && isBlankYarnName(''), 'Blank yarn helpers')
assert(!isBlankYarnName('ZARI'), 'ZARI is not blank')

/** forceNewRevision only when Create New Revision — otherwise update same draft */
function shouldForceNew(payload, savedId) {
  if (payload.forceNewRevision) return true
  return false
}
assert(shouldForceNew({ forceNewRevision: true }, 'abc') === true, 'Revision forces new')
assert(shouldForceNew({ forceNewRevision: false }, null) === false, 'First confirm does not force when no dup')
assert(shouldForceNew({}, 'existing-id') === false, 'Re-confirm updates same draft')

console.log('✓ DIN costing identity / denier / forceNew helpers passed')
