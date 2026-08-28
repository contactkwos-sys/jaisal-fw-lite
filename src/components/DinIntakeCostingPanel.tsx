import { useMemo } from 'react'
import {
  applyWarpItemFromMaster,
  applyWeftItemFromMaster,
  rateMasterItemNames,
  type IntakeCostingDraft,
} from '../lib/dinIntakeCosting'
import {
  computeBuildup,
  computeWarpRow,
  computeWeftRow,
  emptyWarp,
  emptyWeft,
  formatCostingDenier,
  fmtInr,
  fmtMoney,
  n,
  withBaseDenier,
} from '../lib/designWiseCosting'
import { gstLabel, type RateMasterRow } from '../lib/rateMaster'

type Props = {
  draft: IntakeCostingDraft
  rates: RateMasterRow[]
  canWrite: boolean
  onChange: (next: IntakeCostingDraft) => void
  onOpenFullCosting: () => void
}

export function DinIntakeCostingPanel({ draft, rates, canWrite, onChange, onOpenFullCosting }: Props) {
  const readOnly = !canWrite || draft.isLocked
  const warpItems = useMemo(() => rateMasterItemNames(rates, 'warp'), [rates])
  const weftItems = useMemo(() => rateMasterItemNames(rates, 'weft'), [rates])

  const buildup = useMemo(
    () =>
      computeBuildup(
        draft.warps,
        draft.wefts,
        n(draft.designLength),
        n(draft.picConversionRate),
        n(draft.muPercent),
        n(draft.gstPercent),
        n(draft.wastageMtr),
        n(draft.wastagePercent),
      ),
    [draft],
  )

  function patch(partial: Partial<IntakeCostingDraft>) {
    onChange({ ...draft, ...partial })
  }

  return (
    <section className="dto-costing-block" aria-label="Design Costing">
      <div className="dto-panel-head">
        <div>
          <h3 className="section-title">Design Costing</h3>
          <p className="text-muted2">
            {readOnly
              ? 'View-only — rates from Rate Master. Open full costing to edit locked records.'
              : 'Type or pick an item name — rate fills from Rate Master automatically.'}
          </p>
        </div>
        <button type="button" className="btn-warp" onClick={onOpenFullCosting}>
          Open Full Costing
        </button>
      </div>

      <div className="dto-form-grid dto-costing-meta">
        <label className="field">
          <span>Costing Date</span>
          <input
            type="date"
            value={draft.costingDate}
            disabled={readOnly}
            onChange={(e) => patch({ costingDate: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Design Length (mtr)</span>
          <input
            type="number"
            min="0"
            step="any"
            value={draft.designLength}
            disabled={readOnly}
            onChange={(e) => patch({ designLength: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Status</span>
          <input
            value={draft.isLocked ? 'Locked' : draft.status === 'final' ? 'Final' : 'Draft (editable)'}
            readOnly
          />
        </label>
      </div>

      <div className="dto-costing-table-wrap">
        <strong>Warp items</strong>
        <table className="dto-costing-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Base Denier</th>
              <th>Costing Denier</th>
              <th>TAR / Ends</th>
              <th>Length</th>
              <th>Rate ₹/kg</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.warps.map((row) => {
              const calc = computeWarpRow(row)
              return (
                <tr key={row.key}>
                  <td>
                    <input
                      list="dto-warp-rate-items"
                      value={row.yarn_name}
                      disabled={readOnly}
                      placeholder="e.g. 80 Roto Black"
                      onChange={(e) => {
                        const next = applyWarpItemFromMaster(row, e.target.value, rates, draft.costingDate)
                        patch({ warps: draft.warps.map((r) => (r.key === row.key ? next : r)) })
                      }}
                      onBlur={() => {
                        const next = applyWarpItemFromMaster(row, row.yarn_name, rates, draft.costingDate)
                        patch({ warps: draft.warps.map((r) => (r.key === row.key ? next : r)) })
                      }}
                    />
                    {row.rate_source === 'rate_master' && row.rate_basic != null ? (
                      <small className="text-muted">
                        Rate Master · {fmtInr(row.rate_basic)} + {gstLabel(row.rate_gst_percent ?? 0)}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.base_denier}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          warps: draft.warps.map((r) =>
                            r.key === row.key ? withBaseDenier(r, e.target.value) : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input className="num dwc-auto" value={formatCostingDenier(row)} readOnly />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.tar_ends}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          warps: draft.warps.map((r) =>
                            r.key === row.key ? { ...r, tar_ends: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.length_mtr}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          warps: draft.warps.map((r) =>
                            r.key === row.key ? { ...r, length_mtr: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.rate_per_kg}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          warps: draft.warps.map((r) =>
                            r.key === row.key
                              ? {
                                  ...r,
                                  rate_per_kg: e.target.value,
                                  rate_source: 'manual',
                                  rate_master_id: undefined,
                                }
                              : r,
                          ),
                        })
                      }
                    />
                    {row.rate_source === 'manual' && !readOnly ? (
                      <small className="text-muted">
                        Rate Source: Manual Override{' '}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() =>
                            patch({
                              warps: draft.warps.map((r) =>
                                r.key === row.key
                                  ? applyWarpItemFromMaster(
                                      { ...r, rate_source: undefined, rate_master_id: undefined },
                                      r.yarn_name,
                                      rates,
                                      draft.costingDate,
                                    )
                                  : r,
                              ),
                            })
                          }
                        >
                          Use Rate Master Rate
                        </button>
                      </small>
                    ) : null}
                  </td>
                  <td className="num">{fmtMoney(calc.amount)}</td>
                  <td>
                    {!readOnly && draft.warps.length > 1 ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          patch({
                            warps: draft.warps
                              .filter((r) => r.key !== row.key)
                              .map((r, i) => ({ ...r, sr_no: i + 1 })),
                          })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!readOnly ? (
          <button
            type="button"
            className="btn-warp"
            onClick={() => patch({ warps: [...draft.warps, emptyWarp(draft.warps.length + 1)] })}
          >
            + Add Warp Item
          </button>
        ) : null}
        <datalist id="dto-warp-rate-items">
          {warpItems.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="dto-costing-table-wrap">
        <strong>Weft items</strong>
        <table className="dto-costing-table">
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Base Denier</th>
              <th>Costing Denier</th>
              <th>PIC</th>
              <th>Width</th>
              <th>Length</th>
              <th>Rate ₹/kg</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.wefts.map((row) => {
              const calc = computeWeftRow(row)
              return (
                <tr key={row.key}>
                  <td>
                    <input
                      list="dto-weft-rate-items"
                      value={row.weft_name}
                      disabled={readOnly}
                      placeholder="e.g. 440 HSY"
                      onChange={(e) => {
                        const next = applyWeftItemFromMaster(row, e.target.value, rates, draft.costingDate)
                        patch({ wefts: draft.wefts.map((r) => (r.key === row.key ? next : r)) })
                      }}
                      onBlur={() => {
                        const next = applyWeftItemFromMaster(row, row.weft_name, rates, draft.costingDate)
                        patch({ wefts: draft.wefts.map((r) => (r.key === row.key ? next : r)) })
                      }}
                    />
                    {row.rate_source === 'rate_master' && row.rate_basic != null ? (
                      <small className="text-muted">
                        Rate Master · {fmtInr(row.rate_basic)} + {gstLabel(row.rate_gst_percent ?? 0)}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.base_denier}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          wefts: draft.wefts.map((r) =>
                            r.key === row.key ? withBaseDenier(r, e.target.value) : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input className="num dwc-auto" value={formatCostingDenier(row)} readOnly />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.pic}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          wefts: draft.wefts.map((r) =>
                            r.key === row.key ? { ...r, pic: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.width}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          wefts: draft.wefts.map((r) =>
                            r.key === row.key ? { ...r, width: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.length_mtr}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          wefts: draft.wefts.map((r) =>
                            r.key === row.key ? { ...r, length_mtr: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="num"
                      type="number"
                      min="0"
                      step="any"
                      value={row.rate_per_kg}
                      disabled={readOnly}
                      onChange={(e) =>
                        patch({
                          wefts: draft.wefts.map((r) =>
                            r.key === row.key
                              ? {
                                  ...r,
                                  rate_per_kg: e.target.value,
                                  rate_source: 'manual',
                                  rate_master_id: undefined,
                                }
                              : r,
                          ),
                        })
                      }
                    />
                    {row.rate_source === 'manual' && !readOnly ? (
                      <small className="text-muted">
                        Rate Source: Manual Override{' '}
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() =>
                            patch({
                              wefts: draft.wefts.map((r) =>
                                r.key === row.key
                                  ? applyWeftItemFromMaster(
                                      { ...r, rate_source: undefined, rate_master_id: undefined },
                                      r.weft_name,
                                      rates,
                                      draft.costingDate,
                                    )
                                  : r,
                              ),
                            })
                          }
                        >
                          Use Rate Master Rate
                        </button>
                      </small>
                    ) : null}
                  </td>
                  <td className="num">{fmtMoney(calc.amount)}</td>
                  <td>
                    {!readOnly && draft.wefts.length > 1 ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          patch({
                            wefts: draft.wefts
                              .filter((r) => r.key !== row.key)
                              .map((r, i) => ({ ...r, sr_no: i + 1 })),
                          })
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!readOnly ? (
          <button
            type="button"
            className="btn-warp"
            onClick={() => patch({ wefts: [...draft.wefts, emptyWeft(draft.wefts.length + 1)] })}
          >
            + Add Weft Item
          </button>
        ) : null}
        <datalist id="dto-weft-rate-items">
          {weftItems.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="dto-costing-summary">
        <span>
          Yarn total: <strong>{fmtInr(buildup.totalYarnAmount)}</strong>
        </span>
        <span>
          Final ₹/mtr: <strong>{fmtInr(buildup.finalCostPerMtr)}</strong>
        </span>
      </div>
    </section>
  )
}
