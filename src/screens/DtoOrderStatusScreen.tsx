/** @deprecated Superseded by OrderToProgramScreen (order-to-program / order-status). Kept for reference only. */
import { useCallback, useEffect, useState } from 'react'
import { DtoStatusPill } from '../components/ImageLightbox'
import { fmtInrIn } from '../lib/designToOrder'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'

type Props = { onNavigate: (t: NavTarget) => void }

type StatusRow = {
  orderId: string
  itemId: string
  party: string
  din: string
  matching: string
  colour: string
  orderDate: string
  meter: number
  rate: number
  amount: number
  settled: boolean
  programmed: number
  dispatched: number
}

export function DtoOrderStatusScreen({ onNavigate }: Props) {
  const [rows, setRows] = useState<StatusRow[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: items, error: iErr }, { data: programs }] = await Promise.all([
      supabase
        .from('order_book_items')
        .select('id, order_id, design_no, colour, qty_meter, rate, amount, settled, matching_no, din_id, order_book(party_name, order_date)')
        .order('id', { ascending: false })
        .limit(300),
      supabase.from('programs').select('id, order_item_id, dispatched_meter, status'),
    ])
    if (iErr) throw iErr

    const progByItem = new Map<string, { programmed: number; dispatched: number }>()
    for (const p of programs ?? []) {
      if (!p.order_item_id) continue
      const cur = progByItem.get(p.order_item_id) || { programmed: 0, dispatched: 0 }
      cur.programmed += 1
      cur.dispatched += Number(p.dispatched_meter || 0)
      progByItem.set(p.order_item_id, cur)
    }

    const list: StatusRow[] = (items ?? []).map((it: any) => {
      const agg = progByItem.get(it.id) || { programmed: 0, dispatched: 0 }
      return {
        orderId: it.order_id,
        itemId: it.id,
        party: it.order_book?.party_name || '—',
        din: it.design_no || '—',
        matching: it.matching_no != null ? String(it.matching_no) : '—',
        colour: it.colour || '—',
        orderDate: it.order_book?.order_date || '',
        meter: Number(it.qty_meter || 0),
        rate: Number(it.rate || 0),
        amount: Number(it.amount || 0),
        settled: Boolean(it.settled),
        programmed: agg.programmed,
        dispatched: agg.dispatched,
      }
    })
    setRows(list)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const filtered = rows.filter((r) => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [r.party, r.din, r.colour, r.matching].some((x) => x.toLowerCase().includes(needle))
  })

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>Order Status</h1>
          <p className="text-muted">Booked orders with saved rates for Program &amp; Dispatch.</p>
        </div>
        <div className="dto-header-actions">
          <button type="button" className="primary-save" onClick={() => onNavigate({ screen: 'dto-order-booking', module: 'design-to-order' })}>
            New Booking
          </button>
          <button type="button" className="btn-warp" onClick={() => onNavigate({ screen: 'programs', sub: 'create', module: 'orders' })}>
            Program Card
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="surface dto-panel">
        <input className="dto-search" placeholder="Search party / DIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Party</th>
                <th>DIN</th>
                <th>Matching</th>
                <th>Colour</th>
                <th>Meter</th>
                <th>Order Rate</th>
                <th>Amount</th>
                <th>Program</th>
                <th>Dispatched</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.itemId}>
                  <td>{r.orderDate}</td>
                  <td>{r.party}</td>
                  <td>{r.din}</td>
                  <td>{r.matching}</td>
                  <td>{r.colour}</td>
                  <td className="num">{r.meter}</td>
                  <td className="num">{fmtInrIn(r.rate)} / Mtr</td>
                  <td className="num">{fmtInrIn(r.amount)}</td>
                  <td className="num">{r.programmed}</td>
                  <td className="num">{r.dispatched}</td>
                  <td>
                    <DtoStatusPill
                      status={r.settled ? 'Settled' : r.dispatched > 0 ? 'Dispatched' : r.programmed > 0 ? 'In Production' : 'Order Pending'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
