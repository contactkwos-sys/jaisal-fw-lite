/**
 * DIN / Design reference OCR — parse, map to costing rows, Rate Master lookup.
 * Colour/Feeder rows: capture Pick only. Strings column is ignored entirely.
 * TOTAL LOOM PICK is always Σ Colour Pick values (never a printed total from the photo).
 */

import {
  DEFAULT_LENGTH_MTR,
  DEFAULT_WIDTH,
  emptyWeft,
  type WeftDraft,
  type WarpDraft,
} from './designWiseCosting'
import {
  applyWeftItemFromMaster,
} from './dinIntakeCosting'
import { findSharedDesign } from './designIdentity'
import { lookupRateForCosting, type RateMasterRow } from './rateMaster'
import { uploadDinStorageObject } from './dinStorage'
import { supabase } from './supabase'

export type DesignImportSource = 'gmail' | 'photo' | 'file' | 'direct' | 'diary'

export type FieldConfidence = 'high' | 'low' | 'missing'

export type OcrField<T = string> = {
  value: T
  confidence: FieldConfidence
  source?: string
}

export type DesignOcrFeeder = {
  feederNo: number
  yarnType: string
  confidence: FieldConfidence
  /** Display label: "Colour N" or "Feeder N" */
  sourceLabel?: string
}

export type DesignOcrWeftRow = {
  pic: string
  /** Always empty — Strings column is ignored (kept for stored OCR JSON compat). */
  strings: string
  confidence: FieldConfidence
}

/** How the image was read (browser Tesseract; legacy edge/external kept for type compat). */
export type DesignOcrReadSource = 'tesseract'

/** Structured OCR result — editable in review before applying to costing. */
export type DesignOcrResult = {
  designNumber: OcrField
  loomPick: OcrField
  feeders: DesignOcrFeeder[]
  weftRows: DesignOcrWeftRow[]
  totalPick: OcrField
  totalStrings: OcrField
  qualityName: OcrField
  rawText?: string
  /** How the image was read (edge vision vs browser Tesseract). */
  readSource?: DesignOcrReadSource
  /** User-facing hint when automatic read was weak or the OCR service was unavailable. */
  readWarning?: string
}

export type MissingRateItem = {
  category: 'warp' | 'weft'
  itemName: string
  rowIndex: number
}

export type DesignOcrApplyResult = {
  warps: WarpDraft[]
  wefts: WeftDraft[]
  missingRates: MissingRateItem[]
}

const DESIGN_NO_RE = /\b([A-Z]{2,5}\d{3,6})\b/g
/** e.g. JFG-2249, jfg 2249, JFG-1674-wxb — normalized to JFG2249 / JFG1674 */
const DESIGN_NO_HYPHEN_RE = /\b([A-Z]{2,5})[\s\-]+(\d{3,6})(?:[\s\-]+[A-Za-z0-9]+)?\b/gi
/** Compact + quality suffix: JFG2247 BRT / jfg1738-wxb */
const DESIGN_NO_QUALITY_RE =
  /\b([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Za-z]{2,8}))\b/gi
/**
 * Explicit header — diner DIN sheets (e.g. Aditya Graphics letterhead) often use
 * "DESIGNE-NUMBER" (extra E) and values like "JFG2247 BRT" / "JFG-1674-wxb".
 * "Aditya" is the diner name, not part of the DIN.
 */
const DESIGN_NUMBER_LABEL_RE =
  /(?:design[e]?[\s\-]*(?:number|no\.?|num)?|desi[\s\-]*(?:no\.?|number)?)\s*[-:=]?\s*\[?\s*([A-Za-z]{2,5}[\s\-]?\d{3,6}|\d{3,6})(?:[\s\-]+([A-Za-z]{2,8}))?\s*\]?/i
const PHONE_RE = /\b\d{10,}\b/
/** Yarn codes may be letters (HSY, ZAREE) or numeric denier/codes (37, 80/2). */
const FEEDER_RE =
  /(?:feeder|fd)[\s.-]*(\d+)\s*[=:\-]?\s*([A-Z0-9][A-Z0-9./-]{0,15})/gi
/** Colour / Feeder N rows — allow OCR typos (CColour2, Colowr, Colours, Cotour) */
const COLOUR_ROW_RE =
  /^(?:c+olou?r?s?|color|col\.?|cotou?r|coloum|colowr|coum|feeder|fd)[\s.\-]*(\d+)\s*(?:[|:.\-]\s*|\s+)(.*)$/i
/** Inline pipe table: "Colour2 | zaree | 37 |" / "Colour4 | | -" — Pick only (ignore Strings). */
const COLOUR_PIPE_RE =
  /(?:c+olou?r?s?|color|colowr|feeder|fd)[\s.\-]*(\d+)\s*[|:.\-]+\s*([^|\n]{0,24}?)\s*[|:.\-]+\s*(\d+(?:\.\d+)?|[-–—])/gi
const PICK_STRINGS_HEADER = /pick\s*strings|(?:\d+\s*[-–]?\s*pick).*(?:pick|strings)/i
const TOTAL_LINE_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s*[/\s]\s*(\d+(?:\.\d+)?)/im
const TOTAL_NEXT_LINE_RE = /^total\s*[:.]?\s*$/im
/** Yarn + Pick (+ optional ignored Strings): "hsy 24 2230" / "hey = 24 | 2230" */
const YARN_PICK_LINE_RE =
  /\b([A-Za-z]{2,8})\b\s*[=:]?\s*(\d+(?:\.\d+)?|[-–—])(?:\s*[|/]?\s*\d{2,5}(?:\.\d+)?)?/

/**
 * Normalize OCR design tokens to business DIN (letters+digits only).
 * Strips quality suffixes: -wxb, BRT, -BRT → quality returned separately.
 * Examples: "JFG-1674-wxb" → JFG1674 / WXB; "JFG2247 BRT" → JFG2247 / BRT
 * Also corrects common OCR confusion I/1/9 ↔ J on JFG-style prefixes (IFG2247 → JFG2247).
 */
export function normalizeOcrDesignNumber(raw: string): { design: string; quality: string } {
  let t = (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\[\]]/g, '')
    .replace(/\.JPG|\.JPEG|\.PNG|\.EP|\.PDF$/i, '')
  if (!t) return { design: '', quality: '' }

  // Leading digit OCR error: "9FG2247" → treat as JFG2247
  t = t.replace(/^9(FG[\s\-]?\d{3,6})/, 'J$1')

  const withQuality = t.match(/^([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Z0-9]{1,8}))$/)
  if (withQuality) {
    return {
      design: correctOcrDesignPrefix(`${withQuality[1]}${withQuality[2]}`),
      quality: withQuality[3],
    }
  }
  const compact = t.replace(/[\s\-]+/g, '').match(/^([A-Z]{2,5}\d{3,6})$/)
  if (compact) return { design: correctOcrDesignPrefix(compact[1]), quality: '' }

  const loose = t.match(/([A-Z]{2,5})[\s\-]*(\d{3,6})(?:[\s\-]+([A-Z0-9]{1,8}))?/)
  if (loose) {
    return {
      design: correctOcrDesignPrefix(`${loose[1]}${loose[2]}`),
      quality: loose[3] || '',
    }
  }
  return { design: '', quality: '' }
}

/** Tesseract often reads leading J as I or 9 on JFG sheets. */
function correctOcrDesignPrefix(design: string): string {
  if (/^[I19]FG\d{3,6}$/.test(design)) return `J${design.slice(1)}`
  return design
}

/** Sum of feeder/colour PIC values — TOTAL LOOM PICK is always this sum. */
export function sumWeftPics(rows: Array<{ pic?: string | null }> | null | undefined): string {
  if (!rows?.length) return ''
  const sum = rows.reduce((s, r) => s + (Number(r?.pic) || 0), 0)
  if (sum < 0) return ''
  return String(Math.round(sum * 100) / 100)
}

/**
 * Always set TOTAL LOOM PICK = Σ Colour/Feeder Pick values.
 * Never keep a separately-printed total from the photo. Clears Strings.
 */
export function ensureLoomPickFromFeederSum(ocr: DesignOcrResult): DesignOcrResult {
  const cleared: DesignOcrResult = {
    ...ocr,
    weftRows: ocr.weftRows.map((r) => ({ ...r, strings: '' })),
    totalStrings: emptyField(),
  }
  if (!cleared.weftRows.length) return cleared
  const sum = sumWeftPics(cleared.weftRows)
  if (sum === '') return cleared
  return {
    ...cleared,
    loomPick: { value: sum, confidence: 'high', source: 'sum_feeder_picks' },
    totalPick: { value: sum, confidence: 'high', source: 'sum_feeder_picks' },
  }
}

/** Blank / dash Pick cell → unused feeder (Pick 0). */
export function isUnusedPickToken(raw: string | null | undefined): boolean {
  const v = (raw || '').trim()
  if (!v) return true
  if (v === '-' || v === '—' || v === '–' || v === '.' || v === '_' || /^n\/?a$/i.test(v)) return true
  if (/^\d+(?:\.\d+)?$/.test(v) && Number(v) === 0) return true
  return false
}

/** Parse Pick column token → numeric string (0 for dash/blank/unused). */
export function parseColourPickToken(raw: string | null | undefined): string {
  const v = (raw || '').trim()
  if (isUnusedPickToken(v)) return '0'
  const m = v.match(/^(\d+(?:\.\d+)?)/)
  if (m) return m[1]
  return '0'
}

/** Blank feeder yarn on sheet (no visible text in colour cell) → dash placeholder. */
export function isBlankYarnName(name: string | null | undefined): boolean {
  const v = (name || '').trim()
  return !v || v === '-' || v === '—' || v === '–' || v === '.' || v === '_'
}

/** Normalize common OCR yarn spellings for Rate Master match. */
export function normalizeYarnLabel(raw: string): string {
  const t = raw.trim()
  if (isBlankYarnName(t)) return '-'
  const upper = t.toUpperCase().replace(/\s+/g, ' ')
  if (/^(ZAREE|ZARI|JARI|ZARIE|जरी)$/i.test(t) || upper === 'ZAREE' || upper === 'ZARI' || upper === 'JARI') {
    return 'ZARI'
  }
  return upper
}

function emptyField(): OcrField {
  return { value: '', confidence: 'missing' }
}

export function emptyDesignOcrResult(): DesignOcrResult {
  return {
    designNumber: emptyField(),
    loomPick: emptyField(),
    feeders: [],
    weftRows: [],
    totalPick: emptyField(),
    totalStrings: emptyField(),
    qualityName: emptyField(),
  }
}

/** Reject phone numbers, filenames-only noise, etc. Accepts raw or already-normalized DIN. */
export function isLikelyDesignNumber(value: string, subject?: string, filename?: string): boolean {
  const { design: v } = normalizeOcrDesignNumber(value)
  if (!v || v.length < 5) return false
  if (PHONE_RE.test(v)) return false
  if (!/^[A-Z]{2,5}\d{3,6}$/.test(v)) return false
  if (filename && filename.toUpperCase().includes(v) && subject && !subject.toUpperCase().includes(v)) {
    return false
  }
  return true
}

type DesignCandidate = { value: string; quality?: string; source: string; score: number }

function pickBestDesignNumber(
  candidates: DesignCandidate[],
  subject?: string,
  filename?: string,
): OcrField & { quality?: string } {
  const normalized: DesignCandidate[] = []
  for (const c of candidates) {
    const { design, quality } = normalizeOcrDesignNumber(c.value)
    if (!design || !isLikelyDesignNumber(design, subject, filename)) continue
    normalized.push({
      value: design,
      quality: quality || c.quality || '',
      source: c.source,
      score: c.score,
    })
  }
  if (!normalized.length) return emptyField()
  normalized.sort((a, b) => b.score - a.score)
  const best = normalized[0]
  return {
    value: best.value,
    confidence: best.score >= 8 ? 'high' : 'low',
    source: best.source,
    quality: best.quality || '',
  }
}

function scanDesignNumberCandidates(
  text: string,
  sourceLabel: string,
  baseScore: number,
  lineIdx?: number,
  lineCount?: number,
): DesignCandidate[] {
  const candidates: DesignCandidate[] = []
  const upper = text.toUpperCase()

  const labeled = text.match(DESIGN_NUMBER_LABEL_RE)
  if (labeled?.[1]) {
    const { design, quality } = normalizeOcrDesignNumber(
      `${labeled[1]}${labeled[2] ? ` ${labeled[2]}` : ''}`,
    )
    if (design) {
      let score = baseScore + 20
      if (lineIdx != null && lineIdx <= 2) score += 5
      // Prefer Design Number / DESIGNE-NUMBER headers over diner phone/sidebar noise
      if (/designe|design\s*number/i.test(text)) score += 5
      candidates.push({ value: design, quality, source: 'design_number_label', score })
    }
  }

  let m: RegExpExecArray | null
  const qualityRe = new RegExp(DESIGN_NO_QUALITY_RE.source, 'gi')
  while ((m = qualityRe.exec(text)) !== null) {
    let score = baseScore + 2
    if (lineIdx != null) {
      if (lineIdx <= 2) score += 3
      if (lineCount != null && lineIdx >= lineCount - 3) score += 2
      if (/design|designe|desi|din\b|jfg/i.test(text)) score += 4
    }
    candidates.push({
      value: `${m[1].toUpperCase()}${m[2]}`,
      quality: (m[3] || '').toUpperCase(),
      source: sourceLabel,
      score,
    })
  }

  const compactRe = new RegExp(DESIGN_NO_RE.source, 'g')
  while ((m = compactRe.exec(upper)) !== null) {
    let score = baseScore
    if (lineIdx != null) {
      if (lineIdx <= 2) score += 3
      if (lineCount != null && lineIdx >= lineCount - 3) score += 2
      if (/design\s*(?:no|number|#)|designe|desi|din\b|jfg/i.test(text)) score += 4
    }
    candidates.push({ value: m[1], source: sourceLabel, score })
  }

  const hyphenRe = new RegExp(DESIGN_NO_HYPHEN_RE.source, 'gi')
  while ((m = hyphenRe.exec(text)) !== null) {
    let score = baseScore + 1
    if (lineIdx != null) {
      if (lineIdx <= 2) score += 3
      if (lineCount != null && lineIdx >= lineCount - 3) score += 2
      if (/design\s*(?:no|number|#)|designe|desi|din\b|jfg/i.test(text)) score += 4
    }
    candidates.push({ value: `${m[1].toUpperCase()}${m[2]}`, source: sourceLabel, score })
  }

  return candidates
}

function extractDesignNumbers(
  text: string,
  subject?: string,
  filename?: string,
): OcrField & { quality?: string } {
  const candidates: DesignCandidate[] = []

  // Filename / subject are more reliable than noisy browser OCR (e.g. HG1674 vs JFG1674)
  if (subject) candidates.push(...scanDesignNumberCandidates(subject, 'email_subject', 10))
  if (filename) candidates.push(...scanDesignNumberCandidates(filename, 'filename', 12))

  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    candidates.push(...scanDesignNumberCandidates(line, 'ocr_text', 5, idx, lines.length))

    // Diner DIN sheets often put label on one line and "JFG2247 BRT" on the next
    const bareLabel =
      /^(?:design[e]?[\s\-]*(?:number|no\.?|num)?|desi[\s\-]*(?:no\.?|number)?)\s*[-:=]?\s*$/i.test(
        line.trim(),
      )
    if (bareLabel && lines[idx + 1]) {
      const next = lines[idx + 1].trim()
      const { design, quality } = normalizeOcrDesignNumber(next)
      if (design) {
        candidates.push({
          value: design,
          quality,
          source: 'design_number_label_next_line',
          score: 28,
        })
      }
    }
  })

  return pickBestDesignNumber(candidates, subject, filename)
}

function extractFeeders(text: string): DesignOcrFeeder[] {
  const feeders: DesignOcrFeeder[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(FEEDER_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    const no = Number(m[1])
    const yarn = normalizeYarnLabel(m[2] || '')
    if (!no || feeders.some((f) => f.feederNo === no)) continue
    feeders.push({
      feederNo: no,
      yarnType: yarn,
      confidence: 'high',
      sourceLabel: `Feeder ${no}`,
    })
  }
  feeders.sort((a, b) => a.feederNo - b.feederNo)
  return feeders
}

/**
 * Parse Colour 1 / Colour 2 / … table rows (jacquard sheet layout).
 * Captures ONLY the Pick column per Colour row. Strings column is ignored.
 * Dash / blank Pick → 0 (unused feeder) — not an error or low-confidence flag.
 */
export function extractColourTable(text: string): {
  feeders: DesignOcrFeeder[]
  weftRows: DesignOcrWeftRow[]
  totalPick: string
  totalStrings: string
} {
  type ColourEntry = { no: number; yarn: string; pic: string; confidence: FieldConfidence }
  const entries: ColourEntry[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  // Pass 1: pipe-delimited colour rows (best for table-region Tesseract)
  {
    const pipeRe = new RegExp(COLOUR_PIPE_RE.source, 'gi')
    let pm: RegExpExecArray | null
    while ((pm = pipeRe.exec(text)) !== null) {
      const no = Number(pm[1])
      if (!no || no > 6 || entries.some((e) => e.no === no)) continue
      let yarnRaw = (pm[2] || '').trim().replace(/^[\s|:.\-\[\]=]+|[\s|:.\-\[\]]+$/g, '')
      if (/^(ul|ar|ea|n\/a|na)$/i.test(yarnRaw) || yarnRaw.length > 16) yarnRaw = ''
      if (/^hey$/i.test(yarnRaw)) yarnRaw = 'hsy'
      if (/^saree$/i.test(yarnRaw)) yarnRaw = 'zaree'
      const pic = parseColourPickToken(pm[3])
      const unused = pic === '0'
      entries.push({
        no,
        yarn: normalizeYarnLabel(yarnRaw),
        pic,
        // Unused / zero Pick is fine — not low confidence. Blank yarn on active row stays soft.
        confidence: unused ? 'high' : yarnRaw ? 'high' : 'low',
      })
    }
  }

  for (const line of lines) {
    if (/^tota/i.test(line)) continue

    const colour = line.match(COLOUR_ROW_RE)
    if (!colour) continue
    const no = Number(colour[1])
    if (!no || no > 6) continue
    if (entries.some((e) => e.no === no)) continue

    const rest = (colour[2] || '').trim()
    // Sheet columns: yarn | Pick | Strings. When 2+ number/dash tokens exist,
    // Pick = second-to-last, last = Strings (ignored). Denier in yarn (e.g. "300 Tex")
    // stays in the yarn slice before Pick.
    let yarnRaw = ''
    let picToken = ''
    if (isUnusedPickToken(rest) || /^[-–—](?:\s+[-–—])?$/.test(rest)) {
      picToken = '-'
    } else {
      const hits: Array<{ v: string; index: number }> = []
      const re = /(\d+(?:\.\d+)?|[-–—])/g
      let hm: RegExpExecArray | null
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
    const unused = pic === '0'

    entries.push({
      no,
      yarn: normalizeYarnLabel(yarnRaw),
      pic,
      confidence: unused ? 'high' : yarnRaw ? 'high' : 'low',
    })
  }

  // Sparse PSM: Colour N labels + nearby bare pick numbers / dashes
  if (entries.length < 2) {
    const colourNos = [...text.matchAll(/(?:c+olou?r?s?|color|colowr)[\s.\-]*(\d+)/gi)].map((m) =>
      Number(m[1]),
    )
    const picks: string[] = []
    for (const line of lines) {
      const only = line.match(/^(?:\|?\s*)(\d{1,3}(?:\.\d+)?|[-–—])(?:\s*\|?\s*)$/)
      if (only) {
        picks.push(parseColourPickToken(only[1]))
      }
    }
    const uniqueNos = [...new Set(colourNos.filter((n) => n >= 1 && n <= 6))].sort((a, b) => a - b)
    if (uniqueNos.length && picks.length) {
      for (let i = 0; i < uniqueNos.length; i++) {
        const no = uniqueNos[i]
        if (entries.some((e) => e.no === no)) continue
        const pic = picks[i] ?? '0'
        entries.push({
          no,
          yarn: '-',
          pic,
          confidence: pic === '0' ? 'high' : 'low',
        })
      }
    }
  }

  // Fallback: yarn + pick lines when Colour N labels were garbled by OCR (Strings ignored)
  if (!entries.length) {
    let autoNo = 1
    for (const line of lines) {
      if (/tota/i.test(line)) continue
      const yarnPick = line.match(YARN_PICK_LINE_RE)
      if (!yarnPick) continue
      let yarn = yarnPick[1]
      if (/^(pick|strings|total|colour|color|feeder|design|number|feet|loom|ontoom)/i.test(yarn)) {
        continue
      }
      if (/^hey$/i.test(yarn)) yarn = 'hsy'
      if (/^saree$/i.test(yarn)) yarn = 'zaree'
      const pic = parseColourPickToken(yarnPick[2])
      if (Number(pic) > 500) continue
      entries.push({
        no: autoNo++,
        yarn: normalizeYarnLabel(yarn),
        pic,
        confidence: pic === '0' ? 'high' : 'low',
      })
      if (autoNo > 6) break
    }
  }

  entries.sort((a, b) => a.no - b.no)
  // TOTAL LOOM PICK is always Σ picks — do not return a printed total from the sheet
  const sumPick = sumWeftPics(entries.map((e) => ({ pic: e.pic })))
  return {
    feeders: entries.map((e) => ({
      feederNo: e.no,
      yarnType: e.yarn,
      // Blank yarn on unused feeder is fine; blank yarn on active pick may need review
      confidence:
        e.pic === '0' ? 'high' : e.yarn === '-' ? 'low' : e.confidence === 'low' ? 'low' : 'high',
      sourceLabel: `Colour ${e.no}`,
    })),
    weftRows: entries.map((e) => ({
      pic: e.pic,
      strings: '',
      confidence: e.pic === '0' ? 'high' : e.confidence,
    })),
    totalPick: sumPick,
    totalStrings: '',
  }
}

/**
 * Infer how many Colour/Feeder rows a sheet likely has from OCR text (Colour 1..N).
 * Includes unused trailing Colour rows when labels are present.
 */
export function inferColourRowCount(text: string): number {
  const nos = [...(text || '').matchAll(/(?:c+olou?r?s?|color|colowr|feeder|fd)[\s.\-]*(\d+)/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 1 && n <= 6)
  if (!nos.length) return 0
  return Math.max(...nos)
}

/**
 * Split TOTAL LOOM PICK across colour rows for review pre-fill.
 * Handles sheet off-by-one (e.g. 37+37+37=111 printed Total 112).
 */
export function suggestEqualPics(loom: number, rowCount: number): string {
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

/**
 * When DIN + loom pick are known but feeder/pick rows are missing or incomplete,
 * pre-fill low-confidence review rows so the user can confirm instead of a blank table.
 */
export function ensureReviewFeederRows(ocr: DesignOcrResult): DesignOcrResult {
  const hasFeeders = ocr.feeders.length >= 1
  const hasWefts = ocr.weftRows.some((r) => (r.pic || '').trim() !== '')
  if (hasFeeders && hasWefts) {
    // Unused Pick=0 rows are fine — only flag true low-confidence active rows
    const needsFlag =
      ocr.feeders.some((f, i) => {
        const pic = ocr.weftRows[i]?.pic
        if (parseColourPickToken(pic) === '0') return false
        return f.confidence === 'low'
      }) ||
      ocr.weftRows.some((r) => r.confidence === 'low' && parseColourPickToken(r.pic) !== '0')
    if (!needsFlag) {
      return {
        ...ocr,
        weftRows: ocr.weftRows.map((r) => ({ ...r, strings: '' })),
        totalStrings: emptyField(),
      }
    }
    return {
      ...ocr,
      weftRows: ocr.weftRows.map((r) => ({ ...r, strings: '' })),
      totalStrings: emptyField(),
      readWarning:
        ocr.readWarning ||
        'Some Feeder/Colour or Pick rows are low confidence — please confirm before Confirm.',
    }
  }

  const loom = Number(ocr.loomPick.value) || Number(ocr.totalPick.value) || 0
  const inferred = inferColourRowCount(ocr.rawText || '')
  let rowCount = hasFeeders
    ? Math.max(ocr.feeders.length, ocr.weftRows.length, inferred || 0)
    : inferred || 3

  // Prefer 3 colours for typical 48–200 loom jacquard sheets when nothing else known
  if (!hasFeeders && !inferred && loom >= 48 && loom <= 200) rowCount = 3
  if (rowCount < 1) rowCount = 3
  if (rowCount > 6) rowCount = 6

  const picEach = suggestEqualPics(loom, rowCount)

  // Preserve any yarn/pic already extracted; fill gaps for review
  const feeders: DesignOcrFeeder[] = []
  const weftRows: DesignOcrWeftRow[] = []
  for (let i = 1; i <= rowCount; i++) {
    const existingF = ocr.feeders.find((f) => f.feederNo === i)
    const existingW = ocr.weftRows[i - 1]
    feeders.push(
      existingF || {
        feederNo: i,
        yarnType: '-',
        confidence: 'low',
        sourceLabel: `Colour ${i}`,
      },
    )
    const existingPic = (existingW?.pic || '').trim()
    const pic = existingPic !== '' ? parseColourPickToken(existingPic) : picEach
    weftRows.push({
      pic: pic || '',
      strings: '',
      confidence: existingPic !== '' ? (parseColourPickToken(existingPic) === '0' ? 'high' : existingW!.confidence) : 'low',
    })
  }

  // Recover ZARI on Colour 2 when OCR saw zaree/zari anywhere
  const raw = ocr.rawText || ''
  if (/\bzaree\b|\bzari\b|\bjari\b/i.test(raw)) {
    const idx = feeders.findIndex((f) => f.feederNo === 2)
    if (idx >= 0 && (feeders[idx].yarnType === '-' || !feeders[idx].yarnType)) {
      feeders[idx] = {
        ...feeders[idx],
        yarnType: 'ZARI',
        confidence: 'low',
        sourceLabel: feeders[idx].sourceLabel || 'Colour 2',
      }
    }
  }

  const withRows = {
    ...ocr,
    feeders,
    weftRows,
    totalStrings: emptyField(),
    readWarning:
      ocr.readWarning ||
      'Feeder/Colour & Pick rows need review — values were estimated; confirm before Confirm.',
  }
  return ensureLoomPickFromFeederSum(withRows)
}

/** Parse Pick column rows in document order (exclude Total line). Strings column ignored. */
function extractWeftPickRows(text: string): DesignOcrWeftRow[] {
  const rows: DesignOcrWeftRow[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  let inTable = false
  let afterTotal = false
  for (const line of lines) {
    if (PICK_STRINGS_HEADER.test(line)) {
      inTable = true
      afterTotal = false
      continue
    }
    if (TOTAL_LINE_RE.test(line)) {
      inTable = false
      afterTotal = true
      continue
    }
    if (TOTAL_NEXT_LINE_RE.test(line)) {
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

    // First column = Pick; second column (Strings) deliberately ignored
    const pair =
      line.match(/^(\d+(?:\.\d+)?|[-–—])\s*[/|,]\s*(\d+(?:\.\d+)?|[-–—])\s*$/) ||
      line.match(/^(\d+(?:\.\d+)?|[-–—])\s+(\d+(?:\.\d+)?|[-–—])$/) ||
      line.match(/^(\d+(?:\.\d+)?|[-–—])\s*$/)

    if (pair && inTable) {
      rows.push({
        pic: parseColourPickToken(pair[1]),
        strings: '',
        confidence: 'high',
      })
      continue
    }
  }

  return rows
}

/** Format A: "315 / 315 Strings" — Strings ignored; no weft PIC invented. */
function extractFormatAStringPair(text: string): DesignOcrWeftRow | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*[/]\s*(\d+(?:\.\d+)?)\s*strings/i)
  if (!m) return null
  return { pic: '', strings: '', confidence: 'low' }
}

/**
 * Parse OCR / vision text into structured design fields.
 * Colour/Feeder Pick only; Strings ignored; TOTAL LOOM PICK = Σ Colour Picks.
 */
export function parseDesignReferenceText(
  text: string,
  hints?: { subject?: string; filename?: string },
): DesignOcrResult {
  const normalized = text.replace(/\u00a0/g, ' ').trim()
  const result = emptyDesignOcrResult()
  if (!normalized) return result

  const dinHit = extractDesignNumbers(normalized, hints?.subject, hints?.filename)
  result.designNumber = {
    value: dinHit.value,
    confidence: dinHit.confidence,
    source: dinHit.source,
  }
  if (dinHit.quality) {
    result.qualityName = { value: dinHit.quality, confidence: 'high', source: dinHit.source }
  }

  const colour = extractColourTable(normalized)
  const classicFeeders = extractFeeders(normalized)
  const classicWefts = extractWeftPickRows(normalized)

  if (colour.feeders.length >= 1) {
    result.feeders = colour.feeders
    result.weftRows = colour.weftRows
    // Merge yarn from classic feeder lines when colour cell was blank but FD line had yarn
    if (classicFeeders.length) {
      result.feeders = result.feeders.map((f) => {
        if (!isBlankYarnName(f.yarnType)) return f
        const alt = classicFeeders.find((c) => c.feederNo === f.feederNo)
        return alt && !isBlankYarnName(alt.yarnType)
          ? { ...f, yarnType: alt.yarnType, confidence: alt.confidence }
          : f
      })
    }
  } else {
    result.feeders = classicFeeders
    result.weftRows = classicWefts
  }

  // Printed totals are never used for TOTAL LOOM PICK; Strings never stored
  result.totalStrings = emptyField()
  result.totalPick = emptyField()

  if (!result.weftRows.length) {
    // Format A "315 / 315 Strings" — do NOT invent weft PIC; Strings ignored
    const formatA = extractFormatAStringPair(normalized)
    if (formatA) {
      result.weftRows = []
    }
  }

  result.rawText = normalized
  // Always TOTAL LOOM PICK = Σ Colour Pick (overrides any printed header)
  return ensureLoomPickFromFeederSum(result)
}

/** Merge vision API JSON with regex parser (vision wins when confident). */
export function mergeDesignOcrPayload(
  api: Partial<DesignOcrResult> | null,
  text: string,
  hints?: { subject?: string; filename?: string },
): DesignOcrResult {
  const parsed = parseDesignReferenceText(text, hints)
  if (!api) return parsed

  const merged = { ...parsed }

  if (api.designNumber?.value) {
    const { design, quality } = normalizeOcrDesignNumber(api.designNumber.value)
    merged.designNumber = {
      value: design || api.designNumber.value.toUpperCase().replace(/[\s\-]+/g, ''),
      confidence: api.designNumber.confidence || 'high',
      source: api.designNumber.source || 'vision',
    }
    if (quality && !merged.qualityName.value) {
      merged.qualityName = { value: quality, confidence: 'high', source: 'vision_suffix' }
    }
  }
  if (api.loomPick?.value) merged.loomPick = { ...api.loomPick, source: api.loomPick.source || 'vision' }
  if (api.qualityName?.value) merged.qualityName = api.qualityName
  if (api.totalPick?.value) merged.totalPick = api.totalPick
  // Strings column is ignored entirely
  merged.totalStrings = emptyField()

  if (api.feeders?.length) {
    merged.feeders = api.feeders.map((f) => ({
      feederNo: f.feederNo,
      yarnType: normalizeYarnLabel(f.yarnType || ''),
      confidence: f.confidence || 'high',
      sourceLabel: f.sourceLabel || `Feeder ${f.feederNo}`,
    }))
  }

  if (api.weftRows?.length) {
    merged.weftRows = api.weftRows.map((r) => ({
      pic: parseColourPickToken(r.pic || ''),
      strings: '',
      confidence: r.confidence || 'high',
    }))
  }

  merged.rawText = text || api.rawText
  return ensureLoomPickFromFeederSum(merged)
}

/** Downscale / recompress camera photos for faster browser OCR. */

/** Render file to JPEG, optionally rotated, optionally cropped to left table region. */
async function renderImageBlob(
  file: File,
  rotateDeg: 0 | 90 | 180 | 270,
  opts?: { tableCrop?: boolean; maxEdge?: number; upscale?: number; contrast?: number },
): Promise<Blob | null> {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return null
  }
  try {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    } catch {
      bitmap = await createImageBitmap(file)
    }
    const maxEdge = opts?.maxEdge ?? 1800
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const sw = Math.max(1, Math.round(bitmap.width * scale))
    const sh = Math.max(1, Math.round(bitmap.height * scale))
    const swap = rotateDeg === 90 || rotateDeg === 270
    let cw = swap ? sh : sw
    let ch = swap ? sw : sh
    const canvas = new OffscreenCanvas(cw, ch)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, cw, ch)
    ctx.save()
    if (rotateDeg === 90) {
      ctx.translate(cw, 0)
      ctx.rotate(Math.PI / 2)
    } else if (rotateDeg === 180) {
      ctx.translate(cw, ch)
      ctx.rotate(Math.PI)
    } else if (rotateDeg === 270) {
      ctx.translate(0, ch)
      ctx.rotate(-Math.PI / 2)
    }
    const contrast = opts?.contrast ?? 1.25
    ctx.filter = `contrast(${contrast}) saturate(0.12) brightness(1.05)`
    ctx.drawImage(bitmap, 0, 0, sw, sh)
    ctx.restore()
    bitmap.close()

    let outCanvas: OffscreenCanvas = canvas
    if (opts?.tableCrop) {
      // Left ~52% × top ~60%: Colour/Pick grid sits under Design Number on diner sheets
      const y0 = Math.round(ch * 0.06)
      const tw = Math.round(cw * 0.52)
      const th = Math.round(ch * 0.56)
      const crop = new OffscreenCanvas(tw, th)
      const cctx = crop.getContext('2d')
      if (cctx) {
        cctx.fillStyle = '#fff'
        cctx.fillRect(0, 0, tw, th)
        // High contrast helps faint Pick digits; desaturate drops fabric-sample noise
        cctx.filter = 'contrast(1.85) saturate(0.02) brightness(1.08)'
        cctx.drawImage(canvas, 0, y0, tw, th, 0, 0, tw, th)
        outCanvas = crop
      }
    }

    const up = opts?.upscale && opts.upscale > 1 ? opts.upscale : 1
    if (up > 1) {
      const uw = Math.round(outCanvas.width * up)
      const uh = Math.round(outCanvas.height * up)
      const upCanvas = new OffscreenCanvas(uw, uh)
      const uctx = upCanvas.getContext('2d')
      if (uctx) {
        uctx.imageSmoothingEnabled = true
        uctx.drawImage(outCanvas, 0, 0, uw, uh)
        outCanvas = upCanvas
      }
    }

    return await outCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
  } catch {
    return null
  }
}

function scoreOcrParse(ocr: DesignOcrResult): number {
  let s = 0
  if (ocr.designNumber.value) s += 10
  if (ocr.designNumber.confidence === 'high') s += 4
  if (ocr.loomPick.value) s += 5
  s += ocr.feeders.length * 3
  s += ocr.weftRows.filter((r) => r.pic).length * 3
  if (ocr.totalPick.value) s += 2
  return s
}

function mergeColourParse(
  base: DesignOcrResult,
  colourText: string,
  hints?: { subject?: string; filename?: string },
): DesignOcrResult {
  const colourParsed = parseDesignReferenceText(colourText, hints)
  if (colourParsed.feeders.length < 1) return base
  const merged: DesignOcrResult = {
    ...base,
    feeders: colourParsed.feeders,
    weftRows: colourParsed.weftRows,
    rawText: [base.rawText, colourText].filter(Boolean).join('\n---table---\n'),
  }
  if (!merged.loomPick.value && colourParsed.loomPick.value) merged.loomPick = colourParsed.loomPick
  if (!merged.totalPick.value && colourParsed.totalPick.value) merged.totalPick = colourParsed.totalPick
  return ensureLoomPickFromFeederSum(merged)
}

/**
 * Client-side Tesseract.js OCR — no Anthropic / Edge Function / API key.
 * Full page for DIN/loom (multi-orientation), then left-table crop for Feeder/PIC.
 * Does not stop early when only DIN + loom are found. Soft time budget avoids "Reading…" hang.
 */
async function ocrViaTesseract(
  file: File,
  hints?: { subject?: string; filename?: string },
): Promise<{ text: string; parsed: DesignOcrResult }> {
  const empty = { text: '', parsed: emptyDesignOcrResult() }
  const deadline = Date.now() + 45_000
  try {
    const mod = await import('tesseract.js')
    const rotations: Array<0 | 90 | 180 | 270> = [90, 270, 0]
    let bestText = ''
    let bestParsed = emptyDesignOcrResult()
    let bestScore = -1
    let bestDeg: 0 | 90 | 180 | 270 = 90

    for (const deg of rotations) {
      if (Date.now() > deadline) break
      const blob =
        (await renderImageBlob(file, deg, { maxEdge: 1600, contrast: 1.3 })) ||
        (deg === 0 ? file : null)
      if (!blob) continue
      const input =
        blob instanceof File
          ? blob
          : new File([blob], file.name || 'din-sheet.jpg', { type: blob.type || 'image/jpeg' })
      try {
        const result = await Promise.race([
          mod.recognize(input, 'eng'),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 14_000)),
        ])
        if (!result) continue
        const text = (result.data.text || '').trim()
        if (!text) continue
        const parsed = ensureLoomPickFromFeederSum(parseDesignReferenceText(text, hints))
        const score = scoreOcrParse(parsed) + Math.min(3, Math.floor(text.length / 200))
        if (score > bestScore) {
          bestScore = score
          bestText = text
          bestParsed = parsed
          bestDeg = deg
        }
        if (parsed.designNumber.value && parsed.feeders.length >= 1) break
      } catch {
        // next rotation
      }
    }

    if (bestParsed.feeders.length < 1 && Date.now() < deadline) {
      const tableDegs = [bestDeg, 90, 270, 0].filter((v, i, a) => a.indexOf(v) === i) as Array<
        0 | 90 | 180 | 270
      >
      for (const deg of tableDegs) {
        if (Date.now() > deadline) break
        const blob = await renderImageBlob(file, deg, {
          tableCrop: true,
          maxEdge: 1800,
          upscale: 1.5,
          contrast: 1.6,
        })
        if (!blob) continue
        const input = new File([blob], 'din-table.jpg', { type: 'image/jpeg' })
        try {
          const result = await Promise.race([
            mod.recognize(input, 'eng'),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
          ])
          if (!result) continue
          const text = (result.data.text || '').trim()
          if (!text) continue
          const merged = mergeColourParse(bestParsed, text, hints)
          if (merged.feeders.length > bestParsed.feeders.length) {
            bestParsed = merged
            bestText = [bestText, text].filter(Boolean).join('\n---table---\n')
          }
          if (bestParsed.feeders.length >= 2) break
        } catch {
          // continue
        }
      }
    }

    bestParsed = ensureReviewFeederRows(ensureLoomPickFromFeederSum(bestParsed))
    return { text: bestText, parsed: bestParsed }
  } catch {
    return empty
  }
}

/** True when OCR extracted at least one costing-relevant field. */
export function ocrHasDetectedFields(ocr: DesignOcrResult): boolean {
  return Boolean(
    ocr.designNumber.value.trim() ||
      ocr.loomPick.value.trim() ||
      ocr.feeders.length ||
      ocr.weftRows.length ||
      ocr.totalPick.value.trim() ||
      ocr.totalStrings.value.trim() ||
      ocr.qualityName.value.trim(),
  )
}

function attachReadMeta(
  result: DesignOcrResult,
  readSource: DesignOcrReadSource,
  readWarning?: string,
): DesignOcrResult {
  return { ...result, readSource, readWarning }
}

/**
 * Read a DIN / design sheet photo in the browser with Tesseract.js.
 * No Anthropic API key, no Supabase Edge Function, no external OCR cost.
 * Fields remain editable in the UI when automatic read is weak or incomplete.
 */
export async function readDesignReference(
  file: File,
  hints?: { subject?: string; filename?: string },
): Promise<DesignOcrResult> {
  const { text, parsed } = await ocrViaTesseract(file, {
    subject: hints?.subject,
    filename: hints?.filename || file.name,
  })
  let withSum = ensureReviewFeederRows(ensureLoomPickFromFeederSum(parsed))
  // Filename / subject often carry the DIN even when image OCR is weak
  if (!withSum.designNumber.value.trim()) {
    const fromHints = parseDesignReferenceText(
      [hints?.subject, hints?.filename, file.name].filter(Boolean).join('\n'),
      hints,
    )
    if (fromHints.designNumber.value) {
      withSum = {
        ...withSum,
        designNumber: fromHints.designNumber,
        qualityName:
          fromHints.qualityName.value && !withSum.qualityName.value
            ? fromHints.qualityName
            : withSum.qualityName,
      }
    }
  }

  const warning = !ocrHasDetectedFields(withSum)
    ? 'Could not auto-read this photo. Enter Design No. / feeder picks manually — fields stay editable.'
    : withSum.readWarning
      ? withSum.readWarning
      : withSum.designNumber.confidence !== 'high' || !withSum.loomPick.value
        ? 'Browser OCR filled what it could — please confirm Design No., loom pick, and Colour/PIC rows before Confirm.'
        : undefined

  return attachReadMeta({ ...withSum, rawText: text || withSum.rawText }, 'tesseract', warning)
}

/** Map OCR review → weft rows. Pick → PIC only. Strings are never stored or used. */
export function mapOcrToWeftRows(
  ocr: DesignOcrResult,
  designLength: string,
  rates: RateMasterRow[],
  costingDate: string,
): WeftDraft[] {
  const length = (designLength || '').trim() || String(DEFAULT_LENGTH_MTR)
  const maxFeederNo = ocr.feeders.reduce((m, f) => Math.max(m, f.feederNo), 0)

  let sourceRows: DesignOcrWeftRow[]
  if (ocr.weftRows.length > 0) {
    sourceRows = ocr.weftRows.map((r) => ({ ...r, strings: '' }))
  } else if (ocr.feeders.length > 0) {
    // One costing row per feeder when Pick table was not readable — PIC blank for user
    sourceRows = ocr.feeders.map(() => ({
      pic: '',
      strings: '',
      confidence: 'low' as const,
    }))
  } else {
    sourceRows = []
  }

  // Pad so every detected feeder/colour gets a weft line in source order
  while (sourceRows.length < maxFeederNo) {
    sourceRows.push({ pic: '', strings: '', confidence: 'low' })
  }

  // If only loom pick known and no colour/pick rows — do NOT invent weft PIC from loom pick
  // (TOTAL LOOM PICK ≠ individual weft PIC). Leave one empty weft for manual entry.
  if (!sourceRows.length) {
    sourceRows = [{ pic: '', strings: '', confidence: 'low' }]
  }

  const rows: WeftDraft[] = []
  for (let i = 0; i < sourceRows.length; i++) {
    const src = sourceRows[i]
    const feeder = ocr.feeders.find((f) => f.feederNo === i + 1)
    const feederNo = feeder?.feederNo ?? i + 1
    // Prefer Colour N when colour table was used; else Feeder N
    const feederLabel = feeder
      ? feeder.sourceLabel || `Colour ${feederNo}`
      : `Colour ${feederNo}`
    const pic = (src.pic || '').trim()
    const rawYarn = feeder ? normalizeYarnLabel(feeder.yarnType) : ''
    const yarnName = isBlankYarnName(rawYarn) ? '' : rawYarn

    let row: WeftDraft = {
      ...emptyWeft(i + 1, { lengthMtr: length, width: DEFAULT_WIDTH, feederNo }),
      feeder_label: feederLabel,
      feeder_no: feederNo,
      pic,
      width: String(DEFAULT_WIDTH),
      length_mtr: length,
      weft_name: yarnName,
      strings_ref: '',
    }
    if (yarnName) {
      row = applyWeftItemFromMaster(row, yarnName, rates, costingDate)
    }
    rows.push(row)
  }

  if (!rows.length) rows.push(emptyWeft(1, { lengthMtr: length }))
  return rows
}

export function detectMissingRates(
  warps: WarpDraft[],
  wefts: WeftDraft[],
  rates: RateMasterRow[],
  costingDate: string,
): MissingRateItem[] {
  const missing: MissingRateItem[] = []
  warps.forEach((row, idx) => {
    const name = row.yarn_name.trim()
    if (isBlankYarnName(name)) return
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return
    const found = lookupRateForCosting(rates, 'warp', name, costingDate, {
      denier: row.base_denier || undefined,
    })
    if (!found && !n(row.rate_per_kg)) missing.push({ category: 'warp', itemName: name, rowIndex: idx })
  })
  wefts.forEach((row, idx) => {
    const name = row.weft_name.trim()
    if (isBlankYarnName(name)) return
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return
    const found = lookupRateForCosting(rates, 'weft', name, costingDate, {
      denier: row.base_denier || undefined,
    })
    if (!found && !n(row.rate_per_kg)) missing.push({ category: 'weft', itemName: name, rowIndex: idx })
  })
  return missing
}

function n(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * @deprecated DIN Costing UI must NOT call this.
 * Feeder/Colour / Weft Name / PIC auto-fill from OCR was removed — Design No. only.
 * Kept for parser unit tests; do not wire back into DinDesignImportSection.
 */
export function applyOcrToCostingDraft(
  ocr: DesignOcrResult,
  opts: {
    designLength: string
    rates: RateMasterRow[]
    costingDate: string
    existingWarps?: WarpDraft[]
  },
): DesignOcrApplyResult {
  const wefts = mapOcrToWeftRows(ocr, opts.designLength, opts.rates, opts.costingDate)
  const warps = opts.existingWarps?.length ? opts.existingWarps : []

  // Always sync feeder yarn labels onto weft rows (live edit / re-apply)
  for (const feeder of ocr.feeders) {
    const idx = feeder.feederNo - 1
    if (idx < 0 || idx >= wefts.length) continue
    const yarn = normalizeYarnLabel(feeder.yarnType)
    const label = feeder.sourceLabel || `Colour ${feeder.feederNo}`
    if (isBlankYarnName(yarn)) {
      wefts[idx] = {
        ...wefts[idx],
        feeder_label: label,
        feeder_no: feeder.feederNo,
        weft_name: '',
        rate_per_kg: '',
        rate_source: undefined,
        rate_master_id: undefined,
      }
    } else {
      wefts[idx] = {
        ...applyWeftItemFromMaster(wefts[idx], yarn, opts.rates, opts.costingDate),
        feeder_label: label,
        feeder_no: feeder.feederNo,
      }
    }
  }

  return {
    warps,
    wefts,
    missingRates: detectMissingRates(warps, wefts, opts.rates, opts.costingDate),
  }
}

export async function checkDuplicateDin(dinNumber: string): Promise<{
  exists: boolean
  costingId?: string
  status?: string
  isLocked?: boolean
  source?: 'design_costing' | 'dins' | 'designs'
}> {
  const trimmed = dinNumber.trim()
  if (!trimmed) return { exists: false }

  const { data } = await supabase
    .from('design_costing')
    .select('id, status, is_locked')
    .eq('din_number', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data) {
    return {
      exists: true,
      costingId: data.id as string,
      status: data.status as string | undefined,
      isLocked: Boolean(data.is_locked),
      source: 'design_costing',
    }
  }

  // Shared identity: Design Intake / designs register may already hold this number
  const shared = await findSharedDesign(trimmed)
  if (shared) {
    return {
      exists: true,
      costingId: shared.costingId || undefined,
      status: shared.costingStatus || undefined,
      isLocked: shared.isLocked,
      source: shared.din ? 'dins' : shared.designsId ? 'designs' : 'design_costing',
    }
  }
  return { exists: false }
}

export async function uploadDesignReferenceImage(
  file: File,
  source: DesignImportSource,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const folder = source === 'gmail' ? 'gmail' : source
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  if (source === 'diary') {
    const { error } = await supabase.storage.from('costing-diary-images').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    })
    if (error) throw error
    const { data: pub } = supabase.storage.from('costing-diary-images').getPublicUrl(path)
    return pub.publicUrl
  }

  return uploadDinStorageObject(path, file)
}

/** Upload physical fabric sample photo — separate from DIN sheet OCR image. */
export async function uploadSampleImage(file: File, dinNumber?: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const din = (dinNumber || 'sample').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '') || 'sample'
  const path = `sample-images/${din}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  return uploadDinStorageObject(path, file)
}

/** Fetch image from URL (Gmail import) and run OCR. */
export async function readDesignReferenceFromUrl(
  imageUrl: string,
  hints?: { subject?: string; filename?: string },
): Promise<{ ocr: DesignOcrResult; file: File | null }> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`Could not fetch design image (${res.status})`)
    const blob = await res.blob()
    const name = hints?.filename || 'gmail-design.jpg'
    const file = new File([blob], name, { type: blob.type || 'image/jpeg' })
    const ocr = await readDesignReference(file, hints)
    return { ocr, file }
  } catch {
    return { ocr: emptyDesignOcrResult(), file: null }
  }
}
