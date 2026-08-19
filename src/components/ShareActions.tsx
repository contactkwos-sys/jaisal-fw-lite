type Props = {
  onWhatsApp?: () => void
  onWhatsAppBusiness?: () => void
  onPrint?: () => void
  extra?: React.ReactNode
  disabled?: boolean
}

export function ShareActions({ onWhatsApp, onWhatsAppBusiness, onPrint, extra, disabled }: Props) {
  return (
    <div className="share-actions">
      {onWhatsApp ? (
        <button type="button" className="btn-wa" disabled={disabled} onClick={onWhatsApp}>
          WhatsApp
        </button>
      ) : null}
      {onWhatsAppBusiness ? (
        <button type="button" className="btn-wa" disabled={disabled} onClick={onWhatsAppBusiness}>
          WhatsApp Business
        </button>
      ) : null}
      {onPrint ? (
        <button type="button" className="btn-ghost" disabled={disabled} onClick={onPrint}>
          Print
        </button>
      ) : null}
      {extra}
    </div>
  )
}
