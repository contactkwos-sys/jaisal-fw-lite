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

/**
 * Upsert item names into master in parallel. Skips names already known locally
 * (case-insensitive) and "Other". Safe to fire-and-forget after a save.
 */
export async function ensureCashBookItemsInMaster(
  itemNames: string[],
  knownNames?: Iterable<string>,
): Promise<CashBookItemMaster[]> {
  const known = new Set(
    [...(knownNames ?? [])].map((n) => n.trim().toLowerCase()).filter(Boolean),
  )
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of itemNames) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (key === 'other' || known.has(key) || seen.has(key)) continue
    seen.add(key)
    unique.push(name)
  }
  if (!unique.length) return []
  const results = await Promise.allSettled(unique.map((name) => addCashBookItemMaster(name)))
  return results
    .filter((r): r is PromiseFulfilledResult<CashBookItemMaster> => r.status === 'fulfilled')
    .map((r) => r.value)
}

/** Persist machine tag for debit expenses (and Machine Repair, which requires it). */
function resolveMachineNumber(payload: {
  entry_type: CashBookEntryType
  category: CashBookCategory
  machine_number?: string | null
}): string | null {
  const trimmed = payload.machine_number?.trim() || null
  if (payload.category === 'Machine Repair') return trimmed
  if (payload.entry_type === 'debit') return trimmed
  return null
}

async function replaceEntryItems(entryId: string, items: CashBookLineItemInput[]) {
  const rows = items
    .map((i) => ({
      entry_id: entryId,
      item_name: i.item_name.trim(),
      amount: Number(i.amount),
    }))
    .filter((i) => i.item_name && Number.isFinite(i.amount) && i.amount > 0)

  // Single round-trip when clearing; otherwise delete+insert (no upsert key available)
  const { error: delErr } = await supabase.from('cashbook_entry_items').delete().eq('entry_id', entryId)
  if (delErr) throw delErr
  if (!rows.length) return
  const { error } = await supabase.from('cashbook_entry_items').insert(rows)
  if (error) throw error
}

export type CashBookInsertResult = {
  id: string
  entry: CashBookEntry
}

export async function insertCashBookEntry(payload: CashBookInsert): Promise<CashBookInsertResult> {
  const items = payload.items ?? []
  const purpose = payload.purpose_notes?.trim() || itemsSummary(items)
  const row = {
    entry_date: payload.entry_date,
    entry_type: payload.entry_type,
    party_name: normalizeParty(payload.party_name),
    contact_number: payload.contact_number?.trim() || null,
    category: payload.category,
    machine_number: resolveMachineNumber(payload),
    purpose_notes: purpose,
    amount: payload.amount,
    entered_by: payload.entered_by,
  }
  const { data, error } = await supabase
    .from('cashbook_entries')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  const saved = data as CashBookEntry
  const id = saved.id
  let savedItems: CashBookEntryItem[] = []
  if (items.length) {
    try {
      await replaceEntryItems(id, items)
      savedItems = items.map((i, idx) => ({
        id: `local-${idx}`,
        entry_id: id,
        item_name: i.item_name.trim(),
        amount: Number(i.amount),
      }))
    } catch (itemErr) {
      // Keep parent row but surface item error clearly
      throw new Error(
        `Entry saved but line items failed: ${formatCashBookError(itemErr, 'items insert failed')}`,
      )
    }
  }
  return {
    id,
    entry: {
      ...saved,
      items: savedItems,
    },
  }
}

function normalizeUpdate(payload: CashBookUpdate) {
  const items = payload.items ?? []
  return {
    entry_date: payload.entry_date,
    entry_type: payload.entry_type,
    party_name: normalizeParty(payload.party_name),
    contact_number: payload.contact_number?.trim() || null,
    category: payload.category,
    machine_number: resolveMachineNumber(payload),
    purpose_notes: payload.purpose_notes?.trim() || itemsSummary(items),
    amount: payload.amount,
    edited_by: payload.edited_by || null,
  }
}

/** Edit within 7 days applies immediately; older → pending_approvals. */
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
    newData: data,
    apply: async () => {
      const { error } = await supabase.from('cashbook_entries').update(data).eq('id', args.entry.id)
      if (error) throw error
      await replaceEntryItems(args.entry.id, items)
    },
  })
}

/** Delete within 7 days applies immediately; older → pending_approvals. */
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
    apply: async () => {
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
  if (entry.items?.length) {
    return entry.items.map((i) => i.item_name).join(', ')
  }
  return entry.purpose_notes?.trim() || '—'
}
