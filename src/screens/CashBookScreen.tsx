import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  addCashBookItemMaster,
  buildLedgerBook,
  buildPartyLedgers,
  deleteCashBookEntryOrQueue,
  entryItemsLabel,
  fetchCashBookEntries,
  fetchCashBookItemMaster,
  formatCashBookError,
  insertCashBookEntry,
  updateCashBookEntryOrQueue,
  type CashBookLineItemInput,
} from '../lib/cashBook'
import {
  CASHBOOK_CATEGORIES,
  MACHINES,
  type CashBookCategory,
  type CashBookEntry,
  type CashBookEntryType,
  type CashBookItemMaster,
} from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { isWithinEditWindow } from '../lib/pendingApprovals'

type TabId = 'entry' | 'list' | 'ledger' | 'book'

type FormItemRow = {
  key: string
  item_name: string
  amount: string
  freeText: boolean
}

type FormState = {
  entry_date: string
  entry_type: CashBookEntryType
  party_name: string
  contact_number: string
  category: CashBookCategory
  machine_number: string
  amount: string
  amountManual: boolean
  items: FormItemRow[]
}

function newItemRow(partial?: Partial<FormItemRow>): FormItemRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    item_name: '',
    amount: '',
    freeText: false,
    ...partial,
  }
}

const emptyForm = (): FormState => ({
  entry_date: todayISO(),
  entry_type: 'credit',
  party_name: '',
  contact_number: '',
  category: 'Other',
  machine_number: '',
  amount: '',
  amountManual: false,
  items: [newItemRow()],
})

function formFromEntry(row: CashBookEntry): FormState {
  const items =
    row.items?.length
      ? row.items.map((i) =>
          newItemRow({
            item_name: i.item_name,
            amount: String(i.amount ?? ''),
            freeText: i.item_name === 'Other',
          }),
        )
      : row.purpose_notes
        ? row.purpose_notes.split(',').map((name) =>
            newItemRow({
              item_name: name.trim(),
              amount: '',
              freeText: false,
            }),
          )
        : [newItemRow()]
  return {
    entry_date: row.entry_date,
    entry_type: row.entry_type,
    party_name: row.party_name || '',
    contact_number: row.contact_number || '',
    category: row.category,
    machine_number: row.machine_number || '',
    amount: String(row.amount ?? ''),
    amountManual: true,
    items: items.length ? items : [newItemRow()],
  }
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sumItemAmounts(items: FormItemRow[]): number {
  return items.reduce((s, i) => {
    const n = Number(i.amount)
    return s + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
}

function collectValidItems(items: FormItemRow[]): CashBookLineItemInput[] {
  return items
    .map((i) => ({
      item_name: i.item_name.trim(),
      amount: Number(i.amount),
    }))
    .filter((i) => i.item_name && Number.isFinite(i.amount) && i.amount > 0)
}

type ItemNameFieldProps = {
  value: string
  freeText: boolean
  master: CashBookItemMaster[]
  disabled?: boolean
  onChange: (next: { item_name: string; freeText: boolean }) => void
  onMasterAdded: (row: CashBookItemMaster) => void
  onError: (msg: string) => void
}

function ItemNameField({
  value,
  freeText,
  master,
  disabled,
  onChange,
  onMasterAdded,
  onError,
}: ItemNameFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setQuery(value)
  }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = useMemo(() => {
    const list = master.filter((m) => m.item_name.toLowerCase() !== 'other')
    if (!q) return list.slice(0, 12)
    return list.filter((m) => m.item_name.toLowerCase().includes(q)).slice(0, 12)
  }, [master, q])

  const exact = master.some((m) => m.item_name.toLowerCase() === q)
  const showAdd = q.length > 0 && !exact

  async function addNew() {
    try {
      const row = await addCashBookItemMaster(query)
      onMasterAdded(row)
      onChange({ item_name: row.item_name, freeText: false })
      setQuery(row.item_name)
      setOpen(false)
    } catch (e) {
      onError(formatCashBookError(e, 'Could not add item'))
    }
  }

  return (
    <div className="cashbook-item-ac" ref={wrapRef}>
      <input
        value={query}
        disabled={disabled}
        placeholder="Item name"
        aria-label="Item name"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const v = e.target.value
          setQuery(v)
          setOpen(true)
          onChange({ item_name: v, freeText })
        }}
      />
      {open ? (
        <ul className="cashbook-item-ac-list" role="listbox">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ item_name: m.item_name, freeText: false })
                  setQuery(m.item_name)
                  setOpen(false)
                }}
              >
                {m.item_name}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange({ item_name: 'Other', freeText: true })
                setQuery('Other')
                setOpen(false)
              }}
            >
              Other (free text)
            </button>
          </li>
          {showAdd ? (
            <li>
              <button
                type="button"
                className="cashbook-item-ac-add"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addNew()}
              >
                + Add &lsquo;{query.trim()}&rsquo; as new item
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {freeText || value === 'Other' ? (
        <input
          className="cashbook-item-other"
          value={value === 'Other' ? '' : value}
          placeholder="Describe other item"
          aria-label="Other item text"
          disabled={disabled}
          onChange={(e) => onChange({ item_name: e.target.value || 'Other', freeText: true })}
        />
      ) : null}
    </div>
  )
}

export function CashBookScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<CashBookEntry[]>([])
  const [master, setMaster] = useState<CashBookItemMaster[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editEntry, setEditEntry] = useState<CashBookEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const enteredBy =
    profile?.full_name || profile?.roles?.role_name || profile?.id || 'Unknown'

  const load = useCallback(async () => {
    const [data, items] = await Promise.all([fetchCashBookEntries(), fetchCashBookItemMaster()])
    setRows(data)
    setMaster(items)
  }, [])

  useEffect(() => {
    void load().catch((e: unknown) => setError(formatCashBookError(e, 'Load failed')))
  }, [load])

  const ledgers = useMemo(() => buildPartyLedgers(rows), [rows])
  const book = useMemo(() => buildLedgerBook(rows), [rows])
  const needsMachine = form.category === 'Machine Repair'
  const itemsTotal = useMemo(() => sumItemAmounts(form.items), [form.items])

  useEffect(() => {
    if (form.amountManual) return
    if (itemsTotal > 0) {
      setForm((f) => ({ ...f, amount: String(itemsTotal) }))
    }
  }, [itemsTotal, form.amountManual])

  function resetForm() {
    setForm(emptyForm())
    setEditEntry(null)
  }

  function validateForm(): string | null {
    if (!form.category) return 'Category is required'
    if (needsMachine && !form.machine_number.trim()) {
      return 'Machine number is required for Machine Repair'
    }
    const validItems = collectValidItems(form.items)
    const amount = Number(form.amount)
    if (validItems.length) {
      const bad = form.items.find(
        (i) => i.item_name.trim() && (!Number.isFinite(Number(i.amount)) || Number(i.amount) <= 0),
      )
      if (bad) return `Enter a valid amount for item “${bad.item_name.trim()}”`
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return validItems.length
        ? 'Total amount must be greater than 0'
        : 'Enter a total amount, or add at least one item with amount'
    }
    if (!form.entry_date) return 'Date is required'
    return null
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) {
      setError('Not signed in — please log in again, then save.')
      return
    }
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
      const items = collectValidItems(form.items)
      // Ensure free-text / selected names are in master for consistency
      for (const item of items) {
        if (item.item_name.toLowerCase() === 'other') continue
        try {
          await addCashBookItemMaster(item.item_name)
        } catch {
          /* ignore master upsert race; entry still saves */
        }
      }

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
            amount,
            edited_by: enteredBy,
            items,
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
          amount,
          entered_by: enteredBy,
          items,
        })
        setMessage('Entry saved')
      }
      resetForm()
      setTab('list')
      await load()
    } catch (err) {
      setError(formatCashBookError(err, 'Save failed — check fields and try again'))
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
    if (!profile) {
      setError('Not signed in — please log in again.')
      return
    }
    const needsApproval = !isCeo && !isWithinEditWindow(row.created_at)
    const label = row.party_name.trim() || entryItemsLabel(row)
    const ok = window.confirm(
      needsApproval
        ? `Record is older than 7 days. Send delete request to CEO for ${label}?`
        : `Delete entry for ${label}?`,
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
      setError(formatCashBookError(err, 'Delete failed'))
    } finally {
      setBusy(false)
    }
  }

  function updateItem(key: string, patch: Partial<FormItemRow>) {
    setForm((f) => ({
      ...f,
      amountManual: false,
      items: f.items.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }))
  }

  return (
    <div className="screen cashbook-screen">
      <header className="screen-header">
        <h1>Cash Book</h1>
        <p className="text-muted">Credit / debit cash entries with itemized lines and ledger book</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: editEntry ? 'Edit Entry' : 'New Entry' },
            { id: 'list', label: 'Entries' },
            { id: 'ledger', label: 'Party Ledger' },
            { id: 'book', label: 'Ledger Book' },
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
            <span>Party name (optional)</span>
            <input
              value={form.party_name}
              onChange={(e) => setForm((f) => ({ ...f, party_name: e.target.value }))}
              placeholder="Person / party — optional"
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

          <div className="field cashbook-items-field">
            <span>Items</span>
            <div className="cashbook-items-list">
              {form.items.map((row) => (
                <div key={row.key} className="cashbook-item-row">
                  <ItemNameField
                    value={row.item_name}
                    freeText={row.freeText}
                    master={master}
                    disabled={busy}
                    onError={setError}
                    onMasterAdded={(m) =>
                      setMaster((prev) =>
                        prev.some((x) => x.id === m.id)
                          ? prev
                          : [...prev, m].sort((a, b) => a.item_name.localeCompare(b.item_name)),
                      )
                    }
                    onChange={({ item_name, freeText }) =>
                      updateItem(row.key, { item_name, freeText })
                    }
                  />
                  <input
                    className="num cashbook-item-amt"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Amt"
                    aria-label="Item amount"
                    value={row.amount}
                    onChange={(e) => updateItem(row.key, { amount: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={form.items.length <= 1 || busy}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        amountManual: false,
                        items: f.items.filter((i) => i.key !== row.key),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  items: [...f.items, newItemRow()],
                }))
              }
            >
              + Add Item
            </button>
          </div>

          <label className="field">
            <span>
              Total Amount
              {itemsTotal > 0 && !form.amountManual ? (
                <span className="text-muted2"> · auto from items</span>
              ) : null}
            </span>
            <input
              className="num"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  amount: e.target.value,
                  amountManual: true,
                }))
              }
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
                  {(row.party_name || 'General').trim()} · {row.category}
                  {row.machine_number ? ` · ${row.machine_number}` : ''}
                </div>
                <div className="text-muted2">{entryItemsLabel(row)}</div>
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
                    {e.entry_date} · {e.entry_type} ₹{formatMoney(Number(e.amount))} ·{' '}
                    {entryItemsLabel(e)}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {!ledgers.length ? <p className="text-muted">No ledger parties yet</p> : null}
        </div>
      ) : null}

      {tab === 'book' ? (
        <div className="cashbook-ledger-book">
          <div className="cashbook-book-summary surface">
            <span>
              Total Credit <strong className="text-sage">₹{formatMoney(book.total_credit)}</strong>
            </span>
            <span>
              Total Debit <strong className="text-danger">₹{formatMoney(book.total_debit)}</strong>
            </span>
            <span>
              Balance{' '}
              <strong className={book.running_balance >= 0 ? 'text-sage' : 'text-danger'}>
                ₹{formatMoney(book.running_balance)}
              </strong>
            </span>
          </div>

          {!book.days.length ? <p className="text-muted">No entries in ledger book yet</p> : null}

          {book.days.map((day) => (
            <section key={day.entry_date} className="cashbook-book-day surface">
              <header className="cashbook-book-day-head">
                <strong>{day.entry_date}</strong>
                <span className="text-muted2">
                  Cr ₹{formatMoney(day.credit_total)} · Dr ₹{formatMoney(day.debit_total)}
                </span>
              </header>
              <div className="cashbook-book-cols">
                <div className="cashbook-book-col credit">
                  <h4>Credit</h4>
                  {day.credits.length ? (
                    day.credits.map((e) => (
                      <article key={e.id} className="cashbook-book-line">
                        <div className="cashbook-book-line-main">
                          <strong>{(e.party_name || 'General').trim()}</strong>
                          <span className="num text-sage">₹{formatMoney(Number(e.amount))}</span>
                        </div>
                        <div className="text-muted2">{entryItemsLabel(e)}</div>
                      </article>
                    ))
                  ) : (
                    <p className="text-muted2">—</p>
                  )}
                </div>
                <div className="cashbook-book-col debit">
                  <h4>Debit</h4>
                  {day.debits.length ? (
                    day.debits.map((e) => (
                      <article key={e.id} className="cashbook-book-line">
                        <div className="cashbook-book-line-main">
                          <strong>{(e.party_name || 'General').trim()}</strong>
                          <span className="num text-danger">₹{formatMoney(Number(e.amount))}</span>
                        </div>
                        <div className="text-muted2">{entryItemsLabel(e)}</div>
                      </article>
                    ))
                  ) : (
                    <p className="text-muted2">—</p>
                  )}
                </div>
              </div>
            </section>
          ))}

          <footer className="cashbook-book-footer surface">
            <span>Running balance (Credit − Debit)</span>
            <strong className={book.running_balance >= 0 ? 'text-sage' : 'text-danger'}>
              ₹{formatMoney(book.running_balance)}
            </strong>
          </footer>
        </div>
      ) : null}
    </div>
  )
}
