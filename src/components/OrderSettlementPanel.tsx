import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { applyOrQueue } from '../lib/mutate'
import {
  loadOrderSettlementRows,
  saveOrderAdjustment,
  type OrderSettlementRow,
} from '../lib/orderBookShared'

type Props = {
  /** Compact mode for embedding under Order Status */
  compact?: boolean
}

function statusFor(row: OrderSettlementRow): { label: string; className: string; diff: number } {
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

export function OrderSettlementPanel({ compact }: Props) {
  const { isCeo, profile } = useAuth()
  const [rows, setRows] = useState<OrderSettlementRow[]>([])
  const [sortBy, setSortBy] = useState<'party' | 'date'>('date')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [adjustItem, setAdjustItem] = useState<OrderSettlementRow | null>(null)
  const [adjustType, setAdjustType] = useState<'carry_forward' | 'write_off' | 'top_up_program'>('carry_forward')
  const [adjustReason, setAdjustReason] = useState('')

  const load = useCallback(async () => {
    const data = await loadOrderSettlementRows()
    setRows(data)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const sorted = useMemo(() => {
    const list = [...rows]
    if (sortBy === 'party') list.sort((a, b) => a.party.localeCompare(b.party))
    else list.sort((a, b) => (a.order_date < b.order_date ? 1 : -1))
    return list
  }, [rows, sortBy])

  const shortRows = useMemo(
    () => sorted.filter((r) => !r.settled && Math.abs(r.ordered - r.dispatched) > 0.01),
    [sorted],
  )

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
      const payload = {
        orderItemId: adjustItem.itemId,
        adjustmentType: adjustType,
        reason: adjustReason,
        meter,
        designNo: adjustItem.design_no,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'adjustment_notes',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          await saveOrderAdjustment(payload)
        },
      })
      setMessage(result === 'applied' ? 'Adjustment saved' : 'Sent to approval queue')
      setAdjustItem(null)
      setAdjustReason('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjust failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'order-settlement order-settlement-compact' : 'order-settlement party-report'}>
      <div className="otp-panel-head">
        <h2 className="section-title">{compact ? 'Settlement & Short Meter' : 'Party Delivery & Settlement'}</h2>
        {!compact ? (
          <p className="text-muted">
            Item-level ordered vs dispatched. Adjust short meter on legacy and DIN orders alike — no data is deleted.
          </p>
        ) : null}
      </div>

      <div className="segment">
        <button type="button" className={sortBy === 'date' ? 'seg active' : 'seg'} onClick={() => setSortBy('date')}>
          Sort date
        </button>
        <button type="button" className={sortBy === 'party' ? 'seg active' : 'seg'} onClick={() => setSortBy('party')}>
          Sort party
        </button>
        {compact ? (
          <span className="text-muted otp-hint-inline">{shortRows.length} short / pending lines</span>
        ) : null}
      </div>

      <div className="dash-table-wrap surface party-report-table">
        <table className="dash-table data-table">
          <thead>
            <tr>
              <th>Party</th>
              <th>Design / DIN</th>
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
            {(compact ? shortRows : sorted).map((row) => {
              const st = statusFor(row)
              return (
                <tr key={row.itemId}>
                  <td>{row.party}</td>
                  <td>
                    {row.design_no}
                    {row.isLegacy ? <span className="badge-muted legacy-tag"> legacy</span> : null}
                  </td>
                  <td>{row.colour}</td>
                  <td>{row.order_date}</td>
                  <td className="num">{row.ordered.toFixed(1)}</td>
                  <td className="num">{row.programmed.toFixed(1)}</td>
                  <td className="num">{row.dispatched.toFixed(1)}</td>
                  <td className={`num ${st.diff > 0.01 ? 'text-danger' : 'text-sage'}`}>{st.diff.toFixed(1)}</td>
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
        {!(compact ? shortRows : sorted).length ? (
          <p className="text-muted">{compact ? 'No short meter lines' : 'No order lines yet'}</p>
        ) : null}
      </div>

      {adjustItem ? (
        <div className="adjust-panel surface">
          <h3 className="section-title">Adjust difference</h3>
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

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
