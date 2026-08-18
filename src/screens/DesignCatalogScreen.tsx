import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { DesignCatalog } from '../lib/database.types'
import {
  downloadTextFile,
  exportCustomersCsv,
  fetchCrmCustomers,
} from '../lib/crmCustomers'
import {
  catalogShareCaption,
  fetchDesignCatalog,
  insertDesignCatalog,
  loadCatalogCustomers,
  nextCatalogDesignNo,
  shareCatalogDesign,
  uploadCatalogImage,
  type CatalogCustomerStub,
} from '../lib/designCatalog'

type ShareMode = 'one' | 'broadcast'

type BulkRow = {
  key: string
  file: File
  previewUrl: string
  designNo: number
  jfgNo: string
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

export function DesignCatalogScreen() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<DesignCatalog[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [designNo, setDesignNo] = useState('1')
  const [jfgNo, setJfgNo] = useState('')
  const [notes, setNotes] = useState('')
  const [designFile, setDesignFile] = useState<File | null>(null)
  const [matchingFile, setMatchingFile] = useState<File | null>(null)
  const designPreview = useObjectUrl(designFile)
  const matchingPreview = useObjectUrl(matchingFile)

  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([])
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const [shareRow, setShareRow] = useState<DesignCatalog | null>(null)
  const [shareMode, setShareMode] = useState<ShareMode>('one')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [customers, setCustomers] = useState<CatalogCustomerStub[]>([])
  const [broadcastIndex, setBroadcastIndex] = useState(0)
  const [broadcastActive, setBroadcastActive] = useState(false)

  const load = useCallback(async () => {
    const data = await fetchDesignCatalog()
    setRows(data)
  }, [])

  const loadCustomers = useCallback(async () => {
    const list = await loadCatalogCustomers()
    setCustomers(list)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    void loadCustomers().catch(() => {
      /* share modal will show empty */
    })
  }, [loadCustomers])

  const bulkRowsRef = useRef(bulkRows)
  bulkRowsRef.current = bulkRows
  useEffect(() => {
    return () => {
      for (const r of bulkRowsRef.current) URL.revokeObjectURL(r.previewUrl)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        String(r.design_no).includes(q) ||
        r.jfg_no.toLowerCase().includes(q),
    )
  }, [rows, query])

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.whatsapp.includes(q) ||
        c.whatsapp.replace(/\D/g, '').includes(q.replace(/\D/g, '')),
    )
  }, [customers, customerQuery])

  const selectedCustomer: CatalogCustomerStub | null =
    customers.find((c) => c.id === selectedCustomerId) ?? null

  const broadcastTargets = useMemo(
    () => customers.filter((c) => c.whatsapp.replace(/\D/g, '').length >= 10),
    [customers],
  )

  const broadcastCurrent = broadcastTargets[broadcastIndex] ?? null

  async function openAddForm() {
    setError(null)
    setMessage(null)
    setJfgNo('')
    setNotes('')
    setDesignFile(null)
    setMatchingFile(null)
    try {
      const next = await nextCatalogDesignNo()
      setDesignNo(String(next))
    } catch {
      setDesignNo('1')
    }
    setFormOpen(true)
  }

  function clearBulkRows() {
    setBulkRows((prev) => {
      for (const r of prev) URL.revokeObjectURL(r.previewUrl)
      return []
    })
    setBulkProgress(null)
    if (bulkFileRef.current) bulkFileRef.current.value = ''
  }

  async function openBulkForm() {
    setError(null)
    setMessage(null)
    clearBulkRows()
    setBulkOpen(true)
  }

  async function handleBulkFiles(fileList: FileList | null) {
    if (!fileList?.length) return
    setError(null)
    const images = Array.from(fileList).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) {
      setError('Select image files only')
      return
    }
    let startNo = 1
    try {
      startNo = await nextCatalogDesignNo()
    } catch {
      startNo = 1
    }
    // Continue numbering after any rows already staged
    const afterStaged = bulkRows.length
      ? Math.max(...bulkRows.map((r) => r.designNo)) + 1
      : startNo
    const base = Math.max(startNo, afterStaged)
    const nextRows: BulkRow[] = images.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      previewUrl: URL.createObjectURL(file),
      designNo: base + i,
      jfgNo: '',
    }))
    setBulkRows((prev) => [...prev, ...nextRows])
  }

  function updateBulkJfg(key: string, jfg: string) {
    setBulkRows((prev) => prev.map((r) => (r.key === key ? { ...r, jfgNo: jfg } : r)))
  }

  function removeBulkRow(key: string) {
    setBulkRows((prev) => {
      const hit = prev.find((r) => r.key === key)
      if (hit) URL.revokeObjectURL(hit.previewUrl)
      const remaining = prev.filter((r) => r.key !== key)
      if (remaining.length === 0) return remaining
      // Re-sequence design numbers from the first remaining row's number chain
      const first = remaining[0].designNo
      return remaining.map((r, i) => ({ ...r, designNo: first + i }))
    })
  }

  async function handleBulkSaveAll() {
    if (!profile) return
    if (bulkRows.length === 0) {
      setError('Choose at least one photo')
      return
    }
    const missing = bulkRows.filter((r) => !r.jfgNo.trim())
    if (missing.length > 0) {
      setError(`Enter JFG No. for all rows (${missing.length} missing)`)
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)
    setBulkProgress({ done: 0, total: bulkRows.length })
    try {
      for (let i = 0; i < bulkRows.length; i++) {
        const row = bulkRows[i]
        const designUrl = await uploadCatalogImage(row.file, 'design')
        await insertDesignCatalog({
          design_no: row.designNo,
          jfg_no: row.jfgNo.trim(),
          design_image_url: designUrl,
          matching_image_url: null,
          notes: null,
          created_by: profile.id,
        })
        setBulkProgress({ done: i + 1, total: bulkRows.length })
      }
      setMessage(`Saved ${bulkRows.length} designs`)
      clearBulkRows()
      setBulkOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk save failed — fix and retry')
    } finally {
      setBusy(false)
      setBulkProgress(null)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    const no = Number.parseInt(designNo, 10)
    if (!Number.isFinite(no) || no < 1) {
      setError('Design No. must be a positive integer')
      return
    }
    if (!jfgNo.trim()) {
      setError('JFG No. is required')
      return
    }
    if (!designFile || !matchingFile) {
      setError('Upload both Design and Matching photos')
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const [designUrl, matchingUrl] = await Promise.all([
        uploadCatalogImage(designFile, 'design'),
        uploadCatalogImage(matchingFile, 'matching'),
      ])
      await insertDesignCatalog({
        design_no: no,
        jfg_no: jfgNo.trim(),
        design_image_url: designUrl,
        matching_image_url: matchingUrl,
        notes: notes.trim() || null,
        created_by: profile.id,
      })
      setMessage(`Design #${no} · ${jfgNo.trim()} saved`)
      setFormOpen(false)
      setDesignFile(null)
      setMatchingFile(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function openShare(row: DesignCatalog) {
    setShareRow(row)
    setShareMode('one')
    setCustomerQuery('')
    setSelectedCustomerId('')
    setBroadcastActive(false)
    setBroadcastIndex(0)
    setError(null)
    setMessage(null)
    void loadCustomers().catch(() => undefined)
  }

  async function handleShareSubmit() {
    if (!shareRow) return

    if (shareMode === 'broadcast') {
      if (broadcastTargets.length === 0) {
        setMessage('No CRM customers with WhatsApp numbers yet.')
        return
      }
      setBroadcastActive(true)
      setBroadcastIndex(0)
      setMessage(null)
      return
    }

    if (!selectedCustomer) {
      setError('Select a customer from CRM')
      return
    }

    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const caption = catalogShareCaption(shareRow.design_no, shareRow.jfg_no)
      const result = await shareCatalogDesign({
        caption,
        designImageUrl: shareRow.design_image_url,
        matchingImageUrl: shareRow.matching_image_url,
        phone: selectedCustomer.whatsapp,
      })
      if (result === 'shared') {
        setMessage(`Shared to ${selectedCustomer.name}`)
        setShareRow(null)
      } else if (result === 'cancelled') {
        setMessage('Share cancelled')
      } else if (result === 'fallback-text') {
        setMessage(
          'Opened WhatsApp with caption — attach both images if the browser could not share files.',
        )
      } else {
        setMessage('Opened WhatsApp text fallback')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed')
    } finally {
      setBusy(false)
    }
  }

  async function shareBroadcastCurrent() {
    if (!shareRow || !broadcastCurrent) return
    setBusy(true)
    setError(null)
    try {
      const caption = catalogShareCaption(shareRow.design_no, shareRow.jfg_no)
      await shareCatalogDesign({
        caption,
        designImageUrl: shareRow.design_image_url,
        matchingImageUrl: shareRow.matching_image_url,
        phone: broadcastCurrent.whatsapp,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Share failed')
    } finally {
      setBusy(false)
    }
  }

  function advanceBroadcast(skip = false) {
    if (!skip) {
      /* already shared via shareBroadcastCurrent */
    }
    const next = broadcastIndex + 1
    if (next >= broadcastTargets.length) {
      setBroadcastActive(false)
      setMessage(`Broadcast finished — ${broadcastTargets.length} customers`)
      setShareRow(null)
      return
    }
    setBroadcastIndex(next)
  }

  async function exportBroadcastCsv() {
    if (!shareRow) return
    const full = await fetchCrmCustomers()
    const caption = catalogShareCaption(shareRow.design_no, shareRow.jfg_no)
    const csv = exportCustomersCsv(full, caption)
    downloadTextFile(`design-${shareRow.design_no}-broadcast.csv`, csv)
    setMessage('CSV downloaded')
  }

  return (
    <div className="screen dna-screen">
      <header className="screen-header dna-header">
        <div>
          <h1>Design Catalog</h1>
          <p className="text-muted">DNA — design + matching photos for WhatsApp sharing</p>
        </div>
        <div className="dna-header-actions">
          <button type="button" className="btn-ghost dna-add-btn" onClick={() => void openBulkForm()}>
            Bulk Add Designs
          </button>
          <button type="button" className="primary-save dna-add-btn" onClick={() => void openAddForm()}>
            + Add New Design
          </button>
        </div>
      </header>

      <div className="dna-toolbar">
        <label className="field dna-search">
          <span className="text-muted">Search</span>
          <input
            type="search"
            placeholder="Design No. or JFG No."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search Design No. or JFG No."
          />
        </label>
        <p className="text-muted2 dna-count">
          {filtered.length} of {rows.length} designs
        </p>
      </div>

      {error && !formOpen && !bulkOpen && !shareRow ? (
        <p className="form-error text-danger">{error}</p>
      ) : null}
      {message && !formOpen && !bulkOpen && !shareRow ? (
        <p className="form-ok text-sage">{message}</p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-muted dna-empty">
          {rows.length === 0
            ? 'No designs yet — add the first catalog entry.'
            : 'No designs match this search.'}
        </p>
      ) : (
        <div className="dna-grid">
          {filtered.map((row) => (
            <article key={row.id} className="dna-card surface">
              <div className="dna-card-images">
                <div className="dna-thumb">
                  <img src={row.design_image_url} alt={`Design ${row.design_no}`} />
                  <span className="dna-thumb-label">Design</span>
                </div>
                <div className="dna-thumb">
                  {row.matching_image_url ? (
                    <img src={row.matching_image_url} alt={`Matching ${row.jfg_no}`} />
                  ) : (
                    <div className="dna-thumb-empty">No matching</div>
                  )}
                  <span className="dna-thumb-label">Matching</span>
                </div>
              </div>
              <div className="dna-card-body">
                <h2 className="dna-card-title">
                  #{row.design_no} · {row.jfg_no}
                </h2>
                {row.notes ? <p className="text-muted2 dna-card-notes">{row.notes}</p> : null}
                <button
                  type="button"
                  className="btn-wa dna-share-btn"
                  onClick={() => openShare(row)}
                  aria-label={`Share design ${row.design_no}`}
                >
                  WhatsApp
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {formOpen ? (
        <div className="dna-modal" role="dialog" aria-modal="true" aria-labelledby="dna-form-title">
          <div className="dna-modal-backdrop" onClick={() => !busy && setFormOpen(false)} />
          <div className="dna-modal-panel surface">
            <h2 id="dna-form-title">Add New Design</h2>
            {error ? <p className="form-error text-danger">{error}</p> : null}
            <form className="form-stack dna-form" onSubmit={(e) => void handleSave(e)}>
              <label className="field">
                <span className="text-muted">Design No.</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={designNo}
                  onChange={(e) => setDesignNo(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span className="text-muted">JFG No.</span>
                <input
                  type="text"
                  placeholder="e.g. JFG2244"
                  value={jfgNo}
                  onChange={(e) => setJfgNo(e.target.value)}
                  required
                />
              </label>

              <div className="dna-upload-pair">
                <label className="field dna-upload-slot">
                  <span className="text-muted">Design photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setDesignFile(e.target.files?.[0] ?? null)}
                    required
                  />
                  {designPreview ? (
                    <div className="dna-upload-preview">
                      <img src={designPreview} alt="Design preview" />
                    </div>
                  ) : (
                    <div className="dna-upload-placeholder">Camera or file</div>
                  )}
                </label>
                <label className="field dna-upload-slot">
                  <span className="text-muted">Matching photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setMatchingFile(e.target.files?.[0] ?? null)}
                    required
                  />
                  {matchingPreview ? (
                    <div className="dna-upload-preview">
                      <img src={matchingPreview} alt="Matching preview" />
                    </div>
                  ) : (
                    <div className="dna-upload-placeholder">Camera or file</div>
                  )}
                </label>
              </div>

              <label className="field">
                <span className="text-muted">Notes (optional)</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </label>

              <div className="dna-modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy}
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-save" disabled={busy}>
                  {busy ? 'Saving…' : 'Save Design'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {bulkOpen ? (
        <div className="dna-modal" role="dialog" aria-modal="true" aria-labelledby="dna-bulk-title">
          <div
            className="dna-modal-backdrop"
            onClick={() => {
              if (!busy) {
                clearBulkRows()
                setBulkOpen(false)
              }
            }}
          />
          <div className="dna-modal-panel dna-bulk-panel surface">
            <h2 id="dna-bulk-title">Bulk Add Designs</h2>
            <p className="text-muted dna-bulk-hint">
              Select many design photos. Design No. auto-fills; type JFG No. on each row. Matching
              photos can be added later.
            </p>
            {error ? <p className="form-error text-danger">{error}</p> : null}

            <label className="field dna-bulk-pick">
              <span className="text-muted">Photos</span>
              <input
                ref={bulkFileRef}
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                onChange={(e) => void handleBulkFiles(e.target.files)}
              />
              <p className="text-muted2 dna-bulk-count">
                {bulkRows.length === 0
                  ? 'No photos selected'
                  : `${bulkRows.length} photo${bulkRows.length === 1 ? '' : 's'} selected`}
              </p>
            </label>

            {bulkRows.length > 0 ? (
              <ul className="dna-bulk-list">
                {bulkRows.map((row) => (
                  <li key={row.key} className="dna-bulk-row">
                    <img className="dna-bulk-thumb" src={row.previewUrl} alt="" />
                    <label className="field dna-bulk-no">
                      <span className="text-muted">Design No.</span>
                      <input type="number" value={row.designNo} readOnly tabIndex={-1} />
                    </label>
                    <label className="field dna-bulk-jfg">
                      <span className="text-muted">JFG No.</span>
                      <input
                        type="text"
                        placeholder="e.g. JFG2244"
                        value={row.jfgNo}
                        disabled={busy}
                        onChange={(e) => updateBulkJfg(row.key, e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn-ghost dna-bulk-remove"
                      disabled={busy}
                      aria-label={`Remove design ${row.designNo}`}
                      onClick={() => removeBulkRow(row.key)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {bulkProgress ? (
              <div className="dna-bulk-progress" role="status" aria-live="polite">
                <div className="dna-bulk-progress-bar">
                  <div
                    className="dna-bulk-progress-fill"
                    style={{
                      width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-muted">
                  {bulkProgress.done} of {bulkProgress.total} uploaded…
                </p>
              </div>
            ) : null}

            <div className="dna-modal-actions dna-bulk-footer">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => {
                  clearBulkRows()
                  setBulkOpen(false)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-save"
                disabled={busy || bulkRows.length === 0}
                onClick={() => void handleBulkSaveAll()}
              >
                {busy
                  ? 'Saving…'
                  : `Save All${bulkRows.length ? ` (${bulkRows.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareRow ? (
        <div className="dna-modal" role="dialog" aria-modal="true" aria-labelledby="dna-share-title">
          <div className="dna-modal-backdrop" onClick={() => !busy && setShareRow(null)} />
          <div className="dna-modal-panel surface">
            <h2 id="dna-share-title">
              Share #{shareRow.design_no} · {shareRow.jfg_no}
            </h2>
            <p className="text-muted dna-share-caption">
              {catalogShareCaption(shareRow.design_no, shareRow.jfg_no)}
            </p>
            {error ? <p className="form-error text-danger">{error}</p> : null}
            {message ? <p className="form-ok text-sage">{message}</p> : null}

            <fieldset className="dna-share-modes">
              <legend className="text-muted">Share options</legend>
              <label className="dna-radio">
                <input
                  type="radio"
                  name="dna-share-mode"
                  checked={shareMode === 'one'}
                  onChange={() => setShareMode('one')}
                />
                <span>Send to one customer</span>
              </label>
              <label className="dna-radio">
                <input
                  type="radio"
                  name="dna-share-mode"
                  checked={shareMode === 'broadcast'}
                  onChange={() => setShareMode('broadcast')}
                />
                <span>Broadcast to all</span>
              </label>
            </fieldset>

            {shareMode === 'one' ? (
              <div className="dna-customer-pick">
                <label className="field">
                  <span className="text-muted">Customer (CRM)</span>
                  <input
                    type="search"
                    placeholder="Search saved customers…"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                </label>
                {filteredCustomers.length === 0 ? (
                  <p className="text-muted2">
                    No CRM customers yet — add them under CRM, or Sync from KMOS.
                  </p>
                ) : (
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                  >
                    <option value="">Select customer</option>
                    {filteredCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.whatsapp}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : broadcastActive && broadcastCurrent ? (
              <div className="dna-broadcast-stub">
                <p className="text-muted">
                  Sharing {broadcastIndex + 1} of {broadcastTargets.length}
                </p>
                <p>
                  <strong>{broadcastCurrent.name}</strong>
                  <br />
                  <span className="text-muted2">{broadcastCurrent.whatsapp}</span>
                </p>
                <div className="dna-modal-actions" style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-wa"
                    disabled={busy}
                    onClick={() => void shareBroadcastCurrent()}
                  >
                    {busy ? 'Opening…' : 'Share to this customer'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => advanceBroadcast(true)}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => advanceBroadcast(false)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : (
              <div className="dna-broadcast-stub">
                <p className="text-muted2">
                  Sequential share to {broadcastTargets.length} CRM customers with WhatsApp
                  numbers (one share sheet at a time). Or export a CSV list.
                </p>
                <div className="dna-modal-actions" style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-wa"
                    disabled={busy || broadcastTargets.length === 0}
                    onClick={() => void handleShareSubmit()}
                  >
                    Start broadcast
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void exportBroadcastCsv()}
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            )}

            <div className="dna-modal-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => {
                  setShareRow(null)
                  setBroadcastActive(false)
                }}
              >
                Cancel
              </button>
              {shareMode === 'one' ? (
                <button
                  type="button"
                  className="btn-wa"
                  disabled={busy || !selectedCustomerId}
                  onClick={() => void handleShareSubmit()}
                >
                  {busy ? 'Opening…' : 'Open WhatsApp'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
