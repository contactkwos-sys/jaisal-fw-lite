import { useCallback, useEffect, useState } from 'react'
import { DtoStatusPill } from '../components/ImageLightbox'
import { useAuth } from '../lib/auth'
import {
  createFollowup,
  fetchDins,
  fetchFollowups,
  resolveFollowup,
  type DinFollowup,
  type DinWithMatchings,
} from '../lib/designToOrder'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

export function DtoFollowupScreen() {
  const { session } = useAuth()
  const [rows, setRows] = useState<DinFollowup[]>([])
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [parties, setParties] = useState<string[]>([])
  const [dinId, setDinId] = useState('')
  const [party, setParty] = useState('')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [f, d, p] = await Promise.all([
      fetchFollowups(),
      fetchDins(200),
      supabase.from('party_master').select('party_name').order('party_name').limit(400),
    ])
    setRows(f)
    setDins(d)
    setParties((p.data ?? []).map((x) => String(x.party_name)).filter(Boolean))
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const din = dins.find((x) => x.id === dinId)
      await createFollowup({
        din_id: dinId || null,
        din_number: din?.din_number,
        party_name: party || din?.party_name || undefined,
        followup_date: date,
        reminder_note: note,
        created_by: session?.user?.id || null,
      })
      setMessage('Reminder saved')
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function markDone(id: string) {
    setBusy(true)
    try {
      await resolveFollowup(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const open = rows.filter((r) => r.status === 'open')
  const done = rows.filter((r) => r.status !== 'open')

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>Follow-up / Reminders</h1>
          <p className="text-muted">Track party follow-ups after sample promotion or pending orders.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form className="surface dto-panel" onSubmit={(e) => void save(e)}>
        <div className="dto-form-grid">
          <label className="field">
            <span>DIN</span>
            <select value={dinId} onChange={(e) => setDinId(e.target.value)}>
              <option value="">Optional…</option>
              {dins.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.din_number} · {d.design_name || '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Party</span>
            <input list="dto-fu-parties" value={party} onChange={(e) => setParty(e.target.value)} />
            <datalist id="dto-fu-parties">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Follow-up Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field dto-span-2">
            <span>Reminder note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call / visit / quote…" />
          </label>
        </div>
        <div className="dto-form-actions">
          <button type="submit" className="primary-save" disabled={busy}>
            Add Reminder
          </button>
        </div>
      </form>

      <section className="surface dto-panel">
        <h2 className="section-title">Open ({open.length})</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>DIN</th>
                <th>Party</th>
                <th>Note</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {open.map((r) => (
                <tr key={r.id}>
                  <td>{r.followup_date}</td>
                  <td>{r.din_number || '—'}</td>
                  <td>{r.party_name || '—'}</td>
                  <td>{r.reminder_note || '—'}</td>
                  <td>
                    <DtoStatusPill status={r.status} />
                  </td>
                  <td>
                    <button type="button" className="link-btn" disabled={busy} onClick={() => void markDone(r.id)}>
                      Done
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {done.length ? (
        <section className="surface dto-panel">
          <h2 className="section-title">Completed</h2>
          <ul className="dto-timeline">
            {done.slice(0, 20).map((r) => (
              <li key={r.id}>
                {r.followup_date} · {r.din_number || '—'} · {r.party_name || '—'} · {r.reminder_note || '—'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
