import { useCallback, useEffect, useRef, useState } from 'react'
import { GmailImportPanel } from '../GmailImportPanel'
import {
  applyOcrToCostingDraft,
  checkDuplicateDin,
  clearOcrStrings,
  emptyDesignOcrResult,
  normalizeYarnLabel,
  OCR_VERIFY_HINT,
  readDesignReference,
  readDesignReferenceFromUrl,
  sumWeftPics,
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

      const ocr = clearOcrStrings(await readDesignReference(file, hints))
      setOcrExtracted(JSON.parse(JSON.stringify(ocr)) as DesignOcrResult)
      setOcrDraft(ocr)
      // Source fidelity: never auto-Confirm. User must verify OCR against the image first.
      if (ocr.readWarning) setError(ocr.readWarning)
      else if (!ocr.designNumber.value.trim() || !ocr.loomPick.value.trim()) {
        setError(`${OCR_VERIFY_HINT} Review the DIN image and complete missing fields before Confirm.`)
      } else {
        setError(null)
      }
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
    setLinkedToCosting(false)
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
        setError(`${OCR_VERIFY_HINT} Enter values manually in review below.`)
      } else if (!ocr.designNumber.value.trim() || !ocr.loomPick.value.trim()) {
        setError(`${OCR_VERIFY_HINT} Review the DIN image and complete missing fields before Confirm.`)
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
    setOcrDraft((prev) => {
      const weftRows = prev.weftRows.map((r, i) =>
        i === idx ? { ...r, ...patch, strings: '' } : { ...r, strings: '' },
      )
      // TOTAL WEFT PIC = Σ Colour Picks (reference only). Do NOT overwrite sheet TOTAL LOOM PICK.
      const sum = sumWeftPics(weftRows)
      return {
        ...prev,
        weftRows,
        totalStrings: { value: '', confidence: 'missing' },
        totalPick: sum
          ? { value: sum, confidence: 'high', source: 'sum_feeder_picks' }
          : { value: '', confidence: 'missing' },
      }
    })
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
    <section className="dwc-panel dwc-import-panel dwc-compact-block">
      <h2 className="section-title">1 · DIN Upload &amp; OCR</h2>
      <p className="text-muted2 dwc-import-hint">
        Upload a DIN sheet photo. OCR reads Design No., TOTAL LOOM PICK, and Colour/Feeder Pick
        <em> directly from the image</em> (no invented values). Strings are ignored. Compare every
        field to the preview, then Confirm.
      </p>

      <div className="dwc-import-actions">
        <button
          type="button"
          className="dwc-import-btn"
          disabled={disabled || busy}
          onClick={() => photoRef.current?.click()}
        >
          Upload from Photos
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
          Take Photo
        </button>
        <button type="button" className="dwc-import-btn" disabled={disabled || busy} onClick={() => void openGmail()}>
          Upload from Gmail
        </button>
      </div>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
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
        accept="image/*"
        capture="environment"
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
        <span className="text-muted">{busy ? 'Reading design…' : 'Drag & drop DIN sheet photo here'}</span>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {!busy && ocrDraft.readSource === 'tesseract' && (ocrDraft.designNumber.value || ocrDraft.loomPick.value || ocrDraft.feeders.length > 0) ? (
        <p className="text-muted2">
          Browser OCR (free). Please confirm Design No. / Loom Pick / Feeders — edit any field if needed.
        </p>
      ) : null}

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
              <h3 className="dwc-ocr-subtitle">OCR Review — verify against DIN image before Confirm</h3>
              {!busy &&
              (ocrDraft.designNumber.confidence !== 'high' ||
                !ocrDraft.loomPick.value ||
                ocrDraft.loomPick.confidence === 'low' ||
                ocrDraft.loomPick.confidence === 'missing' ||
                ocrDraft.feeders.some((f, i) => {
                  if (String(ocrDraft.weftRows[i]?.pic ?? '').trim() === '0') return false
                  return f.confidence === 'low' || f.confidence === 'missing'
                }) ||
                ocrDraft.weftRows.some(
                  (r) =>
                    (r.confidence === 'low' || r.confidence === 'missing') &&
                    String(r.pic).trim() !== '0',
                )) ? (
                <p className="dwc-ocr-review-banner" role="status">
                  {OCR_VERIFY_HINT} Do not Confirm until each field matches the sheet.
                </p>
              ) : null}

              <label className="field">
                <span>
                  Detected Design No. {confidenceLabel(ocrDraft.designNumber.confidence)}
                  {busy ? (
                    <em className="dwc-auto-tag"> Reading…</em>
                  ) : ocrDraft.designNumber.confidence === 'missing' ||
                    (!ocrDraft.designNumber.value && !busy) ? (
                    <em className="dwc-low-conf"> {OCR_VERIFY_HINT}</em>
                  ) : ocrDraft.designNumber.confidence === 'low' ? (
                    <em className="dwc-low-conf"> {OCR_VERIFY_HINT}</em>
                  ) : null}
                </span>
                <input
                  value={ocrDraft.designNumber.value}
                  onChange={(e) => updateDesignNumber(e.target.value)}
                  placeholder="e.g. JFG2249"
                  disabled={busy}
                />
              </label>

              <label className="field">
                <span>
                  TOTAL LOOM PICK {confidenceLabel(ocrDraft.loomPick.confidence)}
                  <em className="dwc-auto-tag"> printed on sheet · or Σ feeder PIC (verify)</em>
                  {busy ? <em className="dwc-auto-tag"> Reading…</em> : null}
                  {!busy &&
                  (ocrDraft.loomPick.confidence === 'missing' ||
                    ocrDraft.loomPick.confidence === 'low' ||
                    !ocrDraft.loomPick.value) ? (
                    <em className="dwc-low-conf"> {OCR_VERIFY_HINT}</em>
                  ) : null}
                </span>
                <input
                  className="num"
                  value={ocrDraft.loomPick.value}
                  onChange={(e) => updateLoomPick(e.target.value)}
                  placeholder="Read from TOTAL LOOM PICK on sheet"
                  disabled={busy}
                />
              </label>

              <div className="dwc-ocr-feeders">
                <div className="dwc-ocr-block-head">
                  <span>Feeder/Colour (blank yarn allowed)</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={addFeeder} disabled={busy}>
                    + Feeder
                  </button>
                </div>
                {busy && !ocrDraft.feeders.length ? (
                  <p className="text-muted2">Reading feeders from design sheet…</p>
                ) : ocrDraft.feeders.length ? (
                  ocrDraft.feeders.map((f, idx) => (
                    <div key={f.feederNo} className="dwc-ocr-feeder-row">
                      <span className="num">{f.sourceLabel || `Colour ${f.feederNo}`}</span>
                      <input
                        value={f.yarnType === '-' ? '' : f.yarnType}
                        onChange={(e) => updateFeeder(idx, { yarnType: e.target.value || '-' })}
                        placeholder="Yarn name (leave blank if empty)"
                        disabled={busy}
                      />
                      {f.confidence === 'low' || f.confidence === 'missing' ? (
                        <em className="dwc-low-conf">{OCR_VERIFY_HINT}</em>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-muted2">No feeders detected — add manually if needed.</p>
                )}
              </div>

              <div className="dwc-ocr-weft">
                <div className="dwc-ocr-block-head">
                  <span>Colour Pick (1:1 with Colour/Feeder — never shift rows; unused = 0 or blank)</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={addWeftRow} disabled={busy}>
                    + Row
                  </button>
                </div>
                {busy && !ocrDraft.weftRows.length ? (
                  <p className="text-muted2">Reading pick rows…</p>
                ) : ocrDraft.weftRows.length ? (
                  ocrDraft.weftRows.map((row, idx) => (
                    <div key={idx} className="dwc-ocr-weft-row">
                      <span className="num">
                        {ocrDraft.feeders[idx]?.sourceLabel || `Colour ${idx + 1}`}
                      </span>
                      <label>
                        Pick
                        <input
                          className="num"
                          value={row.pic}
                          onChange={(e) => updateWeftRow(idx, { pic: e.target.value })}
                          placeholder="0 if unused"
                          disabled={busy}
                        />
                      </label>
                      {row.confidence === 'low' ||
                      (row.confidence === 'missing' && String(row.pic).trim() === '') ? (
                        <em className="dwc-low-conf">{OCR_VERIFY_HINT}</em>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-muted2">Could not confidently read Pick rows — add manually.</p>
                )}
              </div>

              <button
                type="button"
                className="primary-save dwc-confirm-ocr"
                disabled={disabled || busy}
                onClick={() => void confirmAndApply()}
              >
                Confirm &amp; Create DIN Costing
              </button>
              <p className="text-muted2 dwc-confirm-hint">
                Confirm only after every field matches the DIN image. Design No. + TOTAL LOOM PICK +
                Colour/Feeder + Pick flow into costing (Base Denier → Costing = Base + 10).
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
