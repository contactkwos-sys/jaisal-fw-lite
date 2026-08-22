/**
 * Daily Costing & Profit / Loss — aggregate layer only.
 *
 * Reads canonical module tables. Does NOT create a parallel costing database.
 * Design-wise Costing (`design_costing*`) stays a separate DESI engine;
 * this module may reference its rates for valuation only.
 */

import { supabase } from './supabase'

export type CostSourceRef = {
  source: string
  table: string
  id?: string
  label: string
  amount: number
  method: string
}

export type DailyFactoryPnL = {
  date: string
  productionMeters: number
  productionValue: number
  dispatchMeters: number
  dispatchValue: number
  revenue: number
  salary: number
  electricity: number
  warpYarn: number
  weftYarn: number
  yarnTotal: number
  maintenance: number
  otherExpenses: number
  productionCost: number
  totalCost: number
  grossProfit: number
  netProfit: number
  sources: CostSourceRef[]
  gaps: string[]
}

export type ProductionPnLRow = {
  date: string
  machineNo: string
  productionMeters: number
  productionValue: number
  warpValue: number
  weftValue: number
  processingCost: number
  electricityAlloc: number
  salaryAlloc: number
  maintenanceAlloc: number
  otherAlloc: number
  totalProductionCost: number
  grossMargin: number
  profitLoss: number
}

export type DispatchPnLRow = {
  id: string
  dispatchDate: string
  challanNo: string
  party: string
  desi: string
  orderNo: string
  programNo: string
  meters: number
  rate: number
  salesValue: number
  productionCost: number
  otherCost: number
  dispatchCost: number
  grossMargin: number
  profitLoss: number
  rateSource: string
}

export type PeriodPnL = {
  from: string
  to: string
  label: string
  productionMeters: number
  dispatchMeters: number
  revenue: number
  totalCost: number
  netProfit: number
  days: DailyFactoryPnL[]
}

export type DashboardPnLCards = {
  today: DailyFactoryPnL
  mtd: PeriodPnL
}

function n(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function dayStart(date: string) {
  return `${date}T00:00:00`
}

function dayEnd(date: string) {
  return `${date}T23:59:59`
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`
}

function isPresentStatus(status: unknown): boolean {
  const s = String(status || '').toLowerCase()
  return s.includes('present') || s === 'completed' || s === 'on break' || s === 'half'
}

async function loadSalaryForDate(date: string): Promise<{ amount: number; sources: CostSourceRef[]; gaps: string[] }> {
  const sources: CostSourceRef[] = []
  const gaps: string[] = []
  const [{ data: att }, { data: rates }, { data: legacyRates }, { data: workers }] = await Promise.all([
    supabase.from('attendance').select('worker_id, status').eq('date', date),
    supabase.from('salary_rates').select('worker_id, daily_rate, monthly_rate, pay_type, status, effective_from').eq('status', 'Active'),
    supabase.from('payroll_rates').select('role_id, rate_per_day'),
    supabase.from('workers').select('id, role_id, department, full_name'),
  ])

  const presentIds = new Set(
    (att ?? []).filter((a) => isPresentStatus(a.status)).map((a) => a.worker_id as string),
  )

  const rateByWorker = new Map<string, number>()
  for (const r of rates ?? []) {
    const wid = r.worker_id as string
    let daily = n(r.daily_rate)
    if (daily <= 0 && n(r.monthly_rate) > 0) daily = n(r.monthly_rate) / 26
    if (daily > 0) rateByWorker.set(wid, daily)
  }

  const legacyByRole = new Map((legacyRates ?? []).map((r) => [r.role_id as string, n(r.rate_per_day)]))

  let amount = 0
  let usedLegacy = false
  for (const w of workers ?? []) {
    if (!presentIds.has(w.id as string)) continue
    let daily = rateByWorker.get(w.id as string) || 0
    let method = 'HR salary_rates × attendance'
    let table = 'salary_rates'
    if (daily <= 0 && w.role_id) {
      daily = legacyByRole.get(w.role_id as string) || 0
      if (daily > 0) {
        usedLegacy = true
        method = 'Legacy payroll_rates × attendance (fallback)'
        table = 'payroll_rates'
      }
    }
    if (daily <= 0) continue
    amount += daily
    sources.push({
      source: 'Salary',
      table,
      id: w.id as string,
      label: String(w.full_name || w.id),
      amount: daily,
      method,
    })
  }

  if (presentIds.size && amount === 0) {
    gaps.push('Present workers found but no HR salary_rates / payroll_rates mapped')
  }
  if (usedLegacy) {
    gaps.push('Some salary lines used legacy payroll_rates — migrate to HR salary_rates')
  }

  return { amount, sources, gaps }
}

async function loadElectricityForDate(date: string): Promise<{ amount: number; sources: CostSourceRef[]; gaps: string[] }> {
  const sources: CostSourceRef[] = []
  const gaps: string[] = []

  const { data: geb } = await supabase.from('geb_readings').select('id, reading_date, unit_consumed, rate_per_unit, amount').eq('reading_date', date)

  let amount = 0
  for (const g of geb ?? []) {
    const amt = n(g.amount) || n(g.unit_consumed) * n(g.rate_per_unit)
    amount += amt
    sources.push({
      source: 'Electricity',
      table: 'geb_readings',
      id: g.id as string,
      label: `GEB ${g.reading_date} · ${n(g.unit_consumed)} kWh`,
      amount: amt,
      method: 'geb_readings.amount (canonical meter)',
    })
  }

  if (amount <= 0) {
    const { data: elec } = await supabase
      .from('electricity_entries')
      .select('id, entry_date, source, unit_kwh, rate_per_unit, total')
      .eq('entry_date', date)
    for (const e of elec ?? []) {
      const amt = n(e.total)
      amount += amt
      sources.push({
        source: 'Electricity',
        table: 'electricity_entries',
        id: e.id as string,
        label: `${e.source || 'Meter'} (legacy)`,
        amount: amt,
        method: 'Legacy electricity_entries fallback — enter via GEB Readings going forward',
      })
    }
    if ((elec ?? []).length) {
      gaps.push('Electricity read from legacy electricity_entries — prefer GEB Readings')
    }
  }

  if (amount <= 0) gaps.push('No GEB / electricity reading for this date')
  return { amount, sources, gaps }
}

async function loadWarpYarnForDate(date: string): Promise<{ amount: number; kg: number; sources: CostSourceRef[]; gaps: string[] }> {
  const sources: CostSourceRef[] = []
  const gaps: string[] = []

  const [{ data: txns }, { data: purchases }] = await Promise.all([
    supabase
      .from('warp_yarn_transactions')
      .select('id, txn_date, pipe_no, txn_type, kg, machine_no, quality')
      .eq('txn_date', date)
      .ilike('txn_type', '%Issue to Machine%'),
    supabase.from('warp_yarn_purchases').select('yarn_quality, rate, purchase_date').order('purchase_date', { ascending: false }).limit(200),
  ])

  const rateByQuality = new Map<string, number>()
  for (const p of purchases ?? []) {
    const q = String(p.yarn_quality || '').toLowerCase()
    if (q && !rateByQuality.has(q) && n(p.rate) > 0) rateByQuality.set(q, n(p.rate))
  }
  const avgRate =
    (purchases ?? []).length > 0
      ? (purchases ?? []).reduce((s, p) => s + n(p.rate), 0) / (purchases ?? []).length
      : 0

  let amount = 0
  let kg = 0
  for (const t of txns ?? []) {
    const k = n(t.kg)
    kg += k
    const q = String(t.quality || '').toLowerCase()
    const rate = (q && rateByQuality.get(q)) || avgRate
    const amt = k * rate
    amount += amt
    sources.push({
      source: 'Warp Yarn',
      table: 'warp_yarn_transactions',
      id: t.id as string,
      label: `Issue ${t.pipe_no || ''} → ${t.machine_no || 'M?'} · ${k} kg`,
      amount: amt,
      method: rate
        ? `Actual issue kg × warp purchase rate (₹${rate.toFixed(2)}/kg)`
        : 'Issue kg recorded but no warp purchase rate found',
    })
  }

  if ((txns ?? []).length && avgRate <= 0) {
    gaps.push('Warp issues exist but no warp_yarn_purchases rate to value them')
  }

  return { amount, kg, sources, gaps }
}

async function loadWeftYarnForDate(date: string): Promise<{ amount: number; kg: number; sources: CostSourceRef[]; gaps: string[] }> {
  const sources: CostSourceRef[] = []
  const gaps: string[] = []

  const { data: issues } = await supabase
    .from('machine_weft_issues')
    .select('id, issue_no, issue_date, machine_no, din_number, total_issued_kg')
    .eq('issue_date', date)

  const issueIds = (issues ?? []).map((i) => i.id as string)
  const [{ data: items }, { data: stock }, { data: costingWeft }] = await Promise.all([
    issueIds.length
      ? supabase.from('machine_weft_issue_items').select('id, issue_id, colour_name, issued_kg, yarn_stock_id, costing_weft_id').in('issue_id', issueIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase.from('weft_yarn_stock').select('id, colour_name, rate_per_kg'),
    supabase.from('design_costing_weft').select('id, rate_per_kg').limit(500),
  ])

  const stockRate = new Map((stock ?? []).map((s) => [s.id as string, n(s.rate_per_kg)]))
  const costingRate = new Map((costingWeft ?? []).map((c) => [c.id as string, n(c.rate_per_kg)]))
  const issueMeta = new Map((issues ?? []).map((i) => [i.id as string, i]))

  let amount = 0
  let kg = 0
  for (const it of items ?? []) {
    const issued = n(it.issued_kg)
    kg += issued
    let rate = it.yarn_stock_id ? stockRate.get(it.yarn_stock_id as string) || 0 : 0
    let method = 'Weft issue kg × weft_yarn_stock.rate_per_kg'
    if (rate <= 0 && it.costing_weft_id) {
      rate = costingRate.get(it.costing_weft_id as string) || 0
      method = 'Weft issue kg × design_costing_weft.rate_per_kg (reference rate)'
    }
    const amt = issued * rate
    amount += amt
    const meta = issueMeta.get(it.issue_id as string)
    sources.push({
      source: 'Weft Yarn',
      table: 'machine_weft_issue_items',
      id: it.id as string,
      label: `${meta?.issue_no || 'Issue'} · ${it.colour_name || ''} · ${issued} kg`,
      amount: amt,
      method: rate > 0 ? method : 'Issued kg with no rate — gap',
    })
  }

  if ((issues ?? []).length && amount <= 0 && kg > 0) {
    gaps.push('Weft issued but stock/design rates missing — value shows 0')
  }

  return { amount, kg, sources, gaps }
}

async function loadMaintenanceForDate(date: string): Promise<{ amount: number; sources: CostSourceRef[]; gaps: string[] }> {
  const sources: CostSourceRef[] = []
  const [{ data: maint }, { data: repair }, { data: invoices }] = await Promise.all([
    supabase
      .from('maintenance_requests')
      .select('id, machine_no, cost, created_at')
      .gte('created_at', dayStart(date))
      .lte('created_at', dayEnd(date)),
    supabase
      .from('repairing_tracker')
      .select('id, machine_no, cost, created_at')
      .gte('created_at', dayStart(date))
      .lte('created_at', dayEnd(date)),
    supabase
      .from('maintenance_repair_invoices')
      .select('id, vendor_name, grand_total, invoice_date')
      .eq('invoice_date', date),
  ])

  let amount = 0
  for (const m of maint ?? []) {
    const amt = n(m.cost)
    amount += amt
    sources.push({
      source: 'Maintenance',
      table: 'maintenance_requests',
      id: m.id as string,
      label: `Maint ${m.machine_no || ''}`,
      amount: amt,
      method: 'Machine-wise maintenance_requests.cost',
    })
  }
  for (const r of repair ?? []) {
    const amt = n(r.cost)
    amount += amt
    sources.push({
      source: 'Repair',
      table: 'repairing_tracker',
      id: r.id as string,
      label: `Repair ${r.machine_no || ''}`,
      amount: amt,
      method: 'repairing_tracker.cost',
    })
  }
  for (const inv of invoices ?? []) {
    const amt = n(inv.grand_total)
    amount += amt
    sources.push({
      source: 'Repair Invoice',
      table: 'maintenance_repair_invoices',
      id: inv.id as string,
      label: inv.vendor_name || 'Repair invoice',
      amount: amt,
      method: 'maintenance_repair_invoices.grand_total',
    })
  }

  return { amount, sources, gaps: [] }
}

async function loadOtherExpensesForDate(date: string): Promise<{ amount: number; sources: CostSourceRef[]; gaps: string[] }> {
  const sources: CostSourceRef[] = []
  const [{ data: cash }, { data: general }, { data: maintIn }] = await Promise.all([
    supabase
      .from('cashbook_entries')
      .select('id, entry_date, entry_type, category, party_name, amount')
      .eq('entry_date', date)
      .eq('entry_type', 'debit'),
    supabase
      .from('general_purchases')
      .select('id, party_name, grand_total, created_at')
      .gte('created_at', dayStart(date))
      .lte('created_at', dayEnd(date)),
    supabase
      .from('maintenance_inward')
      .select('id, party_name, grand_total, created_at')
      .gte('created_at', dayStart(date))
      .lte('created_at', dayEnd(date)),
  ])

  let amount = 0
  for (const c of cash ?? []) {
    // Skip owner deposits / non-operating if credit already filtered; debit Machine Repair counted in maint if desired —
    // include Tempo/Transport, Beam Supplier, Other as other factory expense; Machine Repair also here if not in maint tables
    const amt = n(c.amount)
    amount += amt
    sources.push({
      source: 'Cash Expense',
      table: 'cashbook_entries',
      id: c.id as string,
      label: `${c.category} · ${c.party_name}`,
      amount: amt,
      method: 'cashbook_entries debit',
    })
  }
  for (const g of general ?? []) {
    const amt = n(g.grand_total)
    amount += amt
    sources.push({
      source: 'General Purchase',
      table: 'general_purchases',
      id: g.id as string,
      label: g.party_name || 'General',
      amount: amt,
      method: 'general_purchases.grand_total',
    })
  }
  for (const m of maintIn ?? []) {
    const amt = n(m.grand_total)
    amount += amt
    sources.push({
      source: 'Maint Inward',
      table: 'maintenance_inward',
      id: m.id as string,
      label: m.party_name || 'Maint inward',
      amount: amt,
      method: 'maintenance_inward.grand_total',
    })
  }

  return { amount, sources, gaps: [] }
}

async function loadProductionForDate(date: string) {
  const { data: prod } = await supabase
    .from('production_entries')
    .select('id, machine_no, entry_date, total_meter, program_id, shift')
    .eq('entry_date', date)
  const meters = (prod ?? []).reduce((s, p) => s + n(p.total_meter), 0)
  return { rows: prod ?? [], meters }
}

async function loadDispatchForDate(date: string) {
  const { data: challans } = await supabase
    .from('challans')
    .select('id, challan_no, party, meter, rate, total, program_id, design_no, created_at')
    .gte('created_at', dayStart(date))
    .lte('created_at', dayEnd(date))
  return challans ?? []
}

async function avgDesignCostPerMtr(): Promise<number> {
  const { data } = await supabase
    .from('design_costing')
    .select('final_cost_per_mtr')
    .not('final_cost_per_mtr', 'is', null)
    .order('costing_date', { ascending: false })
    .limit(50)
  const vals = (data ?? []).map((r) => n(r.final_cost_per_mtr)).filter((v) => v > 0)
  if (!vals.length) return 0
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

export async function loadDailyFactoryPnL(date: string): Promise<DailyFactoryPnL> {
  const [
    salary,
    electricity,
    warp,
    weft,
    maintenance,
    other,
    production,
    challans,
    avgCostMtr,
  ] = await Promise.all([
    loadSalaryForDate(date),
    loadElectricityForDate(date),
    loadWarpYarnForDate(date),
    loadWeftYarnForDate(date),
    loadMaintenanceForDate(date),
    loadOtherExpensesForDate(date),
    loadProductionForDate(date),
    loadDispatchForDate(date),
    avgDesignCostPerMtr(),
  ])

  const dispatchMeters = challans.reduce((s, c) => s + n(c.meter), 0)
  const dispatchValue = challans.reduce((s, c) => s + n(c.total), 0)
  const productionMeters = production.meters
  const productionValue = productionMeters * avgCostMtr

  const yarnTotal = warp.amount + weft.amount
  const productionCost = yarnTotal + electricity.amount + salary.amount + maintenance.amount
  const totalCost = productionCost + other.amount
  const revenue = dispatchValue
  const grossProfit = revenue - productionCost
  const netProfit = revenue - totalCost

  const sources = [
    ...salary.sources,
    ...electricity.sources,
    ...warp.sources,
    ...weft.sources,
    ...maintenance.sources,
    ...other.sources,
  ]

  const gaps = [
    ...salary.gaps,
    ...electricity.gaps,
    ...warp.gaps,
    ...weft.gaps,
    ...maintenance.gaps,
    ...other.gaps,
  ]
  if (productionMeters > 0 && avgCostMtr <= 0) {
    gaps.push('Production meters exist but no Design-wise final_cost_per_mtr to value production')
  }

  return {
    date,
    productionMeters,
    productionValue,
    dispatchMeters,
    dispatchValue,
    revenue,
    salary: salary.amount,
    electricity: electricity.amount,
    warpYarn: warp.amount,
    weftYarn: weft.amount,
    yarnTotal,
    maintenance: maintenance.amount,
    otherExpenses: other.amount,
    productionCost,
    totalCost,
    grossProfit,
    netProfit,
    sources,
    gaps,
  }
}

export async function loadProductionPnL(date: string): Promise<ProductionPnLRow[]> {
  const factory = await loadDailyFactoryPnL(date)
  const { rows } = await loadProductionForDate(date)
  const totalM = factory.productionMeters
  const byMachine = new Map<string, number>()
  for (const r of rows) {
    const m = String(r.machine_no || '—')
    byMachine.set(m, (byMachine.get(m) || 0) + n(r.total_meter))
  }

  const avgCostMtr =
    factory.productionMeters > 0 ? factory.productionValue / factory.productionMeters : 0

  return [...byMachine.entries()].map(([machineNo, meters]) => {
    const share = totalM > 0 ? meters / totalM : 0
    const electricityAlloc = factory.electricity * share
    const salaryAlloc = factory.salary * share
    const maintenanceAlloc = factory.maintenance * share
    const otherAlloc = factory.otherExpenses * share
    const warpValue = factory.warpYarn * share
    const weftValue = factory.weftYarn * share
    const processingCost = 0
    const productionValue = meters * avgCostMtr
    const totalProductionCost =
      warpValue + weftValue + processingCost + electricityAlloc + salaryAlloc + maintenanceAlloc + otherAlloc
    return {
      date,
      machineNo,
      productionMeters: meters,
      productionValue,
      warpValue,
      weftValue,
      processingCost,
      electricityAlloc,
      salaryAlloc,
      maintenanceAlloc,
      otherAlloc,
      totalProductionCost,
      grossMargin: productionValue - totalProductionCost,
      profitLoss: productionValue - totalProductionCost,
    }
  })
}

export async function loadDispatchPnL(date: string): Promise<DispatchPnLRow[]> {
  const factory = await loadDailyFactoryPnL(date)
  const challans = await loadDispatchForDate(date)
  const costPerMtr =
    factory.productionMeters > 0
      ? factory.productionCost / factory.productionMeters
      : factory.dispatchMeters > 0
        ? factory.productionCost / factory.dispatchMeters
        : 0

  const programIds = [...new Set(challans.map((c) => c.program_id).filter(Boolean))] as string[]
  const { data: programs } = programIds.length
    ? await supabase.from('programs').select('id, order_item_id, din_number, program_no').in('id', programIds)
    : { data: [] as Array<Record<string, unknown>> }

  const progMap = new Map((programs ?? []).map((p) => [p.id as string, p]))

  const orderItemIds = [...new Set((programs ?? []).map((p) => p.order_item_id).filter(Boolean))] as string[]
  const { data: orderItems } = orderItemIds.length
    ? await supabase.from('order_book_items').select('id, order_id, design_no, rate').in('id', orderItemIds)
    : { data: [] as Array<Record<string, unknown>> }
  const itemMap = new Map((orderItems ?? []).map((i) => [i.id as string, i]))

  const orderIds = [...new Set((orderItems ?? []).map((i) => i.order_id).filter(Boolean))] as string[]
  const { data: orders } = orderIds.length
    ? await supabase.from('order_book').select('id').in('id', orderIds)
    : { data: [] as Array<Record<string, unknown>> }
  void orders

  return challans.map((c) => {
    const prog = c.program_id ? progMap.get(c.program_id as string) : undefined
    const item = prog?.order_item_id ? itemMap.get(prog.order_item_id as string) : undefined
    const rateFromOrder = item ? n(item.rate) : 0
    const rate = n(c.rate) || rateFromOrder
    const meters = n(c.meter)
    const salesValue = n(c.total) || meters * rate * 1.05
    const productionCost = meters * costPerMtr
    const otherCost = 0
    const dispatchCost = 0
    return {
      id: c.id as string,
      dispatchDate: date,
      challanNo: String(c.challan_no || ''),
      party: String(c.party || ''),
      desi: String(c.design_no || prog?.din_number || item?.design_no || '—'),
      orderNo: item?.order_id ? String(item.order_id).slice(0, 8) : '—',
      programNo: prog?.program_no ? String(prog.program_no) : c.program_id ? String(c.program_id).slice(0, 8) : '—',
      meters,
      rate,
      salesValue,
      productionCost,
      otherCost,
      dispatchCost,
      grossMargin: salesValue - productionCost - otherCost - dispatchCost,
      profitLoss: salesValue - productionCost - otherCost - dispatchCost,
      rateSource: n(c.rate) > 0 ? 'challans.rate (dispatch flow)' : rateFromOrder > 0 ? 'order_book_items.rate' : 'no rate',
    }
  })
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export async function loadPeriodPnL(from: string, to: string, label: string): Promise<PeriodPnL> {
  const dates = eachDate(from, to)
  // Cap to avoid runaway queries for huge ranges
  const limited = dates.slice(-62)
  const days: DailyFactoryPnL[] = []
  for (const date of limited) {
    days.push(await loadDailyFactoryPnL(date))
  }
  return {
    from: limited[0] || from,
    to: limited[limited.length - 1] || to,
    label,
    productionMeters: days.reduce((s, d) => s + d.productionMeters, 0),
    dispatchMeters: days.reduce((s, d) => s + d.dispatchMeters, 0),
    revenue: days.reduce((s, d) => s + d.revenue, 0),
    totalCost: days.reduce((s, d) => s + d.totalCost, 0),
    netProfit: days.reduce((s, d) => s + d.netProfit, 0),
    days,
  }
}

export async function loadMtdPnL(asOf: string): Promise<PeriodPnL> {
  return loadPeriodPnL(monthStart(asOf), asOf, 'MTD')
}

export async function loadDashboardPnLCards(today: string): Promise<DashboardPnLCards> {
  const [day, mtd] = await Promise.all([loadDailyFactoryPnL(today), loadMtdPnL(today)])
  return { today: day, mtd }
}

export function inr(v: number): string {
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
