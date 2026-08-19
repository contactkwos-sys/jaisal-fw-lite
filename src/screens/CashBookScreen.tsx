import { useCallback, useEffect, useMemo, useState } from 'react'
import { PinPad } from '../components/PinPad'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  buildPartyLedgers,
  deleteCashBookEntry,
  fetchCashBookEntries,
  insertCashBookEntry,
  updateCashBookEntry,
  verifyCeoPin,
} from '../lib/cashBook'
import {
  CASHBOOK_CATEGORIES,
  MACHINES,
  type CashBookCategory,
  type CashBookEntry,
  type CashBookEntryType,
} from '../lib/database.types'
import { todayISO } from '../lib/mutate'

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

type PinIntent =
  | { kind: 'edit'; entry: CashBookEntry }
  | { kind: 'delete'; entry: CashBookEntry }
  | null

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
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<CashBookEntry[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editId, setEditId] = useState<string | null>(null)
  const [editApprover, setEditApprover] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [pinIntent, setPinIntent] = useState<PinIntent>(null)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinBusy, setPinBusy] = useState(false)

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
    setEditId(null)
    setEditApprover(null)
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
      if (editId) {
        if (!editApprover) {
          setError('CEO PIN approval required to edit')
          return
        }
        await updateCashBookEntry(editId, {
          entry_date: form.entry_date,
          entry_type: form.entry_type,
          party_name: form.party_name,
          contact_number: form.contact_number,
          category: form.category,
          machine_number: form.machine_number,
          purpose_notes: form.purpose_notes,
          amount,
          edited_by: enteredBy,
          edit_approved_by: editApprover,
          edit_approved_at: new Date().toISOString(),
        })
        setMessage('Entry updated (CEO approved)')
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

  function requestEdit(row: CashBookEntry) {
    setPinIntent({ kind: 'edit', entry: row })
    setPin('')
    setPinError(null)
  }

  function requestDelete(row: CashBookEntry) {
    setPinIntent({ kind: 'delete', entry: row })
    setPin('')
    setPinError(null)
  }

  function closePinModal() {
    if (pinBusy) return
    setPinIntent(null)
    setPin('')
    setPinError(null)
  }

  async function confirmPin() {
    if (!pinIntent || !profile) return
    setPinBusy(true)
    setPinError(null)
    try {
      const { approver } = await verifyCeoPin(pin)
      if (pinIntent.kind === 'edit') {
        setEditId(pinIntent.entry.id)
        setEditApprover(approver)
        setForm(formFromEntry(pinIntent.entry))
        setTab('entry')
        setMessage('CEO PIN verified — edit and save')
        setPinIntent(null)
        setPin('')
      } else {
        if (!window.confirm(`Delete entry for ${pinIntent.entry.party_name}?`)) {
          return
        }
        await deleteCashBookEntry(pinIntent.entry.id, {
          edited_by: enteredBy,
          edit_approved_by: approver,
        })
        setMessage('Entry deleted (CEO approved)')
        if (editId === pinIntent.entry.id) resetForm()
        setPinIntent(null)
        setPin('')
        await load()
      }
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'PIN verification failed')
    } finally {
      setPinBusy(false)
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
            { id: 'entry', label: editId ? 'Edit Entry' : 'New Entry' },
            { id: 'list', label: 'Entries' },
            { id: 'ledger', label: 'Party Ledger' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack cashbook-form" onSubmit={(e) => void handleSave(e)}>
          {editId ? (
            <p className="text-muted2">
              Editing entry — approved by <strong>{editApprover || 'CEO'}</strong>
              {' · '}
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
            <span>Contact number (optional)</span>
            <input
              value={form.contact_number}
              onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))}
              placeholder="Phone"
              inputMode="tel"
            />
          </label>

          <label className="field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) => {
                const category = e.target.value as CashBookCategory
                setForm((f) => ({
                  ...f,
                  category,
                  machine_number: category === 'Machine Repair' ? f.machine_number : '',
                }))
              }}
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
              rows={3}
              placeholder="Why was this cash moved?"
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

          <button type="submit" className="primary-save" disabled={busy}>
            {busy ? 'Saving…' : editId ? 'Save changes' : 'Save entry'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="list cashbook-list">
          {rows.length === 0 ? (
            <p className="text-muted">No cash book entries yet.</p>
          ) : (
            rows.map((row) => (
              <article
                key={row.id}
                className={
                  row.entry_type === 'credit'
                    ? 'card-row surface cashbook-row credit'
                    : 'card-row surface cashbook-row debit'
                }
              >
                <div className="row-top">
                  <div>
                    <div className="cashbook-row-party">{row.party_name}</div>
                    <div className="text-muted2 cashbook-row-meta">
                      {row.entry_date} · {row.category}
                      {row.machine_number ? ` · ${row.machine_number}` : ''}
                    </div>
                    {row.purpose_notes ? (
                      <div className="text-muted cashbook-row-notes">{row.purpose_notes}</div>
                    ) : null}
                  </div>
                  <div className="cashbook-row-right">
                    <span
                      className={
                        row.entry_type === 'credit'
                          ? 'cashbook-amount credit'
                          : 'cashbook-amount debit'
                      }
                    >
                      {row.entry_type === 'credit' ? '+' : '−'}
                      {formatMoney(Number(row.amount))}
                    </span>
                    <span
                      className={
                        row.entry_type === 'credit'
                          ? 'cashbook-type-chip credit'
                          : 'cashbook-type-chip debit'
                      }
                    >
                      {row.entry_type}
                    </span>
                  </div>
                </div>
                <div className="cashbook-row-actions">
                  <span className="text-muted2">by {row.entered_by}</span>
                  <div className="share-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => requestEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => requestDelete(row)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === 'ledger' ? (
        <div className="list cashbook-ledger">
          {ledgers.length === 0 ? (
            <p className="text-muted">No parties yet — add entries first.</p>
          ) : (
            ledgers.map((ledger) => (
              <section key={ledger.party_name} className="card-row surface cashbook-ledger-card">
                <div className="row-top">
                  <div>
                    <strong>{ledger.party_name}</strong>
                    <div className="text-muted2">
                      Credit {formatMoney(ledger.credit_total)} · Debit{' '}
                      {formatMoney(ledger.debit_total)}
                    </div>
                  </div>
                  <strong
                    className={
                      ledger.balance >= 0 ? 'cashbook-amount credit' : 'cashbook-amount debit'
                    }
                  >
                    Bal {formatMoney(ledger.balance)}
                  </strong>
                </div>
                <ul className="cashbook-ledger-lines">
                  {ledger.entries.map((row) => (
                    <li key={row.id}>
                      <span>
                        {row.entry_date} · {row.category}
                      </span>
                      <span
                        className={
                          row.entry_type === 'credit'
                            ? 'cashbook-amount credit'
                            : 'cashbook-amount debit'
                        }
                      >
                        {row.entry_type === 'credit' ? '+' : '−'}
                        {formatMoney(Number(row.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      ) : null}

      {pinIntent ? (
        <div className="cashbook-pin-modal" role="dialog" aria-modal="true" aria-labelledby="cashbook-pin-title">
          <button type="button" className="cashbook-pin-backdrop" aria-label="Close" onClick={closePinModal} />
          <div className="cashbook-pin-panel surface">
            <div className="cashbook-pin-head">
              <h2 id="cashbook-pin-title">CEO PIN required</h2>
              <p className="text-muted">
                Enter CEO PIN to {pinIntent.kind === 'edit' ? 'edit' : 'delete'} this entry
              </p>
            </div>
            {pinError ? <p className="form-error">{pinError}</p> : null}
            <PinPad value={pin} onChange={setPin} disabled={pinBusy} />
            <div className="share-actions">
              <button type="button" className="btn-ghost" disabled={pinBusy} onClick={closePinModal}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-save"
                disabled={pinBusy || pin.length !== 4}
                onClick={() => void confirmPin()}
              >
                {pinBusy ? 'Verifying…' : 'Verify & continue'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
