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

type Props = {
  onNavigate: (t: NavTarget) => void
}

type Kpis = {
  attendanceToday: number
  warpBeamStock: number
  weftYarnStock: number
  greigeToday: number
  dispatchToday: number
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

export function DashboardScreen({ onNavigate }: Props) {
  const { isCeo, profile } = useAuth()
  const [kpis, setKpis] = useState<Kpis>({
    attendanceToday: 0,
    warpBeamStock: 0,
    weftYarnStock: 0,
    greigeToday: 0,
    dispatchToday: 0,
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
    ])

    const present = (att.data ?? []).filter((a) => {
      const s = String(a.status || '').toLowerCase()
      return s.includes('present') || s === 'completed' || s === 'on break'
    }).length

    const beamPcs = (beamStock.data as BeamPipeStock[] | null)?.reduce((s, b) => s + Number(b.quantity_pcs || 0), 0) ?? 0
    const weftKg = (weftStock.data as WeftYarnStock[] | null)?.reduce((s, y) => s + Number(y.stock_kg || 0), 0) ?? 0
    const greige = (prod.data ?? []).reduce((s, p) => s + Number(p.total_meter || 0), 0)
    const dispatchM = (challan.data ?? []).reduce((s, c) => s + Number(c.meter || 0), 0)

    setKpis({
      attendanceToday: present,
      warpBeamStock: beamPcs,
      weftYarnStock: weftKg,
      greigeToday: greige,
      dispatchToday: dispatchM,
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
      programPending = jobIds.filter((j) => j.created_at?.startsWith(today) && !machinesWithProd.size).length
        || jobIds.filter((j) => {
          // fallback: count today's job cards if no production at all
          return String(j.created_at || '').startsWith(today)
        }).length && !(pe ?? []).length
        ? jobIds.filter((j) => String(j.created_at || '').startsWith(today)).length
        : 0
      // simpler: today's job cards minus distinct machines that produced today
      const todayJobs = jobIds.filter((j) => String(j.created_at || '').startsWith(today))
      programPending = Math.max(0, todayJobs.length - machinesWithProd.size)
    }

    setAlerts({
      beamPending: beamOut.count ?? 0,
      weftLow,
      repairOut: repair.count ?? 0,
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

  const quick: Array<{ label: string; screen: AppScreen; sub?: string }> = [
    { label: 'Attendance', screen: 'attendance' },
    { label: 'General Buy', screen: 'purchase', sub: 'general' },
    { label: 'Weft Purchase', screen: 'purchase', sub: 'weft' },
    { label: 'Maint Inward', screen: 'purchase', sub: 'maint_in' },
    { label: 'Purchase Report', screen: 'purchase', sub: 'report' },
    { label: 'Production', screen: 'production', sub: 'entry' },
    { label: 'Folding', screen: 'dispatch', sub: 'folding' },
    { label: 'Challan', screen: 'dispatch', sub: 'challan' },
    { label: 'Reports', screen: 'production', sub: 'report' },
    { label: 'Costing', screen: 'costing' },
  ]

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>CEO Dashboard</h1>
        <p className="text-muted">Live floor snapshot · {today}</p>
      </header>

      <section className="kpi-grid">
        {(
          [
            ['Attendance Today', kpis.attendanceToday, { screen: 'attendance' as AppScreen }],
            ['Warp Beam Stock', kpis.warpBeamStock, { screen: 'stock' as AppScreen }],
            ['Weft Yarn Stock', `${kpis.weftYarnStock.toFixed(1)} kg`, { screen: 'stock' as AppScreen }],
            ['Greige / Prod Today', `${kpis.greigeToday.toFixed(1)} m`, { screen: 'production' as AppScreen, sub: 'report' }],
            ['Dispatch Today', `${kpis.dispatchToday.toFixed(1)} m`, { screen: 'dispatch' as AppScreen, sub: 'challan' }],
          ] as const
        ).map(([label, value, nav]) => (
          <button
            key={label}
            type="button"
            className="kpi-card surface"
            onClick={() => onNavigate(nav)}
          >
            <span className="text-muted">{label}</span>
            <strong className="num">{value}</strong>
          </button>
        ))}
      </section>

      <h2 className="section-title">Quick Access</h2>
      <div className="quick-grid">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            className="quick-tile surface2"
            onClick={() => onNavigate({ screen: q.screen, sub: q.sub })}
          >
            {q.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">Alerts & Reminders</h2>
      <div className="list">
        {(
          [
            [`Beam Return Pending (${alerts.beamPending})`, { screen: 'purchase' as AppScreen, sub: 'report', filter: 'pending' }],
            [`Weft Low Stock <${WEFT_LOW_STOCK_KG}kg (${alerts.weftLow})`, { screen: 'stock' as AppScreen }],
            [`Repair Out Pending (${alerts.repairOut})`, { screen: 'maintenance' as AppScreen, sub: 'repair' }],
            [`Program Pending (${alerts.programPending})`, { screen: 'production' as AppScreen, sub: 'job' }],
            [`Gatepass Pending Sign (${alerts.gatepassPending})`, { screen: 'dispatch' as AppScreen, sub: 'gatepass' }],
          ] as const
        )
          .filter((row) => !row[0].includes('(0)'))
          .map(([label, nav]) => (
            <button key={label} type="button" className="alert-row surface" onClick={() => onNavigate(nav)}>
              {label}
            </button>
          ))}
        {!alerts.beamPending && !alerts.weftLow && !alerts.repairOut && !alerts.programPending && !alerts.gatepassPending ? (
          <p className="text-sage">No alerts</p>
        ) : null}
      </div>

      <h2 className="section-title">Today Summary Flow</h2>
      <div className="flow-row">
        {(
          [
            ['Warp Inward', `${flow.warpIn.toFixed(1)} kg`],
            ['Weft Buy', `${flow.weftBuy.toFixed(1)} kg`],
            ['Inward ₹', `₹${flow.inwardSpend.toFixed(0)}`],
            ['Production', `${flow.production.toFixed(1)} m`],
            ['Folding', `${flow.folding.toFixed(1)} m`],
            ['Dispatch', `${flow.dispatch.toFixed(1)} m`],
          ] as const
        ).map(([label, val]) => (
          <div key={label} className="flow-card surface2">
            <span className="text-muted2">{label}</span>
            <strong className="num">{val}</strong>
          </div>
        ))}
      </div>

      {isCeo ? (
        <>
          <h2 className="section-title">Stock Summary (inline edit)</h2>
          <div className="list">
            {beams.map((b) => (
              <article key={b.id} className="card-row surface row-top">
                <div>
                  <strong>{b.variety_name}</strong>
                  <div className="text-muted num">{b.quantity_pcs} pcs</div>
                </div>
                <div className="icon-actions">
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void editBeam(b)}>✏️</button>
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void deleteBeam(b)}>🗑️</button>
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
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void editYarn(y)}>✏️</button>
                  <button type="button" className="btn-ghost icon-btn" disabled={busy} onClick={() => void deleteYarn(y)}>🗑️</button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
