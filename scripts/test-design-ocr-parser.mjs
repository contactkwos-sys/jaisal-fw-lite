/**
 * Design OCR parser tests — Format A & B from spec.
 * Run: node scripts/test-design-ocr-parser.mjs
 */

const DESIGN_NO_RE = /\b([A-Z]{2,5}\d{3,6})\b/g
const LOOM_PICK_RE = /(?:loom[\s-]*pick|loom\s*pick)[\s:=-]*(\d+(?:\.\d+)?)/i
const PICK_ONLY_RE = /\b(\d+(?:\.\d+)?)\s*pick\b/i
const FEEDER_RE = /(?:feeder|fd)[\s.-]*(\d+)\s*[=:\-]?\s*([A-Z][A-Z0-9]{1,15})/gi
const PICK_STRINGS_HEADER = /pick\s*strings/i
const TOTAL_LINE_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s*[/\s]\s*(\d+(?:\.\d+)?)/im

function extractDesignNumbers(text) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(/\b([A-Z]{2,5}\d{3,6})\b/)
    if (m) return m[1]
  }
  return ''
}

function extractLoomPick(text) {
  const loom = text.match(LOOM_PICK_RE)
  if (loom?.[1]) return loom[1]
  const pickOnly = text.match(PICK_ONLY_RE)
  return pickOnly?.[1] || ''
}

function extractFeeders(text) {
  const feeders = []
  let m
  const re = new RegExp(FEEDER_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    feeders.push({ feederNo: Number(m[1]), yarnType: m[2].toUpperCase() })
  }
  return feeders.sort((a, b) => a.feederNo - b.feederNo)
}

function extractWeftPickRows(text) {
  const rows = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let inTable = false
  let afterTotal = false
  for (const line of lines) {
    if (PICK_STRINGS_HEADER.test(line)) { inTable = true; afterTotal = false; continue }
    if (/^total\s*[:.]?\s*(\d+(?:\.\d+)?)/i.test(line)) { inTable = false; afterTotal = true; continue }
    if (/^total\s*[:.]?\s*$/i.test(line)) { inTable = false; afterTotal = true; continue }
    if (afterTotal) {
      const totalPair = line.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)
      if (totalPair) { afterTotal = false; continue }
    }
    const pair = line.match(/^(\d+(?:\.\d+)?)\s*[/|,]\s*(\d+(?:\.\d+)?)\s*$/) ||
      line.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)
    if (pair && inTable) rows.push({ pic: pair[1], strings: pair[2] })
  }
  return rows
}

function extractTotals(text) {
  const inline = text.match(TOTAL_LINE_RE)
  if (inline) return { totalPick: inline[1], totalStrings: inline[2] }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (/^total\s*[:.]?\s*$/i.test(lines[i]) && lines[i + 1]) {
      const m = lines[i + 1].match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)
      if (m) return { totalPick: m[1], totalStrings: m[2] }
    }
  }
  return { totalPick: '', totalStrings: '' }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const formatA = `
JFG2248
56 Pick
Feeder-1 HSY
Feeder-2 TEX
315 / 315 Strings
`
assert(extractDesignNumbers(formatA) === 'JFG2248', 'Format A DIN')
assert(extractLoomPick(formatA) === '56', 'Format A loom pick')
const fA = extractFeeders(formatA)
assert(fA.length >= 2 && fA[0].yarnType === 'HSY', 'Format A feeders')

const formatB = `
JFG2249
Loom Pick 56
FD1 = HSY
FD2 = TEX
FD3 = MAX
Pick       Strings
28.00      2222
28.00      2222
1.89       150
Total:
57.89      4594
`
assert(extractDesignNumbers(formatB) === 'JFG2249', 'Format B DIN')
assert(extractLoomPick(formatB) === '56', 'Format B loom pick')
const fB = extractFeeders(formatB)
assert(fB.length === 3, 'Format B 3 feeders')
assert(fB[0].yarnType === 'HSY' && fB[1].yarnType === 'TEX' && fB[2].yarnType === 'MAX', 'Format B feeder yarns')
const wB = extractWeftPickRows(formatB)
assert(wB.length === 3, 'Format B 3 weft rows')
assert(wB[0].pic === '28.00' && wB[0].strings === '2222', 'Weft #1')
assert(wB[1].pic === '28.00' && wB[1].strings === '2222', 'Weft #2')
assert(wB[2].pic === '1.89' && wB[2].strings === '150', 'Weft #3')
const tB = extractTotals(formatB)
assert(tB.totalPick === '57.89' && tB.totalStrings === '4594', 'Format B totals')

console.log('✓ Design OCR parser tests passed (Format A + Format B)')
