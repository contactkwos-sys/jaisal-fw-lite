import { useCallback, useEffect, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { ORDER_TYPES, type AppOrder, type OrderType } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type TabId = 'create' | 'pending' | 'all'

type Props = {
  /** When true, focus pending list (e.g. from dashboard widget). */
  initialPendingOnly?: boolean
}

export function OrdersPendingScreen({ initialPendingOnly = false }: Props) {
  const { profile, isCeo, isManager } = useAuth()
  const [tab, setTab] = useState<TabId>(initialPendingOnly ? 'pending' : 'create')
  const [rows, setRows] = useState<AppOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [orderType, setOrderType] = useState<OrderType>('Other')
  const [detail, setDetail] = useState('')
  const [orderDate, setOrderDate] = useState(todayISO())

  const canCreate = isCeo || isManager
  const canToggle = isManager || isCeo
  const raisedBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (err) throw err
    setRows((data as AppOrder[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    if (initialPendingOnly) setTab('pending')
  }, [initialPendingOnly])

  const pending = rows.filter((r) => r.status === 'pending')
  const visible = tab === 'pending' ? pending : rows

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!canCreate) {
      setError('Only CEO / Manager can create orders')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: iErr } = await supabase.from('orders').insert({
        order_type: orderType,
        detail: detail.trim() || null,
        raised_by: raisedBy,
        order_date: orderDate,
        status: 'pending',
      })
      if (iErr) throw iErr
      setMessage('Order raised')
      setDetail('')
      setTab('pending')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(row: AppOrder) {
    if (!canToggle) {
      setError('Only Manager can update status')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = row.status === 'pending' ? 'done' : 'pending'
      const { error: uErr } = await supabase.from('orders').update({ status: next }).eq('id', row.id)
      if (uErr) throw uErr
      setMessage(`Marked ${next}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Internal Pending</h1>
        <p className="text-muted">
          Internal store / repair / factory pending list · not customer fabric orders (those use Customer Order)
        </p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            ...(canCreate ? [{ id: 'create', label: 'Create' }] : []),
            { id: 'pending', label: `Pending (${pending.length})` },
            { id: 'all', label: 'All' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'create' && canCreate ? (
        <form className="form-stack" onSubmit={(e) => void handleCreate(e)}>
          <label className="field">
            <span>Order type</span>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
              {ORDER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Detail</span>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
          </label>
          <label className="field">
            <span>Order date</span>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Raise order'}
          </button>
        </form>
      ) : null}

      {tab !== 'create' ? (
        <div className="list">
          {visible.map((row) => (
            <article key={row.id} className="card-row surface row-top">
              <div>
                <strong>
                  {row.order_type} · {row.status === 'pending' ? 'PENDING' : 'DONE'}
                </strong>
                <div className="text-muted">{row.detail || '—'}</div>
                <div className="text-muted2">
                  {row.order_date} · Raised by {row.raised_by}
                </div>
              </div>
              {canToggle ? (
                <button type="button" disabled={busy} onClick={() => void toggleStatus(row)}>
                  {row.status === 'pending' ? 'Mark Done' : 'Mark Pending'}
                </button>
              ) : null}
            </article>
          ))}
          {!visible.length ? <p className="text-muted">No orders</p> : null}
        </div>
      ) : null}
    </div>
  )
}

/** Compact widget for CEO Dashboard — pending orders with Done/Pending toggle. */
export function PendingOrdersWidget() {
  const { isCeo, isManager } = useAuth()
  const [rows, setRows] = useState<AppOrder[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canToggle = isManager || isCeo

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'pending')
      .order('order_date', { ascending: false })
      .limit(20)
    if (err) throw err
    setRows((data as AppOrder[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function toggle(row: AppOrder, next: 'pending' | 'done') {
    if (!canToggle) return
    setBusy(true)
    try {
      const { error: uErr } = await supabase.from('orders').update({ status: next }).eq('id', row.id)
      if (uErr) throw uErr
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="dash-panel">
      <h2 className="section-title">Pending Orders</h2>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="list">
        {rows.map((row) => (
          <article key={row.id} className="card-row surface row-top">
            <div>
              <strong>{row.order_type}</strong>
              <div className="text-muted2">
                {row.detail || '—'} · {row.order_date} · {row.raised_by}
              </div>
            </div>
            {canToggle ? (
              <div className="icon-actions">
                <button type="button" disabled={busy} onClick={() => void toggle(row, 'done')}>
                  Yes / Done
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => void toggle(row, 'pending')}>
                  No / Pending
                </button>
              </div>
            ) : null}
          </article>
        ))}
        {!rows.length ? <p className="text-muted">No pending orders</p> : null}
      </div>
    </section>
  )
}
