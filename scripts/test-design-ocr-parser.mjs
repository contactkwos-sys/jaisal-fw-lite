/**
 * Design OCR parser tests — Colour Pick only; TOTAL LOOM PICK = Σ picks; Strings ignored.
 * Mirrors src/lib/designOcr.ts Colour/Pick rules.
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
const COLOUR_ROW_RE =
  /^(?:c+olou?r?s?|color|col\.?|feeder|fd)[\s.\-]*(\d+)\s*(?:[|:.\-]\s*|\s+)(.*)$/i
const COLOUR_PIPE_RE =
  /(?:c+olou?r?s?|color|colowr|feeder|fd)[\s.\-]*(\d+)\s*[|:.\-]+\s*([^|\n]{0,24}?)\s*[|:.\-]+\s*(\d+(?:\.\d+)?|[-–—])/gi

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

function isUnusedPickToken(raw) {
  const v = (raw || '').trim()
  if (!v) return true
  if (v === '-' || v === '—' || v === '–' || v === '.' || v === '_' || /^n\/?a$/i.test(v)) return true
  if (/^\d+(?:\.\d+)?$/.test(v) && Number(v) === 0) return true
  return false
}

function parseColourPickToken(raw) {
  const v = (raw || '').trim()
  if (isUnusedPickToken(v)) return '0'
  const m = v.match(/^(\d+(?:\.\d+)?)/)
  return m ? m[1] : '0'
}

function normalizeYarnLabel(raw) {
  const t = raw.trim()
  if (isBlankYarnName(t)) return '-'
  if (/^(ZAREE|ZARI|JARI|ZARIE)$/i.test(t)) return 'ZARI'
  return t.toUpperCase().replace(/\s+/g, ' ')
}

function sumWeftPics(rows) {
  if (!rows?.length) return ''
  const sum = rows.reduce((s, r) => s + (Number(r?.pic) || 0), 0)
  if (sum < 0) return ''
  return String(Math.round(sum * 100) / 100)
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

/** Printed header helper (product TOTAL LOOM PICK always uses Σ Colour Picks instead). */
function extractLoomPickPrinted(text) {
  const totalLoom = text.match(TOTAL_LOOM_PICK_RE)
  if (totalLoom?.[1]) return totalLoom[1]
  const loom = text.match(LOOM_PICK_RE)
  if (loom?.[1]) return loom[1]
  const onLoom = text.match(ON_LOOM_PICK_RE)
  if (onLoom?.[1]) return onLoom[1]
  const nPickMatches = [...text.matchAll(/\b(\d{2,4})\s*[-–]?\s*pick\b/gi)].map((m) => m[1])
  if (nPickMatches.length) {
    return nPickMatches.reduce((a, b) => (Number(b) > Number(a) ? b : a))
  }
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

/** Pick only — Strings column ignored. */
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
      line.match(/^(\d+(?:\.\d+)?|[-–—])\s*[/|,]\s*(\d+(?:\.\d+)?|[-–—])\s*$/) ||
      line.match(/^(\d+(?:\.\d+)?|[-–—])\s+(\d+(?:\.\d+)?|[-–—])$/)
    if (pair && inTable) rows.push({ pic: parseColourPickToken(pair[1]), strings: '' })
  }
  return rows
}

/**
 * Colour rows: Pick only. Dash/0 → unused Pick 0. Strings ignored.
 * totalPick = Σ Colour Picks (never printed total).
 */
function extractColourTable(text) {
  const entries = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  {
    const pipeRe = new RegExp(COLOUR_PIPE_RE.source, 'gi')
    let pm
    while ((pm = pipeRe.exec(text)) !== null) {
      const no = Number(pm[1])
      if (!no || no > 6 || entries.some((e) => e.no === no)) continue
      let yarnRaw = (pm[2] || '').trim().replace(/^[\s|:.\-\[\]=]+|[\s|:.\-\[\]]+$/g, '')
      if (/^hey$/i.test(yarnRaw)) yarnRaw = 'hsy'
      if (/^saree$/i.test(yarnRaw)) yarnRaw = 'zaree'
      const pic = parseColourPickToken(pm[3])
      entries.push({ no, yarn: normalizeYarnLabel(yarnRaw), pic, confidence: pic === '0' ? 'high' : 'high' })
    }
  }

  for (const line of lines) {
    if (/^tota/i.test(line)) continue
    const colour = line.match(COLOUR_ROW_RE)
    if (!colour) continue
    const no = Number(colour[1])
    if (!no || no > 6 || entries.some((e) => e.no === no)) continue
    const rest = (colour[2] || '').trim()
    let yarnRaw = ''
    let picToken = ''
    if (isUnusedPickToken(rest) || /^[-–—](?:\s+[-–—])?$/.test(rest)) {
      picToken = '-'
    } else {
      const hits = []
      const re = /(\d+(?:\.\d+)?|[-–—])/g
      let hm
      while ((hm = re.exec(rest)) !== null) {
        hits.push({ v: hm[1], index: hm.index })
      }
      if (!hits.length) continue
      const pickHit = hits.length >= 2 ? hits[hits.length - 2] : hits[0]
      picToken = pickHit.v
      yarnRaw = rest.slice(0, pickHit.index).trim().replace(/^[\s|:.\-\[|=]+|[\s|:.\-\]]+$/g, '')
    }
    if (yarnRaw === '-' || yarnRaw === '—' || yarnRaw === '–') yarnRaw = ''
    const pic = parseColourPickToken(picToken)
    if (/^hey$/i.test(yarnRaw)) yarnRaw = 'hsy'
    if (/^saree$/i.test(yarnRaw)) yarnRaw = 'zaree'
    if (/^\d+(\.\d+)?$/.test(yarnRaw) || yarnRaw.length > 24) yarnRaw = ''
    entries.push({
      no,
      yarn: normalizeYarnLabel(yarnRaw),
      pic,
      confidence: pic === '0' ? 'high' : yarnRaw ? 'high' : 'low',
    })
  }

  entries.sort((a, b) => a.no - b.no)
  const weftRows = entries.map((e) => ({ pic: e.pic, strings: '', confidence: e.confidence }))
  return {
    feeders: entries.map((e) => ({
      feederNo: e.no,
      yarnType: e.yarn,
      confidence: e.pic === '0' ? 'high' : e.confidence,
      sourceLabel: `Colour ${e.no}`,
    })),
    weftRows,
    totalPick: sumWeftPics(weftRows),
    totalStrings: '',
  }
}

function suggestEqualPics(loom, rowCount) {
  if (!(loom > 0) || rowCount < 1) return ''
  const candidates = [loom, loom - 1, loom + 1]
  for (const base of candidates) {
    if (base > 0 && base % rowCount === 0) {
      const each = base / rowCount
      if (each >= 8 && each <= 200) return String(each)
    }
  }
  const rounded = Math.round(loom / rowCount)
  if (rounded >= 8 && rounded <= 200) return String(rounded)
  return ''
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
assert(extractLoomPickPrinted(formatA) === '56', 'Format A printed pick header')
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
assert(extractLoomPickPrinted(formatB) === '56', 'Format B printed loom pick')
const fB = extractFeeders(formatB)
assert(fB.length === 3, 'Format B 3 feeders')
assert(
  fB[0].yarnType === 'HSY' && fB[1].yarnType === 'TEX' && fB[2].yarnType === 'MAX',
  'Format B feeder yarns',
)
const wB = extractWeftPickRows(formatB)
assert(wB.length === 3, 'Format B 3 weft rows')
assert(wB[0].pic === '28.00' && wB[0].strings === '', 'Weft #1 Pick only — Strings ignored')
assert(sumWeftPics(wB) === '57.89', 'Format B Σ Pick = TOTAL LOOM PICK')

const formatHyphen = `
jfg-2249
loom-pick-56
`
assert(extractDesignNumbers(formatHyphen).design === 'JFG2249', 'Hyphenated JFG DIN')
assert(extractLoomPickPrinted(formatHyphen) === '56', 'Hyphenated printed loom pick')

/** Colour sheet with unused Colour 4–6 — Σ picks wins over printed Total 112 */
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
const colour = extractColourTable(formatColour)
assert(colour.feeders.length === 6, 'Colour sheet keeps unused Colour 4–6')
assert(colour.feeders[0].yarnType === '-', 'Colour 1 yarn is dash (blank cell)')
assert(colour.feeders[1].yarnType === 'ZARI', 'Colour 2 yarn zaree → ZARI')
assert(colour.feeders[2].yarnType === '-', 'Colour 3 yarn is dash')
assert(colour.weftRows.map((r) => r.pic).join(',') === '37,37,37,0,0,0', 'Colour picks incl unused 0')
assert(colour.weftRows.every((r) => r.strings === ''), 'No Strings stored')
assert(colour.totalStrings === '', 'No totalStrings')
assert(colour.totalPick === '111', 'TOTAL WEFT PIC = Σ Colour Picks 111 (sheet loom may differ)')
assert(colour.weftRows[3].confidence === 'high', 'Unused Colour 4 not low-confidence')

/** Design Number label + feeder pick sum */
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
assert(colourLabel.totalPick === '112', 'Σ feeder picks = 112 TOTAL WEFT PIC')
assert(colourLabel.weftRows.every((r) => !r.strings), 'No Strings on label sheet')
assert(isBlankYarnName('-') && !isBlankYarnName('ZARI'), 'Blank yarn helper')

/** JFG2249 — Colour picks → Weft PIC; sheet TOTAL LOOM PICK kept separate */
const formatJfg2249 = `
Design Number: JFG2249
TOTAL LOOM PICK = 112
Colour 1  300 Tex   25   2000
Colour 2  ZARI      25   2000
`
assert(extractDesignNumbers(formatJfg2249).design === 'JFG2249', 'JFG2249 Design Number')
assert(extractLoomPickPrinted(formatJfg2249) === '112', 'Printed header still readable for audit')
const jfgColour = extractColourTable(formatJfg2249)
assert(jfgColour.feeders.length === 2, 'JFG2249 2 colour rows')
assert(jfgColour.weftRows[0].pic === '25' && jfgColour.weftRows[1].pic === '25', 'JFG2249 colour PICs')
assert(jfgColour.totalPick === '50', 'JFG2249 TOTAL WEFT PIC = Σ 50')
assert(extractLoomPickPrinted(formatJfg2249) === '112', 'JFG2249 sheet TOTAL LOOM PICK = 112')
assert(jfgColour.weftRows.every((r) => r.strings === ''), 'JFG2249 no Strings')

/** JFG1654 acceptance — Colour 1/2/3 Pick 37, Colour 4 unused "-", TOTAL LOOM PICK 111 */
const formatJfg1654 = `
Design Number: JFG1654
Pick   Strings
Colour 1  hsy   37   500
Colour 2  zaree 37   500
Colour 3        37   500
Colour 4  -     -
TOTAL LOOM PICK = 999
Total 112 1500
`
{
  const din = extractDesignNumbers(formatJfg1654)
  assert(din.design === 'JFG1654', 'JFG1654 Design No. exact — no suffix')
}
const j1654 = extractColourTable(formatJfg1654)
assert(j1654.feeders.length === 4, 'JFG1654 four Colour rows')
assert(j1654.weftRows.map((r) => r.pic).join(',') === '37,37,37,0', 'JFG1654 picks 37/37/37/0')
assert(j1654.weftRows[3].pic === '0', 'JFG1654 Colour 4 unused → Pick 0')
assert(j1654.weftRows[3].confidence === 'high', 'JFG1654 unused not flagged low')
assert(j1654.totalPick === '111', 'JFG1654 TOTAL LOOM PICK = 111')
assert(j1654.totalStrings === '', 'JFG1654 no Strings')
assert(j1654.weftRows.every((r) => r.strings === ''), 'JFG1654 no Strings on rows')
assert(j1654.feeders[1].yarnType === 'ZARI', 'JFG1654 Colour 2 zaree → ZARI')

/** Real diner DIN sheet (Aditya letterhead) */
const formatAditya = `
ADITYA GRAPHICS
DESIGNE-NUMBER
JFG2247 BRT
feeder-1 hsy
feeder-2 tex
Colour 1 | hsy | 24
Colour 2 | tex | 24
`
{
  const din = extractDesignNumbers(formatAditya)
  assert(din.design === 'JFG2247', `Aditya DESIGNE-NUMBER → JFG2247 got ${din.design}`)
}
const adityaTable = extractColourTable(formatAditya)
assert(adityaTable.weftRows.every((r) => r.strings === ''), 'Aditya no Strings')
assert(normalizeOcrDesignNumber('JFG2247 BRT').design === 'JFG2247', 'normalize BRT')
assert(normalizeOcrDesignNumber('IFG2247 BRT').design === 'JFG2247', 'OCR I→J on JFG prefix')
assert(normalizeOcrDesignNumber('9FG2247').design === 'JFG2247', 'OCR 9→J on JFG prefix')

/** Real Colour sheet: Design Number-jfg1738-wxb + on-loom-48 */
const format1738 = `
Design Number-jfg1738-wxb
on-loom-48
Colour 1  hsy  24  2230
Colour 2  tex  24  2230
Colour 3       0   0
`
{
  const din = extractDesignNumbers(format1738)
  assert(din.design === 'JFG1738', `jfg1738 DIN got ${din.design}`)
  assert(din.quality === 'WXB', 'jfg1738 quality')
}
assert(extractLoomPickPrinted(format1738) === '48', 'jfg1738 printed on-loom-48')
const c1738 = extractColourTable(format1738)
assert(c1738.weftRows.map((r) => r.pic).join(',') === '24,24,0', 'jfg1738 picks incl unused')
assert(c1738.totalPick === '48', 'jfg1738 TOTAL LOOM PICK = Σ 48')
assert(c1738.weftRows.every((r) => r.strings === ''), 'jfg1738 no Strings')

const formatNoisyPhone = `
9876543210
Design Number-jfg1738-wxb
Colour PEE
`
{
  const din = extractDesignNumbers(formatNoisyPhone, 'jfg1738.jpg')
  assert(din.design === 'JFG1738', `noisy phone DIN got ${din.design}`)
}

assert(suggestEqualPics(112, 3) === '37', 'JFG1674 equal PIC split 112→37×3 (off-by-one)')
assert(suggestEqualPics(111, 3) === '37', 'JFG1654 equal PIC split 111→37×3')

{
  const pipeRe = new RegExp(COLOUR_PIPE_RE.source, 'gi')
  const noisyTable = 'CColour2 | zaree | 37\nColour 1 | | 37\nColour 4 | | -'
  const hits = [...noisyTable.matchAll(pipeRe)]
  assert(hits.length >= 2, 'pipe colour rows')
  assert(hits[0][1] === '2' && /zaree/i.test(hits[0][2]) && hits[0][3] === '37', 'pipe Colour2 zaree 37')
  const dashHit = hits.find((h) => h[1] === '4')
  assert(dashHit && dashHit[3] === '-', 'pipe Colour4 dash pick')
  const parsed = extractColourTable(noisyTable)
  assert(parsed.weftRows.find((r, i) => parsed.feeders[i].feederNo === 4)?.pic === '0', 'pipe dash → 0')
}

console.log(
  '✓ Design OCR parser tests passed (Colour Pick only + Σ TOTAL LOOM PICK + JFG1654 + no Strings)',
)
