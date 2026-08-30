import { useCallback, useRef, useState } from 'react'
import { GmailImportPanel } from '../GmailImportPanel'
import {
  uploadDesignReferenceImage,
  type DesignImportSource,
  type DinImageAttachPayload,
  type MissingRateItem,
} from '../../lib/designOcr'
import { fetchGmailStatus, type GmailImportResult, type GmailStatus } from '../../lib/gmailIntake'

export type { DinImageAttachPayload, MissingRateItem }

type Props = {
  disabled?: boolean
  designImageUrl?: string | null
  onAttach: (payload: DinImageAttachPayload) => void | Promise<void>
  onOpenRateMaster?: () => void
}

export function DinDesignImportSection({
  disabled,
  designImageUrl: existingUrl,
  onAttach,
  onOpenRateMaster,
}: Props) {
  const photoRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const directRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(existingUrl || null)
  const [importSource, setImportSource] = useState<DesignImportSource | null>(null)
  const [showGmail, setShowGmail] = useState(false)
  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
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

  async function processFile(file: File, source: DesignImportSource) {
    if (disabled) return
    setBusy(true)
    setError(null)
    try {
      const imageUrl = await uploadDesignReferenceImage(file, source)
      setDesignPreviewUrl(imageUrl)
      setImportSource(source)
      await onAttach({ designImageUrl: imageUrl, importSource: source })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'DIN sheet upload failed')
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
      await onAttach({ designImageUrl: result.imageUrl, importSource: 'gmail' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gmail import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dwc-panel dwc-import-panel dwc-compact-block">
      <h2 className="section-title">1 · DIN Sheet Image</h2>
      <p className="text-muted2 dwc-import-hint">
        Upload the original DIN sheet as a reference attachment only. Enter Design No., Quality, Loom
        Pick, Warp and Feeder details manually below — rates come from Rate Master.
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
        <span className="text-muted">{busy ? 'Uploading DIN sheet…' : 'Drag & drop DIN sheet photo here'}</span>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {designPreviewUrl ? (
        <div className="dwc-design-attach-preview">
          <h3 className="dwc-import-subtitle">DIN Sheet Preview</h3>
          <div
            className="dwc-design-preview"
            style={{ backgroundImage: `url(${designPreviewUrl})` }}
            role="img"
            aria-label="DIN sheet reference preview"
          />
          {importSource ? <span className="dwc-source-tag">Source: {importSource}</span> : null}
          <p className="text-muted2">Reference only — enter all costing data manually below.</p>
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
