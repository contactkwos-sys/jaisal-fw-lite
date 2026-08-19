import type { CashBookCategory, CashBookEntry, CashBookEntryType } from './database.types'
import { applyEditDeleteOrQueue } from './pendingApprovals'
import { supabase } from './supabase'

export type CashBookInsert = {
  entry_date: string
  entry_type: CashBookEntryType
  party_name: string
  contact_number?: string | null
  category: CashBookCategory
  machine_number?: string | null
  purpose_notes?: string | null
  amount: number
  entered_by: string
}

export type CashBookUpdate = {
  entry_date: string
  entry_type: CashBookEntryType
  party_name: string
  contact_number?: string | null
  category: CashBookCategory
  machine_number?: string | null
  purpose_notes?: string | null
  amount: number
  edited_by?: string
}

export type PartyLedgerRow = {
  party_name: string
  credit_total: number
  debit_total: number
  balance: number
  entries: CashBookEntry[]
}

export async function fetchCashBookEntries(): Promise<CashBookEntry[]> {
  const { data, error } = await supabase
    .from('cashbook_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as CashBookEntry[]) ?? []
}

export async function insertCashBookEntry(payload: CashBookInsert): Promise<void> {
  const { error } = await supabase.from('cashbook_entries').insert({
    ...payload,
    contact_number: payload.contact_number?.trim() || null,
    machine_number: payload.category === 'Machine Repair' ? payload.machine_number?.trim() || null : null,
    purpose_notes: payload.purpose_notes?.trim() || null,
    party_name: payload.party_name.trim(),
  })
  if (error) throw error
}

function normalizeUpdate(payload: CashBookUpdate) {
  return {
    entry_date: payload.entry_date,
    entry_type: payload.entry_type,
    party_name: payload.party_name.trim(),
    contact_number: payload.contact_number?.trim() || null,
    category: payload.category,
    machine_number:
      payload.category === 'Machine Repair' ? payload.machine_number?.trim() || null : null,
    purpose_notes: payload.purpose_notes?.trim() || null,
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
    const key = row.party_name.trim() || 'Unknown'
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
