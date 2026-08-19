import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  buildPartyLedgers,
  deleteCashBookEntryOrQueue,
  fetchCashBookEntries,
  insertCashBookEntry,
  updateCashBookEntryOrQueue,
} from '../lib/cashBook'
import {
  CASHBOOK_CATEGORIES,
  MACHINES,
  type CashBookCategory,
  type CashBookEntry,
  type CashBookEntryType,
} from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { isWithinEditWindow } from '../lib/pendingApprovals'

type TabId = 'entry' | 'list' | 'ledger'

type FormState = {
  entry_date: string
  entry_type: CashBookEntryType
  party_name: string
  contact_number: string
  category: CashBookCategory
  machine_number: string
  purpose_notes: string
  amount: string
}

const emptyForm = (): FormState => ({
  entry_date: todayISO(),
  entry_type: 'credit',
  party_name: '',
  contact_number: '',
  category: 'Other',
  machine_number: '',
  purpose_notes: '',
  amount: '',
})

function formFromEntry(row: CashBookEntry): FormState {
  return {
    entry_date: row.entry_date,
    entry_type: row.entry_type,
    party_name: row.party_name,
    contact_number: row.contact_number || '',
    category: row.category,
    machine_number: row.machine_number || '',
    purpose_notes: row.purpose_notes || '',
    amount: String(row.amount ?? ''),
  }
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function CashBookScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<CashBookEntry[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editEntry, setEditEntry] = useState<CashBookEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const enteredBy =
    profile?.full_name || profile?.roles?.role_name || profile?.id || 'Unknown'

  const load = useCallback(async () => {
    const data = await fetchCashBookEntries()
    setRows(data)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const ledgers = useMemo(() => buildPartyLedgers(rows), [rows])
  const needsMachine = form.category === 'Machine Repair'

  function resetForm() {
    setForm(emptyForm())
    setEditEntry(null)
  }

  function validateForm(): string | null {
    if (!form.party_name.trim()) return 'Party name is required'
    if (!form.category) return 'Category is required'
    if (needsMachine && !form.machine_number.trim()) return 'Machine number is required for Machine Repair'
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) return 'Enter a valid amount greater than 0'
    if (!form.entry_date) return 'Date is required'
    return null
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    const invalid = validateForm()
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const amount = Number(form.amount)
      if (editEntry) {
        const result = await updateCashBookEntryOrQueue({
          entry: editEntry,
          isCeo,
          requestedBy: enteredBy,
          payload: {
            entry_date: form.entry_date,
            entry_type: form.entry_type,
            party_name: form.party_name,
            contact_number: form.contact_number,
            category: form.category,
            machine_number: form.machine_number,
            purpose_notes: form.purpose_notes,
            amount,
            edited_by: enteredBy,
          },
        })
        setMessage(
          result === 'applied'
            ? 'Entry updated'
            : 'Edit queued for CEO approval (record older than 7 days)',
        )
      } else {
        await insertCashBookEntry({
          entry_date: form.entry_date,
          entry_type: form.entry_type,
          party_name: form.party_name,
          contact_number: form.contact_number,
          category: form.category,
          machine_number: form.machine_number,
          purpose_notes: form.purpose_notes,
          amount,
          entered_by: enteredBy,
        })
        setMessage('Entry saved')
      }
      resetForm()
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(row: CashBookEntry) {
    setEditEntry(row)
    setForm(formFromEntry(row))
    setTab('entry')
    setMessage(
      isCeo || isWithinEditWindow(row.created_at)
        ? 'Editing entry'
        : 'This record is older than 7 days — save will queue CEO approval',
    )
  }

  async function handleDelete(row: CashBookEntry) {
    if (!profile) return
    const needsApproval = !isCeo && !isWithinEditWindow(row.created_at)
    const ok = window.confirm(
      needsApproval
        ? `Record is older than 7 days. Send delete request to CEO for ${row.party_name}?`
        : `Delete entry for ${row.party_name}?`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await deleteCashBookEntryOrQueue({
        entry: row,
        isCeo,
        requestedBy: enteredBy,
      })
      setMessage(
        result === 'applied'
          ? 'Entry deleted'
          : 'Delete queued for CEO approval (record older than 7 days)',
      )
      if (editEntry?.id === row.id) resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen cashbook-screen">
      <header className="screen-header">
        <h1>Cash Book</h1>
        <p className="text-muted">Credit / debit cash entries with party-wise ledger</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: editEntry ? 'Edit Entry' : 'New Entry' },
            { id: 'list', label: 'Entries' },
            { id: 'ledger', label: 'Party Ledger' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack cashbook-form" onSubmit={(e) => void handleSave(e)}>
          {editEntry ? (
            <p className="text-muted2">
              Editing ·{' '}
              <button type="button" className="btn-ghost cashbook-link-btn" onClick={resetForm}>
                Cancel edit
              </button>
            </p>
          ) : null}

          <div className="field">
            <span>Entry type</span>
            <div className="cashbook-type-toggle" role="group" aria-label="Entry type">
              <button
                type="button"
                className={
                  form.entry_type === 'credit'
                    ? 'cashbook-type-btn credit active'
                    : 'cashbook-type-btn credit'
                }
                onClick={() => setForm((f) => ({ ...f, entry_type: 'credit' }))}
              >
                Credit
              </button>
              <button
                type="button"
                className={
                  form.entry_type === 'debit'
                    ? 'cashbook-type-btn debit active'
                    : 'cashbook-type-btn debit'
                }
                onClick={() => setForm((f) => ({ ...f, entry_type: 'debit' }))}
              >
                Debit
              </button>
            </div>
          </div>

          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={form.entry_date}
              onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
              required
            />
          </label>

          <label className="field">
            <span>Party name</span>
            <input
              value={form.party_name}
              onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
              placeholder="Person / party"
              required
            />
          </label>

          <label className="field">
            <span>Contact number</span>
            <input
              value={form.contact_number}
              onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))}
              placeholder="Optional"
              inputMode="tel"
            />
          </label>

          <label className="field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as CashBookCategory,
                  machine_number: e.target.value === 'Machine Repair' ? f.machine_number : '',
                }))
              }
            >
              {CASHBOOK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {needsMachine ? (
            <label className="field">
              <span>Machine number</span>
              <select
                value={form.machine_number}
                onChange={(e) => setForm((f) => ({ ...f, machine_number: e.target.value }))}
                required
              >
                <option value="">Select machine</option>
                {MACHINES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field">
            <span>Purpose / notes</span>
            <textarea
              value={form.purpose_notes}
              onChange={(e) => setForm((f) => ({ ...f, purpose_notes: e.target.value }))}
              rows={2}
            />
          </label>

          <label className="field">
            <span>Amount</span>
            <input
              className="num"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editEntry ? 'Update entry' : 'Save entry'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="list">
          {rows.map((row) => (
            <article key={row.id} className="card-row surface row-top">
              <div>
                <strong className={row.entry_type === 'credit' ? 'text-sage' : 'text-danger'}>
                  {row.entry_type === 'credit' ? '+' : '−'}₹{formatMoney(Number(row.amount))}
                </strong>
                <div>
                  {row.party_name} · {row.category}
                  {row.machine_number ? ` · ${row.machine_number}` : ''}
                </div>
                <div className="text-muted2">
                  {row.entry_date} · {row.entered_by}
                  {!isWithinEditWindow(row.created_at) ? ' · needs approval to edit' : ''}
                </div>
              </div>
              <div className="icon-actions">
                <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => startEdit(row)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost icon-btn"
                  disabled={busy}
                  onClick={() => void handleDelete(row)}
                >
                  Del
                </button>
              </div>
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No cash book entries yet</p> : null}
        </div>
      ) : null}

      {tab === 'ledger' ? (
        <div className="list">
          {ledgers.map((led) => (
            <article key={led.party_name} className="surface dash-panel">
              <h3>{led.party_name}</h3>
              <p className="text-muted">
                Credit ₹{formatMoney(led.credit_total)} · Debit ₹{formatMoney(led.debit_total)} ·{' '}
                <strong className={led.balance >= 0 ? 'text-sage' : 'text-danger'}>
                  Balance ₹{formatMoney(led.balance)}
                </strong>
              </p>
              <ul className="text-muted2">
                {led.entries.map((e) => (
                  <li key={e.id}>
                    {e.entry_date} · {e.entry_type} ₹{formatMoney(Number(e.amount))} · {e.category}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {!ledgers.length ? <p className="text-muted">No ledger parties yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
