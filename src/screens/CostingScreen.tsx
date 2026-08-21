import { useCallback, useEffect, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { ElectricityEntry, GebReading } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'summary' | 'electricity'
type Props = { initialSub?: Sub }

/**
 * Daily Factory Costing + Daily P&L (preserved; separate from Design-wise Costing).
 * D-07: Electricity for the day is taken from GEB Readings (canonical meter).
 * Legacy electricity_entries remain visible as history only — not deleted.
 */
export function CostingScreen({ initialSub = 'summary' }: Props) {
  const { isCeo } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)

  const [salary, setSalary] = useState(0)
  const [yarnCost, setYarnCost] = useState(0)
  const [electricity, setElectricity] = useState(0)
  const [maintenance, setMaintenance] = useState(0)
  const [billing, setBilling] = useState(0)
  const [gebRows, setGebRows] = useState<GebReading[]>([])
  const [legacyElec, setLegacyElec] = useState<ElectricityEntry[]>([])

  const expense = salary + yarnCost + electricity + maintenance
  const profit = billing - expense

  const loadSummary = useCallback(async () => {
    const [
      { data: att },
      { data: rates },
      { data: workers },
      { data: prod },
      { data: warps },
      { data: wefts },
      { data: geb },
      { data: legacy },
      { data: maint },
      { data: repair },
      { data: challans },
    ] = await Promise.all([
      supabase.from('attendance').select('worker_id, status').eq('date', date),
      supabase.from('payroll_rates').select('*'),
      supabase.from('workers').select('id, role_id, department'),
      supabase.from('production_entries').select('total_meter').eq('entry_date', date),
      supabase.from('design_warp').select('amount'),
      supabase.from('design_weft').select('amount'),
      supabase.from('geb_readings').select('*').eq('reading_date', date).order('created_at', { ascending: false }),
      supabase.from('electricity_entries').select('*').eq('entry_date', date),
      supabase
        .from('maintenance_requests')
        .select('cost')
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`),
      supabase
        .from('repairing_tracker')
        .select('cost')
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`),
      supabase
        .from('challans')
        .select('total')
        .gte('created_at', `${date}T00:00:00`)
        .lte('created_at', `${date}T23:59:59`),
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
    if (sal === 0 && presentIds.size && (rates ?? []).length) {
      const avg =
        (rates ?? []).reduce((s, r) => s + Number(r.rate_per_day || 0), 0) / (rates ?? []).length
      sal = avg * presentIds.size
    }
    setSalary(sal)

    const meters = (prod ?? []).reduce((s, p) => s + Number(p.total_meter || 0), 0)
    const yarnRows = [...(warps ?? []), ...(wefts ?? [])]
    const avgYarn = yarnRows.length
      ? yarnRows.reduce((s, d) => s + Number(d.amount || 0), 0) / yarnRows.length
      : 0
    setYarnCost(avgYarn * meters)

    const gebList = (geb as GebReading[]) ?? []
    setGebRows(gebList)
    const gebSum = gebList.reduce((s, e) => s + Number(e.amount || 0), 0)
    const legacyList = (legacy as ElectricityEntry[]) ?? []
    setLegacyElec(legacyList)
    // Prefer GEB (canonical). Fall back to legacy electricity_entries if no GEB that day.
    const legacySum = legacyList.reduce((s, e) => s + Number(e.total || 0), 0)
    setElectricity(gebSum > 0 ? gebSum : legacySum)

    const maintSum =
      (maint ?? []).reduce((s, m) => s + Number(m.cost || 0), 0) +
      (repair ?? []).reduce((s, r) => s + Number(r.cost || 0), 0)
    setMaintenance(maintSum)

    setBilling((challans ?? []).reduce((s, c) => s + Number(c.total || 0), 0))
  }, [date])

  useEffect(() => {
    void loadSummary().catch((e: Error) => setError(e.message))
  }, [loadSummary])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  if (!isCeo) {
    return (
      <div className="screen">
        <p className="text-danger">Daily Factory Costing is CEO-only.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Daily Factory Costing</h1>
        <p className="text-muted">Daily P&amp;L · separate from Design-wise Costing</p>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'summary', label: 'Daily Summary' },
            { id: 'electricity', label: 'Electricity (GEB)' },
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
              <span className="text-muted">Electricity (GEB)</span>
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
                `Daily Factory Costing ${date}\nSalary ₹${salary.toFixed(0)}\nYarn ₹${yarnCost.toFixed(0)}\nElec ₹${electricity.toFixed(0)}\nMaint ₹${maintenance.toFixed(0)}\nExpense ₹${expense.toFixed(0)}\nBilling ₹${billing.toFixed(0)}\nProfit ₹${profit.toFixed(0)}`,
              )
            }
            onPrint={() =>
              printSummary(
                `Daily Factory Costing ${date}`,
                rowsToHtml([
                  ['Salary', salary.toFixed(0)],
                  ['Yarn', yarnCost.toFixed(0)],
                  ['Electricity (GEB)', electricity.toFixed(0)],
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
        <div className="form-stack">
          <p className="text-muted">
            Canonical meter entry is <strong>GEB Reading</strong> (Security / Reports). New readings are
            not entered here — this tab shows today&apos;s GEB figures used by Daily Factory Costing.
          </p>
          <div className="list">
            {gebRows.map((en) => (
              <article key={en.id} className="card-row surface">
                <strong>GEB · {en.reading_date}</strong>
                <div className="text-muted num">
                  Meter {en.meter_reading} · Units {en.unit_consumed} × ₹{en.rate_per_unit} = ₹
                  {Number(en.amount).toFixed(2)}
                </div>
              </article>
            ))}
            {!gebRows.length ? <p className="text-muted">No GEB reading for this date</p> : null}
          </div>
          {legacyElec.length ? (
            <>
              <h3 className="section-title">Legacy electricity entries (read-only)</h3>
              <div className="list">
                {legacyElec.map((en) => (
                  <article key={en.id} className="card-row surface">
                    <strong>{en.source} (LEGACY)</strong>
                    <div className="text-muted num">
                      {en.unit_kwh} kWh × ₹{en.rate_per_unit} = ₹{Number(en.total).toFixed(2)}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
    </div>
  )
}
