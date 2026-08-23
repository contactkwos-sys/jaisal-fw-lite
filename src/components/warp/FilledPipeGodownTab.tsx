/**
 * Godown – Filled Pipes: primary data entry + stock management tab.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MACHINES } from '../../lib/database.types'
import { fetchAllRates, lookupRate, WARP_CATALOGUE, type RateMasterRow } from '../../lib/rateMaster'
import { supabase } from '../../lib/supabase'
import { applyEditDeleteOrQueue } from '../../lib/pendingApprovals'
import {
  DEFAULT_MULTIPLIER,
  FILLED_PIPE_ENTRY_TYPES,
  GODOWN_OPTIONS,
  PIPE_STOCK_LABELS,
  calcAmount,
  calcTotalMeter,
  composeGodownLocation,
  emptyWarpFilters,
  filterPipes,
  formatNum,
  lastTxnForPipe,
  pipeStockLabel,
  saveFilledPipeEntry,
  statusBadgeClass,
  todayISO,
  updateFilledPipe,
  canEditFilledPipe,
  canDeleteFilledPipe,
  deleteFilledPipe,
  normalizePipeNoInput,
  nextPipeNo,
  type FilledPipeEntryInput,
  type FilledPipeEntryType,
  type WarpPipe,
  type WarpYarnFilters,
  type WarpYarnTransaction,
} from '../../lib/warpYarn'
import { EditFilledPipeModal } from './EditFilledPipeModal'
import { WarpRecordActions } from './WarpRecordActions'

type Props = {
  pipes: WarpPipe[]
  txns: WarpYarnTransaction[]
  busy: boolean
  userName: string
  isCeo: boolean
  onPipeClick: (pipe: WarpPipe) => void
  onSaved: () => Promise<void>
  onReceiveWarper: () => void
  onIssueMachine: () => void
  onReturnMachine: () => void
}

const EMPTY_FORM = (): FilledPipeEntryInput => ({
  pipe_no: '',
  entry_date: todayISO(),
  entry_type: 'Receive from Warper',
  yarn_quality: WARP_CATALOGUE[0].item_name,
  yarn_specification: WARP_CATALOGUE[0].denier,
  meter: 0,
  multiplier: 1,
  weight_kg: 0,
  rate_per_kg: 0,
  amount: 0,
  rate_source: 'Rate Master',
  rate_effective_from: null,
  rate_master_id: null,
  godown_name: 'Godown A',
  rack: '',
  bay: '',
  stock_label: 'Filled',
  warper_name: '',
  machine_no: '',
  supplier: '',
  remarks: '',
  manual_rate_override: false,
})

export function FilledPipeGodownTab({
  pipes,
  txns,
  busy,
  userName,
  isCeo,
  onPipeClick,
  onSaved,
  onReceiveWarper,
  onIssueMachine,
  onReturnMachine,
}: Props) {
  const [form, setForm] = useState<FilledPipeEntryInput>(EMPTY_FORM)
  const [rates, setRates] = useState<RateMasterRow[]>([])
  const [nextPipePreview, setNextPipePreview] = useState('…')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [searchFilters, setSearchFilters] = useState<WarpYarnFilters>(emptyWarpFilters())
  const [editPipe, setEditPipe] = useState<WarpPipe | null>(null)
  const [saving, setSaving] = useState(false)

  const godownStock = useMemo(
    () =>
      pipes
        .filter((p) => p.status === 'FILLED_GODOWN' && Number(p.balance_meter) > 0)
        .sort((a, b) => a.pipe_no.localeCompare(b.pipe_no)),
    [pipes],
  )

  const searchedStock = useMemo(() => filterPipes(godownStock, searchFilters), [godownStock, searchFilters])

  const totalMeter = useMemo(
    () => calcTotalMeter(Number(form.meter) || 0, Number(form.multiplier) || 0),
    [form.meter, form.multiplier],
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
      } else {
        setForm((f) => ({
          ...f,
          rate_source: 'Manual Override',
          rate_effective_from: null,
          rate_master_id: null,
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
    void nextPipeNo(supabase).then(setNextPipePreview).catch(() => setNextPipePreview('BP-00001'))
  }, [godownStock.length])

  const displayPipeNo = useMemo(() => {
    if (form.pipe_no?.trim()) return normalizePipeNoInput(form.pipe_no, nextPipePreview)
    return nextPipePreview
  }, [form.pipe_no, nextPipePreview])

  useEffect(() => {
    applyRateLookup(form.yarn_quality, form.yarn_specification, form.entry_date, form.manual_rate_override)
  }, [form.yarn_quality, form.yarn_specification, form.entry_date, form.manual_rate_override, applyRateLookup])

  useEffect(() => {
    setForm((f) => ({ ...f, amount }))
  }, [amount])

  function resetForm(keepType = false) {
    const base = EMPTY_FORM()
    setForm({
      ...base,
      entry_type: keepType ? form.entry_type : base.entry_type,
      entry_date: todayISO(),
    })
    setError(null)
  }

  async function handleSave(saveAndNew: boolean) {
    setError(null)
    setMessage(null)
    try {
      const pipe = await saveFilledPipeEntry(supabase, { ...form, amount }, userName)
      await onSaved()
      setMessage(`Saved ${pipe.pipe_no} · ${formatNum(pipe.total_meter)} MTR in godown`)
      if (saveAndNew) resetForm(true)
      else resetForm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  async function handleDelete(pipe: WarpPipe) {
    if (!window.confirm(`Delete pipe ${pipe.pipe_no}? This cannot be undone.`)) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: pipe.created_at,
        tableName: 'warp_pipes',
        recordId: pipe.id,
        action: 'delete',
        requestedBy: userName,
        newData: { id: pipe.id },
        apply: async () => {
          await deleteFilledPipe(supabase, pipe.id)
        },
      })
      await onSaved()
      setMessage(
        result === 'applied'
          ? `Pipe ${pipe.pipe_no} deleted.`
          : `Delete queued for CEO approval · ${pipe.pipe_no}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleEditSave(input: FilledPipeEntryInput) {
    if (!editPipe) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: editPipe.created_at,
        tableName: 'warp_pipes',
        recordId: editPipe.id,
        action: 'edit',
        requestedBy: userName,
        newData: input as unknown as Record<string, unknown>,
        apply: async () => {
          await updateFilledPipe(supabase, editPipe.id, input, userName, editPipe)
        },
      })
      await onSaved()
      setEditPipe(null)
      setMessage(
        result === 'applied'
          ? `Pipe ${editPipe.pipe_no} updated successfully.`
          : `Edit queued for CEO approval · ${editPipe.pipe_no}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update this record. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const showWarper = form.entry_type === 'Receive from Warper'
  const showSupplier =
    form.entry_type === 'Purchase / Yarn Inward' || form.entry_type === 'Manual Stock Entry'
  const showMachine = form.entry_type === 'Return from Machine'

  return (
    <section className="wym-section fpg-section">
      <article className="surface fpg-entry-card">
        <header className="fpg-entry-header">
          <div>
            <h2 className="section-title">Filled Pipe Entry</h2>
            <p className="text-muted fpg-subtitle">Direct entry into Godown stock · enter pipe number or leave blank to auto-generate</p>
          </div>
          <div className="fpg-quick-links">
            <button type="button" className="btn-ghost btn-sm" onClick={onReceiveWarper}>
              + Receive from Warper
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={onIssueMachine}>
              + Issue to Machine
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={onReturnMachine}>
              + Return from Machine
            </button>
          </div>
        </header>

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
            <input
              value={form.pipe_no}
              onChange={(e) => setForm({ ...form, pipe_no: e.target.value })}
              placeholder={nextPipePreview}
              title="Enter pipe number (e.g. 1, 10, BP-00015). Leave blank to auto-generate."
            />
            <span className="text-muted" style={{ fontSize: '0.8rem' }}>
              Next auto: {nextPipePreview} · Type 1–15 for existing stock
            </span>
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
            <input
              readOnly
              className="fpg-readonly"
              value={form.yarn_specification || '—'}
            />
          </label>
          {showSupplier ? (
            <label className="field">
              <span>Supplier</span>
              <input
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                placeholder="Supplier name"
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
            <input value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} placeholder="Rack 02" />
          </label>
          <label className="field">
            <span>Bay / Location</span>
            <input value={form.bay} onChange={(e) => setForm({ ...form, bay: e.target.value })} placeholder="Bay" />
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
          {form.rate_effective_from ? (
            <span>
              <strong>Effective Date:</strong> {form.rate_effective_from}
            </span>
          ) : null}
          <span>
            <strong>Location:</strong> {composeGodownLocation(form.godown_name, form.rack, form.bay)}
          </span>
        </div>

        <div className="fpg-summary surface">
          <h3 className="fpg-summary-title">Entry Summary</h3>
          <dl className="fpg-summary-grid">
            <div>
              <dt>Pipe No.</dt>
              <dd>{displayPipeNo}</dd>
            </div>
            <div>
              <dt>Quality</dt>
              <dd>{form.yarn_quality}</dd>
            </div>
            <div>
              <dt>Denier</dt>
              <dd>{form.yarn_specification || '—'}</dd>
            </div>
            <div>
              <dt>Meter</dt>
              <dd>{formatNum(form.meter)}</dd>
            </div>
            <div>
              <dt>Multiplier</dt>
              <dd>{formatNum(form.multiplier)}</dd>
            </div>
            <div>
              <dt>Total Meter</dt>
              <dd>{formatNum(totalMeter)} MTR</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{formatNum(form.weight_kg, 2)} KG</dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>₹{formatNum(form.rate_per_kg, 2)}/KG</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>₹{formatNum(amount, 2)}</dd>
            </div>
            <div>
              <dt>Godown</dt>
              <dd>{composeGodownLocation(form.godown_name, form.rack, form.bay)}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{form.stock_label}</dd>
            </div>
          </dl>
        </div>

        {error ? <p className="text-danger">{error}</p> : null}
        {message ? <p className="text-success">{message}</p> : null}

        <div className="fpg-actions">
          <button type="button" className="btn-ghost" onClick={() => resetForm()} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-warp" disabled={busy} onClick={() => void handleSave(false)}>
            Save Entry
          </button>
          <button type="button" className="btn-warp" disabled={busy} onClick={() => void handleSave(true)}>
            Save &amp; New
          </button>
        </div>
      </article>

      <article className="surface fpg-stock-card">
        <h2 className="section-title">Current Filled Pipe Stock</h2>
        <div className="wym-table-wrap">
          <table className="wym-table fpg-stock-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Pipe No.</th>
                <th>Yarn Quality</th>
                <th>Denier</th>
                <th>Meter/Pipe</th>
                <th>Multiplier</th>
                <th>Total Meter</th>
                <th>Used Meter</th>
                <th>Balance Meter</th>
                <th>Weight</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Godown</th>
                <th>Location</th>
                <th>Status</th>
                <th>Last Transaction</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {godownStock.map((p, idx) => {
                const lastTxn = lastTxnForPipe(p, txns)
                return (
                  <tr key={p.id}>
                    <td className="num">{idx + 1}</td>
                    <td>
                      <button type="button" className="wym-pipe-link" onClick={() => onPipeClick(p)}>
                        {p.pipe_no}
                      </button>
                    </td>
                    <td>{p.yarn_quality || '—'}</td>
                    <td>{p.yarn_specification || '—'}</td>
                    <td className="num">{formatNum(p.meter)}</td>
                    <td className="num">{formatNum(p.multiplier)}</td>
                    <td className="num">{formatNum(p.total_meter)}</td>
                    <td className="num">{formatNum(p.used_meter)}</td>
                    <td className="num">{formatNum(p.balance_meter)}</td>
                    <td className="num">{formatNum(p.weight_kg, 2)}</td>
                    <td className="num">{formatNum(p.rate_per_kg ?? 0, 2)}</td>
                    <td className="num">{formatNum(p.amount ?? 0, 2)}</td>
                    <td>{p.godown_name || '—'}</td>
                    <td>{p.rack || p.location || '—'}</td>
                    <td>
                      <span className={statusBadgeClass(pipeStockLabel(p))}>{pipeStockLabel(p)}</span>
                    </td>
                    <td>{lastTxn ? `${lastTxn.txn_date} · ${lastTxn.txn_type}` : '—'}</td>
                    <td>
                      <WarpRecordActions
                        busy={busy || saving}
                        canEdit={canEditFilledPipe(p)}
                        canDelete={canDeleteFilledPipe(p)}
                        onView={() => onPipeClick(p)}
                        onEdit={() => setEditPipe(p)}
                        onDelete={() => void handleDelete(p)}
                      />
                    </td>
                  </tr>
                )
              })}
              {!godownStock.length ? (
                <tr>
                  <td colSpan={17} className="text-muted">
                    No filled pipes in godown yet — use the entry form above
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </article>

      <article className="surface fpg-search-card">
        <h2 className="section-title">Stock Search / Filter</h2>
        <div className="wym-filters fpg-search-filters">
          <label className="field">
            <span className="text-muted">Search Pipe No.</span>
            <input
              value={searchFilters.pipeNo}
              onChange={(e) => setSearchFilters((f) => ({ ...f, pipeNo: e.target.value }))}
              placeholder="BP-00001"
            />
          </label>
          <label className="field">
            <span className="text-muted">Yarn Quality</span>
            <input
              value={searchFilters.quality}
              onChange={(e) => setSearchFilters((f) => ({ ...f, quality: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Warper</span>
            <input
              value={searchFilters.warper}
              onChange={(e) => setSearchFilters((f) => ({ ...f, warper: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Machine</span>
            <select
              value={searchFilters.machine}
              onChange={(e) => setSearchFilters((f) => ({ ...f, machine: e.target.value }))}
            >
              <option value="">All</option>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Status</span>
            <select
              value={searchFilters.status}
              onChange={(e) => setSearchFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">All</option>
              {PIPE_STOCK_LABELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Godown</span>
            <select
              value={searchFilters.godown}
              onChange={(e) => setSearchFilters((f) => ({ ...f, godown: e.target.value }))}
            >
              <option value="">All</option>
              {GODOWN_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">From Date</span>
            <input
              type="date"
              value={searchFilters.dateFrom}
              onChange={(e) => setSearchFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">To Date</span>
            <input
              type="date"
              value={searchFilters.dateTo}
              onChange={(e) => setSearchFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </label>
          <button type="button" className="btn-warp wym-clear" onClick={() => setSearchFilters(emptyWarpFilters())}>
            Clear
          </button>
        </div>

        {searchFilters.pipeNo ||
        searchFilters.quality ||
        searchFilters.warper ||
        searchFilters.machine ||
        searchFilters.status ||
        searchFilters.godown ||
        searchFilters.dateFrom ||
        searchFilters.dateTo ? (
          <div className="wym-table-wrap">
            <table className="wym-table">
              <thead>
                <tr>
                  <th>Pipe No.</th>
                  <th>Quality</th>
                  <th>Total Meter</th>
                  <th>Balance</th>
                  <th>Godown</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {searchedStock.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <button type="button" className="wym-pipe-link" onClick={() => onPipeClick(p)}>
                        {p.pipe_no}
                      </button>
                    </td>
                    <td>{p.yarn_quality || '—'}</td>
                    <td className="num">{formatNum(p.total_meter)}</td>
                    <td className="num">{formatNum(p.balance_meter)}</td>
                    <td>{p.godown_name || p.location}</td>
                    <td>
                      <span className={statusBadgeClass(pipeStockLabel(p))}>{pipeStockLabel(p)}</span>
                    </td>
                  </tr>
                ))}
                {!searchedStock.length ? (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No pipes match filters
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>

      {editPipe ? (
        <EditFilledPipeModal
          pipe={editPipe}
          busy={busy || saving}
          onClose={() => setEditPipe(null)}
          onSave={(input) => void handleEditSave(input)}
        />
      ) : null}
    </section>
  )
}
