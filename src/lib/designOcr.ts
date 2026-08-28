/**
 * DIN / Design reference OCR — parse, map to costing rows, Rate Master lookup.
 * Supports multiple visual formats (Pick/Strings table, Feeders, Loom Pick).
 */

import { emptyWeft, type WeftDraft, type WarpDraft } from './designWiseCosting'
import {
  applyWeftItemFromMaster,
} from './dinIntakeCosting'
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
}

export type DesignOcrWeftRow = {
  pic: string
  strings: string
  confidence: FieldConfidence
}

export type DesignOcrReadSource = 'external' | 'edge' | 'tesseract'

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
const DESIGN_NO_HYPHEN_RE = /\b([A-Z]{2,5})[\s\-]+(\d{3,6})(?:-[A-Za-z0-9]+)?\b/gi
const PHONE_RE = /\b\d{10,}\b/
const LOOM_PICK_RE = /(?:loom[\s-]*pick|loom\s*pick)[\s:=-]*(\d+(?:\.\d+)?)/i
const PICK_ONLY_RE = /\b(\d+(?:\.\d+)?)\s*pick\b/i
/** Yarn codes may be letters (HSY, ZAREE) or numeric denier/codes (37, 80/2). */
const FEEDER_RE =
  /(?:feeder|fd)[\s.-]*(\d+)\s*[=:\-]?\s*([A-Z0-9][A-Z0-9./-]{0,15})/gi
/** Colour / Color N rows: yarn (optional) + Pick + Strings */
const COLOUR_ROW_RE =
  /^(?:colour|color|col\.?)\s*(\d+)\s*(?:[|:.\-]\s*|\s+)(.*)$/i
const PICK_STRINGS_HEADER = /pick\s*strings|(?:\d+\s*[-–]?\s*pick).*(?:pick|strings)/i
const TOTAL_LINE_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s*[/\s]\s*(\d+(?:\.\d+)?)/im
const TOTAL_NEXT_LINE_RE = /^total\s*[:.]?\s*$/im
const TOTAL_COLOUR_RE = /^total\s*[:.]?\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/im

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

/** Reject phone numbers, filenames-only noise, etc. */
export function isLikelyDesignNumber(value: string, subject?: string, filename?: string): boolean {
  const v = value.trim().toUpperCase()
  if (!v || v.length < 5) return false
  if (PHONE_RE.test(v)) return false
  if (!/^[A-Z]{2,5}\d{3,6}$/.test(v)) return false
  if (filename && filename.toUpperCase().includes(v) && subject && !subject.toUpperCase().includes(v)) {
    return false
  }
  return true
}

function pickBestDesignNumber(
  candidates: Array<{ value: string; source: string; score: number }>,
  subject?: string,
  filename?: string,
): OcrField {
  const filtered = candidates.filter((c) => isLikelyDesignNumber(c.value, subject, filename))
  if (!filtered.length) return emptyField()
  filtered.sort((a, b) => b.score - a.score)
  const best = filtered[0]
  return {
    value: best.value.toUpperCase(),
    confidence: best.score >= 8 ? 'high' : 'low',
    source: best.source,
  }
}

function scanDesignNumberCandidates(
  text: string,
  sourceLabel: string,
  baseScore: number,
  lineIdx?: number,
  lineCount?: number,
): Array<{ value: string; source: string; score: number }> {
  const candidates: Array<{ value: string; source: string; score: number }> = []
  const upper = text.toUpperCase()

  let m: RegExpExecArray | null
  const compactRe = new RegExp(DESIGN_NO_RE.source, 'g')
  while ((m = compactRe.exec(upper)) !== null) {
    let score = baseScore
    if (lineIdx != null) {
      if (lineIdx <= 2) score += 3
      if (lineCount != null && lineIdx >= lineCount - 3) score += 2
      if (/design|desi|din|jfg/i.test(text)) score += 2
    }
    candidates.push({ value: m[1], source: sourceLabel, score })
  }

  const hyphenRe = new RegExp(DESIGN_NO_HYPHEN_RE.source, 'gi')
  while ((m = hyphenRe.exec(text)) !== null) {
    let score = baseScore + 1
    if (lineIdx != null) {
      if (lineIdx <= 2) score += 3
      if (lineCount != null && lineIdx >= lineCount - 3) score += 2
      if (/design|desi|din|jfg/i.test(text)) score += 2
    }
    candidates.push({ value: `${m[1].toUpperCase()}${m[2]}`, source: sourceLabel, score })
  }

  return candidates
}

function extractDesignNumbers(text: string, subject?: string, filename?: string): OcrField {
  const candidates: Array<{ value: string; source: string; score: number }> = []

  // Filename / subject are more reliable than noisy browser OCR (e.g. HG1674 vs JFG1674)
  if (subject) candidates.push(...scanDesignNumberCandidates(subject, 'email_subject', 10))
  if (filename) candidates.push(...scanDesignNumberCandidates(filename, 'filename', 12))

  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    candidates.push(...scanDesignNumberCandidates(line, 'ocr_text', 5, idx, lines.length))
  })

  return pickBestDesignNumber(candidates, subject, filename)
}

function extractLoomPick(text: string, fallbackFromRows?: string): OcrField {
  const loom = text.match(LOOM_PICK_RE)
  if (loom?.[1]) return { value: loom[1], confidence: 'high', source: 'loom_pick' }

  const totals = extractTotals(text)
  const nPickMatches = [...text.matchAll(/\b(\d{2,4})\s*[-–]?\s*pick\b/gi)].map((m) => m[1])
  if (nPickMatches.length) {
    if (totals.totalPick.value && nPickMatches.includes(totals.totalPick.value)) {
      return { value: totals.totalPick.value, confidence: 'high', source: 'n_pick_header' }
    }
    // Loom pick is the design total — take the largest N-pick header (e.g. 112-pick over stray 37)
    const best = nPickMatches.reduce((a, b) => (Number(b) > Number(a) ? b : a))
    return { value: best, confidence: 'high', source: 'n_pick_header' }
  }

  if (totals.totalPick.value) {
    return { value: totals.totalPick.value, confidence: totals.totalPick.confidence, source: 'total_pick' }
  }

  const pickOnly = text.match(PICK_ONLY_RE)
  if (pickOnly?.[1]) return { value: pickOnly[1], confidence: 'low', source: 'pick_label' }

  if (fallbackFromRows) {
    return { value: fallbackFromRows, confidence: 'low', source: 'sum_colour_picks' }
  }
  return emptyField()
}

function extractFeeders(text: string): DesignOcrFeeder[] {
  const feeders: DesignOcrFeeder[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(FEEDER_RE.source, 'gi')
  while ((m = re.exec(text)) !== null) {
    const no = Number(m[1])
    const yarn = normalizeYarnLabel(m[2] || '')
    if (!no || feeders.some((f) => f.feederNo === no)) continue
    feeders.push({ feederNo: no, yarnType: yarn, confidence: 'high' })
  }
  feeders.sort((a, b) => a.feederNo - b.feederNo)
  return feeders
}

/**
 * Parse Colour 1 / Colour 2 / Colour 3 table rows (common jacquard sheet layout).
 * Empty yarn cell → "-" dash; yarn like "zaree" → ZARI; Pick → pic; Strings optional.
 */
export function extractColourTable(text: string): {
  feeders: DesignOcrFeeder[]
  weftRows: DesignOcrWeftRow[]
  totalPick: string
  totalStrings: string
} {
  type ColourEntry = { no: number; yarn: string; pic: string; strings: string; confidence: FieldConfidence }
  const entries: ColourEntry[] = []
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
    if (!no || no > 6) continue
    if (entries.some((e) => e.no === no)) continue

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
      yarnRaw = yarnRaw.replace(lastTwo, '').trim()
      yarnRaw = yarnRaw.replace(/^[\s|:.\-]+|[\s|:.\-]+$/g, '').trim()
      if (/^\d+(\.\d+)?$/.test(yarnRaw) || yarnRaw.length > 24) yarnRaw = ''

      entries.push({
        no,
        yarn: normalizeYarnLabel(yarnRaw),
        pic,
        strings: Number(strings) > 0 ? strings : '',
        confidence: 'high',
      })
    } else if (nums.length === 1 && Number(nums[0]) > 0) {
      let yarnRaw = rest.replace(nums[0], '').trim().replace(/^[\s|:.\-]+|[\s|:.\-]+$/g, '')
      if (/^\d+(\.\d+)?$/.test(yarnRaw)) yarnRaw = ''
      entries.push({
        no,
        yarn: normalizeYarnLabel(yarnRaw),
        pic: nums[0],
        strings: '',
        confidence: 'low',
      })
    }
  }

  entries.sort((a, b) => a.no - b.no)
  return {
    feeders: entries.map((e) => ({
      feederNo: e.no,
      yarnType: e.yarn,
      confidence: e.yarn === '-' ? 'low' : 'high',
    })),
    weftRows: entries.map((e) => ({
      pic: e.pic,
      strings: e.strings,
      confidence: e.confidence,
    })),
    totalPick,
    totalStrings,
  }
}

/** Parse Pick / Strings table rows in document order (exclude Total line). */
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

    const pair =
      line.match(/^(\d+(?:\.\d+)?)\s*[/|,]\s*(\d+(?:\.\d+)?)\s*$/) ||
      line.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)

    if (pair && inTable) {
      rows.push({
        pic: pair[1],
        strings: pair[2],
        confidence: 'high',
      })
      continue
    }
  }

  return rows
}

function extractTotals(text: string): { totalPick: OcrField; totalStrings: OcrField } {
  const inline = text.match(TOTAL_COLOUR_RE) || text.match(TOTAL_LINE_RE)
  if (inline) {
    return {
      totalPick: { value: inline[1], confidence: 'high', source: 'total_line' },
      totalStrings: { value: inline[2], confidence: 'high', source: 'total_line' },
    }
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    if (TOTAL_NEXT_LINE_RE.test(lines[i]) && lines[i + 1]) {
      const m = lines[i + 1].match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/)
      if (m) {
        return {
          totalPick: { value: m[1], confidence: 'high', source: 'total_line' },
          totalStrings: { value: m[2], confidence: 'high', source: 'total_line' },
        }
      }
    }
  }
  return { totalPick: emptyField(), totalStrings: emptyField() }
}

/** Format A: "315 / 315 Strings" single width pair */
function extractFormatAStringPair(text: string): DesignOcrWeftRow | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*[/]\s*(\d+(?:\.\d+)?)\s*strings/i)
  if (!m) return null
  return { pic: '', strings: m[2], confidence: 'low' }
}

/**
 * Parse OCR / vision text into structured design fields.
 * Preserves Pick/Strings row order for weft mapping.
 * Supports Colour 1/2/3 tables (112-pick sheets) and Feeder / Pick-Strings formats.
 */
export function parseDesignReferenceText(
  text: string,
  hints?: { subject?: string; filename?: string },
): DesignOcrResult {
  const normalized = text.replace(/\u00a0/g, ' ').trim()
  const result = emptyDesignOcrResult()
  if (!normalized) return result

  result.designNumber = extractDesignNumbers(normalized, hints?.subject, hints?.filename)

  const colour = extractColourTable(normalized)
  const classicFeeders = extractFeeders(normalized)
  const classicWefts = extractWeftPickRows(normalized)

  if (colour.feeders.length >= 1) {
    result.feeders = colour.feeders
    result.weftRows = colour.weftRows
  } else {
    result.feeders = classicFeeders
    result.weftRows = classicWefts
  }

  const totals = extractTotals(normalized)
  result.totalPick = colour.totalPick
    ? { value: colour.totalPick, confidence: 'high', source: 'colour_total' }
    : totals.totalPick
  result.totalStrings = colour.totalStrings
    ? { value: colour.totalStrings, confidence: 'high', source: 'colour_total' }
    : totals.totalStrings

  const sumPics = result.weftRows.reduce((s, r) => s + (Number(r.pic) || 0), 0)
  const sumFallback = sumPics > 0 ? String(Math.round(sumPics * 100) / 100) : ''
  result.loomPick = extractLoomPick(
    normalized,
    result.totalPick.value || sumFallback || undefined,
  )
  // Prefer explicit total pick as loom pick when header missing
  if (!result.loomPick.value && result.totalPick.value) {
    result.loomPick = { ...result.totalPick, source: result.totalPick.source || 'total_pick' }
  }

  if (!result.weftRows.length) {
    const formatA = extractFormatAStringPair(normalized)
    if (formatA) result.weftRows = [formatA]
    else if (result.loomPick.value && result.totalStrings.value) {
      result.weftRows = [
        {
          pic: result.loomPick.value,
          strings: result.totalStrings.value,
          confidence: 'low',
        },
      ]
    }
  }

  result.rawText = normalized
  return result
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
    merged.designNumber = {
      value: api.designNumber.value.toUpperCase(),
      confidence: api.designNumber.confidence || 'high',
      source: api.designNumber.source || 'vision',
    }
  }
  if (api.loomPick?.value) merged.loomPick = { ...api.loomPick, source: api.loomPick.source || 'vision' }
  if (api.qualityName?.value) merged.qualityName = api.qualityName
  if (api.totalPick?.value) merged.totalPick = api.totalPick
  if (api.totalStrings?.value) merged.totalStrings = api.totalStrings

  if (api.feeders?.length) {
    merged.feeders = api.feeders.map((f) => ({
      feederNo: f.feederNo,
      yarnType: normalizeYarnLabel(f.yarnType || ''),
      confidence: f.confidence || 'high',
    }))
  }

  if (api.weftRows?.length) {
    merged.weftRows = api.weftRows.map((r) => ({
      pic: r.pic || '',
      strings: r.strings || '',
      confidence: r.confidence || 'high',
    }))
  }

  merged.rawText = text || api.rawText
  return merged
}

async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  const mediaType = file.type || 'image/jpeg'
  return { base64, mediaType }
}

async function ocrViaTesseract(file: File): Promise<string> {
  try {
    const mod = await import('tesseract.js')
    const result = await mod.recognize(file, 'eng')
    return result.data.text || ''
  } catch {
    return ''
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

/** Invoke design-ocr edge function; falls back to client Tesseract + regex parser. */
export async function readDesignReference(
  file: File,
  hints?: { subject?: string; filename?: string },
): Promise<DesignOcrResult> {
  const endpoint = import.meta.env.VITE_OCR_API_URL as string | undefined
  if (endpoint) {
    const body = new FormData()
    body.append('file', file)
    if (hints?.subject) body.append('subject', hints.subject)
    if (hints?.filename) body.append('filename', hints.filename)
    const res = await fetch(endpoint, { method: 'POST', body })
    if (res.ok) {
      const json = (await res.json()) as { text?: string; result?: Partial<DesignOcrResult> }
      const merged = mergeDesignOcrPayload(json.result || null, json.text || '', hints)
      return attachReadMeta(merged, 'external')
    }
  }

  let edgeError: string | undefined
  try {
    const { base64, mediaType } = await fileToBase64(file)
    const { data, error } = await supabase.functions.invoke('design-ocr', {
      body: {
        image_base64: base64,
        media_type: mediaType,
        subject: hints?.subject,
        filename: hints?.filename,
      },
    })
    if (error) {
      edgeError = error.message || 'Design OCR service unavailable'
    } else if (data?.error) {
      edgeError = String(data.error)
    } else if (data) {
      const text = String(data.raw_text || '')
      const merged = mergeDesignOcrPayload(data as Partial<DesignOcrResult>, text, hints)
      return attachReadMeta(merged, 'edge')
    }
  } catch (e) {
    edgeError = e instanceof Error ? e.message : 'Design OCR service unavailable'
  }

  const text = await ocrViaTesseract(file)
  const parsed = parseDesignReferenceText(text, hints)
  const warning =
    edgeError && !ocrHasDetectedFields(parsed)
      ? `${edgeError}. Browser OCR also could not read this sheet — enter details manually or retry with a clearer photo.`
      : edgeError
        ? `${edgeError}. Showing browser OCR results — review fields below.`
        : !ocrHasDetectedFields(parsed)
          ? 'Could not read design sheet from this image. Try a clearer photo, or open DIN Costing for manual entry.'
          : undefined
  return attachReadMeta(parsed, 'tesseract', warning)
}

/** Map OCR review → weft rows (Pick → PIC, Strings → Width optional) preserving order. */
export function mapOcrToWeftRows(
  ocr: DesignOcrResult,
  designLength: string,
  rates: RateMasterRow[],
  costingDate: string,
): WeftDraft[] {
  const defaultPic = (ocr.loomPick.value || ocr.totalPick.value || '').trim()
  const maxFeederNo = ocr.feeders.reduce((m, f) => Math.max(m, f.feederNo), 0)

  let sourceRows: DesignOcrWeftRow[]
  if (ocr.weftRows.length > 0) {
    sourceRows = [...ocr.weftRows]
  } else if (ocr.feeders.length > 0) {
    // One costing row per feeder when Pick/Strings table was not readable
    sourceRows = ocr.feeders.map(() => ({
      pic: '',
      strings: '',
      confidence: 'low' as const,
    }))
  } else {
    sourceRows = [
      {
        pic: defaultPic,
        strings: '',
        confidence: 'low' as const,
      },
    ]
  }

  // Pad so every detected feeder gets a weft line (FD3 → index 2)
  while (sourceRows.length < maxFeederNo) {
    sourceRows.push({ pic: '', strings: '', confidence: 'low' })
  }

  const rows: WeftDraft[] = []
  for (let i = 0; i < sourceRows.length; i++) {
    const src = sourceRows[i]
    const feeder = ocr.feeders.find((f) => f.feederNo === i + 1)
    const pic = (src.pic || '').trim() || (i === 0 && sourceRows.length === 1 ? defaultPic : '')
    // Strings / width is optional — never block costing; leave blank when missing
    const width = (src.strings || '').trim()
    const rawYarn = feeder ? normalizeYarnLabel(feeder.yarnType) : ''
    let row: WeftDraft = {
      ...emptyWeft(i + 1),
      pic,
      width,
      length_mtr: designLength,
      weft_name: rawYarn,
    }
    if (rawYarn && !isBlankYarnName(rawYarn)) {
      row = applyWeftItemFromMaster(row, rawYarn, rates, costingDate)
    }
    rows.push(row)
  }

  if (!rows.length) rows.push(emptyWeft(1))
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
    const found = lookupRateForCosting(rates, 'warp', name, costingDate, { denier: row.denier })
    if (!found && !n(row.rate_per_kg)) missing.push({ category: 'warp', itemName: name, rowIndex: idx })
  })
  wefts.forEach((row, idx) => {
    const name = row.weft_name.trim()
    if (isBlankYarnName(name)) return
    if (row.rate_source === 'manual' && n(row.rate_per_kg) > 0) return
    const found = lookupRateForCosting(rates, 'weft', name, costingDate, { denier: row.denier })
    if (!found && !n(row.rate_per_kg)) missing.push({ category: 'weft', itemName: name, rowIndex: idx })
  })
  return missing
}

function n(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

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
    if (isBlankYarnName(yarn)) {
      wefts[idx] = {
        ...wefts[idx],
        weft_name: '-',
        rate_per_kg: '',
        rate_source: undefined,
        rate_master_id: undefined,
      }
    } else {
      wefts[idx] = applyWeftItemFromMaster(wefts[idx], yarn, opts.rates, opts.costingDate)
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
  const { findSharedDesign } = await import('./designIdentity')
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
