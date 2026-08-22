import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES, SHIFT_HOURS_DEFAULT, type MachineProductionReport } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type TabId = 'entry' | 'list'

export function MachineProdReportScreen() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<MachineProductionReport[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [reportDate, setReportDate] = useState(todayISO())
  const [machineNo, setMachineNo] = useState<string>(MACHINES[0])
  const [shift, setShift] = useState<'Day' | 'Night'>('Day')
  const [totalMeters, setTotalMeters] = useState('')
  const [warpBroken, setWarpBroken] = useState('0')
  const [weftBroken, setWeftBroken] = useState('0')
  const [workingHours, setWorkingHours] = useState(String(SHIFT_HOURS_DEFAULT))
  const [shiftHours, setShiftHours] = useState(String(SHIFT_HOURS_DEFAULT))
  const [listDate, setListDate] = useState(todayISO())

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'
  const wh = Number(workingHours) || 0
  const sh = Number(shiftHours) || SHIFT_HOURS_DEFAULT
  const diff = sh - wh
  const efficiency = sh > 0 ? (wh / sh) * 100 : 0

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('machine_production_report')
      .select('*')
      .eq('report_date', listDate)
      .order('machine_no')
      .order('shift')
    if (err) throw err
    setRows((data as MachineProductionReport[]) ?? [])
  }, [listDate])

  useEffect(() => {
    if (tab === 'list') void load().catch((e: Error) => setError(e.message))
  }, [tab, load])

  const grouped = useMemo(() => {
    const map = new Map<string, MachineProductionReport[]>()
    for (const r of rows) {
      const key = `${r.machine_no} · ${r.shift}`
      const list = map.get(key) || []
      list.push(r)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [rows])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        report_date: reportDate,
        machine_no: machineNo,
        shift,
        total_meters: Number(totalMeters) || 0,
        warp_broken_count: Number(warpBroken) || 0,
        weft_broken_count: Number(weftBroken) || 0,
        working_hours: wh,
        shift_hours: sh,
        difference_hours: diff,
        efficiency_percent: Number(efficiency.toFixed(2)),
        entered_by: enteredBy,
      }
      const { error: iErr } = await supabase.from('machine_production_report').insert(payload)
      if (iErr) throw iErr
      setMessage('Report saved')
      setTotalMeters('')
      setWarpBroken('0')
      setWeftBroken('0')
      setListDate(reportDate)
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Machine Production Report</h1>
        <p className="text-muted">Machine Supervisor · shift-wise entry</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: 'Entry' },
            { id: 'list', label: 'By Machine + Shift' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
          <label className="field">
            <span>Date</span>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Machine</span>
            <select value={machineNo} onChange={(e) => setMachineNo(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </label>
          <label className="field">
            <span>Total meters</span>
            <input
              className="num"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={totalMeters}
              onChange={(e) => setTotalMeters(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Warp broken count</span>
            <input
              className="num"
              inputMode="numeric"
              type="number"
              value={warpBroken}
              onChange={(e) => setWarpBroken(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Weft broken count</span>
            <input
              className="num"
              inputMode="numeric"
              type="number"
              value={weftBroken}
              onChange={(e) => setWeftBroken(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Working hours</span>
            <input
              className="num"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Shift hours</span>
            <input
              className="num"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={shiftHours}
              onChange={(e) => setShiftHours(e.target.value)}
            />
          </label>
          <p className="text-muted2">
            Diff hours (auto): <strong className="num">{diff.toFixed(2)}</strong> · Efficiency:{' '}
            <strong className="num">{efficiency.toFixed(1)}%</strong>
          </p>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save report'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="form-stack">
          <label className="field">
            <span>Filter date</span>
            <input type="date" value={listDate} onChange={(e) => setListDate(e.target.value)} />
          </label>
          {grouped.map(([key, list]) => (
            <section key={key} className="dash-panel surface">
              <h3>{key}</h3>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Meters</th>
                      <th>Warp brk</th>
                      <th>Weft brk</th>
                      <th>Hrs</th>
                      <th>Eff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id}>
                        <td className="num">{Number(r.total_meters).toFixed(1)}</td>
                        <td className="num">{r.warp_broken_count}</td>
                        <td className="num">{r.weft_broken_count}</td>
                        <td className="num">
                          {Number(r.working_hours).toFixed(1)}/{Number(r.shift_hours).toFixed(0)}
                        </td>
                        <td className="num">{Number(r.efficiency_percent).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!grouped.length ? <p className="text-muted">No reports for this date</p> : null}
        </div>
      ) : null}
    </div>
  )
}
