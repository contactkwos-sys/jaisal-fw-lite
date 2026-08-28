import { useCallback, useRef, useState } from 'react'
import { GmailImportPanel } from '../GmailImportPanel'
import {
  applyOcrToCostingDraft,
  checkDuplicateDin,
  emptyDesignOcrResult,
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

type Props = {
  disabled?: boolean
  designLength: string
  costingDate: string
  masterRates: RateMasterRow[]
  existingWarps: WarpDraft[]
  onApply: (payload: {
    dinNumber: string
    qualityName: string
    warps: WarpDraft[]
    wefts: WeftDraft[]
    designImageUrl: string | null
    importSource: DesignImportSource
    ocrExtracted: DesignOcrResult
    ocrConfirmed: DesignOcrResult
    missingRates: MissingRateItem[]
  }) => void
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
    try {
      const imageUrl = await uploadDesignReferenceImage(file, source)
      setDesignPreviewUrl(imageUrl)
      setImportSource(source)

      const ocr = await readDesignReference(file, hints)
      setOcrExtracted(JSON.parse(JSON.stringify(ocr)) as DesignOcrResult)
      setOcrDraft(ocr)
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
      if (!file) {
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
      feeders: prev.feeders.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    }))
  }

  function addFeeder() {
    setOcrDraft((prev) => {
      const nextNo = prev.feeders.length ? Math.max(...prev.feeders.map((f) => f.feederNo)) + 1 : 1
      if (nextNo > 6) return prev
      return {
        ...prev,
        feeders: [...prev.feeders, { feederNo: nextNo, yarnType: '', confidence: 'high' }],
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

    const applied = applyOcrToCostingDraft(ocrDraft, {
      designLength,
      rates: masterRates,
      costingDate,
      existingWarps,
    })

    onApply({
      dinNumber: din,
      qualityName: ocrDraft.qualityName.value,
      warps: applied.warps,
      wefts: applied.wefts,
      designImageUrl: designPreviewUrl,
      importSource: importSource || 'file',
      ocrExtracted: ocrExtracted || ocrDraft,
      ocrConfirmed: ocrDraft,
      missingRates: applied.missingRates,
    })
    setDuplicateDin(null)
    setError(null)
  }

  const hasReview = Boolean(designPreviewUrl || ocrDraft.designNumber.value || ocrDraft.weftRows.length)

  return (
    <section className="dwc-panel dwc-import-panel">
      <h2 className="section-title">Design Import</h2>
      <p className="text-muted2 dwc-import-hint">
        Upload a design reference — OCR reads DIN, Pick, Strings &amp; Feeders, then fills costing below.
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
                  Detected Loom Pick {confidenceLabel(ocrDraft.loomPick.confidence)}
                  {ocrDraft.loomPick.confidence === 'missing' && !ocrDraft.loomPick.value ? (
                    <em className="dwc-low-conf"> Could not confidently read this field.</em>
                  ) : null}
                </span>
                <input
                  className="num"
                  value={ocrDraft.loomPick.value}
                  onChange={(e) => updateLoomPick(e.target.value)}
                  placeholder="e.g. 56"
                />
              </label>

              <div className="dwc-ocr-feeders">
                <div className="dwc-ocr-block-head">
                  <span>Detected Feeders</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={addFeeder}>
                    + Feeder
                  </button>
                </div>
                {ocrDraft.feeders.length ? (
                  ocrDraft.feeders.map((f, idx) => (
                    <div key={f.feederNo} className="dwc-ocr-feeder-row">
                      <span className="num">FD{f.feederNo}</span>
                      <input
                        value={f.yarnType}
                        onChange={(e) => updateFeeder(idx, { yarnType: e.target.value.toUpperCase() })}
                        placeholder="Yarn type"
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-muted2">No feeders detected — add manually if needed.</p>
                )}
              </div>

              <div className="dwc-ocr-weft">
                <div className="dwc-ocr-block-head">
                  <span>Detected Weft (Pick → PIC, Strings → Width)</span>
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
                      <label>
                        Strings
                        <input
                          className="num"
                          value={row.strings}
                          onChange={(e) => updateWeftRow(idx, { strings: e.target.value })}
                          placeholder="Strings"
                        />
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-muted2">Could not confidently read Pick/Strings — add rows manually.</p>
                )}
                {(ocrDraft.totalPick.value || ocrDraft.totalStrings.value) && (
                  <p className="text-muted2 dwc-ocr-totals">
                    Total: {ocrDraft.totalPick.value || '—'} / {ocrDraft.totalStrings.value || '—'}
                  </p>
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
