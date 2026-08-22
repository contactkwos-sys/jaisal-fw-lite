/**
 * Date-range attendance matrix — fast P/A/HD/L/WO/H entry for JAISAL FW HR.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attendance, Worker } from '../lib/database.types'
import {
  ATTENDANCE_STATUS_FILTERS,
  buildMatrixAttendancePayload,
  datesBetween,
  formatDateHeader,
  matrixBadgeClass,
  matrixCodeToStatus,
  nextMatrixCode,
  resolveDateRangePreset,
  statusToMatrixCode,
  summarizeStatuses,
  type AttendanceSummary,
  type DateRangePreset,
  type MatrixCode,
  workerMatchesAttendanceFilter,
} from '../lib/attendanceMatrix'
import { SHIFTS, todayISO } from '../lib/hrPayroll'
import { supabase } from '../lib/supabase'

type CellState = {
  attendanceId: string | null
  code: MatrixCode | ''
  dirty: boolean
}

type RowState = {
  worker: Worker
  cells: Map<string, CellState>
  summary: AttendanceSummary
}

const DEPT_SUGGESTIONS = [
  'Weaving',
  'Folding',
  'Security',
  'Maintenance',
  'Office',
  'Quality',
  'Other',
]

const DEFAULT_MATRIX_CODE: MatrixCode = 'A'

export function AttendanceScreen() {
  const [fromDate, setFromDate] = useState(() => resolveDateRangePreset('this-month').from)
  const [toDate, setToDate] = useState(() => todayISO())
  const [rangePreset, setRangePreset] = useState<DateRangePreset>('this-month')
  const [shiftFilter, setShiftFilter] = useState('All')
  const [deptFilter, setDeptFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [defaultCode, setDefaultCode] = useState<MatrixCode>(DEFAULT_MATRIX_CODE)
  const [rows, setRows] = useState<RowState[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDept, setNewDept] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newDesig, setNewDesig] = useState('')
  const [focusCell, setFocusCell] = useState<{ workerId: string; date: string } | null>(null)
  const matrixRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'attendance_default_code').maybeSingle()
      const v = (data as { value?: string } | null)?.value?.trim().toUpperCase()
      if (v === 'P' || v === 'A' || v === 'HD' || v === 'L' || v === 'WO' || v === 'H') {
        setDefaultCode(v as MatrixCode)
      }
    })()
  }, [])

  function applyPreset(preset: DateRangePreset) {
    setRangePreset(preset)
    if (preset === 'custom') return
    const { from, to } = resolveDateRangePreset(preset, fromDate, toDate)
    setFromDate(from)
    setToDate(to)
  }

  function recomputeRow(worker: Worker, cells: Map<string, CellState>, dateKeys: string[]): RowState {
    const statusMap: Record<string, string> = {}
    for (const d of dateKeys) {
      const c = cells.get(d)
      if (c?.code) statusMap[d] = matrixCodeToStatus(c.code)
    }
    return {
      worker,
      cells,
      summary: summarizeStatuses(statusMap, dateKeys),
    }
  }

  const loadAttendance = useCallback(async () => {
    setError(null)
    setBusy(true)
    try {
      const keys = datesBetween(fromDate, toDate)
      if (!keys.length) {
        setError('Invalid date range')
        return
      }
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

      const nextRows: RowState[] = ((workers as Worker[]) ?? []).map((worker) => {
        const cells = new Map<string, CellState>()
        for (const d of keys) {
          const a = byWorkerDate.get(`${worker.id}|${d}`)
          cells.set(d, {
            attendanceId: a?.id ?? null,
            code: a ? statusToMatrixCode(a.status) : '',
            dirty: false,
          })
        }
        return recomputeRow(worker, cells, keys)
      })

      setDates(keys)
      setRows(nextRows)
      setLoaded(true)
      setMessage(`Loaded ${nextRows.length} employees · ${keys.length} days`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [fromDate, toDate])

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const r of rows) {
      if (r.worker.department) set.add(r.worker.department)
    }
    return [...set].sort()
  }, [rows])

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (shiftFilter !== 'All' && (row.worker.shift || 'Day') !== shiftFilter) return false
      if (deptFilter !== 'All' && row.worker.department !== deptFilter) return false
      return workerMatchesAttendanceFilter(row.summary, statusFilter, search, row.worker)
    })
  }, [rows, shiftFilter, deptFilter, statusFilter, search])

  function setCellCode(workerId: string, date: string, code: MatrixCode) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.worker.id !== workerId) return row
        const cells = new Map(row.cells)
        const cur = cells.get(date) || { attendanceId: null, code: '', dirty: false }
        cells.set(date, { ...cur, code, dirty: true })
        return recomputeRow(row.worker, cells, dates)
      }),
    )
  }

  function cycleCell(workerId: string, date: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.worker.id !== workerId) return row
        const cells = new Map(row.cells)
        const cur = cells.get(date) || { attendanceId: null, code: '', dirty: false }
        const next = nextMatrixCode(cur.code, defaultCode)
        cells.set(date, { ...cur, code: next, dirty: true })
        return recomputeRow(row.worker, cells, dates)
      }),
    )
  }

  function handleMatrixKeyDown(e: React.KeyboardEvent, workerId: string, date: string, rowIdx: number, colIdx: number) {
    const codeMap: Record<string, MatrixCode> = {
      p: 'P',
      a: 'A',
      h: 'H',
      l: 'L',
    }
    const key = e.key.toLowerCase()
    if (key in codeMap) {
      e.preventDefault()
      setCellCode(workerId, date, codeMap[key])
      return
    }
    if (key === 'd' && !e.shiftKey) {
      e.preventDefault()
      setCellCode(workerId, date, 'HD')
      return
    }
    if (key === 'w' && e.shiftKey) {
      e.preventDefault()
      setCellCode(workerId, date, 'WO')
      return
    }
    let nextRow = rowIdx
    let nextCol = colIdx
    if (key === 'ArrowRight') nextCol++
    else if (key === 'ArrowLeft') nextCol--
    else if (key === 'ArrowDown') nextRow++
    else if (key === 'ArrowUp') nextRow--
    else if (key === 'Enter' || key === ' ') {
      e.preventDefault()
      cycleCell(workerId, date)
      return
    } else return

    e.preventDefault()
    const targetRow = visibleRows[nextRow]
    const targetDate = dates[nextCol]
    if (targetRow && targetDate) setFocusCell({ workerId: targetRow.worker.id, date: targetDate })
  }

  async function persistDirtyRows(): Promise<void> {
    const dirtyRows = rows.filter((r) => [...r.cells.values()].some((c) => c.dirty))
    for (const row of dirtyRows) {
      for (const [date, cell] of row.cells) {
        if (!cell.dirty || !cell.code) continue
        const payload = buildMatrixAttendancePayload({
          worker_id: row.worker.id,
          date,
          code: cell.code,
          shift: row.worker.shift || 'Day',
        })
        if (cell.attendanceId) {
          const { error: uErr } = await supabase.from('attendance').update(payload).eq('id', cell.attendanceId)
          if (uErr) throw uErr
        } else {
          const { data, error: iErr } = await supabase.from('attendance').insert(payload).select('id').single()
          if (iErr) throw iErr
          cell.attendanceId = (data as { id: string }).id
        }
        cell.dirty = false
      }
    }
  }

  async function handleSave() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await persistDirtyRows()
      setMessage('Attendance saved')
      await loadAttendance()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function handleClear() {
    setRows([])
    setDates([])
    setLoaded(false)
    setMessage(null)
    setError(null)
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
    try {
      const insertPayload: Record<string, unknown> = {
        full_name,
        department: newDept.trim() || null,
        is_active: true,
        designation: newDesig.trim() || null,
        employee_code: newCode.trim() || null,
        shift: shiftFilter === 'All' ? 'Day' : shiftFilter,
      }
      const { error: iErr } = await supabase.from('workers').insert(insertPayload).select('*').single()
      if (iErr) throw iErr
      setNewName('')
      setNewDept('')
      setNewCode('')
      setNewDesig('')
      setShowAdd(false)
      setMessage(`${full_name} added — load attendance to include in matrix`)
      if (loaded) await loadAttendance()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add worker failed')
    } finally {
      setBusy(false)
    }
  }

  const companyTotals = useMemo(() => {
    const t = {
      employees: visibleRows.length,
      present: 0,
      absent: 0,
      paidDays: 0,
    }
    for (const r of visibleRows) {
      t.present += r.summary.present
      t.absent += r.summary.absent
      t.paidDays += r.summary.paidDays
    }
    t.paidDays = Math.round(t.paidDays * 100) / 100
    return t
  }, [visibleRows])

  return (
    <div className="screen hr-screen hr-att-matrix-screen">
      <header className="screen-header">
        <div>
          <h1>Attendance</h1>
          <p className="text-muted2">JAISAL FASHIONWEAV INDUSTRIES · Date-range matrix</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Cancel' : '+ Add Employee'}
        </button>
      </header>

      <div className="hr-toolbar hr-att-toolbar">
        <div className="hr-att-range-presets">
          {(
            [
              ['today', 'Today'],
              ['this-week', 'This Week'],
              ['this-month', 'This Month'],
              ['previous-month', 'Previous Month'],
              ['custom', 'Custom Range'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={rangePreset === id ? 'hr-att-preset active' : 'hr-att-preset'}
              onClick={() => applyPreset(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="text-muted">From Date</span>
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={(e) => {
              setFromDate(e.target.value)
              setRangePreset('custom')
            }}
          />
        </label>
        <label className="field">
          <span className="text-muted">To Date</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            max={todayISO()}
            onChange={(e) => {
              setToDate(e.target.value)
              setRangePreset('custom')
            }}
          />
        </label>
        <label className="field">
          <span className="text-muted">Shift</span>
          <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}>
            <option value="All">All</option>
            {SHIFTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Department</span>
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="All">All</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field hr-att-search">
          <span className="text-muted">Search Employee</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code, name, designation, dept…"
          />
        </label>
        <label className="field">
          <span className="text-muted">Status filter</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {ATTENDANCE_STATUS_FILTERS.map((f) => (
              <option key={f.id || 'all'} value={f.id}>{f.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Default cell</span>
          <select value={defaultCode} onChange={(e) => setDefaultCode(e.target.value as MatrixCode)}>
            {(['P', 'A', 'HD', 'L', 'WO', 'H'] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="hr-att-actions">
          <button type="button" className="primary-save" disabled={busy} onClick={() => void loadAttendance()}>
            Load Attendance
          </button>
          <button type="button" className="btn-ghost" disabled={busy || !loaded} onClick={() => void handleSave()}>
            Save Changes
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {showAdd ? (
        <form className="form-stack surface card-row" onSubmit={(e) => void handleAddWorker(e)}>
          <div className="hr-form-grid">
            <label className="field">
              <span className="text-muted">Employee Code</span>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="EMP001" />
            </label>
            <label className="field">
              <span className="text-muted">Full Name</span>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Worker name" />
            </label>
            <label className="field">
              <span className="text-muted">Designation</span>
              <input value={newDesig} onChange={(e) => setNewDesig(e.target.value)} placeholder="Operator" />
            </label>
            <label className="field">
              <span className="text-muted">Department</span>
              <input list="dept-list-att" value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Weaving" />
              <datalist id="dept-list-att">
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

      {loaded ? (
        <div className="hr-att-summary-bar">
          <span>Employees: <strong className="num">{companyTotals.employees}</strong></span>
          <span>Present days: <strong className="num">{companyTotals.present}</strong></span>
          <span>Absent days: <strong className="num">{companyTotals.absent}</strong></span>
          <span>Total paid days: <strong className="num">{companyTotals.paidDays}</strong></span>
          <span className="text-muted2">Tap cell or press P/A/HD/L/WO/H · arrows to navigate</span>
        </div>
      ) : null}

      {loaded ? (
        <div className="hr-att-matrix-wrap" ref={matrixRef}>
          <table className="hr-att-matrix">
            <thead>
              <tr>
                <th className="hr-att-sticky-emp">Employee</th>
                <th className="hr-att-sticky-meta">Designation</th>
                <th className="hr-att-sticky-meta">Dept</th>
                {dates.map((d) => (
                  <th key={d} className="hr-att-date-col" title={d}>{formatDateHeader(d)}</th>
                ))}
                <th className="hr-att-sum-col">P</th>
                <th className="hr-att-sum-col">A</th>
                <th className="hr-att-sum-col">HD</th>
                <th className="hr-att-sum-col">L</th>
                <th className="hr-att-sum-col">WO</th>
                <th className="hr-att-sum-col">H</th>
                <th className="hr-att-sum-col">Paid</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, rowIdx) => (
                <tr key={row.worker.id}>
                  <td className="hr-att-sticky-emp">
                    <strong>{row.worker.full_name}</strong>
                    <div className="text-muted2">{row.worker.employee_code || '—'}</div>
                  </td>
                  <td className="hr-att-sticky-meta">{row.worker.designation || '—'}</td>
                  <td className="hr-att-sticky-meta">{row.worker.department || '—'}</td>
                  {dates.map((d, colIdx) => {
                    const cell = row.cells.get(d)
                    const code = cell?.code || ''
                    const focused = focusCell?.workerId === row.worker.id && focusCell?.date === d
                    return (
                      <td key={d} className="hr-att-date-col">
                        <button
                          type="button"
                          className={`${matrixBadgeClass(code)}${cell?.dirty ? ' dirty' : ''}${focused ? ' focused' : ''}`}
                          title={`${d} · ${code || 'empty'} — click to cycle`}
                          onClick={() => cycleCell(row.worker.id, d)}
                          onKeyDown={(e) => handleMatrixKeyDown(e, row.worker.id, d, rowIdx, colIdx)}
                          onFocus={() => setFocusCell({ workerId: row.worker.id, date: d })}
                        >
                          {code || '—'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="hr-att-sum-col num">{row.summary.present}</td>
                  <td className="hr-att-sum-col num">{row.summary.absent}</td>
                  <td className="hr-att-sum-col num">{row.summary.halfDay}</td>
                  <td className="hr-att-sum-col num">{row.summary.leave}</td>
                  <td className="hr-att-sum-col num">{row.summary.weeklyOff}</td>
                  <td className="hr-att-sum-col num">{row.summary.holiday}</td>
                  <td className="hr-att-sum-col num"><strong>{row.summary.paidDays}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleRows.length ? <p className="text-muted">No employees match filters.</p> : null}
        </div>
      ) : (
        <p className="text-muted">Select date range and click Load Attendance.</p>
      )}

      {/* Mobile cards */}
      {loaded ? (
        <div className="hr-att-mobile-cards">
          {visibleRows.map((row) => (
            <article key={`m-${row.worker.id}`} className="hr-att-mobile-card surface">
              <div className="hr-att-mobile-head">
                <div>
                  <strong>{row.worker.full_name}</strong>
                  <div className="text-muted2">
                    {row.worker.employee_code || '—'} · {row.worker.designation || '—'} · {row.worker.department || '—'}
                  </div>
                </div>
                <div className="hr-att-mobile-summary">
                  <span>P:{row.summary.present}</span>
                  <span>A:{row.summary.absent}</span>
                  <span>Paid:{row.summary.paidDays}</span>
                </div>
              </div>
              <div className="hr-att-mobile-dates">
                {dates.map((d) => {
                  const cell = row.cells.get(d)
                  const code = cell?.code || ''
                  return (
                    <button
                      key={d}
                      type="button"
                      className={matrixBadgeClass(code)}
                      onClick={() => cycleCell(row.worker.id, d)}
                    >
                      <span className="hr-att-mobile-day">{formatDateHeader(d)}</span>
                      <span>{code || '—'}</span>
                    </button>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
