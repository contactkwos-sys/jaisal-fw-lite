/**
 * Security — Machine & Production Update
 * Extremely simple mobile-first screen for Security gate staff.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  STOP_REASONS,
  addSecurityOperator,
  buildWhatsAppMessage,
  clearSecurityDraft,
  createEmptyDraft,
  detectShift,
  formatDisplayDate,
  formatDisplayTime,
  fmtMtr,
  loadSecurityDraft,
  loadSecurityOperators,
  markWhatsAppSent,
  runningMachines,
  saveSecurityDraft,
  submitSecurityUpdate,
  totalProduction,
  type MachineLineState,
  type SecurityUpdateDraft,
  type ShiftKind,
  type StopReason,
} from '../lib/securityMachineUpdate'
import { shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { handleUserError } from '../lib/userError'

function toggleMachine(m: MachineLineState): MachineLineState {
  if (m.status === 'running') {
    return { ...m, status: 'stopped', stop_reason: null, operator_name: '', production_mtr: '' }
  }
  return { ...m, status: 'running', stop_reason: null }
}

export function SecurityMachineUpdateScreen() {
  const { profile, roleName } = useAuth()
  const [draft, setDraft] = useState<SecurityUpdateDraft>(() => loadSecurityDraft() || createEmptyDraft())
  const [operators, setOperators] = useState<string[]>([])
  const [now, setNow] = useState(() => new Date())
  const [addingOp, setAddingOp] = useState(false)
  const [newOpName, setNewOpName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lastUpdateId, setLastUpdateId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    void loadSecurityOperators()
      .then(setOperators)
      .catch(() => setOperators([]))
  }, [])

  // Auto-save unsent draft so refresh/close preserves data
  useEffect(() => {
    if (draft.submitted) return
    saveSecurityDraft(draft)
  }, [draft])

  const total = useMemo(() => totalProduction(draft.machines), [draft.machines])
  const running = useMemo(() => runningMachines(draft.machines), [draft.machines])

  function patchMachine(machineNo: string, patch: Partial<MachineLineState>) {
    setDraft((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => (m.machine_no === machineNo ? { ...m, ...patch } : m)),
    }))
    setError(null)
    setMessage(null)
  }

  function setShift(shift: ShiftKind) {
    setDraft((prev) => ({ ...prev, shift }))
  }

  async function handleAddOperator() {
    const name = newOpName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const saved = await addSecurityOperator(name)
      setOperators((prev) => [...new Set([...prev, saved])].sort((a, b) => a.localeCompare(b)))
      setNewOpName('')
      setAddingOp(false)
      setMessage(`Operator "${saved}" saved`)
    } catch (e) {
      setError(handleUserError('addOperator', e, 'Could not save operator'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSend(kind: 'wa' | 'wab') {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = buildWhatsAppMessage(draft, now)
      const result = await submitSecurityUpdate({
        draft,
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || roleName || 'Security',
        markWhatsAppSent: true,
      })
      setLastUpdateId(result.update_id)
      if (kind === 'wa') shareWhatsApp(text)
      else shareWhatsAppBusiness(text)
      void markWhatsAppSent(result.update_id)
      clearSecurityDraft()
      setDraft(createEmptyDraft(draft.shift === 'Day' ? 'Night' : detectShift()))
      setMessage(`Sent · Total ${fmtMtr(result.total_production_mtr)} Mtr · Saved to ERP`)
    } catch (e) {
      // Still allow WhatsApp even if remote DB save fails (e.g. migration pending)
      const msg = e instanceof Error ? e.message : 'Send failed'
      const looksLikeValidation =
        /select|enter|at least|reason|operator|production/i.test(msg) && !/permission|relation|schema/i.test(msg)
      if (looksLikeValidation) {
        setError(handleUserError('securitySend', e, msg))
      } else {
        try {
          const text = buildWhatsAppMessage(draft, now)
          // Validate locally before opening WhatsApp without DB
          const localErr = (() => {
            for (const m of draft.machines) {
              if (m.status === 'stopped' && !m.stop_reason) return `Select stop reason for ${m.machine_no}`
            }
            for (const m of runningMachines(draft.machines)) {
              if (!m.operator_name.trim()) return `Select operator for ${m.machine_no}`
              const n = Number(m.production_mtr)
              if (!Number.isFinite(n) || n < 0) return `Enter production meters for ${m.machine_no}`
            }
            return null
          })()
          if (localErr) {
            setError(localErr)
            return
          }
          if (kind === 'wa') shareWhatsApp(text)
          else shareWhatsAppBusiness(text)
          // Keep draft until DB works, but mark message opened
          setError(`WhatsApp opened. Database save pending: ${msg}`)
        } catch (inner) {
          setError(handleUserError('securitySendFallback', inner, msg))
        }
      }
    } finally {
      setBusy(false)
    }
  }

  function startFresh() {
    clearSecurityDraft()
    setDraft(createEmptyDraft(detectShift()))
    setMessage('New entry started')
    setError(null)
    setLastUpdateId(null)
  }

  const userLabel = profile?.full_name || roleName || 'Security'

  return (
    <div className="smu-screen">
      <header className="smu-header">
        <h1>Machine &amp; Production Update</h1>
        <p className="smu-header-sub">Security · simple gate entry</p>
      </header>

      <div className="smu-meta">
        <div className="smu-meta-card">
          <span className="smu-meta-label">Date</span>
          <strong>{formatDisplayDate(draft.entry_date, now)}</strong>
        </div>
        <div className="smu-meta-card">
          <span className="smu-meta-label">Time</span>
          <strong>{formatDisplayTime(now)}</strong>
        </div>
        <div className="smu-meta-card smu-meta-shift">
          <span className="smu-meta-label">Shift</span>
          <div className="smu-shift-toggle" role="group" aria-label="Shift">
            <button
              type="button"
              className={draft.shift === 'Day' ? 'is-on' : ''}
              onClick={() => setShift('Day')}
            >
              Day
            </button>
            <button
              type="button"
              className={draft.shift === 'Night' ? 'is-on' : ''}
              onClick={() => setShift('Night')}
            >
              Night
            </button>
          </div>
        </div>
        <div className="smu-meta-card">
          <span className="smu-meta-label">User</span>
          <strong>Security</strong>
          <span className="smu-meta-user-hint">{userLabel}</span>
        </div>
      </div>

      {error ? (
        <p className="smu-banner smu-banner-err" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="smu-banner smu-banner-ok" role="status">
          {message}
          {lastUpdateId ? <span className="smu-meta-user-hint"> · synced</span> : null}
        </p>
      ) : null}

      {/* SECTION 1 — MACHINE RUN */}
      <section className="smu-section">
        <h2>1. Machine Run</h2>
        <p className="smu-hint">Tap machine to mark Running ✓ or Stopped ✕</p>
        <div className="smu-machine-grid">
          {draft.machines.map((m) => (
            <button
              key={m.machine_no}
              type="button"
              className={`smu-machine-btn ${m.status === 'running' ? 'is-run' : 'is-stop'}`}
              onClick={() => patchMachine(m.machine_no, toggleMachine(m))}
              aria-pressed={m.status === 'running'}
            >
              <span className="smu-machine-no">{m.machine_no}</span>
              <span className="smu-machine-mark" aria-hidden>
                {m.status === 'running' ? '✓' : '✕'}
              </span>
            </button>
          ))}
        </div>
        <div className="smu-legend">
          <span>
            <i className="smu-dot run" /> Running
          </span>
          <span>
            <i className="smu-dot stop" /> Stopped
          </span>
        </div>

        {draft.machines
          .filter((m) => m.status === 'stopped')
          .map((m) => (
            <div key={`reason-${m.machine_no}`} className="smu-reason-box">
              <strong>{m.machine_no} Stopped — Reason</strong>
              <div className="smu-reason-list" role="radiogroup" aria-label={`Stop reason ${m.machine_no}`}>
                {STOP_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={m.stop_reason === r}
                    className={`smu-reason-btn ${m.stop_reason === r ? 'is-on' : ''}`}
                    onClick={() => patchMachine(m.machine_no, { stop_reason: r as StopReason })}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </section>

      {/* SECTION 2+3 — PRODUCTION + OPERATOR */}
      <section className="smu-section">
        <h2>2. Production &amp; Operator</h2>
        <p className="smu-hint">Running machines only · same operator can run multiple machines</p>

        <div className="smu-op-bar">
          {!addingOp ? (
            <button type="button" className="smu-add-op" onClick={() => setAddingOp(true)}>
              + Add Operator
            </button>
          ) : (
            <div className="smu-add-op-row">
              <input
                type="text"
                value={newOpName}
                onChange={(e) => setNewOpName(e.target.value)}
                placeholder="Operator name"
                autoComplete="off"
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddOperator()
                }}
              />
              <button type="button" className="smu-save-op" disabled={busy} onClick={() => void handleAddOperator()}>
                Save
              </button>
              <button
                type="button"
                className="smu-cancel-op"
                onClick={() => {
                  setAddingOp(false)
                  setNewOpName('')
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {running.length === 0 ? (
          <p className="smu-empty">No running machines selected</p>
        ) : (
          <ul className="smu-prod-list">
            {running.map((m) => (
              <li key={m.machine_no} className="smu-prod-row">
                <div className="smu-prod-machine">{m.machine_no}</div>
                <div className="smu-prod-fields">
                  <label className="smu-field">
                    <span>Operator</span>
                    <select
                      value={m.operator_name}
                      onChange={(e) => patchMachine(m.machine_no, { operator_name: e.target.value })}
                    >
                      <option value="">Select…</option>
                      {operators.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>
                  {operators.length > 0 ? (
                    <div className="smu-op-chips" aria-label={`Quick pick operator for ${m.machine_no}`}>
                      {operators.slice(0, 8).map((op) => (
                        <button
                          key={op}
                          type="button"
                          className={`smu-op-chip ${m.operator_name === op ? 'is-on' : ''}`}
                          onClick={() => patchMachine(m.machine_no, { operator_name: op })}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="smu-field smu-field-mtr">
                    <span>Production</span>
                    <div className="smu-mtr-wrap">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        placeholder="0"
                        value={m.production_mtr}
                        onChange={(e) => patchMachine(m.machine_no, { production_mtr: e.target.value })}
                      />
                      <span className="smu-mtr-unit">Meter</span>
                    </div>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="smu-total">
          <span>Total Production ({draft.shift} Shift)</span>
          <strong>{fmtMtr(total)} Mtr</strong>
        </div>
      </section>

      <div className="smu-actions-spacer" aria-hidden />

      {/* SECTION 4 — SEND */}
      <div className="smu-actions">
        <button
          type="button"
          className="smu-btn smu-btn-wa"
          disabled={busy}
          onClick={() => void handleSend('wa')}
        >
          WhatsApp
        </button>
        <button
          type="button"
          className="smu-btn smu-btn-wab"
          disabled={busy}
          onClick={() => void handleSend('wab')}
        >
          WhatsApp Business
        </button>
        <button type="button" className="smu-btn-fresh" disabled={busy} onClick={startFresh}>
          Start new entry
        </button>
      </div>
    </div>
  )
}
