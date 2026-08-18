import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { DesignCatalog } from '../lib/database.types'
import {
  CATALOG_CUSTOMERS_PLACEHOLDER,
  catalogShareCaption,
  fetchDesignCatalog,
  insertDesignCatalog,
  nextCatalogDesignNo,
  shareCatalogDesign,
  uploadCatalogImage,
  type CatalogCustomerStub,
} from '../lib/designCatalog'

type ShareMode = 'one' | 'broadcast'

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

  const [shareRow, setShareRow] = useState<DesignCatalog | null>(null)
  const [shareMode, setShareMode] = useState<ShareMode>('one')
  const [customerQuery, setCustomerQuery] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [manualPhone, setManualPhone] = useState('')

  const customers = CATALOG_CUSTOMERS_PLACEHOLDER

  const load = useCallback(async () => {
    const data = await fetchDesignCatalog()
    setRows(data)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

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
        c.whatsapp.includes(q),
    )
  }, [customers, customerQuery])

  const selectedCustomer: CatalogCustomerStub | null =
    customers.find((c) => c.id === selectedCustomerId) ?? null

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
    setManualPhone('')
    setError(null)
    setMessage(null)
  }

  async function handleShareSubmit() {
    if (!shareRow) return

    if (shareMode === 'broadcast') {
      // Phase 1: CRM broadcast list not connected yet.
      setMessage('Broadcast to all — customer list TODO (CRM phase). No recipients yet.')
      return
    }

    const phone = selectedCustomer?.whatsapp || manualPhone.trim() || null
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const caption = catalogShareCaption(shareRow.design_no, shareRow.jfg_no)
      const result = await shareCatalogDesign({
        caption,
        designImageUrl: shareRow.design_image_url,
        matchingImageUrl: shareRow.matching_image_url,
        phone,
      })
      if (result === 'shared') {
        setMessage('Share sheet opened — pick WhatsApp / WhatsApp Business')
        setShareRow(null)
      } else if (result === 'cancelled') {
        setMessage('Share cancelled')
      } else if (result === 'fallback-text') {
        setMessage(
          phone
            ? 'Opened WhatsApp with caption — attach both images if the browser could not share files.'
            : 'Browser could not attach images. Caption shared — attach Design + Matching manually if needed.',
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

  return (
    <div className="screen dna-screen">
      <header className="screen-header dna-header">
        <div>
          <h1>Design Catalog</h1>
          <p className="text-muted">DNA — design + matching photos for WhatsApp sharing</p>
        </div>
        <button type="button" className="primary-save dna-add-btn" onClick={() => void openAddForm()}>
          + Add New Design
        </button>
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

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

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
                  <img src={row.matching_image_url} alt={`Matching ${row.jfg_no}`} />
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
                  <span className="text-muted">Customer (CRM placeholder)</span>
                  <input
                    type="search"
                    placeholder="Search saved customers…"
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                </label>
                {filteredCustomers.length === 0 ? (
                  <p className="text-muted2">
                    No customers yet — CRM customer list will connect in the next phase.
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
                <label className="field">
                  <span className="text-muted">Or WhatsApp number (optional)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    placeholder="e.g. 919876543210"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div className="dna-broadcast-stub">
                <p className="text-muted2">
                  Broadcast will send to all CRM customers with WhatsApp numbers. List is empty
                  until the CRM phase.
                </p>
                <button
                  type="button"
                  className="btn-wa"
                  disabled={busy}
                  onClick={() => void handleShareSubmit()}
                >
                  Broadcast to all
                </button>
              </div>
            )}

            <div className="dna-modal-actions">
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => setShareRow(null)}
              >
                Cancel
              </button>
              {shareMode === 'one' ? (
                <button
                  type="button"
                  className="btn-wa"
                  disabled={busy}
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
