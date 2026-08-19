import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { LOAN_PARTY_DEFAULTS, type LoanEntry } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
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
    if (!profile) return
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
      const { error: iErr } = await supabase.from('loan_entries').insert({
        party_name: partyName,
        direction,
        amount: amt,
        purpose: purpose.trim() || null,
        entry_date: entryDate,
        entered_by: enteredBy,
      })
      if (iErr) throw iErr
      setMessage('Loan entry saved')
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

  async function handleDelete(row: LoanEntry) {
    if (!profile) return
    if (!window.confirm(`Delete loan entry for ${row.party_name}?`)) return
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
          <label className="field">
            <span>Party</span>
            <select value={partyPreset} onChange={(e) => setPartyPreset(e.target.value)}>
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
              <input value={partyOther} onChange={(e) => setPartyOther(e.target.value)} required />
            </label>
          ) : null}
          <div className="field">
            <span>Direction</span>
            <div className="cashbook-type-toggle" role="group">
              <button
                type="button"
                className={direction === 'given' ? 'cashbook-type-btn debit active' : 'cashbook-type-btn debit'}
                onClick={() => setDirection('given')}
              >
                Given
              </button>
              <button
                type="button"
                className={direction === 'received' ? 'cashbook-type-btn credit active' : 'cashbook-type-btn credit'}
                onClick={() => setDirection('received')}
              >
                Received
              </button>
            </div>
          </div>
          <label className="field">
            <span>Amount</span>
            <input className="num" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Purpose</span>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
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
                    <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void handleDelete(e)}>
                      Del
                    </button>
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
