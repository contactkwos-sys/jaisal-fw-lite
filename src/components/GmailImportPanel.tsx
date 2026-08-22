import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  importGmailAttachment,
  listGmailDesignEmails,
  type GmailEmailRow,
  type GmailImportResult,
} from '../lib/gmailIntake'

type Props = {
  senders: Array<{ id: string; name: string; email: string | null }>
  onImported: (result: GmailImportResult) => void
  onViewDesign?: (dinId: string) => void
  onClose: () => void
}

export function GmailImportPanel({ senders, onImported, onViewDesign, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [jpgOnly, setJpgOnly] = useState(true)
  const [emails, setEmails] = useState<GmailEmailRow[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const senderOptions = useMemo(
    () => senders.filter((s) => s.email && s.email.trim()),
    [senders],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setWarning(null)
    try {
      const res = await listGmailDesignEmails({
        search: search.trim() || undefined,
        senderEmail: senderEmail || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        jpgOnly,
      })
      setEmails(res.emails)
      if (res.warning) setWarning(res.warning)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Gmail emails')
      setEmails([])
    } finally {
      setLoading(false)
    }
  }, [search, senderEmail, dateFrom, dateTo, jpgOnly])

  useEffect(() => {
    void load()
  }, [load])

  async function handleImport(row: GmailEmailRow) {
    const key = `${row.messageId}:${row.attachmentId}`
    setImporting(key)
    setError(null)
    try {
      const result = await importGmailAttachment(row.messageId, row.attachmentId)
      if (result.alreadyImported && result.dinId) {
        onViewDesign?.(result.dinId)
      } else {
        onImported(result)
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(null)
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="gmail-import-panel surface" role="dialog" aria-label="Gmail Design Inbox">
      <div className="gmail-import-head">
        <div>
          <h2 className="section-title">Gmail Design Inbox</h2>
          <p className="text-muted">Approved senders with JPG/JPEG attachments only</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="gmail-import-filters">
        <label className="field gmail-filter-search">
          <span>Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sender / subject / DESIGN number"
          />
        </label>
        <label className="field">
          <span>Sender</span>
          <select value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)}>
            <option value="">All approved</option>
            {senderOptions.map((s) => (
              <option key={s.id} value={s.email || ''}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date from</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Date to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label className="check-row gmail-filter-check">
          <input type="checkbox" checked={jpgOnly} onChange={(e) => setJpgOnly(e.target.checked)} />
          <span>JPG/JPEG only</span>
        </label>
        <button type="button" className="btn-warp" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {warning ? <p className="text-muted dto-gmail-note">{warning}</p> : null}

      <div className="gmail-import-table-wrap">
        <table className="gmail-import-table">
          <thead>
            <tr>
              <th>Sender</th>
              <th>Subject</th>
              <th>Received</th>
              <th>Attachment</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((row) => {
              const key = `${row.messageId}:${row.attachmentId}`
              const busy = importing === key
              return (
                <tr key={key}>
                  <td data-label="Sender">
                    <strong>{row.senderName}</strong>
                    <div className="text-muted2">{row.senderEmail}</div>
                  </td>
                  <td data-label="Subject">{row.subject || '—'}</td>
                  <td data-label="Received" className="num">
                    {formatDate(row.receivedAt)}
                  </td>
                  <td data-label="Attachment">{row.attachmentFilename}</td>
                  <td data-label="Status">
                    {row.imported ? (
                      <span className="gmail-status-imported">Imported</span>
                    ) : (
                      <span className="gmail-status-new">New</span>
                    )}
                  </td>
                  <td data-label="Action">
                    {row.imported && row.dinId ? (
                      <button
                        type="button"
                        className="btn-warp"
                        onClick={() => onViewDesign?.(row.dinId!)}
                      >
                        View DESIGN
                      </button>
                    ) : row.imported ? (
                      <span className="text-muted">Already imported</span>
                    ) : (
                      <button
                        type="button"
                        className="primary-save"
                        disabled={busy || loading}
                        onClick={() => void handleImport(row)}
                      >
                        {busy ? 'Importing…' : 'Import DESIGN'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && !emails.length ? (
          <p className="text-muted gmail-import-empty">No matching DESIGN emails found.</p>
        ) : null}
      </div>

      <div className="gmail-import-cards">
        {emails.map((row) => {
          const key = `${row.messageId}:${row.attachmentId}`
          const busy = importing === key
          return (
            <article key={key} className="gmail-import-card">
              <div className="gmail-import-card-head">
                <strong>{row.senderName}</strong>
                {row.imported ? (
                  <span className="gmail-status-imported">Imported</span>
                ) : (
                  <span className="gmail-status-new">New</span>
                )}
              </div>
              <p className="gmail-import-card-subject">{row.subject || '—'}</p>
              <dl className="gmail-import-card-meta">
                <div>
                  <dt>Received</dt>
                  <dd>{formatDate(row.receivedAt)}</dd>
                </div>
                <div>
                  <dt>Attachment</dt>
                  <dd>{row.attachmentFilename}</dd>
                </div>
              </dl>
              {row.imported && row.dinId ? (
                <button
                  type="button"
                  className="btn-warp"
                  onClick={() => onViewDesign?.(row.dinId!)}
                >
                  View DESIGN
                </button>
              ) : row.imported ? (
                <span className="text-muted">Already imported</span>
              ) : (
                <button
                  type="button"
                  className="primary-save"
                  disabled={busy || loading}
                  onClick={() => void handleImport(row)}
                >
                  {busy ? 'Importing…' : 'Import DESIGN'}
                </button>
              )}
            </article>
          )
        })}
        {!loading && !emails.length ? (
          <p className="text-muted gmail-import-empty">No matching DESIGN emails found.</p>
        ) : null}
      </div>
    </div>
  )
}
