/**
 * Edit modal for an existing Filled Pipe (Godown) record.
 * Reuses the same field structure as the create entry form.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MACHINES } from '../../lib/database.types'
import { fetchAllRates, lookupRate, WARP_CATALOGUE, type RateMasterRow } from '../../lib/rateMaster'
import {
  DEFAULT_MULTIPLIER,
  FILLED_PIPE_ENTRY_TYPES,
  GODOWN_OPTIONS,
  PIPE_STOCK_LABELS,
  calcAmount,
  calcTotalMeter,
  composeGodownLocation,
  formatNum,
  pipeToFilledPipeInput,
  type FilledPipeEntryInput,
  type FilledPipeEntryType,
  type WarpPipe,
} from '../../lib/warpYarn'

type Props = {
  pipe: WarpPipe
  busy: boolean
  onClose: () => void
  onSave: (input: FilledPipeEntryInput) => void
}

export function EditFilledPipeModal({ pipe, busy, onClose, onSave }: Props) {
  const [form, setForm] = useState<FilledPipeEntryInput>(() => pipeToFilledPipeInput(pipe))
  const [rates, setRates] = useState<RateMasterRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const totalMeter = useMemo(
    () => calcTotalMeter(Number(form.meter) || 0, Number(form.multiplier) || 0),
    [form.meter, form.multiplier],
  )

  const balanceMeter = useMemo(
    () => Math.max(0, totalMeter - (Number(pipe.used_meter) || 0)),
    [totalMeter, pipe.used_meter],
  )

  const amount = useMemo(
    () => calcAmount(Number(form.weight_kg) || 0, Number(form.rate_per_kg) || 0),
    [form.weight_kg, form.rate_per_kg],
  )

  const applyRateLookup = useCallback(
    (quality: string, denier: string, entryDate: string, manual = false) => {
      if (manual) return
      const result = lookupRate(rates, 'warp', quality, entryDate, { denier })
      if (result) {
        setForm((f) => ({
          ...f,
          rate_per_kg: result.calc.effectiveRate,
          rate_source: 'Rate Master',
          rate_effective_from: result.row.effective_from,
          rate_master_id: result.row.id,
          amount: calcAmount(f.weight_kg, result.calc.effectiveRate),
        }))
      }
    },
    [rates],
  )

  useEffect(() => {
    void fetchAllRates()
      .then(setRates)
      .catch(() => setRates([]))
  }, [])

  useEffect(() => {
    applyRateLookup(form.yarn_quality, form.yarn_specification, form.entry_date, form.manual_rate_override)
  }, [form.yarn_quality, form.yarn_specification, form.entry_date, form.manual_rate_override, applyRateLookup])

  useEffect(() => {
    setForm((f) => ({ ...f, amount }))
  }, [amount])

  const showWarper = form.entry_type === 'Receive from Warper'
  const showSupplier =
    form.entry_type === 'Purchase / Yarn Inward' || form.entry_type === 'Manual Stock Entry'
  const showMachine = form.entry_type === 'Return from Machine'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (Number(pipe.used_meter) > totalMeter) {
        throw new Error(
          `Total meter (${formatNum(totalMeter)}) cannot be less than used meter (${formatNum(pipe.used_meter)})`,
        )
      }
      onSave({ ...form, amount })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed')
    }
  }

  return (
    <div className="wym-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="wym-modal surface wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit Filled Pipe ${pipe.pipe_no}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wym-modal-head">
          <h2>Edit Filled Pipe · {pipe.pipe_no}</h2>
          <button type="button" className="btn-ghost icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="fpg-form-grid">
            <label className="field">
              <span>Entry Date</span>
              <input
                type="date"
                required
                value={form.entry_date}
                onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Transaction Type</span>
              <select
                value={form.entry_type}
                onChange={(e) => setForm({ ...form, entry_type: e.target.value as FilledPipeEntryType })}
              >
                {FILLED_PIPE_ENTRY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Pipe No.</span>
              <input readOnly value={pipe.pipe_no} className="fpg-readonly" />
            </label>
            <label className="field">
              <span>Yarn Quality</span>
              <select
                required
                value={form.yarn_quality}
                onChange={(e) => {
                  const item = WARP_CATALOGUE.find((w) => w.item_name === e.target.value)
                  setForm({
                    ...form,
                    yarn_quality: e.target.value,
                    yarn_specification: item?.denier || '',
                    manual_rate_override: false,
                  })
                }}
              >
                {WARP_CATALOGUE.map((w) => (
                  <option key={w.item_name} value={w.item_name}>
                    {w.item_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Denier / Spec</span>
              <input readOnly className="fpg-readonly" value={form.yarn_specification || '—'} />
            </label>
            {showSupplier ? (
              <label className="field">
                <span>Supplier</span>
                <input
                  value={form.supplier}
                  onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                />
              </label>
            ) : null}
            {showWarper ? (
              <label className="field">
                <span>Warper Name</span>
                <input
                  required
                  value={form.warper_name}
                  onChange={(e) => setForm({ ...form, warper_name: e.target.value })}
                />
              </label>
            ) : null}
            {showMachine ? (
              <label className="field">
                <span>Machine</span>
                <select value={form.machine_no} onChange={(e) => setForm({ ...form, machine_no: e.target.value })}>
                  <option value="">Select</option>
                  {MACHINES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field">
              <span>Meter per Pipe</span>
              <input
                type="number"
                min={0}
                step="0.01"
                required
                value={form.meter || ''}
                onChange={(e) => setForm({ ...form, meter: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span>Multiplier</span>
              <input
                type="number"
                min={1}
                step={1}
                required
                value={form.multiplier}
                onChange={(e) => setForm({ ...form, multiplier: Number(e.target.value) || DEFAULT_MULTIPLIER })}
              />
            </label>
            <label className="field">
              <span>Total Meter</span>
              <input readOnly className="fpg-readonly fpg-total" value={`${formatNum(totalMeter)} MTR`} />
            </label>
            <label className="field">
              <span>Used Meter</span>
              <input readOnly className="fpg-readonly" value={`${formatNum(pipe.used_meter)} MTR`} />
            </label>
            <label className="field">
              <span>Balance Meter</span>
              <input readOnly className="fpg-readonly fpg-total" value={`${formatNum(balanceMeter)} MTR`} />
            </label>
            <label className="field">
              <span>Weight (kg)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.weight_kg || ''}
                onChange={(e) => setForm({ ...form, weight_kg: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="field">
              <span>Rate ₹/kg</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.rate_per_kg || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    rate_per_kg: Number(e.target.value) || 0,
                    manual_rate_override: true,
                    rate_source: 'Manual Override',
                  })
                }
              />
            </label>
            <label className="field">
              <span>Amount ₹</span>
              <input readOnly className="fpg-readonly" value={`₹${formatNum(amount, 2)}`} />
            </label>
            <label className="field">
              <span>Godown</span>
              <select value={form.godown_name} onChange={(e) => setForm({ ...form, godown_name: e.target.value })}>
                {GODOWN_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Rack</span>
              <input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} />
            </label>
            <label className="field">
              <span>Bay / Location</span>
              <input value={form.bay} onChange={(e) => setForm({ ...form, bay: e.target.value })} />
            </label>
            <label className="field">
              <span>Status</span>
              <select value={form.stock_label} onChange={(e) => setForm({ ...form, stock_label: e.target.value })}>
                {PIPE_STOCK_LABELS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="field fpg-span-2">
              <span>Remarks</span>
              <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </label>
          </div>

          <div className="fpg-rate-banner">
            <span>
              <strong>Rate Source:</strong> {form.rate_source}
            </span>
            <span>
              <strong>Location:</strong> {composeGodownLocation(form.godown_name, form.rack, form.bay)}
            </span>
            {pipe.updated_by ? (
              <span>
                <strong>Last edited by:</strong> {pipe.updated_by}
              </span>
            ) : null}
          </div>

          {error ? <p className="text-danger">{error}</p> : null}

          <div className="wym-modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn-warp" disabled={busy}>
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
