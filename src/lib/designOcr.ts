/**
 * DIN / Design reference OCR — source-fidelity first.
 * Colour/Feeder rows: capture Pick only. Strings ignored (never used for costing).
 * TOTAL LOOM PICK: prefer labeled/printed value on the sheet.
 * When no printed total is found, suggest Σ feeder PIC with low confidence
 * ("Needs Manual Verification") — never silently invent or equal-split.
 * If printed total ≠ Σ feeder PIC → warning + user confirmation required.
 * Low confidence → leave field for manual verify (do not guess).
 */

import {
  DEFAULT_LENGTH_MTR,
  DEFAULT_WIDTH,
  emptyWeft,
  formatCostingDenier,
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
const LOOM_PICK_RE =
  /(?:total\s+)?loom[\s\-]*pick[\s:=\-]*(\d+(?:\.\d+)?)/i
const ON_LOOM_PICK_RE = /on[\s\-]*loom[\s\-:=]*(\d+(?:\.\d+)?)/i
/** Design-header style "112-pick" / "112 pick" near top — not a Colour row Pick. */
const HEADER_N_PICK_RE = /\b(\d{2,3})\s*[-–]?\s*pick\b/i
const TOTAL_LINE_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s*[/\s]\s*(\d+(?:\.\d+)?)/im
const TOTAL_NEXT_LINE_RE = /^total\s*[:.]?\s*$/im
/** Yarn + Pick (+ optional ignored Strings): "hsy 24 2230" / "hey = 24 | 2230" */
const YARN_PICK_LINE_RE =
  /\b([A-Za-z]{2,8})\b\s*[=:]?\s*(\d+(?:\.\d+)?|[-–—])(?:\s*[|/]?\s*\d{2,5}(?:\.\d+)?)?/

/** User-facing copy when OCR cannot confidently read a field. */
export const OCR_VERIFY_HINT = 'Needs Manual Verification'

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

/** Sum of feeder/colour PIC values — TOTAL WEFT PIC only (never forced onto TOTAL LOOM PICK). */
export function sumWeftPics(rows: Array<{ pic?: string | null }> | null | undefined): string {
  if (!rows?.length) return ''
  const sum = rows.reduce((s, r) => s + (Number(r?.pic) || 0), 0)
  if (sum < 0) return ''
  return String(Math.round(sum * 100) / 100)
}

/**
 * Clear Strings from OCR (never used for costing).
 * Does NOT invent or overwrite TOTAL LOOM PICK.
 */
export function clearOcrStrings(ocr: DesignOcrResult): DesignOcrResult {
  return {
    ...ocr,
    weftRows: ocr.weftRows.map((r) => ({ ...r, strings: '' })),
    totalStrings: emptyField(),
  }
}

/**
 * Resolve TOTAL LOOM PICK after feeder/colour PIC extraction.
 * - Printed/labeled loom pick wins when present.
 * - If missing, suggest Σ feeder PIC at low confidence (Needs Manual Verification).
 * - If printed ≠ Σ, keep printed value and attach a mismatch warning.
 * Strings are never used.
 */
export function ensureLoomPickFromFeederSum(ocr: DesignOcrResult): DesignOcrResult {
  const cleared = clearOcrStrings(ocr)
  const weftSum = sumWeftPics(cleared.weftRows)
  const printed = (cleared.loomPick.value || '').trim()
  const sumNum = nSafe(weftSum)
  const printedNum = nSafe(printed)

  let loomPick = cleared.loomPick
  let readWarning = cleared.readWarning

  if (printed && sumNum > 0 && printedNum > 0 && Math.abs(printedNum - sumNum) >= 0.01) {
    loomPick = {
      value: printed,
      confidence: printedNum > 0 ? (cleared.loomPick.confidence === 'high' ? 'high' : 'low') : 'low',
      source: cleared.loomPick.source || 'loom_pick_label',
    }
    readWarning =
      `TOTAL LOOM PICK (${printed}) differs from Σ feeder PIC (${weftSum}) — please verify and confirm.`
  } else if (!printed && weftSum) {
    loomPick = {
      value: weftSum,
      confidence: 'low',
      source: 'sum_feeder_pic_suggest',
    }
    readWarning =
      readWarning ||
      `${OCR_VERIFY_HINT} TOTAL LOOM PICK suggested from feeder PIC sum (${weftSum}) — confirm against the sheet.`
  }

  const totalPick = weftSum
    ? { value: weftSum, confidence: 'high' as const, source: 'sum_colour_picks' }
    : cleared.totalPick

  return { ...cleared, loomPick, totalPick, readWarning }
}

function nSafe(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Read TOTAL LOOM PICK directly from the DIN sheet text.
 * Only labeled / header sources. Never invent from Strings.
 * If uncertain → empty + missing (caller may suggest Σ feeder PIC at low confidence).
 */
export function extractLoomPick(text: string, _unusedFallback?: string): OcrField {
  void _unusedFallback
  const labeled =
    text.match(LOOM_PICK_RE) || text.match(ON_LOOM_PICK_RE)
  if (labeled?.[1]) {
    return { value: labeled[1], confidence: 'high', source: 'loom_pick_label' }
  }

  // Header region only (first ~12 lines): "112-pick" design total — not a Colour row
  const head = text.split(/\r?\n/).slice(0, 12).join('\n')
  const headerPick = head.match(HEADER_N_PICK_RE)
  if (headerPick?.[1]) {
    const v = Number(headerPick[1])
    // Typical loom pick range on these sheets; exclude tiny Colour picks misread as header
    if (v >= 40 && v <= 400) {
      return { value: headerPick[1], confidence: 'high', source: 'n_pick_header' }
    }
  }

  // Do NOT use colour-table "Total X Y" as printed TOTAL LOOM PICK (that is Σ picks / Strings).
  return emptyField()
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
  // Weft PIC sum is reference only — TOTAL LOOM PICK is read separately from the sheet
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
 * @deprecated Do not invent Pick by splitting TOTAL LOOM PICK.
 * Kept exported so callers fail closed (always returns '').
 */
export function suggestEqualPics(_loom: number, _rowCount: number): string {
  void _loom
  void _rowCount
  return ''
}

/**
 * Align Colour/Feeder review rows with what was actually read — never invent Pick values.
 * Missing picks stay blank with low/missing confidence for manual entry.
 */
export function ensureReviewFeederRows(ocr: DesignOcrResult): DesignOcrResult {
  const cleared = clearOcrStrings(ocr)
  const hasFeeders = cleared.feeders.length >= 1
  const hasWefts = cleared.weftRows.some((r) => (r.pic || '').trim() !== '')

  if (hasFeeders && hasWefts) {
    // Align weft rows 1:1 with feeder order — never shift picks between rows
    const maxNo = Math.max(
      ...cleared.feeders.map((f) => f.feederNo),
      cleared.weftRows.length,
    )
    const feeders: DesignOcrFeeder[] = []
    const weftRows: DesignOcrWeftRow[] = []
    for (let i = 1; i <= maxNo; i++) {
      const existingF = cleared.feeders.find((f) => f.feederNo === i)
      const existingW = cleared.weftRows[i - 1]
      feeders.push(
        existingF || {
          feederNo: i,
          yarnType: '-',
          confidence: 'missing',
          sourceLabel: `Colour ${i}`,
        },
      )
      const picRaw = (existingW?.pic || '').trim()
      weftRows.push({
        pic: picRaw,
        strings: '',
        confidence: picRaw
          ? existingW?.confidence || 'low'
          : existingF
            ? 'missing'
            : 'missing',
      })
    }
    const needsVerify =
      feeders.some((f, i) => {
        if (parseColourPickToken(weftRows[i]?.pic) === '0') return false
        return f.confidence === 'low' || f.confidence === 'missing'
      }) ||
      weftRows.some(
        (r) =>
          (r.confidence === 'low' || r.confidence === 'missing') &&
          parseColourPickToken(r.pic) !== '0',
      )
    return {
      ...cleared,
      feeders,
      weftRows,
      readWarning:
        cleared.readWarning ||
        (needsVerify
          ? `${OCR_VERIFY_HINT} Check Colour/Feeder and Pick rows before Confirm.`
          : undefined),
    }
  }

  // Detected Colour N labels but no picks — create empty rows (no invented picks)
  const inferred = inferColourRowCount(cleared.rawText || '')
  if (!hasFeeders && !hasWefts && inferred >= 1) {
    const feeders: DesignOcrFeeder[] = []
    const weftRows: DesignOcrWeftRow[] = []
    for (let i = 1; i <= Math.min(inferred, 6); i++) {
      feeders.push({
        feederNo: i,
        yarnType: '-',
        confidence: 'missing',
        sourceLabel: `Colour ${i}`,
      })
      weftRows.push({ pic: '', strings: '', confidence: 'missing' })
    }
    return {
      ...cleared,
      feeders,
      weftRows,
      readWarning:
        cleared.readWarning ||
        `${OCR_VERIFY_HINT} Colour rows detected but Pick values were not read — enter manually.`,
    }
  }

  // Feeders without wefts (or vice versa) — pad blanks only, never invent numbers
  if (hasFeeders && !hasWefts) {
    return {
      ...cleared,
      weftRows: cleared.feeders.map(() => ({
        pic: '',
        strings: '',
        confidence: 'missing' as const,
      })),
      readWarning:
        cleared.readWarning ||
        `${OCR_VERIFY_HINT} Pick column not read — enter Pick for each Colour/Feeder.`,
    }
  }

  return cleared
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
 * Colour/Feeder Pick → Weft PIC rows. Strings ignored.
 * TOTAL LOOM PICK read from sheet (separate from Σ Weft PIC).
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

  // Strings never used for costing — store cleared
  result.totalStrings = emptyField()
  // totalPick = Σ weft colour picks (reference / TOTAL WEFT PIC only — NOT loom pick)
  result.totalPick = colour.totalPick
    ? { value: colour.totalPick, confidence: 'high', source: 'sum_colour_picks' }
    : sumWeftPics(result.weftRows)
      ? { value: sumWeftPics(result.weftRows), confidence: 'high', source: 'sum_colour_picks' }
      : emptyField()

  if (!result.weftRows.length) {
    const formatA = extractFormatAStringPair(normalized)
    if (formatA) {
      result.weftRows = []
    }
  }

  result.rawText = normalized
  // Printed TOTAL LOOM PICK from sheet label; ensureLoomPickFromFeederSum may suggest Σ if missing
  result.loomPick = extractLoomPick(normalized)
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
  return clearOcrStrings(merged)
}

/** Downscale / preprocess DIN sheet photos for table-aware Tesseract OCR. */

type RenderOpts = {
  tableCrop?: boolean
  /** Top band: Design No. + TOTAL LOOM PICK */
  headerCrop?: boolean
  /** Horizontal strip for one Colour row (0-based among top table rows) */
  rowStrip?: number
  rowStripCount?: number
  maxEdge?: number
  upscale?: number
  contrast?: number
  sharpen?: boolean
  brightness?: number
}

/**
 * Render file to JPEG with rotation, contrast, optional sharpen, and region crops.
 * Regions: full page, header (DIN/loom), left table, or individual Colour row strips.
 */
async function renderImageBlob(
  file: File,
  rotateDeg: 0 | 90 | 180 | 270,
  opts?: RenderOpts,
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
    const maxEdge = opts?.maxEdge ?? 2000
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
    const contrast = opts?.contrast ?? 1.35
    const brightness = opts?.brightness ?? 1.06
    ctx.filter = `contrast(${contrast}) saturate(0.08) brightness(${brightness})`
    ctx.drawImage(bitmap, 0, 0, sw, sh)
    ctx.restore()
    bitmap.close()

    // Optional unsharp-mask style pass via contrast redraw
    if (opts?.sharpen !== false) {
      try {
        const imgData = ctx.getImageData(0, 0, cw, ch)
        const d = imgData.data
        // Mild threshold boost on dark text against light paper
        for (let i = 0; i < d.length; i += 4) {
          const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          const v = g < 140 ? Math.max(0, g * 0.82) : Math.min(255, g * 1.08)
          d[i] = d[i + 1] = d[i + 2] = v
        }
        ctx.putImageData(imgData, 0, 0)
      } catch {
        /* getImageData may fail on tainted canvas — skip */
      }
    }

    let outCanvas: OffscreenCanvas = canvas
    if (opts?.headerCrop) {
      const tw = Math.round(cw * 0.72)
      const th = Math.round(ch * 0.28)
      const crop = new OffscreenCanvas(tw, th)
      const cctx = crop.getContext('2d')
      if (cctx) {
        cctx.fillStyle = '#fff'
        cctx.fillRect(0, 0, tw, th)
        cctx.filter = 'contrast(1.7) saturate(0.02) brightness(1.1)'
        cctx.drawImage(canvas, 0, 0, tw, th, 0, 0, tw, th)
        outCanvas = crop
      }
    } else if (opts?.tableCrop) {
      const y0 = Math.round(ch * 0.06)
      const tw = Math.round(cw * 0.55)
      const th = Math.round(ch * 0.58)
      const crop = new OffscreenCanvas(tw, th)
      const cctx = crop.getContext('2d')
      if (cctx) {
        cctx.fillStyle = '#fff'
        cctx.fillRect(0, 0, tw, th)
        cctx.filter = 'contrast(1.9) saturate(0.02) brightness(1.1)'
        cctx.drawImage(canvas, 0, y0, tw, th, 0, 0, tw, th)
        outCanvas = crop

        if (opts.rowStrip != null && opts.rowStrip >= 0) {
          const n = Math.max(2, opts.rowStripCount || 4)
          const bandH = Math.max(24, Math.round(th / (n + 1)))
          const y = Math.min(th - bandH, Math.round(opts.rowStrip * bandH * 0.95 + th * 0.12))
          const row = new OffscreenCanvas(tw, bandH)
          const rctx = row.getContext('2d')
          if (rctx) {
            rctx.fillStyle = '#fff'
            rctx.fillRect(0, 0, tw, bandH)
            rctx.filter = 'contrast(2.1) saturate(0) brightness(1.12)'
            rctx.drawImage(crop, 0, y, tw, bandH, 0, 0, tw, bandH)
            outCanvas = row
          }
        }
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

    return await outCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.94 })
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
  if (colourParsed.feeders.length < 1 && colourParsed.weftRows.length < 1) return base

  const feeders = [...base.feeders]
  const weftRows = [...base.weftRows]

  for (const f of colourParsed.feeders) {
    const idx = feeders.findIndex((x) => x.feederNo === f.feederNo)
    if (idx >= 0) {
      // Prefer non-blank yarn; keep higher confidence
      const cur = feeders[idx]
      const curBlank = isBlankYarnName(cur.yarnType)
      const nextBlank = isBlankYarnName(f.yarnType)
      if ((curBlank && !nextBlank) || (f.confidence === 'high' && cur.confidence !== 'high')) {
        feeders[idx] = { ...f, sourceLabel: f.sourceLabel || `Colour ${f.feederNo}` }
      }
    } else {
      feeders.push({ ...f, sourceLabel: f.sourceLabel || `Colour ${f.feederNo}` })
    }
  }
  feeders.sort((a, b) => a.feederNo - b.feederNo)

  // Align weft picks 1:1 by Colour index — never shift
  const maxNo = Math.max(
    feeders.length ? Math.max(...feeders.map((f) => f.feederNo)) : 0,
    colourParsed.weftRows.length,
    weftRows.length,
  )
  const nextWefts: DesignOcrWeftRow[] = []
  for (let i = 0; i < maxNo; i++) {
    const fromStrip = colourParsed.weftRows[i]
    const fromBase = weftRows[i]
    const stripPic = (fromStrip?.pic || '').trim()
    const basePic = (fromBase?.pic || '').trim()
    if (stripPic !== '') {
      nextWefts.push({ pic: stripPic, strings: '', confidence: fromStrip!.confidence })
    } else if (basePic !== '') {
      nextWefts.push({ pic: basePic, strings: '', confidence: fromBase!.confidence })
    } else {
      nextWefts.push({ pic: '', strings: '', confidence: 'missing' })
    }
  }

  const merged: DesignOcrResult = {
    ...base,
    feeders,
    weftRows: nextWefts,
    rawText: [base.rawText, colourText].filter(Boolean).join('\n---table---\n'),
  }
  if (!merged.loomPick.value && colourParsed.loomPick.value) merged.loomPick = colourParsed.loomPick
  if (!merged.totalPick.value && colourParsed.totalPick.value) merged.totalPick = colourParsed.totalPick
  return clearOcrStrings(merged)
}

/**
 * Client-side Tesseract.js OCR — table-aware DIN sheet pipeline.
 * 1) Auto-rotate (multi-orientation) + contrast/sharpen full page
 * 2) Header crop → Design No. + TOTAL LOOM PICK
 * 3) Left-table crop → Colour/Feeder grid
 * 4) Individual Colour row strips → cell-level Pick/yarn (no invented values)
 */
async function ocrViaTesseract(
  file: File,
  hints?: { subject?: string; filename?: string },
): Promise<{ text: string; parsed: DesignOcrResult }> {
  const empty = { text: '', parsed: emptyDesignOcrResult() }
  const deadline = Date.now() + 55_000
  try {
    const mod = await import('tesseract.js')
    const rotations: Array<0 | 90 | 180 | 270> = [90, 270, 0, 180]
    let bestText = ''
    let bestParsed = emptyDesignOcrResult()
    let bestScore = -1
    let bestDeg: 0 | 90 | 180 | 270 = 90

    async function recognizeBlob(blob: Blob | File, ms = 12_000): Promise<string> {
      const input =
        blob instanceof File
          ? blob
          : new File([blob], file.name || 'din-sheet.jpg', { type: blob.type || 'image/jpeg' })
      const result = await Promise.race([
        mod.recognize(input, 'eng'),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ])
      return (result?.data.text || '').trim()
    }

    // Pass 1: full-page orientations
    for (const deg of rotations) {
      if (Date.now() > deadline) break
      const blob =
        (await renderImageBlob(file, deg, {
          maxEdge: 1800,
          contrast: 1.4,
          sharpen: true,
          brightness: 1.06,
        })) || (deg === 0 ? file : null)
      if (!blob) continue
      try {
        const text = await recognizeBlob(blob, 14_000)
        if (!text) continue
        const parsed = clearOcrStrings(parseDesignReferenceText(text, hints))
        const score = scoreOcrParse(parsed) + Math.min(3, Math.floor(text.length / 200))
        if (score > bestScore) {
          bestScore = score
          bestText = text
          bestParsed = parsed
          bestDeg = deg
        }
        if (parsed.designNumber.value && parsed.feeders.length >= 1 && parsed.loomPick.value) break
      } catch {
        /* next rotation */
      }
    }

    // Pass 2: header crop for Design No. + TOTAL LOOM PICK (source labels)
    if (Date.now() < deadline) {
      const headerBlob = await renderImageBlob(file, bestDeg, {
        headerCrop: true,
        maxEdge: 2000,
        upscale: 1.4,
        contrast: 1.6,
        sharpen: true,
      })
      if (headerBlob) {
        try {
          const headerText = await recognizeBlob(headerBlob, 10_000)
          if (headerText) {
            const headerParsed = parseDesignReferenceText(headerText, hints)
            bestText = [bestText, headerText].filter(Boolean).join('\n---header---\n')
            if (
              headerParsed.designNumber.value &&
              (headerParsed.designNumber.confidence === 'high' ||
                !bestParsed.designNumber.value)
            ) {
              bestParsed = { ...bestParsed, designNumber: headerParsed.designNumber }
              if (headerParsed.qualityName.value) {
                bestParsed = { ...bestParsed, qualityName: headerParsed.qualityName }
              }
            }
            if (
              headerParsed.loomPick.value &&
              (headerParsed.loomPick.confidence === 'high' || !bestParsed.loomPick.value)
            ) {
              bestParsed = { ...bestParsed, loomPick: headerParsed.loomPick }
            }
          }
        } catch {
          /* keep prior */
        }
      }
    }

    // Pass 3: left-table crop for Colour/Feeder + Pick grid
    if (bestParsed.feeders.length < 1 && Date.now() < deadline) {
      const tableDegs = [bestDeg, 90, 270, 0].filter((v, i, a) => a.indexOf(v) === i) as Array<
        0 | 90 | 180 | 270
      >
      for (const deg of tableDegs) {
        if (Date.now() > deadline) break
        const blob = await renderImageBlob(file, deg, {
          tableCrop: true,
          maxEdge: 2000,
          upscale: 1.6,
          contrast: 1.75,
          sharpen: true,
        })
        if (!blob) continue
        try {
          const text = await recognizeBlob(blob, 12_000)
          if (!text) continue
          const merged = mergeColourParse(bestParsed, text, hints)
          if (merged.feeders.length > bestParsed.feeders.length) {
            bestParsed = merged
            bestText = [bestText, text].filter(Boolean).join('\n---table---\n')
            bestDeg = deg
          }
          if (bestParsed.feeders.length >= 2) break
        } catch {
          /* continue */
        }
      }
    }

    // Pass 4: individual Colour row strips — cell-level read, 1:1 Pick mapping
    if (Date.now() < deadline) {
      const stripCount = Math.max(3, Math.min(6, inferColourRowCount(bestText) || 4))
      for (let row = 0; row < stripCount; row++) {
        if (Date.now() > deadline) break
        const stripBlob = await renderImageBlob(file, bestDeg, {
          tableCrop: true,
          rowStrip: row,
          rowStripCount: stripCount,
          maxEdge: 2000,
          upscale: 1.8,
          contrast: 1.85,
          sharpen: true,
        })
        if (!stripBlob) continue
        try {
          const stripText = await recognizeBlob(stripBlob, 8_000)
          if (!stripText) continue
          bestText = [bestText, stripText].filter(Boolean).join(`\n---row${row + 1}---\n`)
          const stripParsed = parseDesignReferenceText(stripText, hints)
          // Merge only Colour rows that were actually read in this strip — never invent
          if (stripParsed.feeders.length || stripParsed.weftRows.length) {
            bestParsed = mergeColourParse(bestParsed, stripText, hints)
          }
        } catch {
          /* next strip */
        }
      }
    }

    bestParsed = ensureLoomPickFromFeederSum(ensureReviewFeederRows(clearOcrStrings(bestParsed)))
    // Re-extract printed loom pick from combined text so header pass wins over noise
    const loomFromAll = extractLoomPick(bestText)
    if (loomFromAll.value) {
      bestParsed = ensureLoomPickFromFeederSum({ ...bestParsed, loomPick: loomFromAll })
    } else if (!bestParsed.loomPick.value) {
      bestParsed = {
        ...bestParsed,
        loomPick: emptyField(),
        readWarning:
          bestParsed.readWarning ||
          `${OCR_VERIFY_HINT} TOTAL LOOM PICK was not found on the sheet.`,
      }
      bestParsed = ensureLoomPickFromFeederSum(bestParsed)
    }

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
  let result = ensureLoomPickFromFeederSum(ensureReviewFeederRows(clearOcrStrings(parsed)))

  // Filename / subject may carry Design No. when image OCR missed it (not a guess — source hint)
  if (!result.designNumber.value.trim()) {
    const fromHints = parseDesignReferenceText(
      [hints?.subject, hints?.filename, file.name].filter(Boolean).join('\n'),
      hints,
    )
    if (fromHints.designNumber.value) {
      result = {
        ...result,
        designNumber: { ...fromHints.designNumber, source: fromHints.designNumber.source || 'filename' },
        qualityName:
          fromHints.qualityName.value && !result.qualityName.value
            ? fromHints.qualityName
            : result.qualityName,
      }
    }
  }

  // Suggest Σ feeder PIC only at low confidence when printed loom pick missing
  result = ensureLoomPickFromFeederSum(result)

  const needsVerify =
    result.designNumber.confidence !== 'high' ||
    !result.loomPick.value ||
    result.loomPick.confidence === 'low' ||
    result.loomPick.confidence === 'missing' ||
    result.feeders.some((f) => f.confidence === 'low' || f.confidence === 'missing') ||
    result.weftRows.some(
      (r) =>
        (r.confidence === 'low' || r.confidence === 'missing') &&
        parseColourPickToken(r.pic) !== '0',
    )

  const warning = !ocrHasDetectedFields(result)
    ? `${OCR_VERIFY_HINT} Enter Design No., TOTAL LOOM PICK, and Colour/Pick manually.`
    : result.readWarning
      ? result.readWarning
      : needsVerify
        ? `${OCR_VERIFY_HINT} Review every field against the DIN image before Confirm.`
        : undefined

  return attachReadMeta({ ...result, rawText: text || result.rawText }, 'tesseract', warning)
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
    // Common colour words from OCR colour column → Colour Master field (not Rate Master yarn)
    const colourGuess =
      yarnName &&
      /^(white|black|gold|silver|red|blue|green|yellow|maroon|cream|beige|brown|pink|orange|grey|gray)$/i.test(
        yarnName,
      )
        ? yarnName.charAt(0).toUpperCase() + yarnName.slice(1).toLowerCase()
        : ''

    let row: WeftDraft = {
      ...emptyWeft(i + 1, {
        lengthMtr: length,
        width: DEFAULT_WIDTH,
        feederNo,
        colour: colourGuess,
      }),
      feeder_label: feederLabel.startsWith('Colour')
        ? `Feeder ${feederNo}`
        : feederLabel,
      feeder_no: feederNo,
      colour: colourGuess,
      pic,
      width: String(DEFAULT_WIDTH),
      length_mtr: length,
      weft_name: colourGuess ? '' : yarnName,
      strings_ref: '',
    }
    if (yarnName && !colourGuess) {
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
    const costingDenier = formatCostingDenier(row)
    const found = lookupRateForCosting(rates, 'warp', name, costingDate, {
      denier: costingDenier || row.base_denier || undefined,
    })
    if (!found && !n(row.rate_per_kg)) missing.push({ category: 'warp', itemName: name, rowIndex: idx })
  })
  wefts.forEach((row, idx) => {
    const name = row.weft_name.trim()
    if (isBlankYarnName(name)) return
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return
    const costingDenier = formatCostingDenier(row)
    const found = lookupRateForCosting(rates, 'weft', name, costingDate, {
      denier: costingDenier || row.base_denier || undefined,
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
 * Map OCR confirmation → Warp/Weft costing drafts.
 * Colour/Feeder N maps 1:1 to Weft PIC. Strings never used.
 * Rate Master lookup uses COSTING denier (base + 10).
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
