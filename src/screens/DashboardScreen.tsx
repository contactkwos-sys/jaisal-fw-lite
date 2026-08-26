import { useCallback, useEffect, useState } from 'react'
import type { AppScreen, NavTarget } from '../lib/nav'
import {
  WEFT_LOW_STOCK_KG,
  type BeamPipeStock,
  type WeftYarnStock,
} from '../lib/database.types'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { ApprovalsWidget } from '../components/ApprovalsWidget'
import { PendingOrdersWidget } from './OrdersPendingScreen'
import { NotebookDashboardWidget } from './NotebookScreen'
import { inr, loadDashboardPnLCards } from '../lib/dailyCosting'

type Props = {
  onNavigate: (t: NavTarget) => void
}

type Kpis = {
  attendanceToday: number
  warpBeamStock: number
  weftYarnStock: number
  greigeToday: number
  dispatchToday: number
  pendingDin: number
  pendingSamples: number
  pendingOrders: number
  openBreakdowns: number
}

type Alerts = {
  beamPending: number
  weftLow: number
  repairOut: number
  programPending: number
  gatepassPending: number
}

type Flow = {
  warpIn: number
  weftBuy: number
  production: number
  folding: number
  dispatch: number
  inwardSpend: number
}

type InwardRow = {
  id: string
  type: string
  party: string
  amount: number
  when: string
}

type MachineRow = {
  machine: string
  meters: number
  entries: number
}

export function DashboardScreen({ onNavigate }: Props) {
  const { isCeo, profile } = useAuth()
  const [kpis, setKpis] = useState<Kpis>({
    attendanceToday: 0,
    warpBeamStock: 0,
    weftYarnStock: 0,
    greigeToday: 0,
    dispatchToday: 0,
    pendingDin: 0,
    pendingSamples: 0,
    pendingOrders: 0,
    openBreakdowns: 0,
  })
  const [alerts, setAlerts] = useState<Alerts>({
    beamPending: 0,
    weftLow: 0,
    repairOut: 0,
    programPending: 0,
    gatepassPending: 0,
  })
  const [flow, setFlow] = useState<Flow>({
    warpIn: 0,
    weftBuy: 0,
    production: 0,
    folding: 0,
    dispatch: 0,
    inwardSpend: 0,
  })
  const [beams, setBeams] = useState<BeamPipeStock[]>([])
  const [yarns, setYarns] = useState<WeftYarnStock[]>([])
  const [recentInward, setRecentInward] = useState<InwardRow[]>([])
  const [topMachines, setTopMachines] = useState<MachineRow[]>([])
  const [pnlToday, setPnlToday] = useState({
    productionMeters: 0,
    productionValue: 0,
    dispatchMeters: 0,
    dispatchValue: 0,
    totalCost: 0,
    grossProfit: 0,
    netProfit: 0,
  })
  const [pnlMtd, setPnlMtd] = useState({
    productionMeters: 0,
    dispatchMeters: 0,
    revenue: 0,
    totalCost: 0,
    netProfit: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const today = todayISO()

  const load = useCallback(async () => {
    const [
      att,
      beamStock,
      weftStock,
      prod,
      fold,
      challan,
      beamOut,
      repair,
      jobs,
      gp,
      warpIn,
      weftBuy,
      generalBuy,
      maintIn,
      repairInv,
      recentGeneral,
      recentWeft,
      recentMaint,
      prodByMachine,
    ] = await Promise.all([
      supabase.from('attendance').select('id, status').eq('date', today),
      supabase.from('beam_pipe_stock').select('*'),
      supabase.from('weft_yarn_stock').select('*'),
      supabase.from('production_entries').select('total_meter').eq('entry_date', today),
      supabase.from('folding_entries').select('meter_folded').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase.from('challans').select('meter, total').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase.from('beam_pipe_out').select('id', { count: 'exact', head: true }).eq('status', 'pending_return'),
      supabase.from('repairing_tracker').select('id', { count: 'exact', head: true }).eq('status', 'out'),
      supabase.from('job_cards').select('id, dno, created_at'),
      supabase.from('gatepass').select('id', { count: 'exact', head: true }).or('driver_signed.eq.false,received_signed.eq.false'),
      supabase.from('warp_yarn_inward').select('qty_kg').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase.from('weft_purchases').select('weight_kg, grand_total').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase.from('general_purchases').select('grand_total').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase.from('maintenance_inward').select('grand_total').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase.from('maintenance_repair_invoices').select('grand_total').gte('created_at', `${today}T00:00:00`).lte('created_at', `${today}T23:59:59`),
      supabase
        .from('general_purchases')
        .select('id, party_name, grand_total, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('weft_purchases')
        .select('id, party_name, supplier, grand_total, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase
        .from('maintenance_inward')
        .select('id, party_name, grand_total, created_at')
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.from('production_entries').select('machine_no, total_meter').eq('entry_date', today),
    ])

    // Optional module tables — never fail the whole dashboard if migrations lag
    const [dinsRes, samplesRes, orderBookRes, maintOpenRes] = await Promise.all([
      supabase.from('dins').select('id, status').limit(500),
      supabase.from('sample_job_cards').select('id, status').limit(500),
      supabase.from('order_book').select('id, status').limit(500),
      supabase.from('maintenance_requests').select('id, status, resolved_at').limit(500),
    ])

    const dins = dinsRes.error ? [] : (dinsRes.data ?? [])
    const samples = samplesRes.error ? [] : (samplesRes.data ?? [])
    const orderBook = orderBookRes.error ? [] : (orderBookRes.data ?? [])
    const maintOpen = maintOpenRes.error ? [] : (maintOpenRes.data ?? [])

    const present = (att.data ?? []).filter((a) => {
      const s = String(a.status || '').toLowerCase()
      return s.includes('present') || s === 'completed' || s === 'on break'
    }).length

    const beamPcs = (beamStock.data as BeamPipeStock[] | null)?.reduce((s, b) => s + Number(b.quantity_pcs || 0), 0) ?? 0
    const weftKg = (weftStock.data as WeftYarnStock[] | null)?.reduce((s, y) => s + Number(y.stock_kg || 0), 0) ?? 0
    const greige = (prod.data ?? []).reduce((s, p) => s + Number(p.total_meter || 0), 0)
    const dispatchM = (challan.data ?? []).reduce((s, c) => s + Number(c.meter || 0), 0)

    const pendingDin = dins.filter((d: { status?: string | null }) => {
      const st = String(d.status || '').toLowerCase()
      return !st.includes('closed') && !st.includes('cancelled') && !st.includes('dispatched')
    }).length

    const pendingSamples = samples.filter((s: { status?: string | null }) => {
      const st = String(s.status || '').toLowerCase()
      return !st.includes('approved') && !st.includes('closed') && !st.includes('cancelled')
    }).length

    const pendingOrders = orderBook.filter((o: { status?: string | null }) => {
      const st = String(o.status || 'pending').toLowerCase()
      return st.includes('pending') || st === '' || st.includes('open')
    }).length

    const openBreakdowns = maintOpen.filter((m: { status?: string | null; resolved_at?: string | null }) => {
      if (m.resolved_at) return false
      const st = String(m.status || '').toLowerCase()
      return st !== 'resolved' && st !== 'closed'
    }).length

    setKpis({
      attendanceToday: present,
      warpBeamStock: beamPcs,
      weftYarnStock: weftKg,
      greigeToday: greige,
      dispatchToday: dispatchM,
      pendingDin,
      pendingSamples,
      pendingOrders,
      openBreakdowns,
    })
    setBeams((beamStock.data as BeamPipeStock[]) ?? [])
    setYarns((weftStock.data as WeftYarnStock[]) ?? [])

    const weftLow = (weftStock.data as WeftYarnStock[] | null)?.filter((y) => Number(y.stock_kg) < WEFT_LOW_STOCK_KG).length ?? 0

    // Program pending: job cards with no production entry same day (assumed heuristic)
    const jobIds = jobs.data ?? []
    let programPending = 0
    if (jobIds.length) {
      const { data: pe } = await supabase
        .from('production_entries')
        .select('machine_no, entry_date')
        .eq('entry_date', today)
      const machinesWithProd = new Set((pe ?? []).map((p) => p.machine_no))
      const todayJobs = jobIds.filter((j) => String(j.created_at || '').startsWith(today))
      programPending = Math.max(0, todayJobs.length - machinesWithProd.size)
    }

    setAlerts({
      beamPending: beamOut.count ?? 0,
      weftLow,
      repairOut: (repair.count ?? 0) + openBreakdowns,
      programPending,
      gatepassPending: gp.count ?? 0,
    })

    setFlow({
      warpIn: (warpIn.data ?? []).reduce((s, r) => s + Number(r.qty_kg || 0), 0),
      weftBuy: (weftBuy.data ?? []).reduce((s, r) => s + Number(r.weight_kg || 0), 0),
      production: greige,
      folding: (fold.data ?? []).reduce((s, r) => s + Number(r.meter_folded || 0), 0),
      dispatch: dispatchM,
      inwardSpend:
        (weftBuy.data ?? []).reduce((s, r) => s + Number(r.grand_total || 0), 0) +
        (generalBuy.data ?? []).reduce((s, r) => s + Number(r.grand_total || 0), 0) +
        (maintIn.data ?? []).reduce((s, r) => s + Number(r.grand_total || 0), 0) +
        (repairInv.data ?? []).reduce((s, r) => s + Number(r.grand_total || 0), 0),
    })

    const inwardRows: InwardRow[] = [
      ...(recentGeneral.data ?? []).map((r) => ({
        id: String(r.id),
        type: 'General',
        party: String(r.party_name || '—'),
        amount: Number(r.grand_total || 0),
        when: String(r.created_at || ''),
      })),
      ...(recentWeft.data ?? []).map((r) => ({
        id: String(r.id),
        type: 'Weft',
        party: String(r.party_name || r.supplier || '—'),
        amount: Number(r.grand_total || 0),
        when: String(r.created_at || ''),
      })),
      ...(recentMaint.data ?? []).map((r) => ({
        id: String(r.id),
        type: 'Maint',
        party: String(r.party_name || '—'),
        amount: Number(r.grand_total || 0),
        when: String(r.created_at || ''),
      })),
    ]
      .sort((a, b) => (a.when < b.when ? 1 : -1))
      .slice(0, 6)
    setRecentInward(inwardRows)

    const machineMap = new Map<string, MachineRow>()
    for (const row of prodByMachine.data ?? []) {
      const machine = String(row.machine_no || '—')
      const prev = machineMap.get(machine) || { machine, meters: 0, entries: 0 }
      prev.meters += Number(row.total_meter || 0)
      prev.entries += 1
      machineMap.set(machine, prev)
    }
    setTopMachines(
      [...machineMap.values()].sort((a, b) => b.meters - a.meters).slice(0, 6),
    )

    try {
      const pnl = await loadDashboardPnLCards(today)
      setPnlToday({
        productionMeters: pnl.today.productionMeters,
        productionValue: pnl.today.productionValue,
        dispatchMeters: pnl.today.dispatchMeters,
        dispatchValue: pnl.today.dispatchValue,
        totalCost: pnl.today.totalCost,
        grossProfit: pnl.today.grossProfit,
        netProfit: pnl.today.netProfit,
      })
      setPnlMtd({
        productionMeters: pnl.mtd.productionMeters,
        dispatchMeters: pnl.mtd.dispatchMeters,
        revenue: pnl.mtd.revenue,
        totalCost: pnl.mtd.totalCost,
        netProfit: pnl.mtd.netProfit,
      })
    } catch {
      // P&L cards are additive — do not fail the whole dashboard
    }
  }, [today])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function editBeam(row: BeamPipeStock) {
    if (!isCeo || !profile) return
    const qtyRaw = window.prompt(`Qty ${row.variety_name}`, String(row.quantity_pcs))
    if (qtyRaw == null) return
    const quantity_pcs = Number(qtyRaw)
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo: true,
        userId: profile.id,
        tableName: 'beam_pipe_stock',
        action: 'update',
        recordId: row.id,
        payload: { quantity_pcs },
        apply: async () => {
          const { error: err } = await supabase
            .from('beam_pipe_stock')
            .update({ quantity_pcs, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          if (err) throw err
        },
      })
      setMessage('Updated')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteBeam(row: BeamPipeStock) {
    if (!isCeo || !profile) return
    if (!window.confirm(`Delete ${row.variety_name}?`)) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo: true,
        userId: profile.id,
        tableName: 'beam_pipe_stock',
        action: 'delete',
        recordId: row.id,
        payload: { id: row.id },
        apply: async () => {
          const { error: err } = await supabase.from('beam_pipe_stock').delete().eq('id', row.id)
          if (err) throw err
        },
      })
      setMessage('Deleted')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function editYarn(row: WeftYarnStock) {
    if (!isCeo || !profile) return
    const stockRaw = window.prompt(`Stock kg ${row.colour_name ?? ''}`, String(row.stock_kg))
    if (stockRaw == null) return
    const stock_kg = Number(stockRaw)
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo: true,
        userId: profile.id,
        tableName: 'weft_yarn_stock',
        action: 'update',
        recordId: row.id,
        payload: { stock_kg },
        apply: async () => {
          const { error: err } = await supabase
            .from('weft_yarn_stock')
            .update({ stock_kg, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          if (err) throw err
        },
      })
      setMessage('Updated')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteYarn(row: WeftYarnStock) {
    if (!isCeo || !profile) return
    if (!window.confirm('Delete yarn row?')) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo: true,
        userId: profile.id,
        tableName: 'weft_yarn_stock',
        action: 'delete',
        recordId: row.id,
        payload: { id: row.id },
        apply: async () => {
          const { error: err } = await supabase.from('weft_yarn_stock').delete().eq('id', row.id)
          if (err) throw err
        },
      })
      setMessage('Deleted')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const quick: Array<{ label: string; screen: AppScreen; sub?: string; module?: import('../lib/nav').MainModuleId }> = [
    { label: 'Design Master', screen: 'dto-hub', module: 'design-to-order' },
    { label: 'Order to Program', screen: 'order-to-program', module: 'order-to-program' },
    { label: 'Design-wise Costing', screen: 'design-wise-costing', module: 'design-to-order' },
    { label: 'Daily Costing & P&L', screen: 'costing', sub: 'factory', module: 'reports' },
    { label: 'Program & Dispatch', screen: 'program-dispatch', sub: 'pto', module: 'program-dispatch' },
    { label: 'Warp Yarn Management', screen: 'warp-yarn', sub: 'overview', module: 'warp-yarn' },
    { label: 'Attendance & Payroll', screen: 'hr-payroll', sub: 'dashboard', module: 'hr-payroll' },
    { label: 'Machine-wise Maintenance', screen: 'maintenance', sub: 'overview', module: 'maintenance' },
    { label: 'Factory Notebook', screen: 'notebook', module: 'utilities' },
    { label: 'Security / Inward', screen: 'security-inventory', sub: 'dashboard', module: 'security' },
  ]

  const alertRows = (
    [
      [`Beam Return Pending (${alerts.beamPending})`, { screen: 'purchase' as AppScreen, sub: 'report', filter: 'pending', module: 'inventory' as const }],
      [`Weft Low Stock <${WEFT_LOW_STOCK_KG}kg (${alerts.weftLow})`, { screen: 'stock' as AppScreen, sub: 'weft', module: 'inventory' as const }],
      [`Repair Out Pending (${alerts.repairOut})`, { screen: 'maintenance' as AppScreen, sub: 'repair', module: 'maintenance' as const }],
      [`Program Pending (${alerts.programPending})`, { screen: 'programs' as AppScreen, sub: 'pending', module: 'orders' as const }],
      [`Gatepass Pending Sign (${alerts.gatepassPending})`, { screen: 'program-dispatch' as AppScreen, sub: 'gatepass', module: 'program-dispatch' as const }],
    ] as const
  ).filter((row) => !row[0].includes('(0)'))

  const alertCount = alertRows.length

  const flowSteps = [
    ['Warp Issue', `${flow.warpIn.toFixed(1)} kg`, 'warp'],
    ['Weft Issue', `${flow.weftBuy.toFixed(1)} kg`, 'weft'],
    ['Production', `${flow.production.toFixed(1)} m`, 'prod'],
    ['Folding', `${flow.folding.toFixed(1)} m`, 'fold'],
    ['Dispatch', `${flow.dispatch.toFixed(1)} m`, 'disp'],
  ] as const

  const stockTotal =
    beams.reduce((s, b) => s + Number(b.quantity_pcs || 0), 0) +
    yarns.reduce((s, y) => s + Number(y.stock_kg || 0), 0)

  return (
    <div className="screen dashboard-screen">
      <section className="dash-hero">
        <div className="dash-hero-copy">
          <p className="dash-hero-eyebrow">Fashionweave Industries</p>
          <h2 className="dash-hero-title">JAISAL FW</h2>
          <p className="dash-hero-sub text-muted">Mill overview · live floor KPIs for management</p>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-6">
        {(
          [
            ['Attendance Today', kpis.attendanceToday, 'att', { screen: 'attendance' as AppScreen, module: 'hr-payroll' as const }],
            ['Warp Yarn Mgmt', `${kpis.warpBeamStock} Beams`, 'beam', { screen: 'warp-yarn' as AppScreen, sub: 'overview', module: 'warp-yarn' as const }],
            ['Weft Yarn Stock', `${kpis.weftYarnStock.toFixed(0)} kg`, 'yarn', { screen: 'stock' as AppScreen, sub: 'weft', module: 'inventory' as const }],
            ['Greige Production', `${kpis.greigeToday.toFixed(0)} m`, 'greige', { screen: 'program-dispatch' as AppScreen, sub: 'reports', module: 'program-dispatch' as const }],
            ['Dispatch Today', `${kpis.dispatchToday.toFixed(0)} m`, 'dispatch', { screen: 'program-dispatch' as AppScreen, sub: 'challan', module: 'program-dispatch' as const }],
            ['Alerts & Reminders', `${alertCount} Alert${alertCount === 1 ? '' : 's'}`, 'alerts', { screen: 'home' as AppScreen, module: 'dashboard' as const }],
          ] as const
        ).map(([label, value, tone, nav]) => (
          <button
            key={label}
            type="button"
            className={`kpi-card surface kpi-tone-${tone}`}
            onClick={() => onNavigate(nav)}
          >
            <span className="text-muted">{label}</span>
            <strong className="num">{value}</strong>
          </button>
        ))}
      </section>

      <section className="dash-panel" style={{ marginTop: 12 }}>
        <h2 className="section-title">Today&apos;s Profit &amp; Loss</h2>
        <div className="kpi-grid kpi-grid-6">
          {(
            [
              ['Today Production', `${pnlToday.productionMeters.toFixed(0)} m`, { screen: 'costing' as AppScreen, sub: 'production', module: 'reports' as const }],
              ['Today Production Value', inr(pnlToday.productionValue), { screen: 'costing' as AppScreen, sub: 'production', module: 'reports' as const }],
              ['Today Dispatch', `${pnlToday.dispatchMeters.toFixed(0)} m`, { screen: 'costing' as AppScreen, sub: 'dispatch', module: 'reports' as const }],
              ['Today Dispatch Value', inr(pnlToday.dispatchValue), { screen: 'costing' as AppScreen, sub: 'dispatch', module: 'reports' as const }],
              ['Today Total Cost', inr(pnlToday.totalCost), { screen: 'costing' as AppScreen, sub: 'sources', module: 'reports' as const }],
              ['Today Gross Profit', inr(pnlToday.grossProfit), { screen: 'costing' as AppScreen, sub: 'factory', module: 'reports' as const }],
              ['Today Net P&L', inr(pnlToday.netProfit), { screen: 'costing' as AppScreen, sub: 'factory', module: 'reports' as const }],
            ] as const
          ).map(([label, value, nav]) => (
            <button
              key={label}
              type="button"
              className="kpi-card surface kpi-tone-dispatch"
              onClick={() => onNavigate(nav)}
            >
              <span className="text-muted">{label}</span>
              <strong className="num">{value}</strong>
            </button>
          ))}
        </div>
        <h2 className="section-title" style={{ marginTop: 16 }}>
          MTD Profit &amp; Loss
        </h2>
        <div className="kpi-grid kpi-grid-6">
          {(
            [
              ['MTD Production', `${pnlMtd.productionMeters.toFixed(0)} m`, { screen: 'costing' as AppScreen, sub: 'mtd', module: 'reports' as const }],
              ['MTD Dispatch', `${pnlMtd.dispatchMeters.toFixed(0)} m`, { screen: 'costing' as AppScreen, sub: 'mtd', module: 'reports' as const }],
              ['MTD Revenue', inr(pnlMtd.revenue), { screen: 'costing' as AppScreen, sub: 'mtd', module: 'reports' as const }],
              ['MTD Cost', inr(pnlMtd.totalCost), { screen: 'costing' as AppScreen, sub: 'mtd', module: 'reports' as const }],
              ['MTD Profit/Loss', inr(pnlMtd.netProfit), { screen: 'costing' as AppScreen, sub: 'mtd', module: 'reports' as const }],
            ] as const
          ).map(([label, value, nav]) => (
            <button
              key={label}
              type="button"
              className="kpi-card surface kpi-tone-beam"
              onClick={() => onNavigate(nav)}
            >
              <span className="text-muted">{label}</span>
              <strong className="num">{value}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="kpi-grid kpi-grid-6" style={{ marginTop: 12 }}>
        {(
          [
            ['Pending DIN', kpis.pendingDin, { screen: 'dto-hub' as AppScreen, module: 'design-to-order' as const }],
            ['Pending Samples', kpis.pendingSamples, { screen: 'dto-tracking' as AppScreen, module: 'design-to-order' as const }],
            ['Pending Orders', kpis.pendingOrders, { screen: 'orders-pending' as AppScreen, module: 'orders' as const }],
            ['Open Breakdowns', kpis.openBreakdowns, { screen: 'maintenance' as AppScreen, sub: 'overview', module: 'maintenance' as const }],
            ['Today Production', `${kpis.greigeToday.toFixed(0)} m`, { screen: 'program-dispatch' as AppScreen, sub: 'entry', module: 'program-dispatch' as const }],
            ['Today Dispatch', `${kpis.dispatchToday.toFixed(0)} m`, { screen: 'program-dispatch' as AppScreen, sub: 'challan', module: 'program-dispatch' as const }],
          ] as const
        ).map(([label, value, nav]) => (
          <button
            key={label}
            type="button"
            className="kpi-card surface kpi-tone-beam"
            onClick={() => onNavigate(nav)}
          >
            <span className="text-muted">{label}</span>
            <strong className="num">{value}</strong>
          </button>
        ))}
      </section>

      <section className="dash-panel">
        <h2 className="section-title">Today&apos;s Production Flow</h2>
        <div className="flow-row flow-row-h">
          {flowSteps.map(([label, val, tone], idx) => (
            <div key={label} className="flow-step">
              <div className={`flow-card surface flow-tone-${tone}`}>
                <span className="text-muted2">{label}</span>
                <strong className="num">{val}</strong>
              </div>
              {idx < flowSteps.length - 1 ? (
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="dash-split dash-split-tables">
        <section className="dash-panel dash-panel-wide">
          <h2 className="section-title">Top Machines (Today)</h2>
          <div className="dash-table-wrap surface">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th className="num">Meters</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {topMachines.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted">
                      No production today
                    </td>
                  </tr>
                ) : (
                  topMachines.map((row) => (
                    <tr key={row.machine}>
                      <td>
                        {row.machine} — Airjet Loom
                      </td>
                      <td className="num">{row.meters.toFixed(1)}</td>
                      <td>
                        <span className="machine-status running">
                          <span className="status-dot" aria-hidden="true" />
                          Running
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="dash-panel">
          <h2 className="section-title">Recent Inward</h2>
          <div className="dash-table-wrap surface">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Party</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentInward.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted">
                      No recent inward
                    </td>
                  </tr>
                ) : (
                  recentInward.map((row) => (
                    <tr key={`${row.type}-${row.id}`}>
                      <td>{row.type}</td>
                      <td>{row.party}</td>
                      <td className="num">₹{row.amount.toFixed(0)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="dash-split">
        <section className="dash-panel">
          <h2 className="section-title">Stock Summary</h2>
          <div className="stock-summary surface">
            <div className="stock-donut" aria-hidden="true">
              <div className="stock-donut-ring" />
              <div className="stock-donut-center">
                <strong className="num">{stockTotal.toFixed(0)}</strong>
                <span className="text-muted2">total</span>
              </div>
            </div>
            <ul className="stock-legend">
              <li>
                <span className="legend-swatch swatch-yarn" /> Yarn{' '}
                <span className="num">{kpis.weftYarnStock.toFixed(0)}</span>
              </li>
              <li>
                <span className="legend-swatch swatch-beam" /> Beams{' '}
                <span className="num">{kpis.warpBeamStock}</span>
              </li>
              <li>
                <span className="legend-swatch swatch-greige" /> Greige{' '}
                <span className="num">{kpis.greigeToday.toFixed(0)}</span>
              </li>
              <li>
                <span className="legend-swatch swatch-other" /> Inward ₹{' '}
                <span className="num">{flow.inwardSpend.toFixed(0)}</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="dash-panel">
          <h2 className="section-title">Alerts & Reminders</h2>
          <div className="list alert-list">
            {alertRows.map(([label, nav]) => (
              <button key={label} type="button" className="alert-row surface" onClick={() => onNavigate(nav)}>
                {label}
              </button>
            ))}
            {alertRows.length === 0 ? <p className="text-sage">No alerts</p> : null}
          </div>
        </section>
      </div>

      <section className="dash-panel">
        <h2 className="section-title">Module Quick Access</h2>
        <div className="quick-grid quick-grid-8">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              className="quick-tile"
              onClick={() => onNavigate({ screen: q.screen, sub: q.sub, module: q.module })}
            >
              {q.label}
            </button>
          ))}
        </div>
      </section>

      {isCeo ? (
        <div className="dash-split">
          <ApprovalsWidget />
          <PendingOrdersWidget />
        </div>
      ) : null}

      {isCeo ? <NotebookDashboardWidget onNavigate={onNavigate} /> : null}

      {isCeo ? (
        <section className="dash-stock-edit">
          <h2 className="section-title">Stock Summary (inline edit)</h2>
          <div className="list">
            {beams.map((b) => (
              <article key={b.id} className="card-row surface row-top">
                <div>
                  <strong>{b.variety_name}</strong>
                  <div className="text-muted num">{b.quantity_pcs} pcs</div>
                </div>
                <div className="icon-actions">
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void editBeam(b)}>
                    Edit
                  </button>
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void deleteBeam(b)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
            {yarns.map((y) => (
              <article key={y.id} className="card-row surface row-top">
                <div>
                  <strong>{y.colour_name || y.colour_no || 'Yarn'}</strong>
                  <div className="text-muted num">{y.stock_kg} kg</div>
                </div>
                <div className="icon-actions">
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void editYarn(y)}>
                    Edit
                  </button>
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void deleteYarn(y)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
