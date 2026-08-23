import { useMemo, useState } from 'react'
import { finalSaleRate, fmtInr, fmtQty } from '../../lib/designWiseCosting'

export type DinCostingViewRow = {
  id: string
  din_number: string
  quality_name: string | null
  costing_date: string
  design_length_mtr: number | null
  usable_length_mtr: number | null
  ceo_final_selling_rate: number | null
  final_cost_per_mtr: number | null
  diary_image_url: string | null
  status: string | null
  is_locked: boolean | null
}

type Filters = {
  din: string
  quality: string
  dateFrom: string
  dateTo: string
  status: string
}

const EMPTY: Filters = { din: '', quality: '', dateFrom: '', dateTo: '', status: '' }

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

type Props = {
  rows: DinCostingViewRow[]
  onRefresh: () => void
}

export function DinCostingViewOnly({ rows, onRefresh }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [preview, setPreview] = useState<DinCostingViewRow | null>(null)

  const filtered = useMemo(() => {
    const dinQ = filters.din.trim().toLowerCase()
    const qualityQ = filters.quality.trim().toLowerCase()
    const statusQ = filters.status.trim().toLowerCase()
    return rows.filter((row) => {
      if (dinQ && !row.din_number.toLowerCase().includes(dinQ)) return false
      if (qualityQ && !String(row.quality_name || '').toLowerCase().includes(qualityQ)) return false
      if (statusQ) {
        const st = row.status === 'final' || row.is_locked ? 'finalized' : 'draft'
        if (st !== statusQ) return false
      }
      if (filters.dateFrom && row.costing_date < filters.dateFrom) return false
      if (filters.dateTo && row.costing_date > filters.dateTo) return false
      return true
    })
  }, [rows, filters])

  const saleRate = (row: DinCostingViewRow) =>
    finalSaleRate(row.ceo_final_selling_rate, row.final_cost_per_mtr)

  return (
    <div className="screen dwc-screen dwc-view-only">
      <header className="screen-header dwc-header">
        <div>
          <h1>Order to Program</h1>
          <p className="text-muted">Design preview &amp; CEO final sale rate only — no costing breakdown</p>
        </div>
      </header>

      <section className="dwc-panel dwc-view-note">
        <p className="text-muted2">
          Program team sees design image and CEO-approved final sale rate only. Full costing is available on the CEO
          dashboard.
        </p>
      </section>

      <section className="dwc-panel dwc-history">
        <div className="dwc-panel-head">
          <h2 className="section-title">Designs Ready for Program</h2>
          <button type="button" className="dwc-secondary-btn" onClick={onRefresh}>
            Refresh
          </button>
        </div>
        <div className="dwc-filters">
          <label className="field">
            <span className="text-muted">Search DIN</span>
            <input
              value={filters.din}
              onChange={(e) => setFilters((f) => ({ ...f, din: e.target.value }))}
              placeholder="e.g. JFG1558"
            />
          </label>
          <label className="field">
            <span className="text-muted">Quality</span>
            <input
              value={filters.quality}
              onChange={(e) => setFilters((f) => ({ ...f, quality: e.target.value }))}
              placeholder="Quality name"
            />
          </label>
          <label className="field">
            <span className="text-muted">Date From</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Date To</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Status</span>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">All</option>
              <option value="finalized">Finalized</option>
              <option value="draft">Draft</option>
            </select>
          </label>
          <div className="dwc-filter-actions">
            <button type="button" className="dwc-secondary-btn" onClick={() => setFilters(EMPTY)}>
              Clear Filters
            </button>
          </div>
        </div>

        <div className="dwc-table-wrap">
          <table className="dwc-table dwc-history-table dwc-view-table">
            <thead>
              <tr>
                <th>S.R.</th>
                <th>DIN No.</th>
                <th>Date</th>
                <th>Quality</th>
                <th>Design View</th>
                <th>Final Sale Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No designs found
                  </td>
                </tr>
              ) : (
                filtered.map((row, idx) => {
                  const rate = saleRate(row)
                  const finalized = row.status === 'final' || row.is_locked
                  return (
                    <tr key={row.id}>
                      <td>{idx + 1}</td>
                      <td className="dwc-din-cell">{row.din_number}</td>
                      <td>{formatDate(row.costing_date)}</td>
                      <td>{row.quality_name || '—'}</td>
                      <td>
                        {row.diary_image_url ? (
                          <button
                            type="button"
                            className="dwc-design-thumb-btn"
                            onClick={() => setPreview(row)}
                            title="View design"
                          >
                            <img src={row.diary_image_url} alt={`Design ${row.din_number}`} />
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num dwc-emphasis dwc-selling-rate">
                        {rate != null ? fmtInr(rate) : '—'}
                      </td>
                      <td>
                        <span
                          className={`dwc-status-chip dwc-status-${finalized ? 'final' : 'draft'}`}
                        >
                          {finalized ? 'Finalized' : 'Draft'}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {preview ? (
        <div className="dwc-preview-modal" role="dialog" aria-modal="true">
          <div className="dwc-preview-card">
            <div className="dwc-preview-head">
              <h2>{preview.din_number} · {preview.quality_name || 'Design'}</h2>
              <button type="button" className="dwc-icon-btn" onClick={() => setPreview(null)}>
                ✕
              </button>
            </div>
            <div className="dwc-preview-body">
              {preview.diary_image_url ? (
                <img src={preview.diary_image_url} alt={`DIN ${preview.din_number}`} />
              ) : (
                <div className="dwc-diary-preview empty">No image</div>
              )}
              <dl className="dwc-preview-meta">
                <div>
                  <dt>Final Sale Rate</dt>
                  <dd className="dwc-selling-rate">
                    {saleRate(preview) != null ? fmtInr(Number(saleRate(preview))) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Usable Length</dt>
                  <dd>
                    {preview.usable_length_mtr != null
                      ? `${fmtQty(Number(preview.usable_length_mtr), 0)} mtr`
                      : preview.design_length_mtr != null
                        ? `${fmtQty(Math.max(Number(preview.design_length_mtr) - 10, 0), 0)} mtr`
                        : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function CalcInfo({ hint }: { hint: string }) {
  return (
    <span className="dwc-calc-info" title={hint} aria-label={hint}>
      ⓘ
    </span>
  )
}
