import { useRef, useState } from 'react'
import {
  checkDuplicateDin,
  readDesignReference,
  uploadDesignReferenceImage,
  type DesignImportSource,
  type MissingRateItem,
} from '../../lib/designOcr'

export type DinOcrApplyPayload = {
  dinNumber: string
  designImageUrl: string | null
  importSource: DesignImportSource
  /** OCR confidence for Design No. — UI shows "Please confirm" */
  designNumberConfidence?: 'high' | 'low' | 'missing'
}

type Props = {
  disabled?: boolean
  onApply: (payload: DinOcrApplyPayload) => void | Promise<void>
  onOpenExisting?: (dinNumber: string) => void
  onOpenRateMaster?: () => void
}

/**
 * Section 1 — Upload DIN sheet photo.
 * OCR scope: Design No. / DESI / DIN only. No feeder, pick, warp, or weft auto-fill.
 */
export function DinDesignImportSection({
  disabled,
  onApply,
  onOpenExisting,
  onOpenRateMaster,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(null)
  const [detectedDin, setDetectedDin] = useState('')
  const [confidence, setConfidence] = useState<'high' | 'low' | 'missing'>('missing')
  const [duplicateDin, setDuplicateDin] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function processFile(file: File, source: DesignImportSource) {
    if (disabled) return
    setBusy(true)
    setError(null)
    setDuplicateDin(null)
    setDetectedDin('')
    setConfidence('missing')
    try {
      const imageUrl = await uploadDesignReferenceImage(file, source)
      setDesignPreviewUrl(imageUrl)

      const ocr = await readDesignReference(file, { filename: file.name })
      const din = ocr.designNumber.value.trim()
      const conf = (ocr.designNumber.confidence || 'missing') as 'high' | 'low' | 'missing'
      setDetectedDin(din)
      setConfidence(din ? conf : 'missing')

      if (!din) {
        setError(
          ocr.readWarning ||
            'Could not read Design No. from this photo — type DESI / Design No. manually below.',
        )
        // Still attach the image for reference
        await onApply({
          dinNumber: '',
          designImageUrl: imageUrl,
          importSource: source,
          designNumberConfidence: 'missing',
        })
        return
      }

      const dup = await checkDuplicateDin(din).catch(() => ({ exists: false as const }))
      if (dup.exists) {
        setDuplicateDin(din)
        await onApply({
          dinNumber: din,
          designImageUrl: imageUrl,
          importSource: source,
          designNumberConfidence: conf,
        })
        return
      }

      await onApply({
        dinNumber: din,
        designImageUrl: imageUrl,
        importSource: source,
        designNumberConfidence: conf,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Design read failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dwc-panel dwc-import-panel dwc-compact-block">
      <h2 className="section-title">1 · Upload DIN Sheet Photo</h2>
      <p className="text-muted2 dwc-import-hint">
        Upload a DIN sheet photo to detect <strong>Design No. / DESI / DIN</strong> only. Warp, Weft,
        Feeder/Colour, and Pick values stay manual.
      </p>

      <div className="dwc-import-actions">
        <button
          type="button"
          className="dwc-import-btn"
          disabled={disabled || busy}
          onClick={() => fileRef.current?.click()}
        >
          Upload DIN Sheet Photo
        </button>
      </div>

      <input
        ref={fileRef}
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
        <span className="text-muted">
          {busy ? 'Reading Design No.…' : 'Drag & drop DIN sheet photo here'}
        </span>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {detectedDin && !busy ? (
        <p className="text-muted2">
          Detected Design No.: <strong>{detectedDin}</strong>
          <em className="dwc-low-conf"> Please confirm</em>
          {confidence === 'low' || confidence === 'missing'
            ? ' — OCR was uncertain; edit if wrong.'
            : ' — edit below if wrong.'}
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
            <button type="button" className="btn-ghost" onClick={() => setDuplicateDin(null)}>
              Keep New Entry
            </button>
          </div>
        </div>
      ) : null}

      {designPreviewUrl ? (
        <div
          className="dwc-design-preview dwc-import-preview"
          style={{ backgroundImage: `url(${designPreviewUrl})` }}
          role="img"
          aria-label="DIN sheet preview"
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
