/** Fetch a remote/public image URL as a File for Web Share. */
export async function urlToImageFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load image (${res.status})`)
  const blob = await res.blob()
  const type = blob.type || 'image/jpeg'
  const safeName = filename.includes('.') ? filename : `${filename}.jpg`
  return new File([blob], safeName, { type })
}

/** Side-by-side merge of two images into one JPEG File (share fallback). */
export async function mergeImagesSideBySide(
  leftUrl: string,
  rightUrl: string,
  filename = 'design-broadcast.jpg',
): Promise<File> {
  const [left, right] = await Promise.all([loadImage(leftUrl), loadImage(rightUrl)])
  const gap = 12
  const height = Math.max(left.height, right.height)
  const scaleL = height / left.height
  const scaleR = height / right.height
  const wL = Math.round(left.width * scaleL)
  const wR = Math.round(right.width * scaleR)
  const canvas = document.createElement('canvas')
  canvas.width = wL + gap + wR
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#14171c'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(left, 0, 0, wL, height)
  ctx.drawImage(right, wL + gap, 0, wR, height)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92)
  })
  return new File([blob], filename, { type: 'image/jpeg' })
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = url
  })
}

export type BroadcastShareResult = 'shared' | 'cancelled' | 'fallback-text' | 'unsupported'

/**
 * Native share sheet with both images + caption.
 * WhatsApp / WhatsApp Business both use the same Web Share call — OS picks the app.
 */
export async function shareDesignBroadcast(args: {
  caption: string
  mainPhotoUrl: string
  colourChartUrl: string
}): Promise<BroadcastShareResult> {
  const { caption, mainPhotoUrl, colourChartUrl } = args
  if (!navigator.share) {
    window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank', 'noopener,noreferrer')
    return 'fallback-text'
  }

  try {
    const files = await Promise.all([
      urlToImageFile(mainPhotoUrl, 'main-design.jpg'),
      urlToImageFile(colourChartUrl, 'colour-chart.jpg'),
    ])
    const dual = { title: 'Design Broadcast', text: caption, files }
    if (navigator.canShare?.(dual)) {
      await navigator.share(dual)
      return 'shared'
    }

    const combined = await mergeImagesSideBySide(mainPhotoUrl, colourChartUrl)
    const one = { title: 'Design Broadcast', text: caption, files: [combined] }
    if (navigator.canShare?.(one)) {
      await navigator.share(one)
      return 'shared'
    }

    await navigator.share({ title: 'Design Broadcast', text: caption })
    return 'fallback-text'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    try {
      await navigator.share({ title: 'Design Broadcast', text: caption })
      return 'fallback-text'
    } catch (e2) {
      if (e2 instanceof DOMException && e2.name === 'AbortError') return 'cancelled'
      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, '_blank', 'noopener,noreferrer')
      return 'unsupported'
    }
  }
}
