/**
 * Bulk attendance table — all employees visible on one screen with full detail columns.
 * Preserves time-entry workflow; employees without punch still appear (not hidden).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { computeAttendanceStatus } from '../../lib/attendanceStatus'
import {
  datesBetween,
  statusToMatrixCode,
} from '../../lib/attendanceMatrix'
import type { Attendance, Worker } from '../../lib/database.types'
import {
  ATTENDANCE_STATUSES,
  computeTotalHours,
  payableDayFromAttendance,
  resolveAttendanceStatus,
  SHIFTS,
  statusBadgeClass,
} from '../../lib/hrPayroll'
import { supabase } from '../../lib/supabase'

type DetailRow = {
  worker: Worker
  date: string
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

type Summary = {
  employees: number
  present: number
  absent: number
  halfDay: number
  leave: number
  weeklyOff: number
  holiday: number
  totalHours: number
  otHours: number
}

function emptyTimes(shift: string): Omit<DetailRow, 'worker' | 'date' | 'attendanceId' | 'dirty'> {
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

function rebuildDerived(row: DetailRow, manualStatus?: string): DetailRow {
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

function otFromHours(totalHours: number, status: string): number {
  const s = (status || '').toLowerCase()
  if (!s.includes('present') && s !== 'completed' && s !== 'on break') return 0
  return Math.max(0, Math.round((totalHours - 8) * 100) / 100)
}

function statusMark(row: DetailRow, code: string): string {
  return statusToMatrixCode(row.status) === code ? '✓' : ''
}

type Props = {
  fromDate: string
  toDate: string
  shiftFilter: string
  deptFilter: string
  search: string
  statusFilter: string
  onError: (msg: string | null) => void
  onMessage: (msg: string | null) => void
}

export function AttendanceBulkTable({
  fromDate,
  toDate,
  shiftFilter,
  deptFilter,
  search,
  statusFilter,
  onError,
  onMessage,
}: Props) {
  const [rows, setRows] = useState<DetailRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [autoSave, setAutoSave] = useState(true)

  const dateKeys = useMemo(() => datesBetween(fromDate, toDate), [fromDate, toDate])

  const load = useCallback(async () => {
    if (!dateKeys.length) {
      onError('Invalid date range')
      return
    }
    setBusy(true)
    onError(null)
    try {
      const { data: workers, error: wErr } = await supabase
        .from('workers')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
      if (wErr) throw wErr

      const { data: attendance, error: aErr } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', fromDate)
        .lte('date', toDate)
      if (aErr) throw aErr

      const byWorkerDate = new Map<string, Attendance>()
      for (const a of (attendance as Attendance[]) ?? []) {
        byWorkerDate.set(`${a.worker_id}|${a.date}`, a)
      }

      const next: DetailRow[] = []
      for (const worker of (workers as Worker[]) ?? []) {
        const defaultShift = worker.shift || 'Day'
        for (const date of dateKeys) {
          const a = byWorkerDate.get(`${worker.id}|${date}`)
          if (!a) {
            next.push({
              worker,
              date,
              attendanceId: null,
              ...emptyTimes(defaultShift),
              dirty: false,
            })
            continue
          }
          const times = {
            in_time: a.in_time?.slice(0, 5) ?? '',
            break_out: a.break_out?.slice(0, 5) ?? '',
            break_in: a.break_in?.slice(0, 5) ?? '',
            out_time: a.out_time?.slice(0, 5) ?? '',
          }
          const base: DetailRow = {
            worker,
            date,
            attendanceId: a.id,
            ...times,
            status:
              a.status ??
              computeAttendanceStatus({
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
          next.push(rebuildDerived(base, a.status ?? undefined))
        }
      }

      setRows(next)
      setLoaded(true)
      onMessage(`Loaded ${(workers as Worker[])?.length ?? 0} employees · ${dateKeys.length} day(s)`)
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [dateKeys, fromDate, toDate, onError, onMessage])

  useEffect(() => {
    void load()
  }, [load])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (shiftFilter !== 'All' && (row.shift || row.worker.shift || 'Day') !== shiftFilter) return false
      if (deptFilter !== 'All' && row.worker.department !== deptFilter) return false
      if (statusFilter) {
        const code = statusToMatrixCode(row.status)
        if (code !== statusFilter) return false
      }
      if (q) {
        const hay = [
          row.worker.full_name,
          row.worker.employee_code,
          row.worker.designation,
          row.worker.department,
          row.worker.shift,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, shiftFilter, deptFilter, search, statusFilter])

  const totals = useMemo((): Summary => {
    const uniqueWorkers = new Set<string>()
    const t: Summary = {
      employees: 0,
      present: 0,
      absent: 0,
      halfDay: 0,
      leave: 0,
      weeklyOff: 0,
      holiday: 0,
      totalHours: 0,
      otHours: 0,
    }
    for (const row of visibleRows) {
      uniqueWorkers.add(row.worker.id)
      const code = statusToMatrixCode(row.status)
      if (code === 'P') t.present++
      else if (code === 'A') t.absent++
      else if (code === 'HD') t.halfDay++
      else if (code === 'L') t.leave++
      else if (code === 'WO') t.weeklyOff++
      else if (code === 'H') t.holiday++
      t.totalHours += row.total_hours
      t.otHours += otFromHours(row.total_hours, row.status)
    }
    t.employees = uniqueWorkers.size
    t.totalHours = Math.round(t.totalHours * 100) / 100
    t.otHours = Math.round(t.otHours * 100) / 100
    return t
  }, [visibleRows])

  async function persistRow(row: DetailRow): Promise<DetailRow> {
    const derived = rebuildDerived(row)
    const payload = {
      worker_id: derived.worker.id,
      date: derived.date,
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

  function rowKey(row: DetailRow) {
    return `${row.worker.id}|${row.date}`
  }

  function updateRow(key: string, patch: Partial<DetailRow>, opts?: { persist?: boolean; manualStatus?: string }) {
    setRows((prev) =>
      prev.map((row) => {
        if (rowKey(row) !== key) return row
        const merged = rebuildDerived({ ...row, ...patch, dirty: true }, opts?.manualStatus ?? patch.status)
        if (opts?.persist && autoSave) {
          void persistRow(merged)
            .then((saved) => {
              setRows((p) => p.map((r) => (rowKey(r) === key ? saved : r)))
              onMessage(`Saved · ${saved.worker.full_name}`)
            })
            .catch((e: Error) => onError(e.message))
        }
        return merged
      }),
    )
  }

  async function handleSaveAll() {
    setBusy(true)
    onMessage(null)
    onError(null)
    try {
      const updated: DetailRow[] = []
      for (const row of visibleRows.filter((r) => r.dirty)) {
        updated.push(await persistRow(row))
      }
      setRows((prev) =>
        prev.map((r) => {
          const u = updated.find((x) => rowKey(x) === rowKey(r))
          return u || r
        }),
      )
      onMessage('Attendance saved')
      await load()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const showDateCol = dateKeys.length > 1

  return (
    <>
      <div className="hr-att-summary-bar hr-att-bulk-summary">
        <span>Employees: <strong className="num">{totals.employees}</strong></span>
        <span>Present: <strong className="num text-sage">{totals.present}</strong></span>
        <span>Absent: <strong className="num text-danger">{totals.absent}</strong></span>
        <span>Half Day: <strong className="num">{totals.halfDay}</strong></span>
        <span>Leave: <strong className="num">{totals.leave}</strong></span>
        <span>Weekly Off: <strong className="num">{totals.weeklyOff}</strong></span>
        <span>Total Hours: <strong className="num">{totals.totalHours}</strong></span>
        <span>OT: <strong className="num">{totals.otHours}</strong></span>
        <label className="check-row hr-att-autosave">
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          <span className="text-muted2">Auto-save row</span>
        </label>
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="hr-table-wrap hr-att-bulk-wrap">
        <table className="hr-table hr-att-bulk-table">
          <thead>
            <tr>
              <th>Emp ID</th>
              <th>Employee Name</th>
              <th>Department</th>
              <th>Designation</th>
              {showDateCol ? <th>Date</th> : null}
              <th>Shift</th>
              <th>In Time</th>
              <th>Out Time</th>
              <th>P</th>
              <th>A</th>
              <th>HD</th>
              <th>L</th>
              <th>WO</th>
              <th>OT</th>
              <th>Total Hrs</th>
              <th>Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const key = rowKey(row)
              const ot = otFromHours(row.total_hours, row.status)
              return (
                <tr key={key} className={row.dirty ? 'hr-row-dirty' : undefined}>
                  <td className="num">{row.worker.employee_code || '—'}</td>
                  <td><strong>{row.worker.full_name}</strong></td>
                  <td>{row.worker.department || '—'}</td>
                  <td>{row.worker.designation || '—'}</td>
                  {showDateCol ? <td className="num">{row.date}</td> : null}
                  <td>
                    <select
                      value={row.shift || 'Day'}
                      onChange={(e) => updateRow(key, { shift: e.target.value }, { persist: true })}
                    >
                      {SHIFTS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.in_time}
                      onChange={(e) => updateRow(key, { in_time: e.target.value }, { persist: true })}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      value={row.out_time}
                      onChange={(e) => updateRow(key, { out_time: e.target.value }, { persist: true })}
                    />
                  </td>
                  <td className="hr-att-mark num">{statusMark(row, 'P')}</td>
                  <td className="hr-att-mark num">{statusMark(row, 'A')}</td>
                  <td className="hr-att-mark num">{statusMark(row, 'HD')}</td>
                  <td className="hr-att-mark num">{statusMark(row, 'L')}</td>
                  <td className="hr-att-mark num">{statusMark(row, 'WO')}</td>
                  <td className="num">{ot > 0 ? ot.toFixed(1) : '—'}</td>
                  <td className="num">{row.total_hours > 0 ? row.total_hours.toFixed(2) : '—'}</td>
                  <td>
                    <select
                      className={statusBadgeClass(row.status)}
                      value={row.status}
                      onChange={(e) =>
                        updateRow(key, { status: e.target.value }, { persist: true, manualStatus: e.target.value })
                      }
                    >
                      {ATTENDANCE_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="hr-att-remarks"
                      value={row.remarks}
                      placeholder="Remarks"
                      onChange={(e) => updateRow(key, { remarks: e.target.value })}
                      onBlur={() => {
                        if (row.dirty) {
                          void persistRow(row).then((saved) => {
                            setRows((p) => p.map((r) => (rowKey(r) === key ? saved : r)))
                          })
                        }
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loaded && !visibleRows.length ? <p className="text-muted">No employees match filters.</p> : null}
      </div>

      <div className="hr-att-mobile-cards hr-att-bulk-cards">
        {visibleRows.map((row) => {
          const key = rowKey(row)
          const ot = otFromHours(row.total_hours, row.status)
          return (
            <article key={`m-${key}`} className="hr-att-mobile-card surface">
              <div className="hr-att-mobile-head">
                <div>
                  <strong>{row.worker.employee_code ? `${row.worker.employee_code} · ` : ''}{row.worker.full_name}</strong>
                  <div className="text-muted2">
                    {row.worker.department || '—'} · {row.worker.designation || '—'}
                    {showDateCol ? ` · ${row.date}` : ''}
                  </div>
                </div>
                <span className={statusBadgeClass(row.status)}>{row.status}</span>
              </div>
              <div className="time-grid">
                <label className="field">
                  <span className="text-muted2">In Time</span>
                  <input type="time" value={row.in_time} onChange={(e) => updateRow(key, { in_time: e.target.value }, { persist: true })} />
                </label>
                <label className="field">
                  <span className="text-muted2">Out Time</span>
                  <input type="time" value={row.out_time} onChange={(e) => updateRow(key, { out_time: e.target.value }, { persist: true })} />
                </label>
              </div>
              <div className="text-muted2">
                Hours: <span className="num">{row.total_hours.toFixed(2)}</span>
                {ot > 0 ? <> · OT: <span className="num">{ot.toFixed(1)}</span></> : null}
              </div>
              <label className="field">
                <span className="text-muted2">Remarks</span>
                <input value={row.remarks} onChange={(e) => updateRow(key, { remarks: e.target.value })} />
              </label>
            </article>
          )
        })}
      </div>

      <button type="button" className="primary-save" disabled={busy || !loaded} onClick={() => void handleSaveAll()}>
        Save All Changes
      </button>
    </>
  )
}
