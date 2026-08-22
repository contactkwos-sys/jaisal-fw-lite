/**
 * Order Entry Module — suppliers, items, orders, WhatsApp, print.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from './mutate'

export const ORDER_TYPES = ['warp', 'weft', 'maint_material', 'maint_repair'] as const
export type OrderType = (typeof ORDER_TYPES)[number]

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  warp: 'Warp Yarn Order',
  weft: 'Weft Yarn Order',
  maint_material: 'Maintenance Material Order',
  maint_repair: 'Maintenance Repair / Service Order',
}

export const ORDER_PREFIX: Record<OrderType, string> = {
  warp: 'WARP',
  weft: 'WEFT',
  maint_material: 'MM',
  maint_repair: 'MR',
}

export const DELIVERY_TIMELINES = ['Exact Date', '± 2–5 Days', '± 5–7 Days', 'Custom'] as const

export const ORDER_STATUSES = [
  'Draft',
  'Sent',
  'Confirmed',
  'Partially Confirmed',
  'Waiting for Reply',
  'Follow-up Required',
  'Dispatched',
  'Received',
  'Completed',
  'Cancelled',
] as const

export const REPAIR_STATUSES = [
  'Open',
  'Technician Assigned',
  'Visit Confirmed',
  'Technician Arrived',
  'Under Repair',
  'Repaired',
  'Closed',
] as const

export type OrderSupplier = {
  id: string
  supplier_name: string
  name_key: string
  contact_person: string | null
  mobile: string | null
  whatsapp: string | null
  whatsapp_business: string | null
  email: string | null
  address: string | null
  gstin: string | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type OrderServiceProvider = {
  id: string
  company_name: string
  name_key: string
  contact_person: string | null
  mobile: string | null
  whatsapp: string | null
  whatsapp_business: string | null
  machine_category: string | null
  specialization: string | null
  address: string | null
  remarks: string | null
  created_by: string | null
  created_at: string
}

export type OrderWarpItem = {
  id: string
  item_name: string
  name_key: string
  denier: string | null
  quality_type: string | null
  last_rate: number
  last_supplier_id: string | null
}

export type OrderWeftColour = {
  id: string
  colour_name: string
  supplier_colour_no: string | null
  internal_colour_no: string | null
  supplier_id: string | null
  yarn_quality: string | null
  denier: string | null
  last_rate: number
  name_key: string
}

export type OrderMaintItem = {
  id: string
  item_name: string
  name_key: string
  item_code: string | null
  specification: string | null
  unit: string | null
  last_rate: number
}

export type OrderEntryLine = {
  id?: string
  line_no: number
  item_name: string
  denier: string
  quality_type: string
  colour_name: string
  supplier_colour_no: string
  internal_colour_no: string
  item_code: string
  specification: string
  unit: string
  rate: number
  quantity: number
  gst_pct: number
  gst_amount: number
  freight: number
  other_charges: number
  amount: number
  delivery_date: string
  remarks: string
}

export type OrderEntry = {
  id: string
  order_no: string
  order_type: OrderType | string
  order_date: string
  status: string
  supplier_id: string | null
  service_provider_id: string | null
  delivery_party: string | null
  delivery_date: string | null
  delivery_timeline: string | null
  delivery_instructions: string | null
  contact_person: string | null
  whatsapp: string | null
  whatsapp_business: string | null
  remarks: string | null
  total_qty: number
  total_basic: number
  total_gst: number
  total_freight: number
  total_other: number
  total_payable: number
  machine_no: string | null
  machine_name: string | null
  department: string | null
  problem_category: string | null
  problem_description: string | null
  urgency: string | null
  requested_date: string | null
  required_visit_date: string | null
  preferred_visit_time: string | null
  expected_completion: string | null
  whatsapp_message: string | null
  created_by: string | null
  updated_by: string | null
  sent_by: string | null
  confirmed_by: string | null
  created_at: string
  updated_at: string
  lines?: OrderEntryLine[]
  supplier?: OrderSupplier | null
  service_provider?: OrderServiceProvider | null
}

export type OrderHistory = {
  id: string
  order_id: string
  activity: string
  activity_at: string
  person: string | null
  communication_mode: string | null
  message: string | null
  response: string | null
  next_followup_date: string | null
}

export type OrderRepairHistory = {
  id: string
  order_id: string
  machine_no: string | null
  problem: string | null
  service_provider_name: string | null
  call_date: string | null
  whatsapp_date: string | null
  technician_name: string | null
  arrival_date: string | null
  arrival_time: string | null
  repair_start: string | null
  repair_completed: string | null
  repair_cost: number
  spare_parts: string | null
  remarks: string | null
}

export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcLineAmount(line: Pick<OrderEntryLine, 'rate' | 'quantity' | 'gst_pct' | 'freight' | 'other_charges'>): {
  basic: number
  gst_amount: number
  amount: number
} {
  const basic = round2((Number(line.rate) || 0) * (Number(line.quantity) || 0))
  const gst_amount = round2(basic * ((Number(line.gst_pct) || 0) / 100))
  const amount = round2(basic + gst_amount + (Number(line.freight) || 0) + (Number(line.other_charges) || 0))
  return { basic, gst_amount, amount }
}

export function calcOrderTotals(lines: OrderEntryLine[]) {
  let total_qty = 0
  let total_basic = 0
  let total_gst = 0
  let total_freight = 0
  let total_other = 0
  for (const l of lines) {
    const c = calcLineAmount(l)
    total_qty += Number(l.quantity) || 0
    total_basic += c.basic
    total_gst += c.gst_amount
    total_freight += Number(l.freight) || 0
    total_other += Number(l.other_charges) || 0
  }
  return {
    total_qty: round2(total_qty),
    total_basic: round2(total_basic),
    total_gst: round2(total_gst),
    total_freight: round2(total_freight),
    total_other: round2(total_other),
    total_payable: round2(total_basic + total_gst + total_freight + total_other),
  }
}

export function emptyLine(orderType: OrderType): OrderEntryLine {
  return {
    line_no: 1,
    item_name: '',
    denier: '',
    quality_type: '',
    colour_name: '',
    supplier_colour_no: '',
    internal_colour_no: '',
    item_code: '',
    specification: '',
    unit: orderType === 'maint_material' ? 'Pcs' : 'Kg',
    rate: 0,
    quantity: 0,
    gst_pct: 5,
    gst_amount: 0,
    freight: 0,
    other_charges: 0,
    amount: 0,
    delivery_date: '',
    remarks: '',
  }
}

export async function nextOrderNo(client: SupabaseClient, orderType: OrderType): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `${ORDER_PREFIX[orderType]}-${year}-`
  const { data } = await client
    .from('order_entries')
    .select('order_no')
    .like('order_no', `${prefix}%`)
    .order('order_no', { ascending: false })
    .limit(50)
  let max = 0
  for (const row of data ?? []) {
    const m = String(row.order_no || '').match(/-(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function loadSuppliers(client: SupabaseClient): Promise<OrderSupplier[]> {
  const { data, error } = await client.from('order_suppliers').select('*').order('supplier_name')
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as OrderSupplier[]) ?? []
}

export async function loadServiceProviders(client: SupabaseClient): Promise<OrderServiceProvider[]> {
  const { data, error } = await client.from('order_service_providers').select('*').order('company_name')
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as OrderServiceProvider[]) ?? []
}

export async function loadWarpItems(client: SupabaseClient): Promise<OrderWarpItem[]> {
  const { data, error } = await client.from('order_warp_items').select('*').order('item_name')
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as OrderWarpItem[]) ?? []
}

export async function loadWeftColours(client: SupabaseClient, supplierId?: string): Promise<OrderWeftColour[]> {
  let q = client.from('order_weft_colours').select('*').order('colour_name')
  if (supplierId) q = q.eq('supplier_id', supplierId)
  const { data, error } = await q
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as OrderWeftColour[]) ?? []
}

export async function loadMaintItems(client: SupabaseClient): Promise<OrderMaintItem[]> {
  const { data, error } = await client.from('order_maint_items').select('*').order('item_name')
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as OrderMaintItem[]) ?? []
}

export async function ensureSupplier(
  client: SupabaseClient,
  input: Partial<OrderSupplier> & { supplier_name: string },
  createdBy: string,
): Promise<OrderSupplier> {
  const key = nameKey(input.supplier_name)
  const { data: existing } = await client.from('order_suppliers').select('*').eq('name_key', key).maybeSingle()
  if (existing) {
    const { data, error } = await client
      .from('order_suppliers')
      .update({
        contact_person: input.contact_person ?? existing.contact_person,
        mobile: input.mobile ?? existing.mobile,
        whatsapp: input.whatsapp ?? existing.whatsapp,
        whatsapp_business: input.whatsapp_business ?? existing.whatsapp_business,
        email: input.email ?? existing.email,
        address: input.address ?? existing.address,
        gstin: input.gstin ?? existing.gstin,
        notes: input.notes ?? existing.notes,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw error
    return data as OrderSupplier
  }
  const { data, error } = await client
    .from('order_suppliers')
    .insert({
      supplier_name: input.supplier_name.trim(),
      name_key: key,
      contact_person: input.contact_person || null,
      mobile: input.mobile || null,
      whatsapp: input.whatsapp || null,
      whatsapp_business: input.whatsapp_business || null,
      email: input.email || null,
      address: input.address || null,
      gstin: input.gstin || null,
      notes: input.notes || null,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as OrderSupplier
}

export async function ensureServiceProvider(
  client: SupabaseClient,
  input: Partial<OrderServiceProvider> & { company_name: string },
  createdBy: string,
): Promise<OrderServiceProvider> {
  const key = nameKey(input.company_name)
  const { data: existing } = await client.from('order_service_providers').select('*').eq('name_key', key).maybeSingle()
  if (existing) {
    const { data, error } = await client
      .from('order_service_providers')
      .update({
        contact_person: input.contact_person ?? existing.contact_person,
        mobile: input.mobile ?? existing.mobile,
        whatsapp: input.whatsapp ?? existing.whatsapp,
        whatsapp_business: input.whatsapp_business ?? existing.whatsapp_business,
        machine_category: input.machine_category ?? existing.machine_category,
        specialization: input.specialization ?? existing.specialization,
        address: input.address ?? existing.address,
        remarks: input.remarks ?? existing.remarks,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw error
    return data as OrderServiceProvider
  }
  const { data, error } = await client
    .from('order_service_providers')
    .insert({
      company_name: input.company_name.trim(),
      name_key: key,
      contact_person: input.contact_person || null,
      mobile: input.mobile || null,
      whatsapp: input.whatsapp || null,
      whatsapp_business: input.whatsapp_business || null,
      machine_category: input.machine_category || null,
      specialization: input.specialization || null,
      address: input.address || null,
      remarks: input.remarks || null,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as OrderServiceProvider
}

export async function ensureWarpItem(
  client: SupabaseClient,
  item: { item_name: string; denier?: string; quality_type?: string; rate?: number; supplier_id?: string },
): Promise<void> {
  const key = nameKey(item.item_name)
  const { data: existing } = await client.from('order_warp_items').select('id').eq('name_key', key).maybeSingle()
  if (existing) {
    await client
      .from('order_warp_items')
      .update({
        denier: item.denier || null,
        quality_type: item.quality_type || null,
        last_rate: item.rate ?? 0,
        last_supplier_id: item.supplier_id || null,
      })
      .eq('id', existing.id)
  } else {
    await client.from('order_warp_items').insert({
      item_name: item.item_name.trim(),
      name_key: key,
      denier: item.denier || null,
      quality_type: item.quality_type || null,
      last_rate: item.rate ?? 0,
      last_supplier_id: item.supplier_id || null,
    })
  }
}

export async function ensureWeftColour(
  client: SupabaseClient,
  item: {
    colour_name: string
    supplier_colour_no?: string
    internal_colour_no?: string
    supplier_id?: string
    yarn_quality?: string
    denier?: string
    rate?: number
  },
): Promise<void> {
  const key = nameKey(`${item.colour_name}|${item.supplier_colour_no || ''}`)
  const { data: existing } = await client
    .from('order_weft_colours')
    .select('id')
    .eq('name_key', key)
    .eq('supplier_id', item.supplier_id || null)
    .maybeSingle()
  if (existing) {
    await client
      .from('order_weft_colours')
      .update({
        colour_name: item.colour_name,
        supplier_colour_no: item.supplier_colour_no || null,
        internal_colour_no: item.internal_colour_no || null,
        yarn_quality: item.yarn_quality || null,
        denier: item.denier || null,
        last_rate: item.rate ?? 0,
      })
      .eq('id', existing.id)
  } else {
    await client.from('order_weft_colours').insert({
      colour_name: item.colour_name.trim(),
      supplier_colour_no: item.supplier_colour_no || null,
      internal_colour_no: item.internal_colour_no || null,
      supplier_id: item.supplier_id || null,
      yarn_quality: item.yarn_quality || null,
      denier: item.denier || null,
      last_rate: item.rate ?? 0,
      name_key: key,
    })
  }
}

export async function ensureMaintItem(
  client: SupabaseClient,
  item: { item_name: string; item_code?: string; specification?: string; unit?: string; rate?: number },
): Promise<void> {
  const key = nameKey(item.item_name)
  const { data: existing } = await client.from('order_maint_items').select('id').eq('name_key', key).maybeSingle()
  if (existing) {
    await client
      .from('order_maint_items')
      .update({
        item_code: item.item_code || null,
        specification: item.specification || null,
        unit: item.unit || 'Pcs',
        last_rate: item.rate ?? 0,
      })
      .eq('id', existing.id)
  } else {
    await client.from('order_maint_items').insert({
      item_name: item.item_name.trim(),
      name_key: key,
      item_code: item.item_code || null,
      specification: item.specification || null,
      unit: item.unit || 'Pcs',
      last_rate: item.rate ?? 0,
    })
  }
}

export async function addHistory(
  client: SupabaseClient,
  orderId: string,
  activity: string,
  person: string,
  mode?: string,
  message?: string,
  response?: string,
  nextFollowup?: string,
): Promise<void> {
  await client.from('order_entry_history').insert({
    order_id: orderId,
    activity,
    person,
    communication_mode: mode || null,
    message: message || null,
    response: response || null,
    next_followup_date: nextFollowup || null,
  })
}

export type SaveOrderInput = {
  id?: string
  order_type: OrderType
  order_date: string
  status?: string
  supplier_id?: string | null
  service_provider_id?: string | null
  delivery_party?: string
  delivery_date?: string
  delivery_timeline?: string
  delivery_instructions?: string
  contact_person?: string
  whatsapp?: string
  whatsapp_business?: string
  remarks?: string
  machine_no?: string
  machine_name?: string
  department?: string
  problem_category?: string
  problem_description?: string
  urgency?: string
  requested_date?: string
  required_visit_date?: string
  preferred_visit_time?: string
  expected_completion?: string
  whatsapp_message?: string
  lines: OrderEntryLine[]
  created_by: string
}

export async function saveOrder(client: SupabaseClient, input: SaveOrderInput): Promise<OrderEntry> {
  const lines = input.lines
    .filter((l) => l.item_name?.trim() || l.colour_name?.trim())
    .map((l, i) => {
      const c = calcLineAmount(l)
      return { ...l, line_no: i + 1, gst_amount: c.gst_amount, amount: c.amount }
    })
  const totals = calcOrderTotals(lines)
  const now = new Date().toISOString()

  let orderNo = ''
  if (input.id) {
    const { data: existing } = await client.from('order_entries').select('order_no').eq('id', input.id).single()
    orderNo = existing?.order_no || ''
  } else {
    orderNo = await nextOrderNo(client, input.order_type)
  }

  const header = {
    order_no: orderNo,
    order_type: input.order_type,
    order_date: input.order_date || todayISO(),
    status: input.status || 'Draft',
    supplier_id: input.supplier_id || null,
    service_provider_id: input.service_provider_id || null,
    delivery_party: input.delivery_party?.trim() || null,
    delivery_date: input.delivery_date || null,
    delivery_timeline: input.delivery_timeline || null,
    delivery_instructions: input.delivery_instructions?.trim() || null,
    contact_person: input.contact_person?.trim() || null,
    whatsapp: input.whatsapp?.trim() || null,
    whatsapp_business: input.whatsapp_business?.trim() || null,
    remarks: input.remarks?.trim() || null,
    ...totals,
    machine_no: input.machine_no?.trim() || null,
    machine_name: input.machine_name?.trim() || null,
    department: input.department?.trim() || null,
    problem_category: input.problem_category?.trim() || null,
    problem_description: input.problem_description?.trim() || null,
    urgency: input.urgency?.trim() || null,
    requested_date: input.requested_date || null,
    required_visit_date: input.required_visit_date || null,
    preferred_visit_time: input.preferred_visit_time?.trim() || null,
    expected_completion: input.expected_completion || null,
    whatsapp_message: input.whatsapp_message?.trim() || null,
    updated_by: input.created_by,
    updated_at: now,
  }

  let orderId = input.id
  if (input.id) {
    const { error } = await client.from('order_entries').update(header).eq('id', input.id)
    if (error) throw error
    await client.from('order_entry_lines').delete().eq('order_id', input.id)
  } else {
    const { data, error } = await client
      .from('order_entries')
      .insert({ ...header, created_by: input.created_by })
      .select('*')
      .single()
    if (error) throw error
    orderId = (data as OrderEntry).id
    await addHistory(client, orderId!, 'Order Created', input.created_by, 'System')
  }

  if (lines.length) {
    const { error: lErr } = await client.from('order_entry_lines').insert(
      lines.map((l) => ({
        order_id: orderId,
        line_no: l.line_no,
        item_name: l.item_name || null,
        denier: l.denier || null,
        quality_type: l.quality_type || null,
        colour_name: l.colour_name || null,
        supplier_colour_no: l.supplier_colour_no || null,
        internal_colour_no: l.internal_colour_no || null,
        item_code: l.item_code || null,
        specification: l.specification || null,
        unit: l.unit || null,
        rate: l.rate,
        quantity: l.quantity,
        gst_pct: l.gst_pct,
        gst_amount: l.gst_amount,
        freight: l.freight,
        other_charges: l.other_charges,
        amount: l.amount,
        delivery_date: l.delivery_date || null,
        remarks: l.remarks || null,
      })),
    )
    if (lErr) throw lErr
  }

  // Save item masters
  if (input.order_type === 'warp') {
    for (const l of lines) {
      if (l.item_name) await ensureWarpItem(client, {
        item_name: l.item_name,
        denier: l.denier,
        quality_type: l.quality_type,
        rate: l.rate,
        supplier_id: input.supplier_id || undefined,
      })
    }
  } else if (input.order_type === 'weft') {
    for (const l of lines) {
      if (l.colour_name) await ensureWeftColour(client, {
        colour_name: l.colour_name,
        supplier_colour_no: l.supplier_colour_no,
        internal_colour_no: l.internal_colour_no,
        supplier_id: input.supplier_id || undefined,
        yarn_quality: l.item_name,
        denier: l.denier,
        rate: l.rate,
      })
    }
  } else if (input.order_type === 'maint_material') {
    for (const l of lines) {
      if (l.item_name) await ensureMaintItem(client, {
        item_name: l.item_name,
        item_code: l.item_code,
        specification: l.specification,
        unit: l.unit,
        rate: l.rate,
      })
    }
  }

  const { data: order, error: oErr } = await client.from('order_entries').select('*').eq('id', orderId).single()
  if (oErr) throw oErr
  return order as OrderEntry
}

export async function loadOrders(
  client: SupabaseClient,
  filters?: { order_type?: string; status?: string; dateFrom?: string; dateTo?: string; search?: string },
): Promise<OrderEntry[]> {
  let q = client
    .from('order_entries')
    .select('*, order_entry_lines(*)')
    .order('order_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (filters?.order_type) q = q.eq('order_type', filters.order_type)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.dateFrom) q = q.gte('order_date', filters.dateFrom)
  if (filters?.dateTo) q = q.lte('order_date', filters.dateTo)
  const { data, error } = await q
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  let rows = ((data as OrderEntry[]) ?? []).map((e) => {
    const raw = e as OrderEntry & { order_entry_lines?: OrderEntryLine[] }
    return { ...e, lines: (e.lines ?? raw.order_entry_lines ?? []) as OrderEntryLine[] }
  })
  if (filters?.search) {
    const s = filters.search.toLowerCase()
    rows = rows.filter(
      (o) =>
        o.order_no.toLowerCase().includes(s) ||
        (o.delivery_party || '').toLowerCase().includes(s) ||
        (o.remarks || '').toLowerCase().includes(s),
    )
  }
  return rows
}

export async function loadOrderHistory(client: SupabaseClient, orderId: string): Promise<OrderHistory[]> {
  const { data, error } = await client
    .from('order_entry_history')
    .select('*')
    .eq('order_id', orderId)
    .order('activity_at', { ascending: false })
  if (error) throw error
  return (data as OrderHistory[]) ?? []
}

export async function loadAllHistory(client: SupabaseClient, limit = 100): Promise<(OrderHistory & { order_no?: string })[]> {
  const { data, error } = await client
    .from('order_entry_history')
    .select('*, order_entries(order_no)')
    .order('activity_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return ((data ?? []) as Array<OrderHistory & { order_entries: { order_no: string } | null }>).map((r) => ({
    ...r,
    order_no: r.order_entries?.order_no,
  }))
}

export function buildWarpWhatsApp(order: OrderEntry, lines: OrderEntryLine[]): string {
  const items = lines
    .map(
      (l) =>
        `Item:\n${l.item_name}${l.denier ? ` (${l.denier})` : ''}\n\nQuantity:\n${l.quantity} Kg\n\nRate:\n₹${l.rate}/Kg`,
    )
    .join('\n\n---\n\n')
  return `Namaste ji,

From JAISAL FASHIONWEAV INDUSTRIES.

Please confirm the following order with us:

Order No: ${order.order_no}

${items}

Delivery Required:
${order.delivery_date || '—'}${order.delivery_timeline ? ` (${order.delivery_timeline})` : ''}

Please confirm the order and delivery schedule.

Kindly send the invoice/challan on WhatsApp after dispatch.

Thank you.

JAISAL FASHIONWEAV INDUSTRIES`
}

export function buildWeftWhatsApp(order: OrderEntry, lines: OrderEntryLine[]): string {
  const items = lines
    .map(
      (l) =>
        `Colour: ${l.colour_name}\nSupplier Colour No.: ${l.supplier_colour_no || '—'}\nYarn: ${l.item_name || '—'}\nQty: ${l.quantity} Kg\nRate: ₹${l.rate}/Kg`,
    )
    .join('\n\n')
  return `Namaste ji,

From JAISAL FASHIONWEAV INDUSTRIES.

Please confirm the following Weft Yarn order:

Order No: ${order.order_no}
Supplier: ${order.delivery_party || '—'}

${items}

Delivery Required:
${order.delivery_date || '—'}${order.delivery_timeline ? ` (${order.delivery_timeline})` : ''}

Please confirm the order and delivery schedule.

Thank you.

JAISAL FASHIONWEAV INDUSTRIES`
}

export function buildMaterialWhatsApp(order: OrderEntry, lines: OrderEntryLine[]): string {
  const items = lines
    .map((l) => `${l.item_name} — ${l.quantity} ${l.unit || 'Pcs'} @ ₹${l.rate}`)
    .join('\n')
  return `Namaste ji,

From JAISAL FASHIONWEAV INDUSTRIES.

Maintenance Material Order:

Order No: ${order.order_no}

${items}

Required Date: ${order.delivery_date || '—'}
Total: ₹${order.total_payable.toLocaleString('en-IN')}

Please confirm availability and delivery.

Thank you.

JAISAL FASHIONWEAV INDUSTRIES`
}

export function buildRepairWhatsApp(order: OrderEntry): string {
  return `Namaste ji,

JAISAL FASHIONWEAV INDUSTRIES se message hai.

Hamari machine mein problem hai:

Machine:
${order.machine_name || order.machine_no || '—'}

Problem:
${order.problem_description || '—'}

Kripya urgent basis par technician bhejkar machine ko check aur repair kar dijiye.

Aapke technician ke aane ka confirmation kripya WhatsApp par reply karke bhej dijiye.

Please confirm:

1. Technician Name
2. Expected Arrival Time
3. Expected Visit Date

${order.urgency === 'URGENT' ? 'Urgent requirement.' : ''}

Thank you.

JAISAL FASHIONWEAV INDUSTRIES`
}

export function buildWhatsAppMessage(order: OrderEntry, lines: OrderEntryLine[]): string {
  if (order.order_type === 'warp') return buildWarpWhatsApp(order, lines)
  if (order.order_type === 'weft') return buildWeftWhatsApp(order, lines)
  if (order.order_type === 'maint_material') return buildMaterialWhatsApp(order, lines)
  return buildRepairWhatsApp(order)
}

export function shareWhatsAppToPhone(phone: string, text: string, business = false) {
  const clean = phone.replace(/\D/g, '')
  const num = clean.startsWith('91') || clean.length > 10 ? clean : `91${clean}`
  const base = business ? 'https://api.whatsapp.com/send' : 'https://wa.me'
  const url = `${base}/${num}?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function printOrder(order: OrderEntry, lines: OrderEntryLine[], supplierName: string) {
  const isRepair = order.order_type === 'maint_repair'
  const lineRows = isRepair
    ? ''
    : lines
        .map(
          (l, i) =>
            `<tr><td>${i + 1}</td><td>${l.item_name || l.colour_name || '—'}</td><td>${l.quantity}</td><td>${l.rate}</td><td>${l.gst_pct}%</td><td>₹${l.amount.toLocaleString('en-IN')}</td></tr>`,
        )
        .join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${order.order_no}</title>
<style>body{font-family:system-ui,sans-serif;padding:2rem;max-width:800px;margin:0 auto}
h1{text-align:center;color:#1a5276;margin:0}h2{text-align:center;font-size:14px;color:#666;margin:4px 0 20px}
table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
th{background:#f0f4f8}.totals{margin-top:16px;text-align:right;font-size:14px}.totals strong{font-size:18px}
</style></head><body>
<h1>JAISAL FASHIONWEAV INDUSTRIES</h1>
<h2>${ORDER_TYPE_LABELS[order.order_type as OrderType] || order.order_type}</h2>
<table>
<tr><th>Order No.</th><td><strong>${order.order_no}</strong></td><th>Date</th><td>${order.order_date}</td></tr>
<tr><th>${isRepair ? 'Service Provider' : 'Supplier'}</th><td>${supplierName}</td><th>Status</th><td>${order.status}</td></tr>
${isRepair ? `<tr><th>Machine</th><td colspan="3">${order.machine_name || order.machine_no || '—'}</td></tr>
<tr><th>Problem</th><td colspan="3">${order.problem_description || '—'}</td></tr>
<tr><th>Urgency</th><td>${order.urgency || '—'}</td><th>Visit Date</th><td>${order.required_visit_date || '—'}</td></tr>` :
`<tr><th>Delivery Date</th><td>${order.delivery_date || '—'}</td><th>Timeline</th><td>${order.delivery_timeline || '—'}</td></tr>
<tr><th>Delivery To</th><td colspan="3">${order.delivery_party || '—'}</td></tr>`}
</table>
${isRepair ? '' : `<table><thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th></tr></thead><tbody>${lineRows}</tbody></table>
<div class="totals">
<div>Total Qty: ${order.total_qty}</div>
<div>Basic: ₹${order.total_basic.toLocaleString('en-IN')}</div>
<div>GST: ₹${order.total_gst.toLocaleString('en-IN')}</div>
<div>Freight: ₹${order.total_freight.toLocaleString('en-IN')}</div>
<div><strong>Total Payable: ₹${order.total_payable.toLocaleString('en-IN')}</strong></div>
</div>`}
<p>Remarks: ${order.remarks || '—'}</p>
<p style="margin-top:40px">Authorized By: ${order.created_by || '—'}</p>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export { todayISO }
