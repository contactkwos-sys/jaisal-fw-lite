import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApprovalsWidget } from '../components/ApprovalsWidget'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { ApprovalQueue, PayrollRate, Role, Worker } from '../lib/database.types'
import { applyOrQueue } from '../lib/mutate'
import type { MainModuleId } from '../lib/nav'
import {
  ALL_MODULE_OPTIONS,
  clearRolePermissionOverride,
  getDefaultPermissions,
  getPermissionsForRole,
  saveRolePermissions,
  type ModulePermission,
} from '../lib/permissions'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import {
  missingSystemRoleNames,
  orderRolesBySystemList,
  SYSTEM_ROLE_NAMES,
} from '../lib/systemRoles'
import { supabase } from '../lib/supabase'

type Sub = 'roles' | 'payroll' | 'approvals' | 'permissions'
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
  const [roleHasPin, setRoleHasPin] = useState<Record<string, boolean>>({})
  const [newPin, setNewPin] = useState<Record<string, string>>({})
  const [confirmPin, setConfirmPin] = useState<Record<string, string>>({})
  const [editName, setEditName] = useState<Record<string, string>>({})
  const [bulkPins, setBulkPins] = useState<Array<{ role: string; pin: string }> | null>(null)
  const [permRoleId, setPermRoleId] = useState<string | null>(null)
  const [permDraft, setPermDraft] = useState<ModulePermission[]>([])
  const [permMsg, setPermMsg] = useState<string | null>(null)

  const [rates, setRates] = useState<PayrollRate[]>([])
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({})
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [payables, setPayables] = useState<PayableRow[]>([])

  const [queue, setQueue] = useState<ApprovalQueue[]>([])

  const pinRoles = useMemo(() => orderRolesBySystemList(roles), [roles])

  const loadRoles = useCallback(async () => {
    // Prefer direct table read (authenticated RLS). Edge `roles-gate` can fail with
    // browser "TypeError: Load failed" when the function gateway/network flakes.
    const { data, error } = await supabase
      .from('roles')
      .select('id, role_name, is_custom, created_at')
      .order('created_at', { ascending: true })

    let list = (!error && data ? (data as Role[]) : []) as Role[]

    // Seed any missing system PIN roles (Machine Supervisor, Salesman, …) via roles-gate.
    if (!list.length || missingSystemRoleNames(list).length) {
      const { data: fnData, error: fnErr } = await supabase.functions.invoke('roles-gate', {
        body: { action: 'ensure' },
      })
      if (!fnErr && !fnData?.error && fnData?.roles?.length) {
        list = fnData.roles as Role[]
      } else if (!list.length) {
        if (fnErr) throw new Error(fnErr.message || error?.message || 'Load failed')
        if (fnData?.error) throw new Error(fnData.error)
      }
    }

    const ordered = orderRolesBySystemList(list)
    setRoles(ordered)

    // Presence only — never select pin_hash into the browser
    const { data: users } = await supabase
      .from('users')
      .select('role_id, is_active')
      .eq('is_active', true)
    const has: Record<string, boolean> = {}
    for (const u of users ?? []) {
      if (u.role_id) has[String(u.role_id)] = true
    }
    setRoleHasPin(has)
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

  useEffect(() => {
    if (sub !== 'permissions') return
    const role = roles.find((r) => r.id === permRoleId) || roles[0]
    if (!role) return
    if (!permRoleId) setPermRoleId(role.id)
    setPermDraft(getPermissionsForRole(role.role_name))
  }, [sub, roles, permRoleId])

  const monthTotal = useMemo(
    () => payables.reduce((s, p) => s + p.payable, 0),
    [payables],
  )

  async function writePinAudit(role: Role, action: string) {
    try {
      await supabase.from('pin_change_audit').insert({
        role_id: role.id,
        role_name: role.role_name,
        action,
        changed_by: profile?.id ?? null,
        changed_by_name: profile?.full_name || profile?.roles?.role_name || null,
      })
    } catch {
      // Audit must not block PIN change UX
    }
  }

  async function resetPin(role: Role) {
    if (!isCeo) {
      setError('CEO only')
      return
    }
    const pin = newPin[role.id] || ''
    const confirm = confirmPin[role.id] || ''
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 numeric digits')
      return
    }
    if (pin !== confirm) {
      setError('New PIN and Confirm PIN must match')
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
      await writePinAudit(role, 'change')
      setMessage(`PIN updated for ${role.role_name}`)
      setNewPin((p) => ({ ...p, [role.id]: '' }))
      setConfirmPin((p) => ({ ...p, [role.id]: '' }))
      setRoleHasPin((m) => ({ ...m, [role.id]: true }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PIN reset failed')
    } finally {
      setBusy(false)
    }
  }

  async function autoGenerateAllPins() {
    if (!isCeo) {
      setError('CEO only')
      return
    }
    if (!roles.length) {
      setError('No roles loaded')
      return
    }
    const existingCount = roles.filter((r) => roleHasPin[r.id]).length
    const confirmMsg =
      existingCount > 0
        ? `This will overwrite existing PINs for ${existingCount} role(s) and generate new unique 4-digit PINs for all ${roles.length} roles. Continue?`
        : `Generate unique 4-digit PINs for all ${roles.length} roles?`
    if (!window.confirm(confirmMsg)) return

    setBusy(true)
    setError(null)
    setMessage(null)
    setBulkPins(null)
    try {
      const ordered = orderRolesBySystemList(roles)
      const assigned: Array<{ role: string; pin: string }> = []
      const used = new Set<string>()
      const cryptoRand = () => {
        const arr = new Uint32Array(1)
        crypto.getRandomValues(arr)
        return 1000 + (arr[0] % 9000)
      }
      for (const role of ordered) {
        let pin = ''
        const isCeoRole = role.role_name.toLowerCase() === 'ceo'
        if (isCeoRole) {
          pin = '3060'
        } else {
          do {
            pin = String(cryptoRand())
          } while (used.has(pin) || pin === '3060')
        }
        used.add(pin)

        const { data, error: fnErr } = await supabase.functions.invoke('pin-reset', {
          body: { role_id: role.id, role_name: role.role_name, pin },
        })
        if (fnErr) throw new Error(fnErr.message || 'PIN reset request failed')
        if (data?.error) throw new Error(data.error)
        await writePinAudit(role, 'bulk_generate')
        assigned.push({ role: role.role_name, pin })
      }
      setBulkPins(assigned)
      setRoleHasPin(Object.fromEntries(ordered.map((r) => [r.id, true])))
      setNewPin({})
      setConfirmPin({})
      setMessage(`Auto-generated PINs for ${assigned.length} roles — note them securely (shown once)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk PIN generation failed')
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

  if (!isCeo && (sub === 'approvals' || sub === 'permissions')) {
    return (
      <div className="screen">
        <p className="text-danger">CEO / Admin only</p>
      </div>
    )
  }

  function toggleModule(moduleId: MainModuleId) {
    setPermDraft((prev) => {
      const exists = prev.find((p) => p.moduleId === moduleId)
      if (exists) return prev.filter((p) => p.moduleId !== moduleId)
      return [...prev, { moduleId }]
    })
  }

  function toggleSub(moduleId: MainModuleId, subId: string) {
    setPermDraft((prev) => {
      const copy = prev.map((p) => ({ ...p, subIds: p.subIds ? [...p.subIds] : undefined }))
      let row = copy.find((p) => p.moduleId === moduleId)
      if (!row) {
        row = { moduleId, subIds: [subId] }
        copy.push(row)
        return copy
      }
      const mod = ALL_MODULE_OPTIONS.find((m) => m.id === moduleId)
      const allIds = mod?.items.map((i) => i.id) || []
      const current = row.subIds && row.subIds.length ? row.subIds : allIds
      if (current.includes(subId)) {
        row.subIds = current.filter((id) => id !== subId)
      } else {
        row.subIds = [...current, subId]
      }
      if (row.subIds.length === 0) {
        return copy.filter((p) => p.moduleId !== moduleId)
      }
      if (row.subIds.length === allIds.length) {
        row.subIds = undefined
      }
      return copy
    })
  }

  function savePermissions() {
    const role = roles.find((r) => r.id === permRoleId)
    if (!role) return
    saveRolePermissions(role.role_name, permDraft)
    setPermMsg(`Saved module access for ${role.role_name}`)
  }

  function resetPermissions() {
    const role = roles.find((r) => r.id === permRoleId)
    if (!role) return
    clearRolePermissionOverride(role.role_name)
    setPermDraft(getDefaultPermissions(role.role_name))
    setPermMsg(`Reset ${role.role_name} to default access`)
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>PIN Management</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'roles', label: 'Roles & PIN' },
            { id: 'permissions', label: 'Permissions' },
            { id: 'payroll', label: 'Payroll' },
            ...(isCeo ? [{ id: 'approvals', label: 'Approvals' }] : []),
          ]}
        />
      </header>

      {sub === 'roles' ? (
        <div className="pin-mgmt">
          {isCeo ? (
            <div className="pin-mgmt-toolbar">
              <p className="text-muted" style={{ margin: 0 }}>
                All roles on one page. PINs are hashed — current values stay masked.
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => void autoGenerateAllPins()}
              >
                Auto-Generate All PINs
              </button>
            </div>
          ) : (
            <p className="text-muted">Only CEO can view and change PINs.</p>
          )}

          {bulkPins && isCeo ? (
            <div className="pin-bulk-banner">
              <strong>Generated PINs — copy now (shown once to CEO)</strong>
              <ul>
                {bulkPins.map((row) => (
                  <li key={row.role}>
                    <span>{row.role}</span>
                    <strong className="num">{row.pin}</strong>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: '0.65rem' }}
                onClick={() => setBulkPins(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          <div className="pin-table-wrap">
            <table className="pin-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>User / Role Name</th>
                  <th>Current PIN</th>
                  <th>New PIN</th>
                  <th>Confirm PIN</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pinRoles.map((role) => {
                  const hasPin = !!roleHasPin[role.id]
                  return (
                    <tr key={role.id}>
                      <td>
                        <strong>{role.role_name}</strong>
                        <div className="text-muted2" style={{ fontSize: '0.72rem' }}>
                          {role.is_custom
                            ? 'custom'
                            : (SYSTEM_ROLE_NAMES as readonly string[]).includes(role.role_name)
                              ? 'system'
                              : 'default'}
                        </div>
                      </td>
                      <td>
                        {isCeo ? (
                          <div className="form-stack" style={{ gap: '0.35rem' }}>
                            <input
                              value={editName[role.id] ?? role.role_name}
                              onChange={(e) =>
                                setEditName((m) => ({ ...m, [role.id]: e.target.value }))
                              }
                              aria-label={`Rename ${role.role_name}`}
                            />
                            <div className="share-actions">
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => void renameRole(role)}
                              >
                                Save name
                              </button>
                              {role.is_custom ? (
                                <button
                                  type="button"
                                  className="btn-ghost text-danger"
                                  disabled={busy}
                                  onClick={() => void deleteRole(role)}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          role.role_name
                        )}
                      </td>
                      <td>
                        <span className="pin-masked">{hasPin ? '••••' : '— —'}</span>
                      </td>
                      <td>
                        {isCeo ? (
                          <input
                            className="num"
                            inputMode="numeric"
                            maxLength={4}
                            autoComplete="off"
                            placeholder="••••"
                            value={newPin[role.id] ?? ''}
                            onChange={(e) =>
                              setNewPin((m) => ({
                                ...m,
                                [role.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                              }))
                            }
                            aria-label={`New PIN for ${role.role_name}`}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {isCeo ? (
                          <input
                            className="num"
                            inputMode="numeric"
                            maxLength={4}
                            autoComplete="off"
                            placeholder="••••"
                            value={confirmPin[role.id] ?? ''}
                            onChange={(e) =>
                              setConfirmPin((m) => ({
                                ...m,
                                [role.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                              }))
                            }
                            aria-label={`Confirm PIN for ${role.role_name}`}
                          />
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <span className={`pin-status-pill ${hasPin ? 'set' : 'unset'}`}>
                          {hasPin ? 'SET' : 'NOT SET'}
                        </span>
                      </td>
                      <td>
                        {isCeo ? (
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={busy}
                            onClick={() => void resetPin(role)}
                          >
                            Change
                          </button>
                        ) : (
                          <span className="text-muted2">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sub === 'permissions' && isCeo ? (
        <div className="form-stack perm-panel">
          <label className="field">
            <span className="text-muted">Role</span>
            <select
              value={permRoleId ?? ''}
              onChange={(e) => {
                setPermRoleId(e.target.value)
                setPermMsg(null)
              }}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.role_name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted2">
            Choose exactly which modules and sub-functions this role can open. Unauthorized tabs stay hidden.
          </p>
          <div className="perm-module-list">
            {ALL_MODULE_OPTIONS.map((mod) => {
              const enabled = permDraft.some((p) => p.moduleId === mod.id)
              const perm = permDraft.find((p) => p.moduleId === mod.id)
              return (
                <article key={mod.id} className="card-row surface perm-module-card">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleModule(mod.id as MainModuleId)}
                    />
                    <strong>{mod.label}</strong>
                  </label>
                  {enabled && mod.items.length ? (
                    <div className="perm-sub-grid">
                      {mod.items.map((item) => {
                        const allOn = !perm?.subIds || perm.subIds.length === 0
                        const on = allOn || (perm?.subIds || []).includes(item.id)
                        return (
                          <label key={item.id} className="check-row perm-sub-check">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleSub(mod.id as MainModuleId, item.id)}
                            />
                            <span>{item.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
          <div className="share-actions">
            <button type="button" onClick={savePermissions}>
              Save permissions
            </button>
            <button type="button" className="btn-ghost" onClick={resetPermissions}>
              Reset to defaults
            </button>
          </div>
          {permMsg ? <p className="form-ok text-sage">{permMsg}</p> : null}
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
        <div className="form-stack">
          <ApprovalsWidget />
          <h2 className="section-title">Legacy approval queue</h2>
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
            {!queue.length ? <p className="text-muted">No legacy queue items</p> : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
