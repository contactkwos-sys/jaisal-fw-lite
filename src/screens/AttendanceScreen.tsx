/**
 * Enhanced Attendance — date + shift, hours, status, remarks.
 * Reuses computeAttendanceStatus / hrPayroll helpers. Saves to existing attendance table.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { computeAttendanceStatus } from '../lib/attendanceStatus'
import type { Attendance, Worker } from '../lib/database.types'
import {
  ATTENDANCE_STATUSES,
  computeTotalHours,
  payableDayFromAttendance,
  resolveAttendanceStatus,
  SHIFTS,
  statusBadgeClass,
  todayISO,
} from '../lib/hrPayroll'
import { supabase } from '../lib/supabase'

type RowState = {
  worker: Worker
  attendanceId: string | null
  in_time: string
  break_out: string
  break_in: string
  out_time: string
  status: string
  shift: string
  remarks: string
  total_hours: number
  payable_day: number
  dirty: boolean
}

function emptyTimes(shift: string): Omit<RowState, 'worker' | 'attendanceId' | 'dirty'> {
  return {
    in_time: '',
    break_out: '',
    break_in: '',
    out_time: '',
    status: 'Absent',
    shift,
    remarks: '',
    total_hours: 0,
    payable_day: 0,
  }
}

function rebuildDerived(row: RowState, manualStatus?: string): RowState {
  const times = {
    in_time: row.in_time || null,
    break_out: row.break_out || null,
    break_in: row.break_in || null,
    out_time: row.out_time || null,
  }
  const status = resolveAttendanceStatus(times, manualStatus ?? row.status)
  const total_hours = computeTotalHours(times)
  const payable_day = payableDayFromAttendance(status, total_hours)
  return { ...row, status, total_hours, payable_day }
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
  'Quality',
  'Other',
]

export function AttendanceScreen() {
  const [date, setDate] = useState(todayISO)
  const [shiftFilter, setShiftFilter] = useState<string>('All')
  const [rows, setRows] = useState<RowState[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newDesig, setNewDesig] = useState('')
  const [autoSave, setAutoSave] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    const { data: workers, error: wErr } = await supabase
      .from('workers')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    if (wErr) throw wErr

    const { data: attendance, error: aErr } = await supabase.from('attendance').select('*').eq('date', date)
    if (aErr) throw aErr

    const byWorker = new Map((attendance as Attendance[]).map((a) => [a.worker_id, a]))
    setRows(
      ((workers as Worker[]) ?? []).map((worker) => {
        const a = byWorker.get(worker.id)
        const defaultShift = worker.shift || 'Day'
        if (!a) {
          return { worker, attendanceId: null, ...emptyTimes(defaultShift), dirty: false }
        }
        const times = {
          in_time: a.in_time?.slice(0, 5) ?? '',
          break_out: a.break_out?.slice(0, 5) ?? '',
          break_in: a.break_in?.slice(0, 5) ?? '',
          out_time: a.out_time?.slice(0, 5) ?? '',
        }
        const base: RowState = {
          worker,
          attendanceId: a.id,
          ...times,
          status: a.status ?? computeAttendanceStatus({
            in_time: times.in_time || null,
            break_out: times.break_out || null,
            break_in: times.break_in || null,
            out_time: times.out_time || null,
          }),
          shift: a.shift || defaultShift,
          remarks: a.remarks || '',
          total_hours: Number(a.total_hours) || 0,
          payable_day: Number(a.payable_day) || 0,
          dirty: false,
        }
        return rebuildDerived(base, a.status ?? undefined)
      }),
    )
  }, [date])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const visibleRows = useMemo(() => {
    if (shiftFilter === 'All') return rows
    return rows.filter((r) => (r.shift || 'Day') === shiftFilter)
  }, [rows, shiftFilter])

  async function persistRow(row: RowState): Promise<RowState> {
    const derived = rebuildDerived(row)
    const payload = {
      worker_id: derived.worker.id,
      date,
      in_time: derived.in_time || null,
      break_out: derived.break_out || null,
      break_in: derived.break_in || null,
      out_time: derived.out_time || null,
      status: derived.status,
      shift: derived.shift || null,
      remarks: derived.remarks || null,
      total_hours: derived.total_hours,
      payable_day: derived.payable_day,
      updated_at: new Date().toISOString(),
    }
    if (derived.attendanceId) {
      const { error: uErr } = await supabase.from('attendance').update(payload).eq('id', derived.attendanceId)
      if (uErr) {
        // Columns may be missing before migration — retry core fields
        if (/column|schema cache/i.test(uErr.message)) {
          const core = {
            worker_id: payload.worker_id,
            date: payload.date,
            in_time: payload.in_time,
            break_out: payload.break_out,
            break_in: payload.break_in,
            out_time: payload.out_time,
            status: payload.status,
          }
          const { error: u2 } = await supabase.from('attendance').update(core).eq('id', derived.attendanceId)
          if (u2) throw u2
        } else throw uErr
      }
      return { ...derived, dirty: false }
    }
    const { data, error: iErr } = await supabase.from('attendance').insert(payload).select('id').single()
    if (iErr) {
      if (/column|schema cache/i.test(iErr.message)) {
        const core = {
          worker_id: payload.worker_id,
          date: payload.date,
          in_time: payload.in_time,
          break_out: payload.break_out,
          break_in: payload.break_in,
          out_time: payload.out_time,
          status: payload.status,
        }
        const { data: d2, error: i2 } = await supabase.from('attendance').insert(core).select('id').single()
        if (i2) throw i2
        return { ...derived, attendanceId: (d2 as { id: string }).id, dirty: false }
      }
      throw iErr
    }
    return { ...derived, attendanceId: (data as { id: string }).id, dirty: false }
  }

  function updateRow(workerId: string, patch: Partial<RowState>, opts?: { persist?: boolean; manualStatus?: string }) {
    setRows((prev) => {
      const next = prev.map((row) => {
        if (row.worker.id !== workerId) return row
        const merged = rebuildDerived({ ...row, ...patch, dirty: true }, opts?.manualStatus ?? patch.status)
        if (opts?.persist && autoSave) {
          void persistRow(merged)
            .then((saved) => {
              setRows((p) => p.map((r) => (r.worker.id === workerId ? saved : r)))
              setMessage(`Saved · ${saved.worker.full_name}`)
            })
            .catch((e: Error) => setError(e.message))
        }
        return merged
      })
      return next
    })
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
      const insertPayload: Record<string, unknown> = {
        full_name,
        department: newDept.trim() || null,
        is_active: true,
        designation: newDesig.trim() || null,
        employee_code: newCode.trim() || null,
        shift: shiftFilter === 'All' ? 'Day' : shiftFilter,
      }
      const { data, error: iErr } = await supabase.from('workers').insert(insertPayload).select('*').single()
      if (iErr) {
        if (/column|schema cache/i.test(iErr.message)) {
          const { data: d2, error: i2 } = await supabase
            .from('workers')
            .insert({
              full_name,
              department: newDept.trim() || null,
              is_active: true,
            })
            .select('*')
            .single()
          if (i2) throw i2
          const worker = d2 as Worker
          setRows((prev) => [
            ...prev,
            { worker, attendanceId: null, ...emptyTimes(worker.shift || 'Day'), dirty: false },
          ])
        } else throw iErr
      } else {
        const worker = data as Worker
        setRows((prev) => [
          ...prev,
          { worker, attendanceId: null, ...emptyTimes(worker.shift || 'Day'), dirty: false },
        ])
      }
      setNewName('')
      setNewDept('')
      setNewCode('')
      setNewDesig('')
      setShowAdd(false)
      setMessage(`${full_name} added — fill attendance below`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add worker failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveAll() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const updated: RowState[] = []
      for (const row of visibleRows) {
        updated.push(await persistRow(row))
      }
      setRows((prev) =>
        prev.map((r) => {
          const u = updated.find((x) => x.worker.id === r.worker.id)
          return u || r
        }),
      )
      setMessage('Attendance saved')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen hr-screen">
      <header className="screen-header">
        <h1>Attendance</h1>
        <label className="field">
          <span className="text-muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Shift</span>
          <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
            <option value="All">All Shifts</option>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          <span className="text-muted2">Auto-save row</span>
        </label>
        <button type="button" className="btn-ghost" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : '+ Add Employee'}
        </button>
      </header>

      {showAdd ? (
        <form className="form-stack surface card-row" onSubmit={(e) => void handleAddWorker(e)}>
          <div className="hr-form-grid">
            <label className="field">
              <span className="text-muted">Employee Code</span>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="EMP001" />
            </label>
            <label className="field">
              <span className="text-muted">Full Name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Worker name" autoFocus />
            </label>
            <label className="field">
              <span className="text-muted">Designation</span>
              <input value={newDesig} onChange={(e) => setNewDesig(e.target.value)} placeholder="Operator" />
            </label>
            <label className="field">
              <span className="text-muted">Department</span>
              <input list="dept-list" value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="e.g. Weaving" />
              <datalist id="dept-list">
                {DEPT_SUGGESTIONS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
          </div>
          <button type="submit" className="primary-save" disabled={busy || !newName.trim()}>
            Save Employee
          </button>
        </form>
      ) : null}

      <div className="hr-table-wrap">
        <table className="hr-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Employee</th>
              <th>Designation</th>
              <th>Dept</th>
              <th>Shift</th>
              <th>In</th>
              <th>Break Out</th>
              <th>Break In</th>
              <th>Out</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Remarks / Breakdown</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.worker.id} className={row.dirty ? 'hr-row-dirty' : undefined}>
                <td className="num">{row.worker.employee_code || '—'}</td>
                <td>
                  <strong>{row.worker.full_name}</strong>
                </td>
                <td>{row.worker.designation || '—'}</td>
                <td>{row.worker.department || '—'}</td>
                <td>
                  <select
                    value={row.shift || 'Day'}
                    onChange={(e) => updateRow(row.worker.id, { shift: e.target.value }, { persist: true })}
                  >
                    {SHIFTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                {(
                  [
                    ['in_time', 'In'],
                    ['break_out', 'BO'],
                    ['break_in', 'BI'],
                    ['out_time', 'Out'],
                  ] as const
                ).map(([field]) => (
                  <td key={field}>
                    <input
                      type="time"
                      value={row[field]}
                      onChange={(e) => updateRow(row.worker.id, { [field]: e.target.value }, { persist: true })}
                    />
                  </td>
                ))}
                <td className="num">{row.total_hours.toFixed(2)}</td>
                <td>
                  <select
                    className={statusBadgeClass(row.status)}
                    value={row.status}
                    onChange={(e) =>
                      updateRow(row.worker.id, { status: e.target.value }, { persist: true, manualStatus: e.target.value })
                    }
                  >
                    {ATTENDANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={row.remarks}
                    placeholder="Breakdown / reason"
                    onChange={(e) => updateRow(row.worker.id, { remarks: e.target.value })}
                    onBlur={() => {
                      if (row.dirty) void persistRow(row).then((saved) => {
                        setRows((p) => p.map((r) => (r.worker.id === row.worker.id ? saved : r)))
                      })
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleRows.length ? <p className="text-muted">No employees for this shift.</p> : null}
      </div>

      {/* Mobile-friendly cards */}
      <div className="list hr-att-cards">
        {visibleRows.map((row) => (
          <article key={`m-${row.worker.id}`} className="card-row surface">
            <div className="row-top">
              <div>
                <strong>
                  {row.worker.employee_code ? `${row.worker.employee_code} · ` : ''}
                  {row.worker.full_name}
                </strong>
                <div className="text-muted2">
                  {row.worker.designation || '—'} · {row.worker.department || '—'} · {row.shift}
                </div>
              </div>
              <span className={statusBadgeClass(row.status)}>{row.status}</span>
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
                    onChange={(e) => updateRow(row.worker.id, { [field]: e.target.value }, { persist: true })}
                  />
                </label>
              ))}
            </div>
            <div className="text-muted2">
              Hours: <span className="num">{row.total_hours.toFixed(2)}</span> · Payable day:{' '}
              <span className="num">{row.payable_day}</span>
            </div>
            <label className="field">
              <span className="text-muted2">Remarks / Breakdown</span>
              <input
                value={row.remarks}
                onChange={(e) => updateRow(row.worker.id, { remarks: e.target.value })}
                onBlur={() => {
                  if (row.dirty)
                    void persistRow(row).then((saved) => {
                      setRows((p) => p.map((r) => (r.worker.id === row.worker.id ? saved : r)))
                    })
                }}
              />
            </label>
          </article>
        ))}
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      <button type="button" className="primary-save" disabled={busy} onClick={() => void handleSaveAll()}>
        Save All
      </button>
    </div>
  )
}
