import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { useCallback, useState } from 'react'

type Props = {
  imageSrc: string
  fileName: string
  onCancel: () => void
  onSkipFull: () => void
  onCropped: (file: File) => void
}

/** Crop using pixel area from react-easy-crop (natural image coordinates). */
async function cropToFile(imageSrc: string, pixelCrop: Area, fileName: string): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for crop'))
    img.src = imageSrc
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')

  const w = Math.max(1, Math.round(pixelCrop.width))
  const h = Math.max(1, Math.round(pixelCrop.height))
  canvas.width = w
  canvas.height = h
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    w,
    h,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Crop failed'))),
      'image/jpeg',
      0.92,
    )
  })
  const base = fileName.replace(/\.[^.]+$/, '') || 'design'
  return new File([blob], `${base}-cropped.jpg`, { type: 'image/jpeg' })
}

/** Mobile-friendly crop modal (touch-drag via react-easy-crop). */
export function DesignImageCropModal({
  imageSrc,
  fileName,
  onCancel,
  onSkipFull,
  onCropped,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_area: Area, croppedAreaPixels: Area) => {
    setArea(croppedAreaPixels)
  }, [])

  async function confirmCrop() {
    if (!area) return
    setBusy(true)
    setError(null)
    try {
      const file = await cropToFile(imageSrc, area, fileName)
      onCropped(file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Crop failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="design-crop-modal" role="dialog" aria-modal="true" aria-label="Crop design image">
      <div className="design-crop-backdrop" onClick={onCancel} />
      <div className="design-crop-panel">
        <header className="design-crop-head">
          <strong>Crop design image</strong>
          <span className="text-muted">Sirf design + DIN label select karein</span>
        </header>
        <div className="design-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>
        <label className="design-crop-zoom field">
          <span className="text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        {error ? <p className="form-error text-danger">{error}</p> : null}
        <div className="design-crop-actions">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-warp" disabled={busy} onClick={onSkipFull}>
            Skip crop, use full image
          </button>
          <button
            type="button"
            className="primary-save"
            disabled={busy || !area}
            onClick={() => void confirmCrop()}
          >
            {busy ? 'Cropping…' : 'Use cropped image'}
          </button>
        </div>
      </div>
    </div>
  )
}
