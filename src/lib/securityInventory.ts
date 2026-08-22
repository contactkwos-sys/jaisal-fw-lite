/**
 * Security Inventory — gate-level entry helpers.
 * Syncs into existing Warp Yarn / Weft / Purchase / Maintenance tables.
 * Does not introduce a second stock system.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_MULTIPLIER, insertTxn, meterFields } from './warpYarn'
import { insertLedgerEntry, nextYarnTxnNo } from './yarnStock'
import { nowTimeHHMM, todayISO, uploadPurchasePhoto } from './mutate'
import { supabase } from './supabase'

export const SI_ENTRY_TYPES = [
  'warp_inward',
  'warp_outward',
  'weft_inward',
  'maint_inward',
  'maint_outward',
  'maint_return',
  'general_inward',
  'other',
] as const

export type SiEntryType = (typeof SI_ENTRY_TYPES)[number]

export const SI_TYPE_PREFIX: Record<SiEntryType, string> = {
  warp_inward: 'WI',
  warp_outward: 'WO',
  weft_inward: 'WE',
  maint_inward: 'MI',
  maint_outward: 'MO',
  maint_return: 'MR',
  general_inward: 'GI',
  other: 'OT',
}

export const SI_TYPE_LABEL: Record<SiEntryType, string> = {
  warp_inward: 'Warp Inward',
  warp_outward: 'Warp Outward',
  weft_inward: 'Weft Inward',
  maint_inward: 'Maintenance Inward',
  maint_outward: 'Maintenance Outward',
  maint_return: 'Maintenance Return',
  general_inward: 'General Inward',
  other: 'Others',
}

export const SI_SHIFTS = ['Day Shift', 'Night Shift'] as const

export type InventoryItemMaster = {
  id: string
  name: string
  name_key: string
  item_code: string | null
  category: string
  unit: string
  description: string | null
  reorder_level: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  stock_qty?: number
}

export type SecurityInventoryEntry = {
  id: string
  entry_no: string
  entry_type: SiEntryType | string
  entry_date: string
  entry_time: string | null
  shift: string | null
  party_name: string | null
  supplier: string | null
  item_name: string | null
  item_id: string | null
  item_code: string | null
  quantity: number
  unit: string | null
  quantity_meter: number | null
  bags_cones: number | null
  challan_no: string | null
  invoice_no: string | null
  vehicle_no: string | null
  person_name: string | null
  purpose: string | null
  repair_type: string | null
  machine_no: string | null
  department: string | null
  colour_name: string | null
  colour_no: string | null
  quality: string | null
  denier: string | null
  yarn_specification: string | null
  rate: number | null
  gst_pct: number | null
  gst_amount: number | null
  amount: number | null
  invoice_total: number | null
  remarks: string | null
  status: string
  photo_urls: string[] | unknown
  yarn_lines: YarnLine[] | unknown
  link_table: string | null
  link_id: string | null
  parent_entry_id: string | null
  qty_returned: number
  expected_return_date: string | null
  void_reason: string | null
  voided_by: string | null
  voided_at: string | null
  entered_by: string | null
  entered_by_user_id: string | null
  created_at: string
  updated_at: string
}

export type SecurityInventoryDocument = {
  id: string
  entry_id: string | null
  doc_type: string
  file_name: string | null
  file_url: string
  uploaded_by: string | null
  created_at: string
}

export type YarnLine = {
  yarn_name: string
  colour: string
  colour_no: string
  quality: string
  denier: string
  quantity_kg: number
  rate: number
  gst_pct: number
  amount: number
}

export type SiFilters = {
  search: string
  dateFrom: string
  dateTo: string
  party: string
  item: string
  challan: string
  invoice: string
  status: string
  user: string
  shift: string
  entryType: string
}

export function emptySiFilters(): SiFilters {
  return {
    search: '',
    dateFrom: '',
    dateTo: '',
    party: '',
    item: '',
    challan: '',
    invoice: '',
    status: '',
    user: '',
    shift: '',
    entryType: '',
  }
}

/** Normalize item names so casing/punctuation variants collapse. */
export function itemNameKey(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[._]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function photoUrlsOf(entry: SecurityInventoryEntry): string[] {
  const raw = entry.photo_urls
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  return []
}

export function yarnLinesOf(entry: SecurityInventoryEntry): YarnLine[] {
  const raw = entry.yarn_lines
  if (Array.isArray(raw)) return raw as YarnLine[]
  return []
}

export function formatQty(n: number | null | undefined, digits = 3): string {
  return Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

export function daysPending(fromDate: string, toDate = todayISO()): number {
  const a = Date.parse(fromDate)
  const b = Date.parse(toDate)
  if (!a || !b) return 0
  return Math.max(0, Math.floor((b - a) / 86400000))
}

export function pendingRepairStatus(row: SecurityInventoryEntry): string {
  if (row.status === 'void') return 'void'
  const sent = Number(row.quantity || 0)
  const ret = Number(row.qty_returned || 0)
  if (ret <= 0) {
    if (row.expected_return_date && row.expected_return_date < todayISO()) return 'overdue'
    return 'pending'
  }
  if (ret < sent) {
    if (row.expected_return_date && row.expected_return_date < todayISO()) return 'overdue'
    return 'partially_returned'
  }
  return 'returned'
}

export function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase()
  if (['completed', 'returned', 'in_stock'].includes(s)) return 'si-badge si-badge-ok'
  if (['pending', 'pending_outward', 'pending_inward', 'out_for_repair', 'partially_returned', 'document_pending', 'low'].includes(s)) {
    return 'si-badge si-badge-pending'
  }
  if (['void', 'overdue', 'out', 'out_of_stock'].includes(s)) return 'si-badge si-badge-danger'
  if (s.includes('maint')) return 'si-badge si-badge-maint'
  return 'si-badge'
}

export async function nextSecurityEntryNo(
  client: SupabaseClient,
  type: SiEntryType,
): Promise<string> {
  const prefix = SI_TYPE_PREFIX[type]
  const { data } = await client
    .from('security_inventory_entries')
    .select('entry_no')
    .like('entry_no', `${prefix}-%`)
    .order('created_at', { ascending: false })
    .limit(100)
  let max = 0
  for (const row of data || []) {
    const m = String((row as { entry_no: string }).entry_no || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${String(max + 1).padStart(6, '0')}`
}

export async function findOrCreateItem(
  client: SupabaseClient,
  opts: {
    name: string
    category: 'maintenance' | 'general' | 'other'
    unit?: string
    itemCode?: string
    description?: string
    createdBy?: string
  },
): Promise<InventoryItemMaster> {
  const key = itemNameKey(opts.name)
  if (!key) throw new Error('Item name is required')
  const { data: existing } = await client
    .from('inventory_item_master')
    .select('*')
    .eq('name_key', key)
    .maybeSingle()
  if (existing) {
    const { data: stock } = await client
      .from('inventory_item_stock')
      .select('stock_qty')
      .eq('item_id', existing.id)
      .maybeSingle()
    return { ...(existing as InventoryItemMaster), stock_qty: Number(stock?.stock_qty || 0) }
  }
  const { data: inserted, error } = await client
    .from('inventory_item_master')
    .insert({
      name: opts.name.trim(),
      name_key: key,
      category: opts.category,
      unit: opts.unit || 'NOS',
      item_code: opts.itemCode || null,
      description: opts.description || null,
      created_by: opts.createdBy || null,
    })
    .select('*')
    .single()
  if (error) throw error
  await client.from('inventory_item_stock').insert({ item_id: inserted.id, stock_qty: 0 })
  return { ...(inserted as InventoryItemMaster), stock_qty: 0 }
}

export async function adjustItemStock(
  client: SupabaseClient,
  itemId: string,
  delta: number,
): Promise<number> {
  const { data: stock } = await client
    .from('inventory_item_stock')
    .select('id, stock_qty')
    .eq('item_id', itemId)
    .maybeSingle()
  const current = Number(stock?.stock_qty || 0)
  const next = Math.round((current + delta) * 1000) / 1000
  if (stock?.id) {
    const { error } = await client
      .from('inventory_item_stock')
      .update({ stock_qty: next, updated_at: new Date().toISOString() })
      .eq('id', stock.id)
    if (error) throw error
  } else {
    const { error } = await client.from('inventory_item_stock').insert({
      item_id: itemId,
      stock_qty: next,
    })
    if (error) throw error
  }
  return next
}

export async function loadItemMaster(
  client: SupabaseClient,
  category?: string,
): Promise<InventoryItemMaster[]> {
  let q = client.from('inventory_item_master').select('*').eq('is_active', true).order('name')
  if (category) q = q.eq('category', category)
  const { data, error } = await q
  if (error) throw error
  const items = (data as InventoryItemMaster[]) || []
  const ids = items.map((i) => i.id)
  if (!ids.length) return items
  const { data: stocks } = await client.from('inventory_item_stock').select('item_id, stock_qty').in('item_id', ids)
  const map = new Map<string, number>()
  for (const s of stocks || []) map.set(String((s as { item_id: string }).item_id), Number((s as { stock_qty: number }).stock_qty || 0))
  return items.map((i) => ({ ...i, stock_qty: map.get(i.id) ?? 0 }))
}

export async function uploadSiPhotos(files: File[], folder: string): Promise<string[]> {
  const urls: string[] = []
  for (const f of files) {
    urls.push(await uploadPurchasePhoto(f, folder))
  }
  return urls
}

export async function saveDocuments(
  client: SupabaseClient,
  entryId: string,
  urls: string[],
  uploadedBy: string,
  docType = 'photo',
) {
  if (!urls.length) return
  const rows = urls.map((url, i) => ({
    entry_id: entryId,
    doc_type: docType,
    file_name: `${docType}-${i + 1}`,
    file_url: url,
    uploaded_by: uploadedBy,
  }))
  const { error } = await client.from('security_inventory_documents').insert(rows)
  if (error) throw error
}

type Actor = { userId: string; userName: string; shift?: string }

async function insertEntry(
  client: SupabaseClient,
  partial: Partial<SecurityInventoryEntry> & {
    entry_type: SiEntryType
    entry_date: string
  },
  actor: Actor,
): Promise<SecurityInventoryEntry> {
  const entry_no = partial.entry_no || (await nextSecurityEntryNo(client, partial.entry_type))
  const payload = {
    ...partial,
    entry_no,
    entry_time: partial.entry_time || nowTimeHHMM(),
    shift: partial.shift || actor.shift || 'Day Shift',
    entered_by: actor.userName,
    entered_by_user_id: actor.userId,
    photo_urls: partial.photo_urls || [],
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await client
    .from('security_inventory_entries')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw error
  return data as SecurityInventoryEntry
}

/* ---------- Warp Inward → warp_yarn_purchases + txn ---------- */

export type WarpInwardInput = {
  entry_date: string
  entry_time?: string
  shift?: string
  challan_no?: string
  invoice_no?: string
  party_name: string
  warp_yarn_name: string
  quality?: string
  denier?: string
  colour_name?: string
  colour_no?: string
  quantity_kg: number
  bags_cones?: number
  vehicle_no?: string
  person_name?: string
  purpose?: string
  remarks?: string
  photo_urls?: string[]
  rate?: number
  gst_pct?: number
}

export async function saveWarpInward(input: WarpInwardInput, actor: Actor) {
  const client = supabase
  const qty = Number(input.quantity_kg) || 0
  const rate = Number(input.rate) || 0
  const gst = Number(input.gst_pct) || 0
  const amount = qty * rate
  const total = amount * (1 + gst / 100)
  const quality = input.quality || input.warp_yarn_name

  const { data: purchase, error: pErr } = await client
    .from('warp_yarn_purchases')
    .insert({
      purchase_date: input.entry_date || todayISO(),
      supplier: input.party_name.trim(),
      invoice_no: input.invoice_no || input.challan_no || null,
      yarn_quality: quality,
      yarn_specification: [input.denier, input.colour_name, input.colour_no].filter(Boolean).join(' · ') || null,
      quantity_kg: qty,
      rate,
      amount,
      gst_pct: gst,
      total_amount: total,
      destination: 'Godown',
      remarks: input.remarks || input.purpose || null,
      entered_by: actor.userName,
    })
    .select('id')
    .single()
  if (pErr) throw pErr

  await client.from('yarn_inward').insert({
    yarn_type: 'warp',
    supplier_name: input.party_name.trim(),
    item: quality,
    qty,
    amount: total || null,
    invoice_image_url: input.photo_urls?.[0] || null,
    entry_date: input.entry_date || todayISO(),
    entered_by: actor.userName,
  })

  await insertTxn(client, {
    txn_date: input.entry_date || todayISO(),
    pipe_id: null,
    pipe_no: '—',
    txn_type: 'Purchase Yarn',
    from_location: input.party_name.trim(),
    to_location: 'Godown',
    quality,
    kg: qty,
    meter: 0,
    multiplier: DEFAULT_MULTIPLIER,
    total_meter: 0,
    balance_meter: null,
    machine_no: null,
    warper_name: null,
    user_name: actor.userName,
    reference: input.challan_no || input.invoice_no || null,
    status: 'Received',
    remarks: input.remarks || null,
  })

  const entry = await insertEntry(
    client,
    {
      entry_type: 'warp_inward',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: input.party_name.trim(),
      supplier: input.party_name.trim(),
      item_name: input.warp_yarn_name,
      quality,
      denier: input.denier || null,
      colour_name: input.colour_name || null,
      colour_no: input.colour_no || null,
      quantity: qty,
      unit: 'KG',
      bags_cones: input.bags_cones ?? null,
      challan_no: input.challan_no || null,
      invoice_no: input.invoice_no || null,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      purpose: input.purpose || null,
      remarks: input.remarks || null,
      photo_urls: input.photo_urls || [],
      rate,
      gst_pct: gst,
      amount,
      invoice_total: total,
      status: 'completed',
      link_table: 'warp_yarn_purchases',
      link_id: purchase.id,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'challan')
  return entry
}

/* ---------- Warp Outward → warper job / txn “Sent To” ---------- */

export type WarpOutwardInput = {
  entry_date: string
  entry_time?: string
  shift?: string
  challan_no?: string
  party_name: string
  warp_yarn_name: string
  quality?: string
  quantity_kg: number
  quantity_meter?: number
  pipe_id?: string
  pipe_no?: string
  vehicle_no?: string
  person_name?: string
  purpose?: string
  remarks?: string
  photo_urls?: string[]
  pending?: boolean
}

export async function saveWarpOutward(input: WarpOutwardInput, actor: Actor) {
  const client = supabase
  const qty = Number(input.quantity_kg) || 0
  const meter = Number(input.quantity_meter) || 0
  const warper = input.party_name.trim()
  const quality = input.quality || input.warp_yarn_name
  let pipeId = input.pipe_id || null
  let pipeNo = (input.pipe_no || '').trim().toUpperCase() || 'SOFT'

  if (pipeId || (pipeNo && pipeNo !== 'SOFT')) {
    let pipeQuery = client.from('warp_pipes').select('*')
    if (pipeId) pipeQuery = pipeQuery.eq('id', pipeId)
    else pipeQuery = pipeQuery.eq('pipe_no', pipeNo)
    const { data: pipe } = await pipeQuery.maybeSingle()
    if (pipe) {
      pipeId = pipe.id
      pipeNo = pipe.pipe_no
      const mult = Number(pipe.multiplier) || DEFAULT_MULTIPLIER
      const expectedTotal = meter ? Math.round(meter * mult * 1000) / 1000 : Number(pipe.total_meter || 0)
      await client.from('warp_warper_jobs').insert({
        pipe_id: pipeId,
        pipe_no: pipeNo,
        warper_name: warper,
        yarn_quality: quality,
        sent_date: input.entry_date || todayISO(),
        yarn_sent_kg: qty,
        expected_meter: meter || Number(pipe.meter || 0),
        multiplier: mult,
        expected_total_meter: expectedTotal,
        challan_no: input.challan_no || null,
        remarks: input.remarks || null,
        status: 'SENT',
        entered_by: actor.userName,
      })
      await client
        .from('warp_pipes')
        .update({
          status: 'AT_WARPER',
          location: `Warper · ${warper}`,
          warper_name: warper,
          yarn_quality: quality,
          weight_kg: qty || Number(pipe.weight_kg || 0),
          updated_at: new Date().toISOString(),
          ...(meter ? meterFields(meter, mult, 0) : {}),
        })
        .eq('id', pipeId)
    }
  } else {
    // Soft outward (no pipe): still visible in Warp Yarn Management transactions
    pipeNo = 'SOFT'
  }

  await insertTxn(client, {
    txn_date: input.entry_date || todayISO(),
    pipe_id: pipeId,
    pipe_no: pipeNo,
    txn_type: 'Send to Warper',
    from_location: 'Godown / Security',
    to_location: `Warper · ${warper}`,
    quality,
    kg: qty,
    meter,
    multiplier: DEFAULT_MULTIPLIER,
    total_meter: meter * DEFAULT_MULTIPLIER,
    balance_meter: meter * DEFAULT_MULTIPLIER || null,
    machine_no: null,
    warper_name: warper,
    user_name: actor.userName,
    reference: input.challan_no || null,
    status: 'SENT',
    remarks: input.remarks || input.purpose || null,
  })

  // Soft job row so Warper tab shows Sent To
  if (pipeNo === 'SOFT') {
    await client.from('warp_warper_jobs').insert({
      pipe_id: null,
      pipe_no: 'SOFT',
      warper_name: warper,
      yarn_quality: quality,
      sent_date: input.entry_date || todayISO(),
      yarn_sent_kg: qty,
      expected_meter: meter,
      multiplier: DEFAULT_MULTIPLIER,
      expected_total_meter: meter * DEFAULT_MULTIPLIER,
      challan_no: input.challan_no || null,
      remarks: input.remarks || null,
      status: 'SENT',
      entered_by: actor.userName,
    })
  }

  const entry = await insertEntry(
    client,
    {
      entry_type: 'warp_outward',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: warper,
      item_name: input.warp_yarn_name,
      quality,
      quantity: qty,
      unit: 'KG',
      quantity_meter: meter || null,
      challan_no: input.challan_no || null,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      purpose: input.purpose || null,
      remarks: input.remarks || null,
      photo_urls: input.photo_urls || [],
      status: input.pending ? 'pending_outward' : 'completed',
      link_table: 'warp_warper_jobs',
      link_id: null,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'challan')
  return entry
}

/* ---------- Weft Inward → weft_purchases + stock + ledger ---------- */

export type WeftInwardInput = {
  entry_date: string
  entry_time?: string
  shift?: string
  challan_no?: string
  invoice_no?: string
  supplier: string
  vehicle_no?: string
  person_name?: string
  remarks?: string
  photo_urls?: string[]
  lines: YarnLine[]
  gst_pct?: number
}

export async function saveWeftInward(input: WeftInwardInput, actor: Actor) {
  const client = supabase
  const lines = input.lines.filter((l) => l.yarn_name.trim() || l.colour.trim() || Number(l.quantity_kg) > 0)
  if (!lines.length) throw new Error('Add at least one yarn line')
  const gstHeader = Number(input.gst_pct ?? lines[0]?.gst_pct ?? 5)
  const weightTotal = lines.reduce((s, l) => s + Number(l.quantity_kg || 0), 0)
  const subtotal = lines.reduce((s, l) => s + Number(l.quantity_kg || 0) * Number(l.rate || 0), 0)
  const gstAmount = (subtotal * gstHeader) / 100
  const grand = subtotal + gstAmount

  const { data: purchase, error: pErr } = await client
    .from('weft_purchases')
    .insert({
      quality: lines[0]?.quality || lines[0]?.yarn_name || 'multi',
      weight_kg: weightTotal,
      rate: lines[0]?.rate || 0,
      supplier: input.supplier.trim() || null,
      party_name: input.supplier.trim(),
      challan_no: input.challan_no || input.invoice_no || null,
      gst_pct: gstHeader,
      subtotal,
      grand_total: grand,
      purchase_date: input.entry_date || todayISO(),
      input_mode: 'manual',
      photo_url: input.photo_urls?.[0] || null,
      barcode: null,
    })
    .select('id')
    .single()
  if (pErr) throw pErr

  await client.from('weft_purchase_items').insert(
    lines.map((l) => ({
      purchase_id: purchase.id,
      quality: l.quality || l.yarn_name || l.colour,
      weight_kg: Number(l.quantity_kg) || 0,
      rate: Number(l.rate) || 0,
    })),
  )

  for (const l of lines) {
    const colour = l.colour || l.yarn_name
    const qty = Number(l.quantity_kg) || 0
    const rate = Number(l.rate) || 0
    const { data: existing } = await client
      .from('weft_yarn_stock')
      .select('*')
      .eq('supplier', input.supplier.trim())
      .eq('colour_name', colour)
      .maybeSingle()

    let yarnId: string
    let newStock: number
    if (existing) {
      newStock = Number(existing.stock_kg) + qty
      yarnId = existing.id
      await client
        .from('weft_yarn_stock')
        .update({
          stock_kg: newStock,
          rate_per_kg: rate || existing.rate_per_kg,
          colour_no: l.colour_no || existing.colour_no,
          quality: l.quality || existing.quality,
          yarn_specification: l.denier || existing.yarn_specification,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      newStock = qty
      const { data: inserted, error: sErr } = await client
        .from('weft_yarn_stock')
        .insert({
          supplier: input.supplier.trim() || null,
          colour_name: colour,
          colour_no: l.colour_no || null,
          quality: l.quality || null,
          yarn_specification: l.denier || null,
          stock_kg: qty,
          opening_stock: qty,
          rate_per_kg: rate,
          gst_pct: Number(l.gst_pct) || gstHeader,
        })
        .select('id')
        .single()
      if (sErr) throw sErr
      yarnId = inserted.id
    }

    const txn_no = await nextYarnTxnNo('INW')
    await insertLedgerEntry({
      yarn_id: yarnId,
      txn_date: input.entry_date || todayISO(),
      txn_no,
      txn_type: 'purchase',
      reference: input.challan_no || purchase.id,
      inward_kg: qty,
      outward_kg: 0,
      balance_kg: newStock,
      rate,
      value_amount: qty * rate,
      lot_number: null,
      location: null,
      invoice_no: input.invoice_no || input.challan_no || null,
      gst_pct: Number(l.gst_pct) || gstHeader,
      remarks: 'Security Weft Inward',
      created_by: actor.userId,
      created_by_name: actor.userName,
    })
  }

  await client.from('yarn_inward').insert({
    yarn_type: 'weft',
    supplier_name: input.supplier.trim(),
    item: lines.map((l) => l.colour || l.yarn_name).join(', '),
    qty: weightTotal,
    amount: grand,
    invoice_image_url: input.photo_urls?.[0] || null,
    entry_date: input.entry_date || todayISO(),
    entered_by: actor.userName,
  })

  const entry = await insertEntry(
    client,
    {
      entry_type: 'weft_inward',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: input.supplier.trim(),
      supplier: input.supplier.trim(),
      item_name: lines.map((l) => l.yarn_name || l.colour).join(', '),
      quantity: weightTotal,
      unit: 'KG',
      challan_no: input.challan_no || null,
      invoice_no: input.invoice_no || null,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      remarks: input.remarks || null,
      photo_urls: input.photo_urls || [],
      yarn_lines: lines,
      gst_pct: gstHeader,
      gst_amount: gstAmount,
      amount: subtotal,
      invoice_total: grand,
      status: 'completed',
      link_table: 'weft_purchases',
      link_id: purchase.id,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'invoice')
  return entry
}

/* ---------- Maintenance Inward ---------- */

export type MaintInwardInput = {
  entry_date: string
  entry_time?: string
  shift?: string
  challan_no?: string
  invoice_no?: string
  supplier: string
  item_name: string
  item_id?: string
  item_code?: string
  quantity: number
  unit?: string
  machine_no?: string
  department?: string
  vehicle_no?: string
  person_name?: string
  remarks?: string
  photo_urls?: string[]
  rate?: number
  is_other?: boolean
  other_description?: string
}

export async function saveMaintInward(input: MaintInwardInput, actor: Actor) {
  const client = supabase
  const qty = Number(input.quantity) || 0
  const rate = Number(input.rate) || 0
  let itemId = input.item_id || null
  let itemName = input.item_name.trim()
  let itemCode = input.item_code || null

  if (input.is_other || !itemId) {
    const item = await findOrCreateItem(client, {
      name: itemName,
      category: 'maintenance',
      unit: input.unit || 'NOS',
      itemCode: itemCode || undefined,
      description: input.other_description,
      createdBy: actor.userName,
    })
    itemId = item.id
    itemName = item.name
    itemCode = item.item_code
  }

  const { data: inward, error: iErr } = await client
    .from('maintenance_inward')
    .insert({
      inward_date: input.entry_date || todayISO(),
      party_name: input.supplier.trim(),
      challan_no: input.challan_no || input.invoice_no || null,
      gst_pct: 0,
      subtotal: qty * rate,
      grand_total: qty * rate,
      photo_url: input.photo_urls?.[0] || null,
      input_mode: 'manual',
    })
    .select('id')
    .single()
  if (iErr) throw iErr

  await client.from('maintenance_inward_items').insert({
    inward_id: inward.id,
    item_name: itemName,
    qty,
    rate,
  })

  if (itemId) await adjustItemStock(client, itemId, qty)

  const entry = await insertEntry(
    client,
    {
      entry_type: 'maint_inward',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: input.supplier.trim(),
      supplier: input.supplier.trim(),
      item_name: itemName,
      item_id: itemId,
      item_code: itemCode,
      quantity: qty,
      unit: input.unit || 'NOS',
      challan_no: input.challan_no || null,
      invoice_no: input.invoice_no || null,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      machine_no: input.machine_no || null,
      department: input.department || null,
      remarks: input.remarks || input.other_description || null,
      photo_urls: input.photo_urls || [],
      rate,
      amount: qty * rate,
      status: 'completed',
      link_table: 'maintenance_inward',
      link_id: inward.id,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'challan')
  return entry
}

/* ---------- Maintenance Outward / Repair ---------- */

export type MaintOutwardInput = {
  entry_date: string
  entry_time?: string
  shift?: string
  challan_no?: string
  item_name: string
  item_id?: string
  item_code?: string
  quantity: number
  unit?: string
  machine_no?: string
  department?: string
  sent_to: string
  purpose?: string
  repair_type?: string
  vehicle_no?: string
  person_name?: string
  expected_return_date?: string
  remarks?: string
  photo_urls?: string[]
}

export async function saveMaintOutward(input: MaintOutwardInput, actor: Actor) {
  const client = supabase
  const qty = Number(input.quantity) || 0
  let itemId = input.item_id || null
  let itemName = input.item_name.trim()
  let itemCode = input.item_code || null

  if (!itemId) {
    const item = await findOrCreateItem(client, {
      name: itemName,
      category: 'maintenance',
      unit: input.unit || 'NOS',
      itemCode: itemCode || undefined,
      createdBy: actor.userName,
    })
    itemId = item.id
    itemName = item.name
    itemCode = item.item_code
  }

  const { data: mat, error: mErr } = await client
    .from('maintenance_material')
    .insert({
      direction: 'out',
      material_name: itemName,
      purpose: input.purpose || input.repair_type || 'Repair',
      sent_to: input.sent_to.trim(),
      entry_date: input.entry_date || todayISO(),
      entered_by: actor.userName,
    })
    .select('id')
    .single()
  if (mErr) throw mErr

  // Auto gate pass (same pattern as MaintenanceMaterialScreen)
  const { data: gps } = await client
    .from('gate_pass')
    .select('gp_number')
    .order('generated_at', { ascending: false })
    .limit(50)
  let max = 0
  for (const row of gps ?? []) {
    const m = String(row.gp_number || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const gp_number = `GP-M${String(max + 1).padStart(4, '0')}`
  await client.from('gate_pass').insert({
    ref_type: 'maintenance',
    ref_id: mat.id,
    gp_number,
  })

  if (itemId) await adjustItemStock(client, itemId, -qty)

  const entry = await insertEntry(
    client,
    {
      entry_type: 'maint_outward',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: input.sent_to.trim(),
      item_name: itemName,
      item_id: itemId,
      item_code: itemCode,
      quantity: qty,
      unit: input.unit || 'NOS',
      challan_no: input.challan_no || gp_number,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      purpose: input.purpose || null,
      repair_type: input.repair_type || null,
      machine_no: input.machine_no || null,
      department: input.department || null,
      expected_return_date: input.expected_return_date || null,
      remarks: input.remarks || null,
      photo_urls: input.photo_urls || [],
      qty_returned: 0,
      status: 'out_for_repair',
      link_table: 'maintenance_material',
      link_id: mat.id,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'photo')
  return entry
}

/* ---------- Maintenance Return ---------- */

export type MaintReturnInput = {
  parent_entry_id: string
  entry_date: string
  entry_time?: string
  shift?: string
  returned_qty: number
  remarks?: string
  photo_urls?: string[]
  person_name?: string
  vehicle_no?: string
}

export async function saveMaintReturn(input: MaintReturnInput, actor: Actor) {
  const client = supabase
  const { data: parent, error } = await client
    .from('security_inventory_entries')
    .select('*')
    .eq('id', input.parent_entry_id)
    .single()
  if (error || !parent) throw error || new Error('Original outward not found')
  const row = parent as SecurityInventoryEntry
  const ret = Number(input.returned_qty) || 0
  if (ret <= 0) throw new Error('Returned quantity required')
  const already = Number(row.qty_returned || 0)
  const sent = Number(row.quantity || 0)
  const nextReturned = Math.min(sent, already + ret)
  const status = nextReturned >= sent ? 'returned' : 'partially_returned'

  if (row.item_id) await adjustItemStock(client, row.item_id, ret)

  await client.from('maintenance_material').insert({
    direction: 'in',
    material_name: row.item_name || 'Return',
    purpose: `Return of ${row.entry_no}`,
    sent_to: row.party_name,
    entry_date: input.entry_date || todayISO(),
    entered_by: actor.userName,
  })

  await client
    .from('security_inventory_entries')
    .update({
      qty_returned: nextReturned,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)

  const entry = await insertEntry(
    client,
    {
      entry_type: 'maint_return',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: row.party_name,
      item_name: row.item_name,
      item_id: row.item_id,
      item_code: row.item_code,
      quantity: ret,
      unit: row.unit,
      parent_entry_id: row.id,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      remarks: input.remarks || null,
      photo_urls: input.photo_urls || [],
      status: 'completed',
      link_table: 'security_inventory_entries',
      link_id: row.id,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'photo')
  return entry
}

/* ---------- General / Others ---------- */

export type GeneralLine = {
  item_name: string
  item_id?: string
  quantity: number
  unit: string
  rate: number
  gst_pct: number
  amount: number
}

export type GeneralInwardInput = {
  entry_date: string
  entry_time?: string
  shift?: string
  challan_no?: string
  invoice_no?: string
  supplier: string
  vehicle_no?: string
  person_name?: string
  remarks?: string
  photo_urls?: string[]
  lines: GeneralLine[]
  category?: 'general' | 'other'
  description?: string
}

export async function saveGeneralInward(input: GeneralInwardInput, actor: Actor) {
  const client = supabase
  const cat = input.category || 'general'
  const lines = input.lines.filter((l) => l.item_name.trim() && Number(l.quantity) > 0)
  if (!lines.length) throw new Error('Add at least one item')
  const subtotal = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.rate || 0), 0)
  const gstAmt = lines.reduce(
    (s, l) => s + (Number(l.quantity) * Number(l.rate || 0) * Number(l.gst_pct || 0)) / 100,
    0,
  )

  const { data: purchase, error: pErr } = await client
    .from('general_purchases')
    .insert({
      purchase_date: input.entry_date || todayISO(),
      party_name: input.supplier.trim(),
      challan_no: input.challan_no || input.invoice_no || null,
      gst_pct: lines[0]?.gst_pct || 0,
      subtotal,
      grand_total: subtotal + gstAmt,
      photo_url: input.photo_urls?.[0] || null,
      input_mode: 'manual',
    })
    .select('id')
    .single()
  if (pErr) throw pErr

  const resolved: { name: string; id: string; qty: number; rate: number; unit: string }[] = []
  for (const l of lines) {
    const item = await findOrCreateItem(client, {
      name: l.item_name,
      category: cat === 'other' ? 'other' : 'general',
      unit: l.unit || 'NOS',
      description: input.description,
      createdBy: actor.userName,
    })
    await adjustItemStock(client, item.id, Number(l.quantity) || 0)
    resolved.push({
      name: item.name,
      id: item.id,
      qty: Number(l.quantity) || 0,
      rate: Number(l.rate) || 0,
      unit: l.unit || item.unit,
    })
  }

  await client.from('general_purchase_items').insert(
    resolved.map((r) => ({
      purchase_id: purchase.id,
      item_name: r.name,
      pieces: r.unit === 'KG' || r.unit === 'LTR' ? 0 : r.qty,
      weight_kg: r.unit === 'KG' || r.unit === 'LTR' ? r.qty : 0,
      rate: r.rate,
      billing_mode: r.unit === 'KG' || r.unit === 'LTR' ? 'weight' : 'piece',
    })),
  )

  const entry = await insertEntry(
    client,
    {
      entry_type: cat === 'other' ? 'other' : 'general_inward',
      entry_date: input.entry_date || todayISO(),
      entry_time: input.entry_time,
      shift: input.shift,
      party_name: input.supplier.trim(),
      supplier: input.supplier.trim(),
      item_name: resolved.map((r) => r.name).join(', '),
      item_id: resolved[0]?.id || null,
      quantity: resolved.reduce((s, r) => s + r.qty, 0),
      unit: resolved[0]?.unit || 'NOS',
      challan_no: input.challan_no || null,
      invoice_no: input.invoice_no || null,
      vehicle_no: input.vehicle_no || null,
      person_name: input.person_name || null,
      remarks: input.remarks || input.description || null,
      photo_urls: input.photo_urls || [],
      yarn_lines: lines as unknown as YarnLine[],
      amount: subtotal,
      gst_amount: gstAmt,
      invoice_total: subtotal + gstAmt,
      status: 'completed',
      link_table: 'general_purchases',
      link_id: purchase.id,
    },
    actor,
  )
  await saveDocuments(client, entry.id, input.photo_urls || [], actor.userName, 'invoice')
  return entry
}

export async function voidSecurityEntry(
  entryId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  const { error } = await supabase
    .from('security_inventory_entries')
    .update({
      status: 'void',
      void_reason: reason.trim() || 'Voided',
      voided_by: actor.userName,
      voided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId)
  if (error) throw error
}

export function filterEntries(rows: SecurityInventoryEntry[], f: SiFilters): SecurityInventoryEntry[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.dateFrom && r.entry_date < f.dateFrom) return false
    if (f.dateTo && r.entry_date > f.dateTo) return false
    if (f.entryType && r.entry_type !== f.entryType) return false
    if (f.status && r.status !== f.status) return false
    if (f.shift && (r.shift || '') !== f.shift) return false
    if (f.party && !(r.party_name || r.supplier || '').toLowerCase().includes(f.party.toLowerCase())) return false
    if (f.item && !(r.item_name || '').toLowerCase().includes(f.item.toLowerCase())) return false
    if (f.challan && !(r.challan_no || '').toLowerCase().includes(f.challan.toLowerCase())) return false
    if (f.invoice && !(r.invoice_no || '').toLowerCase().includes(f.invoice.toLowerCase())) return false
    if (f.user && !(r.entered_by || '').toLowerCase().includes(f.user.toLowerCase())) return false
    if (!q) return true
    const hay = [
      r.entry_no,
      r.entry_type,
      r.party_name,
      r.supplier,
      r.item_name,
      r.challan_no,
      r.invoice_no,
      r.status,
      r.entered_by,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}

export type SiDashboardKpis = {
  totalSku: number
  totalInward: number
  totalOutward: number
  currentStock: number
  pendingOutward: number
  pendingInward: number
}

export async function loadDashboardBundle(client: SupabaseClient = supabase) {
  const [entriesRes, docsRes, itemsRes, weftRes, warperRes] = await Promise.all([
    client.from('security_inventory_entries').select('*').order('entry_date', { ascending: false }).limit(500),
    client.from('security_inventory_documents').select('*').order('created_at', { ascending: false }).limit(80),
    client.from('inventory_item_master').select('*').eq('is_active', true),
    client.from('weft_yarn_stock').select('id, stock_kg'),
    client.from('warp_warper_jobs').select('yarn_sent_kg, status').in('status', ['SENT', 'IN_PROCESS']),
  ])

  // Soft-fail when migration not yet applied
  const entries = (entriesRes.data as SecurityInventoryEntry[]) || []
  const docs = (docsRes.data as SecurityInventoryDocument[]) || []
  const items = (itemsRes.data as InventoryItemMaster[]) || []
  const weft = weftRes.data || []
  const warperPending = warperRes.data || []

  const { data: stocks } = await client.from('inventory_item_stock').select('item_id, stock_qty')
  const stockMap = new Map<string, number>()
  for (const s of stocks || []) {
    stockMap.set(String((s as { item_id: string }).item_id), Number((s as { stock_qty: number }).stock_qty || 0))
  }
  const itemsWithStock = items.map((i) => ({ ...i, stock_qty: stockMap.get(i.id) ?? 0 }))

  const active = entries.filter((e) => e.status !== 'void')
  const inwardTypes = new Set(['warp_inward', 'weft_inward', 'maint_inward', 'general_inward', 'other', 'maint_return'])
  const outwardTypes = new Set(['warp_outward', 'maint_outward'])
  let totalInward = 0
  let totalOutward = 0
  let pendingOutward = 0
  let pendingInward = 0
  for (const e of active) {
    const q = Number(e.quantity || 0)
    if (inwardTypes.has(e.entry_type)) totalInward += q
    if (outwardTypes.has(e.entry_type)) totalOutward += q
    if (['pending_outward', 'out_for_repair', 'partially_returned', 'overdue'].includes(e.status)) {
      pendingOutward += Math.max(0, q - Number(e.qty_returned || 0))
    }
    if (['pending_inward', 'document_pending'].includes(e.status)) pendingInward += q
  }
  // Also include warper jobs pending as pending outward kg
  for (const j of warperPending) {
    pendingOutward += Number((j as { yarn_sent_kg: number }).yarn_sent_kg || 0)
  }

  const weftStock = weft.reduce((s, r) => s + Number((r as { stock_kg: number }).stock_kg || 0), 0)
  const itemStock = itemsWithStock.reduce((s, i) => s + Number(i.stock_qty || 0), 0)

  const kpis: SiDashboardKpis = {
    totalSku: itemsWithStock.length + weft.length,
    totalInward,
    totalOutward,
    currentStock: weftStock + itemStock,
    pendingOutward,
    pendingInward,
  }

  const stockAlerts = itemsWithStock
    .filter((i) => Number(i.stock_qty || 0) <= Number(i.reorder_level || 0))
    .map((i) => ({
      name: i.name,
      qty: Number(i.stock_qty || 0),
      unit: i.unit,
      level: Number(i.stock_qty || 0) <= 0 ? 'out' : 'low',
    }))

  return {
    entries,
    docs,
    items: itemsWithStock,
    kpis,
    stockAlerts,
    errors: {
      entries: entriesRes.error?.message,
      docs: docsRes.error?.message,
      items: itemsRes.error?.message,
    },
  }
}

export function printSecurityReport(opts: {
  title: string
  dateLabel: string
  columns: string[]
  rows: Array<Array<string | number>>
  totals?: Array<[string, string]>
}) {
  const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100')
  if (!w) return
  const tableRows = opts.rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td>${escapeHtml(String(c ?? '—'))}</td>`).join('')}</tr>`,
    )
    .join('')
  const totalsHtml = (opts.totals || [])
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('')
  w.document.write(`<!doctype html><html><head><title>${escapeHtml(opts.title)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body{font-family: "Segoe UI", system-ui, sans-serif; color:#1e293b; margin:0; padding:12px}
  .hdr{border-bottom:2px solid #1769c2; padding-bottom:8px; margin-bottom:12px}
  .brand{font-size:18px; font-weight:700; color:#1769c2; letter-spacing:.02em}
  .sub{font-size:12px; color:#64748b}
  h1{font-size:15px; margin:10px 0 4px}
  table{width:100%; border-collapse:collapse; margin-top:8px; font-size:11px}
  th,td{border:1px solid #d9e1ea; padding:5px 6px; text-align:left}
  th{background:#e8f1fb}
  .sig{margin-top:36px; display:flex; justify-content:space-between; gap:24px}
  .sig div{flex:1; border-top:1px solid #94a3b8; padding-top:6px; font-size:11px; color:#64748b; text-align:center}
  @media print { .no-print{display:none} }
</style></head><body>
<div class="hdr">
  <div class="brand">JAISAL FASHIONWEAVE INDUSTRIES</div>
  <div class="sub">JAISAL FW · Security Inventory</div>
</div>
<h1>${escapeHtml(opts.title)}</h1>
<div class="sub">${escapeHtml(opts.dateLabel)}</div>
<table>
<thead><tr>${opts.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
<tbody>${tableRows || '<tr><td colspan="99">No records</td></tr>'}</tbody>
</table>
${totalsHtml ? `<table style="margin-top:12px;width:50%">${totalsHtml}</table>` : ''}
<div class="sig">
  <div>Prepared By</div>
  <div>Checked By</div>
  <div>Authorized Signatory</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`)
  w.document.close()
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export { todayISO, nowTimeHHMM }
