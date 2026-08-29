/**
 * Unit checks for Design No. series helpers (mirrors src/lib/designNoSeries.ts).
 * Run: node scripts/test-design-no-series.mjs
 */
import assert from 'node:assert/strict'

const PREFIX_NUM_RE = /^([A-Za-z]{1,8})(\d{1,8})$/

function uniqueDesignNosFromCostings(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const din = String(row.din_number || '')
      .trim()
      .toUpperCase()
    if (!din || seen.has(din)) continue
    seen.add(din)
    out.push({
      dinNumber: din,
      qualityName: String(row.quality_name || '').trim(),
      latestAt: String(row.updated_at || row.created_at || ''),
      costingId: row.id,
      status: row.status === 'final' ? 'final' : 'draft',
    })
  }
  return out
}

function sortDesignNosBySeries(list) {
  return [...list].sort((a, b) => {
    const ma = a.dinNumber.match(PREFIX_NUM_RE)
    const mb = b.dinNumber.match(PREFIX_NUM_RE)
    if (ma && mb) {
      const pref = ma[1].toUpperCase().localeCompare(mb[1].toUpperCase())
      if (pref !== 0) return pref
      return Number(ma[2]) - Number(mb[2])
    }
    if (ma && !mb) return -1
    if (!ma && mb) return 1
    return a.dinNumber.localeCompare(b.dinNumber)
  })
}

function suggestNextDesignNo(rows) {
  const byPrefix = new Map()
  for (const row of rows) {
    const m = row.dinNumber.match(PREFIX_NUM_RE)
    if (!m) continue
    const prefix = m[1].toUpperCase()
    const num = Number(m[2])
    const prev = byPrefix.get(prefix)
    if (prev == null || num > prev) byPrefix.set(prefix, num)
  }
  if (!byPrefix.size) return null
  let bestPrefix = ''
  let bestNum = -1
  for (const row of rows) {
    const m = row.dinNumber.match(PREFIX_NUM_RE)
    if (!m) continue
    bestPrefix = m[1].toUpperCase()
    bestNum = byPrefix.get(bestPrefix) ?? Number(m[2])
    break
  }
  if (!bestPrefix || bestNum < 0) {
    const [prefix, num] = [...byPrefix.entries()][0]
    bestPrefix = prefix
    bestNum = num
  }
  const width = String(bestNum).length
  return `${bestPrefix}${String(bestNum + 1).padStart(width, '0')}`
}

const rows = [
  { id: '1', din_number: 'JFG2249', quality_name: 'A', updated_at: '2026-08-29', status: 'final' },
  { id: '2', din_number: 'jfg2247', quality_name: 'B', updated_at: '2026-08-28', status: 'draft' },
  { id: '3', din_number: 'JFG2249', quality_name: 'older', updated_at: '2026-08-01', status: 'draft' },
  { id: '4', din_number: 'ABC10', quality_name: '', updated_at: '2026-08-20', status: 'draft' },
]

const unique = uniqueDesignNosFromCostings(rows)
assert.equal(unique.length, 3)
assert.equal(unique[0].dinNumber, 'JFG2249')
assert.equal(unique[0].qualityName, 'A')
assert.equal(unique[1].dinNumber, 'JFG2247')

const sorted = sortDesignNosBySeries(unique)
assert.deepEqual(
  sorted.map((r) => r.dinNumber),
  ['ABC10', 'JFG2247', 'JFG2249'],
)

const next = suggestNextDesignNo(unique)
assert.equal(next, 'JFG2250', `expected JFG2250 got ${next}`)

console.log('PASS design-no-series helpers')
