import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  fetchPendingApprovals,
  resolvePendingApproval,
  type PendingApproval,
} from '../lib/pendingApprovals'

/** CEO Dashboard Approvals widget — approve/reject 7-day edit/delete requests. */
export function ApprovalsWidget() {
  const { profile } = useAuth()
  const [items, setItems] = useState<PendingApproval[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const data = await fetchPendingApprovals()
    setItems(data)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function resolve(item: PendingApproval, status: 'approved' | 'rejected') {
    const by = profile?.full_name || profile?.roles?.role_name || 'CEO'
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await resolvePendingApproval(item, status, by)
      setMessage(status === 'approved' ? 'Approved & applied' : 'Rejected')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resolve failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dash-panel">
      <h2 className="section-title">Approvals</h2>
      <p className="text-muted2">
        Edit/delete requests (Cash Book always; other modules when older than 7 days)
      </p>
      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}
      <div className="list">
        {items.map((item) => (
          <article key={item.id} className="card-row surface row-top">
            <div>
              <strong>
                {item.action.toUpperCase()} · {item.table_name}
              </strong>
              <div className="text-muted2">
                Record {item.record_id?.slice(0, 8) || '—'} · by {item.requested_by} ·{' '}
                {new Date(item.requested_at).toLocaleString()}
              </div>
              {item.action === 'edit' && item.new_data ? (
                <pre className="text-muted2" style={{ whiteSpace: 'pre-wrap', fontSize: 11, margin: '4px 0 0' }}>
                  {JSON.stringify(item.new_data, null, 0).slice(0, 280)}
                </pre>
              ) : null}
            </div>
            <div className="icon-actions">
              <button type="button" disabled={busy} onClick={() => void resolve(item, 'approved')}>
                Approve
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => void resolve(item, 'rejected')}
              >
                Reject
              </button>
            </div>
          </article>
        ))}
        {!items.length ? <p className="text-muted">No pending approvals</p> : null}
      </div>
    </section>
  )
}
