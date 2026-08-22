import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/mutate'
import {
  WARP_CATALOGUE,
  WEFT_CATALOGUE,
  calcEffectiveRate,
  deactivateRate,
  fetchAllRates,
  fetchRateMasterConfig,
  formatDisplayDate,
  fmtInrRate,
  gstLabel,
  historyForItem,
  latestRateForItem,
  saveRateMasterEntry,
  updateRateMasterConfig,
  type RateCategory,
  type RateMasterInput,
  type RateMasterRow,
} from '../lib/rateMaster'

type Tab = 'warp' | 'weft'

type FormState = {
  category: RateCategory
  item_name: string
  denier: string
  supplier_name: string
  basic_rate: string
  gst_percent: string
  freight_per_kg: string
  effective_from: string
}

const EMPTY_FORM = (category: RateCategory): FormState => ({
  category,
  item_name: '',
  denier: '',
  supplier_name: '',
  basic_rate: '',
  gst_percent: '5',
  freight_per_kg: '2.25',
  effective_from: todayISO(),
})

export function RateMasterScreen() {
  const { session, isCeo, isManager, roleName } = useAuth()
  const role = (roleName || '').trim().toLowerCase()
  const canEdit =
    isCeo ||
    isManager ||
    role === 'md' ||
    role === 'managing director' ||
    role === 'owner' ||
    role.includes('ceo')

  const [tab, setTab] = useState<Tab>('warp')
  const [rates, setRates] = useState<RateMasterRow[]>([])
  const [defaultGst, setDefaultGst] = useState('5')
  const [defaultFreight, setDefaultFreight] = useState('2.25')
  const [editingDefaults, setEditingDefaults] = useState(false)
  const [search, setSearch] = useState('')
  const [asOfDate, setAsOfDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM('warp'))
  const [editSourceId, setEditSourceId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const [config, allRates] = await Promise.all([fetchRateMasterConfig(), fetchAllRates()])
    setDefaultGst(String(config.default_gst_percent ?? 5))
    setDefaultFreight(String(config.default_freight_per_kg ?? 2.25))
    setRates(allRates)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const catalogue = tab === 'warp' ? WARP_CATALOGUE : WEFT_CATALOGUE

  const displayRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return catalogue
      .map((item, idx) => {
        const latest = latestRateForItem(rates, tab, item.item_name, asOfDate)
        const supplier =
          latest?.supplier_name ??
          ('supplier_name' in item ? (item as { supplier_name?: string }).supplier_name : '') ??
          ''
        return {
          sr: idx + 1,
          item_name: item.item_name,
          denier: latest?.denier ?? item.denier ?? '',
          supplier_name: supplier,
          rate: latest,
        }
      })
      .filter((row) => {
        if (!q) return true
        const hay = `${row.item_name} ${row.denier} ${row.supplier_name}`.toLowerCase()
        return hay.includes(q)
      })
  }, [catalogue, rates, tab, asOfDate, search])

  const formPreview = useMemo(() => {
    const basic = Number(form.basic_rate) || 0
    const gst = Number(form.gst_percent) || 0
    const freight = Number(form.freight_per_kg) || 0
    return calcEffectiveRate(basic, gst, freight)
  }, [form])

  function openAdd(category: RateCategory, preset?: Partial<FormState>) {
    setForm({
      ...EMPTY_FORM(category),
      gst_percent: defaultGst,
      freight_per_kg: defaultFreight,
      ...preset,
      category,
    })
    setEditSourceId(null)
    setModalOpen(true)
  }

  function openEdit(row: (typeof displayRows)[0]) {
    const r = row.rate
    setForm({
      category: tab,
      item_name: row.item_name,
      denier: row.denier || '',
      supplier_name: row.supplier_name || '',
      basic_rate: r ? String(r.basic_rate) : '',
      gst_percent: r ? String(r.gst_percent) : defaultGst,
      freight_per_kg: r ? String(r.freight_per_kg) : defaultFreight,
      effective_from: todayISO(),
    })
    setEditSourceId(r?.id ?? null)
    setModalOpen(true)
  }

  async function saveDefaults() {
    if (!canEdit) return
    setBusy(true)
    setError(null)
    try {
      await updateRateMasterConfig(
        {
          default_gst_percent: Number(defaultGst) || 0,
          default_freight_per_kg: Number(defaultFreight) || 0,
        },
        session?.user?.id ?? null,
      )
      setEditingDefaults(false)
      setMessage('Default GST and freight updated (applies to new rates only)')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save defaults')
    } finally {
      setBusy(false)
    }
  }

  async function saveRate() {
    if (!canEdit) return
    if (!form.item_name.trim()) {
      setError('Item / Variety is required')
      return
    }
    const basic = Number(form.basic_rate)
    if (!Number.isFinite(basic) || basic < 0) {
      setError('Basic Rate must be a non-negative number')
      return
    }
    if (!form.effective_from) {
      setError('Effective From date is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const input: RateMasterInput = {
        category: form.category,
        item_name: form.item_name,
        denier: form.denier || null,
        supplier_name: form.supplier_name || null,
        basic_rate: basic,
        gst_percent: Number(form.gst_percent) || 0,
        freight_per_kg: Number(form.freight_per_kg) || 0,
        effective_from: form.effective_from,
      }
      await saveRateMasterEntry(input, session?.user?.id ?? null)
      void editSourceId
      setModalOpen(false)
      setMessage(`Rate saved for ${form.item_name} (effective ${formatDisplayDate(form.effective_from)})`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save rate')
    } finally {
      setBusy(false)
    }
  }

  async function deleteRate(id: string, itemName: string) {
    if (!canEdit) return
    if (!window.confirm(`Deactivate rate for "${itemName}"? Historical records are preserved.`)) return
    setBusy(true)
    try {
      await deactivateRate(id, session?.user?.id ?? null)
      setMessage(`Rate deactivated for ${itemName}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deactivate')
    } finally {
      setBusy(false)
    }
  }

  const historyRows = historyItem ? historyForItem(rates, tab, historyItem) : []

  return (
    <div className="screen rate-master-screen">
      <header className="screen-header">
        <div>
          <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
            Home › Design to Order › Rate Master
          </p>
          <h1>Rate Master</h1>
          <p className="text-muted">Date-wise warp &amp; weft yarn rates — linked to Design-wise Costing</p>
        </div>
      </header>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      <div className="rm-info-banner">
        <span>
          Rates are date-wise and automatically linked to Design-wise Costing based on the latest rate on or before
          the design date.
        </span>
      </div>

      <div className="rm-top-bar">
        <div className="rm-defaults">
          <label>
            <span>Current Date</span>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </label>
          <label>
            <span>Default GST %</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={defaultGst}
              onChange={(e) => setDefaultGst(e.target.value)}
              readOnly={!editingDefaults || !canEdit}
            />
          </label>
          <label>
            <span>Default Freight (₹/kg)</span>
            <input
              className="num"
              type="number"
              min="0"
              step="any"
              value={defaultFreight}
              onChange={(e) => setDefaultFreight(e.target.value)}
              readOnly={!editingDefaults || !canEdit}
            />
          </label>
          {canEdit ? (
            editingDefaults ? (
              <button type="button" className="btn-warp" disabled={busy} onClick={() => void saveDefaults()}>
                Save Defaults
              </button>
            ) : (
              <button type="button" className="dwc-secondary-btn" onClick={() => setEditingDefaults(true)}>
                Edit Defaults
              </button>
            )
          ) : null}
        </div>
        <div className="rm-actions">
          {canEdit ? (
            <button type="button" className="primary-save" onClick={() => openAdd(tab)}>
              + Add New Rate
            </button>
          ) : null}
        </div>
      </div>

      <div className="rm-search">
        <input
          type="search"
          placeholder="Search item, denier, supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rm-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'warp' ? 'rm-tab active' : 'rm-tab'}
          onClick={() => setTab('warp')}
        >
          Warp Rate Master
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'weft' ? 'rm-tab active' : 'rm-tab'}
          onClick={() => setTab('weft')}
        >
          Weft Rate Master
        </button>
      </div>

      <section className="rm-panel">
        <div className="rm-panel-head">
          <h2>{tab === 'warp' ? 'Warp Rate Master' : 'Weft Rate Master'}</h2>
          <div className="rm-freight-inline text-muted">
            <span>Default Freight:</span>
            <strong className="num">{fmtInrRate(Number(defaultFreight) || 0)}/kg</strong>
          </div>
        </div>
        <div className="rm-table-wrap">
          <table className="rm-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>Item / Variety</th>
                <th>Denier</th>
                <th>Supplier</th>
                <th className="num">Basic Rate (₹/kg)</th>
                <th className="num">GST %</th>
                <th className="num">GST Amount</th>
                <th className="num">Freight (₹/kg)</th>
                <th className="num">Total (₹/kg)</th>
                <th>Effective From</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const r = row.rate
                const calc = r ? calcEffectiveRate(r.basic_rate, r.gst_percent, r.freight_per_kg) : null
                return (
                  <tr key={row.item_name}>
                    <td className="num">{row.sr}</td>
                    <td>
                      <strong>{row.item_name}</strong>
                    </td>
                    <td>{row.denier || '—'}</td>
                    <td>{row.supplier_name || '—'}</td>
                    <td className="num">{calc ? calc.basicRate.toFixed(2) : '—'}</td>
                    <td className="num">{r ? gstLabel(r.gst_percent) : '—'}</td>
                    <td className="num">{calc ? calc.gstAmount.toFixed(2) : '—'}</td>
                    <td className="num">{calc ? calc.freightPerKg.toFixed(2) : '—'}</td>
                    <td className="num">
                      <strong>{calc ? calc.effectiveRate.toFixed(2) : '—'}</strong>
                    </td>
                    <td>{r ? formatDisplayDate(r.effective_from) : '—'}</td>
                    <td>
                      <div className="rm-actions-cell">
                        {canEdit ? (
                          <button
                            type="button"
                            className="rm-icon-btn"
                            title="Add / update rate"
                            onClick={() => openEdit(row)}
                          >
                            ✎
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="rm-icon-btn"
                          title="View history"
                          onClick={() => setHistoryItem(row.item_name)}
                        >
                          History
                        </button>
                        {canEdit && r ? (
                          <button
                            type="button"
                            className="rm-icon-btn danger"
                            title="Deactivate rate"
                            onClick={() => void deleteRate(r.id, row.item_name)}
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rm-cards">
        <div className="rm-card">
          <h3>Linked with Design-wise Costing</h3>
          <p>
            The latest rate on or before the design date is automatically applied when costing is opened. Manual
            overrides in costing do not modify Rate Master.
          </p>
        </div>
        <div className="rm-card">
          <h3>Date-wise Rate Validity</h3>
          <p>
            Future-dated rates apply automatically from their effective date. Previous rates are preserved in
            history.
          </p>
        </div>
        <div className="rm-card">
          <span className="rm-badge-soon">Coming Soon</span>
          <h3>FIFO Planning</h3>
          <p>Stock age-wise rate consumption — planned enhancement, does not affect current costing.</p>
        </div>
      </div>

      {modalOpen ? (
        <div className="rm-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal-head">
              <h2>{editSourceId ? 'New Rate Version' : 'Add New Rate'}</h2>
            </div>
            <div className="rm-modal-body">
              <label>
                <span>Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as RateCategory }))}
                >
                  <option value="warp">Warp</option>
                  <option value="weft">Weft</option>
                </select>
              </label>
              <label>
                <span>Item / Variety *</span>
                <input
                  value={form.item_name}
                  onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
                  list="rm-item-list"
                />
                <datalist id="rm-item-list">
                  {[...WARP_CATALOGUE, ...WEFT_CATALOGUE].map((i) => (
                    <option key={i.item_name} value={i.item_name} />
                  ))}
                </datalist>
              </label>
              <label>
                <span>Denier / Spec</span>
                <input value={form.denier} onChange={(e) => setForm((f) => ({ ...f, denier: e.target.value }))} />
              </label>
              <label>
                <span>Supplier Name (Optional)</span>
                <input
                  value={form.supplier_name}
                  onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                />
              </label>
              <label>
                <span>Basic Rate (₹/kg) *</span>
                <input
                  className="num"
                  type="number"
                  min="0"
                  step="any"
                  value={form.basic_rate}
                  onChange={(e) => setForm((f) => ({ ...f, basic_rate: e.target.value }))}
                />
              </label>
              <label>
                <span>GST %</span>
                <input
                  className="num"
                  type="number"
                  min="0"
                  step="any"
                  value={form.gst_percent}
                  onChange={(e) => setForm((f) => ({ ...f, gst_percent: e.target.value }))}
                />
              </label>
              <label>
                <span>Freight (₹/kg)</span>
                <input
                  className="num"
                  type="number"
                  min="0"
                  step="any"
                  value={form.freight_per_kg}
                  onChange={(e) => setForm((f) => ({ ...f, freight_per_kg: e.target.value }))}
                />
              </label>
              <label>
                <span>Effective From *</span>
                <input
                  type="date"
                  value={form.effective_from}
                  onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
                />
              </label>
              <div className="rm-preview">
                <div>
                  <span>Basic Rate</span>
                  <span>{fmtInrRate(formPreview.basicRate)}</span>
                </div>
                <div>
                  <span>{gstLabel(formPreview.gstPercent)}</span>
                  <span>{fmtInrRate(formPreview.gstAmount)}</span>
                </div>
                <div>
                  <span>Freight</span>
                  <span>{fmtInrRate(formPreview.freightPerKg)}</span>
                </div>
                <div>
                  <strong>Total Effective Rate</strong>
                  <strong>{fmtInrRate(formPreview.effectiveRate)}/kg</strong>
                </div>
              </div>
            </div>
            <div className="rm-modal-foot">
              <button type="button" className="dwc-secondary-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary-save" disabled={busy || !canEdit} onClick={() => void saveRate()}>
                Save Rate
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyItem ? (
        <div className="rm-modal-backdrop" onClick={() => setHistoryItem(null)}>
          <div className="rm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rm-modal-head">
              <h2>Rate History — {historyItem}</h2>
            </div>
            <div className="rm-modal-body">
              {historyRows.length === 0 ? (
                <p className="text-muted">No rate history for this item.</p>
              ) : (
                <ul className="rm-history-list">
                  {historyRows.map((h) => {
                    const c = calcEffectiveRate(h.basic_rate, h.gst_percent, h.freight_per_kg)
                    return (
                      <li key={h.id}>
                        <div>
                          <strong>{formatDisplayDate(h.effective_from)}</strong>
                          <br />
                          <span className="text-muted">
                            Basic {fmtInrRate(c.basicRate)} · {gstLabel(c.gstPercent)} {fmtInrRate(c.gstAmount)} ·
                            Freight {fmtInrRate(c.freightPerKg)}
                          </span>
                          {h.supplier_name ? (
                            <>
                              <br />
                              <span className="text-muted">Supplier: {h.supplier_name}</span>
                            </>
                          ) : null}
                        </div>
                        <strong className="num">{fmtInrRate(c.effectiveRate)}/kg</strong>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="rm-modal-foot">
              <button type="button" className="dwc-secondary-btn" onClick={() => setHistoryItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
