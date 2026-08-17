import { useEffect, useRef, useState, type ReactNode } from 'react'

type Mode = 'scan' | 'manual' | 'photo'

type Props = {
  value: Mode
  onChange: (m: Mode) => void
  onBarcode?: (code: string) => void
  onPhoto?: (file: File) => void
  /** Defaults to scan / manual / photo. Purchase forms can pass manual + photo only. */
  modes?: Mode[]
  children: ReactNode
}

const LABELS: Record<Mode, string> = {
  scan: 'Scan',
  manual: 'Manual',
  photo: 'Photo',
}

/** Input mode toggle: Scan (BarcodeDetector / manual fallback), Manual, Photo. */
export function InputModePanel({
  value,
  onChange,
  onBarcode,
  onPhoto,
  modes = ['scan', 'manual', 'photo'],
  children,
}: Props) {
  const [scanError, setScanError] = useState<string | null>(null)
  const [manualCode, setManualCode] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!modes.includes(value) && modes[0]) onChange(modes[0])
  }, [modes, value, onChange])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function startScan() {
      setScanError(null)
      if (value !== 'scan') return
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => {
          detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
        } }).BarcodeDetector
        if (!BD || !videoRef.current) {
          setScanError('Camera ready — type barcode below if scan unsupported')
          return
        }
        const detector = new BD({ formats: ['code_128', 'ean_13', 'qr_code', 'code_39'] })
        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes[0]?.rawValue) {
              onBarcode?.(codes[0].rawValue)
              return
            }
          } catch {
            /* keep scanning */
          }
          timer = window.setTimeout(() => void tick(), 500)
        }
        void tick()
      } catch (e) {
        setScanError(e instanceof Error ? e.message : 'Camera unavailable — use manual barcode')
      }
    }

    void startScan()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [value, onBarcode])

  return (
    <div className="input-mode-panel">
      <div className="segment">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            className={value === m ? 'seg active' : 'seg'}
            onClick={() => onChange(m)}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>

      {value === 'scan' ? (
        <div className="scan-box surface2">
          <video ref={videoRef} muted playsInline className="scan-video" />
          {scanError ? <p className="text-muted2">{scanError}</p> : null}
          <label className="field">
            <span className="text-muted">Barcode (fallback)</span>
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onBlur={() => {
                if (manualCode.trim()) onBarcode?.(manualCode.trim())
              }}
              placeholder="Enter / paste barcode"
            />
          </label>
        </div>
      ) : null}

      {value === 'photo' ? (
        <label className="field">
          <span className="text-muted">Photo upload</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onPhoto?.(f)
            }}
          />
        </label>
      ) : null}

      {children}
    </div>
  )
}
