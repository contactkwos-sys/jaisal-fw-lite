import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  costingDenierFromBase,
  DEFAULT_LENGTH_MTR,
  DEFAULT_TAR_ENDS,
  DEFAULT_WIDTH,
} from '../lib/designWiseCosting'
import {
  deleteQualityMaster,
  fetchAllQualities,
  fillRecipeDenierFromRateMaster,
  qualityMasterTablesReady,
  saveQualityMaster,
  setQualityActive,
  type QualityMasterRow,
  type QualityWarpRecipeRow,
  type QualityWeftRecipeRow,
} from '../lib/qualityMaster'
import { rateMasterItemNames } from '../lib/dinIntakeCosting'
import { fetchAllRates, type RateMasterRow } from '../lib/rateMaster'
import { FALLBACK_COLOURS, fetchAllColours } from '../lib/colourMaster'
import { todayISO } from '../lib/mutate'

const FEEDER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

type FormState = {
  quality_name: string
  is_active: boolean
  warp_base_denier: string
  weft_base_denier: string
  default_width: string
  default_length_mtr: string
  default_tar_ends: string
  notes: string
  warp_recipe: QualityWarpRecipeRow[]
  weft_recipe: QualityWeftRecipeRow[]
}

const emptyForm = (): FormState => ({
  quality_name: '',
  is_active: true,
  warp_base_denier: '',
  weft_base_denier: '',
  default_width: String(DEFAULT_WIDTH),
  default_length_mtr: String(DEFAULT_LENGTH_MTR),
  default_tar_ends: String(DEFAULT_TAR_ENDS),
  notes: '',
  warp_recipe: [
    {
      sr: 1,
      yarn_name: '',
      base_denier: '',
      costing_denier: '',
      tar_ends: String(DEFAULT_TAR_ENDS),
      width: String(DEFAULT_WIDTH),
      length_mtr: String(DEFAULT_LENGTH_MTR),
      rate_master_id: null,
    },
  ],
  weft_recipe: [
    {
      sr: 1,
      feeder_no: 1,
      colour: '',
      weft_name: '',
      base_denier: '',
      costing_denier: '',
      pic: '',
      width: String(DEFAULT_WIDTH),
      length_mtr: String(DEFAULT_LENGTH_MTR),
      rate_master_id: null,
    },
  ],
})

function fromRow(row: QualityMasterRow): FormState {
  return {
    quality_name: row.quality_name,
    is_active: row.is_active,
    warp_base_denier: row.warp_base_denier != null ? String(row.warp_base_denier) : '',
    weft_base_denier: row.weft_base_denier != null ? String(row.weft_base_denier) : '',
    default_width: String(row.default_width || DEFAULT_WIDTH),
    default_length_mtr: String(row.default_length_mtr || DEFAULT_LENGTH_MTR),
    default_tar_ends: String(row.default_tar_ends || DEFAULT_TAR_ENDS),
    notes: row.notes || '',
    warp_recipe: row.warp_recipe.length
      ? row.warp_recipe.map((w, i) => ({
          ...w,
          sr: w.sr ?? i + 1,
          costing_denier:
            w.costing_denier ||
            (w.base_denier ? String(costingDenierFromBase(w.base_denier) || '') : ''),
          width: w.width || String(row.default_width || DEFAULT_WIDTH),
          length_mtr: w.length_mtr || String(row.default_length_mtr || DEFAULT_LENGTH_MTR),
        }))
      : emptyForm().warp_recipe,
    weft_recipe: row.weft_recipe.length
      ? row.weft_recipe.map((w, i) => ({
          ...w,
          sr: w.sr ?? i + 1,
          costing_denier:
            w.costing_denier ||
            (w.base_denier ? String(costingDenierFromBase(w.base_denier) || '') : ''),
          width: w.width || String(row.default_width || DEFAULT_WIDTH),
          length_mtr: w.length_mtr || String(row.default_length_mtr || DEFAULT_LENGTH_MTR),
        }))
      : emptyForm().weft_recipe,
  }
}

export function QualityMasterScreen() {
  const { session, isCeo, isManager, roleName } = useAuth()
  const role = (roleName || '').trim().toLowerCase()
  const canEdit =
    isCeo ||
    isManager ||
    role === 'md' ||
    role === 'managing director' ||
    role === 'owner' ||
    role.includes('ceo')

  const [rows, setRows] = useState<QualityMasterRow[]>([])
  const [rates, setRates] = useState<RateMasterRow[]>([])
  const [colours, setColours] = useState<string[]>([...FALLBACK_COLOURS])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [migrationHint, setMigrationHint] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [viewOnly, setViewOnly] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const warpOptions = useMemo(() => rateMasterItemNames(rates, 'warp'), [rates])
  const weftOptions = useMemo(() => rateMasterItemNames(rates, 'weft'), [rates])
  const formEditable = canEdit && !viewOnly

  const load = useCallback(async () => {
    setError(null)
    const ready = await qualityMasterTablesReady()
    setMigrationHint(!ready)
    if (!ready) return
    const [all, allRates, colourRows] = await Promise.all([
      fetchAllQualities(),
      fetchAllRates().catch(() => [] as RateMasterRow[]),
      fetchAllColours({ activeOnly: true }).catch(() => []),
    ])
    setRows(all)
    setRates(allRates)
    if (colourRows.length) setColours(colourRows.map((c) => c.colour_name))
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.quality_name.toLowerCase().includes(q))
  }, [rows, search])

  function openAdd() {
    setEditingId(null)
    setViewOnly(false)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(row: QualityMasterRow) {
    setEditingId(row.id)
    setViewOnly(false)
    setForm(fromRow(row))
    setModalOpen(true)
  }

  function openView(row: QualityMasterRow) {
    setEditingId(row.id)
    setViewOnly(true)
    setForm(fromRow(row))
    setModalOpen(true)
  }

  function applyWarpYarn(idx: number, yarnName: string) {
    const filled = fillRecipeDenierFromRateMaster('warp', yarnName, rates, todayISO())
    setForm((f) => {
      const warp_recipe = [...f.warp_recipe]
      const row = warp_recipe[idx]
      warp_recipe[idx] = {
        ...row,
        yarn_name: yarnName,
        base_denier: filled.base_denier || row.base_denier,
        costing_denier: filled.costing_denier || row.costing_denier || '',
        rate_master_id: filled.rate_master_id,
        tar_ends: row.tar_ends || f.default_tar_ends || String(DEFAULT_TAR_ENDS),
        width: row.width || f.default_width || String(DEFAULT_WIDTH),
        length_mtr: row.length_mtr || f.default_length_mtr || String(DEFAULT_LENGTH_MTR),
      }
      const firstBase = warp_recipe.find((w) => w.base_denier)?.base_denier || ''
      return {
        ...f,
        warp_recipe,
        warp_base_denier: firstBase || f.warp_base_denier,
      }
    })
  }

  function applyWeftYarn(idx: number, yarnName: string) {
    const filled = fillRecipeDenierFromRateMaster('weft', yarnName, rates, todayISO())
    setForm((f) => {
      const weft_recipe = [...f.weft_recipe]
      const row = weft_recipe[idx]
      weft_recipe[idx] = {
        ...row,
        weft_name: yarnName,
        base_denier: filled.base_denier || row.base_denier,
        costing_denier: filled.costing_denier || row.costing_denier || '',
        rate_master_id: filled.rate_master_id,
        width: row.width || f.default_width || String(DEFAULT_WIDTH),
        length_mtr: row.length_mtr || f.default_length_mtr || String(DEFAULT_LENGTH_MTR),
      }
      const firstBase = weft_recipe.find((w) => w.base_denier)?.base_denier || ''
      return {
        ...f,
        weft_recipe,
        weft_base_denier: firstBase || f.weft_base_denier,
      }
    })
  }

  async function handleSave() {
    if (!formEditable) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await saveQualityMaster(
        {
          quality_name: form.quality_name,
          is_active: form.is_active,
          warp_base_denier: form.warp_base_denier ? Number(form.warp_base_denier) : null,
          weft_base_denier: form.weft_base_denier ? Number(form.weft_base_denier) : null,
          default_width: Number(form.default_width) || DEFAULT_WIDTH,
          default_length_mtr: Number(form.default_length_mtr) || DEFAULT_LENGTH_MTR,
          default_tar_ends: Number(form.default_tar_ends) || DEFAULT_TAR_ENDS,
          notes: form.notes || null,
          warp_recipe: form.warp_recipe.filter((r) => r.yarn_name.trim() || r.base_denier.trim()),
          weft_recipe: form.weft_recipe.filter(
            (r) => r.weft_name.trim() || r.colour?.trim() || r.base_denier.trim() || r.pic?.trim(),
          ),
        },
        session?.user?.id || null,
        editingId,
      )
      setModalOpen(false)
      setMessage(editingId ? 'Quality updated' : 'Quality created')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Quality Master</h1>
          <p className="text-muted">
            Quality recipes auto-fill Warp / Weft in DIN Costing — still fully editable after apply
          </p>
        </div>
        {canEdit ? (
          <button type="button" className="primary-save" onClick={openAdd}>
            + Add Quality
          </button>
        ) : null}
      </header>

      {migrationHint ? (
        <p className="form-error text-danger" role="alert">
          Quality Master table missing — run public/migration-quality-colour-production.sql on Supabase.
        </p>
      ) : null}

      <div className="dwc-panel" style={{ display: 'grid', gap: '0.75rem' }}>
        <label className="field">
          <span className="text-muted">Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quality name…"
          />
        </label>

        <div className="dwc-table-wrap">
          <table className="dwc-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Quality Name</th>
                <th>Warp Recipe</th>
                <th>Weft Recipe</th>
                <th>Width</th>
                <th>Length</th>
                <th>TAR</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.quality_name}</strong>
                  </td>
                  <td>
                    {row.warp_recipe.map((w) => w.yarn_name).filter(Boolean).join(', ') || '—'}
                  </td>
                  <td>
                    {row.weft_recipe
                      .map((w) => [w.colour, w.weft_name].filter(Boolean).join(' '))
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </td>
                  <td className="num">{row.default_width}</td>
                  <td className="num">{row.default_length_mtr}</td>
                  <td className="num">{row.default_tar_ends}</td>
                  <td>{row.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <div className="dwc-row-actions">
                      <button type="button" className="btn-link" onClick={() => openView(row)}>
                        View
                      </button>
                      {canEdit ? (
                        <>
                          <button type="button" className="btn-link" onClick={() => openEdit(row)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            disabled={busy}
                            onClick={() => {
                              void setQualityActive(row.id, !row.is_active, session?.user?.id || null)
                                .then(load)
                                .catch((e: Error) => setError(e.message))
                            }}
                          >
                            {row.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            className="btn-link text-danger"
                            disabled={busy}
                            onClick={() => {
                              if (!confirm(`Delete quality "${row.quality_name}"?`)) return
                              void deleteQualityMaster(row.id)
                                .then(load)
                                .catch((e: Error) => setError(e.message))
                            }}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={8} className="text-muted">
                    No qualities yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      {modalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 860, width: '94vw', maxHeight: '90vh', overflow: 'auto' }}>
            <header className="modal-head">
              <h2>{viewOnly ? 'View Quality' : editingId ? 'Edit Quality' : 'Add Quality'}</h2>
              <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </header>
            <div className="modal-body" style={{ display: 'grid', gap: '0.75rem' }}>
              <label className="field">
                <span className="text-muted">Quality Name</span>
                <input
                  value={form.quality_name}
                  disabled={!formEditable}
                  onChange={(e) => setForm((f) => ({ ...f, quality_name: e.target.value }))}
                  placeholder="e.g. 150 ROTO B&W"
                />
              </label>
              <label className="field">
                <span className="text-muted">Description / Remarks</span>
                <textarea
                  value={form.notes}
                  disabled={!formEditable}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes"
                />
              </label>
              <div className="dwc-details-row">
                <label className="field">
                  <span className="text-muted">Width (inch)</span>
                  <input
                    className="num"
                    value={form.default_width}
                    disabled={!formEditable}
                    onChange={(e) => setForm((f) => ({ ...f, default_width: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="text-muted">Length (m)</span>
                  <input
                    className="num"
                    value={form.default_length_mtr}
                    disabled={!formEditable}
                    onChange={(e) => setForm((f) => ({ ...f, default_length_mtr: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="text-muted">TAR / Ends</span>
                  <input
                    className="num"
                    value={form.default_tar_ends}
                    disabled={!formEditable}
                    onChange={(e) => setForm((f) => ({ ...f, default_tar_ends: e.target.value }))}
                  />
                </label>
                <label className="field">
                  <span className="text-muted">Status</span>
                  <select
                    value={form.is_active ? '1' : '0'}
                    disabled={!formEditable}
                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
                  >
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </label>
              </div>

              <h3 className="section-title">WARP RECIPE</h3>
              {form.warp_recipe.map((row, idx) => (
                <div key={idx} className="dwc-details-row">
                  <label className="field">
                    <span className="text-muted">S.R.</span>
                    <input className="num" value={row.sr ?? idx + 1} readOnly />
                  </label>
                  <label className="field">
                    <span className="text-muted">Warp Yarn</span>
                    <input
                      list="qm-warp-yarns"
                      value={row.yarn_name}
                      disabled={!formEditable}
                      onChange={(e) => applyWarpYarn(idx, e.target.value)}
                      placeholder="Select from Rate Master"
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Base Denier</span>
                    <input
                      className="num"
                      value={row.base_denier}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const warp_recipe = [...f.warp_recipe]
                          const base = e.target.value
                          warp_recipe[idx] = {
                            ...row,
                            base_denier: base,
                            costing_denier: base ? String(costingDenierFromBase(base) || '') : '',
                          }
                          return { ...f, warp_recipe }
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Costing Denier</span>
                    <input
                      className="num"
                      value={
                        row.costing_denier ||
                        (row.base_denier ? String(costingDenierFromBase(row.base_denier) || '') : '')
                      }
                      readOnly
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">TAR / Ends</span>
                    <input
                      className="num"
                      value={row.tar_ends || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const warp_recipe = [...f.warp_recipe]
                          warp_recipe[idx] = { ...row, tar_ends: e.target.value }
                          return { ...f, warp_recipe }
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Width</span>
                    <input
                      className="num"
                      value={row.width || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const warp_recipe = [...f.warp_recipe]
                          warp_recipe[idx] = { ...row, width: e.target.value }
                          return { ...f, warp_recipe }
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Length</span>
                    <input
                      className="num"
                      value={row.length_mtr || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const warp_recipe = [...f.warp_recipe]
                          warp_recipe[idx] = { ...row, length_mtr: e.target.value }
                          return { ...f, warp_recipe }
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              {formEditable ? (
                <button
                  type="button"
                  className="btn-warp"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      warp_recipe: [
                        ...f.warp_recipe,
                        {
                          sr: f.warp_recipe.length + 1,
                          yarn_name: '',
                          base_denier: '',
                          costing_denier: '',
                          tar_ends: String(DEFAULT_TAR_ENDS),
                          width: f.default_width || String(DEFAULT_WIDTH),
                          length_mtr: f.default_length_mtr || String(DEFAULT_LENGTH_MTR),
                          rate_master_id: null,
                        },
                      ],
                    }))
                  }
                >
                  + Add Warp Yarn
                </button>
              ) : null}

              <h3 className="section-title">WEFT RECIPE</h3>
              {form.weft_recipe.map((row, idx) => (
                <div key={idx} className="dwc-details-row">
                  <label className="field">
                    <span className="text-muted">S.R.</span>
                    <input className="num" value={row.sr ?? idx + 1} readOnly />
                  </label>
                  <label className="field">
                    <span className="text-muted">Feeder No.</span>
                    <select
                      value={row.feeder_no ?? idx + 1}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const weft_recipe = [...f.weft_recipe]
                          weft_recipe[idx] = { ...row, feeder_no: Number(e.target.value) || idx + 1 }
                          return { ...f, weft_recipe }
                        })
                      }
                    >
                      {FEEDER_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          Feeder {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="text-muted">Colour</span>
                    <input
                      list="qm-colours"
                      value={row.colour || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const weft_recipe = [...f.weft_recipe]
                          weft_recipe[idx] = { ...row, colour: e.target.value }
                          return { ...f, weft_recipe }
                        })
                      }
                      placeholder="Colour Master"
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Weft Yarn</span>
                    <input
                      list="qm-weft-yarns"
                      value={row.weft_name}
                      disabled={!formEditable}
                      onChange={(e) => applyWeftYarn(idx, e.target.value)}
                      placeholder="Select from Rate Master"
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Base Denier</span>
                    <input
                      className="num"
                      value={row.base_denier}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const weft_recipe = [...f.weft_recipe]
                          const base = e.target.value
                          weft_recipe[idx] = {
                            ...row,
                            base_denier: base,
                            costing_denier: base ? String(costingDenierFromBase(base) || '') : '',
                          }
                          return { ...f, weft_recipe }
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Costing Denier</span>
                    <input
                      className="num"
                      value={
                        row.costing_denier ||
                        (row.base_denier ? String(costingDenierFromBase(row.base_denier) || '') : '')
                      }
                      readOnly
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">PIC</span>
                    <input
                      className="num"
                      value={row.pic || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const weft_recipe = [...f.weft_recipe]
                          weft_recipe[idx] = { ...row, pic: e.target.value }
                          return { ...f, weft_recipe }
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Width</span>
                    <input
                      className="num"
                      value={row.width || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const weft_recipe = [...f.weft_recipe]
                          weft_recipe[idx] = { ...row, width: e.target.value }
                          return { ...f, weft_recipe }
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Length</span>
                    <input
                      className="num"
                      value={row.length_mtr || ''}
                      disabled={!formEditable}
                      onChange={(e) =>
                        setForm((f) => {
                          const weft_recipe = [...f.weft_recipe]
                          weft_recipe[idx] = { ...row, length_mtr: e.target.value }
                          return { ...f, weft_recipe }
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              {formEditable ? (
                <button
                  type="button"
                  className="btn-warp"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      weft_recipe: [
                        ...f.weft_recipe,
                        {
                          sr: f.weft_recipe.length + 1,
                          feeder_no: f.weft_recipe.length + 1,
                          colour: '',
                          weft_name: '',
                          base_denier: '',
                          costing_denier: '',
                          pic: '',
                          width: f.default_width || String(DEFAULT_WIDTH),
                          length_mtr: f.default_length_mtr || String(DEFAULT_LENGTH_MTR),
                          rate_master_id: null,
                        },
                      ],
                    }))
                  }
                >
                  + Add Weft Yarn
                </button>
              ) : null}

              <datalist id="qm-warp-yarns">
                {warpOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <datalist id="qm-weft-yarns">
                {weftOptions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <datalist id="qm-colours">
                {colours.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <footer className="modal-foot" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="dwc-secondary-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              {formEditable ? (
                <button type="button" className="primary-save" disabled={busy} onClick={() => void handleSave()}>
                  {busy ? 'Saving…' : 'Save Quality'}
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
