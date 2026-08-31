/**
 * Security Machine & Production Update — mobile-first Security-only screen.
 * Extremely simple: M1–M6 run status, operator, meters, WhatsApp send → ERP sync.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { handleUserError } from '../lib/userError'
import { shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import {
  STOP_REASONS,
  addOperator,
  buildWhatsAppMessage,
  clearDraft,
  defaultShift,
  emptyDraft,
  formatDisplayDate,
  formatDisplayTime,
  loadDraft,
  loadOperators,
  saveDraft,
  submitSecurityUpdate,
  totalProduction,
  validateDraft,
  type MachineLineState,
  type SecurityDraft,
  type ShiftKind,
  type StopReason,
} from '../lib/securityMachineProduction'

function clockTick(): { date: string; time: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return { date: `${y}-${m}-${d}`, time: formatDisplayTime(now) }
}

/** Keep same-day unsent draft; start clean on a new calendar day. */
function hydrateSecurityDraft(): SecurityDraft {
  const existing = loadDraft()
  if (!existing) return emptyDraft()
  const today = clockTick().date
  if (existing.entry_date !== today) {
    return { ...emptyDraft(defaultShift()), entry_date: today }
  }
  return { ...existing, entry_date: today }
}

export function SecurityMachineProductionScreen() {
  const { profile, roleName } = useAuth()
  const [nowInfo, setNowInfo] = useState(clockTick)
  const [draft, setDraft] = useState<SecurityDraft>(() => hydrateSecurityDraft())
  const [operators, setOperators] = useState<string[]>([])
  const [addingOp, setAddingOp] = useState(false)
  const [newOpName, setNewOpName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const userLabel = 'Security'

  useEffect(() => {
    const id = window.setInterval(() => setNowInfo(clockTick()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    void loadOperators()
      .then(setOperators)
      .catch(() => setOperators([]))
  }, [])

  // Persist unsent draft on every change
  useEffect(() => {
    saveDraft(draft)
  }, [draft])

  const total = useMemo(() => totalProduction(draft.machines), [draft.machines])

  const runningMachines = useMemo(
    () => draft.machines.filter((m) => m.run_status === 'Running'),
    [draft.machines],
  )

  const stoppedMachines = useMemo(
    () => draft.machines.filter((m) => m.run_status === 'Stopped'),
    [draft.machines],
  )

  const patchMachine = useCallback((machineNo: string, patch: Partial<MachineLineState>) => {
    setDraft((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => (m.machine_no === machineNo ? { ...m, ...patch } : m)),
    }))
    setError(null)
    setMessage(null)
  }, [])

  function toggleMachine(machineNo: string) {
    const cur = draft.machines.find((m) => m.machine_no === machineNo)
    if (!cur) return
    if (cur.run_status === 'Running') {
      patchMachine(machineNo, {
        run_status: 'Stopped',
        stop_reason: 'Electronic Fault',
        production_meter: '',
        operator_name: '',
      })
    } else {
      patchMachine(machineNo, {
        run_status: 'Running',
        stop_reason: '',
      })
    }
  }

  function setShift(shift: ShiftKind) {
    setDraft((prev) => ({ ...prev, shift, entry_date: nowInfo.date }))
  }

  async function handleAddOperator() {
    const name = newOpName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const saved = await addOperator(name, profile?.id)
      const list = await loadOperators()
      setOperators(list)
      setNewOpName('')
      setAddingOp(false)
      setMessage(`Operator saved: ${saved}`)
    } catch (e) {
      setError(handleUserError('SMP.addOperator', e, 'Could not save operator'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSend(channel: 'WhatsApp' | 'WhatsApp Business') {
    setError(null)
    setMessage(null)
    const validation = validateDraft(draft)
    if (validation) {
      setError(validation)
      return
    }
    setBusy(true)
    try {
      const payload = {
        ...draft,
        entry_date: nowInfo.date || draft.entry_date,
      }
      const text = buildWhatsAppMessage(payload)
      await submitSecurityUpdate({
        draft: payload,
        userId: profile?.id || null,
        userName: profile?.full_name || roleName || userLabel,
        whatsappChannel: channel,
      })
      if (channel === 'WhatsApp Business') shareWhatsAppBusiness(text)
      else shareWhatsApp(text)

      setDraft(emptyDraft(payload.shift))
      clearDraft()
      setMessage('Saved & sent. Operators kept for next shift.')
      const list = await loadOperators()
      setOperators(list)
    } catch (e) {
      setError(
        handleUserError(
          'SMP.submit',
          e,
          'Could not save. Check connection or apply security machine migration.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen smp-screen">
      <header className="smp-header">
        <h1>Machine &amp; Production Update</h1>
        <p className="smp-header-sub">Security entry — tap machines, enter meters, send</p>
      </header>

      <section className="smp-meta" aria-label="Shift info">
        <div className="smp-meta-card">
          <span>Date</span>
          <strong>{formatDisplayDate(nowInfo.date)}</strong>
        </div>
        <div className="smp-meta-card">
          <span>Time</span>
          <strong>{nowInfo.time}</strong>
        </div>
        <div className="smp-meta-card smp-meta-shift">
          <span>Shift</span>
          <div className="smp-shift-toggle" role="group" aria-label="Shift">
            <button
              type="button"
              className={draft.shift === 'Day' ? 'is-active' : ''}
              onClick={() => setShift('Day')}
            >
              Day
            </button>
            <button
              type="button"
              className={draft.shift === 'Night' ? 'is-active' : ''}
              onClick={() => setShift('Night')}
            >
              Night
            </button>
          </div>
        </div>
        <div className="smp-meta-card">
          <span>User</span>
          <strong>{userLabel}</strong>
        </div>
      </section>

      {error ? <p className="smp-banner smp-banner-error">{error}</p> : null}
      {message ? <p className="smp-banner smp-banner-ok">{message}</p> : null}

      {/* SECTION 1 — MACHINE RUN */}
      <section className="smp-section">
        <h2>1. Machine Run</h2>
        <p className="smp-hint">Tap machine to switch ✓ Running / ✕ Stopped</p>
        <div className="smp-machine-grid">
          {draft.machines.map((m) => {
            const running = m.run_status === 'Running'
            return (
              <button
                key={m.machine_no}
                type="button"
                className={`smp-machine-btn ${running ? 'is-running' : 'is-stopped'}`}
                onClick={() => toggleMachine(m.machine_no)}
                aria-pressed={running}
              >
                <span className="smp-machine-no">{m.machine_no}</span>
                <span className={`smp-machine-mark ${running ? 'ok' : 'bad'}`} aria-hidden>
                  {running ? '✓' : '✕'}
                </span>
              </button>
            )
          })}
        </div>

        {stoppedMachines.length > 0 ? (
          <div className="smp-stop-block">
            {stoppedMachines.map((m) => (
              <div key={m.machine_no} className="smp-stop-row">
                <strong>{m.machine_no} Stopped — Reason</strong>
                <div className="smp-reason-row">
                  {STOP_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`smp-reason-btn ${m.stop_reason === r ? 'is-selected' : ''}`}
                      onClick={() => patchMachine(m.machine_no, { stop_reason: r as StopReason })}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {/* SECTION 2 + 3 — PRODUCTION + OPERATOR */}
      <section className="smp-section">
        <h2>2. Production &amp; Operator</h2>
        <p className="smp-hint">Only running machines. Same operator can run multiple machines.</p>

        <div className="smp-op-master">
          {!addingOp ? (
            <button type="button" className="smp-add-op" onClick={() => setAddingOp(true)}>
              + Add Operator
            </button>
          ) : (
            <div className="smp-add-op-form">
              <input
                type="text"
                value={newOpName}
                onChange={(e) => setNewOpName(e.target.value)}
                placeholder="Operator name"
                autoComplete="off"
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleAddOperator()
                  }
                }}
              />
              <button type="button" className="smp-btn-save-op" disabled={busy} onClick={() => void handleAddOperator()}>
                Save
              </button>
              <button
                type="button"
                className="smp-btn-cancel-op"
                onClick={() => {
                  setAddingOp(false)
                  setNewOpName('')
                }}
              >
                Cancel
              </button>
            </div>
          )}
          {operators.length > 0 ? (
            <p className="smp-op-saved text-muted">Saved operators: {operators.length}</p>
          ) : (
            <p className="smp-op-saved text-muted">Add operators once — they stay for next shifts</p>
          )}
        </div>

        <div className="smp-prod-list">
          {runningMachines.length === 0 ? (
            <p className="smp-empty">All machines stopped — no production entry</p>
          ) : (
            runningMachines.map((m) => (
              <article key={m.machine_no} className="smp-prod-row">
                <div className="smp-prod-machine">{m.machine_no}</div>
                <div className="smp-prod-fields">
                  <label className="smp-field">
                    <span>Operator</span>
                    {operators.length ? (
                      <select
                        value={m.operator_name}
                        onChange={(e) => patchMachine(m.machine_no, { operator_name: e.target.value })}
                      >
                        <option value="">Select</option>
                        {operators.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="smp-need-op">Add an operator first</span>
                    )}
                  </label>
                  {operators.length > 0 ? (
                    <div className="smp-op-chips" role="list">
                      {operators.map((op) => (
                        <button
                          key={op}
                          type="button"
                          role="listitem"
                          className={`smp-op-chip ${m.operator_name === op ? 'is-selected' : ''}`}
                          onClick={() => patchMachine(m.machine_no, { operator_name: op })}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <label className="smp-field">
                    <span>Production</span>
                    <div className="smp-meter-wrap">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={m.production_meter}
                        onChange={(e) => patchMachine(m.machine_no, { production_meter: e.target.value })}
                        placeholder="0"
                      />
                      <span className="smp-meter-suffix">Meter</span>
                    </div>
                  </label>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="smp-total">
          <span>Total Production ({draft.shift} Shift)</span>
          <strong>{total.toLocaleString('en-IN')} Mtr</strong>
        </div>
      </section>

      {/* SECTION 4 — SEND */}
      <div className="smp-actions">
        <button
          type="button"
          className="smp-btn-wa"
          disabled={busy}
          onClick={() => void handleSend('WhatsApp')}
        >
          WhatsApp
        </button>
        <button
          type="button"
          className="smp-btn-wab"
          disabled={busy}
          onClick={() => void handleSend('WhatsApp Business')}
        >
          WhatsApp Business
        </button>
      </div>

      <p className="smp-footer-note">
        Unsent data is kept if you close this page. After send, next shift starts clean. Operators stay saved.
      </p>
    </div>
  )
}
