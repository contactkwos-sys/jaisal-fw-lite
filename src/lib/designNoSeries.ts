/** Design No. list helpers for DIN Costing combobox + series view. */

export type DesignNoSeriesRow = {
  dinNumber: string
  qualityName: string
  latestAt: string
  costingId: string
  status: string
}

const PREFIX_NUM_RE = /^([A-Za-z]{1,8})(\d{1,8})$/

/** Unique Design Nos. from costing rows (input already latest-first). */
export function uniqueDesignNosFromCostings(
  rows: Array<{
    id: string
    din_number: string | null
    quality_name?: string | null
    updated_at?: string | null
    created_at?: string | null
    status?: string | null
  }>,
): DesignNoSeriesRow[] {
  const seen = new Set<string>()
  const out: DesignNoSeriesRow[] = []
  for (const row of rows) {
    const din = String(row.din_number || '')
      .trim()
      .toUpperCase()
    if (!din || seen.has(din)) continue
    seen.add(din)
    out.push({
      dinNumber: din,
      qualityName: String(row.quality_name || '').trim(),
      latestAt: String(row.updated_at || row.created_at || ''),
      costingId: row.id,
      status: row.status === 'final' ? 'final' : 'draft',
    })
  }
  return out
}

/** Sort JFG#### / DESI#### numerically within the same letter prefix. */
export function sortDesignNosBySeries(list: DesignNoSeriesRow[]): DesignNoSeriesRow[] {
  return [...list].sort((a, b) => {
    const ma = a.dinNumber.match(PREFIX_NUM_RE)
    const mb = b.dinNumber.match(PREFIX_NUM_RE)
    if (ma && mb) {
      const pref = ma[1].toUpperCase().localeCompare(mb[1].toUpperCase())
      if (pref !== 0) return pref
      return Number(ma[2]) - Number(mb[2])
    }
    if (ma && !mb) return -1
    if (!ma && mb) return 1
    return a.dinNumber.localeCompare(b.dinNumber)
  })
}

/**
 * Suggest next Design No. in the dominant letter+number series
 * (e.g. JFG2247, JFG2249 → JFG2250).
 */
export function suggestNextDesignNo(rows: DesignNoSeriesRow[]): string | null {
  const byPrefix = new Map<string, number>()
  for (const row of rows) {
    const m = row.dinNumber.match(PREFIX_NUM_RE)
    if (!m) continue
    const prefix = m[1].toUpperCase()
    const num = Number(m[2])
    const prev = byPrefix.get(prefix)
    if (prev == null || num > prev) byPrefix.set(prefix, num)
  }
  if (!byPrefix.size) return null
  // Prefer the prefix of the most recently used numeric Design No.
  let bestPrefix = ''
  let bestNum = -1
  for (const row of rows) {
    const m = row.dinNumber.match(PREFIX_NUM_RE)
    if (!m) continue
    bestPrefix = m[1].toUpperCase()
    bestNum = byPrefix.get(bestPrefix) ?? Number(m[2])
    break
  }
  if (!bestPrefix || bestNum < 0) {
    const [prefix, num] = [...byPrefix.entries()][0]
    bestPrefix = prefix
    bestNum = num
  }
  const width = String(bestNum).length
  return `${bestPrefix}${String(bestNum + 1).padStart(width, '0')}`
}
