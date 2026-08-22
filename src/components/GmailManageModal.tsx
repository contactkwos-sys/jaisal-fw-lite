import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { DIN_INTAKE_EMAIL, disconnectGmail, getGmailAuthUrl } from '../lib/gmailIntake'
import type { GmailStatus } from '../lib/gmailIntake'

type Props = {
  status: GmailStatus | null
  onStatusChange: () => void
  onClose: () => void
}

export function GmailManageModal({ status, onStatusChange, onClose }: Props) {
  const { isCeo } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    if (!isCeo) {
      setError('Only CEO can connect Gmail')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const url = await getGmailAuthUrl()
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start Gmail connect')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!isCeo) {
      setError('Only CEO can disconnect Gmail')
      return
    }
    if (!window.confirm(`Disconnect Gmail for ${DIN_INTAKE_EMAIL}?`)) return
    setBusy(true)
    setError(null)
    try {
      await disconnectGmail()
      onStatusChange()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  const connected = status?.connected
  const accountMatch = status?.accountMatch

  return (
    <div className="gmail-manage-modal surface" role="dialog" aria-label="Manage Gmail">
      <div className="gmail-import-head">
        <h2 className="section-title">Manage Gmail</h2>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {!status?.configured ? (
        <p className="form-error">
          Google OAuth is not configured on the server. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and
          GMAIL_TOKEN_SECRET to the gmail-intake edge function.
        </p>
      ) : null}

      <dl className="gmail-manage-details">
        <div>
          <dt>Receiving Gmail</dt>
          <dd>{DIN_INTAKE_EMAIL}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{connected ? 'Connected' : 'Disconnected'}</dd>
        </div>
        {connected && status?.connectedEmail ? (
          <div>
            <dt>Connected account</dt>
            <dd>{status.connectedEmail}</dd>
          </div>
        ) : null}
        {connected && accountMatch === false ? (
          <div className="gmail-wrong-account">
            <dt>Warning</dt>
            <dd>
              Connected account does not match the approved receiving Gmail ({DIN_INTAKE_EMAIL}). Import is
              blocked until the correct account is connected.
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="gmail-manage-actions">
        {!connected ? (
          <button type="button" className="primary-save" disabled={busy || !isCeo} onClick={() => void connect()}>
            Connect Gmail
          </button>
        ) : (
          <button type="button" className="btn-danger" disabled={busy || !isCeo} onClick={() => void disconnect()}>
            Disconnect Gmail
          </button>
        )}
        {!isCeo ? <p className="text-muted">CEO can connect or disconnect the factory Gmail account.</p> : null}
      </div>
    </div>
  )
}
