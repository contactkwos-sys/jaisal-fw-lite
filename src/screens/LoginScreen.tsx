import { useEffect, useMemo, useState } from 'react'
import { PinPad } from '../components/PinPad'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/database.types'
import { missingSystemRoleNames, orderRolesBySystemList, SYSTEM_ROLE_NAMES } from '../lib/systemRoles'
import { supabase } from '../lib/supabase'

export function LoginScreen() {
  const { loginWithPin } = useAuth()
  const [roles, setRoles] = useState<Role[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [adding, setAdding] = useState(false)
  const [customName, setCustomName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadRoles() {
    const applyList = (list: Role[]) => {
      const ordered = orderRolesBySystemList(list)
      setRoles(ordered)
      if (!selectedId && ordered.length) {
        const ceo = ordered.find((r) => r.role_name === 'CEO')
        setSelectedId(ceo?.id ?? ordered[0].id)
      }
    }

    const { data: tableData, error: tableErr } = await supabase
      .from('roles')
      .select('id, role_name, is_custom, created_at')
      .order('created_at', { ascending: true })

    let list = (!tableErr && tableData?.length ? (tableData as Role[]) : []) as Role[]

    // If system PIN roles are missing from the table, ask roles-gate to seed them.
    if (!list.length || missingSystemRoleNames(list).length) {
      const { data, error: fnErr } = await supabase.functions.invoke('roles-gate', {
        body: { action: 'ensure' },
      })
      if (!fnErr && !data?.error && data?.roles?.length) {
        list = data.roles as Role[]
      } else if (!list.length) {
        if (fnErr) throw new Error(fnErr.message || tableErr?.message || 'Load failed')
        if (data?.error) throw new Error(data.error)
      }
    }

    if (!list.length) {
      throw new Error(tableErr?.message || 'No roles available')
    }
    applyList(list)
  }

  useEffect(() => {
    void loadRoles().catch((e: Error) => setError(e.message))
  }, [])

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  )

  const chipRoles = useMemo(() => {
    const defaults = SYSTEM_ROLE_NAMES.map(
      (name) => roles.find((r) => r.role_name === name) ?? null,
    ).filter(Boolean) as Role[]
    const customs = roles.filter((r) => r.is_custom)
    return [...defaults, ...customs]
  }, [roles])

  async function handleAddRole() {
    const name = customName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('roles-gate', {
        body: { action: 'create', role_name: name },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      const role = data.role as Role
      setRoles((prev) => orderRolesBySystemList([...prev, role]))
      setSelectedId(role.id)
      setAdding(false)
      setCustomName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add role')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogin() {
    if (!selected) {
      setError('Select a role')
      return
    }
    if (pin.length !== 4) {
      setError('Enter 4-digit PIN')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await loginWithPin(selected, pin)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen login-screen">
      <div className="login-card">
        <header className="login-brand">
          <p className="login-eyebrow">Fashionweave Industries</p>
          <h1>JAISAL FW</h1>
          <p className="text-muted">Select your role and enter PIN</p>
        </header>

        <section className="role-chips" aria-label="Roles">
          {chipRoles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={selectedId === role.id ? 'chip chip-active' : 'chip'}
              onClick={() => {
                setSelectedId(role.id)
                setPin('')
                setError(null)
              }}
            >
              {role.role_name}
            </button>
          ))}
          {!adding ? (
            <button type="button" className="chip chip-add" onClick={() => setAdding(true)}>
              + Add
            </button>
          ) : (
            <div className="add-role-row">
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Custom role"
                aria-label="Custom role name"
              />
              <button type="button" disabled={busy} onClick={() => void handleAddRole()}>
                Save
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setAdding(false)
                  setCustomName('')
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </section>

        <PinPad value={pin} onChange={setPin} disabled={busy} />

        {error ? <p className="form-error text-danger">{error}</p> : null}

        <button
          type="button"
          className="login-btn"
          disabled={busy || !selected || pin.length !== 4}
          onClick={() => void handleLogin()}
        >
          {busy ? 'Signing in…' : `Login as ${selected?.role_name ?? 'Role'}`}
        </button>
      </div>
    </div>
  )
}
