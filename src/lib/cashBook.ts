import type { CashBookCategory, CashBookEntry, CashBookEntryType } from './database.types'
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
  edited_by: string
  edit_approved_by: string
  edit_approved_at: string
}

export type PartyLedgerRow = {
  party_name: string
  credit_total: number
  debit_total: number
  balance: number
  entries: CashBookEntry[]
}

/** Verify CEO PIN via pin-login without switching the current session. */
export async function verifyCeoPin(pin: string): Promise<{ approver: string }> {
  if (pin.length !== 4) throw new Error('Enter 4-digit CEO PIN')

  if (import.meta.env.VITE_SMOKE_BYPASS === '1') {
    if (pin === '3060') return { approver: 'CEO' }
    throw new Error('Invalid CEO PIN')
  }

  const { data, error } = await supabase.functions.invoke('pin-login', {
    body: { role_name: 'CEO', pin },
  })

  if (error) {
    const bodyError = (data as { error?: string; message?: string } | null)?.error
      ?? (data as { message?: string } | null)?.message
    throw new Error(bodyError ?? error.message ?? 'CEO PIN verification failed')
  }
  if (data?.error) throw new Error(String(data.error))
  if (!data?.access_token) throw new Error('Invalid CEO PIN')

  const approver =
    (data as { full_name?: string; role_name?: string } | null)?.full_name ||
    (data as { role_name?: string } | null)?.role_name ||
    'CEO'
  return { approver }
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

export async function updateCashBookEntry(id: string, payload: CashBookUpdate): Promise<void> {
  const { error } = await supabase
    .from('cashbook_entries')
    .update({
      ...payload,
      contact_number: payload.contact_number?.trim() || null,
      machine_number: payload.category === 'Machine Repair' ? payload.machine_number?.trim() || null : null,
      purpose_notes: payload.purpose_notes?.trim() || null,
      party_name: payload.party_name.trim(),
    })
    .eq('id', id)
  if (error) throw error
}

/** Stamp CEO approval then delete (satisfies RLS delete policy). */
export async function deleteCashBookEntry(
  id: string,
  args: { edited_by: string; edit_approved_by: string },
): Promise<void> {
  const stamp = {
    edited_by: args.edited_by,
    edit_approved_by: args.edit_approved_by,
    edit_approved_at: new Date().toISOString(),
  }
  const { error: uErr } = await supabase.from('cashbook_entries').update(stamp).eq('id', id)
  if (uErr) throw uErr
  const { error: dErr } = await supabase.from('cashbook_entries').delete().eq('id', id)
  if (dErr) throw dErr
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
