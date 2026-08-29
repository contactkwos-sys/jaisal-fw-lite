import { useEffect } from 'react'
import type { NavTarget } from '../lib/nav'

type Props = { onNavigate: (t: NavTarget) => void }

/**
 * Design Intake is retired as a parallel OCR/upload screen.
 * All design-sheet import + costing lives on DIN Costing (single path).
 */
export function DinIntakeScreen({ onNavigate }: Props) {
  useEffect(() => {
    onNavigate({ screen: 'design-wise-costing', module: 'design-to-order' })
  }, [onNavigate])

  return (
    <div className="screen dto-screen">
      <header className="screen-header">
        <h1>Design Intake → DIN Costing</h1>
        <p className="text-muted">
          Design photo OCR and costing now live on one page. Redirecting to DIN Costing…
        </p>
      </header>
      <section className="surface dto-panel">
        <p className="text-muted2">
          Use <strong>Design → DIN Costing</strong> → section <strong>1 · Design Import</strong> to upload
          a sheet photo (Gmail / Photo / File). Same Tesseract OCR — no API key.
        </p>
        <button
          type="button"
          className="primary-save"
          onClick={() => onNavigate({ screen: 'design-wise-costing', module: 'design-to-order' })}
        >
          Open DIN Costing
        </button>
      </section>
    </div>
  )
}
