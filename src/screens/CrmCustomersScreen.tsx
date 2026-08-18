import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CrmCustomer } from '../lib/database.types'
import {
  deleteCrmCustomer,
  fetchCrmCustomers,
  insertCrmCustomer,
  syncCrmFromKmos,
  updateCrmCustomer,
} from '../lib/crmCustomers'

type FormState = {
  name: string
  whatsapp_number: string
  notes: string
}

const emptyForm: FormState = { name: '', whatsapp_number: '', notes: '' }

export function CrmCustomersScreen() {
  const [rows, setRows] = useState<CrmCustomer[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const load = useCallback(async () => {
    const data = await fetchCrmCustomers()
    setRows(data)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.whatsapp_number.toLowerCase().includes(q) ||
        r.whatsapp_number.replace(/\D/g, '').includes(q.replace(/\D/g, '')),
    )
  }, [rows, query])

  function openAdd() {
    setEditId(null)
    setForm(emptyForm)
    setFormOpen(true)
    setError(null)
    setMessage(null)
  }

  function openEdit(row: CrmCustomer) {
    setEditId(row.id)
    setForm({
      name: row.name,
      whatsapp_number: row.whatsapp_number,
      notes: row.notes || '',
    })
    setFormOpen(true)
    setError(null)
    setMessage(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (editId) {
        await updateCrmCustomer(editId, form)
        setMessage('Customer updated')
      } else {
        await insertCrmCustomer(form)
        setMessage('Customer added')
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(row: CrmCustomer) {
    if (!confirm(`Delete ${row.name}?`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await deleteCrmCustomer(row.id)
      setMessage(`Deleted ${row.name}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await syncCrmFromKmos()
      const cols =
        result.columns_seen && result.columns_seen.length
          ? ` Columns: ${result.columns_seen.join(', ')}.`
          : ''
      setMessage(
        `KMOS sync: +${result.inserted} new, ${result.updated} updated, ` +
          `${result.skipped_no_phone} skipped (no phone), ` +
          `${result.skipped_manual_conflict} kept manual ` +
          `(of ${result.total_kmos} KMOS rows). ` +
          `Mapped name=${result.mapped_name_field || '—'} phone=${result.mapped_phone_field || '—'}.${cols}`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen crm-screen">
      <header className="screen-header crm-header">
        <div>
          <h1>CRM</h1>
          <p className="text-muted">Customer master for Design Catalog WhatsApp sharing</p>
        </div>
        <div className="crm-header-actions">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void handleSync()}>
            {busy ? 'Working…' : 'Sync from KMOS'}
          </button>
          <button type="button" className="primary-save" disabled={busy} onClick={openAdd}>
            + Add Customer
          </button>
        </div>
      </header>

      <div className="crm-toolbar">
        <label className="field crm-search">
          <span className="text-muted">Search</span>
          <input
            type="search"
            placeholder="Name or WhatsApp number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <p className="text-muted2 crm-count">
          {filtered.length} of {rows.length}
        </p>
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      {filtered.length === 0 ? (
        <p className="text-muted">
          {rows.length === 0
            ? 'No customers yet — add one or Sync from KMOS.'
            : 'No customers match this search.'}
        </p>
      ) : (
        <div className="crm-table-wrap surface">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>WhatsApp</th>
                <th>Source</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="crm-mono">{row.whatsapp_number}</td>
                  <td>
                    <span className={row.source === 'kmos_sync' ? 'crm-tag crm-tag-kmos' : 'crm-tag'}>
                      {row.source === 'kmos_sync' ? 'KMOS' : 'Manual'}
                    </span>
                  </td>
                  <td className="text-muted2">{row.notes || '—'}</td>
                  <td className="crm-row-actions">
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => openEdit(row)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost crm-del"
                      disabled={busy}
                      onClick={() => void handleDelete(row)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen ? (
        <div className="crm-modal" role="dialog" aria-modal="true" aria-labelledby="crm-form-title">
          <div className="crm-modal-backdrop" onClick={() => !busy && setFormOpen(false)} />
          <div className="crm-modal-panel surface">
            <h2 id="crm-form-title">{editId ? 'Edit Customer' : 'Add Customer'}</h2>
            <form className="form-stack crm-form" onSubmit={(e) => void handleSave(e)}>
              <label className="field">
                <span className="text-muted">Name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span className="text-muted">WhatsApp number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="+919876543210"
                  value={form.whatsapp_number}
                  onChange={(e) => setForm((f) => ({ ...f, whatsapp_number: e.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span className="text-muted">Notes (optional)</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <div className="crm-modal-actions">
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => setFormOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-save" disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
