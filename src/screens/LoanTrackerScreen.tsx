import { useCallback, useEffect, useMemo, useState } from 'react'
import { RecordActions } from '../components/RecordActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { LOAN_PARTY_DEFAULTS, type LoanEntry } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
import { confirmDeleteRecord } from '../lib/recordCrud'
import { supabase } from '../lib/supabase'

type TabId = 'entry' | 'ledger'

export function LoanTrackerScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<LoanEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [partyPreset, setPartyPreset] = useState<string>(LOAN_PARTY_DEFAULTS[0])
  const [partyOther, setPartyOther] = useState('')
  const [direction, setDirection] = useState<'given' | 'received'>('given')
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [editId, setEditId] = useState<string | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('loan_entries')
      .select('*')
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (err) throw err
    setRows((data as LoanEntry[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const partyName = partyPreset === 'Other' ? partyOther.trim() : partyPreset

  const ledgers = useMemo(() => {
    const map = new Map<string, { party: string; given: number; received: number; balance: number; entries: LoanEntry[] }>()
    for (const row of rows) {
      const key = row.party_name.trim() || 'Unknown'
      let led = map.get(key.toLowerCase())
      if (!led) {
        led = { party: key, given: 0, received: 0, balance: 0, entries: [] }
        map.set(key.toLowerCase(), led)
      }
      const amt = Number(row.amount) || 0
      if (row.direction === 'given') {
        led.given += amt
        led.balance += amt
      } else {
        led.received += amt
        led.balance -= amt
      }
      led.entries.push(row)
    }
    return [...map.values()].sort((a, b) => a.party.localeCompare(b.party))
  }, [rows])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || viewOnly) return
    if (!partyName) {
      setError('Party name is required')
      return
    }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        party_name: partyName,
        direction,
        amount: amt,
        purpose: purpose.trim() || null,
        entry_date: entryDate,
        entered_by: enteredBy,
      }
      if (editId) {
        const row = rows.find((r) => r.id === editId)
        const result = await applyEditDeleteOrQueue({
          isCeo,
          createdAt: row?.created_at || new Date().toISOString(),
          tableName: 'loan_entries',
          recordId: editId,
          action: 'edit',
          requestedBy: enteredBy,
          newData: payload,
          apply: async () => {
            const { error: uErr } = await supabase.from('loan_entries').update(payload).eq('id', editId)
            if (uErr) throw uErr
          },
        })
        setMessage(result === 'applied' ? 'Loan entry updated' : 'Edit queued for CEO approval')
      } else {
        const { error: iErr } = await supabase.from('loan_entries').insert(payload)
        if (iErr) throw iErr
        setMessage('Loan entry saved')
      }
      setEditId(null)
      setViewOnly(false)
      setAmount('')
      setPurpose('')
      setTab('ledger')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function openView(row: LoanEntry) {
    setEditId(row.id)
    setViewOnly(true)
    setPartyPreset(
      (LOAN_PARTY_DEFAULTS as readonly string[]).includes(row.party_name) ? row.party_name : 'Other',
    )
    setPartyOther((LOAN_PARTY_DEFAULTS as readonly string[]).includes(row.party_name) ? '' : row.party_name)
    setDirection(row.direction as 'given' | 'received')
    setAmount(String(row.amount))
    setPurpose(row.purpose || '')
    setEntryDate(row.entry_date)
    setTab('entry')
  }

  function openEdit(row: LoanEntry) {
    setEditId(row.id)
    setViewOnly(false)
    setPartyPreset(
      (LOAN_PARTY_DEFAULTS as readonly string[]).includes(row.party_name) ? row.party_name : 'Other',
    )
    setPartyOther((LOAN_PARTY_DEFAULTS as readonly string[]).includes(row.party_name) ? '' : row.party_name)
    setDirection(row.direction as 'given' | 'received')
    setAmount(String(row.amount))
    setPurpose(row.purpose || '')
    setEntryDate(row.entry_date)
    setTab('entry')
  }

  function resetEntryForm() {
    setEditId(null)
    setViewOnly(false)
    setAmount('')
    setPurpose('')
    setPartyPreset(LOAN_PARTY_DEFAULTS[0])
    setPartyOther('')
    setDirection('given')
    setEntryDate(todayISO())
  }

  async function handleDelete(row: LoanEntry) {
    if (!profile) return
    if (!confirmDeleteRecord({ label: row.party_name })) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at,
        tableName: 'loan_entries',
        recordId: row.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('loan_entries').delete().eq('id', row.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Deleted' : 'Delete queued for CEO approval')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Loan Tracker</h1>
        <p className="text-muted">Party-wise given / received loan ledger</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: 'New Entry' },
            { id: 'ledger', label: 'Party Ledger' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
          {editId ? (
            <p className="text-muted2">
              {viewOnly ? 'Viewing entry' : 'Editing entry'} ·{' '}
              <button type="button" className="btn-ghost" onClick={resetEntryForm}>
                {viewOnly ? 'Close' : 'Cancel edit'}
              </button>
            </p>
          ) : null}
          <label className="field">
            <span>Party</span>
            <select value={partyPreset} disabled={viewOnly} onChange={(e) => setPartyPreset(e.target.value)}>
              {LOAN_PARTY_DEFAULTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {partyPreset === 'Other' ? (
            <label className="field">
              <span>Other party name</span>
              <input value={partyOther} readOnly={viewOnly} onChange={(e) => setPartyOther(e.target.value)} required />
            </label>
          ) : null}
          <div className="field">
            <span>Direction</span>
            <div className="cashbook-type-toggle" role="group">
              <button
                type="button"
                className={direction === 'given' ? 'cashbook-type-btn debit active' : 'cashbook-type-btn debit'}
                disabled={viewOnly}
                onClick={() => setDirection('given')}
              >
                Given
              </button>
              <button
                type="button"
                className={direction === 'received' ? 'cashbook-type-btn credit active' : 'cashbook-type-btn credit'}
                disabled={viewOnly}
                onClick={() => setDirection('received')}
              >
                Received
              </button>
            </div>
          </div>
          <label className="field">
            <span>Amount</span>
            <input className="num" type="number" min="0.01" step="0.01" value={amount} readOnly={viewOnly} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Purpose</span>
            <input value={purpose} readOnly={viewOnly} onChange={(e) => setPurpose(e.target.value)} />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={entryDate} readOnly={viewOnly} onChange={(e) => setEntryDate(e.target.value)} required />
          </label>
          {!viewOnly ? (
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editId ? 'Update' : 'Save'}
            </button>
          ) : null}
        </form>
      ) : null}

      {tab === 'ledger' ? (
        <div className="list">
          {ledgers.map((led) => (
            <article key={led.party} className="surface dash-panel">
              <h3>{led.party}</h3>
              <p className="text-muted">
                Given ₹{led.given.toFixed(2)} · Received ₹{led.received.toFixed(2)} ·{' '}
                <strong>Balance ₹{led.balance.toFixed(2)}</strong>
              </p>
              <ul>
                {led.entries.map((e) => (
                  <li key={e.id} className="card-row row-top">
                    <span>
                      {e.entry_date} · {e.direction} ₹{Number(e.amount).toFixed(2)} · {e.purpose || '—'}
                    </span>
                    <RecordActions
                      busy={busy}
                      onView={() => openView(e)}
                      onEdit={() => openEdit(e)}
                      onDelete={() => void handleDelete(e)}
                    />
                  </li>
                ))}
              </ul>
            </article>
          ))}
          {!ledgers.length ? <p className="text-muted">No loan entries yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
