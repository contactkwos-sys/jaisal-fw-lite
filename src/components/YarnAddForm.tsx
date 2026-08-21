import { useMemo, useState, type ReactNode } from 'react'
import type { WeftYarnStock } from '../lib/database.types'
import {
  YARN_UNITS,
  formatKg,
  formFromRecentYarn,
  recentYarns,
  type YarnFieldErrors,
  type YarnFormValues,
  uniqueSorted,
  yarnDisplayName,
} from '../lib/yarnStock'
import { YarnSearchSelect } from './YarnSearchSelect'

export type YarnFormTab = 'opening' | 'purchase'

type Props = {
  form: YarnFormValues
  isNew: boolean
  busy: boolean
  error: string | null
  message: string | null
  fieldErrors: YarnFieldErrors
  yarns: WeftYarnStock[]
  activeYarn: WeftYarnStock | null
  formTab: YarnFormTab
  duplicate: WeftYarnStock | null
  onField: <K extends keyof YarnFormValues>(key: K, value: YarnFormValues[K]) => void
  onFormChange: (next: YarnFormValues) => void
  onTabChange: (tab: YarnFormTab) => void
  onBack: () => void
  onCancel: () => void
  onSave: (andAnother: boolean) => void
  onContinueDuplicate: () => void
  onOpenExisting: (row: WeftYarnStock) => void
  onDismissDuplicate: () => void
  onPurchaseYarn: (row: WeftYarnStock) => void
  onClearFieldError: (key: keyof YarnFormValues) => void
}

function SectionIcon({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`yarn-section-ico tone-${tone}`}>{children}</span>
}

export function YarnAddForm({
  form,
  isNew,
  busy,
  error,
  message,
  fieldErrors,
  yarns,
  activeYarn,
  formTab,
  duplicate,
  onField,
  onFormChange,
  onTabChange,
  onBack,
  onCancel,
  onSave,
  onContinueDuplicate,
  onOpenExisting,
  onDismissDuplicate,
  onPurchaseYarn,
  onClearFieldError,
}: Props) {
  const [showRecent, setShowRecent] = useState(false)
  const [purchaseSearch, setPurchaseSearch] = useState('')

  const suppliers = useMemo(
    () => uniqueSorted(yarns.map((y) => y.supplier)),
    [yarns],
  )
  const colours = useMemo(
    () => uniqueSorted(yarns.map((y) => y.colour_name)),
    [yarns],
  )
  const qualities = useMemo(
    () => uniqueSorted(yarns.map((y) => y.quality)),
    [yarns],
  )
  const specs = useMemo(
    () => uniqueSorted(yarns.map((y) => y.yarn_specification)),
    [yarns],
  )
  const locations = useMemo(() => {
    const fromData = uniqueSorted(yarns.map((y) => y.location))
    const defaults = ['Main Store', 'Store A', 'Store B', 'Godown', 'Rack 3']
    return uniqueSorted([...fromData, ...defaults])
  }, [yarns])

  const recent = useMemo(() => recentYarns(yarns, 10), [yarns])

  const purchaseCandidates = useMemo(() => {
    const q = purchaseSearch.trim().toLowerCase()
    const base = yarns.filter((y) => y.is_active !== false)
    if (!q) return base.slice(0, 20)
    return base
      .filter((y) => {
        const hay = [y.colour_name, y.colour_no, y.supplier, y.quality, y.yarn_specification]
          .map((x) => String(x || '').toLowerCase())
          .join(' ')
        return hay.includes(q)
      })
      .slice(0, 20)
  }, [yarns, purchaseSearch])

  const unit = form.unit || 'KG'
  const createdLabel = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  function setField<K extends keyof YarnFormValues>(key: K, value: YarnFormValues[K]) {
    onClearFieldError(key)
    onField(key, value)
  }

  function applyRecent(row: WeftYarnStock) {
    onFormChange(formFromRecentYarn(row))
    setShowRecent(false)
    onTabChange('opening')
  }

  function scrollToOpening() {
    onTabChange('opening')
    setShowRecent(false)
    requestAnimationFrame(() => {
      document.getElementById('yarn-opening-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <div className="yarn-form-page yarn-add-page">
      <p className="yarn-crumb">
        Inventory &gt; Yarn Stock &gt; <strong>{isNew ? 'Add Yarn' : 'Edit Yarn'}</strong>
      </p>

      <header className="yarn-add-head">
        <div className="yarn-add-head-main">
          <button type="button" className="yarn-back-btn" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div>
            <h2 className="yarn-detail-title">{isNew ? 'Add Yarn' : 'Edit Yarn'}</h2>
            <p className="yarn-detail-sub">
              {isNew
                ? 'Enter opening stock details and purchase information.'
                : 'Update master information. Current stock is driven by transactions.'}
            </p>
          </div>
        </div>
        <div className="yarn-add-head-actions">
          <button type="button" className="btn-secondary yarn-list-btn" onClick={onCancel}>
            <span aria-hidden="true">☰</span> Yarn List
          </button>
        </div>
      </header>

      <div className="yarn-quick-cards" role="navigation" aria-label="Quick actions">
        <button type="button" className="yarn-quick-card" onClick={scrollToOpening}>
          <span className="yarn-quick-ico tone-blue" aria-hidden="true">
            ⌂
          </span>
          <span className="yarn-quick-body">
            <strong>Opening Stock</strong>
            <span>Add current stock available in hand</span>
          </span>
          <span className="yarn-quick-chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <button
          type="button"
          className="yarn-quick-card"
          onClick={() => {
            setShowRecent(false)
            onTabChange('purchase')
          }}
        >
          <span className="yarn-quick-ico tone-green" aria-hidden="true">
            +
          </span>
          <span className="yarn-quick-body">
            <strong>Purchase Yarn</strong>
            <span>Add new purchase details</span>
          </span>
          <span className="yarn-quick-chevron" aria-hidden="true">
            ›
          </span>
        </button>
        <button
          type="button"
          className="yarn-quick-card"
          onClick={() => {
            setShowRecent((v) => !v)
            onTabChange('opening')
          }}
        >
          <span className="yarn-quick-ico tone-purple" aria-hidden="true">
            ◫
          </span>
          <span className="yarn-quick-body">
            <strong>Recent Yarns</strong>
            <span>View and reuse recent yarn entries</span>
          </span>
          <span className="yarn-quick-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </div>

      {showRecent ? (
        <section className="yarn-recent-panel" aria-label="Recent yarns">
          <div className="yarn-recent-head">
            <h3>Recent Yarns</h3>
            <button type="button" className="btn-secondary" onClick={() => setShowRecent(false)}>
              Close
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="yarn-empty-inline">No recent yarn entries yet.</p>
          ) : (
            <ul className="yarn-recent-list">
              {recent.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{yarnDisplayName(row)}</strong>
                    <span>
                      {row.yarn_specification || row.quality || '—'} · {row.supplier || '—'} ·{' '}
                      {formatKg(Number(row.stock_kg || 0))} {row.unit || 'KG'}
                    </span>
                  </div>
                  <button type="button" className="btn-secondary" onClick={() => applyRecent(row)}>
                    Use Again
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <div className="yarn-form-tabs" role="tablist" aria-label="Entry type">
        <button
          type="button"
          role="tab"
          aria-selected={formTab === 'opening'}
          className={`yarn-form-tab${formTab === 'opening' ? ' is-active' : ''}`}
          onClick={() => onTabChange('opening')}
        >
          Opening Stock
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={formTab === 'purchase'}
          className={`yarn-form-tab${formTab === 'purchase' ? ' is-active' : ''}`}
          onClick={() => onTabChange('purchase')}
        >
          Purchase Yarn
        </button>
      </div>

      {formTab === 'purchase' ? (
        <section className="yarn-form-section yarn-purchase-link-panel" id="yarn-purchase-panel">
          <div className="yarn-section-title">
            <SectionIcon tone="green">+</SectionIcon>
            <h2>Purchase Yarn</h2>
          </div>
          <p className="yarn-detail-sub">
            Purchases update stock through the existing inward / purchase workflow. Select a yarn
            below to add purchase quantity — this does not create a duplicate purchase module.
          </p>
          {!isNew && activeYarn ? (
            <div className="yarn-purchase-current">
              <div>
                <strong>{yarnDisplayName(activeYarn)}</strong>
                <span>
                  Current stock: {formatKg(Number(activeYarn.stock_kg || 0))}{' '}
                  {activeYarn.unit || 'KG'}
                </span>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onPurchaseYarn(activeYarn)}
              >
                Add Purchase / Inward
              </button>
            </div>
          ) : null}
          <label className="field yarn-purchase-search">
            <span>Find yarn to purchase</span>
            <input
              type="search"
              value={purchaseSearch}
              onChange={(e) => setPurchaseSearch(e.target.value)}
              placeholder="Search colour, supplier, quality…"
            />
          </label>
          <ul className="yarn-recent-list">
            {purchaseCandidates.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{yarnDisplayName(row)}</strong>
                  <span>
                    {row.yarn_specification || '—'} · {row.supplier || '—'} ·{' '}
                    {formatKg(Number(row.stock_kg || 0))} {row.unit || 'KG'}
                  </span>
                </div>
                <button type="button" className="btn-primary" onClick={() => onPurchaseYarn(row)}>
                  Purchase
                </button>
              </li>
            ))}
          </ul>
          {purchaseCandidates.length === 0 ? (
            <p className="yarn-empty-inline">
              No yarns found. Save a yarn with Opening Stock first, then purchase against it.
            </p>
          ) : null}
        </section>
      ) : (
        <div className="yarn-form-sections" id="yarn-opening-panel">
          <section className="yarn-form-section">
            <div className="yarn-section-title">
              <SectionIcon tone="blue">▣</SectionIcon>
              <h2>Basic Details</h2>
            </div>
            <div className="yarn-form-grid cols-3">
              <YarnSearchSelect
                label="Supplier"
                required
                value={form.supplier}
                options={suppliers}
                placeholder="Select Supplier"
                error={fieldErrors.supplier}
                onChange={(v) => setField('supplier', v)}
              />
              <YarnSearchSelect
                label="Colour Name"
                required
                value={form.colour_name}
                options={colours}
                placeholder="Select Colour"
                error={fieldErrors.colour_name}
                onChange={(v) => {
                  onClearFieldError('colour_name')
                  onFormChange({
                    ...form,
                    colour_name: v,
                    colour_no: form.colour_no.trim() ? form.colour_no : v.trim(),
                  })
                }}
              />
              <label className={`field${fieldErrors.colour_no ? ' has-error' : ''}`}>
                <span>
                  Colour No. <em className="req">*</em>
                </span>
                <input
                  value={form.colour_no}
                  onChange={(e) => setField('colour_no', e.target.value)}
                  placeholder="e.g. RB-101"
                  aria-invalid={Boolean(fieldErrors.colour_no)}
                />
                {fieldErrors.colour_no ? (
                  <small className="yarn-field-error">{fieldErrors.colour_no}</small>
                ) : null}
              </label>
              <YarnSearchSelect
                label="Quality / Count"
                required
                value={form.quality}
                options={qualities}
                placeholder="e.g. 300 Tex"
                error={fieldErrors.quality}
                onChange={(v) => setField('quality', v)}
              />
              <YarnSearchSelect
                label="Yarn Specification"
                required
                value={form.yarn_specification}
                options={specs}
                placeholder="e.g. 100% Poly, Ring Spun"
                error={fieldErrors.yarn_specification}
                onChange={(v) => setField('yarn_specification', v)}
              />
              <label className={`field${fieldErrors.unit ? ' has-error' : ''}`}>
                <span>
                  Unit <em className="req">*</em>
                </span>
                <select
                  value={form.unit}
                  onChange={(e) => setField('unit', e.target.value)}
                  aria-invalid={Boolean(fieldErrors.unit)}
                >
                  {YARN_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                {fieldErrors.unit ? (
                  <small className="yarn-field-error">{fieldErrors.unit}</small>
                ) : null}
              </label>
            </div>
          </section>

          <section className="yarn-form-section">
            <div className="yarn-section-title">
              <SectionIcon tone="purple">◎</SectionIcon>
              <h2>Stock Details</h2>
            </div>
            <div className="yarn-form-grid cols-3">
              {isNew ? (
                <label className={`field${fieldErrors.opening_stock ? ' has-error' : ''}`}>
                  <span>
                    Opening Stock Quantity <em className="req">*</em>
                  </span>
                  <div className="yarn-qty-input">
                    <input
                      className="num"
                      inputMode="decimal"
                      value={form.opening_stock}
                      onChange={(e) => setField('opening_stock', e.target.value)}
                      placeholder="0.00"
                      aria-invalid={Boolean(fieldErrors.opening_stock)}
                    />
                    <span className="yarn-qty-unit" aria-hidden="true">
                      {unit}
                    </span>
                  </div>
                  {fieldErrors.opening_stock ? (
                    <small className="yarn-field-error">{fieldErrors.opening_stock}</small>
                  ) : (
                    <small className="yarn-field-hint">Quantity currently available in stock</small>
                  )}
                </label>
              ) : (
                <label className="field">
                  <span>Current Stock (read-only)</span>
                  <div className="yarn-qty-input">
                    <input
                      className="num"
                      readOnly
                      value={formatKg(Number(activeYarn?.stock_kg || 0))}
                    />
                    <span className="yarn-qty-unit" aria-hidden="true">
                      {activeYarn?.unit || unit}
                    </span>
                  </div>
                  <small className="yarn-field-hint">
                    Opening + inward − outward − adjustments (not manually editable)
                  </small>
                </label>
              )}
              <label className={`field${fieldErrors.reorder_level ? ' has-error' : ''}`}>
                <span>Reorder Level</span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.reorder_level}
                    onChange={(e) => setField('reorder_level', e.target.value)}
                    placeholder="0.00"
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    {unit}
                  </span>
                </div>
                {fieldErrors.reorder_level ? (
                  <small className="yarn-field-error">{fieldErrors.reorder_level}</small>
                ) : (
                  <small className="yarn-field-hint">Stock level alert point</small>
                )}
              </label>
              <label className={`field${fieldErrors.min_stock ? ' has-error' : ''}`}>
                <span>Minimum Stock</span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.min_stock}
                    onChange={(e) => setField('min_stock', e.target.value)}
                    placeholder="0.00"
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    {unit}
                  </span>
                </div>
                {fieldErrors.min_stock ? (
                  <small className="yarn-field-error">{fieldErrors.min_stock}</small>
                ) : (
                  <small className="yarn-field-hint">Minimum stock to maintain</small>
                )}
              </label>
              <label className={`field${fieldErrors.max_stock ? ' has-error' : ''}`}>
                <span>Maximum Stock</span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.max_stock}
                    onChange={(e) => setField('max_stock', e.target.value)}
                    placeholder="0.00"
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    {unit}
                  </span>
                </div>
                {fieldErrors.max_stock ? (
                  <small className="yarn-field-error">{fieldErrors.max_stock}</small>
                ) : (
                  <small className="yarn-field-hint">Maximum stock limit</small>
                )}
              </label>
              <YarnSearchSelect
                label="Location"
                value={form.location}
                options={locations}
                placeholder="Select Location"
                onChange={(v) => setField('location', v)}
              />
              <label className="field">
                <span>Lot / Batch No.</span>
                <input
                  value={form.lot_number}
                  onChange={(e) => setField('lot_number', e.target.value)}
                  placeholder="Enter lot or batch number"
                />
              </label>
            </div>
          </section>

          <section className="yarn-form-section">
            <div className="yarn-section-title">
              <SectionIcon tone="green">✓</SectionIcon>
              <h2>Purchase Information</h2>
            </div>
            <div className="yarn-form-grid cols-3">
              <label className={`field${fieldErrors.rate_per_kg ? ' has-error' : ''}`}>
                <span>
                  Purchase Rate (₹ / {unit}) <em className="req">*</em>
                </span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.rate_per_kg}
                    onChange={(e) => setField('rate_per_kg', e.target.value)}
                    placeholder="0.00"
                    aria-invalid={Boolean(fieldErrors.rate_per_kg)}
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    ₹
                  </span>
                </div>
                {fieldErrors.rate_per_kg ? (
                  <small className="yarn-field-error">{fieldErrors.rate_per_kg}</small>
                ) : null}
              </label>
              <label className={`field${fieldErrors.gst_pct ? ' has-error' : ''}`}>
                <span>GST %</span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.gst_pct}
                    onChange={(e) => setField('gst_pct', e.target.value)}
                    placeholder="5"
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    %
                  </span>
                </div>
                {fieldErrors.gst_pct ? (
                  <small className="yarn-field-error">{fieldErrors.gst_pct}</small>
                ) : (
                  <small className="yarn-field-hint">Default 5%, editable</small>
                )}
              </label>
              <label className="field">
                <span>HSN Code</span>
                <input
                  value={form.hsn_code}
                  onChange={(e) => setField('hsn_code', e.target.value)}
                  placeholder="Enter HSN code (optional)"
                />
              </label>
            </div>
          </section>

          <section className="yarn-form-section">
            <div className="yarn-section-title">
              <SectionIcon tone="amber">✎</SectionIcon>
              <h2>Additional Information</h2>
            </div>
            <div className="yarn-form-grid">
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Remarks</span>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setField('remarks', e.target.value)}
                  placeholder="Add any additional notes…"
                  rows={3}
                />
              </label>
              <div className="yarn-active-row">
                <label className="yarn-check yarn-active-toggle">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setField('is_active', e.target.checked)}
                  />
                  <span>
                    <strong>Active</strong>
                    <small className="yarn-field-hint">This yarn will be active in inventory.</small>
                  </span>
                </label>
                <span className="yarn-created-meta">Created on: {createdLabel}</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      {formTab === 'opening' ? (
        <div className="yarn-form-actions yarn-sticky-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-secondary yarn-btn-outline"
            disabled={busy}
            onClick={() => onSave(true)}
          >
            Save &amp; Add Another
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => onSave(false)}
          >
            {isNew ? 'Save Yarn' : 'Save Changes'}
          </button>
        </div>
      ) : null}

      {duplicate ? (
        <div className="yarn-modal-backdrop" role="presentation" onClick={onDismissDuplicate}>
          <div
            className="yarn-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="yarn-dup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="yarn-dup-title">Existing Yarn Found</h3>
            <p>An identical yarn already exists in Yarn Stock.</p>
            <p className="yarn-dup-meta">
              <strong>{yarnDisplayName(duplicate)}</strong>
              <span>
                {duplicate.supplier || '—'} · {duplicate.quality || '—'} ·{' '}
                {duplicate.yarn_specification || '—'}
              </span>
            </p>
            <div className="yarn-modal-actions">
              <button type="button" className="btn-secondary" onClick={onDismissDuplicate}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onOpenExisting(duplicate)}
              >
                Open Existing
              </button>
              <button type="button" className="btn-primary" onClick={onContinueDuplicate}>
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
