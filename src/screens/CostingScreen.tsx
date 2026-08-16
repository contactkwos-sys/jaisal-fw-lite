import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { ElectricityEntry } from '../lib/database.types'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'summary' | 'electricity'
type Props = { initialSub?: Sub }

/**
 * Yarn consumption proxy (assumed):
 * avg(warp_rate + weft_rate) across designs × today's production meters × 0.08
 * (same 8% factor used in design conversion charge).
 */
export function CostingScreen({ initialSub = 'summary' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [date, setDate] = useState(todayISO())
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [salary, setSalary] = useState(0)
  const [yarnCost, setYarnCost] = useState(0)
  const [electricity, setElectricity] = useState(0)
  const [maintenance, setMaintenance] = useState(0)
  const [billing, setBilling] = useState(0)
  const [entries, setEntries] = useState<ElectricityEntry[]>([])

  const [source, setSource] = useState('DGVCL Meter')
  const [unit, setUnit] = useState('')
  const [rate, setRate] = useState('')

  const elecTotal = useMemo(() => (Number(unit) || 0) * (Number(rate) || 0), [unit, rate])
  const expense = salary + yarnCost + electricity + maintenance
  const profit = billing - expense

  const loadSummary = useCallback(async () => {
    const month = date.slice(0, 7)
    const [
      { data: att },
      { data: rates },
      { data: workers },
      { data: prod },
      { data: designs },
      { data: elec },
      { data: maint },
      { data: repair },
      { data: challans },
    ] = await Promise.all([
      supabase.from('attendance').select('worker_id, status').eq('date', date),
      supabase.from('payroll_rates').select('*'),
      supabase.from('workers').select('id, role_id, department'),
      supabase.from('production_entries').select('total_meter').eq('entry_date', date),
      supabase.from('designs').select('warp_rate, weft_rate'),
      supabase.from('electricity_entries').select('*').eq('entry_date', date),
      supabase.from('maintenance_requests').select('cost').gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`),
      supabase.from('repairing_tracker').select('cost').gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`),
      supabase.from('challans').select('total').gte('created_at', `${date}T00:00:00`).lte('created_at', `${date}T23:59:59`),
    ])

    const rateByRole = new Map((rates ?? []).map((r) => [r.role_id, Number(r.rate_per_day || 0)]))
    const presentIds = new Set(
      (att ?? [])
        .filter((a) => {
          const s = String(a.status || '').toLowerCase()
          return s.includes('present') || s === 'completed' || s === 'on break'
        })
        .map((a) => a.worker_id),
    )
    let sal = 0
    for (const w of workers ?? []) {
      if (!presentIds.has(w.id)) continue
      const rid = w.role_id
      sal += rid ? rateByRole.get(rid) || 0 : 0
    }
    // If no role_id mapping, fall back to average rate × present count
    if (sal === 0 && presentIds.size && (rates ?? []).length) {
      const avg =
        (rates ?? []).reduce((s, r) => s + Number(r.rate_per_day || 0), 0) / (rates ?? []).length
      sal = avg * presentIds.size
    }
    setSalary(sal)

    const meters = (prod ?? []).reduce((s, p) => s + Number(p.total_meter || 0), 0)
    const designRows = designs ?? []
    const avgYarn =
      designRows.length
        ? designRows.reduce((s, d) => s + Number(d.warp_rate || 0) + Number(d.weft_rate || 0), 0) /
          designRows.length
        : 0
    setYarnCost(avgYarn * meters * 0.08)

    const elecSum = (elec ?? []).reduce((s, e) => s + Number(e.total || 0), 0)
    setElectricity(elecSum)
    setEntries((elec as ElectricityEntry[]) ?? [])

    const maintSum =
      (maint ?? []).reduce((s, m) => s + Number(m.cost || 0), 0) +
      (repair ?? []).reduce((s, r) => s + Number(r.cost || 0), 0)
    setMaintenance(maintSum)

    setBilling((challans ?? []).reduce((s, c) => s + Number(c.total || 0), 0))
    void month
  }, [date])

  useEffect(() => {
    void loadSummary().catch((e: Error) => setError(e.message))
  }, [loadSummary])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  async function saveElectricity(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        entry_date: date,
        source,
        unit_kwh: Number(unit) || 0,
        rate_per_unit: Number(rate) || 0,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'electricity_entries',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('electricity_entries').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Electricity saved' : 'Sent to approval queue')
      setUnit('')
      setRate('')
      await loadSummary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!isCeo) {
    return (
      <div className="screen">
        <p className="text-danger">Costing Paper is CEO-only.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Costing Paper</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'summary', label: 'Daily Summary' },
            { id: 'electricity', label: 'Electricity' },
          ]}
        />
        <label className="field">
          <span className="text-muted">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </header>

      {sub === 'summary' ? (
        <div className="form-stack">
          <div className="kpi-grid">
            <div className="kpi-card surface">
              <span className="text-muted">Salary</span>
              <strong className="num">₹{salary.toFixed(0)}</strong>
            </div>
            <div className="kpi-card surface">
              <span className="text-muted">Yarn Consumption</span>
              <strong className="num">₹{yarnCost.toFixed(0)}</strong>
            </div>
            <div className="kpi-card surface">
              <span className="text-muted">Electricity</span>
              <strong className="num">₹{electricity.toFixed(0)}</strong>
            </div>
            <div className="kpi-card surface">
              <span className="text-muted">Maintenance / Repair</span>
              <strong className="num">₹{maintenance.toFixed(0)}</strong>
            </div>
          </div>

          <div className="profit-panel surface">
            <div>
              <span className="text-muted">Total Expense</span>
              <div className="num">₹{expense.toFixed(0)}</div>
            </div>
            <div>
              <span className="text-muted">Daily Billing</span>
              <div className="num">₹{billing.toFixed(0)}</div>
            </div>
            <div>
              <span className="text-muted">Profit</span>
              <div className={`num ${profit >= 0 ? 'text-sage' : 'text-danger'}`}>
                ₹{profit.toFixed(0)}
              </div>
            </div>
          </div>

          <ShareActions
            onWhatsApp={() =>
              shareWhatsApp(
                `Costing ${date}\nSalary ₹${salary.toFixed(0)}\nYarn ₹${yarnCost.toFixed(0)}\nElec ₹${electricity.toFixed(0)}\nMaint ₹${maintenance.toFixed(0)}\nExpense ₹${expense.toFixed(0)}\nBilling ₹${billing.toFixed(0)}\nProfit ₹${profit.toFixed(0)}`,
              )
            }
            onPrint={() =>
              printSummary(
                `Daily Costing ${date}`,
                rowsToHtml([
                  ['Salary', salary.toFixed(0)],
                  ['Yarn', yarnCost.toFixed(0)],
                  ['Electricity', electricity.toFixed(0)],
                  ['Maintenance', maintenance.toFixed(0)],
                  ['Expense', expense.toFixed(0)],
                  ['Billing', billing.toFixed(0)],
                  ['Profit', profit.toFixed(0)],
                ]),
              )
            }
          />
        </div>
      ) : null}

      {sub === 'electricity' ? (
        <form className="form-stack" onSubmit={(e) => void saveElectricity(e)}>
          <label className="field">
            <span className="text-muted">Source</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option>DGVCL Meter</option>
              <option>DG Set</option>
              <option>Other</option>
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Unit (kWh)</span>
            <input className="num" type="number" step="0.01" value={unit} onChange={(e) => setUnit(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Rate / Unit</span>
            <input className="num" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Total</span>
            <input className="num readonly" value={elecTotal.toFixed(2)} readOnly />
          </label>
          <button type="submit" className="primary-save" disabled={busy}>Save</button>

          <div className="list">
            {entries.map((en) => (
              <article key={en.id} className="card-row surface">
                <strong>{en.source}</strong>
                <div className="text-muted num">
                  {en.unit_kwh} kWh × ₹{en.rate_per_unit} = ₹{Number(en.total).toFixed(2)}
                </div>
              </article>
            ))}
          </div>
        </form>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
