/**
 * Legacy Order Book — settlement & party delivery only.
 * New customer fabric orders: Sales & Order → Customer Order (OrderToProgramScreen).
 */
import { useEffect } from 'react'
import type { NavTarget } from '../lib/nav'
import { OrderSettlementPanel } from '../components/OrderSettlementPanel'

type Props = {
  initialSub?: string
  onNavigate?: (t: NavTarget) => void
}

export function OrderBookScreen({ initialSub, onNavigate }: Props) {
  useEffect(() => {
    if (initialSub === 'entry' && onNavigate) {
      onNavigate({ screen: 'order-to-program', filter: 'order-entry', module: 'order-to-program' })
    }
  }, [initialSub, onNavigate])

  if (initialSub === 'entry') {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>Customer Order</h1>
        </header>
        <p className="text-muted">Redirecting to Sales &amp; Order → Customer Order…</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Party Delivery &amp; Settlement</h1>
        <p className="text-muted">
          Old order entry has moved to{' '}
          <strong>Sales &amp; Order → Customer Order</strong>. All historical order records are preserved.
        </p>
        {onNavigate ? (
          <button
            type="button"
            className="primary-save"
            onClick={() =>
              onNavigate({ screen: 'order-to-program', filter: 'order-entry', module: 'order-to-program' })
            }
          >
            Open Customer Order
          </button>
        ) : null}
      </header>
      <OrderSettlementPanel />
    </div>
  )
}
