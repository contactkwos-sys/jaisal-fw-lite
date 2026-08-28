import { useCallback, useEffect, useRef, useState } from 'react'
import { GmailImportPanel } from '../GmailImportPanel'
import {
  applyOcrToCostingDraft,
  checkDuplicateDin,
  emptyDesignOcrResult,
  normalizeYarnLabel,
  readDesignReference,
  readDesignReferenceFromUrl,
  uploadDesignReferenceImage,
  type DesignImportSource,
  type DesignOcrFeeder,
  type DesignOcrResult,
  type DesignOcrWeftRow,
  type MissingRateItem,
} from '../../lib/designOcr'
import { fetchGmailStatus, type GmailImportResult, type GmailStatus } from '../../lib/gmailIntake'
import type { RateMasterRow } from '../../lib/rateMaster'
import type { WarpDraft, WeftDraft } from '../../lib/designWiseCosting'

export type DinOcrApplyPayload = {
  dinNumber: string
  qualityName: string
  loomPick?: string
  warps: WarpDraft[]
  wefts: WeftDraft[]
  designImageUrl: string | null
  importSource: DesignImportSource
  ocrExtracted: DesignOcrResult
  ocrConfirmed: DesignOcrResult
  missingRates: MissingRateItem[]
  /** Explicit new revision — do not update existing costing row */
  forceNew?: boolean
}

type Props = {
  disabled?: boolean
  designLength: string
  costingDate: string
  masterRates: RateMasterRow[]
  existingWarps: WarpDraft[]
  onApply: (payload: DinOcrApplyPayload) => void | Promise<void>
  /** After first Confirm, OCR edits push into costing + Rate Master immediately. */
  onLiveSync?: (payload: DinOcrApplyPayload) => void
  onOpenExisting?: (dinNumber: string) => void
  onOpenRateMaster?: () => void
}

function confidenceLabel(c: string): string {
  if (c === 'high') return '✓'
  if (c === 'low') return '?'
  return '—'
}

export function DinDesignImportSection({
  disabled,
  designLength,
  costingDate,
  masterRates,
  existingWarps,
  onApply,
  onLiveSync,
  onOpenExisting,
  onOpenRateMaster,
}: Props) {
  const photoRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const directRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(null)
  const [importSource, setImportSource] = useState<DesignImportSource | null>(null)
  const [ocrDraft, setOcrDraft] = useState<DesignOcrResult>(emptyDesignOcrResult())
  const [ocrExtracted, setOcrExtracted] = useState<DesignOcrResult | null>(null)
  const [showGmail, setShowGmail] = useState(false)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [duplicateDin, setDuplicateDin] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [linkedToCosting, setLinkedToCosting] = useState(false)
  const skipLiveRef = useRef(false)

  const openGmail = useCallback(async () => {
    setError(null)
    try {
      const st = await fetchGmailStatus()
      setGmailStatus(st)
      if (!st.connected) {
        setError('Gmail not connected. Connect via Admin → Settings → Gmail first.')
        return
      }
      setShowGmail(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Gmail status')
    }
  }, [])

  async function processFile(file: File, source: DesignImportSource, hints?: { subject?: string; filename?: string }) {
    if (disabled) return
    setBusy(true)
    setError(null)
    setDuplicateDin(null)
    setLinkedToCosting(false)
    try {
      const imageUrl = await uploadDesignReferenceImage(file, source)
      setDesignPreviewUrl(imageUrl)
      setImportSource(source)

      const ocr = await readDesignReference(file, hints)
      setOcrExtracted(JSON.parse(JSON.stringify(ocr)) as DesignOcrResult)
      setOcrDraft(ocr)
      if (ocr.readWarning) setError(ocr.readWarning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Design read failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleGmailImported(result: GmailImportResult) {
    setShowGmail(false)
    setBusy(true)
    setError(null)
    try {
      setDesignPreviewUrl(result.imageUrl)
      setImportSource('gmail')
      const { ocr, file } = await readDesignReferenceFromUrl(result.imageUrl, {
        subject: result.subject,
        filename: result.attachmentFilename,
      })
      setOcrExtracted(JSON.parse(JSON.stringify(ocr)) as DesignOcrResult)
      setOcrDraft(ocr)
      if (ocr.readWarning) setError(ocr.readWarning)
      else if (!file) {
        setError('Design image imported. OCR could not run — enter values manually in review below.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gmail import OCR failed')
    } finally {
      setBusy(false)
    }
  }

  function updateDesignNumber(value: string) {
    setOcrDraft((prev) => ({
      ...prev,
      designNumber: { ...prev.designNumber, value: value.toUpperCase(), confidence: 'high' },
    }))
  }

  function updateLoomPick(value: string) {
    setOcrDraft((prev) => ({
      ...prev,
      loomPick: { ...prev.loomPick, value, confidence: 'high' },
    }))
  }

  function updateFeeder(idx: number, patch: Partial<DesignOcrFeeder>) {
    setOcrDraft((prev) => ({
      ...prev,
      feeders: prev.feeders.map((f, i) => {
        if (i !== idx) return f
        const next = { ...f, ...patch }
        if (patch.yarnType != null) next.yarnType = normalizeYarnLabel(patch.yarnType)
        return next
      }),
    }))
  }

  function addFeeder() {
    setOcrDraft((prev) => {
      const nextNo = prev.feeders.length ? Math.max(...prev.feeders.map((f) => f.feederNo)) + 1 : 1
      if (nextNo > 6) return prev
      return {
        ...prev,
        feeders: [...prev.feeders, { feederNo: nextNo, yarnType: '-', confidence: 'high' }],
      }
    })
  }

  function updateWeftRow(idx: number, patch: Partial<DesignOcrWeftRow>) {
    setOcrDraft((prev) => ({
      ...prev,
      weftRows: prev.weftRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
    }))
  }

  function addWeftRow() {
    setOcrDraft((prev) => ({
      ...prev,
      weftRows: [...prev.weftRows, { pic: '', strings: '', confidence: 'high' }],
    }))
  }

  function buildPayload(draft: DesignOcrResult, forceNew = false): DinOcrApplyPayload | null {
    const din = draft.designNumber.value.trim()
    if (!din) return null
    const applied = applyOcrToCostingDraft(draft, {
      designLength,
      rates: masterRates,
      costingDate,
      existingWarps,
    })
    return {
      dinNumber: din,
      qualityName: draft.qualityName.value,
      loomPick: draft.loomPick.value,
      warps: applied.warps,
      wefts: applied.wefts,
      designImageUrl: designPreviewUrl,
      importSource: importSource || 'file',
      ocrExtracted: ocrExtracted || draft,
      ocrConfirmed: draft,
      missingRates: applied.missingRates,
      forceNew,
    }
  }

  async function confirmAndApply(forceNew = false) {
    const din = ocrDraft.designNumber.value.trim()
    if (!din) {
      setError('Design / DIN number is required before applying OCR to costing.')
      return
    }

    if (!forceNew) {
      const dup = await checkDuplicateDin(din)
      if (dup.exists) {
        setDuplicateDin(din)
        return
      }
    }

    const payload = buildPayload(ocrDraft, forceNew)
    if (!payload) return

    skipLiveRef.current = true
    await onApply(payload)
    setLinkedToCosting(true)
    setDuplicateDin(null)
    setError(null)
    // Allow live sync on subsequent edits
    queueMicrotask(() => {
      skipLiveRef.current = false
    })
  }

  // Live: editing OCR after Confirm instantly refreshes costing rows + Rate Master rates
  useEffect(() => {
    if (!linkedToCosting || disabled || skipLiveRef.current || !onLiveSync) return
    const payload = buildPayload(ocrDraft)
    if (!payload) return
    onLiveSync(payload)
    // Only re-run when OCR fields change — not when linkedToCosting first flips (Confirm already applied)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocrDraft])

  const hasReview = Boolean(designPreviewUrl || ocrDraft.designNumber.value || ocrDraft.weftRows.length)

  return (
    <section className="dwc-panel dwc-import-panel">
      <h2 className="section-title">Design Import</h2>
      <p className="text-muted2 dwc-import-hint">
        Upload a design reference — OCR reads Design No., TOTAL LOOM PICK, Feeder/Colour &amp; Pick values.
        Strings are kept for reference only and are not used in costing.
      </p>

      <div className="dwc-import-actions">
        <button type="button" className="dwc-import-btn" disabled={disabled || busy} onClick={() => void openGmail()}>
          Upload from Gmail
        </button>
        <button
          type="button"
          className="dwc-import-btn"
          disabled={disabled || busy}
          onClick={() => photoRef.current?.click()}
        >
          Upload from Photo
        </button>
        <button
          type="button"
          className="dwc-import-btn"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          Upload from File
        </button>
        <button
          type="button"
          className="dwc-import-btn"
          disabled={disabled || busy}
          onClick={() => directRef.current?.click()}
        >
          Upload from Direct
        </button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void processFile(f, 'photo')
          e.target.value = ''
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.ep"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void processFile(f, 'file')
          e.target.value = ''
        }}
      />
      <input
        ref={directRef}
        type="file"
        accept="image/*,.pdf,.ep"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void processFile(f, 'direct')
          e.target.value = ''
        }}
      />

      <label
        className={dragOver ? 'dwc-dropzone dwc-design-drop drag-over' : 'dwc-dropzone dwc-design-drop'}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer.files?.[0]
          if (f) void processFile(f, 'file')
        }}
      >
        <span className="text-muted">{busy ? 'Reading design…' : 'Drag & drop design image here'}</span>
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      {duplicateDin ? (
        <div className="dwc-duplicate-banner" role="alert">
          <p>
            Design <strong>{duplicateDin}</strong> already exists.
          </p>
          <div className="dwc-duplicate-actions">
            <button type="button" className="btn-warp" onClick={() => onOpenExisting?.(duplicateDin)}>
              Open Existing
            </button>
            <button type="button" className="primary-save" onClick={() => void confirmAndApply(true)}>
              Create New Revision
            </button>
            <button type="button" className="btn-ghost" onClick={() => setDuplicateDin(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {hasReview ? (
        <div className="dwc-ocr-review">
          <div className="dwc-ocr-layout">
            <div className="dwc-ocr-preview-col">
              <h3 className="dwc-ocr-subtitle">Design Preview</h3>
              {designPreviewUrl ? (
                <div
                  className="dwc-design-preview"
                  style={{ backgroundImage: `url(${designPreviewUrl})` }}
                  role="img"
                  aria-label="Design reference preview"
                />
              ) : (
                <div className="dwc-design-preview empty">No preview</div>
              )}
              {importSource ? (
                <span className="dwc-source-tag">Source: {importSource}</span>
              ) : null}
            </div>

            <div className="dwc-ocr-fields-col">
              <h3 className="dwc-ocr-subtitle">OCR Review — edit before applying</h3>

              <label className="field">
                <span>
                  Detected Design No. {confidenceLabel(ocrDraft.designNumber.confidence)}
                  {ocrDraft.designNumber.confidence === 'missing' ? (
                    <em className="dwc-low-conf"> Could not confidently read this field.</em>
                  ) : null}
                </span>
                <input
                  value={ocrDraft.designNumber.value}
                  onChange={(e) => updateDesignNumber(e.target.value)}
                  placeholder="e.g. JFG2249"
                />
              </label>

              <label className="field">
                <span>
                  TOTAL LOOM PICK {confidenceLabel(ocrDraft.loomPick.confidence)}
                  {ocrDraft.loomPick.confidence === 'low' ? (
                    <em className="dwc-low-conf"> Please confirm</em>
                  ) : null}
                  {ocrDraft.loomPick.confidence === 'missing' && !ocrDraft.loomPick.value ? (
                    <em className="dwc-low-conf"> Could not confidently read this field.</em>
                  ) : null}
                </span>
                <input
                  className="num"
                  value={ocrDraft.loomPick.value}
                  onChange={(e) => updateLoomPick(e.target.value)}
                  placeholder="e.g. 112"
                />
              </label>

              <div className="dwc-ocr-feeders">
                <div className="dwc-ocr-block-head">
                  <span>Feeder/Colour (blank yarn allowed)</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={addFeeder}>
                    + Feeder
                  </button>
                </div>
                {ocrDraft.feeders.length ? (
                  ocrDraft.feeders.map((f, idx) => (
                    <div key={f.feederNo} className="dwc-ocr-feeder-row">
                      <span className="num">{f.sourceLabel || `Colour ${f.feederNo}`}</span>
                      <input
                        value={f.yarnType === '-' ? '' : f.yarnType}
                        onChange={(e) => updateFeeder(idx, { yarnType: e.target.value || '-' })}
                        placeholder="Yarn name (leave blank if empty)"
                      />
                      {f.confidence === 'low' ? (
                        <em className="dwc-low-conf">Please confirm</em>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-muted2">No feeders detected — add manually if needed.</p>
                )}
              </div>

              <div className="dwc-ocr-weft">
                <div className="dwc-ocr-block-head">
                  <span>Weft Pick (maps 1:1 to Feeder/Colour — Strings not used for costing)</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={addWeftRow}>
                    + Row
                  </button>
                </div>
                {ocrDraft.weftRows.length ? (
                  ocrDraft.weftRows.map((row, idx) => (
                    <div key={idx} className="dwc-ocr-weft-row">
                      <span className="num">#{idx + 1}</span>
                      <label>
                        PIC
                        <input
                          className="num"
                          value={row.pic}
                          onChange={(e) => updateWeftRow(idx, { pic: e.target.value })}
                          placeholder="Pick"
                        />
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-muted2">Could not confidently read Pick rows — add manually.</p>
                )}
                {ocrDraft.totalPick.value ? (
                  <p className="text-muted2 dwc-ocr-totals">Colour total pick (ref): {ocrDraft.totalPick.value}</p>
                ) : null}
              </div>

              {(ocrDraft.totalStrings.value || ocrDraft.weftRows.some((r) => r.strings)) && (
                <details className="dwc-ocr-source-details">
                  <summary>Source / OCR Details (Strings — not used in costing)</summary>
                  <p className="text-muted2">
                    Total Strings: {ocrDraft.totalStrings.value || '—'}
                  </p>
                  {ocrDraft.weftRows.map((row, idx) =>
                    row.strings ? (
                      <p key={idx} className="text-muted2">
                        Row {idx + 1} Strings: {row.strings}
                      </p>
                    ) : null,
                  )}
                </details>
              )}

              <button
                type="button"
                className="primary-save dwc-confirm-ocr"
                disabled={disabled || busy}
                onClick={() => void confirmAndApply()}
              >
                Confirm &amp; Create DIN Costing
              </button>
              <p className="text-muted2 dwc-confirm-hint">
                Fills Design Details, Weft/Warp rows and Wastage below, then saves costing automatically.
                {linkedToCosting
                  ? ' Edits here now update costing + Rate Master rates instantly.'
                  : ''}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showGmail && gmailStatus ? (
        <GmailImportPanel
          senders={gmailStatus.senders}
          onImported={(r) => void handleGmailImported(r)}
          onViewDesign={() => setShowGmail(false)}
          onClose={() => setShowGmail(false)}
        />
      ) : null}

      {onOpenRateMaster ? (
        <p className="text-muted2">
          Missing yarn rates?{' '}
          <button type="button" className="btn-link" onClick={onOpenRateMaster}>
            Open Rate Master
          </button>
        </p>
      ) : null}
    </section>
  )
}

export type { MissingRateItem }
