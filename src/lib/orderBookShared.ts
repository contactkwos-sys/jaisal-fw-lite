/**
 * Shared customer order helpers — canonical order_book writes.
 * Phase 2: unified order number + party marka for all customer order paths.
 */

import type { AdjustmentNote } from './database.types'
import { suggestMarka } from './marka'
import { nextDocNo } from './mutate'
import { supabase } from './supabase'

/** Canonical order number prefix (OTP format). Legacy ORD-0001 rows remain valid. */
export const CUSTOMER_ORDER_NO_PREFIX = 'ORD'

/**
 * Field mapping: Legacy Order Book entry → Canonical Customer Order (OTP)
 *
 * | Legacy (OrderBookScreen)     | Canonical (OrderToProgram)     | Notes                          |
 * |-----------------------------|--------------------------------|--------------------------------|
 * | party_name                  | party_name                     | Direct                         |
 * | order_date                  | order_date                     | Direct                         |
 * | delivery_date (date)        | delivery_within_days (int)     | Different semantics — preserved on legacy rows |
 * | remarks                     | remarks                        | Direct                         |
 * | payment_days (int)          | payment_terms (text)           | Legacy rows keep payment_days  |
 * | discount_pct                | discount_pct                   | Direct                         |
 * | design_no (free text)       | dinNumber + din_id             | Legacy rows have no din_id     |
 * | colour (per line)           | mainColour / matching          | Direct on order_book_items     |
 * | quality (per line)          | quality_name (header)          | Legacy keeps per-line quality  |
 * | total_pcs                   | —                              | Preserved on legacy items only |
 * | qty_meter                   | qty_meter                      | Direct                         |
 * | rate (per line)             | sales_rate (header)            | Legacy keeps per-line rate     |
 * | status = 'Pending'          | status = 'ORDER RECEIVED'      | Both valid — not migrated      |
 *
 * Unmappable for automatic row migration: total_pcs, per-line rate vs header rate,
 * delivery_date vs delivery_within_days, payment_days vs payment_terms.
 * Legacy data stays in place; new orders use canonical OTP UI only.
 */

export async function nextCustomerOrderNo(): Promise<string> {
  const { data } = await supabase.from('order_book').select('order_no').not('order_no', 'is', null).limit(500)
  return nextDocNo(
    CUSTOMER_ORDER_NO_PREFIX,
    (data ?? []).map((r) => String(r.order_no || '')),
  )
}

/** Upsert party_master marka — used by legacy Order Book and canonical Customer Order. */
export async function ensurePartyMarka(partyName: string): Promise<void> {
  const name = partyName.trim()
  if (!name) return
  const marka = suggestMarka(name)
  const { data: existing } = await supabase
    .from('party_master')
    .select('id, marka')
    .ilike('party_name', name)
    .maybeSingle()
  if (existing?.id && !existing.marka) {
    await supabase.from('party_master').update({ marka }).eq('id', existing.id)
  } else if (!existing) {
    await supabase.from('party_master').insert({ party_name: name, marka })
  }
}

export type OrderSettlementRow = {
  orderId: string
  itemId: string
  party: string
  design_no: string
  colour: string
  order_date: string
  ordered: number
  programmed: number
  dispatched: number
  settled: boolean
  isLegacy: boolean
  adjustments: AdjustmentNote[]
}

export async function loadOrderSettlementRows(limit = 300): Promise<OrderSettlementRow[]> {
  const [{ data: items, error: iErr }, { data: programs }, { data: petty }, { data: notes }] =
    await Promise.all([
      supabase
        .from('order_book_items')
        .select('*, order_book(id, party_name, order_date, din_id)')
        .limit(limit),
      supabase.from('programs').select('id, order_item_id, dispatched_meter, status'),
      supabase.from('program_petty').select('program_id, meter'),
      supabase.from('adjustment_notes').select('*').order('created_at', { ascending: false }),
    ])
  if (iErr) throw iErr

  const pettyByProgram = new Map<string, number>()
  for (const p of petty ?? []) {
    pettyByProgram.set(p.program_id, (pettyByProgram.get(p.program_id) || 0) + Number(p.meter || 0))
  }
  const progByItem = new Map<string, { programmed: number; dispatched: number }>()
  for (const p of programs ?? []) {
    if (!p.order_item_id) continue
    const cur = progByItem.get(p.order_item_id) || { programmed: 0, dispatched: 0 }
    cur.programmed += pettyByProgram.get(p.id) || 0
    cur.dispatched += Number(p.dispatched_meter || 0)
    progByItem.set(p.order_item_id, cur)
  }
  const notesByItem = new Map<string, AdjustmentNote[]>()
  for (const n of (notes ?? []) as AdjustmentNote[]) {
    if (!n.order_item_id) continue
    const list = notesByItem.get(n.order_item_id) || []
    list.push(n)
    notesByItem.set(n.order_item_id, list)
  }

  return (items ?? []).map((it: any) => {
    const agg = progByItem.get(it.id) || { programmed: 0, dispatched: 0 }
    const header = it.order_book
    return {
      orderId: it.order_id,
      itemId: it.id,
      party: header?.party_name || '—',
      design_no: it.design_no || '—',
      colour: it.colour || '—',
      order_date: header?.order_date || '',
      ordered: Number(it.qty_meter || 0),
      programmed: agg.programmed,
      dispatched: agg.dispatched,
      settled: Boolean(it.settled),
      isLegacy: !it.matching_no && !it.din_id && !header?.din_id,
      adjustments: notesByItem.get(it.id) || [],
    }
  })
}

export type SaveAdjustmentInput = {
  orderItemId: string
  adjustmentType: 'carry_forward' | 'write_off' | 'top_up_program'
  reason: string
  meter: number
  designNo: string
}

export async function saveOrderAdjustment(input: SaveAdjustmentInput): Promise<void> {
  const note = {
    order_item_id: input.orderItemId,
    adjustment_type: input.adjustmentType,
    reason: input.reason.trim() || null,
    meter: input.meter,
  }
  const { error: nErr } = await supabase.from('adjustment_notes').insert(note)
  if (nErr) throw nErr
  if (input.adjustmentType === 'write_off') {
    const { error: sErr } = await supabase.from('order_book_items').update({ settled: true }).eq('id', input.orderItemId)
    if (sErr) throw sErr
  }
  if (input.adjustmentType === 'top_up_program' && input.meter > 0) {
    const { data: prog, error: pErr } = await supabase
      .from('programs')
      .insert({ order_item_id: input.orderItemId, machine_no: null, status: 'pending' })
      .select('id')
      .single()
    if (pErr) throw pErr
    const { error: tErr } = await supabase.from('program_petty').insert({
      program_id: prog.id,
      petty_label: 'Top-up',
      item_name: input.designNo,
      meter: input.meter,
    })
    if (tErr) throw tErr
  }
}
