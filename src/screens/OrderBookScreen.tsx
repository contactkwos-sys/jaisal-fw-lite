import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { AdjustmentNote, OrderBookItem } from '../lib/database.types'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type Sub = 'entry' | 'report'
type Props = { initialSub?: string }

type LineDraft = {
  key: string
  design_no: string
  colour: string
  qty_meter: string
  rate: string
}

type ReportRow = {
  orderId: string
  itemId: string
  party: string
  design_no: string
  colour: string
  order_date: string
  ordered: number
  programmed: number
  dispatched: number
  settled: boolean
  adjustments: AdjustmentNote[]
}

function emptyLine(): LineDraft {
  return { key: crypto.randomUUID(), design_no: '', colour: '', qty_meter: '', rate: '' }
}

export function OrderBookScreen({ initialSub }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub === 'report' ? 'report' : 'entry')
  const [party, setParty] = useState('')
  const [parties, setParties] = useState<string[]>([])
  const [orderDate, setOrderDate] = useState(todayISO())
  const [paymentDays, setPaymentDays] = useState('')
  const [discountPct, setDiscountPct] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [report, setReport] = useState<ReportRow[]>([])
  const [sortBy, setSortBy] = useState<'party' | 'date'>('date')
  const [adjustItem, setAdjustItem] = useState<ReportRow | null>(null)
  const [adjustType, setAdjustType] = useState<'carry_forward' | 'write_off' | 'top_up_program'>(
    'carry_forward',
  )
  const [adjustReason, setAdjustReason] = useState('')

  useEffect(() => {
    if (initialSub === 'report' || initialSub === 'entry') setSub(initialSub)
  }, [initialSub])

  const loadParties = useCallback(async () => {
    const [{ data: orders }, { data: challans }] = await Promise.all([
      supabase.from('order_book').select('party_name').order('created_at', { ascending: false }).limit(200),
      supabase.from('challans').select('party').order('created_at', { ascending: false }).limit(100),
    ])
    const set = new Set<string>()
    for (const o of orders ?? []) if (o.party_name) set.add(String(o.party_name))
    for (const c of challans ?? []) if (c.party) set.add(String(c.party))
    setParties([...set].sort((a, b) => a.localeCompare(b)))
  }, [])

  const loadReport = useCallback(async () => {
    const [{ data: items, error: iErr }, { data: programs }, { data: petty }, { data: notes }] =
      await Promise.all([
        supabase
          .from('order_book_items')
          .select('*, order_book(id, party_name, order_date)')
          .limit(300),
        supabase.from('programs').select('id, order_item_id, dispatched_meter, status'),
        supabase.from('program_petty').select('program_id, meter'),
        supabase.from('adjustment_notes').select('*').order('created_at', { ascending: false }),
      ])
    if (iErr) throw iErr

    const pettyByProgram = new Map<string, number>()
    for (const p of petty ?? []) {
      pettyByProgram.set(p.program_id, (pettyByProgram.get(p.program_id) || 0) + Number(p.meter || 0))
    }
    const progByItem = new Map<string, { programmed: number; dispatched: number }>()
    for (const p of programs ?? []) {
      if (!p.order_item_id) continue
      const cur = progByItem.get(p.order_item_id) || { programmed: 0, dispatched: 0 }
      cur.programmed += pettyByProgram.get(p.id) || 0
      cur.dispatched += Number(p.dispatched_meter || 0)
      progByItem.set(p.order_item_id, cur)
    }
    const notesByItem = new Map<string, AdjustmentNote[]>()
    for (const n of (notes ?? []) as AdjustmentNote[]) {
      if (!n.order_item_id) continue
      const list = notesByItem.get(n.order_item_id) || []
      list.push(n)
      notesByItem.set(n.order_item_id, list)
    }

    const rows: ReportRow[] = ((items ?? []) as Array<
      OrderBookItem & { order_book: { id: string; party_name: string; order_date: string } | null }
    >).map((it) => {
      const agg = progByItem.get(it.id) || { programmed: 0, dispatched: 0 }
      return {
        orderId: it.order_id,
        itemId: it.id,
        party: it.order_book?.party_name || '—',
        design_no: it.design_no || '—',
        colour: it.colour || '—',
        order_date: it.order_book?.order_date || '',
        ordered: Number(it.qty_meter || 0),
        programmed: agg.programmed,
        dispatched: agg.dispatched,
        settled: Boolean(it.settled),
        adjustments: notesByItem.get(it.id) || [],
      }
    })
    setReport(rows)
  }, [])

  useEffect(() => {
    void loadParties().catch((e: Error) => setError(e.message))
  }, [loadParties])

  useEffect(() => {
    if (sub === 'report') void loadReport().catch((e: Error) => setError(e.message))
  }, [sub, loadReport])

  const canSave = useMemo(
    () =>
      party.trim().length > 0 &&
      lines.some((l) => l.design_no.trim() && Number(l.qty_meter) > 0),
    [party, lines],
  )

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !canSave) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const header = {
        party_name: party.trim(),
        order_date: orderDate,
        payment_days: paymentDays ? Number(paymentDays) : null,
        discount_pct: discountPct ? Number(discountPct) : null,
      }
      const itemRows = lines
        .filter((l) => l.design_no.trim() && Number(l.qty_meter) > 0)
        .map((l) => ({
          design_no: l.design_no.trim(),
          colour: l.colour.trim() || null,
          qty_meter: Number(l.qty_meter) || 0,
          rate: Number(l.rate) || 0,
        }))
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'order_book',
        action: 'insert',
        recordId: null,
        payload: { ...header, items: itemRows },
        apply: async () => {
          const { data, error: oErr } = await supabase
            .from('order_book')
            .insert(header)
            .select('id')
            .single()
          if (oErr) throw oErr
          const { error: iErr } = await supabase.from('order_book_items').insert(
            itemRows.map((r) => ({ ...r, order_id: data.id })),
          )
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Order saved' : 'Sent to approval queue')
      setLines([emptyLine()])
      setPaymentDays('')
      setDiscountPct('')
      await loadParties()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const sortedReport = useMemo(() => {
    const rows = [...report]
    if (sortBy === 'party') rows.sort((a, b) => a.party.localeCompare(b.party))
    else rows.sort((a, b) => (a.order_date < b.order_date ? 1 : -1))
    return rows
  }, [report, sortBy])

  function statusFor(row: ReportRow): { label: string; className: string; diff: number } {
    const latest = row.adjustments[0]
    if (row.settled || latest?.adjustment_type === 'write_off') {
      return { label: 'Adjusted: Write-off', className: 'badge-muted', diff: 0 }
    }
    if (latest?.adjustment_type === 'carry_forward') {
      return { label: 'Adjusted: Carried Forward', className: 'badge-gold', diff: row.ordered - row.dispatched }
    }
    if (latest?.adjustment_type === 'top_up_program') {
      return { label: 'Adjusted: Top-up Program', className: 'badge-gold', diff: row.ordered - row.dispatched }
    }
    const diff = row.ordered - row.dispatched
    if (row.dispatched <= 0) return { label: 'Pending', className: 'badge-gold', diff }
    if (diff <= 0.01) return { label: 'Complete', className: 'badge-sage', diff: 0 }
    return { label: 'Short', className: 'badge-danger', diff }
  }

  async function saveAdjust() {
    if (!profile || !adjustItem) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const diff = Math.max(0, adjustItem.ordered - adjustItem.dispatched)
      const meter = diff || Number(adjustItem.adjustments[0]?.meter || 0)
      if (adjustType === 'write_off' && !adjustReason.trim()) {
        setError('Write-off needs a reason')
        setBusy(false)
        return
      }
      const note = {
        order_item_id: adjustItem.itemId,
        adjustment_type: adjustType,
        reason: adjustReason.trim() || null,
        meter,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'adjustment_notes',
        action: 'insert',
        recordId: null,
        payload: note,
        apply: async () => {
          const { error: nErr } = await supabase.from('adjustment_notes').insert(note)
          if (nErr) throw nErr
          if (adjustType === 'write_off') {
            const { error: sErr } = await supabase
              .from('order_book_items')
              .update({ settled: true })
              .eq('id', adjustItem.itemId)
            if (sErr) throw sErr
          }
          if (adjustType === 'top_up_program' && meter > 0) {
            const { data: prog, error: pErr } = await supabase
              .from('programs')
              .insert({
                order_item_id: adjustItem.itemId,
                machine_no: null,
                status: 'pending',
              })
              .select('id')
              .single()
            if (pErr) throw pErr
            const { error: tErr } = await supabase.from('program_petty').insert({
              program_id: prog.id,
              petty_label: 'Top-up',
              item_name: adjustItem.design_no,
              meter,
            })
            if (tErr) throw tErr
          }
        },
      })
      setMessage(result === 'applied' ? 'Adjustment saved' : 'Sent to approval queue')
      setAdjustItem(null)
      setAdjustReason('')
      await loadReport()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjust failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Order Book</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'entry', label: 'New Order' },
            { id: 'report', label: 'Party Report' },
          ]}
        />
      </header>

      {sub === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void saveOrder(e)}>
          <label className="field">
            <span className="text-muted">Party Name</span>
            <input
              list="party-suggest"
              value={party}
              onChange={(e) => setParty(e.target.value)}
              required
            />
            <datalist id="party-suggest">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </label>
          {lines.map((line, idx) => (
            <fieldset key={line.key} className="colour-block surface">
              <legend>Design / Colour {idx + 1}</legend>
              <label className="field">
                <span className="text-muted">Design No.</span>
                <input
                  value={line.design_no}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, design_no: e.target.value }
                    setLines(next)
                  }}
                  required={idx === 0}
                />
              </label>
              <label className="field">
                <span className="text-muted">Colour</span>
                <input
                  value={line.colour}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, colour: e.target.value }
                    setLines(next)
                  }}
                />
              </label>
              <label className="field">
                <span className="text-muted">Taka / Meter</span>
                <input
                  className="num"
                  type="number"
                  step="0.01"
                  value={line.qty_meter}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, qty_meter: e.target.value }
                    setLines(next)
                  }}
                />
              </label>
              <label className="field">
                <span className="text-muted">Rate</span>
                <input
                  className="num"
                  type="number"
                  step="0.01"
                  value={line.rate}
                  onChange={(e) => {
                    const next = [...lines]
                    next[idx] = { ...line, rate: e.target.value }
                    setLines(next)
                  }}
                />
              </label>
              <div className="text-muted num">
                Amount ₹{((Number(line.qty_meter) || 0) * (Number(line.rate) || 0)).toFixed(2)}
              </div>
            </fieldset>
          ))}
          <button type="button" className="btn-warp" onClick={() => setLines([...lines, emptyLine()])}>
            + Add
          </button>
          <label className="field">
            <span className="text-muted">Payment Days</span>
            <input
              className="num"
              type="number"
              value={paymentDays}
              onChange={(e) => setPaymentDays(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Discount %</span>
            <input
              className="num"
              type="number"
              step="0.01"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          </label>
          <button type="submit" className="primary-save" disabled={busy || !canSave}>
            Save Order
          </button>
        </form>
      ) : null}

      {sub === 'report' ? (
        <div className="party-report">
          <div className="segment">
            <button
              type="button"
              className={sortBy === 'date' ? 'seg active' : 'seg'}
              onClick={() => setSortBy('date')}
            >
              Sort date
            </button>
            <button
              type="button"
              className={sortBy === 'party' ? 'seg active' : 'seg'}
              onClick={() => setSortBy('party')}
            >
              Sort party
            </button>
          </div>

          <div className="party-report-cards">
            {sortedReport.map((row) => {
              const st = statusFor(row)
              return (
                <article key={row.itemId} className="card-row surface party-report-card">
                  <div className="row-top">
                    <div>
                      <strong>{row.party}</strong>
                      <div className="text-muted">
                        {row.design_no} · {row.colour} · {row.order_date}
                      </div>
                    </div>
                    <span className={`status-chip ${st.className}`}>{st.label}</span>
                  </div>
                  <div className="party-metrics">
                    <div>
                      <span className="text-muted2">Ordered</span>
                      <div className="num">{row.ordered.toFixed(1)}</div>
                    </div>
                    <div>
                      <span className="text-muted2">Program</span>
                      <div className="num">{row.programmed.toFixed(1)}</div>
                    </div>
                    <div>
                      <span className="text-muted2">Dispatched</span>
                      <div className="num">{row.dispatched.toFixed(1)}</div>
                    </div>
                    <div>
                      <span className="text-muted2">Diff</span>
                      <div
                        className={`num ${
                          st.diff > 0.01 ? 'text-danger' : st.diff < 0 ? 'text-sage' : 'text-sage'
                        }`}
                      >
                        {st.diff.toFixed(1)}
                      </div>
                    </div>
                  </div>
                  {!row.settled && Math.abs(row.ordered - row.dispatched) > 0.01 ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setAdjustItem(row)
                        setAdjustType('carry_forward')
                        setAdjustReason('')
                      }}
                    >
                      Adjust
                    </button>
                  ) : null}
                </article>
              )
            })}
            {!sortedReport.length ? <p className="text-muted">No orders yet</p> : null}
          </div>

          <div className="dash-table-wrap surface party-report-table">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Party</th>
                  <th>Design</th>
                  <th>Colour</th>
                  <th>Date</th>
                  <th className="num">Ordered</th>
                  <th className="num">Program</th>
                  <th className="num">Dispatched</th>
                  <th className="num">Diff</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedReport.map((row) => {
                  const st = statusFor(row)
                  return (
                    <tr key={row.itemId}>
                      <td>{row.party}</td>
                      <td>{row.design_no}</td>
                      <td>{row.colour}</td>
                      <td>{row.order_date}</td>
                      <td className="num">{row.ordered.toFixed(1)}</td>
                      <td className="num">{row.programmed.toFixed(1)}</td>
                      <td className="num">{row.dispatched.toFixed(1)}</td>
                      <td className={`num ${st.diff > 0.01 ? 'text-danger' : 'text-sage'}`}>
                        {st.diff.toFixed(1)}
                      </td>
                      <td>
                        <span className={`status-chip ${st.className}`}>{st.label}</span>
                      </td>
                      <td>
                        {!row.settled && Math.abs(row.ordered - row.dispatched) > 0.01 ? (
                          <button
                            type="button"
                            className="btn-ghost icon-btn"
                            onClick={() => {
                              setAdjustItem(row)
                              setAdjustType('carry_forward')
                              setAdjustReason('')
                            }}
                          >
                            Adjust
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {adjustItem ? (
            <div className="adjust-panel surface">
              <h2 className="section-title">Adjust difference</h2>
              <p className="text-muted">
                {adjustItem.party} · {adjustItem.design_no} · short{' '}
                {(adjustItem.ordered - adjustItem.dispatched).toFixed(1)} m
              </p>
              <div className="segment">
                {(
                  [
                    ['carry_forward', 'Carry Forward'],
                    ['write_off', 'Write-off'],
                    ['top_up_program', 'New Top-up Program'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={adjustType === id ? 'seg active' : 'seg'}
                    onClick={() => setAdjustType(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {adjustType === 'write_off' ? (
                <label className="field">
                  <span className="text-muted">Reason</span>
                  <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                </label>
              ) : null}
              <div className="share-actions">
                <button type="button" disabled={busy} onClick={() => void saveAdjust()}>
                  Save adjustment
                </button>
                <button type="button" className="btn-ghost" onClick={() => setAdjustItem(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
