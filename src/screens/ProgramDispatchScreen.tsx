import type { NavTarget } from '../lib/nav'
import { PdChallan } from '../components/pd/PdChallan'
import { PdEntry } from '../components/pd/PdEntry'
import { PdFolding } from '../components/pd/PdFolding'
import { PdGatePass } from '../components/pd/PdGatePass'
import { PdHub } from '../components/pd/PdHub'
import { PdInvoice } from '../components/pd/PdInvoice'
import { PdReports } from '../components/pd/PdReports'
import { PdTracking } from '../components/pd/PdTracking'

export type PdSub =
  | 'pto'
  | 'entry'
  | 'tracking'
  | 'folding'
  | 'challan'
  | 'gatepass'
  | 'invoice'
  | 'reports'

type Props = {
  initialSub?: string
  onNavigate: (t: NavTarget) => void
}

export function ProgramDispatchScreen({ initialSub = 'pto', onNavigate }: Props) {
  const sub = (['pto', 'entry', 'tracking', 'folding', 'challan', 'gatepass', 'invoice', 'reports'].includes(
    initialSub || '',
  )
    ? initialSub
    : 'pto') as PdSub

  function go(next: PdSub) {
    onNavigate({ screen: 'program-dispatch', sub: next, module: 'production' })
  }

  return (
    <div className="screen pd-screen">
      {sub === 'pto' ? <PdHub onGo={go} onNavigate={onNavigate} /> : null}
      {sub === 'entry' ? <PdEntry /> : null}
      {sub === 'tracking' ? <PdTracking onGo={go} /> : null}
      {sub === 'folding' ? <PdFolding onGo={go} /> : null}
      {sub === 'challan' ? <PdChallan onGo={go} /> : null}
      {sub === 'gatepass' ? <PdGatePass onGo={go} /> : null}
      {sub === 'invoice' ? <PdInvoice onGo={go} /> : null}
      {sub === 'reports' ? <PdReports /> : null}
    </div>
  )
}
