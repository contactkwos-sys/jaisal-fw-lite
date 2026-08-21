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

export const EMPTY_YARN_FORM: YarnFormValues = {
  supplier: '',
  colour_name: '',
  colour_no: '',
  quality: '',
  yarn_specification: '',
  unit: 'KG',
  opening_stock: '',
  rate_per_kg: '0',
  lot_number: '',
  location: '',
  reorder_level: String(WEFT_LOW_STOCK_KG),
  min_stock: '0',
  max_stock: '',
  gst_pct: '0',
  hsn_code: '',
  remarks: '',
  is_active: true,
}

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
    gst_pct: String(row.gst_pct ?? 0),
    hsn_code: row.hsn_code ?? '',
    remarks: row.remarks ?? '',
    is_active: row.is_active !== false,
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

export function validateYarnForm(form: YarnFormValues, isNew: boolean): string | null {
  if (!form.supplier.trim()) return 'Supplier is required'
  if (!form.colour_name.trim()) return 'Colour Name is required'
  if (!form.colour_no.trim()) return 'Colour Number is required'
  if (!form.quality.trim()) return 'Quality is required'
  if (!form.yarn_specification.trim()) return 'Yarn Specification is required'
  if (!form.unit.trim()) return 'Unit is required'
  if (isNew) {
    const openingRaw = form.opening_stock.trim()
    if (openingRaw === '') return 'Opening Stock Quantity (KG) is required'
    if (Number.isNaN(Number(openingRaw))) return 'Opening Stock Quantity must be a number'
    if (Number(openingRaw) < 0) return 'Opening Stock Quantity cannot be negative'
  }
  if (Number.isNaN(Number(form.rate_per_kg))) return 'Rate / KG must be a number'
  if (Number(form.rate_per_kg) < 0) return 'Rate / KG cannot be negative'
  return null
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
    if (row.is_active === false && filters.availability !== 'unavailable') {
      // still show inactive unless filtered; availability filter is stock-based
    }
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
