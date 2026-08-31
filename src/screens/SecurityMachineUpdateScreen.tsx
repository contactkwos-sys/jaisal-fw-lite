import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import {
  STOP_REASONS,
  addOperator,
  buildWhatsAppMessage,
  clearDraft,
  defaultDraft,
  detectShift,
  formatDisplayDate,
  formatDisplayTime,
  loadDraft,
  loadOperators,
  saveDraft,
  submitSecurityShiftUpdate,
  totalProduction,
  type MachineRunState,
  type SecurityDraft,
  type ShiftName,
  type StopReason,
} from '../lib/securityMachineUpdate'

export function SecurityMachineUpdateScreen() {
  const { profile, roleName } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const [draft, setDraft] = useState<SecurityDraft>(() => loadDraft() ?? defaultDraft())
  const [operators, setOperators] = useState<string[]>([])
  const [addingOperator, setAddingOperator] = useState(false)
  const [newOperatorName, setNewOperatorName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    void loadOperators().then(setOperators)
  }, [])

  // Auto-save unsent draft on every change
  useEffect(() => {
    if (submitted) return
    saveDraft(draft)
  }, [draft, submitted])

  const runningMachines = useMemo(() => draft.machines.filter((m) => m.running), [draft.machines])
  const total = useMemo(() => totalProduction(draft.machines), [draft.machines])

  function patchMachine(machine: string, patch: Partial<MachineRunState>) {
    setSubmitted(false)
    setDraft((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => (m.machine === machine ? { ...m, ...patch } : m)),
    }))
  }

  function toggleMachine(machine: string) {
    setSubmitted(false)
    setDraft((prev) => ({
      ...prev,
      machines: prev.machines.map((m) => {
        if (m.machine !== machine) return m
        const running = !m.running
        return {
          ...m,
          running,
          stopReason: running ? null : m.stopReason,
          productionMeters: running ? m.productionMeters : '',
          operatorName: running ? m.operatorName : '',
        }
      }),
    }))
  }

  function setShift(shift: ShiftName) {
    setSubmitted(false)
    setDraft((prev) => ({ ...prev, shift }))
  }

  async function handleAddOperator() {
    const name = newOperatorName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const saved = await addOperator(name, profile?.full_name || 'Security')
      const next = await loadOperators()
      setOperators(next.includes(saved) ? next : [...next, saved].sort((a, b) => a.localeCompare(b)))
      setNewOperatorName('')
      setAddingOperator(false)
      setMessage(`Operator "${saved}" saved`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save operator')
    } finally {
      setBusy(false)
    }
  }

  function validateBeforeSend(): string | null {
    for (const m of draft.machines) {
      if (!m.running && !m.stopReason) return `Select stop reason for ${m.machine}`
    }
    for (const m of runningMachines) {
      if (!m.operatorName.trim()) return `Select operator for ${m.machine}`
      const meters = Number(m.productionMeters)
      if (!Number.isFinite(meters) || m.productionMeters.trim() === '') {
        return `Enter production for ${m.machine}`
      }
    }
    return null
  }

  async function handleSend(channel: 'whatsapp' | 'business') {
    const v = validateBeforeSend()
    if (v) {
      setError(v)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = buildWhatsAppMessage(draft, now)
      const result = await submitSecurityShiftUpdate({
        draft,
        submittedBy: profile?.full_name || 'Security',
        submittedByUserId: profile?.id || null,
      })
      setSubmitted(true)
      setMessage(`Saved · Total ${result.totalProduction} Mtr · Opening ${channel === 'business' ? 'WhatsApp Business' : 'WhatsApp'}…`)
      if (channel === 'business') shareWhatsAppBusiness(text)
      else shareWhatsApp(text)
      // Fresh form for next entry (operators stay)
      setDraft(defaultDraft(draft.shift))
      clearDraft()
    } catch (e) {
      // Still open WhatsApp if DB save failed so Security can send the message;
      // keep draft so they can retry save.
      const text = buildWhatsAppMessage(draft, now)
      if (channel === 'business') shareWhatsAppBusiness(text)
      else shareWhatsApp(text)
      setError(
        e instanceof Error
          ? `WhatsApp opened, but save failed: ${e.message}`
          : 'WhatsApp opened, but save failed. Draft kept.',
      )
    } finally {
      setBusy(false)
    }
  }

  function startFresh() {
    clearDraft()
    setDraft(defaultDraft(detectShift()))
    setSubmitted(false)
    setError(null)
    setMessage('Ready for new entry')
  }

  const dateLabel = formatDisplayDate(draft.entryDate)
  const timeLabel = formatDisplayTime(now)

  return (
    <div className="smu-screen">
      <header className="smu-header">
        <h1>Machine &amp; Production Update</h1>
        <div className="smu-meta">
          <div className="smu-meta-card">
            <span className="smu-meta-label">Date</span>
            <strong>{dateLabel}</strong>
          </div>
          <div className="smu-meta-card">
            <span className="smu-meta-label">Time</span>
            <strong>{timeLabel}</strong>
          </div>
          <div className="smu-meta-card smu-meta-shift">
            <span className="smu-meta-label">Shift</span>
            <div className="smu-shift-toggle" role="group" aria-label="Shift">
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
          <div className="smu-meta-card">
            <span className="smu-meta-label">User</span>
            <strong>{roleName || 'Security'}</strong>
          </div>
        </div>
      </header>

      {error ? <p className="smu-banner smu-banner-error">{error}</p> : null}
      {message ? <p className="smu-banner smu-banner-ok">{message}</p> : null}

      <section className="smu-section" aria-labelledby="smu-run-title">
        <h2 id="smu-run-title">1. Machine Run</h2>
        <p className="smu-hint">Tap machine — green ✓ running · red ✕ stopped</p>
        <div className="smu-machine-grid">
          {draft.machines.map((m) => (
            <button
              key={m.machine}
              type="button"
              className={`smu-machine-btn ${m.running ? 'is-running' : 'is-stopped'}`}
              onClick={() => toggleMachine(m.machine)}
              aria-pressed={m.running}
              aria-label={`${m.machine} ${m.running ? 'running' : 'stopped'}`}
            >
              <span className="smu-machine-no">{m.machine}</span>
              <span className="smu-machine-mark" aria-hidden="true">
                {m.running ? '✓' : '✕'}
              </span>
            </button>
          ))}
        </div>

        {draft.machines
          .filter((m) => !m.running)
          .map((m) => (
            <div key={`reason-${m.machine}`} className="smu-stop-box">
              <p className="smu-stop-title">
                {m.machine} stopped — Reason
              </p>
              <div className="smu-reason-list" role="radiogroup" aria-label={`${m.machine} stop reason`}>
                {STOP_REASONS.map((reason) => (
                  <label key={reason} className={`smu-reason ${m.stopReason === reason ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name={`stop-${m.machine}`}
                      checked={m.stopReason === reason}
                      onChange={() => patchMachine(m.machine, { stopReason: reason as StopReason })}
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
      </section>

      <section className="smu-section" aria-labelledby="smu-prod-title">
        <h2 id="smu-prod-title">2. Production &amp; Operator</h2>
        <p className="smu-hint">Only running machines · same operator can run multiple machines</p>

        <div className="smu-operator-bar">
          {!addingOperator ? (
            <button type="button" className="smu-add-op" onClick={() => setAddingOperator(true)}>
              + Add Operator
            </button>
          ) : (
            <div className="smu-add-op-form">
              <input
                type="text"
                value={newOperatorName}
                onChange={(e) => setNewOperatorName(e.target.value)}
                placeholder="Operator name"
                autoFocus
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddOperator()
                }}
              />
              <button type="button" className="smu-btn-solid" disabled={busy} onClick={() => void handleAddOperator()}>
                Save
              </button>
              <button type="button" className="smu-btn-ghost" onClick={() => { setAddingOperator(false); setNewOperatorName('') }}>
                Cancel
              </button>
            </div>
          )}
        </div>

        {runningMachines.length === 0 ? (
          <p className="smu-empty">All machines stopped — no production entry.</p>
        ) : (
          <ul className="smu-prod-list">
            {runningMachines.map((m) => (
              <li key={m.machine} className="smu-prod-row">
                <div className="smu-prod-machine">{m.machine}</div>
                <div className="smu-prod-fields">
                  <label className="smu-field">
                    <span>Operator</span>
                    {operators.length > 0 ? (
                      <div className="smu-op-chips">
                        {operators.map((op) => (
                          <button
                            key={op}
                            type="button"
                            className={`smu-op-chip ${m.operatorName === op ? 'is-selected' : ''}`}
                            onClick={() => patchMachine(m.machine, { operatorName: op })}
                          >
                            {op}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="smu-hint">Add an operator first</p>
                    )}
                  </label>
                  <label className="smu-field smu-field-meters">
                    <span>Production</span>
                    <div className="smu-meter-input">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={m.productionMeters}
                        onChange={(e) => patchMachine(m.machine, { productionMeters: e.target.value })}
                        placeholder="0"
                      />
                      <span className="smu-unit">Meter</span>
                    </div>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="smu-total">
          <span>Total Production ({draft.shift} Shift)</span>
          <strong>{total.toLocaleString('en-IN')} Mtr</strong>
        </div>
      </section>

      <div className="smu-bottom-spacer" aria-hidden="true" />

      <footer className="smu-actions">
        <button
          type="button"
          className="smu-send smu-send-wa"
          disabled={busy}
          onClick={() => void handleSend('whatsapp')}
        >
          WhatsApp
        </button>
        <button
          type="button"
          className="smu-send smu-send-wab"
          disabled={busy}
          onClick={() => void handleSend('business')}
        >
          WhatsApp Business
        </button>
        <button type="button" className="smu-fresh" disabled={busy} onClick={startFresh}>
          New Entry
        </button>
      </footer>
    </div>
  )
}
