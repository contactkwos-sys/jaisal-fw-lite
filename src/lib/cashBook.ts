import type {
  CashBookCategory,
  CashBookEntry,
  CashBookEntryItem,
  CashBookEntryType,
  CashBookItemMaster,
} from './database.types'
import { applyEditDeleteOrQueue } from './pendingApprovals'
import { supabase } from './supabase'

export type CashBookLineItemInput = {
  item_name: string
  amount: number
}

export type CashBookInsert = {
  entry_date: string
  entry_type: CashBookEntryType
  party_name?: string | null
  contact_number?: string | null
  category: CashBookCategory
  machine_number?: string | null
  purpose_notes?: string | null
  amount: number
  entered_by: string
  items?: CashBookLineItemInput[]
}

export type CashBookUpdate = {
  entry_date: string
  entry_type: CashBookEntryType
  party_name?: string | null
  contact_number?: string | null
  category: CashBookCategory
  machine_number?: string | null
  purpose_notes?: string | null
  amount: number
  edited_by?: string
  items?: CashBookLineItemInput[]
}

export type PartyLedgerRow = {
  party_name: string
  credit_total: number
  debit_total: number
  balance: number
  entries: CashBookEntry[]
}

export type LedgerBookDay = {
  entry_date: string
  credits: CashBookEntry[]
  debits: CashBookEntry[]
  credit_total: number
  debit_total: number
}

/** Turn Supabase / PostgREST errors into a specific UI message (never bare "Save failed"). */
export function formatCashBookError(err: unknown, fallback = 'Save failed'): string {
  if (!err) return fallback
  if (typeof err === 'object' && err !== null) {
    const e = err as {
      message?: string
      code?: string
      details?: string
      hint?: string
      error?: string
    }
    const msg = e.message || e.error
    if (msg) {
      const bits = [msg]
      if (e.details && e.details !== msg) bits.push(e.details)
      if (e.hint) bits.push(e.hint)
      if (e.code) bits.push(`[${e.code}]`)
      return bits.join(' — ')
    }
  }
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.trim()) return err
  return fallback
}

function itemsSummary(items: CashBookLineItemInput[] | undefined): string | null {
  if (!items?.length) return null
  return items.map((i) => i.item_name.trim()).filter(Boolean).join(', ') || null
}

function normalizeParty(name: string | null | undefined): string {
  return (name ?? '').trim()
}

export async function fetchCashBookEntries(): Promise<CashBookEntry[]> {
  const { data, error } = await supabase
    .from('cashbook_entries')
    .select('*, cashbook_entry_items(*)')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    // Fallback if embed not available yet
    const plain = await supabase
      .from('cashbook_entries')
      .select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (plain.error) throw plain.error
    return (plain.data as CashBookEntry[]) ?? []
  }
  return ((data as Array<CashBookEntry & { cashbook_entry_items?: CashBookEntryItem[] }>) ?? []).map(
    (row) => {
      const { cashbook_entry_items, ...rest } = row
      return {
        ...rest,
        items: cashbook_entry_items ?? row.items ?? [],
      }
    },
  )
}

export async function fetchCashBookItemMaster(): Promise<CashBookItemMaster[]> {
  const { data, error } = await supabase
    .from('cashbook_items_master')
    .select('id, item_name, created_at')
    .order('item_name', { ascending: true })
  if (error) throw error
  return (data as CashBookItemMaster[]) ?? []
}

export async function addCashBookItemMaster(itemName: string): Promise<CashBookItemMaster> {
  const name = itemName.trim()
  if (!name) throw new Error('Item name is required')
  const { data: existing } = await supabase
    .from('cashbook_items_master')
    .select('id, item_name, created_at')
    .ilike('item_name', name)
    .maybeSingle()
  if (existing) return existing as CashBookItemMaster

  const { data, error } = await supabase
    .from('cashbook_items_master')
    .insert({ item_name: name })
    .select('id, item_name, created_at')
    .single()
  if (error) throw error
  return data as CashBookItemMaster
}

async function replaceEntryItems(entryId: string, items: CashBookLineItemInput[]) {
  const { error: delErr } = await supabase.from('cashbook_entry_items').delete().eq('entry_id', entryId)
  if (delErr) throw delErr
  const rows = items
    .map((i) => ({
      entry_id: entryId,
      item_name: i.item_name.trim(),
      amount: Number(i.amount),
    }))
    .filter((i) => i.item_name && Number.isFinite(i.amount) && i.amount > 0)
  if (!rows.length) return
  const { error } = await supabase.from('cashbook_entry_items').insert(rows)
  if (error) throw error
}

export async function insertCashBookEntry(payload: CashBookInsert): Promise<string> {
  const items = payload.items ?? []
  const purpose =
    payload.purpose_notes?.trim() ||
    (payload.category === 'Deposit from Owner' ? '' : itemsSummary(items) || '')
  if (payload.category === 'Deposit from Owner' && !purpose) {
    throw new Error('Purpose is required for Deposit from Owner')
  }
  const row = {
    entry_date: payload.entry_date,
    entry_type: payload.entry_type,
    party_name: normalizeParty(payload.party_name),
    contact_number: payload.contact_number?.trim() || null,
    category: payload.category,
    machine_number:
      payload.category === 'Machine Repair' ? payload.machine_number?.trim() || null : null,
    purpose_notes: purpose || null,
    amount: payload.amount,
    entered_by: payload.entered_by,
  }
  const { data, error } = await supabase.from('cashbook_entries').insert(row).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id
  if (items.length) {
    try {
      await replaceEntryItems(id, items)
    } catch (itemErr) {
      // Keep parent row but surface item error clearly
      throw new Error(
        `Entry saved but line items failed: ${formatCashBookError(itemErr, 'items insert failed')}`,
      )
    }
  }
  return id
}

function normalizeUpdate(payload: CashBookUpdate) {
  const items = payload.items ?? []
  const purpose =
    payload.purpose_notes?.trim() ||
    (payload.category === 'Deposit from Owner' ? '' : itemsSummary(items) || '')
  if (payload.category === 'Deposit from Owner' && !purpose) {
    throw new Error('Purpose is required for Deposit from Owner')
  }
  return {
    entry_date: payload.entry_date,
    entry_type: payload.entry_type,
    party_name: normalizeParty(payload.party_name),
    contact_number: payload.contact_number?.trim() || null,
    category: payload.category,
    machine_number:
      payload.category === 'Machine Repair' ? payload.machine_number?.trim() || null : null,
    purpose_notes: purpose || null,
    amount: payload.amount,
    edited_by: payload.edited_by || null,
  }
}

/**
 * Cash Book edit/delete: CEO only may apply immediately.
 * All other roles always queue for CEO approval (no 7-day free window).
 */
export async function updateCashBookEntryOrQueue(args: {
  entry: CashBookEntry
  payload: CashBookUpdate
  isCeo: boolean
  requestedBy: string
}): Promise<'applied' | 'queued'> {
  const data = normalizeUpdate(args.payload)
  const items = args.payload.items ?? []
  return applyEditDeleteOrQueue({
    isCeo: args.isCeo,
    createdAt: args.entry.created_at,
    tableName: 'cashbook_entries',
    recordId: args.entry.id,
    action: 'edit',
    requestedBy: args.requestedBy,
    newData: { ...data, _items: items },
    requireCeoApproval: true,
    apply: async () => {
      const stamp = {
        ...data,
        edit_approved_by: args.requestedBy,
        edit_approved_at: new Date().toISOString(),
      }
      const { error } = await supabase.from('cashbook_entries').update(stamp).eq('id', args.entry.id)
      if (error) throw error
      await replaceEntryItems(args.entry.id, items)
    },
  })
}

/** Cash Book delete: CEO applies now; others always queue for CEO approval. */
export async function deleteCashBookEntryOrQueue(args: {
  entry: CashBookEntry
  isCeo: boolean
  requestedBy: string
}): Promise<'applied' | 'queued'> {
  return applyEditDeleteOrQueue({
    isCeo: args.isCeo,
    createdAt: args.entry.created_at,
    tableName: 'cashbook_entries',
    recordId: args.entry.id,
    action: 'delete',
    requestedBy: args.requestedBy,
    newData: null,
    requireCeoApproval: true,
    apply: async () => {
      const stamp = {
        edited_by: args.requestedBy,
        edit_approved_by: args.requestedBy,
        edit_approved_at: new Date().toISOString(),
      }
      const { error: uErr } = await supabase
        .from('cashbook_entries')
        .update(stamp)
        .eq('id', args.entry.id)
      if (uErr) throw uErr
      const { error } = await supabase.from('cashbook_entries').delete().eq('id', args.entry.id)
      if (error) throw error
    },
  })
}

export function buildPartyLedgers(entries: CashBookEntry[]): PartyLedgerRow[] {
  const map = new Map<string, PartyLedgerRow>()
  const chronological = [...entries].sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date)
    if (d !== 0) return d
    return a.created_at.localeCompare(b.created_at)
  })

  for (const row of chronological) {
    const key = row.party_name.trim() || 'General'
    let ledger = map.get(key.toLowerCase())
    if (!ledger) {
      ledger = {
        party_name: key,
        credit_total: 0,
        debit_total: 0,
        balance: 0,
        entries: [],
      }
      map.set(key.toLowerCase(), ledger)
    }
    const amount = Number(row.amount) || 0
    if (row.entry_type === 'credit') {
      ledger.credit_total += amount
      ledger.balance += amount
    } else {
      ledger.debit_total += amount
      ledger.balance -= amount
    }
    ledger.entries.push(row)
  }

  return [...map.values()].sort((a, b) => a.party_name.localeCompare(b.party_name))
}

/** Traditional register: date-grouped credit (left) / debit (right) pages. */
export function buildLedgerBook(entries: CashBookEntry[]): {
  days: LedgerBookDay[]
  total_credit: number
  total_debit: number
  running_balance: number
} {
  const byDate = new Map<string, LedgerBookDay>()
  const chronological = [...entries].sort((a, b) => {
    const d = a.entry_date.localeCompare(b.entry_date)
    if (d !== 0) return d
    return a.created_at.localeCompare(b.created_at)
  })

  let total_credit = 0
  let total_debit = 0

  for (const row of chronological) {
    let day = byDate.get(row.entry_date)
    if (!day) {
      day = {
        entry_date: row.entry_date,
        credits: [],
        debits: [],
        credit_total: 0,
        debit_total: 0,
      }
      byDate.set(row.entry_date, day)
    }
    const amount = Number(row.amount) || 0
    if (row.entry_type === 'credit') {
      day.credits.push(row)
      day.credit_total += amount
      total_credit += amount
    } else {
      day.debits.push(row)
      day.debit_total += amount
      total_debit += amount
    }
  }

  const days = [...byDate.values()].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  return {
    days,
    total_credit,
    total_debit,
    running_balance: total_credit - total_debit,
  }
}

export function entryItemsLabel(entry: CashBookEntry): string {
  // Owner deposits are purpose-driven — prefer purpose_notes when present
  if (entry.category === 'Deposit from Owner' && entry.purpose_notes?.trim()) {
    return entry.purpose_notes.trim()
  }
  if (entry.items?.length) {
    return entry.items.map((i) => i.item_name).join(', ')
  }
  return entry.purpose_notes?.trim() || '—'
}

export function isOwnerDepositCategory(category: CashBookCategory): boolean {
  return category === 'Deposit from Owner'
}
