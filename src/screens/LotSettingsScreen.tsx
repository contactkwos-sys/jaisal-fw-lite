import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { peekNextLotNumber, setNextLotNumber } from '../lib/checking'

export function LotSettingsScreen() {
  const { isCeo, isManager } = useAuth()
  const [nextLot, setNextLot] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const canEdit = isCeo || isManager

  const load = useCallback(async () => {
    const n = await peekNextLotNumber()
    setNextLot(String(n))
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!canEdit) {
      setError('Manager / CEO only')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await setNextLotNumber(Number(nextLot))
      setMessage(`Next lot number set to ${nextLot}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Lot Number Settings</h1>
        <p className="text-muted">Masters · starting / next lot for Checking</p>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}
      <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
        <label className="field">
          <span>Next lot number to use</span>
          <input
            className="num"
            inputMode="numeric"
            type="number"
            min={1}
            value={nextLot}
            onChange={(e) => setNextLot(e.target.value)}
            disabled={!canEdit}
            required
          />
        </label>
        <button type="submit" disabled={busy || !canEdit}>
          {busy ? 'Saving…' : 'Save starting point'}
        </button>
      </form>
    </div>
  )
}
