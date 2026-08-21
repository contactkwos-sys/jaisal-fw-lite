import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  inr,
  loadDailyFactoryPnL,
  loadDispatchPnL,
  loadMtdPnL,
  loadPeriodPnL,
  loadProductionPnL,
  type CostSourceRef,
  type DailyFactoryPnL,
  type DispatchPnLRow,
  type PeriodPnL,
  type ProductionPnLRow,
} from '../lib/dailyCosting'
import { todayISO } from '../lib/mutate'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'

type Sub = 'factory' | 'production' | 'dispatch' | 'mtd' | 'monthly' | 'sources'
type Props = {
  initialSub?: Sub | 'summary' | 'electricity'
  onOpenGeb?: () => void
}

/**
 * Daily Costing & Profit / Loss — factory financial performance.
 * Aggregates canonical module data. Design-wise Costing remains separate.
 */
export function CostingScreen({ initialSub = 'factory', onOpenGeb }: Props) {
  const { isCeo } = useAuth()
  const mappedInitial: Sub =
    initialSub === 'summary' || initialSub === 'electricity' ? 'factory' : (initialSub as Sub)
  const [sub, setSub] = useState<Sub>(mappedInitial)
  const [date, setDate] = useState(todayISO())
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [factory, setFactory] = useState<DailyFactoryPnL | null>(null)
  const [production, setProduction] = useState<ProductionPnLRow[]>([])
  const [dispatch, setDispatch] = useState<DispatchPnLRow[]>([])
  const [mtd, setMtd] = useState<PeriodPnL | null>(null)
  const [monthly, setMonthly] = useState<PeriodPnL | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      if (sub === 'factory' || sub === 'sources') {
        const f = await loadDailyFactoryPnL(date)
        setFactory(f)
      }
      if (sub === 'production') {
        const [f, rows] = await Promise.all([loadDailyFactoryPnL(date), loadProductionPnL(date)])
        setFactory(f)
        setProduction(rows)
      }
      if (sub === 'dispatch') {
        const [f, rows] = await Promise.all([loadDailyFactoryPnL(date), loadDispatchPnL(date)])
        setFactory(f)
        setDispatch(rows)
      }
      if (sub === 'mtd') {
        setMtd(await loadMtdPnL(date))
      }
      if (sub === 'monthly') {
        const from = `${month}-01`
        const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
        const to = last.toISOString().slice(0, 10)
        setMonthly(await loadPeriodPnL(from, to, `Month ${month}`))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Daily Costing')
    } finally {
      setBusy(false)
    }
  }, [date, month, sub])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setSub(mappedInitial)
  }, [mappedInitial])

  const filteredSources: CostSourceRef[] = useMemo(() => {
    const all = factory?.sources ?? []
    if (sourceFilter === 'all') return all
    return all.filter((s) => s.source.toLowerCase().includes(sourceFilter.toLowerCase()))
  }, [factory, sourceFilter])

  if (!isCeo) {
    return (
      <div className="screen">
        <p className="text-danger">Daily Costing &amp; Profit / Loss is CEO-only.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Daily Costing &amp; Profit / Loss</h1>
        <p className="text-muted" style={{ marginTop: 4 }}>
          Factory financial performance · aggregates live modules · Design-wise Costing stays separate
        </p>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'factory', label: 'Daily Factory P&L' },
            { id: 'production', label: 'Production P&L' },
            { id: 'dispatch', label: 'Dispatch P&L' },
            { id: 'mtd', label: 'MTD P&L' },
            { id: 'monthly', label: 'Monthly P&L' },
            { id: 'sources', label: 'Cost Breakdown' },
          ]}
        />
        {sub === 'monthly' ? (
          <label className="field">
            <span className="text-muted">Month</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        ) : (
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
      </header>

      {busy ? <p className="text-muted">Loading…</p> : null}
      {error ? <p className="form-error text-danger">{error}</p> : null}

      {sub === 'factory' && factory ? <FactoryView factory={factory} onOpenGeb={onOpenGeb} onOpenSources={() => setSub('sources')} /> : null}
      {sub === 'production' ? <ProductionView rows={production} factory={factory} /> : null}
      {sub === 'dispatch' ? <DispatchView rows={dispatch} /> : null}
      {sub === 'mtd' && mtd ? <PeriodView period={mtd} /> : null}
      {sub === 'monthly' && monthly ? <PeriodView period={monthly} /> : null}
      {sub === 'sources' && factory ? (
        <SourcesView
          factory={factory}
          filter={sourceFilter}
          onFilter={setSourceFilter}
          rows={filteredSources}
          onOpenGeb={onOpenGeb}
        />
      ) : null}
    </div>
  )
}

function FactoryView({
  factory,
  onOpenGeb,
  onOpenSources,
}: {
  factory: DailyFactoryPnL
  onOpenGeb?: () => void
  onOpenSources: () => void
}) {
  return (
    <div className="form-stack">
      <div className="kpi-grid">
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Production m</span>
          <strong className="num">{factory.productionMeters.toFixed(0)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Production Value</span>
          <strong className="num">{inr(factory.productionValue)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Dispatch m</span>
          <strong className="num">{factory.dispatchMeters.toFixed(0)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Revenue (Billing)</span>
          <strong className="num">{inr(factory.revenue)}</strong>
        </button>
      </div>

      <div className="kpi-grid">
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Salary</span>
          <strong className="num">{inr(factory.salary)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenGeb}>
          <span className="text-muted">Electricity (GEB)</span>
          <strong className="num">{inr(factory.electricity)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Warp Yarn</span>
          <strong className="num">{inr(factory.warpYarn)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Weft Yarn</span>
          <strong className="num">{inr(factory.weftYarn)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Maintenance / Repair</span>
          <strong className="num">{inr(factory.maintenance)}</strong>
        </button>
        <button type="button" className="kpi-card surface" onClick={onOpenSources}>
          <span className="text-muted">Other Expenses</span>
          <strong className="num">{inr(factory.otherExpenses)}</strong>
        </button>
      </div>

      <div className="profit-panel surface">
        <div>
          <span className="text-muted">Production Cost</span>
          <div className="num">{inr(factory.productionCost)}</div>
        </div>
        <div>
          <span className="text-muted">Total Cost</span>
          <div className="num">{inr(factory.totalCost)}</div>
        </div>
        <div>
          <span className="text-muted">Gross Profit</span>
          <div className={`num ${factory.grossProfit >= 0 ? 'text-sage' : 'text-danger'}`}>
            {inr(factory.grossProfit)}
          </div>
        </div>
        <div>
          <span className="text-muted">Net Operating P&amp;L</span>
          <div className={`num ${factory.netProfit >= 0 ? 'text-sage' : 'text-danger'}`}>
            {inr(factory.netProfit)}
          </div>
        </div>
      </div>

      <div className="surface" style={{ padding: 12 }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>
          Daily Factory P&amp;L
        </h3>
        <p className="text-muted" style={{ marginBottom: 8 }}>
          Today&apos;s Dispatch (Revenue) − Today&apos;s actual operating costs = Daily Profit / Loss
        </p>
        <ul className="text-muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Revenue {inr(factory.revenue)}</li>
          <li>− Production Cost {inr(factory.productionCost)}</li>
          <li>− Other Expenses {inr(factory.otherExpenses)}</li>
          <li>
            = Net {inr(factory.netProfit)}
          </li>
        </ul>
      </div>

      {factory.gaps.length ? (
        <div className="surface" style={{ padding: 12 }}>
          <strong>Data gaps (not silent estimates)</strong>
          <ul>
            {factory.gaps.map((g) => (
              <li key={g} className="text-muted">
                {g}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-muted">
        Electricity entry lives in <strong>GEB Readings</strong>
        {onOpenGeb ? (
          <>
            {' '}
            —{' '}
            <button type="button" className="linkish" onClick={onOpenGeb}>
              Open GEB
            </button>
          </>
        ) : null}
        . This screen only reads meter cost.
      </p>

      <ShareActions
        onWhatsApp={() =>
          shareWhatsApp(
            `Daily Costing ${factory.date}\nRevenue ${inr(factory.revenue)}\nSalary ${inr(factory.salary)}\nElec ${inr(factory.electricity)}\nWarp ${inr(factory.warpYarn)}\nWeft ${inr(factory.weftYarn)}\nMaint ${inr(factory.maintenance)}\nOther ${inr(factory.otherExpenses)}\nTotal Cost ${inr(factory.totalCost)}\nNet P&L ${inr(factory.netProfit)}`,
          )
        }
        onPrint={() =>
          printSummary(
            `Daily Factory P&L ${factory.date}`,
            rowsToHtml([
              ['Revenue', factory.revenue.toFixed(0)],
              ['Salary', factory.salary.toFixed(0)],
              ['Electricity', factory.electricity.toFixed(0)],
              ['Warp Yarn', factory.warpYarn.toFixed(0)],
              ['Weft Yarn', factory.weftYarn.toFixed(0)],
              ['Maintenance', factory.maintenance.toFixed(0)],
              ['Other', factory.otherExpenses.toFixed(0)],
              ['Total Cost', factory.totalCost.toFixed(0)],
              ['Gross Profit', factory.grossProfit.toFixed(0)],
              ['Net P&L', factory.netProfit.toFixed(0)],
            ]),
          )
        }
      />
    </div>
  )
}

function ProductionView({ rows, factory }: { rows: ProductionPnLRow[]; factory: DailyFactoryPnL | null }) {
  return (
    <div className="form-stack">
      {factory ? (
        <p className="text-muted">
          Allocations use production-meter share of factory costs for {factory.date}. Yarn valued from
          actual warp/weft issues.
        </p>
      ) : null}
      <div className="list">
        {rows.length === 0 ? <p className="text-muted">No production entries for this date.</p> : null}
        {rows.map((r) => (
          <article key={r.machineNo} className="card-row surface">
            <strong>
              Machine {r.machineNo} · {r.productionMeters.toFixed(0)} m
            </strong>
            <div className="text-muted num">
              Value {inr(r.productionValue)} · Warp {inr(r.warpValue)} · Weft {inr(r.weftValue)} · Elec{' '}
              {inr(r.electricityAlloc)} · Salary {inr(r.salaryAlloc)} · Maint {inr(r.maintenanceAlloc)} ·
              Other {inr(r.otherAlloc)}
            </div>
            <div className={`num ${r.profitLoss >= 0 ? 'text-sage' : 'text-danger'}`}>
              Cost {inr(r.totalProductionCost)} · P&amp;L {inr(r.profitLoss)}
            </div>
          </article>
        ))}
      </div>
      <ShareActions
        onWhatsApp={() =>
          shareWhatsApp(
            `Production P&L ${factory?.date || ''}\n` +
              rows
                .map((r) => `${r.machineNo}: ${r.productionMeters.toFixed(0)}m · P&L ${inr(r.profitLoss)}`)
                .join('\n'),
          )
        }
        onPrint={() =>
          printSummary(
            `Production-wise P&L ${factory?.date || ''}`,
            rowsToHtml(
              rows.map((r) => [
                `${r.machineNo} · ${r.productionMeters.toFixed(0)} m`,
                `Cost ${r.totalProductionCost.toFixed(0)} · P&L ${r.profitLoss.toFixed(0)}`,
              ]),
            ),
          )
        }
      />
    </div>
  )
}

function DispatchView({ rows }: { rows: DispatchPnLRow[] }) {
  return (
    <div className="form-stack">
      <p className="text-muted">Rate comes from challan / approved order flow — not re-entered here.</p>
      <div className="list">
        {rows.length === 0 ? <p className="text-muted">No dispatches (challans) for this date.</p> : null}
        {rows.map((r) => (
          <article key={r.id} className="card-row surface">
            <strong>
              {r.challanNo} · {r.party}
            </strong>
            <div className="text-muted">
              DESI {r.desi} · Order {r.orderNo} · Program {r.programNo}
            </div>
            <div className="text-muted num">
              {r.meters.toFixed(0)} m × ₹{r.rate.toFixed(2)} = {inr(r.salesValue)} · rate: {r.rateSource}
            </div>
            <div className={`num ${r.profitLoss >= 0 ? 'text-sage' : 'text-danger'}`}>
              Prod cost {inr(r.productionCost)} · Margin {inr(r.grossMargin)}
            </div>
          </article>
        ))}
      </div>
      <ShareActions
        onWhatsApp={() =>
          shareWhatsApp(
            `Dispatch P&L\n` +
              rows.map((r) => `${r.challanNo} ${r.party}: ${inr(r.salesValue)} · P&L ${inr(r.profitLoss)}`).join('\n'),
          )
        }
        onPrint={() =>
          printSummary(
            'Dispatch-wise P&L',
            rowsToHtml(
              rows.map((r) => [
                `${r.challanNo} · ${r.party} · ${r.meters.toFixed(0)} m`,
                `Sales ${r.salesValue.toFixed(0)} · P&L ${r.profitLoss.toFixed(0)}`,
              ]),
            ),
          )
        }
      />
    </div>
  )
}

function PeriodView({ period }: { period: PeriodPnL }) {
  return (
    <div className="form-stack">
      <div className="profit-panel surface">
        <div>
          <span className="text-muted">{period.label} Production</span>
          <div className="num">{period.productionMeters.toFixed(0)} m</div>
        </div>
        <div>
          <span className="text-muted">{period.label} Dispatch</span>
          <div className="num">{period.dispatchMeters.toFixed(0)} m</div>
        </div>
        <div>
          <span className="text-muted">{period.label} Revenue</span>
          <div className="num">{inr(period.revenue)}</div>
        </div>
        <div>
          <span className="text-muted">{period.label} Cost</span>
          <div className="num">{inr(period.totalCost)}</div>
        </div>
        <div>
          <span className="text-muted">{period.label} P&amp;L</span>
          <div className={`num ${period.netProfit >= 0 ? 'text-sage' : 'text-danger'}`}>
            {inr(period.netProfit)}
          </div>
        </div>
      </div>
      <p className="text-muted">
        Range {period.from} → {period.to} · {period.days.length} day(s) aggregated from daily factory P&amp;L
      </p>
      <ShareActions
        onWhatsApp={() =>
          shareWhatsApp(
            `${period.label} P&L ${period.from}–${period.to}\nRevenue ${inr(period.revenue)}\nCost ${inr(period.totalCost)}\nNet ${inr(period.netProfit)}`,
          )
        }
        onPrint={() =>
          printSummary(
            `${period.label} P&L`,
            rowsToHtml([
              ['From', period.from],
              ['To', period.to],
              ['Revenue', period.revenue.toFixed(0)],
              ['Cost', period.totalCost.toFixed(0)],
              ['Net P&L', period.netProfit.toFixed(0)],
            ]),
          )
        }
      />
    </div>
  )
}

function SourcesView({
  factory,
  filter,
  onFilter,
  rows,
  onOpenGeb,
}: {
  factory: DailyFactoryPnL
  filter: string
  onFilter: (v: string) => void
  rows: CostSourceRef[]
  onOpenGeb?: () => void
}) {
  return (
    <div className="form-stack">
      <p className="text-muted">
        Drill-down to source transactions. Every amount shows table + method. No silent estimates.
      </p>
      <label className="field">
        <span className="text-muted">Filter</span>
        <select value={filter} onChange={(e) => onFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="salary">Salary</option>
          <option value="electricity">Electricity</option>
          <option value="warp">Warp</option>
          <option value="weft">Weft</option>
          <option value="maint">Maintenance</option>
          <option value="repair">Repair</option>
          <option value="cash">Cash</option>
          <option value="general">General</option>
        </select>
      </label>
      {onOpenGeb ? (
        <button type="button" className="primary-save" onClick={onOpenGeb}>
          Open GEB Readings (electricity entry)
        </button>
      ) : null}
      <div className="list">
        {rows.length === 0 ? <p className="text-muted">No source lines for this filter.</p> : null}
        {rows.map((r, i) => (
          <article key={`${r.table}-${r.id || i}`} className="card-row surface">
            <strong>
              {r.source}: {inr(r.amount)}
            </strong>
            <div>{r.label}</div>
            <div className="text-muted">
              {r.table}
              {r.id ? ` · ${r.id.slice(0, 8)}` : ''} · {r.method}
            </div>
          </article>
        ))}
      </div>
      <ShareActions
        onPrint={() =>
          printSummary(
            `Cost Breakdown ${factory.date}`,
            rowsToHtml(rows.map((r) => [`${r.source} · ${r.label}`, `${r.amount.toFixed(0)} · ${r.table} · ${r.method}`])),
          )
        }
      />
    </div>
  )
}
