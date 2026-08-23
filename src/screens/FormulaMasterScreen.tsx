import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  FORMULA_DEFAULTS,
  fetchFormulaMaster,
  updateFormulaMaster,
  type FormulaMasterConfig,
} from '../lib/formulaMaster'
import { fmtQty } from '../lib/designWiseCosting'

export function FormulaMasterScreen() {
  const { session, isCeo, isManager, roleName } = useAuth()
  const role = (roleName || '').trim().toLowerCase()
  const canEdit =
    isCeo ||
    isManager ||
    role === 'md' ||
    role === 'managing director' ||
    role === 'owner' ||
    role.includes('ceo') ||
    role === 'admin'

  const [config, setConfig] = useState<FormulaMasterConfig | null>(null)
  const [form, setForm] = useState(FORMULA_DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchFormulaMaster()
      setConfig(data)
      setForm({
        calc_factor: data.calc_factor,
        default_base_length_mtr: data.default_base_length_mtr,
        default_wastage_mtr: data.default_wastage_mtr,
        default_wastage_percent: data.default_wastage_percent,
        default_usable_length_mtr: data.default_usable_length_mtr,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load formula master')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!canEdit) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await updateFormulaMaster(form, session?.user?.id || null)
      await load()
      setMessage('Formula Master saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>Formula Master</h1>
          <p className="text-muted">CEO / Admin only</p>
        </header>
        <p className="form-error text-danger">You do not have permission to edit Formula Master.</p>
      </div>
    )
  }

  return (
    <div className="screen dwc-screen">
      <header className="screen-header">
        <h1>Formula Master</h1>
        <p className="text-muted">
          Fixed DIN Costing parameters — editable here only, not on the costing screen
        </p>
      </header>

      <section className="dwc-panel">
        <h2 className="section-title">Default Fixed Values</h2>
        <div className="dwc-details-row">
          <label className="field">
            <span className="text-muted">Calculation Factor</span>
            <input
              className="num"
              type="number"
              min="1"
              step="1"
              value={form.calc_factor}
              onChange={(e) => setForm((f) => ({ ...f, calc_factor: Number(e.target.value) }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Base Length (Mtr)</span>
            <input
              className="num"
              type="number"
              min="1"
              step="any"
              value={form.default_base_length_mtr}
              onChange={(e) =>
                setForm((f) => ({ ...f, default_base_length_mtr: Number(e.target.value) }))
              }
            />
          </label>
          <label className="field">
            <span className="text-muted">Wastage (Mtr)</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={form.default_wastage_mtr}
              onChange={(e) => setForm((f) => ({ ...f, default_wastage_mtr: Number(e.target.value) }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Wastage %</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={form.default_wastage_percent}
              onChange={(e) =>
                setForm((f) => ({ ...f, default_wastage_percent: Number(e.target.value) }))
              }
            />
          </label>
          <label className="field">
            <span className="text-muted">Usable / Costing Length (Mtr)</span>
            <input
              className="num"
              type="number"
              min="1"
              step="any"
              value={form.default_usable_length_mtr}
              onChange={(e) =>
                setForm((f) => ({ ...f, default_usable_length_mtr: Number(e.target.value) }))
              }
            />
          </label>
        </div>
        {config?.updated_at ? (
          <p className="text-muted2">
            Last updated {new Date(config.updated_at).toLocaleString('en-IN')}
          </p>
        ) : null}
        <div className="dwc-actions">
          <button type="button" className="primary-save" disabled={busy} onClick={() => void save()}>
            Save Formula Master
          </button>
        </div>
        {error ? <p className="form-error text-danger">{error}</p> : null}
        {message ? <p className="form-ok text-sage">{message}</p> : null}
      </section>

      <section className="dwc-panel dwc-view-note">
        <p className="text-muted2">
          Preview: Entered {fmtQty(form.default_base_length_mtr, 0)} mtr · Wastage{' '}
          {fmtQty(form.default_wastage_mtr, 0)} mtr ({fmtQty(form.default_wastage_percent, 0)}%) ·
          Usable {fmtQty(form.default_usable_length_mtr, 0)} mtr · Factor{' '}
          {form.calc_factor.toLocaleString('en-IN')}
        </p>
      </section>
    </div>
  )
}
