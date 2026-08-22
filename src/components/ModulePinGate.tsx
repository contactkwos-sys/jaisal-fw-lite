import { useState } from 'react'
import { PinPad } from './PinPad'
import type { MainModuleId } from '../lib/nav'
import { moduleById } from '../lib/nav'
import { unlockModule, verifyModulePin } from '../lib/ceoPinManagement'

type Props = {
  moduleId: MainModuleId
  onUnlocked: () => void
  onCancel?: () => void
}

export function ModulePinGate({ moduleId, onUnlocked, onCancel }: Props) {
  const mod = moduleById(moduleId)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (pin.length !== 4) {
      setError('Enter 4-digit module PIN')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const ok = await verifyModulePin(moduleId, pin)
      if (!ok) {
        setError('Invalid module PIN')
        setPin('')
        return
      }
      unlockModule(moduleId)
      onUnlocked()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="module-pin-gate-overlay" role="dialog" aria-modal="true" aria-labelledby="module-pin-title">
      <div className="module-pin-gate-card surface">
        <h2 id="module-pin-title" className="module-pin-gate-title">{mod.label}</h2>
        <p className="text-muted">Enter the module PIN to continue. CEO access bypasses this gate.</p>
        <PinPad value={pin} onChange={setPin} disabled={busy} />
        {error ? <p className="form-error">{error}</p> : null}
        <div className="module-pin-gate-actions">
          {onCancel ? (
            <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
              Back
            </button>
          ) : null}
          <button type="button" className="primary-save" disabled={busy || pin.length !== 4} onClick={() => void submit()}>
            {busy ? 'Checking…' : 'Unlock module'}
          </button>
        </div>
      </div>
    </div>
  )
}
