import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { WeftYarnStock, YarnStockLedger } from '../lib/database.types'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'
import {
  EMPTY_YARN_FILTERS,
  EMPTY_YARN_FORM,
  filterYarnRows,
  formFromYarn,
  formatInr,
  formatKg,
  insertLedgerEntry,
  ledgerTotals,
  ledgerWithRunningBalance,
  loadYarnLedger,
  masterPayloadFromForm,
  nextYarnTxnNo,
  type YarnFilters,
  type YarnFormValues,
  validateYarnForm,
  yarnDisplayName,
  yarnKpis,
  yarnReorderLevel,
  yarnStatus,
  yarnStatusLabel,
  yarnStockValue,
} from '../lib/yarnStock'

type View =
  | { mode: 'list' }
  | { mode: 'form'; yarnId: string | null }
  | { mode: 'detail'; yarnId: string }
  | { mode: 'inward'; yarnId: string }

type DetailTab =
  | 'overview'
  | 'ledger'
  | 'inward'
  | 'outward'
  | 'purchase'
  | 'adjustments'

type InwardForm = {
  date: string
  supplier: string
  invoice_no: string
  quantity: string
  rate: string
  gst_pct: string
  lot_number: string
  location: string
  remarks: string
}

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: 'overview', label: 'Stock Overview' },
  { id: 'ledger', label: 'Stock Ledger' },
  { id: 'inward', label: 'Inward History' },
  { id: 'outward', label: 'Outward History' },
  { id: 'purchase', label: 'Purchase History' },
  { id: 'adjustments', label: 'Adjustments' },
]

export function YarnStockPanel() {
  const { isCeo, profile } = useAuth()
  const [yarns, setYarns] = useState<WeftYarnStock[]>([])
  const [view, setView] = useState<View>({ mode: 'list' })
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<YarnFilters>(EMPTY_YARN_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [form, setForm] = useState<YarnFormValues>(EMPTY_YARN_FORM)
  const [detailTab, setDetailTab] = useState<DetailTab>('overview')
  const [ledger, setLedger] = useState<YarnStockLedger[]>([])
  const [inwardForm, setInwardForm] = useState<InwardForm>({
    date: todayISO(),
    supplier: '',
    invoice_no: '',
    quantity: '',
    rate: '',
    gst_pct: '0',
    lot_number: '',
    location: '',
    remarks: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('weft_yarn_stock')
      .select('*')
      .order('colour_name', { ascending: true })
    if (err) throw err
    setYarns((data as WeftYarnStock[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const filtered = useMemo(
    () => filterYarnRows(yarns, search, filters),
    [yarns, search, filters],
  )
  const kpis = useMemo(() => yarnKpis(filtered), [filtered])

  const suppliers = useMemo(
    () => [...new Set(yarns.map((y) => y.supplier).filter(Boolean) as string[])].sort(),
    [yarns],
  )
  const qualities = useMemo(
    () => [...new Set(yarns.map((y) => y.quality).filter(Boolean) as string[])].sort(),
    [yarns],
  )
  const specs = useMemo(
    () =>
      [...new Set(yarns.map((y) => y.yarn_specification).filter(Boolean) as string[])].sort(),
    [yarns],
  )

  const activeYarn = useMemo(() => {
    if (view.mode === 'list') return null
    return yarns.find((y) => y.id === view.yarnId) || null
  }, [view, yarns])

  const loadDetailLedger = useCallback(async (yarnId: string) => {
    const rows = await loadYarnLedger(yarnId)
    setLedger(rows)
  }, [])

  useEffect(() => {
    if (view.mode === 'detail' || view.mode === 'inward') {
      void loadDetailLedger(view.yarnId).catch((e: Error) => setError(e.message))
    }
  }, [view, loadDetailLedger])

  function openAdd() {
    setForm({ ...EMPTY_YARN_FORM })
    setError(null)
    setMessage(null)
    setView({ mode: 'form', yarnId: null })
  }

  function openEdit(row: WeftYarnStock, e?: React.MouseEvent) {
    e?.stopPropagation()
    setForm(formFromYarn(row))
    setError(null)
    setMessage(null)
    setView({ mode: 'form', yarnId: row.id })
  }

  function openDetail(row: WeftYarnStock) {
    setDetailTab('overview')
    setError(null)
    setMessage(null)
    setView({ mode: 'detail', yarnId: row.id })
  }

  function openInward(row: WeftYarnStock) {
    setInwardForm({
      date: todayISO(),
      supplier: row.supplier || '',
      invoice_no: '',
      quantity: '',
      rate: String(row.rate_per_kg ?? 0),
      gst_pct: String(row.gst_pct ?? 0),
      lot_number: row.lot_number || '',
      location: row.location || '',
      remarks: '',
    })
    setError(null)
    setMessage(null)
    setView({ mode: 'inward', yarnId: row.id })
  }

  async function saveYarn(andAnother: boolean) {
    if (!profile) return
    const isNew = view.mode === 'form' && view.yarnId == null
    const validation = validateYarnForm(form, isNew)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (isNew) {
        const payload = masterPayloadFromForm(form, { includeOpening: true })
        const result = await applyOrQueue({
          isCeo,
          userId: profile.id,
          tableName: 'weft_yarn_stock',
          action: 'insert',
          recordId: null,
          payload,
          apply: async () => {
            const { data, error: err } = await supabase
              .from('weft_yarn_stock')
              .insert(payload)
              .select('*')
              .single()
            if (err) throw err
            const yarn = data as WeftYarnStock
            const opening = Number(yarn.opening_stock || yarn.stock_kg || 0)
            if (opening > 0) {
              const txn_no = await nextYarnTxnNo('OPN')
              await insertLedgerEntry({
                yarn_id: yarn.id,
                txn_date: todayISO(),
                txn_no,
                txn_type: 'opening',
                reference: 'Opening stock',
                inward_kg: opening,
                outward_kg: 0,
                balance_kg: opening,
                rate: Number(yarn.rate_per_kg || 0),
                value_amount: opening * Number(yarn.rate_per_kg || 0),
                lot_number: yarn.lot_number || null,
                location: yarn.location || null,
                gst_pct: Number(yarn.gst_pct || 0),
                invoice_no: null,
                remarks: 'Opening balance',
                created_by: profile.id,
                created_by_name: profile.full_name || profile.roles?.role_name || null,
              })
            }
          },
        })
        setMessage(result === 'applied' ? 'Item saved' : 'Sent to approval queue')
      } else if (view.mode === 'form' && view.yarnId) {
        const yarnId = view.yarnId
        // Master fields only — do not overwrite transaction-derived stock_kg
        const payload = masterPayloadFromForm(form, { includeOpening: false })
        const result = await applyOrQueue({
          isCeo,
          userId: profile.id,
          tableName: 'weft_yarn_stock',
          action: 'update',
          recordId: yarnId,
          payload,
          apply: async () => {
            const { error: err } = await supabase
              .from('weft_yarn_stock')
              .update(payload)
              .eq('id', yarnId)
            if (err) throw err
          },
        })
        setMessage(result === 'applied' ? 'Item updated' : 'Sent to approval queue')
      }
      await load()
      if (andAnother) {
        setForm({ ...EMPTY_YARN_FORM })
        setView({ mode: 'form', yarnId: null })
      } else {
        setView({ mode: 'list' })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteYarn(row: WeftYarnStock, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!profile) return
    if (!window.confirm(`Delete yarn ${yarnDisplayName(row)}? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'weft_yarn_stock',
        action: 'delete',
        recordId: row.id,
        payload: { id: row.id },
        apply: async () => {
          const { error: err } = await supabase.from('weft_yarn_stock').delete().eq('id', row.id)
          if (err) throw err
        },
      })
      setMessage('Yarn deleted')
      await load()
      if (view.mode !== 'list' && 'yarnId' in view && view.yarnId === row.id) {
        setView({ mode: 'list' })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveInward(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !activeYarn) return
    const qty = Number(inwardForm.quantity)
    const rate = Number(inwardForm.rate)
    const gst = Number(inwardForm.gst_pct || 0)
    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      setError('Enter a valid quantity in KG')
      return
    }
    if (Number.isNaN(rate) || rate < 0) {
      setError('Enter a valid rate')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const subtotal = qty * rate
      const grand = subtotal * (1 + gst / 100)
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'weft_purchases',
        action: 'insert',
        recordId: null,
        payload: {
          yarn_id: activeYarn.id,
          quantity: qty,
          rate,
          gst_pct: gst,
          invoice_no: inwardForm.invoice_no,
        },
        apply: async () => {
          const header = {
            quality: activeYarn.quality || activeYarn.colour_name || 'yarn',
            weight_kg: qty,
            rate,
            supplier: inwardForm.supplier.trim() || activeYarn.supplier,
            party_name: inwardForm.supplier.trim() || activeYarn.supplier,
            challan_no: inwardForm.invoice_no.trim() || null,
            gst_pct: gst,
            subtotal,
            grand_total: grand,
            purchase_date: inwardForm.date,
            input_mode: 'manual',
            photo_url: null as string | null,
            barcode: null as string | null,
          }
          const { data: purchase, error: pErr } = await supabase
            .from('weft_purchases')
            .insert(header)
            .select('id')
            .single()
          if (pErr) throw pErr
          const { error: iErr } = await supabase.from('weft_purchase_items').insert({
            purchase_id: purchase.id,
            quality: activeYarn.quality || activeYarn.colour_name,
            weight_kg: qty,
            rate,
          })
          if (iErr) throw iErr

          const newStock = Number(activeYarn.stock_kg || 0) + qty
          const { error: uErr } = await supabase
            .from('weft_yarn_stock')
            .update({
              stock_kg: newStock,
              rate_per_kg: rate,
              supplier: inwardForm.supplier.trim() || activeYarn.supplier,
              lot_number: inwardForm.lot_number.trim() || activeYarn.lot_number,
              location: inwardForm.location.trim() || activeYarn.location,
              gst_pct: gst,
              updated_at: new Date().toISOString(),
            })
            .eq('id', activeYarn.id)
          if (uErr) throw uErr

          const txn_no = await nextYarnTxnNo('INW')
          await insertLedgerEntry({
            yarn_id: activeYarn.id,
            txn_date: inwardForm.date,
            txn_no,
            txn_type: 'inward',
            reference: inwardForm.invoice_no.trim() || purchase.id,
            inward_kg: qty,
            outward_kg: 0,
            balance_kg: newStock,
            rate,
            value_amount: qty * rate,
            lot_number: inwardForm.lot_number.trim() || null,
            location: inwardForm.location.trim() || null,
            gst_pct: gst,
            invoice_no: inwardForm.invoice_no.trim() || null,
            remarks: inwardForm.remarks.trim() || null,
            created_by: profile.id,
            created_by_name: profile.full_name || profile.roles?.role_name || null,
          })
        },
      })
      setMessage(result === 'applied' ? 'Inward saved — stock updated' : 'Sent to approval queue')
      await load()
      setView({ mode: 'detail', yarnId: activeYarn.id })
      setDetailTab('ledger')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inward failed')
    } finally {
      setBusy(false)
    }
  }

  function setField<K extends keyof YarnFormValues>(key: K, value: YarnFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  if (view.mode === 'form') {
    const isNew = view.yarnId == null
    const unit = form.unit || 'KG'
    const rate = Number(form.rate_per_kg || 0)
    const gstPct = Number(form.gst_pct || 0)
    const gstCost = rate * (1 + (Number.isFinite(gstPct) ? gstPct : 0) / 100)
    const masterNames = [
      ...new Set(yarns.map((y) => y.colour_name).filter(Boolean) as string[]),
    ].sort()
    const locations = [
      ...new Set(yarns.map((y) => y.location).filter(Boolean) as string[]),
    ].sort()

    return (
      <div className="yarn-form-page yarn-item-setup">
        <p className="yarn-crumb">
          Inventory &gt; Item Setup &gt; <strong>{isNew ? 'Add Item' : 'Edit Item'}</strong>
        </p>
        <header className="yarn-detail-head">
          <div>
            <h2 className="yarn-detail-title">{isNew ? 'Add Item' : 'Edit Item'}</h2>
            <p className="yarn-detail-sub">
              {isNew
                ? 'Set opening stock quantity in KG, then save the item master.'
                : 'Update master information. Current stock is driven by transactions.'}
            </p>
          </div>
        </header>

        <div className="yarn-mode-cards" role="tablist" aria-label="Item entry mode">
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="yarn-mode-card is-active"
          >
            <strong>Opening Stock</strong>
            <span>Start balance in shop</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="yarn-mode-card"
            disabled={isNew || !view.yarnId}
            onClick={() => {
              if (view.yarnId) {
                const row = yarns.find((y) => y.id === view.yarnId)
                if (row) openInward(row)
              }
            }}
          >
            <strong>Purchase Item</strong>
            <span>Add inward purchase</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            className="yarn-mode-card"
            disabled
            title="Coming soon"
          >
            <strong>Repair Item</strong>
            <span>Repair / return stock</span>
          </button>
        </div>

        <div className="yarn-form-tabs" role="tablist">
          <button type="button" className="yarn-form-tab is-active" role="tab" aria-selected="true">
            Opening Stock
          </button>
        </div>

        <div className="yarn-form-sections">
          <section className="yarn-form-section">
            <h2>Item Details</h2>
            <div className="yarn-form-grid cols-3">
              <label className="field">
                <span>
                  Supplier <em className="req">*</em>
                </span>
                <input
                  value={form.supplier}
                  onChange={(e) => setField('supplier', e.target.value)}
                  placeholder="Select or type supplier"
                  list="yarn-supplier-suggestions"
                />
              </label>
              <label className="field">
                <span>
                  Master Name <em className="req">*</em>
                </span>
                <input
                  value={form.colour_name}
                  onChange={(e) => {
                    const name = e.target.value
                    setForm((f) => ({
                      ...f,
                      colour_name: name,
                      colour_no: f.colour_no.trim() ? f.colour_no : name.trim(),
                    }))
                  }}
                  placeholder="Select or type master name"
                  list="yarn-master-suggestions"
                />
              </label>
              <label className="field">
                <span>
                  Colour / Item No. <em className="req">*</em>
                </span>
                <input
                  value={form.colour_no}
                  onChange={(e) => setField('colour_no', e.target.value)}
                  placeholder="eg. RB-101"
                />
              </label>
              <label className="field">
                <span>
                  HSN No. <em className="req">*</em>
                </span>
                <input
                  value={form.hsn_code}
                  onChange={(e) => setField('hsn_code', e.target.value)}
                  placeholder="eg. 5205"
                />
              </label>
              <label className="field">
                <span>Quality / Brand</span>
                <input
                  value={form.quality}
                  onChange={(e) => setField('quality', e.target.value)}
                  placeholder="eg. 400 lbs"
                  list="yarn-quality-suggestions"
                />
              </label>
              <label className="field">
                <span>Item Description</span>
                <input
                  value={form.yarn_specification}
                  onChange={(e) => setField('yarn_specification', e.target.value)}
                  placeholder="eg. white color, long size"
                  list="yarn-spec-suggestions"
                />
              </label>
              <label className="field">
                <span>
                  Unit <em className="req">*</em>
                </span>
                <select value={form.unit} onChange={(e) => setField('unit', e.target.value)}>
                  <option value="KG">KG</option>
                  <option value="Cone">Cone</option>
                  <option value="Bag">Bag</option>
                </select>
              </label>
            </div>
          </section>

          <section className="yarn-form-section">
            <h2>Stock Details</h2>
            <div className="yarn-form-grid cols-3">
              {isNew ? (
                <label className="field">
                  <span>
                    Opening Stock Quantity <em className="req">*</em>
                  </span>
                  <div className="yarn-qty-input">
                    <input
                      className="num"
                      inputMode="decimal"
                      required
                      value={form.opening_stock}
                      onChange={(e) => setField('opening_stock', e.target.value)}
                      placeholder="0.00"
                      aria-label="Opening Stock Quantity"
                    />
                    <span className="yarn-qty-unit" aria-hidden="true">
                      {unit}
                    </span>
                  </div>
                  <small className="yarn-field-hint">Quantity of stock available in shop</small>
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
                  <small className="yarn-field-hint">Live balance from ledger</small>
                </label>
              )}
              <label className="field">
                <span>Reorder level</span>
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
                <small className="yarn-field-hint">Alert when stock low</small>
              </label>
              <label className="field">
                <span>Measure Price</span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.rate_per_kg}
                    onChange={(e) => setField('rate_per_kg', e.target.value)}
                    placeholder="0.00"
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    INR
                  </span>
                </div>
                <small className="yarn-field-hint">Measure value of an item</small>
              </label>
              <label className="field">
                <span>Measure Weight</span>
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
                <small className="yarn-field-hint">Minimum weight for stock alert</small>
              </label>
              <label className="field">
                <span>Location</span>
                <input
                  value={form.location}
                  onChange={(e) => setField('location', e.target.value)}
                  placeholder="Select a location"
                  list="yarn-location-suggestions"
                />
              </label>
              <label className="field">
                <span>Lot / Batch No.</span>
                <input
                  value={form.lot_number}
                  onChange={(e) => setField('lot_number', e.target.value)}
                  placeholder="Enter a lot/batch number"
                />
              </label>
            </div>
          </section>

          <section className="yarn-form-section">
            <h2>Purchase Information</h2>
            <div className="yarn-form-grid cols-3">
              <label className="field">
                <span>
                  Purchase Rate w/ GST <em className="req">*</em>
                </span>
                <div className="yarn-qty-input">
                  <input
                    className="num"
                    inputMode="decimal"
                    value={form.rate_per_kg}
                    onChange={(e) => setField('rate_per_kg', e.target.value)}
                    placeholder="0.00"
                  />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    INR
                  </span>
                </div>
              </label>
              <label className="field">
                <span>GST %</span>
                <select value={form.gst_pct} onChange={(e) => setField('gst_pct', e.target.value)}>
                  <option value="0">0</option>
                  <option value="5">5</option>
                  <option value="12">12</option>
                  <option value="18">18</option>
                  <option value="28">28</option>
                </select>
                <small className="yarn-field-hint">Tax percentage on purchase</small>
              </label>
              <label className="field">
                <span>GST Cost</span>
                <div className="yarn-qty-input">
                  <input className="num" readOnly value={gstCost.toFixed(2)} />
                  <span className="yarn-qty-unit" aria-hidden="true">
                    INR
                  </span>
                </div>
                <small className="yarn-field-hint">Value after adding tax cost</small>
              </label>
            </div>
          </section>

          <section className="yarn-form-section">
            <h2>Additional Information</h2>
            <div className="yarn-form-grid">
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>Remarks</span>
                <textarea
                  value={form.remarks}
                  onChange={(e) => setField('remarks', e.target.value)}
                  placeholder="Add any additional notes"
                  rows={3}
                />
              </label>
              <label className="yarn-check">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setField('is_active', e.target.checked)}
                />
                Active
              </label>
            </div>
          </section>
        </div>

        <datalist id="yarn-supplier-suggestions">
          {suppliers.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="yarn-master-suggestions">
          {masterNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <datalist id="yarn-location-suggestions">
          {locations.map((loc) => (
            <option key={loc} value={loc} />
          ))}
          <option value="Store A" />
          <option value="Store B" />
          <option value="Godown" />
        </datalist>
        <datalist id="yarn-quality-suggestions">
          {qualities.map((q) => (
            <option key={q} value={q} />
          ))}
        </datalist>
        <datalist id="yarn-spec-suggestions">
          {specs.map((s) => (
            <option key={s} value={s} />
          ))}
          <option value="300 Tex" />
          <option value="300 Lichi" />
          <option value="300 Denier" />
          <option value="150 Denier" />
          <option value="450 Denier" />
          <option value="150 Tex" />
        </datalist>

        {error ? <p className="form-error text-danger">{error}</p> : null}
        {message ? <p className="form-ok text-sage">{message}</p> : null}

        <p className="yarn-form-note">All fields with asterisk (*) are mandatory.</p>

        <div className="yarn-form-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setView({ mode: 'list' })}>
            Discard
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void saveYarn(true)}>
            Save &amp; Add Another
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void saveYarn(false)}>
            {isNew ? 'Add Item' : 'Save Item'}
          </button>
        </div>
      </div>
    )
  }

  if (view.mode === 'inward' && activeYarn) {
    const qty = Number(inwardForm.quantity || 0)
    const rate = Number(inwardForm.rate || 0)
    const gst = Number(inwardForm.gst_pct || 0)
    const total = qty * rate * (1 + gst / 100)
    return (
      <div className="yarn-form-page">
        <p className="yarn-crumb">
          Inventory &gt; Yarn Stock &gt; {yarnDisplayName(activeYarn)} &gt; <strong>Add Inward</strong>
        </p>
        <header className="yarn-detail-head">
          <div>
            <h2 className="yarn-detail-title">Add Inward</h2>
            <p className="yarn-detail-sub">
              {activeYarn.colour_name} · {activeYarn.quality || '—'} · {activeYarn.yarn_specification || '—'}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setView({ mode: 'detail', yarnId: activeYarn.id })}
          >
            Back
          </button>
        </header>

        <form className="yarn-form-section" onSubmit={(e) => void saveInward(e)}>
          <div className="yarn-form-grid cols-3">
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={inwardForm.date}
                onChange={(e) => setInwardForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Supplier</span>
              <input
                value={inwardForm.supplier}
                onChange={(e) => setInwardForm((f) => ({ ...f, supplier: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Invoice No.</span>
              <input
                value={inwardForm.invoice_no}
                onChange={(e) => setInwardForm((f) => ({ ...f, invoice_no: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Yarn / Colour</span>
              <input readOnly value={yarnDisplayName(activeYarn)} />
            </label>
            <label className="field">
              <span>Quality</span>
              <input readOnly value={activeYarn.quality || '—'} />
            </label>
            <label className="field">
              <span>Specification</span>
              <input readOnly value={activeYarn.yarn_specification || '—'} />
            </label>
            <label className="field">
              <span>Quantity KG</span>
              <input
                className="num"
                inputMode="decimal"
                required
                value={inwardForm.quantity}
                onChange={(e) => setInwardForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Rate</span>
              <input
                className="num"
                inputMode="decimal"
                required
                value={inwardForm.rate}
                onChange={(e) => setInwardForm((f) => ({ ...f, rate: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>GST %</span>
              <input
                className="num"
                inputMode="decimal"
                value={inwardForm.gst_pct}
                onChange={(e) => setInwardForm((f) => ({ ...f, gst_pct: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Total Amount</span>
              <input className="num" readOnly value={formatInr(total)} />
            </label>
            <label className="field">
              <span>Lot No.</span>
              <input
                value={inwardForm.lot_number}
                onChange={(e) => setInwardForm((f) => ({ ...f, lot_number: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Location</span>
              <input
                value={inwardForm.location}
                onChange={(e) => setInwardForm((f) => ({ ...f, location: e.target.value }))}
              />
            </label>
            <label className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Remarks</span>
              <textarea
                value={inwardForm.remarks}
                onChange={(e) => setInwardForm((f) => ({ ...f, remarks: e.target.value }))}
                rows={2}
              />
            </label>
          </div>
          {error ? <p className="form-error text-danger">{error}</p> : null}
          <div className="yarn-form-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setView({ mode: 'detail', yarnId: activeYarn.id })}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              Save Inward
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (view.mode === 'detail' && activeYarn) {
    const st = yarnStatus(activeYarn)
    const totals = ledgerTotals(ledger)
    const opening = Number(activeYarn.opening_stock ?? 0)
    const balanceRows = ledgerWithRunningBalance(ledger)
    const filteredLedger = balanceRows.filter((r) => {
      if (detailTab === 'inward') return Number(r.inward_kg) > 0 || r.txn_type === 'inward' || r.txn_type === 'opening'
      if (detailTab === 'outward') return Number(r.outward_kg) > 0 || r.txn_type === 'outward'
      if (detailTab === 'purchase') return r.txn_type === 'inward' || r.txn_type === 'purchase'
      if (detailTab === 'adjustments') return r.txn_type === 'adjustment'
      if (detailTab === 'ledger') return true
      return true
    })

    return (
      <div className="yarn-detail-page">
        <p className="yarn-crumb">
          Inventory &gt; Yarn Stock &gt; <strong>{yarnDisplayName(activeYarn)}</strong>
        </p>
        <header className="yarn-detail-head">
          <div>
            <h2 className="yarn-detail-title">{(activeYarn.colour_name || 'Yarn').toUpperCase()}</h2>
            <p className="yarn-detail-sub">
              {activeYarn.colour_no || '—'} ·{' '}
              <span className={`yarn-status ${st}`}>{yarnStatusLabel(st)}</span>
            </p>
          </div>
          <div className="yarn-detail-actions">
            <button type="button" className="btn-secondary" onClick={() => setView({ mode: 'list' })}>
              Back
            </button>
            <button type="button" className="btn-secondary" onClick={() => openEdit(activeYarn)}>
              Edit
            </button>
            <button type="button" className="btn-primary" onClick={() => openInward(activeYarn)}>
              Add Inward
            </button>
            <button
              type="button"
              className="btn-ghost text-danger"
              disabled={busy}
              onClick={() => void deleteYarn(activeYarn)}
            >
              Delete
            </button>
          </div>
        </header>

        <div className="yarn-meta-grid">
          <div className="yarn-meta-item">
            <span>Supplier</span>
            <strong>{activeYarn.supplier || '—'}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>Quality</span>
            <strong>{activeYarn.quality || '—'}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>Specification</span>
            <strong>{activeYarn.yarn_specification || '—'}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>Rate / KG</span>
            <strong>{formatInr(Number(activeYarn.rate_per_kg || 0))}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>Lot Number</span>
            <strong>{activeYarn.lot_number || '—'}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>HSN Code</span>
            <strong>{activeYarn.hsn_code || '—'}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>Location</span>
            <strong>{activeYarn.location || '—'}</strong>
          </div>
          <div className="yarn-meta-item">
            <span>Stock Value</span>
            <strong>{formatInr(yarnStockValue(activeYarn))}</strong>
          </div>
        </div>

        <div className="yarn-kpi-grid">
          <article className="yarn-kpi">
            <div className="yarn-kpi-ico tone-slate">O</div>
            <div>
              <div className="yarn-kpi-label">Opening Stock</div>
              <div className="yarn-kpi-value">{formatKg(opening)} KG</div>
            </div>
          </article>
          <article className="yarn-kpi">
            <div className="yarn-kpi-ico tone-ok">+</div>
            <div>
              <div className="yarn-kpi-label">Total Inward</div>
              <div className="yarn-kpi-value">{formatKg(totals.inward)} KG</div>
            </div>
          </article>
          <article className="yarn-kpi">
            <div className="yarn-kpi-ico tone-danger">−</div>
            <div>
              <div className="yarn-kpi-label">Total Outward</div>
              <div className="yarn-kpi-value">{formatKg(totals.outward)} KG</div>
            </div>
          </article>
          <article className="yarn-kpi">
            <div className="yarn-kpi-ico tone-blue">Σ</div>
            <div>
              <div className="yarn-kpi-label">Current Stock</div>
              <div className="yarn-kpi-value">{formatKg(Number(activeYarn.stock_kg))} KG</div>
            </div>
          </article>
          <article className="yarn-kpi">
            <div className="yarn-kpi-ico tone-value">₹</div>
            <div>
              <div className="yarn-kpi-label">Stock Value</div>
              <div className="yarn-kpi-value">{formatInr(yarnStockValue(activeYarn))}</div>
            </div>
          </article>
          <article className="yarn-kpi">
            <div className={`yarn-kpi-ico ${st === 'in_stock' ? 'tone-ok' : st === 'low_stock' ? 'tone-warn' : 'tone-danger'}`}>
              !
            </div>
            <div>
              <div className="yarn-kpi-label">Reorder Level</div>
              <div className="yarn-kpi-value">{formatKg(yarnReorderLevel(activeYarn))} KG</div>
            </div>
          </article>
        </div>

        <div className="yarn-tabs" role="tablist">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={detailTab === t.id}
              className={detailTab === t.id ? 'active' : ''}
              onClick={() => setDetailTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {detailTab === 'overview' ? (
          <div className="yarn-panel">
            <p className="text-muted" style={{ margin: 0 }}>
              Current stock is maintained from opening balance plus ledger movements. Status updates
              automatically from reorder level ({formatKg(yarnReorderLevel(activeYarn))} KG).
            </p>
            <div className="yarn-meta-grid">
              <div className="yarn-meta-item">
                <span>Status</span>
                <strong>
                  <span className={`yarn-status ${st}`}>{yarnStatusLabel(st)}</span>
                </strong>
              </div>
              <div className="yarn-meta-item">
                <span>Unit</span>
                <strong>{activeYarn.unit || 'KG'}</strong>
              </div>
              <div className="yarn-meta-item">
                <span>GST %</span>
                <strong>{Number(activeYarn.gst_pct || 0)}%</strong>
              </div>
              <div className="yarn-meta-item">
                <span>Remarks</span>
                <strong>{activeYarn.remarks || '—'}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="yarn-panel">
            <div className="yarn-table-wrap">
              <table className="yarn-table yarn-ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Transaction No.</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Inward KG</th>
                    <th>Outward KG</th>
                    <th>Balance KG</th>
                    <th>Rate</th>
                    <th>Value</th>
                    <th>User</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="yarn-empty">
                        No movements yet
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((row) => (
                      <tr key={row.id} style={{ cursor: 'default' }}>
                        <td>{formatDate(row.txn_date)}</td>
                        <td className="num">{row.txn_no || '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{row.txn_type}</td>
                        <td>{row.reference || row.invoice_no || '—'}</td>
                        <td className="num">{Number(row.inward_kg) ? `+${formatKg(row.inward_kg)}` : '—'}</td>
                        <td className="num">{Number(row.outward_kg) ? `−${formatKg(row.outward_kg)}` : '—'}</td>
                        <td className="num">{formatKg(row.balance_kg)}</td>
                        <td className="num">{formatInr(row.rate)}</td>
                        <td className="num">{formatInr(row.value_amount)}</td>
                        <td>{row.created_by_name || '—'}</td>
                        <td>{row.remarks || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error ? <p className="form-error text-danger">{error}</p> : null}
        {message ? <p className="form-ok text-sage">{message}</p> : null}
      </div>
    )
  }

  return (
    <div className="yarn-screen">
      <p className="yarn-crumb">
        Inventory &gt; <strong>Item Setup</strong>
      </p>

      <div className="yarn-kpi-grid">
        <article className="yarn-kpi">
          <div className="yarn-kpi-ico tone-blue">#</div>
          <div>
            <div className="yarn-kpi-label">Total Yarn Items</div>
            <div className="yarn-kpi-value">{kpis.totalItems.toLocaleString('en-IN')}</div>
          </div>
        </article>
        <article className="yarn-kpi">
          <div className="yarn-kpi-ico tone-slate">KG</div>
          <div>
            <div className="yarn-kpi-label">Total Stock</div>
            <div className="yarn-kpi-value">{formatKg(kpis.totalStock)} KG</div>
          </div>
        </article>
        <article className="yarn-kpi">
          <div className="yarn-kpi-ico tone-value">₹</div>
          <div>
            <div className="yarn-kpi-label">Stock Value</div>
            <div className="yarn-kpi-value">{formatInr(kpis.stockValue)}</div>
          </div>
        </article>
        <article className="yarn-kpi">
          <div className="yarn-kpi-ico tone-ok">✓</div>
          <div>
            <div className="yarn-kpi-label">In Stock</div>
            <div className="yarn-kpi-value">{kpis.inStock}</div>
          </div>
        </article>
        <article className="yarn-kpi">
          <div className="yarn-kpi-ico tone-warn">!</div>
          <div>
            <div className="yarn-kpi-label">Low Stock</div>
            <div className="yarn-kpi-value">{kpis.lowStock}</div>
          </div>
        </article>
        <article className="yarn-kpi">
          <div className="yarn-kpi-ico tone-danger">×</div>
          <div>
            <div className="yarn-kpi-label">Out of Stock</div>
            <div className="yarn-kpi-value">{kpis.outOfStock}</div>
          </div>
        </article>
      </div>

      <div className="yarn-panel">
        <div className="yarn-toolbar">
          <div className="yarn-search">
            <input
              type="search"
              placeholder="Search colour, number, supplier, quality, specification…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search yarn stock"
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filter
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void load().catch((e: Error) => setError(e.message))}
          >
            Refresh
          </button>
          <button type="button" className="btn-primary" onClick={openAdd}>
            + Add Item
          </button>
        </div>

        {showFilters ? (
          <div className="yarn-filter-panel">
            <div className="yarn-filter-grid">
              <label>
                Supplier
                <select
                  value={filters.supplier}
                  onChange={(e) => setFilters((f) => ({ ...f, supplier: e.target.value }))}
                >
                  <option value="">All</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quality
                <select
                  value={filters.quality}
                  onChange={(e) => setFilters((f) => ({ ...f, quality: e.target.value }))}
                >
                  <option value="">All</option>
                  {qualities.map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Yarn Specification
                <select
                  value={filters.specification}
                  onChange={(e) => setFilters((f) => ({ ...f, specification: e.target.value }))}
                >
                  <option value="">All</option>
                  {specs.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      status: e.target.value as YarnFilters['status'],
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </label>
              <label>
                Stock availability
                <select
                  value={filters.availability}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      availability: e.target.value as YarnFilters['availability'],
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="available">Available (&gt; 0)</option>
                  <option value="unavailable">Unavailable (0)</option>
                </select>
              </label>
            </div>
            <div style={{ marginTop: '0.55rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setFilters(EMPTY_YARN_FILTERS)}
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : null}

        <div className="yarn-table-wrap">
          <table className="yarn-table">
            <thead>
              <tr>
                <th>Sr. No.</th>
                <th>Colour Name</th>
                <th>Colour Number</th>
                <th>Supplier</th>
                <th>Quality</th>
                <th>Yarn Specification</th>
                <th>Opening Stock (KG)</th>
                <th>Current Stock (KG)</th>
                <th>Unit</th>
                <th>Rate / KG</th>
                <th>Stock Value</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="yarn-empty">
                    No yarn items found. Add yarn to begin.
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const st = yarnStatus(row)
                  return (
                    <tr key={row.id} onClick={() => openDetail(row)}>
                      <td className="num">{idx + 1}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-ghost col-colour"
                          style={{ padding: 0, border: 0, background: 'transparent' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            openDetail(row)
                          }}
                        >
                          {row.colour_name || '—'}
                        </button>
                      </td>
                      <td>{row.colour_no || '—'}</td>
                      <td>{row.supplier || '—'}</td>
                      <td>{row.quality || '—'}</td>
                      <td>{row.yarn_specification || '—'}</td>
                      <td className="num">{formatKg(Number(row.opening_stock ?? 0))}</td>
                      <td className="num">{formatKg(Number(row.stock_kg || 0))}</td>
                      <td>{row.unit || 'KG'}</td>
                      <td className="num">{formatInr(Number(row.rate_per_kg || 0))}</td>
                      <td className="num">{formatInr(yarnStockValue(row))}</td>
                      <td>
                        <span className={`yarn-status ${st}`}>{yarnStatusLabel(st)}</span>
                      </td>
                      <td>
                        <div className="yarn-row-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn-secondary"
                            aria-label="View"
                            onClick={() => openDetail(row)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            aria-label="Edit"
                            onClick={(e) => openEdit(row, e)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="yarn-card-list">
          {filtered.length === 0 ? (
            <p className="yarn-empty">No yarn items found.</p>
          ) : (
            filtered.map((row) => {
              const st = yarnStatus(row)
              return (
                <button
                  key={row.id}
                  type="button"
                  className="yarn-mobile-card"
                  onClick={() => openDetail(row)}
                >
                  <div className="yarn-mobile-top">
                    <div>
                      <strong>{row.colour_name || 'Yarn'}</strong>
                      <div className="text-muted">{row.colour_no || '—'}</div>
                    </div>
                    <span className={`yarn-status ${st}`}>{yarnStatusLabel(st)}</span>
                  </div>
                  <div className="yarn-mobile-meta">
                    <div>
                      Supplier
                      <strong>{row.supplier || '—'}</strong>
                    </div>
                    <div>
                      Quality
                      <strong>{row.quality || '—'}</strong>
                    </div>
                    <div>
                      Specification
                      <strong>{row.yarn_specification || '—'}</strong>
                    </div>
                    <div>
                      Opening Stock
                      <strong>
                        {formatKg(Number(row.opening_stock ?? 0))} {row.unit || 'KG'}
                      </strong>
                    </div>
                    <div>
                      Current Stock
                      <strong>
                        {formatKg(Number(row.stock_kg || 0))} {row.unit || 'KG'}
                      </strong>
                    </div>
                  </div>
                  <div className="yarn-mobile-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        openDetail(row)
                      }}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={(e) => openEdit(row, e)}
                    >
                      Edit
                    </button>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="yarn-sticky-add">
          <button type="button" className="btn-primary" onClick={openAdd}>
            + Add Item
          </button>
        </div>
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
