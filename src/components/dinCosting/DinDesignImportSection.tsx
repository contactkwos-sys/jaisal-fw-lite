import { useRef, useState } from 'react'
import {
  uploadDesignReferenceImage,
  type DesignImportSource,
  type MissingRateItem,
} from '../../lib/designOcr'

/**
 * Upload apply payload — reference image ONLY.
 * No Design No. / warps / wefts / loomPick from OCR (OCR removed as unreliable).
 */
export type DinOcrApplyPayload = {
  dinNumber: string
  designImageUrl: string | null
  importSource: DesignImportSource
}

type Props = {
  disabled?: boolean
  onApply: (payload: DinOcrApplyPayload) => void | Promise<void>
  onOpenRateMaster?: () => void
}

/**
 * Section 1 — Attach DIN sheet reference photo.
 * No OCR / text extraction. DESI / Design No. is typed manually in Section 2.
 */
export function DinDesignImportSection({ disabled, onApply, onOpenRateMaster }: Props) {
  const photosRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(null)
  const [previewIsPdf, setPreviewIsPdf] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function processFile(file: File, source: DesignImportSource) {
    if (disabled) return
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/i.test(file.name)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (!isImage && !isPdf) {
      setError('Please upload a JPG, PNG, or PDF file.')
      return
    }

    setBusy(true)
    setError(null)
    setPreviewIsPdf(isPdf)
    try {
      const imageUrl = await uploadDesignReferenceImage(file, source)
      setDesignPreviewUrl(imageUrl)
      await onApply({
        dinNumber: '',
        designImageUrl: imageUrl,
        importSource: source,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dwc-panel dwc-import-panel dwc-compact-block">
      <h2 className="section-title">1 · Attach DIN Sheet Photo</h2>
      <p className="text-muted2 dwc-import-hint">
        Attach a DIN sheet photo as a reference. Type <strong>DESI / Design No.</strong> manually
        below — no OCR. Warp, Weft, Feeder/Colour, PIC, and TOTAL LOOM PICK stay manual.
      </p>

      <div className="dwc-import-actions">
        <button
          type="button"
          className="dwc-import-btn"
          disabled={disabled || busy}
          onClick={() => photosRef.current?.click()}
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
          onClick={() => cameraRef.current?.click()}
        >
          Take Photo
        </button>
      </div>

      {/* Gallery / photos library — no capture attribute */}
      <input
        ref={photosRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void processFile(f, 'photo')
          e.target.value = ''
        }}
      />

      {/* Files app / file browser — images + PDF */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void processFile(f, 'file')
          e.target.value = ''
        }}
      />

      {/* Camera capture */}
      <input
        ref={cameraRef}
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
        <span className="text-muted">
          {busy ? 'Uploading photo…' : 'Drag & drop DIN sheet photo here'}
        </span>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {designPreviewUrl && !previewIsPdf ? (
        <div
          className="dwc-design-preview dwc-import-preview"
          style={{ backgroundImage: `url(${designPreviewUrl})` }}
          role="img"
          aria-label="DIN sheet preview"
        />
      ) : null}

      {designPreviewUrl && previewIsPdf ? (
        <p className="text-muted2">
          PDF attached.{' '}
          <a href={designPreviewUrl} target="_blank" rel="noreferrer">
            Open reference
          </a>
        </p>
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
