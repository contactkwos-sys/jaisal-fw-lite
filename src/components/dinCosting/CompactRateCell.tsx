import { useEffect, useId, useRef, useState } from 'react'
import { fmtInr, fmtMoney, type RateRowMeta } from '../../lib/designWiseCosting'
import { formatDisplayDate, gstLabel } from '../../lib/rateMaster'

type Props = {
  yarnLabel: string
  ratePerKg: string | number
  meta: RateRowMeta
  disabled?: boolean
  onUseRateMaster?: () => void
  isMissing?: boolean
  onAddRate?: () => void
}

/**
 * Compact rate meta under the Rate input: ⓘ View opens Rate Master breakdown.
 * Avoids long Rate Source text bloating the costing table.
 */
export function CompactRateCell({
  yarnLabel,
  ratePerKg,
  meta,
  disabled,
  onUseRateMaster,
  isMissing,
  onAddRate,
}: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (panelRef.current?.contains(t) || btnRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hasMaster = meta.rate_source === 'rate_master' && meta.rate_basic != null
  const isManual = meta.rate_source === 'manual'
  if (!hasMaster && !isManual && !isMissing) return null

  return (
    <div className="dwc-rate-compact">
      <div className="dwc-rate-compact-row">
        {hasMaster || isManual ? (
          <button
            ref={btnRef}
            type="button"
            className="dwc-rate-view-btn"
            aria-expanded={open}
            aria-controls={panelId}
            title="View rate details"
            onClick={() => setOpen((v) => !v)}
          >
            ⓘ View
          </button>
        ) : null}
        {isManual && !disabled && onUseRateMaster ? (
          <button type="button" className="btn-link" onClick={onUseRateMaster}>
            Use Rate Master
          </button>
        ) : null}
      </div>

      {isMissing ? (
        <small className="dwc-rate-missing">
          Rate not found
          {onAddRate ? (
            <>
              {' '}
              <button type="button" className="btn-link" onClick={onAddRate}>
                Add Rate
              </button>
            </>
          ) : null}
        </small>
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="dwc-rate-popover"
          role="dialog"
          aria-label="Rate Master details"
        >
          <div className="dwc-rate-popover-head">
            <strong>Rate Details</strong>
            <button type="button" className="dwc-icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <dl className="dwc-rate-popover-dl">
            <div>
              <dt>Rate Master Name</dt>
              <dd>{yarnLabel || '—'}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{hasMaster ? 'Rate Master' : isManual ? 'Manual Override' : '—'}</dd>
            </div>
            <div>
              <dt>Base Rate</dt>
              <dd className="num">{meta.rate_basic != null ? `${fmtInr(meta.rate_basic)}/kg` : '—'}</dd>
            </div>
            <div>
              <dt>GST %</dt>
              <dd>{gstLabel(meta.rate_gst_percent ?? 0)}</dd>
            </div>
            <div>
              <dt>GST Amount</dt>
              <dd className="num">{fmtInr(meta.rate_gst_amount ?? 0)}</dd>
            </div>
            <div>
              <dt>Freight / Packing</dt>
              <dd className="num">{fmtInr(meta.rate_freight ?? 0)}</dd>
            </div>
            <div>
              <dt>Final Rate</dt>
              <dd className="num dwc-emphasis">
                {ratePerKg !== '' && ratePerKg != null ? `₹${fmtMoney(Number(ratePerKg))}/kg` : '—'}
              </dd>
            </div>
            <div>
              <dt>Effective Date</dt>
              <dd>{meta.rate_effective_from ? formatDisplayDate(meta.rate_effective_from) : '—'}</dd>
            </div>
            {meta.rate_master_id ? (
              <div>
                <dt>Rate Master Record ID</dt>
                <dd className="dwc-mono">{meta.rate_master_id}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
