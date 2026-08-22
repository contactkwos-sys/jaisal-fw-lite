/**
 * Warp Yarn Stock Entry — machine-wise beam installation form.
 * Matches reference UI: pipe + item at top, machine cards, totals, recent entries.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { YarnSearchSelect } from '../YarnSearchSelect'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { calcTotalMeter, DEFAULT_MULTIPLIER, formatNum, todayISO } from '../../lib/warpYarn'
import {
  loadMachineEntries,
  loadTodaySummary,
  loadWarpItems,
  machineShort,
  saveMachineStockEntry,
  WARP_MACHINES,
  type WarpMachineEntry,
  type WarpMachineId,
  type WarpYarnItem,
} from '../../lib/warpBeamStock'

type Props = {
  pipeOptions: string[]
  onSaved?: () => void
  tablesReady?: boolean
}

type MachineMeters = Record<WarpMachineId, string>

function emptyMeters(): MachineMeters {
  return Object.fromEntries(WARP_MACHINES.map((m) => [m.id, ''])) as MachineMeters
}

export function WarpBeamStockEntry({ pipeOptions, onSaved, tablesReady = true }: Props) {
  const { profile } = useAuth()
  const userName = profile?.full_name || profile?.roles?.role_name || 'User'

  const [pipeNo, setPipeNo] = useState('')
  const [itemName, setItemName] = useState('')
  const [yarnType, setYarnType] = useState('Wet Yarn')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [meters, setMeters] = useState<MachineMeters>(emptyMeters)
  const [items, setItems] = useState<WarpYarnItem[]>([])
  const [entries, setEntries] = useState<WarpMachineEntry[]>([])
  const [todaySummary, setTodaySummary] = useState({ entry_count: 0, total_single_meter: 0, total_double_meter: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const itemOptions = useMemo(() => items.map((i) => i.item_name), [items])

  const reload = useCallback(async () => {
    try {
      const [itemRows, entryRows, summary] = await Promise.all([
        loadWarpItems(supabase),
        loadMachineEntries(supabase, 30),
        loadTodaySummary(supabase),
      ])
      setItems(itemRows)
      setEntries(entryRows)
      setTodaySummary(summary)
    } catch {
      /* tables may not exist yet */
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const totalSingle = useMemo(
    () => WARP_MACHINES.reduce((s, m) => s + (Number(meters[m.id]) || 0), 0),
    [meters],
  )
  const totalDouble = useMemo(() => calcTotalMeter(totalSingle, DEFAULT_MULTIPLIER), [totalSingle])

  function setMachineMeter(id: WarpMachineId, value: string) {
    setMeters((prev) => ({ ...prev, [id]: value }))
  }

  function resetForm() {
    setPipeNo('')
    setItemName('')
    setYarnType('Wet Yarn')
    setEntryDate(todayISO())
    setNotes('')
    setMeters(emptyMeters())
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || busy) return
    setSubmitting(true)
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const machines = WARP_MACHINES.map((m) => ({
        machine_no: m.id,
        single_meter: Number(meters[m.id]) || 0,
      })).filter((m) => m.single_meter > 0)

      await saveMachineStockEntry(supabase, {
        entry_date: entryDate,
        pipe_no: pipeNo,
        item_name: itemName,
        yarn_type: yarnType,
        notes,
        machines,
        created_by: userName,
      })
      setMessage(`Entry saved · ${formatNum(totalSingle)} m single → ${formatNum(totalDouble)} m double width`)
      resetForm()
      await reload()
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
      setSubmitting(false)
    }
  }

  function lineMeter(entry: WarpMachineEntry, machineId: string): string {
    const lines = entry.lines ?? []
    const line = lines.find((l) => l.machine_no === machineId)
    if (!line || !line.single_meter) return '—'
    return formatNum(line.single_meter)
  }

  return (
    <div className="wbs-entry-layout">
      <div className="wbs-main">
        <form className="wbs-form surface" onSubmit={(e) => void handleSave(e)}>
          <header className="wbs-form-header">
            <div>
              <h2 className="wbs-title">Warp Yarn Stock Entry</h2>
              <p className="wbs-subtitle">Warp Beams on Machines</p>
            </div>
          </header>

          <div className="wbs-top-fields">
            <YarnSearchSelect
              label="Pipe No."
              required
              value={pipeNo}
              options={pipeOptions}
              placeholder="e.g. R24"
              allowAdd
              addLabel="+ Add Pipe"
              onChange={(v) => setPipeNo(v.toUpperCase())}
            />
            <YarnSearchSelect
              label="Item / Material"
              required
              value={itemName}
              options={itemOptions}
              placeholder="Search or add item…"
              onChange={setItemName}
            />
            <label className="field">
              <span className="text-muted">Yarn Type</span>
              <input type="text" value={yarnType} onChange={(e) => setYarnType(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">
                Entry Date <em className="req">*</em>
              </span>
              <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
            </label>
          </div>

          <div className="wbs-info-banner">
            Machine is <strong>Double Width</strong>. Meter will be calculated as <strong>2 × Entered Meter</strong>.
          </div>

          <label className="field wbs-notes">
            <span className="text-muted">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" />
          </label>

          <h3 className="wbs-section-heading">Enter Meter on Machines (In Use)</h3>
          <div className="wbs-machine-grid">
            {WARP_MACHINES.map((m) => {
              const single = Number(meters[m.id]) || 0
              const double = calcTotalMeter(single, DEFAULT_MULTIPLIER)
              return (
                <article key={m.id} className="wbs-machine-card">
                  <h4 className="wbs-machine-name">
                    {m.label}
                    <span className="wbs-machine-code">{m.code}</span>
                  </h4>
                  <label className="field">
                    <span className="text-muted">Meter (Single)</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="decimal"
                      value={meters[m.id]}
                      onChange={(e) => setMachineMeter(m.id, e.target.value)}
                      placeholder="0"
                    />
                  </label>
                  <div className="wbs-double-field">
                    <span className="text-muted">Meter (Double)</span>
                    <output className="wbs-double-value">{formatNum(double)}</output>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="wbs-save-row">
            <div className="wbs-totals">
              <div className="wbs-total-block">
                <span className="wbs-total-label">Total Entered (Single)</span>
                <strong className="wbs-total-value">{formatNum(totalSingle)}</strong>
              </div>
              <div className="wbs-total-block">
                <span className="wbs-total-label">Total (Double Width × 2)</span>
                <strong className="wbs-total-value wbs-total-double">{formatNum(totalDouble)}</strong>
              </div>
            </div>
            <button type="submit" className="btn-warp wbs-save-btn" disabled={!tablesReady || busy || submitting}>
              {busy ? 'Saving…' : 'Save Entry'}
            </button>
          </div>

          {error ? <p className="form-error text-danger">{error}</p> : null}
          {message ? <p className="form-ok text-sage">{message}</p> : null}
        </form>

        <section className="wbs-recent surface">
          <h3 className="section-title">Recent Entries</h3>
          <div className="wym-table-wrap">
            <table className="wym-table wbs-recent-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Pipe No.</th>
                  <th>Item / Material</th>
                  <th>Yarn Type</th>
                  {WARP_MACHINES.map((m) => (
                    <th key={m.id}>{machineShort(m.id)}</th>
                  ))}
                  <th>Total (Double)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.entry_date}</td>
                    <td>
                      <strong>{entry.pipe_no}</strong>
                    </td>
                    <td>{entry.item_name}</td>
                    <td>{entry.yarn_type}</td>
                    {WARP_MACHINES.map((m) => (
                      <td key={m.id} className="num">
                        {lineMeter(entry, m.id)}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{formatNum(entry.total_double_meter)}</strong>
                    </td>
                    <td>{entry.notes || '—'}</td>
                  </tr>
                ))}
                {!entries.length ? (
                  <tr>
                    <td colSpan={7 + WARP_MACHINES.length} className="text-muted">
                      No entries yet — save your first beam stock entry above
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="wbs-footer surface">
          <div className="wbs-how">
            <h4>How it works</h4>
            <ol>
              <li>Enter Pipe No. &amp; Item</li>
              <li>Enter Meter on Machines (single meter input, double width auto-calculated)</li>
              <li>Save Entry (triggers stock reduction during production)</li>
              <li>Reports (viewing stock and transaction history)</li>
            </ol>
          </div>
          <div className="wbs-notes-block">
            <h4>Important Notes</h4>
            <p>Double-width math is automatic. Meter balances reduce automatically from production records.</p>
          </div>
        </footer>
      </div>

      <aside className="wbs-side">
        <article className="surface wbs-side-panel">
          <h3 className="section-title">Quick Item List</h3>
          <div className="wbs-item-list">
            {items.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                className="wbs-item-chip"
                onClick={() => setItemName(item.item_name)}
              >
                {item.item_name}
              </button>
            ))}
            {!items.length ? <p className="text-muted">Items appear here after first use</p> : null}
          </div>
        </article>

        <article className="surface wbs-side-panel wbs-today-summary">
          <h3 className="section-title">Today Summary (Machines)</h3>
          <p className="wbs-summary-count">
            <strong>{todaySummary.entry_count}</strong> entries today
          </p>
          <div className="wbs-summary-meters">
            <div>
              <span className="text-muted">Total Single Meter</span>
              <strong>{formatNum(todaySummary.total_single_meter)}</strong>
            </div>
            <div>
              <span className="text-muted">Total (Double Width)</span>
              <strong className="wbs-total-double">{formatNum(todaySummary.total_double_meter)}</strong>
            </div>
          </div>
          <p className="wbs-summary-hint text-muted">Total Meter (Double) = Entered Meter × 2</p>
        </article>
      </aside>
    </div>
  )
}
