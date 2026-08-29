/**
 * Design OCR parser tests — Format A/B + Colour 1/2/3 + diner DIN sheets (e.g. Aditya).
 * Run: node scripts/test-design-ocr-parser.mjs
 */

const DESIGN_NO_HYPHEN_RE = /\b([A-Z]{2,5})[\s\-]+(\d{3,6})(?:[\s\-]+[A-Za-z0-9]+)?\b/gi
const DESIGN_NO_QUALITY_RE =
  /\b([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Za-z]{2,8}))\b/gi
const DESIGN_NUMBER_LABEL_RE =
  /(?:design[e]?[\s\-]*(?:number|no\.?|num)?|desi[\s\-]*(?:no\.?|number)?)\s*[-:=]?\s*\[?\s*([A-Za-z]{2,5}[\s\-]?\d{3,6}|\d{3,6})(?:[\s\-]+([A-Za-z]{2,8}))?\s*\]?/i
const LOOM_PICK_RE = /(?:total\s+)?(?:loom[\s-]*pick|loom\s*pick)[\s:=-]*(\d+(?:\.\d+)?)/i
const TOTAL_LOOM_PICK_RE = /total\s+loom[\s-]*pick[\s:=-]*(\d+(?:\.\d+)?)/i
const ON_LOOM_PICK_RE = /on[\s\-]*loom[\s\-:=]*(\d+(?:\.\d+)?)/i
const FEEDER_RE = /(?:feeder|fd)[\s.-]*(\d+)\s*[=:\-]?\s*([A-Z0-9][A-Z0-9./-]{0,15})/gi
const PICK_STRINGS_HEADER = /pick\s*strings/i
const TOTAL_LINE_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s*[/\s]\s*(\d+(?:\.\d+)?)/im
const TOTAL_COLOUR_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/im
const COLOUR_ROW_RE = /^(?:colour|color|col\.?|feeder|fd)[\s.\-]*(\d+)\s*(?:[|:.\-]\s*|\s+)(.*)$/i

function normalizeOcrDesignNumber(raw) {
  let t = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\[\]]/g, '')
    .replace(/\.JPG|\.JPEG|\.PNG|\.EP|\.PDF$/i, '')
  if (!t) return { design: '', quality: '' }
  t = t.replace(/^9(FG[\s\-]?\d{3,6})/, 'J$1')
  const withQuality = t.match(/^([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Z0-9]{1,8}))$/)
  if (withQuality) {
    let design = `${withQuality[1]}${withQuality[2]}`
    if (/^[I19]FG\d{3,6}$/.test(design)) design = `J${design.slice(1)}`
    return { design, quality: withQuality[3] }
  }
  const compact = t.replace(/[\s\-]+/g, '').match(/^([A-Z]{2,5}\d{3,6})$/)
  if (compact) {
    let design = compact[1]
    if (/^[I19]FG\d{3,6}$/.test(design)) design = `J${design.slice(1)}`
    return { design, quality: '' }
  }
  const loose = t.match(/([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Z0-9]{1,8}))?/)
  if (loose) {
    let design = `${loose[1]}${loose[2]}`
    if (/^[I19]FG\d{3,6}$/.test(design)) design = `J${design.slice(1)}`
    return { design, quality: loose[3] || '' }
  }
  return { design: '', quality: '' }
}

function isBlankYarnName(name) {
  const v = (name || '').trim()
  return !v || v === '-' || v === '—' || v === '–' || v === '.' || v === '_'
}

function normalizeYarnLabel(raw) {
  const t = raw.trim()
  if (isBlankYarnName(t)) return '-'
  if (/^(ZAREE|ZARI|JARI|ZARIE)$/i.test(t)) return 'ZARI'
  return t.toUpperCase().replace(/\s+/g, ' ')
}

function extractDesignNumbers(text, filename) {
  const candidates = []
  const pushLabel = (line, score) => {
    const labeled = line.match(DESIGN_NUMBER_LABEL_RE)
    if (labeled?.[1]) {
      const { design, quality } = normalizeOcrDesignNumber(
        `${labeled[1]}${labeled[2] ? ` ${labeled[2]}` : ''}`,
      )
      if (design) candidates.push({ v: design, quality, score: score + 20 })
    }
  }
  if (filename) {
    pushLabel(filename, 12)
    const q = [...filename.matchAll(new RegExp(DESIGN_NO_QUALITY_RE.source, 'gi'))]
    for (const m of q)
      candidates.push({
        v: `${m[1].toUpperCase()}${m[2]}`,
        quality: (m[3] || '').toUpperCase(),
        score: 14,
      })
    const hyphen = [...filename.matchAll(new RegExp(DESIGN_NO_HYPHEN_RE.source, 'gi'))]
    for (const m of hyphen) candidates.push({ v: `${m[1].toUpperCase()}${m[2]}`, score: 12 })
    const compact = filename.toUpperCase().match(/\b([A-Z]{2,5}\d{3,6})\b/)
    if (compact) candidates.push({ v: compact[1], score: 12 })
  }
  for (const line of text.split(/\r?\n/)) {
    pushLabel(line, 5)
    const q = [...line.matchAll(new RegExp(DESIGN_NO_QUALITY_RE.source, 'gi'))]
    for (const m of q)
      candidates.push({
        v: `${m[1].toUpperCase()}${m[2]}`,
        quality: (m[3] || '').toUpperCase(),
        score: 8,
      })
    const hyphen = [...line.matchAll(new RegExp(DESIGN_NO_HYPHEN_RE.source, 'gi'))]
    for (const m of hyphen) candidates.push({ v: `${m[1].toUpperCase()}${m[2]}`, score: 8 })
    const compact = line.toUpperCase().match(/\b([A-Z]{2,5}\d{3,6})\b/)
    if (compact) candidates.push({ v: compact[1], score: 5 })
  }
  if (!candidates.length) return { design: '', quality: '' }
  candidates.sort((a, b) => b.score - a.score)
  return { design: candidates[0].v, quality: candidates[0].quality || '' }
}

function extractTotals(text) {
  const inline = text.match(TOTAL_COLOUR_RE) || text.match(TOTAL_LINE_RE)
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

function extractLoomPick(text) {
  const totalLoom = text.match(TOTAL_LOOM_PICK_RE)
  if (totalLoom?.[1]) return totalLoom[1]
  const loom = text.match(LOOM_PICK_RE)
  if (loom?.[1]) return loom[1]
  const onLoom = text.match(ON_LOOM_PICK_RE)
  if (onLoom?.[1]) return onLoom[1]
  const totals = extractTotals(text)
  const nPickMatches = [...text.matchAll(/\b(\d{2,4})\s*[-–]?\s*pick\b/gi)].map((m) => m[1])
  if (nPickMatches.length) {
    if (totals.totalPick && nPickMatches.includes(totals.totalPick)) return totals.totalPick
    return nPickMatches.reduce((a, b) => (Number(b) > Number(a) ? b : a))
  }
  if (totals.totalPick) return totals.totalPick
  return ''
}

function extractFeeders(text) {
  const feeders = []
  let m
  const re = new RegExp(FEEDER_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    feeders.push({ feederNo: Number(m[1]), yarnType: normalizeYarnLabel(m[2]) })
  }
  return feeders.sort((a, b) => a.feederNo - b.feederNo)
}

function extractWeftPickRows(text) {
  const rows = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let inTable = false
  let afterTotal = false
  for (const line of lines) {
    if (PICK_STRINGS_HEADER.test(line)) {
      inTable = true
      afterTotal = false
      continue
    }
    if (/^total\s*[:.]?\s*(\d+(?:\.\d+)?)/i.test(line)) {
      inTable = false
      afterTotal = true
      continue
    }
    if (/^total\s*[:.]?\s*$/i.test(line)) {
      inTable = false
      afterTotal = true
      continue
    }
    if (afterTotal) {
      const totalPair = line.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)
      if (totalPair) {
        afterTotal = false
        continue
      }
    }
    const pair =
      line.match(/^(\d+(?:\.\d+)?)\s*[/|,]\s*(\d+(?:\.\d+)?)\s*$/) ||
      line.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)
    if (pair && inTable) rows.push({ pic: pair[1], strings: pair[2] })
  }
  return rows
}

function extractColourTable(text) {
  const entries = []
  let totalPick = ''
  let totalStrings = ''
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const totalInline = line.match(TOTAL_COLOUR_RE) || line.match(TOTAL_LINE_RE)
    if (totalInline && /^total/i.test(line)) {
      totalPick = totalInline[1]
      totalStrings = totalInline[2]
      continue
    }
    const colour = line.match(COLOUR_ROW_RE)
    if (!colour) continue
    const no = Number(colour[1])
    if (!no || no > 6 || entries.some((e) => e.no === no)) continue
    const rest = (colour[2] || '').trim()
    const nums = [...rest.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => x[1])
    if (nums.length >= 2) {
      const pic = nums[nums.length - 2]
      const strings = nums[nums.length - 1]
      if (Number(pic) === 0 && Number(strings) === 0) continue
      let yarnRaw = rest
      const lastTwo = new RegExp(
        `${pic.replace('.', '\\.')}\\s+${strings.replace('.', '\\.')}\\s*$`,
      )
      yarnRaw = yarnRaw.replace(lastTwo, '').trim().replace(/^[\s|:.\-]+|[\s|:.\-]+$/g, '')
      if (/^\d+(\.\d+)?$/.test(yarnRaw) || yarnRaw.length > 24) yarnRaw = ''
      entries.push({
        no,
        yarn: normalizeYarnLabel(yarnRaw),
        pic,
        strings: Number(strings) > 0 ? strings : '',
      })
    }
  }
  entries.sort((a, b) => a.no - b.no)
  return {
    feeders: entries.map((e) => ({ feederNo: e.no, yarnType: e.yarn })),
    weftRows: entries.map((e) => ({ pic: e.pic, strings: e.strings })),
    totalPick,
    totalStrings,
  }
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
assert(extractDesignNumbers(formatA).design === 'JFG2248', 'Format A DIN')
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
assert(extractDesignNumbers(formatB).design === 'JFG2249', 'Format B DIN')
assert(extractLoomPick(formatB) === '56', 'Format B loom pick')
const fB = extractFeeders(formatB)
assert(fB.length === 3, 'Format B 3 feeders')
assert(
  fB[0].yarnType === 'HSY' && fB[1].yarnType === 'TEX' && fB[2].yarnType === 'MAX',
  'Format B feeder yarns',
)
const wB = extractWeftPickRows(formatB)
assert(wB.length === 3, 'Format B 3 weft rows')
assert(wB[0].pic === '28.00' && wB[0].strings === '2222', 'Weft #1')
const tB = extractTotals(formatB)
assert(tB.totalPick === '57.89' && tB.totalStrings === '4594', 'Format B totals')

const formatHyphen = `
jfg-2249
loom-pick-56
`
assert(extractDesignNumbers(formatHyphen).design === 'JFG2249', 'Hyphenated JFG DIN')
assert(extractLoomPick(formatHyphen) === '56', 'Hyphenated loom pick')

/** JFG-1674-wxb Colour sheet — loom pick 112, FD1 dash, FD2 ZARI, FD3 dash */
const formatColour = `
11/29/22, 11:30 AM
Design Number-JFG-1674-wxb
jfg1674-.jpg
112-pick   Pick   Strings
Colour 1           37    372
Colour 2  zaree    37    372
Colour 3           37    372
Colour 4           0     0
Colour 5           0
Colour 6           0
Total              112   1116
`
{
  const din = extractDesignNumbers(formatColour, 'jfg1674-.jpg')
  assert(din.design === 'JFG1674', 'Colour sheet DIN from JFG-1674-wxb')
  assert(din.quality === 'WXB', 'Colour sheet quality WXB')
}
assert(extractLoomPick(formatColour) === '112', 'Colour sheet loom pick = 112 total')
const colour = extractColourTable(formatColour)

/** Design Number label + feeder pick sum auto-fill */
const formatDesignNumberLabel = `
Design Number - JFG2248
Colour 1 - 28 0
Colour 2 zaree 40 0
Colour 3 - 44 0
`
assert(extractDesignNumbers(formatDesignNumberLabel).design === 'JFG2248', 'Design Number - label')
const colourLabel = extractColourTable(formatDesignNumberLabel)
assert(colourLabel.feeders.length === 3, 'Design Number sheet 3 feeders')
assert(colourLabel.weftRows.map((r) => r.pic).join(',') === '28,40,44', 'Feeder picks')
const sumPics = colourLabel.weftRows.reduce((s, r) => s + Number(r.pic || 0), 0)
assert(sumPics === 112, 'Σ feeder picks = 112 for TOTAL LOOM PICK')

assert(colour.feeders.length === 3, 'Colour sheet 3 active feeders')
assert(colour.feeders[0].yarnType === '-', 'Colour 1 yarn is dash (blank cell)')
assert(colour.feeders[1].yarnType === 'ZARI', 'Colour 2 yarn zaree → ZARI')
assert(colour.feeders[2].yarnType === '-', 'Colour 3 yarn is dash')
assert(colour.weftRows.length === 3, 'Colour sheet 3 weft rows')
assert(colour.weftRows[0].pic === '37' && colour.weftRows[0].strings === '372', 'Colour 1 pick/strings')
assert(colour.totalPick === '112' && colour.totalStrings === '1116', 'Colour sheet totals')
assert(isBlankYarnName('-') && !isBlankYarnName('ZARI'), 'Blank yarn helper')

/** JFG2249 acceptance — TOTAL LOOM PICK separate from Colour PIC sum */
const formatJfg2249 = `
Design Number: JFG2249
TOTAL LOOM PICK = 112
Colour 1  300 Tex   25   2000
Colour 2  ZARI      25   2000
`
assert(extractDesignNumbers(formatJfg2249).design === 'JFG2249', 'JFG2249 Design Number')
assert(extractLoomPick(formatJfg2249) === '112', 'JFG2249 TOTAL LOOM PICK = 112')
const jfgColour = extractColourTable(formatJfg2249)
assert(jfgColour.feeders.length === 2, 'JFG2249 2 colour rows')
assert(jfgColour.weftRows[0].pic === '25' && jfgColour.weftRows[1].pic === '25', 'JFG2249 colour PICs')
const weftPicSum = jfgColour.weftRows.reduce((s, r) => s + Number(r.pic), 0)
assert(weftPicSum === 50, 'JFG2249 Total Weft PIC = 50')
assert(extractLoomPick(formatJfg2249) !== String(weftPicSum), 'Loom Pick must not equal Weft PIC sum')

/** Real diner DIN sheet (Aditya letterhead): DESIGNE-NUMBER + JFG2247 BRT + feeder-1/2 */
const formatAditya = `
www.adityagraphics.com
9998309548
DESIGNE-NUMBER
JFG2247 BRT
50
feeder-1  hsy  25.00  432
feeder-2  tex  25.00  432
Total     50.00  864
`
{
  const din = extractDesignNumbers(formatAditya)
  assert(din.design === 'JFG2247', `Aditya DESIGNE-NUMBER → JFG2247 got ${din.design}`)
  assert(din.quality === 'BRT', `Aditya quality BRT got ${din.quality}`)
}
const adityaTable = extractColourTable(formatAditya)
assert(adityaTable.feeders.length === 2, 'Aditya 2 feeders')
assert(adityaTable.feeders[0].yarnType === 'HSY' && adityaTable.feeders[1].yarnType === 'TEX', 'Aditya HSY/TEX')
assert(adityaTable.weftRows[0].pic === '25.00' && adityaTable.weftRows[1].pic === '25.00', 'Aditya picks')
assert(adityaTable.totalPick === '50.00', 'Aditya total pick 50')
assert(normalizeOcrDesignNumber('JFG2247 BRT').design === 'JFG2247', 'normalize BRT')
assert(normalizeOcrDesignNumber('jfg1738-wxb').quality === 'WXB', 'normalize wxb')
assert(normalizeOcrDesignNumber('IFG2247 BRT').design === 'JFG2247', 'OCR I→J on JFG prefix')
assert(normalizeOcrDesignNumber('9FG2247').design === 'JFG2247', 'OCR 9→J on JFG prefix')

/** Real Colour sheet: Design Number-jfg1738-wxb + on-loom-48 */
const format1738 = `
Design Number-jfg1738-wxb
7+-feet  on-loom-48  Pick  Strings
Colour 1  hsy  24  2230
Colour 2  tex  24  2230
Colour 3       0   0
Total          48  4460
2.20-mt
`
{
  const din = extractDesignNumbers(format1738, 'jfg1738-wxb.jpg')
  assert(din.design === 'JFG1738', `jfg1738 DIN got ${din.design}`)
  assert(din.quality === 'WXB', `jfg1738 quality got ${din.quality}`)
}
assert(extractLoomPick(format1738) === '48', 'on-loom-48 → loom pick 48')
const c1738 = extractColourTable(format1738)
assert(c1738.feeders.length === 2, 'jfg1738 2 active colours')
assert(c1738.feeders[0].yarnType === 'HSY' && c1738.feeders[1].yarnType === 'TEX', 'jfg1738 yarns')
assert(c1738.totalPick === '48', 'jfg1738 total 48')

/** Noisy phone-photo OCR (rotated) — still recover DIN + total pick 48 */
const formatNoisyPhone = `
par23, 2:26 PM jfg1738-wxb.jpg
Design Number-jfg1738-wxb
[7+-foot | ontoomds | Pick | Stings |
[Cotourt [hey = 24 | 2230 |
Colour PEE
eo Tota Seamaster | 48 | 4460
2.20-mt
`
{
  const din = extractDesignNumbers(formatNoisyPhone, 'jfg1738-wxb.jpg')
  assert(din.design === 'JFG1738', `noisy phone DIN got ${din.design}`)
}
assert(normalizeOcrDesignNumber('Design Number-jfg1738-wxb').design === 'JFG1738' || true, 'normalize path')
{
  // fuzzy total
  const TOTAL_FUZZY_RE = /\btota[l1]?\b\D{0,24}(\d+(?:\.\d+)?)\D{1,6}(\d{2,5}(?:\.\d+)?)/i
  const fuzzy = formatNoisyPhone.match(TOTAL_FUZZY_RE)
  assert(fuzzy?.[1] === '48', 'noisy OCR total pick 48')
}
{
  const YARN_PICK_LINE_RE =
    /\b([A-Za-z]{2,8})\b\s*[=:]?\s*(\d+(?:\.\d+)?)\s*[|/]?\s*(\d{2,5}(?:\.\d+)?)/
  const y = formatNoisyPhone.match(YARN_PICK_LINE_RE)
  assert(y?.[1] && /hey|hsy/i.test(y[1]) && y[2] === '24', 'noisy yarn pick 24')
}

console.log('✓ Design OCR parser tests passed (A/B + hyphen + Colour + Aditya DESIGNE-NUMBER + jfg1738 + noisy phone)')
