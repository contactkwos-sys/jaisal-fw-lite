import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Role } from '../lib/database.types'
import { orderRolesBySystemList } from '../lib/systemRoles'
import { supabase } from '../lib/supabase'

export type PinStatusRow = {
  role_id: string
  role_name: string
  pin_hint: string | null
  has_pin: boolean
  last_updated: string | null
}

type Props = {
  roles: Role[]
  isCeo: boolean
  onMessage?: (msg: string | null) => void
  onError?: (msg: string | null) => void
  refreshKey?: number
}

function formatUpdated(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function randomFourDigit(): string {
  return String(1000 + Math.floor(Math.random() * 9000))
}

/**
 * KMOS-style PIN overview table for Security → Roles & PIN.
 * Roles come from Role Management (`roles` table); PIN hints via roles-gate.
 */
export function PinOverviewTable({ roles, isCeo, onMessage, onError, refreshKey = 0 }: Props) {
  const [status, setStatus] = useState<PinStatusRow[]>([])
  const [loading, setLoading] = useState(false)
  const [revealAll, setRevealAll] = useState(false)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftPin, setDraftPin] = useState('')
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
      // Keep order aligned with Role Management / system list; include any role not in status.
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
      setStatus(merged)
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Failed to load PIN overview')
      // Fallback: show roles with unknown PIN state
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
    // onError intentionally omitted — parent often passes an inline setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus, refreshKey])

  const duplicatePins = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of status) {
      if (!row.pin_hint) continue
      counts.set(row.pin_hint, (counts.get(row.pin_hint) || 0) + 1)
    }
    const dups = new Set<string>()
    for (const [pin, n] of counts) {
      if (n >= 2) dups.add(pin)
    }
    return dups
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
      await loadStatus()
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'PIN reset failed')
    } finally {
      setBusyId(null)
    }
  }

  function startReset(roleId: string) {
    setEditingId(roleId)
    setDraftPin('')
    onError?.(null)
  }

  if (!roles.length) return null

  return (
    <section className="pin-overview surface card-row form-stack" aria-label="PIN Overview">
      <div className="row-top">
        <div>
          <strong>PIN Overview</strong>
          <p className="text-muted2" style={{ margin: '0.25rem 0 0' }}>
            All roles from Role Management — masked PINs, status, and quick reset.
          </p>
        </div>
        <div className="share-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={loading}
            onClick={() => {
              setRevealAll((v) => !v)
              if (revealAll) setRevealed({})
            }}
          >
            {revealAll ? 'Hide all PINs' : 'Show all PINs'}
          </button>
          <button type="button" className="btn-ghost" disabled={loading} onClick={() => void loadStatus()}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="dash-table-wrap pin-overview-wrap">
        <table className="dash-table pin-overview-table">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Current PIN</th>
              <th>Last Updated</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {status.map((row) => {
              const isDup = Boolean(row.pin_hint && duplicatePins.has(row.pin_hint))
              const showPlain = revealAll || revealed[row.role_id]
              const pinDisplay = !row.has_pin
                ? '—'
                : showPlain
                  ? row.pin_hint ?? '••••'
                  : '••••'
              const editing = editingId === row.role_id

              return (
                <tr
                  key={row.role_id}
                  className={[
                    !row.has_pin ? 'pin-row-unset' : '',
                    isDup ? 'pin-row-dup' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td>
                    <strong>{row.role_name}</strong>
                  </td>
                  <td>
                    <div className="pin-overview-pin-cell">
                      <code className="num pin-overview-code">{pinDisplay}</code>
                      {row.has_pin && row.pin_hint ? (
                        <button
                          type="button"
                          className="btn-ghost pin-show-btn"
                          onClick={() =>
                            setRevealed((m) => ({ ...m, [row.role_id]: !m[row.role_id] }))
                          }
                        >
                          {showPlain && !revealAll ? 'Hide' : 'Show'}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="text-muted2">{formatUpdated(row.last_updated)}</td>
                  <td>
                    <div className="pin-overview-badges">
                      {!row.has_pin ? (
                        <span className="pin-badge pin-badge-danger">Not Set</span>
                      ) : (
                        <span className="pin-badge pin-badge-ok">Active</span>
                      )}
                      {isDup ? (
                        <span className="pin-badge pin-badge-warn">Duplicate PIN</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {isCeo ? (
                      editing ? (
                        <div className="pin-overview-inline-reset">
                          <input
                            className="num"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="4 digit"
                            aria-label={`New PIN for ${row.role_name}`}
                            value={draftPin}
                            onChange={(e) =>
                              setDraftPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                            }
                          />
                          <button
                            type="button"
                            disabled={busyId === row.role_id}
                            onClick={() =>
                              void applyPin(
                                row.role_id,
                                row.role_name,
                                draftPin.length === 4 ? draftPin : randomFourDigit(),
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
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busyId !== null}
                          onClick={() => startReset(row.role_id)}
                        >
                          Reset PIN
                        </button>
                      )
                    ) : (
                      <span className="text-muted2">CEO only</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
