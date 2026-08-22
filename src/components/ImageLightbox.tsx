import { useEffect, useState, type ReactNode } from 'react'

type Props = {
  src: string | null | undefined
  alt?: string
  className?: string
  thumbClassName?: string
}

/** Thumbnail that opens a full-screen image preview on click. */
export function ImageLightbox({ src, alt = 'Design', className, thumbClassName }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!src) {
    return <div className={`dto-img-empty ${thumbClassName || ''}`.trim()}>No image</div>
  }

  return (
    <>
      <button
        type="button"
        className={`dto-img-thumb ${thumbClassName || ''} ${className || ''}`.trim()}
        onClick={() => setOpen(true)}
        title="View full size"
      >
        <img src={src} alt={alt} />
      </button>
      {open ? (
        <div className="dto-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <button type="button" className="dto-lightbox-close" aria-label="Close">
            ×
          </button>
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </>
  )
}

export function DtoStatusPill({ status }: { status: string }) {
  const tone = statusTone(status)
  return <span className={`dto-status dto-status-${tone}`}>{status}</span>
}

function statusTone(status: string): string {
  const s = status.toLowerCase()
  if (s.includes('approved') || s.includes('done') || s.includes('booked') || s.includes('dispatched')) return 'ok'
  if (s.includes('reject') || s.includes('closed')) return 'bad'
  if (s.includes('pending') || s.includes('sampling') || s.includes('costing')) return 'warn'
  return 'info'
}

export function DtoQuickNav({
  items,
  onNavigate,
}: {
  items: Array<{ id: string; label: string; onClick: () => void }>
  onNavigate?: never
}) {
  void onNavigate
  return (
    <div className="dto-quick-nav">
      {items.map((it) => (
        <button key={it.id} type="button" className="dto-quick-btn" onClick={it.onClick}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function DtoEmpty({ children }: { children: ReactNode }) {
  return <p className="dto-empty text-muted">{children}</p>
}
