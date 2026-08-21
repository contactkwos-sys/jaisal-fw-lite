import { useCallback, useEffect, useMemo, useState } from 'react'
import { DtoStatusPill, ImageLightbox } from '../components/ImageLightbox'
import { useAuth } from '../lib/auth'
import {
  fetchDinByNumber,
  fetchDins,
  fmtInrIn,
  matchingColourLabel,
  updateDin,
  type DinMatching,
  type DinWithMatchings,
} from '../lib/designToOrder'
import { applyOrQueue, todayISO } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'

type Props = { onNavigate: (t: NavTarget) => void; initialDinNumber?: string }

type LineDraft = {
  key: string
  matching_no: number
  colour: string
  meter: string
  rate: string
}

export function DtoOrderBookingScreen({ onNavigate, initialDinNumber }: Props) {
  const { isCeo, profile } = useAuth()
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [dinNumber, setDinNumber] = useState(initialDinNumber || '')
  const [din, setDin] = useState<DinWithMatchings | null>(null)
  const [party, setParty] = useState('')
  const [parties, setParties] = useState<string[]>([])
  const [orderDate, setOrderDate] = useState(todayISO())
  const [delivery, setDelivery] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')
  const [discountPct, setDiscountPct] = useState('')
  const [suggestedRate, setSuggestedRate] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [list, partyRows, prevRates] = await Promise.all([
      fetchDins(200),
      supabase.from('party_master').select('party_name').order('party_name').limit(400),
      supabase
        .from('order_book_items')
        .select('design_no, rate')
        .not('rate', 'is', null)
        .order('id', { ascending: false })
        .limit(100),
    ])
    setDins(list)
    setParties((partyRows.data ?? []).map((p) => String(p.party_name)).filter(Boolean))
    const pick = initialDinNumber || list[0]?.din_number || ''
    setDinNumber((prev) => prev || pick)
    const rateMap = new Map<string, number>()
    for (const r of prevRates.data ?? []) {
      if (r.design_no && !rateMap.has(r.design_no)) rateMap.set(r.design_no, Number(r.rate || 0))
    }
    ;(window as unknown as { __dtoPrevRates?: Map<string, number> }).__dtoPrevRates = rateMap
  }, [initialDinNumber])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    if (!dinNumber) {
      setDin(null)
      return
    }
    void fetchDinByNumber(dinNumber)
      .then((d) => {
        setDin(d)
        if (d?.party_name) setParty(d.party_name)
        const cost = d?.final_cost_per_mtr != null ? String(d.final_cost_per_mtr) : ''
        const prev = (window as unknown as { __dtoPrevRates?: Map<string, number> }).__dtoPrevRates?.get(dinNumber)
        const suggest = prev != null && prev > 0 ? String(prev) : cost
        setSuggestedRate(suggest)
        const approved = (d?.din_matchings || []).filter((m) => m.status === 'Approved')
        const pool = approved.length ? approved : d?.din_matchings || []
        setLines(
          pool
            .slice()
            .sort((a, b) => a.matching_no - b.matching_no)
            .map((m) => lineFromMatching(m, suggest)),
        )
      })
      .catch((e: Error) => setError(e.message))
  }, [dinNumber])

  const totals = useMemo(() => {
    let meter = 0
    let amount = 0
    for (const l of lines) {
      const m = Number(l.meter) || 0
      const r = Number(l.rate) || 0
      meter += m
      amount += m * r
    }
    const disc = Number(discountPct) || 0
    const discountAmt = (amount * disc) / 100
    return {
      meter,
      amount,
      discountAmt,
      net: amount - discountAmt,
    }
  }, [lines, discountPct])

  function lineFromMatching(m: DinMatching, rate: string): LineDraft {
    return {
      key: crypto.randomUUID(),
      matching_no: m.matching_no,
      colour: matchingColourLabel(m),
      meter: '',
      rate: rate || '',
    }
  }

  function addMatchingLine() {
    const nextNo = (lines.reduce((max, l) => Math.max(max, l.matching_no), 0) || 0) + 1
    setLines((prev) => [
      ...prev,
      { key: crypto.randomUUID(), matching_no: nextNo, colour: '', meter: '', rate: suggestedRate },
    ])
  }

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !din) return
    const itemRows = lines
      .filter((l) => Number(l.meter) > 0)
      .map((l) => ({
        design_no: din.din_number,
        colour: l.colour.trim() || `Matching ${l.matching_no}`,
        qty_meter: Number(l.meter) || 0,
        rate: Number(l.rate) || 0,
        din_id: din.id,
        matching_no: l.matching_no,
      }))
    if (!party.trim() || !itemRows.length) {
      setError('Party and at least one matching line with meter are required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const header = {
        party_name: party.trim(),
        order_date: orderDate,
        payment_days: null as number | null,
        discount_pct: discountPct ? Number(discountPct) : null,
        delivery_requirement: delivery || null,
        payment_terms: paymentTerms || null,
        din_id: din.id,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'order_book',
        action: 'insert',
        recordId: null,
        payload: { ...header, items: itemRows },
        apply: async () => {
          const { data, error: oErr } = await supabase.from('order_book').insert(header).select('id').single()
          if (oErr) throw oErr
          const { error: iErr } = await supabase
            .from('order_book_items')
            .insert(itemRows.map((r) => ({ ...r, order_id: data.id })))
          if (iErr) throw iErr
        },
      })
      await updateDin(din.id, { status: 'Order Booked' })
      setMessage(
        result === 'applied'
          ? `Order booked · rates saved for Program & Dispatch (e.g. ₹${itemRows[0].rate} / Mtr)`
          : 'Sent to approval queue',
      )
      setLines((prev) => prev.map((l) => ({ ...l, meter: '' })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const approved = (din?.din_matchings || []).filter((m) => m.status === 'Approved')

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <div>
          <h1>Order Booking</h1>
          <p className="text-muted">Salesman-friendly booking — order rate auto-carries into Program &amp; Dispatch.</p>
        </div>
        <button type="button" className="btn-warp" onClick={() => onNavigate({ screen: 'dto-order-status', module: 'design-to-order' })}>
          Order Status
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form className="surface dto-panel" onSubmit={(e) => void saveOrder(e)}>
        <div className="dto-form-grid">
          <label className="field">
            <span>DIN No.</span>
            <select value={dinNumber} onChange={(e) => setDinNumber(e.target.value)} required>
              <option value="">Select DIN…</option>
              {dins.map((d) => (
                <option key={d.id} value={d.din_number}>
                  {d.din_number} · {d.design_name || '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Party</span>
            <input list="dto-ob-parties" value={party} onChange={(e) => setParty(e.target.value)} required />
            <datalist id="dto-ob-parties">
              {parties.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Order Date</span>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Delivery Requirement</span>
            <input value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="Date / note" />
          </label>
          <label className="field">
            <span>Payment Terms</span>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days" />
          </label>
          <label className="field">
            <span>Discount %</span>
            <input className="num" type="number" min="0" step="any" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          </label>
        </div>

        {din ? (
          <div className="dto-din-preview">
            <ImageLightbox src={din.din_image_url} alt={din.din_number} thumbClassName="dto-thumb-lg" />
            <div>
              <h2>{din.design_name || din.din_number}</h2>
              <p className="text-muted">
                <DtoStatusPill status={din.status} /> · Costing{' '}
                {din.final_cost_per_mtr != null ? `${fmtInrIn(din.final_cost_per_mtr)} / Mtr Inc. GST` : din.costing_status}
              </p>
              {din.base_cost_per_mtr != null ? (
                <p className="text-muted">
                  Base {fmtInrIn(din.base_cost_per_mtr)} · GST {din.gst_percent ?? 0}% · Final {fmtInrIn(din.final_cost_per_mtr)}
                </p>
              ) : null}
              <p>
                Suggested / previous rate:{' '}
                <strong>{suggestedRate ? `₹${suggestedRate} / Mtr` : '—'}</strong>
              </p>
              <p className="text-muted">
                Approved matchings: {approved.length || 'none yet — all matchings listed'}
              </p>
            </div>
          </div>
        ) : null}

        <div className="dto-panel-head">
          <h2 className="section-title">Order lines</h2>
          <button type="button" className="btn-warp" onClick={addMatchingLine}>
            + Add Matching
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Matching No.</th>
                <th>Colour</th>
                <th>Meter</th>
                <th>Rate / Meter</th>
                <th>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const amt = (Number(l.meter) || 0) * (Number(l.rate) || 0)
                return (
                  <tr key={l.key}>
                    <td>
                      <input
                        className="num"
                        type="number"
                        value={l.matching_no}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((x) => (x.key === l.key ? { ...x, matching_no: Number(e.target.value) || 0 } : x)),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={l.colour}
                        onChange={(e) =>
                          setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, colour: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        min="0"
                        step="any"
                        value={l.meter}
                        onChange={(e) =>
                          setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, meter: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="num"
                        type="number"
                        min="0"
                        step="any"
                        value={l.rate}
                        onChange={(e) =>
                          setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, rate: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="num">{fmtInrIn(amt)}</td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="dto-totals">
          <div>
            <span className="text-muted">Total Meter</span>
            <strong className="num">{totals.meter.toFixed(2)}</strong>
          </div>
          <div>
            <span className="text-muted">Amount</span>
            <strong className="num">{fmtInrIn(totals.amount)}</strong>
          </div>
          <div>
            <span className="text-muted">Discount</span>
            <strong className="num">{fmtInrIn(totals.discountAmt)}</strong>
          </div>
          <div>
            <span className="text-muted">Net Amount</span>
            <strong className="num">{fmtInrIn(totals.net)}</strong>
          </div>
        </div>

        <div className="dto-form-actions">
          <button type="submit" className="primary-save" disabled={busy}>
            Book Order
          </button>
        </div>
      </form>
    </div>
  )
}
