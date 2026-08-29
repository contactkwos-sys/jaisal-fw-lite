/**
 * Smoke tests for DIN Costing local draft helpers (localStorage only).
 * Run: node scripts/test-din-local-draft.mjs
 */
import assert from 'node:assert/strict'

function hasMeaningfulDinDraft(draft) {
  if (!draft) return false
  if (String(draft.dinNumber || '').trim()) return true
  if (String(draft.qualityName || '').trim()) return true
  if (String(draft.loomPick || '').trim()) return true
  const warps = draft.warps || []
  const wefts = draft.wefts || []
  if (
    warps.some(
      (r) =>
        String(r.yarn_name || '').trim() ||
        String(r.base_denier || r.denier || '').trim() ||
        String(r.tar_ends || '').trim() ||
        String(r.rate_per_kg || '').trim(),
    )
  ) {
    return true
  }
  if (
    wefts.some(
      (r) =>
        String(r.weft_name || '').trim() ||
        String(r.feeder_label || '').trim() ||
        String(r.base_denier || r.denier || '').trim() ||
        String(r.pic || '').trim() ||
        String(r.rate_per_kg || '').trim(),
    )
  ) {
    return true
  }
  return false
}

assert.equal(hasMeaningfulDinDraft(null), false)
assert.equal(hasMeaningfulDinDraft({ dinNumber: '' }), false)
assert.equal(hasMeaningfulDinDraft({ dinNumber: 'JFG1' }), true)
assert.equal(hasMeaningfulDinDraft({ warps: [{ yarn_name: '300 Tex' }] }), true)
assert.equal(hasMeaningfulDinDraft({ wefts: [{ pic: '37' }] }), true)
assert.equal(hasMeaningfulDinDraft({ warps: [{ yarn_name: '' }], wefts: [{ pic: '' }] }), false)

console.log('PASS din local draft meaningful checks')
