/** Design Wise Costing — factory diary formulas (÷ 9_000_000) */

const DENOM = 9_000_000

export function n(v: string | number | null | undefined): number {
  if (v === '' || v == null) return 0
  const x = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(x) ? x : 0
}

/** Warp weight (kg) = (denier × tar_ends × length_mtr) / 9_000_000 */
export function warpWeightKg(denier: number, tarEnds: number, lengthMtr: number): number {
  return (denier * tarEnds * lengthMtr) / DENOM
}

/** Weft weight (kg) = (denier × pic × width × length_mtr) / 9_000_000 */
export function weftWeightKg(
  denier: number,
  pic: number,
  width: number,
  lengthMtr: number,
): number {
  return (denier * pic * width * lengthMtr) / DENOM
}

export function rowAmount(weightKg: number, ratePerKg: number): number {
  return weightKg * ratePerKg
}

export type WarpDraft = {
  key: string
  sr_no: number
  yarn_name: string
  denier: string
  tar_ends: string
  length_mtr: string
  rate_per_kg: string
}

export type WeftDraft = {
  key: string
  sr_no: number
  weft_name: string
  denier: string
  pic: string
  width: string
  length_mtr: string
  rate_per_kg: string
}

export type CostingBuildup = {
  totalWeightKg: number
  totalYarnAmount: number
  designLengthMtr: number
  yarnCostPerMtr: number
  conversionCharge: number
  subtotalPerMtr: number
  muPercent: number
  afterMuPerMtr: number
  gstPercent: number
  finalCostPerMtr: number
  totalPic: number
}

export function emptyWarp(sr = 1): WarpDraft {
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    yarn_name: '',
    denier: '',
    tar_ends: '',
    length_mtr: '',
    rate_per_kg: '',
  }
}

export function emptyWeft(sr = 1): WeftDraft {
  return {
    key: crypto.randomUUID(),
    sr_no: sr,
    weft_name: '',
    denier: '',
    pic: '',
    width: '',
    length_mtr: '',
    rate_per_kg: '',
  }
}

export function computeWarpRow(row: WarpDraft) {
  const denier = n(row.denier)
  const tar = n(row.tar_ends)
  const length = n(row.length_mtr)
  const rate = n(row.rate_per_kg)
  const weight = warpWeightKg(denier, tar, length)
  const amount = rowAmount(weight, rate)
  return { weight, amount, length }
}

export function computeWeftRow(row: WeftDraft) {
  const denier = n(row.denier)
  const pic = n(row.pic)
  const width = n(row.width)
  const length = n(row.length_mtr)
  const rate = n(row.rate_per_kg)
  const weight = weftWeightKg(denier, pic, width, length)
  const amount = rowAmount(weight, rate)
  return { weight, amount, pic }
}

export function computeBuildup(
  warps: WarpDraft[],
  wefts: WeftDraft[],
  conversionCharge: number,
  muPercent: number,
  gstPercent: number,
): CostingBuildup {
  let totalWeightKg = 0
  let totalYarnAmount = 0
  let designLengthMtr = 0
  let totalPic = 0

  for (const w of warps) {
    const c = computeWarpRow(w)
    totalWeightKg += c.weight
    totalYarnAmount += c.amount
    if (!designLengthMtr && c.length > 0) designLengthMtr = c.length
  }
  for (const w of wefts) {
    const c = computeWeftRow(w)
    totalWeightKg += c.weight
    totalYarnAmount += c.amount
    totalPic += c.pic
  }

  const yarnCostPerMtr = designLengthMtr > 0 ? totalYarnAmount / designLengthMtr : 0
  const subtotalPerMtr = yarnCostPerMtr + conversionCharge
  const afterMuPerMtr = subtotalPerMtr * (1 + muPercent / 100)
  const finalCostPerMtr = afterMuPerMtr * (1 + gstPercent / 100)

  return {
    totalWeightKg,
    totalYarnAmount,
    designLengthMtr,
    yarnCostPerMtr,
    conversionCharge,
    subtotalPerMtr,
    muPercent,
    afterMuPerMtr,
    gstPercent,
    finalCostPerMtr,
    totalPic,
  }
}

export function fmtMoney(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(digits)
}

export function fmtQty(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '0.00'
  return v.toFixed(digits)
}

/** Best-effort parse of OCR / diary text into field hints. */
export function parseDiaryNumbers(text: string): {
  denier?: string
  tar?: string
  pic?: string
  width?: string
  length?: string
  rate?: string
} {
  const out: Record<string, string> = {}
  const patterns: Array<[string, RegExp]> = [
    ['denier', /denier\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['tar', /(?:tar|ends)\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['pic', /pic\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['width', /width\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['length', /(?:length|mtr|meter)\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
    ['rate', /rate\s*[:=]?\s*(\d+(?:\.\d+)?)/i],
  ]
  for (const [key, re] of patterns) {
    const m = text.match(re)
    if (m?.[1]) out[key] = m[1]
  }
  return out
}
