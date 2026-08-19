import { getSetting, setSetting } from './appSettings'
import { supabase } from './supabase'

/** Peek next lot without incrementing. */
export async function peekNextLotNumber(): Promise<number> {
  const raw = await getSetting('checking_lot_next', '1')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

/** Allocate next lot and bump counter. */
export async function allocateLotNumber(): Promise<number> {
  const next = await peekNextLotNumber()
  await setSetting('checking_lot_next', String(next + 1))
  return next
}

/** Set the next lot that will be used (Masters). */
export async function setNextLotNumber(n: number): Promise<void> {
  if (!Number.isFinite(n) || n < 1) throw new Error('Lot number must be >= 1')
  await setSetting('checking_lot_next', String(Math.floor(n)))
}

/**
 * Resolve party name for a job card via:
 * job_cards.program_id → programs.order_item_id → order_book_items.order_id → order_book.party_name
 */
export async function resolvePartyForJobCard(jobCardId: string): Promise<string | null> {
  const { data: job, error } = await supabase
    .from('job_cards')
    .select('id, program_id, dno, colour, machine_no, total_meter, job_card_no')
    .eq('id', jobCardId)
    .maybeSingle()
  if (error) throw error
  if (!job?.program_id) return null

  const { data: prog } = await supabase
    .from('programs')
    .select('order_item_id')
    .eq('id', job.program_id)
    .maybeSingle()
  if (!prog?.order_item_id) return null

  const { data: item } = await supabase
    .from('order_book_items')
    .select('order_id')
    .eq('id', prog.order_item_id)
    .maybeSingle()
  if (!item?.order_id) return null

  const { data: order } = await supabase
    .from('order_book')
    .select('party_name')
    .eq('id', item.order_id)
    .maybeSingle()
  return order?.party_name ?? null
}

export async function nextGatePassNumber(prefix = 'GP-D'): Promise<string> {
  const { data } = await supabase
    .from('gate_pass')
    .select('gp_number')
    .order('generated_at', { ascending: false })
    .limit(80)
  let max = 0
  for (const row of data ?? []) {
    const m = String(row.gp_number || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
