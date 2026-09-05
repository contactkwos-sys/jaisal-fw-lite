/**
 * KMOS-style role/module PIN cards for Settings → User / PIN Management.
 * Large visible PINs, search, staff quick-reference, per-role WhatsApp, developer footer.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Role } from '../lib/database.types'
import { orderRolesBySystemList } from '../lib/systemRoles'
import { shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'
import type { PinStatusRow } from './PinOverviewTable'

type Props = {
  roles: Role[]
  isCeo: boolean
  busy?: boolean
  refreshKey?: number
  bulkPins?: Array<{ role: string; pin: string }> | null
  onDismissBulk?: () => void
  onAutoGenerateAll?: () => void
  onMessage?: (msg: string | null) => void
  onError?: (msg: string | null) => void
  onPinsChanged?: () => void
}

/** Common shop-floor roles shown in the quick-reference strip */
const QUICK_REF_ROLES = ['CEO', 'Manager', 'Security', 'Operator', 'Programmer', 'Salesman']

const ROLE_ICONS: Record<string, string> = {
  CEO: '👑',
  Manager: '📋',
  Security: '🛡️',
  Operator: '⚙️',
  Programmer: '🖥️',
  Salesman: '📦',
  'Machine Supervisor': '🔧',
  'Program Supervisor': '📐',
  'Checker & Dispatch': '✅',
}

const DEV_TAGS = [
  'Problem',
  'Edit request',
  'Delete request',
  'New feature',
  'New app requirement',
] as const

function randomFourDigit(used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const pin = String(1000 + Math.floor(Math.random() * 9000))
    if (!used.has(pin)) return pin
  }
  return String(1000 + Math.floor(Math.random() * 9000))
}

function roleIcon(name: string): string {
  return ROLE_ICONS[name] || '🔐'
}

function buildRolePinMessage(roleName: string, pin: string): string {
  return [
    'JAISAL FASHIONWEAV INDUSTRIES',
    '',
    `Role: ${roleName}`,
    `PIN: ${pin}`,
    '',
    `Use this PIN to log in as ${roleName}.`,
    `Date: ${new Date().toLocaleString('en-IN')}`,
  ].join('\n')
}

function buildDeveloperMessage(tag: string): string {
  return [
    'JAISAL FW — Developer contact',
    '',
    `Tag: ${tag}`,
    '',
    'App: Jaisal Fashionweav Lite (jaisal-fw-lite)',
    'Please describe the request below:',
    '',
  ].join('\n')
}

export function RolePinManagement({
  roles,
  isCeo,
  busy = false,
  refreshKey = 0,
  bulkPins,
  onDismissBulk,
  onAutoGenerateAll,
  onMessage,
  onError,
  onPinsChanged,
}: Props) {
  const [status, setStatus] = useState<PinStatusRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftPin, setDraftPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    if (!roles.length) {
      setStatus([])
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('roles-gate', {
        body: { action: 'pin-status' },
      })
      if (error) throw new Error(error.message || 'Failed to load PIN status')
      if (data?.error) throw new Error(data.error)
      const rows = (data?.status ?? []) as PinStatusRow[]
      const byId = new Map(rows.map((r) => [r.role_id, r]))
      const merged = orderRolesBySystemList(roles).map((role) => {
        const hit = byId.get(role.id)
        return (
          hit ?? {
            role_id: role.id,
            role_name: role.role_name,
            pin_hint: null,
            has_pin: false,
            last_updated: null,
          }
        )
      })
      // Overlay bulk-generated PINs (shown once) so cards stay visible after generate
      if (bulkPins?.length) {
        const byName = new Map(bulkPins.map((b) => [b.role.toLowerCase(), b.pin]))
        for (const row of merged) {
          const pin = byName.get(row.role_name.toLowerCase())
          if (pin) {
            row.pin_hint = pin
            row.has_pin = true
          }
        }
      }
      setStatus(merged)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Failed to load PIN overview')
      setStatus(
        orderRolesBySystemList(roles).map((role) => ({
          role_id: role.id,
          role_name: role.role_name,
          pin_hint: null,
          has_pin: false,
          last_updated: null,
        })),
      )
    } finally {
      setLoading(false)
    }
  }, [roles, onError, bulkPins])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus, refreshKey])

  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!needle) return status
    return status.filter((r) => r.role_name.toLowerCase().includes(needle))
  }, [status, needle])

  const quickRef = useMemo(() => {
    const byName = new Map(status.map((r) => [r.role_name.toLowerCase(), r]))
    return QUICK_REF_ROLES.map((name) => byName.get(name.toLowerCase())).filter(
      (r): r is PinStatusRow => Boolean(r?.has_pin && r.pin_hint),
    )
  }, [status])

  async function applyPin(roleId: string, roleName: string, pin: string) {
    if (!isCeo) {
      onError?.('CEO only')
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      onError?.('Enter a 4-digit PIN')
      return
    }
    if (confirmPin && confirmPin !== pin) {
      onError?.('New PIN and Confirm PIN must match')
      return
    }
    setBusyId(roleId)
    onError?.(null)
    onMessage?.(null)
    try {
      const { data, error } = await supabase.functions.invoke('pin-reset', {
        body: { role_id: roleId, role_name: roleName, pin },
      })
      if (error) throw new Error(error.message || 'PIN reset failed')
      if (data?.error) throw new Error(data.error)
      onMessage?.(`PIN set for ${roleName}: ${data?.pin_hint ?? pin}`)
      setEditingId(null)
      setDraftPin('')
      setConfirmPin('')
      await loadStatus()
      onPinsChanged?.()
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'PIN reset failed')
    } finally {
      setBusyId(null)
    }
  }

  function shareRolePin(row: PinStatusRow) {
    if (!row.pin_hint) {
      onError?.(`No PIN set for ${row.role_name} — Reset PIN first`)
      return
    }
    shareWhatsApp(buildRolePinMessage(row.role_name, row.pin_hint))
    onMessage?.(`Opened WhatsApp for ${row.role_name} PIN`)
  }

  function contactDeveloper(tag: string) {
    shareWhatsApp(buildDeveloperMessage(tag))
    onMessage?.(`Opened WhatsApp — ${tag}`)
  }

  if (!roles.length && !loading) return null

  return (
    <div className="role-pin-mgmt">
      {isCeo ? (
        <section className="role-pin-quickref surface" aria-label="Staff PIN quick reference">
          <div className="role-pin-quickref-head">
            <h2>Staff PIN quick reference</h2>
            <p className="text-muted2">Commonly needed login PINs — tap WhatsApp to send</p>
          </div>
          <div className="role-pin-quickref-grid">
            {quickRef.length === 0 ? (
              <p className="text-muted">No PINs set yet — use Auto-Generate All PINs</p>
            ) : (
              quickRef.map((row) => (
                <button
                  key={row.role_id}
                  type="button"
                  className="role-pin-quickref-chip"
                  onClick={() => shareRolePin(row)}
                  title={`Send ${row.role_name} PIN on WhatsApp`}
                >
                  <span className="role-pin-quickref-name">
                    {roleIcon(row.role_name)} {row.role_name}
                  </span>
                  <strong className="num role-pin-quickref-pin">{row.pin_hint}</strong>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}

      <div className="role-pin-toolbar">
        <label className="role-pin-search-wrap">
          <span className="sr-only">Search roles</span>
          <input
            className="role-pin-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles / modules…"
            aria-label="Search roles"
          />
        </label>
        {isCeo ? (
          <div className="role-pin-toolbar-actions">
            <button
              type="button"
              className="btn-ghost"
              disabled={loading || busy}
              onClick={() => void loadStatus()}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            {onAutoGenerateAll ? (
              <button
                type="button"
                className="btn-primary"
                disabled={busy || loading}
                onClick={onAutoGenerateAll}
              >
                Auto-Generate All PINs
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-muted">Only CEO can view and change PINs.</p>
        )}
      </div>

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
            onClick={onDismissBulk}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!isCeo ? (
        <p className="text-muted">PIN values are visible to CEO only.</p>
      ) : (
        <div className="role-pin-card-grid">
          {loading && !filtered.length ? (
            <p className="text-muted">Loading roles…</p>
          ) : null}
          {!loading && filtered.length === 0 ? (
            <p className="text-muted">No roles match “{search}”</p>
          ) : null}
          {filtered.map((row) => {
            const editing = editingId === row.role_id
            const used = new Set(
              status.map((s) => s.pin_hint).filter((p): p is string => Boolean(p)),
            )
            return (
              <article key={row.role_id} className="role-pin-card surface">
                <div className="role-pin-card-head">
                  <span className="role-pin-card-icon" aria-hidden="true">
                    {roleIcon(row.role_name)}
                  </span>
                  <div>
                    <h3>{row.role_name}</h3>
                    <p className="text-muted2 text-sm">Login role</p>
                  </div>
                  <span
                    className={
                      row.has_pin ? 'role-pin-status active' : 'role-pin-status inactive'
                    }
                  >
                    {row.has_pin ? 'Active' : 'Not set'}
                  </span>
                </div>

                <div className="role-pin-digits" aria-label={`${row.role_name} PIN`}>
                  {row.has_pin && row.pin_hint ? row.pin_hint : '————'}
                </div>

                {editing ? (
                  <div className="role-pin-edit-row">
                    <input
                      className="num"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="New PIN"
                      aria-label={`New PIN for ${row.role_name}`}
                      value={draftPin}
                      onChange={(e) =>
                        setDraftPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                    />
                    <input
                      className="num"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Confirm"
                      aria-label={`Confirm PIN for ${row.role_name}`}
                      value={confirmPin}
                      onChange={(e) =>
                        setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                      }
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyId === row.role_id}
                      onClick={() =>
                        void applyPin(
                          row.role_id,
                          row.role_name,
                          draftPin.length === 4 ? draftPin : randomFourDigit(used),
                        )
                      }
                    >
                      {busyId === row.role_id
                        ? 'Saving…'
                        : draftPin.length === 4
                          ? 'Save'
                          : 'Generate'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setEditingId(null)
                        setDraftPin('')
                        setConfirmPin('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="role-pin-card-actions">
                    <button
                      type="button"
                      className="btn-wa"
                      disabled={!row.has_pin || !row.pin_hint}
                      onClick={() => shareRolePin(row)}
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      className="btn-warp"
                      disabled={busyId !== null || busy}
                      onClick={() => {
                        setEditingId(row.role_id)
                        setDraftPin('')
                        setConfirmPin('')
                        onError?.(null)
                      }}
                    >
                      Reset PIN
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <footer className="role-pin-dev-footer surface">
        <h2>Contact Developer on WhatsApp</h2>
        <p className="text-muted2">
          Quick tags for Jaisal FW support — opens WhatsApp with a pre-filled message
        </p>
        <div className="role-pin-dev-tags">
          {DEV_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className="role-pin-dev-tag"
              onClick={() => contactDeveloper(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-wa"
          onClick={() => contactDeveloper('General')}
        >
          Contact Developer on WhatsApp
        </button>
      </footer>
    </div>
  )
}
