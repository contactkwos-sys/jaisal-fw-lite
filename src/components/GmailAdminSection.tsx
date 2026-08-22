import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  DIN_INTAKE_EMAIL,
  disconnectGmail,
  fetchApprovedSenders,
  fetchGmailStatus,
  getGmailAuthUrl,
  upsertApprovedSender,
  type ApprovedSender,
  type GmailStatus,
} from '../lib/gmailIntake'

export function GmailAdminSection() {
  const { isCeo, profile } = useAuth()
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [senders, setSenders] = useState<ApprovedSender[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftEmail, setDraftEmail] = useState('')
  const [draftActive, setDraftActive] = useState(true)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const refresh = useCallback(async () => {
    const [st, list] = await Promise.all([fetchGmailStatus(), fetchApprovedSenders()])
    setStatus(st)
    setSenders(list)
  }, [])

  useEffect(() => {
    void refresh().catch((e: Error) => setError(e.message))
  }, [refresh])

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const url = await getGmailAuthUrl()
      window.location.href = url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed')
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm(`Disconnect Gmail for ${DIN_INTAKE_EMAIL}?`)) return
    setBusy(true)
    setError(null)
    try {
      await disconnectGmail()
      setMessage('Gmail disconnected')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(sender: ApprovedSender) {
    setEditingId(sender.id)
    setDraftName(sender.name)
    setDraftEmail(sender.email || '')
    setDraftActive(sender.is_active)
  }

  async function saveEdit() {
    if (!editingId) return
    setBusy(true)
    setError(null)
    try {
      await upsertApprovedSender({
        id: editingId,
        name: draftName,
        email: draftEmail,
        is_active: draftActive,
      })
      setEditingId(null)
      setMessage('Sender updated')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function addSender() {
    setBusy(true)
    setError(null)
    try {
      await upsertApprovedSender({
        name: newName,
        email: newEmail,
        is_active: true,
        created_by: profile?.id || null,
      })
      setNewName('')
      setNewEmail('')
      setMessage('Sender added')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(sender: ApprovedSender) {
    setBusy(true)
    setError(null)
    try {
      await upsertApprovedSender({
        id: sender.id,
        name: sender.name,
        email: sender.email || '',
        is_active: !sender.is_active,
      })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (!isCeo) {
    return <p className="text-danger">CEO / Admin only</p>
  }

  return (
    <div className="form-stack gmail-admin-section">
      <h2 className="section-title">Gmail Integration</h2>
      <p className="text-muted">
        Connect the factory DESIGN intake Gmail and manage approved design senders.
      </p>

      <article className="surface card-row gmail-admin-status">
        <div>
          <strong>Connected account</strong>
          <div className="text-muted">Expected: {DIN_INTAKE_EMAIL}</div>
          <div>
            Status:{' '}
            <strong>{status?.connected ? 'Connected' : 'Disconnected'}</strong>
            {status?.connectedEmail ? ` — ${status.connectedEmail}` : ''}
          </div>
          {status?.connected && status.accountMatch === false ? (
            <p className="gmail-wrong-account-inline">
              Warning: connected account does not match {DIN_INTAKE_EMAIL}. Import is blocked.
            </p>
          ) : null}
        </div>
        <div className="share-actions">
          {!status?.connected ? (
            <button type="button" className="primary-save" disabled={busy} onClick={() => void connect()}>
              Connect Gmail
            </button>
          ) : (
            <button type="button" className="btn-danger" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </button>
          )}
        </div>
      </article>

      <h3 className="section-title">Approved Design Senders</h3>
      <div className="gmail-sender-list">
        {senders.map((sender) => {
          const editing = editingId === sender.id
          return (
            <article key={sender.id} className="surface card-row gmail-sender-card">
              {editing ? (
                <div className="gmail-sender-edit form-stack">
                  <label className="field">
                    <span>Name</span>
                    <input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={draftEmail}
                      onChange={(e) => setDraftEmail(e.target.value)}
                      placeholder="sender@example.com"
                    />
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={draftActive}
                      onChange={(e) => setDraftActive(e.target.checked)}
                    />
                    <span>Active</span>
                  </label>
                  <div className="share-actions">
                    <button type="button" disabled={busy} onClick={() => void saveEdit()}>
                      Save
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{sender.name}</strong>
                    <div className="text-muted">{sender.email || 'Email not set'}</div>
                    <span className={`gmail-sender-pill ${sender.is_active ? 'active' : 'inactive'}`}>
                      {sender.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="share-actions">
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => startEdit(sender)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => void toggleActive(sender)}
                    >
                      {sender.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>

      <div className="surface card-row row-top gmail-sender-add">
        <label className="field">
          <span>Name</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Designer name" />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="sender@example.com"
          />
        </label>
        <button
          type="button"
          className="primary-save"
          disabled={busy || !newName.trim()}
          onClick={() => void addSender()}
        >
          + Add Sender
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}
    </div>
  )
}
