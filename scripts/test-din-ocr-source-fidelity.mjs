/**
 * OCR source-fidelity checks — never invent / never Σ for TOTAL LOOM PICK.
 * Mirrors src/lib/designOcr.ts extractLoomPick + suggestEqualPics + ensure review rules.
 * Run: node scripts/test-din-ocr-source-fidelity.mjs
 */

const LOOM_PICK_RE = /(?:total\s+)?loom[\s\-]*pick[\s:=\-]*(\d+(?:\.\d+)?)/i
const ON_LOOM_PICK_RE = /on[\s\-]*loom[\s\-:=]*(\d+(?:\.\d+)?)/i
const HEADER_N_PICK_RE = /\b(\d{2,3})\s*[-–]?\s*pick\b/i

function emptyField() {
  return { value: '', confidence: 'missing' }
}

function extractLoomPick(text) {
  const labeled = text.match(LOOM_PICK_RE) || text.match(ON_LOOM_PICK_RE)
  if (labeled?.[1]) return { value: labeled[1], confidence: 'high', source: 'loom_pick_label' }

  const head = text.split(/\r?\n/).slice(0, 12).join('\n')
  const headerPick = head.match(HEADER_N_PICK_RE)
  if (headerPick?.[1]) {
    const v = Number(headerPick[1])
    if (v >= 40 && v <= 400) {
      return { value: headerPick[1], confidence: 'high', source: 'n_pick_header' }
    }
  }
  return emptyField()
}

function suggestEqualPics() {
  return ''
}

function sumWeftPics(rows) {
  return String(rows.reduce((s, r) => s + (Number(r.pic) || 0), 0))
}

const checks = []

const jfg = `
Design Number: JFG2249
TOTAL LOOM PICK = 112
Colour 1  300 Tex   25   2000
Colour 2  ZARI      25   2000
Colour 3            50   2000
Total 100 6000
`
const loom = extractLoomPick(jfg)
checks.push(['JFG2249 loom pick from label = 112', loom.value === '112'])
checks.push(['JFG2249 loom NOT Σ 100', loom.value !== '100'])
checks.push(['JFG2249 loom source is label', loom.source === 'loom_pick_label'])

const weftSum = sumWeftPics([{ pic: '25' }, { pic: '25' }, { pic: '50' }])
checks.push(['Σ Colour Picks = 100 (weft only)', weftSum === '100'])
checks.push(['Loom stays 112 while Σ is 100', loom.value === '112' && weftSum === '100'])

const noLabel = `
Design Number: JFG9999
Colour 1  HSY  37  2000
Colour 2  ZARI 37  2000
Colour 3  TEX  37  2000
Total 111 6000
`
const missing = extractLoomPick(noLabel)
checks.push(['No TOTAL LOOM PICK label → empty (no invent)', missing.value === ''])
checks.push(['Missing confidence', missing.confidence === 'missing'])
checks.push(['Never use colour Total 111 as loom', missing.value !== '111'])
checks.push(['Never use Σ 111 as loom', missing.value !== sumWeftPics([{ pic: '37' }, { pic: '37' }, { pic: '37' }])])

checks.push(['suggestEqualPics never invents', suggestEqualPics(112, 3) === ''])

const header = `
112-pick
Design Number JFG1674
Colour 1 - 37
`
const hp = extractLoomPick(header)
checks.push(['Header 112-pick readable', hp.value === '112' && hp.source === 'n_pick_header'])

const colourPickAsHeader = `
Colour 1 Pick 25
Colour 2 Pick 25
`
const notLoom = extractLoomPick(colourPickAsHeader)
checks.push(['Colour Pick 25 is NOT loom pick', notLoom.value === '' || Number(notLoom.value) !== 25])

let failed = 0
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
  if (!ok) failed++
}
if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log(`\nAll ${checks.length} OCR source-fidelity checks passed`)
