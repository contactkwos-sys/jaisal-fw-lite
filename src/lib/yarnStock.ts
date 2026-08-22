import type { WeftYarnStock, YarnStockLedger } from './database.types'
import { WEFT_LOW_STOCK_KG } from './database.types'
import { supabase } from './supabase'

export type YarnStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export type YarnFormValues = {
  supplier: string
  colour_name: string
  colour_no: string
  quality: string
  yarn_specification: string
  unit: string
  opening_stock: string
  rate_per_kg: string
  lot_number: string
  location: string
  reorder_level: string
  min_stock: string
  max_stock: string
  gst_pct: string
  hsn_code: string
  remarks: string
  is_active: boolean
}

export type YarnFormField = keyof YarnFormValues

export type YarnFieldErrors = Partial<Record<YarnFormField, string>>

export const EMPTY_YARN_FORM: YarnFormValues = {
  supplier: '',
  colour_name: '',
  colour_no: '',
  quality: '',
  yarn_specification: '',
  unit: 'KG',
  opening_stock: '',
  rate_per_kg: '',
  lot_number: '',
  location: '',
  reorder_level: String(WEFT_LOW_STOCK_KG),
  min_stock: '0',
  max_stock: '',
  gst_pct: '5',
  hsn_code: '',
  remarks: '',
  is_active: true,
}

export const YARN_UNITS = ['KG', 'Cone', 'Bag'] as const

export function yarnReorderLevel(row: WeftYarnStock): number {
  const raw = row.reorder_level
  if (raw == null || Number.isNaN(Number(raw))) return WEFT_LOW_STOCK_KG
  return Number(raw)
}

export function yarnStatus(row: WeftYarnStock): YarnStockStatus {
  const stock = Number(row.stock_kg || 0)
  if (stock <= 0) return 'out_of_stock'
  if (stock <= yarnReorderLevel(row)) return 'low_stock'
  return 'in_stock'
}

export function yarnStatusLabel(status: YarnStockStatus): string {
  if (status === 'out_of_stock') return 'OUT OF STOCK'
  if (status === 'low_stock') return 'LOW STOCK'
  return 'IN STOCK'
}

export function yarnStockValue(row: WeftYarnStock): number {
  return Number(row.stock_kg || 0) * Number(row.rate_per_kg || 0)
}

export function formatKg(n: number): string {
  return Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}

export function formatInr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`
}

export function yarnDisplayName(row: WeftYarnStock): string {
  const colour = (row.colour_name || '').trim()
  const no = (row.colour_no || '').trim()
  if (colour && no) return `${colour} ${no}`
  return colour || no || 'Yarn'
}

export function formFromYarn(row: WeftYarnStock): YarnFormValues {
  return {
    supplier: row.supplier ?? '',
    colour_name: row.colour_name ?? '',
    colour_no: row.colour_no ?? '',
    quality: row.quality ?? '',
    yarn_specification: row.yarn_specification ?? '',
    unit: row.unit || 'KG',
    opening_stock: String(row.opening_stock ?? row.stock_kg ?? 0),
    rate_per_kg: String(row.rate_per_kg ?? 0),
    lot_number: row.lot_number ?? '',
    location: row.location ?? '',
    reorder_level: String(row.reorder_level ?? WEFT_LOW_STOCK_KG),
    min_stock: String(row.min_stock ?? 0),
    max_stock: row.max_stock == null ? '' : String(row.max_stock),
    gst_pct: String(row.gst_pct ?? 5),
    hsn_code: row.hsn_code ?? '',
    remarks: row.remarks ?? '',
    is_active: row.is_active !== false,
  }
}

/** Prefill from a recent yarn — opening qty cleared so stock is not duplicated. */
export function formFromRecentYarn(row: WeftYarnStock): YarnFormValues {
  return {
    ...formFromYarn(row),
    opening_stock: '',
    lot_number: '',
    remarks: '',
    is_active: true,
  }
}

export function masterPayloadFromForm(
  form: YarnFormValues,
  opts: { includeOpening: boolean },
): Record<string, unknown> {
  const opening = Number(form.opening_stock || 0)
  const payload: Record<string, unknown> = {
    supplier: form.supplier.trim() || null,
    colour_name: form.colour_name.trim() || null,
    colour_no: form.colour_no.trim() || null,
    quality: form.quality.trim() || null,
    yarn_specification: form.yarn_specification.trim() || null,
    unit: form.unit.trim() || 'KG',
    rate_per_kg: Number(form.rate_per_kg || 0),
    reorder_level: Number(form.reorder_level || WEFT_LOW_STOCK_KG),
    min_stock: Number(form.min_stock || 0),
    max_stock: form.max_stock.trim() === '' ? null : Number(form.max_stock),
    lot_number: form.lot_number.trim() || null,
    location: form.location.trim() || null,
    gst_pct: Number(form.gst_pct || 0),
    hsn_code: form.hsn_code.trim() || null,
    remarks: form.remarks.trim() || null,
    is_active: form.is_active,
    updated_at: new Date().toISOString(),
  }
  if (opts.includeOpening) {
    payload.opening_stock = opening
    payload.stock_kg = opening
  }
  return payload
}

export function validateYarnFormFields(
  form: YarnFormValues,
  isNew: boolean,
): YarnFieldErrors {
  const errors: YarnFieldErrors = {}

  if (!form.supplier.trim()) errors.supplier = 'Supplier is required.'
  if (!form.colour_name.trim()) errors.colour_name = 'Colour Name is required.'
  if (!form.colour_no.trim()) errors.colour_no = 'Colour Number is required.'
  if (!form.quality.trim()) errors.quality = 'Quality / Count is required.'
  if (!form.yarn_specification.trim()) {
    errors.yarn_specification = 'Yarn Specification is required.'
  }
  if (!form.unit.trim()) errors.unit = 'Unit is required.'

  if (isNew) {
    const openingRaw = form.opening_stock.trim()
    if (openingRaw === '') {
      errors.opening_stock = 'Opening Stock Quantity is required.'
    } else if (Number.isNaN(Number(openingRaw))) {
      errors.opening_stock = 'Opening Stock Quantity must be a number.'
    } else if (Number(openingRaw) < 0) {
      errors.opening_stock = 'Quantity cannot be negative.'
    }
  }

  const rateRaw = form.rate_per_kg.trim()
  if (rateRaw === '') {
    errors.rate_per_kg = 'Purchase Rate is required.'
  } else if (Number.isNaN(Number(rateRaw))) {
    errors.rate_per_kg = 'Purchase Rate must be a number.'
  } else if (Number(rateRaw) < 0) {
    errors.rate_per_kg = 'Rate must be greater than or equal to zero.'
  }

  if (form.gst_pct.trim() !== '' && Number.isNaN(Number(form.gst_pct))) {
    errors.gst_pct = 'GST % must be a number.'
  } else if (Number(form.gst_pct) < 0) {
    errors.gst_pct = 'GST % cannot be negative.'
  }

  for (const key of ['reorder_level', 'min_stock', 'max_stock'] as const) {
    const raw = form[key].trim()
    if (raw === '') continue
    if (Number.isNaN(Number(raw))) {
      errors[key] = 'Must be a number.'
    } else if (Number(raw) < 0) {
      errors[key] = 'Quantity cannot be negative.'
    }
  }

  return errors
}

export function validateYarnForm(form: YarnFormValues, isNew: boolean): string | null {
  const errors = validateYarnFormFields(form, isNew)
  const first = Object.values(errors)[0]
  return first ?? null
}

function normKey(v: string | null | undefined): string {
  return String(v || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Same supplier + colour no + quality + specification = identical yarn. */
export function findDuplicateYarn(
  rows: WeftYarnStock[],
  form: YarnFormValues,
  excludeId?: string | null,
): WeftYarnStock | null {
  const s = normKey(form.supplier)
  const c = normKey(form.colour_no)
  const q = normKey(form.quality)
  const spec = normKey(form.yarn_specification)
  if (!s || !c || !q || !spec) return null
  return (
    rows.find((row) => {
      if (excludeId && row.id === excludeId) return false
      return (
        normKey(row.supplier) === s &&
        normKey(row.colour_no) === c &&
        normKey(row.quality) === q &&
        normKey(row.yarn_specification) === spec
      )
    }) ?? null
  )
}

/** Recent yarns for reuse — prefers updated_at, falls back to list order. */
export function recentYarns(rows: WeftYarnStock[], limit = 12): WeftYarnStock[] {
  return [...rows]
    .filter((r) => r.is_active !== false)
    .sort((a, b) => {
      const ta = Date.parse(a.updated_at || '') || 0
      const tb = Date.parse(b.updated_at || '') || 0
      return tb - ta
    })
    .slice(0, limit)
}

/** After Save & Add Another — keep supplier / unit / GST for bulk entry. */
export function clearEntryFields(form: YarnFormValues): YarnFormValues {
  return {
    ...EMPTY_YARN_FORM,
    supplier: form.supplier,
    unit: form.unit || 'KG',
    gst_pct: form.gst_pct || '5',
    location: form.location,
    is_active: true,
  }
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}

export async function nextYarnTxnNo(prefix: string): Promise<string> {
  const year = new Date().getFullYear()
  const like = `${prefix}-${year}-%`
  const { data } = await supabase
    .from('yarn_stock_ledger')
    .select('txn_no')
    .like('txn_no', like)
    .order('created_at', { ascending: false })
    .limit(50)
  let max = 0
  for (const row of data ?? []) {
    const m = String(row.txn_no || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`
}

export async function insertLedgerEntry(
  entry: Omit<YarnStockLedger, 'id' | 'created_at'> & { id?: string; created_at?: string },
): Promise<void> {
  const { error } = await supabase.from('yarn_stock_ledger').insert(entry)
  if (error) throw error
}

export async function loadYarnLedger(yarnId: string): Promise<YarnStockLedger[]> {
  const { data, error } = await supabase
    .from('yarn_stock_ledger')
    .select('*')
    .eq('yarn_id', yarnId)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as YarnStockLedger[]) ?? []
}

export function ledgerTotals(rows: YarnStockLedger[]) {
  let inward = 0
  let outward = 0
  for (const r of rows) {
    inward += Number(r.inward_kg || 0)
    outward += Number(r.outward_kg || 0)
  }
  return { inward, outward }
}

/** Running balance from oldest → newest for display consistency. */
export function ledgerWithRunningBalance(rows: YarnStockLedger[]): YarnStockLedger[] {
  const chronological = [...rows].sort((a, b) => {
    const da = `${a.txn_date}T${a.created_at}`
    const db = `${b.txn_date}T${b.created_at}`
    return da.localeCompare(db)
  })
  let bal = 0
  const computed = chronological.map((r) => {
    bal += Number(r.inward_kg || 0) - Number(r.outward_kg || 0)
    return { ...r, balance_kg: bal }
  })
  return computed.reverse()
}

export type YarnFilters = {
  supplier: string
  quality: string
  specification: string
  status: '' | YarnStockStatus
  availability: '' | 'available' | 'unavailable'
}

export const EMPTY_YARN_FILTERS: YarnFilters = {
  supplier: '',
  quality: '',
  specification: '',
  status: '',
  availability: '',
}

export function filterYarnRows(
  rows: WeftYarnStock[],
  search: string,
  filters: YarnFilters,
): WeftYarnStock[] {
  const q = search.trim().toLowerCase()
  return rows.filter((row) => {
    if (q) {
      const hay = [
        row.colour_name,
        row.colour_no,
        row.supplier,
        row.quality,
        row.yarn_specification,
      ]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
      if (!hay.includes(q)) return false
    }
    if (filters.supplier && (row.supplier || '') !== filters.supplier) return false
    if (filters.quality && (row.quality || '') !== filters.quality) return false
    if (filters.specification && (row.yarn_specification || '') !== filters.specification) {
      return false
    }
    const st = yarnStatus(row)
    if (filters.status && st !== filters.status) return false
    if (filters.availability === 'available' && Number(row.stock_kg) <= 0) return false
    if (filters.availability === 'unavailable' && Number(row.stock_kg) > 0) return false
    return true
  })
}

export function yarnKpis(rows: WeftYarnStock[]) {
  let totalStock = 0
  let stockValue = 0
  let inStock = 0
  let lowStock = 0
  let outOfStock = 0
  for (const row of rows) {
    if (row.is_active === false) continue
    totalStock += Number(row.stock_kg || 0)
    stockValue += yarnStockValue(row)
    const st = yarnStatus(row)
    if (st === 'in_stock') inStock += 1
    else if (st === 'low_stock') lowStock += 1
    else outOfStock += 1
  }
  return {
    totalItems: rows.filter((r) => r.is_active !== false).length,
    totalStock,
    stockValue,
    inStock,
    lowStock,
    outOfStock,
  }
}
