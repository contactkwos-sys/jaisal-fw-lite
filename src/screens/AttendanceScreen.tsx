import { useCallback, useEffect, useState } from 'react'
import { computeAttendanceStatus } from '../lib/attendanceStatus'
import type { Attendance, Worker } from '../lib/database.types'
import { supabase } from '../lib/supabase'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

type RowState = {
  worker: Worker
  attendanceId: string | null
  in_time: string
  break_out: string
  break_in: string
  out_time: string
  status: string
}

function emptyTimes(): Pick<RowState, 'in_time' | 'break_out' | 'break_in' | 'out_time' | 'status'> {
  return { in_time: '', break_out: '', break_in: '', out_time: '', status: 'Absent' }
}

const DEPT_SUGGESTIONS = [
  'Weaving',
  'Folding',
  'Security',
  'Security Guard',
  'ASO',
  'Assistant Security Officer',
  'Sweeper',
  'sweeper 1',
  'sweeper 2',
  'Maintenance',
  'Office',
  'Other',
]

export function AttendanceScreen() {
  const [date, setDate] = useState(todayISO)
  const [rows, setRows] = useState<RowState[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState('')

  const load = useCallback(async () => {
    setError(null)
    const { data: workers, error: wErr } = await supabase
      .from('workers')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    if (wErr) throw wErr

    const { data: attendance, error: aErr } = await supabase
      .from('attendance')
      .select('*')
      .eq('date', date)
    if (aErr) throw aErr

    const byWorker = new Map((attendance as Attendance[]).map((a) => [a.worker_id, a]))
    setRows(
      ((workers as Worker[]) ?? []).map((worker) => {
        const a = byWorker.get(worker.id)
        if (!a) {
          return { worker, attendanceId: null, ...emptyTimes() }
        }
        const times = {
          in_time: a.in_time?.slice(0, 5) ?? '',
          break_out: a.break_out?.slice(0, 5) ?? '',
          break_in: a.break_in?.slice(0, 5) ?? '',
          out_time: a.out_time?.slice(0, 5) ?? '',
        }
        return {
          worker,
          attendanceId: a.id,
          ...times,
          status: a.status ?? computeAttendanceStatus({
            in_time: times.in_time || null,
            break_out: times.break_out || null,
            break_in: times.break_in || null,
            out_time: times.out_time || null,
          }),
        }
      }),
    )
  }, [date])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  function updateRow(workerId: string, field: keyof RowState, value: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.worker.id !== workerId) return row
        const next = { ...row, [field]: value }
        next.status = computeAttendanceStatus({
          in_time: next.in_time || null,
          break_out: next.break_out || null,
          break_in: next.break_in || null,
          out_time: next.out_time || null,
        })
        return next
      }),
    )
  }

  async function handleAddWorker(e: { preventDefault: () => void }) {
    e.preventDefault()
    const full_name = newName.trim()
    if (!full_name) {
      setError('Full name required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { data, error: iErr } = await supabase
        .from('workers')
        .insert({
          full_name,
          department: newDept.trim() || null,
          is_active: true,
        })
        .select('*')
        .single()
      if (iErr) throw iErr
      const worker = data as Worker
      setRows((prev) => [...prev, { worker, attendanceId: null, ...emptyTimes() }])
      setNewName('')
      setNewDept('')
      setShowAdd(false)
      setMessage(`${worker.full_name} added — fill attendance below`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add worker failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      for (const row of rows) {
        const payload = {
          worker_id: row.worker.id,
          date,
          in_time: row.in_time || null,
          break_out: row.break_out || null,
          break_in: row.break_in || null,
          out_time: row.out_time || null,
          status: row.status,
        }
        if (row.attendanceId) {
          const { error: uErr } = await supabase
            .from('attendance')
            .update(payload)
            .eq('id', row.attendanceId)
          if (uErr) throw uErr
        } else {
          const { error: iErr } = await supabase.from('attendance').insert(payload)
          if (iErr) throw iErr
        }
      }
      setMessage('Attendance saved')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Attendance</h1>
        <label className="field">
          <span className="text-muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowAdd((v) => !v)}
        >
          {showAdd ? 'Cancel' : '+ Add Worker'}
        </button>
      </header>

      {showAdd ? (
        <form className="form-stack surface card-row" onSubmit={(e) => void handleAddWorker(e)}>
          <label className="field">
            <span className="text-muted">Full Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              placeholder="Worker name"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="text-muted">Department</span>
            <input
              list="dept-list"
              value={newDept}
              onChange={(e) => setNewDept(e.target.value)}
              placeholder="e.g. Weaving"
            />
            <datalist id="dept-list">
              {DEPT_SUGGESTIONS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <button type="submit" className="primary-save" disabled={busy || !newName.trim()}>
            Save Worker
          </button>
        </form>
      ) : null}

      <div className="list">
        {rows.map((row) => (
          <article key={row.worker.id} className="card-row surface">
            <div className="row-top">
              <div>
                <strong>{row.worker.full_name}</strong>
                <div className="text-muted2">{row.worker.department ?? '—'}</div>
              </div>
              <span className={`status-chip status-${row.status.replace(/\s+/g, '-').toLowerCase()}`}>
                {row.status}
              </span>
            </div>
            <div className="time-grid">
              {(
                [
                  ['in_time', 'In Time'],
                  ['break_out', 'Break Out'],
                  ['break_in', 'Break In'],
                  ['out_time', 'Out Time'],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="field">
                  <span className="text-muted2">{label}</span>
                  <input
                    type="time"
                    value={row[field]}
                    onChange={(e) => updateRow(row.worker.id, field, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </article>
        ))}
        {!rows.length ? <p className="text-muted">No active workers.</p> : null}
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      <button type="button" className="primary-save" disabled={busy} onClick={() => void handleSave()}>
        Save
      </button>
    </div>
  )
}
