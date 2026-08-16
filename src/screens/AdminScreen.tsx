import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { ApprovalQueue, PayrollRate, Role, Worker } from '../lib/database.types'
import { applyOrQueue } from '../lib/mutate'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'roles' | 'payroll' | 'approvals'
type Props = { initialSub?: Sub }

type PayableRow = {
  worker: Worker
  presentDays: number
  rate: number
  payable: number
  roleName: string
}

export function AdminScreen({ initialSub = 'roles' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [roles, setRoles] = useState<Role[]>([])
  const [newPin, setNewPin] = useState<Record<string, string>>({})
  const [editName, setEditName] = useState<Record<string, string>>({})

  const [rates, setRates] = useState<PayrollRate[]>([])
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({})
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [payables, setPayables] = useState<PayableRow[]>([])

  const [queue, setQueue] = useState<ApprovalQueue[]>([])

  const loadRoles = useCallback(async () => {
    const { data, error: fnErr } = await supabase.functions.invoke('roles-gate', {
      body: { action: 'list' },
    })
    if (fnErr) throw fnErr
    if (data?.error) throw new Error(data.error)
    setRoles((data?.roles ?? []) as Role[])
  }, [])

  const loadPayroll = useCallback(async () => {
    const [{ data: r }, { data: workers }, { data: att }] = await Promise.all([
      supabase.from('payroll_rates').select('*'),
      supabase.from('workers').select('*').eq('is_active', true),
      supabase
        .from('attendance')
        .select('worker_id, status, date')
        .gte('date', `${month}-01`)
        .lte('date', `${month}-31`),
    ])
    setRates((r as PayrollRate[]) ?? [])
    const rateByRole = new Map((r as PayrollRate[] | null)?.map((x) => [x.role_id, x.rate_per_day]) ?? [])
    const roleMap = new Map(roles.map((x) => [x.id, x.role_name]))
    const presentCount = new Map<string, number>()
    for (const a of att ?? []) {
      if (String(a.status || '').toLowerCase().includes('present') || a.status === 'Completed' || a.status === 'On Break') {
        presentCount.set(a.worker_id, (presentCount.get(a.worker_id) || 0) + 1)
      }
    }
    const rows: PayableRow[] = ((workers as Worker[]) ?? []).map((w) => {
      const roleId = w.role_id || roles.find((rr) => rr.role_name === w.department)?.id || ''
      const rate = roleId ? Number(rateByRole.get(roleId) || 0) : 0
      const presentDays = presentCount.get(w.id) || 0
      return {
        worker: w,
        presentDays,
        rate,
        payable: rate * presentDays,
        roleName: roleId ? roleMap.get(roleId) || w.department || '—' : w.department || '—',
      }
    })
    setPayables(rows)
    const draft: Record<string, string> = {}
    for (const role of roles) {
      const existing = (r as PayrollRate[] | null)?.find((x) => x.role_id === role.id)
      draft[role.id] = String(existing?.rate_per_day ?? 0)
    }
    setRateDraft(draft)
  }, [month, roles])

  const loadQueue = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (err) throw err
    setQueue((data as ApprovalQueue[]) ?? [])
  }, [])

  useEffect(() => {
    void loadRoles().catch((e: Error) => setError(e.message))
  }, [loadRoles])

  useEffect(() => {
    if (sub === 'payroll') void loadPayroll().catch((e: Error) => setError(e.message))
    if (sub === 'approvals') void loadQueue().catch((e: Error) => setError(e.message))
  }, [sub, loadPayroll, loadQueue])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  const monthTotal = useMemo(
    () => payables.reduce((s, p) => s + p.payable, 0),
    [payables],
  )

  async function resetPin(role: Role) {
    if (!isCeo) {
      setError('CEO only')
      return
    }
    const pin = newPin[role.id]
    if (!pin || pin.length !== 4) {
      setError('Enter 4-digit PIN')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('pin-reset', {
        body: { role_id: role.id, role_name: role.role_name, pin },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setMessage(`PIN reset for ${role.role_name}${data?.pin_hint ? ` (hint set)` : ''}`)
      setNewPin((p) => ({ ...p, [role.id]: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN reset failed')
    } finally {
      setBusy(false)
    }
  }

  async function renameRole(role: Role) {
    if (!isCeo) return
    const name = (editName[role.id] ?? role.role_name).trim()
    if (!name) return
    setBusy(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('roles-gate', {
        body: { action: 'update', role_id: role.id, role_name: name },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setMessage('Role updated')
      await loadRoles()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteRole(role: Role) {
    if (!isCeo) return
    if (!window.confirm(`Delete role ${role.role_name}?`)) return
    setBusy(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('roles-gate', {
        body: { action: 'delete', role_id: role.id },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setMessage('Role deleted')
      await loadRoles()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveRate(roleId: string) {
    if (!profile) return
    setBusy(true)
    setError(null)
    try {
      const rate_per_day = Number(rateDraft[roleId] || 0)
      const existing = rates.find((r) => r.role_id === roleId)
      const payload = { role_id: roleId, rate_per_day }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'payroll_rates',
        action: existing ? 'update' : 'insert',
        recordId: existing?.id ?? null,
        payload,
        apply: async () => {
          if (existing) {
            const { error: uErr } = await supabase
              .from('payroll_rates')
              .update({ rate_per_day })
              .eq('id', existing.id)
            if (uErr) throw uErr
          } else {
            const { error: iErr } = await supabase.from('payroll_rates').insert(payload)
            if (iErr) throw iErr
          }
        },
      })
      setMessage(result === 'applied' ? 'Rate saved' : 'Sent to approval queue')
      await loadPayroll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function resolveQueue(item: ApprovalQueue, status: 'approved' | 'rejected') {
    if (!isCeo || !profile) return
    setBusy(true)
    setError(null)
    try {
      if (status === 'approved' && item.payload) {
        const table = item.table_name
        const action = item.action
        if (action === 'insert') {
          const { error: iErr } = await supabase.from(table).insert(item.payload)
          if (iErr) throw iErr
        } else if (action === 'update' && item.record_id) {
          const { error: uErr } = await supabase.from(table).update(item.payload).eq('id', item.record_id)
          if (uErr) throw uErr
        } else if (action === 'delete' && item.record_id) {
          const { error: dErr } = await supabase.from(table).delete().eq('id', item.record_id)
          if (dErr) throw dErr
        }
      }
      const { error: qErr } = await supabase
        .from('approval_queue')
        .update({ status })
        .eq('id', item.id)
      if (qErr) throw qErr
      setMessage(status === 'approved' ? 'Approved & applied' : 'Rejected')
      await loadQueue()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resolve failed')
    } finally {
      setBusy(false)
    }
  }

  if (!isCeo && sub === 'approvals') {
    return (
      <div className="screen">
        <p className="text-danger">CEO only — approval queue</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Master / Admin</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'roles', label: 'Roles & PIN' },
            { id: 'payroll', label: 'Payroll' },
            ...(isCeo ? [{ id: 'approvals', label: 'Approvals' }] : []),
          ]}
        />
      </header>

      {sub === 'roles' ? (
        <div className="list">
          {roles.map((role) => (
            <article key={role.id} className="card-row surface form-stack">
              <div className="row-top">
                <strong>{role.role_name}</strong>
                <span className="text-muted2">{role.is_custom ? 'custom' : 'default'}</span>
              </div>
              {isCeo ? (
                <>
                  <label className="field">
                    <span className="text-muted">Rename</span>
                    <input
                      value={editName[role.id] ?? role.role_name}
                      onChange={(e) => setEditName((m) => ({ ...m, [role.id]: e.target.value }))}
                    />
                  </label>
                  <div className="share-actions">
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => void renameRole(role)}>
                      Save name
                    </button>
                    {role.is_custom ? (
                      <button type="button" className="btn-ghost text-danger" disabled={busy} onClick={() => void deleteRole(role)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                  <label className="field">
                    <span className="text-muted">New PIN (4 digit)</span>
                    <input
                      className="num"
                      inputMode="numeric"
                      maxLength={4}
                      value={newPin[role.id] ?? ''}
                      onChange={(e) =>
                        setNewPin((m) => ({ ...m, [role.id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                      }
                    />
                  </label>
                  <button type="button" disabled={busy} onClick={() => void resetPin(role)}>
                    Generate / Reset PIN
                  </button>
                </>
              ) : (
                <p className="text-muted2">CEO can reset PINs</p>
              )}
            </article>
          ))}
        </div>
      ) : null}

      {sub === 'payroll' ? (
        <div className="form-stack">
          <h2 className="section-title">Rates per role / day</h2>
          {roles.map((role) => (
            <div key={role.id} className="card-row surface row-top">
              <div>
                <strong>{role.role_name}</strong>
                <label className="field">
                  <span className="text-muted">₹ / day</span>
                  <input
                    className="num"
                    type="number"
                    value={rateDraft[role.id] ?? '0'}
                    onChange={(e) => setRateDraft((m) => ({ ...m, [role.id]: e.target.value }))}
                  />
                </label>
              </div>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => void saveRate(role.id)}>
                Save
              </button>
            </div>
          ))}

          <label className="field">
            <span className="text-muted">Month</span>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <h2 className="section-title">Payable (rate × present days)</h2>
          <p className="text-muted2">
            assumed: Present includes status Present / On Break / Completed; workers.role_id or department→role used for rate lookup. No snapshot table — live query.
          </p>
          <div className="list">
            {payables.map((p) => (
              <article key={p.worker.id} className="card-row surface">
                <strong>{p.worker.full_name}</strong>
                <div className="text-muted">
                  {p.roleName} · {p.presentDays} days × ₹<span className="num">{p.rate}</span> = ₹
                  <span className="num text-weft">{p.payable.toFixed(0)}</span>
                </div>
              </article>
            ))}
          </div>
          <p className="kpi-total">
            Month total: ₹<span className="num text-weft">{monthTotal.toFixed(0)}</span>
          </p>
          <ShareActions
            onWhatsApp={() =>
              shareWhatsApp(
                `Payroll ${month}\n` +
                  payables.map((p) => `${p.worker.full_name}: ₹${p.payable.toFixed(0)}`).join('\n') +
                  `\nTotal ₹${monthTotal.toFixed(0)}`,
              )
            }
            onPrint={() =>
              printSummary(
                `Payroll ${month}`,
                rowsToHtml(
                  payables.map((p) => [p.worker.full_name, `₹${p.payable.toFixed(0)} (${p.presentDays}d)`] as [string, string]),
                ),
              )
            }
          />
        </div>
      ) : null}

      {sub === 'approvals' && isCeo ? (
        <div className="list">
          {queue.map((q) => (
            <article key={q.id} className="card-row surface form-stack">
              <strong>
                {q.action} · {q.table_name}
              </strong>
              <pre className="payload-preview">{JSON.stringify(q.payload, null, 2)}</pre>
              <div className="share-actions">
                <button type="button" disabled={busy} onClick={() => void resolveQueue(q, 'approved')}>
                  Approve
                </button>
                <button type="button" className="btn-ghost" disabled={busy} onClick={() => void resolveQueue(q, 'rejected')}>
                  Reject
                </button>
              </div>
            </article>
          ))}
          {!queue.length ? <p className="text-muted">No pending approvals</p> : null}
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
