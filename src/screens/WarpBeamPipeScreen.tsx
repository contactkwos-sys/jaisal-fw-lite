import { useCallback, useEffect, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { WarpBeamPipe } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { applyEditDeleteOrQueue, isWithinEditWindow } from '../lib/pendingApprovals'
import { supabase } from '../lib/supabase'

type TabId = 'out' | 'in' | 'list'

export function WarpBeamPipeScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('out')
  const [rows, setRows] = useState<WarpBeamPipe[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [entryDate, setEntryDate] = useState(todayISO())
  const [jobber, setJobber] = useState('')
  const [gp, setGp] = useState('')
  const [beam, setBeam] = useState('')
  const [ends, setEnds] = useState('')
  const [denier, setDenier] = useState('')
  const [weight, setWeight] = useState('')
  const [pipeOut, setPipeOut] = useState('')
  const [pipeIn, setPipeIn] = useState('')
  const [rate, setRate] = useState('')
  const [remarks, setRemarks] = useState('')
  const [inTargetId, setInTargetId] = useState('')

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('warp_beam_pipe')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) throw err
    setRows((data as WarpBeamPipe[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const pending = rows.filter((r) => r.status === 'out')

  async function saveOut(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        entry_date: entryDate,
        jobber_name: jobber.trim(),
        gp_number: gp.trim() || null,
        beam_number: beam.trim() || null,
        total_ends: Number(ends) || null,
        yarn_count_denier: denier.trim() || null,
        weight_kg: Number(weight) || null,
        pipe_out_qty: Number(pipeOut) || 0,
        pipe_in_qty: 0,
        rate: Number(rate) || null,
        remarks: remarks.trim() || null,
        status: 'out',
        entered_by: enteredBy,
      }
      const { error: iErr } = await supabase.from('warp_beam_pipe').insert(payload)
      if (iErr) throw iErr
      setMessage('Pipe OUT saved')
      setJobber('')
      setGp('')
      setBeam('')
      setEnds('')
      setDenier('')
      setWeight('')
      setPipeOut('')
      setRate('')
      setRemarks('')
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveIn(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !inTargetId) return
    const target = rows.find((r) => r.id === inTargetId)
    if (!target) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const newData = {
        pipe_in_qty: Number(pipeIn) || 0,
        status: 'returned' as const,
        remarks: remarks.trim() || target.remarks,
      }
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: target.created_at,
        tableName: 'warp_beam_pipe',
        recordId: target.id,
        action: 'edit',
        requestedBy: enteredBy,
        newData,
        apply: async () => {
          const { error: uErr } = await supabase.from('warp_beam_pipe').update(newData).eq('id', target.id)
          if (uErr) throw uErr
        },
      })
      setMessage(result === 'applied' ? 'Pipe IN saved' : 'Return queued for CEO approval')
      setPipeIn('')
      setInTargetId('')
      setRemarks('')
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(row: WarpBeamPipe) {
    if (!profile) return
    if (!window.confirm(`Delete beam pipe entry for ${row.jobber_name}?`)) return
    setBusy(true)
    setError(null)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at,
        tableName: 'warp_beam_pipe',
        recordId: row.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('warp_beam_pipe').delete().eq('id', row.id)
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
        <h1>Warp Beam Pipe (Legacy)</h1>
        <p className="text-muted">
          Legacy jobber OUT / IN tracker. Prefer{' '}
          <strong>Inventory → Warp Yarn Management</strong> for full pipe lifecycle (warper send/receive,
          machines, godown).
        </p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'out', label: 'Out Entry' },
            { id: 'in', label: 'In Entry' },
            { id: 'list', label: `List (${pending.length} pending)` },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'out' ? (
        <form className="form-stack" onSubmit={(e) => void saveOut(e)}>
          <label className="field">
            <span>Date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Jobber name</span>
            <input value={jobber} onChange={(e) => setJobber(e.target.value)} required />
          </label>
          <label className="field">
            <span>GP number</span>
            <input value={gp} onChange={(e) => setGp(e.target.value)} />
          </label>
          <label className="field">
            <span>Beam number</span>
            <input value={beam} onChange={(e) => setBeam(e.target.value)} />
          </label>
          <label className="field">
            <span>Total ends</span>
            <input className="num" type="number" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </label>
          <label className="field">
            <span>Yarn count / denier</span>
            <input value={denier} onChange={(e) => setDenier(e.target.value)} />
          </label>
          <label className="field">
            <span>Weight (kg)</span>
            <input className="num" type="number" step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </label>
          <label className="field">
            <span>Pipe out qty</span>
            <input className="num" type="number" value={pipeOut} onChange={(e) => setPipeOut(e.target.value)} required />
          </label>
          <label className="field">
            <span>Rate</span>
            <input className="num" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="field">
            <span>Remarks</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save Out'}
          </button>
        </form>
      ) : null}

      {tab === 'in' ? (
        <form className="form-stack" onSubmit={(e) => void saveIn(e)}>
          <label className="field">
            <span>Pending OUT entry</span>
            <select value={inTargetId} onChange={(e) => setInTargetId(e.target.value)} required>
              <option value="">Select pending return</option>
              {pending.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.entry_date} · {r.jobber_name} · Beam {r.beam_number || '—'} · Out {r.pipe_out_qty}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Pipe in qty</span>
            <input className="num" type="number" value={pipeIn} onChange={(e) => setPipeIn(e.target.value)} required />
          </label>
          <label className="field">
            <span>Remarks</span>
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} />
          </label>
          <button type="submit" disabled={busy || !inTargetId}>
            {busy ? 'Saving…' : 'Save In / Return'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="list">
          {rows.map((row) => (
            <article
              key={row.id}
              className={`card-row surface row-top ${row.status === 'out' ? 'alert-row' : ''}`}
            >
              <div>
                <strong>
                  {row.jobber_name} · {row.status === 'out' ? 'PENDING RETURN' : 'Returned'}
                </strong>
                <div className="text-muted">
                  {row.entry_date} · Beam {row.beam_number || '—'} · GP {row.gp_number || '—'}
                </div>
                <div className="text-muted2">
                  Out {row.pipe_out_qty} · In {row.pipe_in_qty} · Ends {row.total_ends ?? '—'} ·{' '}
                  {row.yarn_count_denier || '—'} · {row.weight_kg ?? '—'} kg
                  {!isWithinEditWindow(row.created_at) ? ' · edit needs approval' : ''}
                </div>
              </div>
              <div className="icon-actions">
                {row.status === 'out' ? (
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    onClick={() => {
                      setInTargetId(row.id)
                      setTab('in')
                    }}
                  >
                    In
                  </button>
                ) : null}
                <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void handleDelete(row)}>
                  Del
                </button>
              </div>
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No pipe entries yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
