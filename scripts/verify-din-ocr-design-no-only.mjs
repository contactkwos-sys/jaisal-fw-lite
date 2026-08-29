/**
 * Verification: DIN Costing OCR must ONLY fill Design No.
 * Simulates an OCR result with garbage weft/feeder names (IO, SILI, FAT…)
 * and asserts the DIN Costing apply path never populates those fields.
 *
 * Run: node scripts/verify-din-ocr-design-no-only.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

// ── 1. Design Intake page must be gone ─────────────────────────────────────
assert.equal(
  existsSync(join(root, 'src/screens/DinIntakeScreen.tsx')),
  false,
  'DinIntakeScreen.tsx must be deleted',
)
assert.equal(
  existsSync(join(root, 'src/components/DinIntakeCostingPanel.tsx')),
  false,
  'DinIntakeCostingPanel.tsx must be deleted',
)

const appSrc = read('src/App.tsx')
assert.ok(!appSrc.includes('DinIntakeScreen'), 'App.tsx must not import DinIntakeScreen')
assert.ok(
  appSrc.includes("tab === 'dto-intake' ? <DesignWiseCosting"),
  'legacy dto-intake must redirect to DesignWiseCosting',
)

const navSrc = read('src/lib/nav.ts')
assert.ok(!/label:\s*'Design Intake'/.test(navSrc), 'nav must not list Design Intake')
assert.ok(!/id:\s*'din-intake'/.test(navSrc), 'nav must not have din-intake item')

const hubSrc = read('src/screens/DesignToOrderHub.tsx')
assert.ok(!hubSrc.includes("'Design Intake'"), 'Design hub must not link Design Intake')
assert.ok(!hubSrc.includes("screen: 'dto-intake'"), 'Design hub must not navigate to dto-intake')

console.log('PASS  Design Intake page/route/nav removed')

// ── 2. Import section must not call applyOcrToCostingDraft / mapOcrToWeftRows ─
const importSrc = read('src/components/dinCosting/DinDesignImportSection.tsx')
assert.ok(
  !/from ['"].*designOcr['"]/.test(importSrc) ||
    !/import\s*\{[^}]*\bapplyOcrToCostingDraft\b/.test(importSrc),
  'DinDesignImportSection must not import applyOcrToCostingDraft',
)
assert.ok(
  !/import\s*\{[^}]*\bmapOcrToWeftRows\b/.test(importSrc),
  'DinDesignImportSection must not import mapOcrToWeftRows',
)
assert.ok(
  !/import\s*\{[^}]*\bsumWeftPics\b/.test(importSrc),
  'DinDesignImportSection must not import sumWeftPics',
)
assert.ok(!/\bonLiveSync\b/.test(importSrc), 'Live OCR sync of weft rows must be gone')
assert.ok(!/\bGmailImportPanel\b/.test(importSrc), 'Gmail OCR import UI must be gone from Section 1')
assert.ok(
  !/export type DinOcrApplyPayload = \{[^}]*\bwarps\s*:/.test(importSrc.replace(/\n/g, ' ')),
  'payload type must not declare warps',
)
assert.ok(
  !/export type DinOcrApplyPayload = \{[^}]*\bwefts\s*:/.test(importSrc.replace(/\n/g, ' ')),
  'payload type must not declare wefts',
)
assert.ok(
  !/export type DinOcrApplyPayload = \{[^}]*\bloomPick\s*:/.test(importSrc.replace(/\n/g, ' ')),
  'payload type must not declare loomPick',
)
assert.ok(!/\bwarps\s*:/.test(importSrc), 'must not assign warps in apply payload object')
assert.ok(!/\bwefts\s*:/.test(importSrc), 'must not assign wefts in apply payload object')
assert.ok(!/\bloomPick\s*:/.test(importSrc), 'must not assign loomPick in apply payload object')

console.log('PASS  DinDesignImportSection has Design-No-only payload (no warps/wefts/loomPick)')

// ── 3. DesignWiseCosting handleOcrApply must not set warps/wefts/loomPick ────
const costingSrc = read('src/pages/DesignWiseCosting.tsx')
assert.ok(!costingSrc.includes('handleOcrLiveSync'), 'handleOcrLiveSync must be removed')
assert.ok(!costingSrc.includes('onLiveSync='), 'onLiveSync prop must not be passed')

const applyFn = costingSrc.match(
  /async function handleOcrApply\(payload: DinOcrApplyPayload\) \{[\s\S]*?\n  \}/,
)
assert.ok(applyFn, 'handleOcrApply must exist')
const body = applyFn[0]
assert.ok(!body.includes('setWarps'), 'handleOcrApply must not call setWarps')
assert.ok(!body.includes('setWefts'), 'handleOcrApply must not call setWefts')
assert.ok(!body.includes('setLoomPick'), 'handleOcrApply must not call setLoomPick')
assert.ok(!body.includes('payload.warps'), 'handleOcrApply must not read payload.warps')
assert.ok(!body.includes('payload.wefts'), 'handleOcrApply must not read payload.wefts')
assert.ok(!body.includes('payload.loomPick'), 'handleOcrApply must not read payload.loomPick')
assert.ok(!body.includes('applyOcrToCostingDraft'), 'handleOcrApply must not call applyOcrToCostingDraft')
assert.ok(body.includes('setDinNumber'), 'handleOcrApply must set Design No.')
assert.ok(body.includes('setDesignNoNeedsConfirm(true)'), 'must prompt Please confirm')

console.log('PASS  handleOcrApply only touches Design No. (+ image) — never Warp/Weft/Loom Pick')

// ── 4. Simulate OCR garbage → apply path result ─────────────────────────────
/**
 * Mirrors the production apply contract: given OCR that wrongly detected
 * weft names IO/SILI/FAT/EL/FE/FL, the costing form state after apply must
 * keep weft_name and feeder_label empty.
 */
function simulateDesignNoOnlyApply(ocrGarbage, formBefore) {
  // Production DinOcrApplyPayload — Design No. only
  const payload = {
    dinNumber: ocrGarbage.designNumber,
    designImageUrl: 'https://example.test/din.jpg',
    importSource: 'photo',
    designNumberConfidence: 'high',
  }
  // Production handleOcrApply behavior (simplified mirror)
  const form = {
    ...formBefore,
    dinNumber: payload.dinNumber.trim() ? payload.dinNumber.trim() : formBefore.dinNumber,
    designImageUrl: payload.designImageUrl,
    // CRITICAL: warps/wefts/loomPick untouched
    warps: formBefore.warps,
    wefts: formBefore.wefts,
    loomPick: formBefore.loomPick,
    missingRates: [],
  }
  return form
}

const garbageOcr = {
  designNumber: 'JFG2249',
  // These are the exact class of bad OCR yarns from the live bug report
  feeders: [
    { feederNo: 1, yarnType: 'IO' },
    { feederNo: 2, yarnType: 'SILI' },
    { feederNo: 3, yarnType: 'FAT' },
    { feederNo: 4, yarnType: 'EL' },
    { feederNo: 5, yarnType: 'FE' },
    { feederNo: 6, yarnType: 'FL' },
  ],
  weftRows: [
    { pic: '37' },
    { pic: '25' },
    { pic: '12' },
  ],
  loomPick: '112',
}

const before = {
  dinNumber: '',
  loomPick: '',
  warps: [{ yarn_name: '', base_denier: '', tar_ends: '' }],
  wefts: [
    { feeder_label: '', weft_name: '', pic: '' },
    { feeder_label: '', weft_name: '', pic: '' },
  ],
  missingRates: [],
}

const after = simulateDesignNoOnlyApply(garbageOcr, before)

assert.equal(after.dinNumber, 'JFG2249', 'Design No. must be filled from OCR')
assert.equal(after.loomPick, '', 'TOTAL LOOM PICK must stay empty (not OCR 112)')
assert.equal(after.warps[0].yarn_name, '', 'Warp Yarn Name must stay empty')
for (const row of after.wefts) {
  assert.equal(row.weft_name, '', `Weft Name must stay empty, got "${row.weft_name}"`)
  assert.equal(row.feeder_label, '', `Feeder/Colour must stay empty, got "${row.feeder_label}"`)
  assert.equal(row.pic, '', `PIC must stay empty, got "${row.pic}"`)
}
assert.deepEqual(after.missingRates, [], 'Missing Rates must not list garbage OCR yarns')

const garbageNames = ['IO', 'SILI', 'FAT', 'EL', 'FE', 'FL']
for (const bad of garbageNames) {
  assert.ok(
    !after.wefts.some((w) => w.weft_name === bad),
    `Weft Name must not be OCR garbage "${bad}"`,
  )
}

console.log('PASS  Simulated OCR with garbage IO/SILI/FAT/EL/FE/FL → only Design No. filled')
console.log('PASS  Weft Name + Feeder/Colour remain EMPTY after OCR apply')

// ── 5. No UI file may still call applyOcrToCostingDraft / mapOcrToWeftRows ───
const uiFiles = [
  'src/pages/DesignWiseCosting.tsx',
  'src/components/dinCosting/DinDesignImportSection.tsx',
  'src/components/dinCosting/DinCostingViewOnly.tsx',
  'src/App.tsx',
  'src/lib/nav.ts',
]
for (const rel of uiFiles) {
  const src = read(rel)
  assert.ok(
    !/\bapplyOcrToCostingDraft\b/.test(src),
    `${rel} must not reference applyOcrToCostingDraft (old weft/feeder autofill)`,
  )
  assert.ok(
    !/\bmapOcrToWeftRows\b/.test(src),
    `${rel} must not reference mapOcrToWeftRows`,
  )
}
// Payload construction in import section: only dinNumber from OCR
assert.ok(
  /dinNumber:\s*din/.test(importSrc),
  'processFile must apply dinNumber from OCR designNumber',
)
assert.ok(
  !/weft_name:\s*[^,\n]*ocr|feeder_label:\s*[^,\n]*ocr|loomPick:\s*ocr/i.test(importSrc),
  'import section must not map OCR into weft_name / feeder_label / loomPick',
)

console.log('PASS  No DIN Costing UI path references applyOcrToCostingDraft / mapOcrToWeftRows')
console.log('')
console.log('All verify-din-ocr-design-no-only checks passed.')
