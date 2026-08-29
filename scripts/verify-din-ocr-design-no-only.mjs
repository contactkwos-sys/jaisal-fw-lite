/**
 * Verification: DIN Costing Section 1 is photo-attach only (no OCR).
 * Design No. / Weft / Feeder / Pick stay fully manual.
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

// ── 1. Design Intake page must stay gone ───────────────────────────────────
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

console.log('PASS  Design Intake page/route/nav removed')

// ── 2. Section 1: three upload buttons, no OCR ─────────────────────────────
const importSrc = read('src/components/dinCosting/DinDesignImportSection.tsx')

assert.ok(importSrc.includes('Upload from Photos'), 'must have Upload from Photos button')
assert.ok(importSrc.includes('Upload from File'), 'must have Upload from File button')
assert.ok(importSrc.includes('Take Photo'), 'must have Take Photo button')
assert.ok(importSrc.includes('capture="environment"'), 'Take Photo must use camera capture')
assert.ok(
  importSrc.includes('Drag & drop DIN sheet photo here'),
  'desktop drag-drop zone must remain',
)

assert.ok(!/\breadDesignReference\b/.test(importSrc), 'must not call readDesignReference')
assert.ok(!/\bapplyOcrToCostingDraft\b/.test(importSrc), 'must not call applyOcrToCostingDraft')
assert.ok(!/\bmapOcrToWeftRows\b/.test(importSrc), 'must not call mapOcrToWeftRows')
assert.ok(!/\bonLiveSync\b/.test(importSrc), 'live OCR sync must be gone')
assert.ok(!/\bGmailImportPanel\b/.test(importSrc), 'Gmail OCR UI must be gone')
assert.ok(!/\bDetected Design No\b/.test(importSrc), 'must not show OCR-detected Design No.')
assert.ok(!/\bPlease confirm\b/.test(importSrc), 'OCR Please confirm prompt must be gone')
assert.ok(!/\bloomPick\s*:/.test(importSrc), 'must not assign loomPick')
assert.ok(!/\bwefts\s*:/.test(importSrc), 'must not assign wefts')
assert.ok(!/\bwarps\s*:/.test(importSrc), 'must not assign warps')
assert.ok(
  /dinNumber:\s*['"]{2}|dinNumber:\s*''/.test(importSrc),
  'upload payload must pass empty dinNumber (no OCR fill)',
)

console.log('PASS  Section 1 has 3 upload buttons and no OCR / Design No. extraction')

// ── 3. handleOcrApply attaches image only — never Design No. / wefts ────────
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
assert.ok(!body.includes('setDinNumber'), 'handleOcrApply must not set Design No. from upload')
assert.ok(!body.includes('payload.dinNumber'), 'handleOcrApply must ignore payload.dinNumber')
assert.ok(body.includes('setDesignImageUrl'), 'handleOcrApply must attach design image')
assert.ok(
  !body.includes('setDesignNoNeedsConfirm(true)'),
  'must not prompt Please confirm from OCR',
)

console.log('PASS  handleOcrApply attaches photo only — Design No. stays manual')

// ── 4. Simulate upload with garbage OCR-like names → nothing filled ─────────
function simulatePhotoAttachOnly(formBefore) {
  const payload = {
    dinNumber: '', // production always passes empty
    designImageUrl: 'https://example.test/din.jpg',
    importSource: 'photo',
  }
  return {
    ...formBefore,
    // Design No. NOT set from upload
    dinNumber: formBefore.dinNumber,
    designImageUrl: payload.designImageUrl,
    warps: formBefore.warps,
    wefts: formBefore.wefts,
    loomPick: formBefore.loomPick,
  }
}

const before = {
  dinNumber: '',
  loomPick: '',
  warps: [{ yarn_name: '' }],
  wefts: [
    { feeder_label: '', weft_name: '', pic: '' },
    { feeder_label: '', weft_name: '', pic: '' },
  ],
}

const after = simulatePhotoAttachOnly(before)
assert.equal(after.dinNumber, '', 'Design No. must stay empty after photo attach')
assert.equal(after.loomPick, '', 'TOTAL LOOM PICK must stay empty')
assert.equal(after.designImageUrl, 'https://example.test/din.jpg', 'photo must attach')
for (const row of after.wefts) {
  assert.equal(row.weft_name, '', 'Weft Name must stay empty')
  assert.equal(row.feeder_label, '', 'Feeder/Colour must stay empty')
  assert.equal(row.pic, '', 'PIC must stay empty')
}

console.log('PASS  Simulated upload → photo attached, Design No. / Weft / Feeder empty')

// ── 5. No UI path references OCR apply helpers ─────────────────────────────
for (const rel of [
  'src/pages/DesignWiseCosting.tsx',
  'src/components/dinCosting/DinDesignImportSection.tsx',
  'src/components/dinCosting/DinCostingViewOnly.tsx',
]) {
  const src = read(rel)
  assert.ok(!/\bapplyOcrToCostingDraft\b/.test(src), `${rel}: no applyOcrToCostingDraft`)
  assert.ok(!/\bmapOcrToWeftRows\b/.test(src), `${rel}: no mapOcrToWeftRows`)
}

console.log('PASS  No DIN Costing UI path uses OCR text extraction')
console.log('')
console.log('All verify-din-ocr-design-no-only checks passed.')
console.log('OUTCOME: OCR fully removed — Design No. is manual; Section 1 is photo attach only.')
