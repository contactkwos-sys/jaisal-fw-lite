/**
 * Verification: DIN Costing Section 1 — OCR upload + confirm auto-fills costing.
 * Design Intake page stays removed (single DIN Costing path).
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

// ── 2. Section 1: upload buttons + OCR confirm path ────────────────────────
const importSrc = read('src/components/dinCosting/DinDesignImportSection.tsx')

assert.ok(importSrc.includes('Upload from Photos'), 'must have Upload from Photos button')
assert.ok(importSrc.includes('Upload from File'), 'must have Upload from File button')
assert.ok(importSrc.includes('Take Photo'), 'must have Take Photo button')
assert.ok(importSrc.includes('capture="environment"'), 'Take Photo must use camera capture')
assert.ok(
  importSrc.includes('Drag & drop DIN sheet photo here'),
  'desktop drag-drop zone must remain',
)
assert.ok(/\breadDesignReference\b/.test(importSrc), 'must call readDesignReference for OCR')
assert.ok(/\bapplyOcrToCostingDraft\b/.test(importSrc), 'must call applyOcrToCostingDraft')
assert.ok(/\bonLiveSync\b/.test(importSrc), 'live OCR sync must be wired')
assert.ok(/Confirm/.test(importSrc), 'OCR Confirm button must exist')
assert.ok(/TOTAL LOOM PICK/.test(importSrc), 'must show TOTAL LOOM PICK field')
assert.ok(/printed on sheet|from DIN sheet|feeder PIC/.test(importSrc), 'loom pick must be labelled clearly')

console.log('PASS  Section 1 OCR upload + confirm path restored')

// ── 3. handleOcrApply auto-fills Design No. / wefts / loom pick ─────────────
const costingSrc = read('src/pages/DesignWiseCosting.tsx')
assert.ok(costingSrc.includes('handleOcrLiveSync'), 'handleOcrLiveSync must exist')
assert.ok(costingSrc.includes('onLiveSync='), 'onLiveSync prop must be passed')
assert.ok(costingSrc.includes('INTERNAL COST SUMMARY'), 'internal cost summary label')
assert.ok(costingSrc.includes('CUSTOMER PRICING'), 'customer pricing label')
assert.ok(costingSrc.includes('Internal Costing Basis: 110 Mtr'), '110 mtr basis label')
assert.ok(costingSrc.includes('Customer Selling Rate Basis: 100 Mtr'), '100 mtr basis label')
assert.ok(costingSrc.includes('Rate not found in Rate Master'), 'missing rate message')
assert.ok(costingSrc.includes('DEFAULT_TAR_ENDS'), 'default TAR constant used')
assert.ok(costingSrc.includes('finalInternalCost110'), 'final internal 110 field used')
assert.ok(costingSrc.includes('customerRatePerMtr'), 'customer rate field used')

const applyFn = costingSrc.match(
  /async function handleOcrApply\(payload: DinOcrApplyPayload\) \{[\s\S]*?\n  \}/,
)
assert.ok(applyFn, 'handleOcrApply must exist')
assert.ok(applyFn[0].includes('setDinNumber'), 'OCR apply must set Design No.')
assert.ok(applyFn[0].includes('setWefts'), 'OCR apply must set wefts')
assert.ok(applyFn[0].includes('setLoomPick'), 'OCR apply must set loom pick')

console.log('PASS  OCR confirm auto-fills costing + summary labels')

// ── 4. Core formula: Costing Denier = Base + 10; customer = internal ÷ 100 ──
const formulaSrc = read('src/lib/designWiseCosting.ts')
assert.ok(formulaSrc.includes('DEFAULT_TAR_ENDS = 8900'), 'default TAR 8900')
assert.ok(formulaSrc.includes('DENIER_COSTING_OFFSET = 10'), 'denier offset 10')
assert.ok(formulaSrc.includes('finalInternalCost110'), 'internal 110 total')
assert.ok(
  /finalInternalCost110\s*\/\s*customerBasis|finalInternalCost110 \/ customerBasis/.test(formulaSrc) ||
    formulaSrc.includes('finalInternalCost110 / customerBasis'),
  'customer rate divides internal 110 by 100 once',
)
assert.ok(!/yarnCostPerMtr \+ conversionCharge/.test(formulaSrc), 'must not mix per-mtr yarn + flat weave')

const ocrSrc = read('src/lib/designOcr.ts')
assert.ok(ocrSrc.includes('extractLoomPick'), 'must extract loom pick from sheet')
assert.ok(ocrSrc.includes('clearOcrStrings'), 'strings cleared / not used for costing')
assert.ok(ocrSrc.includes('OCR_VERIFY_HINT'), 'verify hint constant')
assert.ok(ocrSrc.includes('Needs Manual Verification'), 'low-confidence wording')
assert.ok(ocrSrc.includes('headerCrop'), 'header crop preprocess')
assert.ok(ocrSrc.includes('rowStrip'), 'row-strip cell OCR')
assert.ok(
  /suggestEqualPics[\s\S]*?return ''/.test(ocrSrc),
  'suggestEqualPics must not invent picks',
)
assert.ok(
  ocrSrc.includes('ensureLoomPickFromFeederSum'),
  'must resolve loom pick vs feeder PIC sum with verify warning',
)
assert.ok(
  ocrSrc.includes('sum_feeder_pic_suggest'),
  'may suggest Σ feeder PIC at low confidence when printed total missing',
)
assert.ok(!/\bTRN\b/.test(ocrSrc), 'no TRN in OCR')
assert.ok(!/\bTRN\b/.test(formulaSrc), 'no TRN in costing formulas')
assert.ok(!/\bTRN\b/.test(costingSrc), 'no TRN in DIN Costing UI')

assert.ok(formulaSrc.includes('computeProductionSpeed'), 'production speed helper')
assert.ok(formulaSrc.includes('DEFAULT_MACHINE_SPEED_RPM = 450'), 'default RPM 450')
assert.ok(costingSrc.includes('Production / Weaving Speed'), 'production UI section')
assert.ok(costingSrc.includes('Quality Master') || costingSrc.includes('quality-master'), 'Quality Master wired')
assert.ok(costingSrc.includes('dwc-quality-master'), 'Quality Master dropdown')

const importSrc2 = read('src/components/dinCosting/DinDesignImportSection.tsx')
assert.ok(
  !/autoApplyAfterRead/.test(importSrc2),
  'must not auto-Confirm OCR without user review',
)
assert.ok(importSrc2.includes('OCR_VERIFY_HINT'), 'UI shows verify hint')
assert.ok(
  /printed on sheet|feeder PIC|from DIN sheet/.test(importSrc2),
  'loom pick label clarity',
)

console.log('PASS  Denier + 110/100 formula + loom pick verify + no TRN + production')
console.log('\nAll DIN Costing formula/OCR layout checks passed')
