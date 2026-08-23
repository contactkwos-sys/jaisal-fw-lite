import { useCallback, useEffect, useState } from 'react'
import type { NavTarget } from '../../lib/nav'
import { MACHINES } from '../../lib/database.types'
import { applyOrQueue, todayISO } from '../../lib/mutate'
import { suggestMarka } from '../../lib/marka'
import {
  fmtMeter,
  loadMachinePrograms,
  loadTodayKpis,
  loadTrackingTotals,
  nextProgramNo,
  type MachineProgramRow,
  type TodayKpis,
  type TrackingTotals,
} from '../../lib/programDispatch'
import { finalSaleRate, fmtInr } from '../../lib/designWiseCosting'
import { useAuth } from '../../lib/auth'
import { handleUserError } from '../../lib/userError'
import { supabase } from '../../lib/supabase'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type OrderRow = {
  itemId: string
  orderId: string
  orderNo: string
  party: string
  partyCode: string
  marka: string
  design: string
  quality: string
  colour: string
  totalPcs: number
  totalMeter: number
  deliveryDate: string
  orderDate: string
  remarks: string
  status: string
  designImageUrl: string | null
  finalSaleRate: number | null
}

type Props = {
  onGo: (s: PdSub) => void
  onNavigate: (t: NavTarget) => void
}

const WORKFLOW = [
  { n: 1, label: 'Order', hint: 'Incoming' },
  { n: 2, label: 'Program', hint: 'Machine-wise' },
  { n: 3, label: 'Production', hint: 'Shift entry' },
  { n: 4, label: 'Checking', hint: 'Lots' },
  { n: 5, label: 'Dispatch', hint: 'Challan' },
  { n: 6, label: 'Invoice', hint: 'GST' },
]

export function PdHub({ onGo }: Props) {
  const { isCeo, profile } = useAuth()
  const [kpis, setKpis] = useState<TodayKpis | null>(null)
  const [totals, setTotals] = useState<TrackingTotals | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [machines, setMachines] = useState<MachineProgramRow[]>([])
  const [selected, setSelected] = useState<OrderRow | null>(null)
  const [programMachine, setProgramMachine] = useState<string>(MACHINES[0])
  const [requiredMeter, setRequiredMeter] = useState('')
  const [priority, setPriority] = useState('Normal')
  const [plannedDate, setPlannedDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [k, t, m] = await Promise.all([loadTodayKpis(), loadTrackingTotals(), loadMachinePrograms()])
    setKpis(k)
    setTotals(t)
    setMachines(m)

    const { data: items, error: err } = await supabase
      .from('order_book_items')
      .select(
        'id, design_no, colour, qty_meter, quality, total_pcs, delivery_date, status, settled, order_book(id, order_no, party_name, party_code, order_date, delivery_date, remarks, status)',
      )
      .eq('settled', false)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) throw err

    const parties = [...new Set((items ?? []).map((it: any) => it.order_book?.party_name).filter(Boolean))]
    const markaMap = new Map<string, string>()
    if (parties.length) {
      const { data: pm } = await supabase.from('party_master').select('party_name, marka')
      for (const p of pm ?? []) {
        if (p.party_name) markaMap.set(String(p.party_name).toLowerCase(), p.marka || suggestMarka(p.party_name))
      }
    }

    const designNos = [
      ...new Set(
        (items ?? [])
          .map((it: any) => String(it.design_no || '').trim())
          .filter((d: string) => d && d !== '—'),
      ),
    ]
    const designMeta = new Map<string, { imageUrl: string | null; saleRate: number | null }>()
    if (designNos.length) {
      const [{ data: costings }, { data: dins }] = await Promise.all([
        supabase
          .from('design_costing')
          .select('din_number, diary_image_url, ceo_final_selling_rate, final_cost_per_mtr, created_at')
          .in('din_number', designNos)
          .order('created_at', { ascending: false }),
        supabase.from('dins').select('din_number, din_image_url, final_cost_per_mtr').in('din_number', designNos),
      ])
      const dinMap = new Map((dins ?? []).map((d) => [d.din_number, d]))
      for (const c of costings ?? []) {
        if (designMeta.has(c.din_number)) continue
        const din = dinMap.get(c.din_number)
        designMeta.set(c.din_number, {
          imageUrl: c.diary_image_url || din?.din_image_url || null,
          saleRate: finalSaleRate(c.ceo_final_selling_rate, c.final_cost_per_mtr ?? din?.final_cost_per_mtr),
        })
      }
      for (const d of dins ?? []) {
        if (designMeta.has(d.din_number)) continue
        designMeta.set(d.din_number, {
          imageUrl: d.din_image_url || null,
          saleRate: finalSaleRate(null, d.final_cost_per_mtr),
        })
      }
    }

    const rows: OrderRow[] = (items ?? []).map((it: any) => {
      const ob = it.order_book || {}
      const party = ob.party_name || '—'
      const design = it.design_no || '—'
      const meta = design !== '—' ? designMeta.get(design) : undefined
      return {
        itemId: it.id,
        orderId: ob.id,
        orderNo: ob.order_no || '—',
        party,
        partyCode: ob.party_code || '',
        marka: markaMap.get(String(party).toLowerCase()) || suggestMarka(party),
        design,
        quality: it.quality || '—',
        colour: it.colour || '—',
        totalPcs: Number(it.total_pcs || 0),
        totalMeter: Number(it.qty_meter || 0),
        deliveryDate: it.delivery_date || ob.delivery_date || '—',
        orderDate: ob.order_date || '—',
        remarks: ob.remarks || '',
        status: it.status || ob.status || 'Pending',
        designImageUrl: meta?.imageUrl ?? null,
        finalSaleRate: meta?.saleRate ?? null,
      }
    })
    setOrders(rows)
  }, [])

  useEffect(() => {
    void refresh().catch((e: unknown) => setError(handleUserError('PdHub', e, 'Unable to load program data. Please try again.')))
  }, [refresh])

  async function createProgram(machineOverride?: string) {
    if (!profile || !selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const machine = machineOverride || programMachine
      if (machineOverride) setProgramMachine(machineOverride)
      const meter = Number(requiredMeter) || selected.totalMeter
      const programNo = await nextProgramNo(selected.orderNo)
      const payload = {
        order_item_id: selected.itemId,
        machine_no: machine,
        status: 'Programmed',
        program_no: programNo,
        marka: selected.marka,
        party_name: selected.party,
        design_no: selected.design,
        colour: selected.colour,
        quality: selected.quality,
        total_pcs: selected.totalPcs,
        total_meter: meter,
        required_meter: meter,
        planned_date: plannedDate,
        priority,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'programs',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { data, error: pErr } = await supabase.from('programs').insert(payload).select('id').single()
          if (pErr) throw pErr
          if (meter > 0) {
            const { error: tErr } = await supabase.from('program_petty').insert({
              program_id: data.id,
              petty_label: 'Main',
              item_name: selected.design,
              meter,
            })
            if (tErr) throw tErr
          }
          await supabase
            .from('order_book_items')
            .update({ status: 'Programmed' })
            .eq('id', selected.itemId)
          // Ensure party marka saved
          const { data: existing } = await supabase
            .from('party_master')
            .select('id, marka')
            .ilike('party_name', selected.party)
            .maybeSingle()
          if (existing?.id && !existing.marka) {
            await supabase.from('party_master').update({ marka: selected.marka }).eq('id', existing.id)
          } else if (!existing) {
            await supabase.from('party_master').insert({ party_name: selected.party, marka: selected.marka })
          }
        },
      })
      setMessage(result === 'applied' ? `Program ${programNo} created` : 'Sent to approval queue')
      setRequiredMeter('')
      await refresh()
    } catch (e) {
      setError(handleUserError('PdHub.createProgram', e, 'Program save failed. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  // Match M1 / Machine 1 style codes
  const machinePrograms = MACHINES.map((m, idx) => {
    const alts = [m, `Machine ${idx + 1}`, `M${idx + 1}`]
    return {
      machine: `Machine ${idx + 1}`,
      code: m,
      programs: machines.filter((p) => alts.includes(p.machine_no || '')),
    }
  })

  return (
    <div className="pd-hub">
      <header className="pd-hub-header">
        <div>
          <p className="pd-eyebrow">JAISAL FW · Fashionweave Industries</p>
          <h1>Program to Production</h1>
          <p className="pd-lead">Order → Program → Production → Checking → Dispatch → Invoice</p>
        </div>
        <div className="pd-date-chip">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </header>

      <nav className="pd-workflow" aria-label="Production workflow">
        {WORKFLOW.map((s, i) => (
          <button
            key={s.n}
            type="button"
            className="pd-workflow-step"
            onClick={() =>
              onGo(
                (['pto', 'pto', 'entry', 'folding', 'challan', 'invoice'] as PdSub[])[i] || 'pto',
              )
            }
          >
            <span className="pd-workflow-num">{s.n}</span>
            <span className="pd-workflow-label">{s.label}</span>
            <span className="pd-workflow-hint">{s.hint}</span>
          </button>
        ))}
      </nav>

      <div className="pd-quick-actions">
        <button type="button" className="pd-qa pd-qa-blue" onClick={() => setSelected(orders[0] || null)}>
          + New Program
        </button>
        <button type="button" className="pd-qa pd-qa-green" onClick={() => onGo('entry')}>
          Production Entry
        </button>
        <button type="button" className="pd-qa pd-qa-purple" onClick={() => onGo('folding')}>
          Folding & Checking
        </button>
        <button type="button" className="pd-qa pd-qa-orange" onClick={() => onGo('challan')}>
          Challan / Gate Pass
        </button>
        <button type="button" className="pd-qa pd-qa-teal" onClick={() => onGo('invoice')}>
          Invoice
        </button>
        <button type="button" className="pd-qa pd-qa-slate" onClick={() => onGo('reports')}>
          Reports
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="pd-kpi-row">
        <div className="pd-kpi pd-kpi-blue">
          <span>Today Production</span>
          <strong>{fmtMeter(kpis?.todayProduction || 0)}</strong>
          <em>Meter</em>
        </div>
        <div className="pd-kpi pd-kpi-green">
          <span>Today Checked</span>
          <strong>{fmtMeter(kpis?.todayChecked || 0)}</strong>
          <em>Meter</em>
        </div>
        <div className="pd-kpi pd-kpi-teal">
          <span>Today Dispatched</span>
          <strong>{fmtMeter(kpis?.todayDispatched || 0)}</strong>
          <em>Meter</em>
        </div>
        <div className="pd-kpi pd-kpi-orange">
          <span>Pending Checking</span>
          <strong>{fmtMeter(kpis?.pendingChecking || 0)}</strong>
          <em>Meter</em>
        </div>
        <div className="pd-kpi pd-kpi-brown">
          <span>Pending Dispatch</span>
          <strong>{fmtMeter(kpis?.pendingDispatch || 0)}</strong>
          <em>Meter</em>
        </div>
      </div>

      <div className="pd-panels">
        <section className="pd-panel">
          <header className="pd-panel-h">
            <h2>Orders</h2>
            <span className="text-muted">{orders.length} open</span>
          </header>
          <div className="pd-table-wrap">
            <table className="pd-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Party</th>
                  <th>Design</th>
                  <th>Design View</th>
                  <th>Final Sale Rate</th>
                  <th>Quality</th>
                  <th>Colour</th>
                  <th>Pcs</th>
                  <th>Meter</th>
                  <th>Delivery</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.itemId} className={selected?.itemId === o.itemId ? 'is-selected' : ''}>
                    <td className="num">{o.orderNo}</td>
                    <td>{o.party}</td>
                    <td>{o.design}</td>
                    <td>
                      {o.designImageUrl ? (
                        <img
                          className="pd-design-thumb"
                          src={o.designImageUrl}
                          alt={`Design ${o.design}`}
                          width={40}
                          height={40}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num pd-sale-rate">
                      {o.finalSaleRate != null ? fmtInr(o.finalSaleRate) : '—'}
                    </td>
                    <td>{o.quality}</td>
                    <td>{o.colour}</td>
                    <td className="num">{o.totalPcs || '—'}</td>
                    <td className="num">{fmtMeter(o.totalMeter)}</td>
                    <td>{o.deliveryDate}</td>
                    <td>
                      <span className={`pd-pill ${o.status === 'Programmed' ? 'ok' : 'pending'}`}>{o.status}</span>
                    </td>
                    <td>
                      <button type="button" className="btn-sm" onClick={() => setSelected(o)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
                {!orders.length ? (
                  <tr>
                    <td colSpan={12} className="text-muted">
                      No open orders. Create orders in Orders &amp; Pending → Order Book.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pd-panel">
          <header className="pd-panel-h">
            <h2>Program (Machine-wise)</h2>
          </header>
          {selected ? (
            <div className="pd-order-detail">
              <h3>
                {selected.orderNo} · {selected.party}
              </h3>
              <div className="pd-detail-visual">
                {selected.designImageUrl ? (
                  <img
                    className="pd-design-preview"
                    src={selected.designImageUrl}
                    alt={`Design ${selected.design}`}
                  />
                ) : null}
                <div className="pd-detail-grid">
                <div>
                  <span>Party Code</span>
                  <strong>{selected.partyCode || '—'}</strong>
                </div>
                <div>
                  <span>Marka</span>
                  <strong className="pd-marka">{selected.marka}</strong>
                </div>
                <div>
                  <span>Design</span>
                  <strong>{selected.design}</strong>
                </div>
                <div>
                  <span>Final Sale Rate</span>
                  <strong className="num pd-sale-rate">
                    {selected.finalSaleRate != null ? fmtInr(selected.finalSaleRate) : '—'}
                  </strong>
                </div>
                <div>
                  <span>Quality</span>
                  <strong>{selected.quality}</strong>
                </div>
                <div>
                  <span>Colour</span>
                  <strong>{selected.colour}</strong>
                </div>
                <div>
                  <span>Total Meter</span>
                  <strong className="num">{fmtMeter(selected.totalMeter)}</strong>
                </div>
                <div>
                  <span>Order Date</span>
                  <strong>{selected.orderDate}</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>{selected.deliveryDate}</strong>
                </div>
                <div className="pd-span-2">
                  <span>Remarks</span>
                  <strong>{selected.remarks || '—'}</strong>
                </div>
                </div>
              </div>
              <div className="pd-program-form">
                <label className="field">
                  <span className="text-muted">Machine</span>
                  <select value={programMachine} onChange={(e) => setProgramMachine(e.target.value)}>
                    {MACHINES.map((m, i) => (
                      <option key={m} value={m}>
                        Machine {i + 1} ({m})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="text-muted">Required Meter</span>
                  <input
                    type="number"
                    step="0.1"
                    value={requiredMeter}
                    placeholder={String(selected.totalMeter)}
                    onChange={(e) => setRequiredMeter(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="text-muted">Planned Date</span>
                  <input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
                </label>
                <label className="field">
                  <span className="text-muted">Priority</span>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option>Normal</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="primary-save"
                  disabled={busy}
                  onClick={() => void createProgram()}
                >
                  Select for Program
                </button>
              </div>
            </div>
          ) : (
            <p className="text-muted pd-empty">Select an order to create a machine program.</p>
          )}

          <div className="pd-machine-grid">
            {machinePrograms.map((block) => (
              <div key={block.machine} className="pd-machine-card">
                <header>
                  <h3>{block.machine}</h3>
                  <button
                    type="button"
                    className="btn-sm"
                    disabled={!selected || busy}
                    onClick={() => {
                      if (selected) void createProgram(block.code)
                    }}
                  >
                    + Add Program
                  </button>
                </header>
                <div className="pd-table-wrap">
                  <table className="pd-table pd-table-compact">
                    <thead>
                      <tr>
                        <th>Program</th>
                        <th>Design</th>
                        <th>Colour</th>
                        <th>Marka</th>
                        <th>Meter</th>
                        <th>Produced</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.programs.map((p) => (
                        <tr key={p.id}>
                          <td className="num">{p.program_no || '—'}</td>
                          <td>{p.design_no}</td>
                          <td>{p.colour}</td>
                          <td>{p.marka}</td>
                          <td className="num">{fmtMeter(p.total_meter)}</td>
                          <td className="num">{fmtMeter(p.produced)}</td>
                          <td>
                            <span className={`pd-pill ${p.status === 'Running' || p.status === 'running' ? 'run' : 'ok'}`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {!block.programs.length ? (
                        <tr>
                          <td colSpan={7} className="text-muted">
                            No active programs
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {totals ? (
        <footer className="pd-progress-bar">
          <div className="pd-progress-metrics">
            <span>
              Order <strong>{fmtMeter(totals.orderMeter)}</strong>
            </span>
            <span>
              Programmed <strong>{fmtMeter(totals.programmedMeter)}</strong>
            </span>
            <span>
              Produced <strong>{fmtMeter(totals.producedMeter)}</strong>
            </span>
            <span>
              Checked <strong>{fmtMeter(totals.checkedMeter)}</strong>
            </span>
            <span>
              Dispatched <strong>{fmtMeter(totals.dispatchedMeter)}</strong>
            </span>
            <span>
              Pending <strong>{fmtMeter(totals.pendingMeter)}</strong>
            </span>
          </div>
          <div className="pd-progress-track" aria-label={`Overall progress ${totals.progressPct.toFixed(1)}%`}>
            <div className="pd-progress-fill" style={{ width: `${totals.progressPct}%` }} />
            <span>{totals.progressPct.toFixed(1)}%</span>
          </div>
        </footer>
      ) : null}
    </div>
  )
}
