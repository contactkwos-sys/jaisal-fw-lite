import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES, type MaintenanceRequest, type RepairingTracker } from '../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO, uploadFactoryPhoto } from '../lib/mutate'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'overview' | 'request' | 'repair' | 'history'
type Props = { initialSub?: Sub; filter?: string }

const FAULT_TYPES = ['Electrical Fault', 'Mechanical Fault', 'Other Fault', 'Complaint', 'Breakdown'] as const

const FLOW_STEPS = [
  { key: 'open', label: 'OPEN', field: 'opened_at' as const },
  { key: 'call_done', label: 'CALL DONE', field: 'call_done_at' as const },
  { key: 'arrived', label: 'ARRIVED', field: 'arrived_at' as const },
  { key: 'work_started', label: 'WORK STARTED', field: 'work_started_at' as const },
  { key: 'resolved', label: 'RESOLVED', field: 'resolved_at' as const },
]

function nowIso() {
  return new Date().toISOString()
}

function statusLabel(row: MaintenanceRequest): string {
  if (row.resolved_at || row.status === 'resolved') return 'RESOLVED'
  if (row.work_started_at || row.status === 'work_started') return 'WORK STARTED'
  if (row.arrived_at || row.status === 'arrived') return 'ARRIVED'
  if (row.call_done_at || row.status === 'call_done') return 'CALL DONE'
  return 'OPEN'
}

export function MaintenanceScreen({ initialSub = 'overview', filter }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [machine, setMachine] = useState<string>(filter && MACHINES.includes(filter as (typeof MACHINES)[number]) ? filter : MACHINES[0])
  const [priority, setPriority] = useState('Med')
  const [faultType, setFaultType] = useState<string>(FAULT_TYPES[0])
  const [problem, setProblem] = useState('')
  const [itemNeeded, setItemNeeded] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [cost, setCost] = useState('0')

  const [itemName, setItemName] = useState('')
  const [forWhat, setForWhat] = useState<'Machine' | 'Utility'>('Machine')
  const [vendor, setVendor] = useState('')
  const [dateOut, setDateOut] = useState(todayISO())
  const [gatepassNo, setGatepassNo] = useState('')
  const [trackers, setTrackers] = useState<RepairingTracker[]>([])
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [filterMachine, setFilterMachine] = useState<string>(filter || 'ALL')

  const load = useCallback(async () => {
    const [tr, req] = await Promise.all([
      supabase.from('repairing_tracker').select('*').order('created_at', { ascending: false }).limit(60),
      supabase.from('maintenance_requests').select('*').order('created_at', { ascending: false }).limit(120),
    ])
    if (tr.error) throw tr.error
    if (req.error) throw req.error
    setTrackers((tr.data as RepairingTracker[]) ?? [])
    setRequests((req.data as MaintenanceRequest[]) ?? [])
    const next = nextDocNo(
      'GP-',
      (tr.data ?? []).map((r) => r.gatepass_no),
    )
    setGatepassNo(next)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  useEffect(() => {
    if (filter && MACHINES.includes(filter as (typeof MACHINES)[number])) {
      setMachine(filter)
      setFilterMachine(filter)
    }
  }, [filter])

  const openByMachine = useMemo(() => {
    const map = new Map<string, MaintenanceRequest[]>()
    for (const m of MACHINES) map.set(m, [])
    for (const r of requests) {
      if (statusLabel(r) === 'RESOLVED') continue
      const list = map.get(r.machine_no) || []
      list.push(r)
      map.set(r.machine_no, list)
    }
    return map
  }, [requests])

  const historyRows = useMemo(() => {
    const rows = filterMachine === 'ALL' ? requests : requests.filter((r) => r.machine_no === filterMachine)
    return rows
  }, [requests, filterMachine])

  function requestText() {
    return `Machine Maintenance\nMachine ${machine} · ${faultType} · Priority ${priority}\nProblem: ${problem}\nParts: ${itemNeeded}\nContact: ${contactName} ${contactPhone}\nAssigned: ${assignedTo}`
  }

  async function saveRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let photo_url: string | null = null
      if (photo) photo_url = await uploadFactoryPhoto(photo, 'maintenance')
      const opened = nowIso()
      const payload = {
        machine_no: machine,
        priority,
        problem: problem || null,
        item_needed: itemNeeded || null,
        photo_url,
        assigned_to: assignedTo || null,
        status: 'open',
        cost: Number(cost) || 0,
        fault_type: faultType,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        opened_at: opened,
        call_done_at: null,
        arrived_at: null,
        work_started_at: null,
        resolved_at: null,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maintenance_requests',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('maintenance_requests').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Breakdown opened' : 'Sent to approval queue')
      setProblem('')
      setItemNeeded('')
      setContactName('')
      setContactPhone('')
      setPhoto(null)
      await load()
      setSub('overview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function advanceFlow(row: MaintenanceRequest, nextStatus: (typeof FLOW_STEPS)[number]['key']) {
    if (!profile) return
    const step = FLOW_STEPS.find((s) => s.key === nextStatus)
    if (!step) return
    setBusy(true)
    setError(null)
    try {
      const payload: Record<string, string> = {
        status: nextStatus,
        [step.field]: nowIso(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maintenance_requests',
        action: 'update',
        recordId: row.id,
        payload,
        apply: async () => {
          const { error: uErr } = await supabase.from('maintenance_requests').update(payload).eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      setMessage(result === 'applied' ? `Status → ${step.label}` : 'Sent to approval queue')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function savePartsPayment(row: MaintenanceRequest) {
    if (!profile) return
    const parts = window.prompt('Parts changed', row.parts_changed || '')
    if (parts == null) return
    const payRaw = window.prompt('Payment amount (₹)', String(row.payment_amount ?? row.cost ?? 0))
    if (payRaw == null) return
    const notes = window.prompt('Payment notes', row.payment_notes || '') ?? ''
    setBusy(true)
    try {
      const payload = {
        parts_changed: parts,
        payment_amount: Number(payRaw) || 0,
        payment_notes: notes || null,
        cost: Number(payRaw) || row.cost,
      }
      await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maintenance_requests',
        action: 'update',
        recordId: row.id,
        payload,
        apply: async () => {
          const { error: uErr } = await supabase.from('maintenance_requests').update(payload).eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      setMessage('Parts / payment saved')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveRepairOut(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        item_name: itemName.trim(),
        for_what: forWhat,
        vendor: vendor.trim() || null,
        gatepass_no: gatepassNo,
        date_out: dateOut,
        date_in: null,
        status: 'out',
        cost: 0,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'repairing_tracker',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('repairing_tracker').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Repair OUT saved' : 'Sent to approval queue')
      setItemName('')
      setVendor('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function markReturned(row: RepairingTracker) {
    if (!profile) return
    const dateIn = window.prompt('Date In (YYYY-MM-DD)', todayISO())
    if (!dateIn) return
    setBusy(true)
    setError(null)
    try {
      const payload = { date_in: dateIn, status: 'returned' }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'repairing_tracker',
        action: 'update',
        recordId: row.id,
        payload,
        apply: async () => {
          const { error: uErr } = await supabase.from('repairing_tracker').update(payload).eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      setMessage(result === 'applied' ? 'Marked returned' : 'Sent to approval queue')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  function nextAction(row: MaintenanceRequest): (typeof FLOW_STEPS)[number]['key'] | null {
    const cur = statusLabel(row)
    const idx = FLOW_STEPS.findIndex((s) => s.label === cur)
    if (idx < 0 || idx >= FLOW_STEPS.length - 1) return null
    return FLOW_STEPS[idx + 1].key
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Machine-wise Maintenance</h1>
          <p className="text-muted">M1–M6 · Breakdown flow with timestamps · Service history</p>
        </div>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'overview', label: 'Overview' },
            { id: 'request', label: 'Breakdown' },
            { id: 'repair', label: 'Repair Out/In' },
            { id: 'history', label: 'History' },
          ]}
        />
      </header>

      {sub === 'overview' ? (
        <>
          <section className="kpi-grid kpi-grid-6">
            {MACHINES.map((m) => {
              const open = openByMachine.get(m) || []
              const latest = open[0]
              return (
                <button
                  key={m}
                  type="button"
                  className={`kpi-card surface ${open.length ? 'kpi-tone-alerts' : 'kpi-tone-greige'}`}
                  onClick={() => {
                    setFilterMachine(m)
                    setMachine(m)
                    setSub(open.length ? 'history' : 'request')
                  }}
                >
                  <span className="text-muted">{m}</span>
                  <strong className="num">{open.length ? `${open.length} open` : 'OK'}</strong>
                  <span className="text-muted2">
                    {latest ? `${latest.fault_type || 'Breakdown'} · ${statusLabel(latest)}` : 'No open ticket'}
                  </span>
                </button>
              )
            })}
          </section>

          <h2 className="section-title">Open Breakdowns</h2>
          <div className="list">
            {requests.filter((r) => statusLabel(r) !== 'RESOLVED').length === 0 ? (
              <p className="text-sage">No open breakdowns</p>
            ) : (
              requests
                .filter((r) => statusLabel(r) !== 'RESOLVED')
                .map((r) => {
                  const next = nextAction(r)
                  return (
                    <article key={r.id} className="card-row surface row-top">
                      <div>
                        <strong>
                          {r.machine_no} · {r.fault_type || 'Breakdown'}
                        </strong>
                        <div className="text-muted">{r.problem || '—'}</div>
                        <div className="text-muted2">
                          {statusLabel(r)} · Contact {r.contact_name || '—'} {r.contact_phone || ''} · Assigned{' '}
                          {r.assigned_to || '—'}
                        </div>
                        <div className="text-muted2" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                          {FLOW_STEPS.map((s) => (
                            <span key={s.key} className={r[s.field] || (s.key === 'open' && r.created_at) ? 'text-sage' : ''}>
                              {s.label}
                              {r[s.field] ? ` ${new Date(r[s.field]!).toLocaleString('en-GB')}` : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="icon-actions">
                        {next ? (
                          <button type="button" className="primary-save" disabled={busy} onClick={() => void advanceFlow(r, next)}>
                            {FLOW_STEPS.find((s) => s.key === next)?.label}
                          </button>
                        ) : null}
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void savePartsPayment(r)}>
                          Parts / Pay
                        </button>
                      </div>
                    </article>
                  )
                })
            )}
          </div>
        </>
      ) : null}

      {sub === 'request' ? (
        <form className="form-stack" onSubmit={(e) => void saveRequest(e)}>
          <label className="field">
            <span className="text-muted">Machine</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Fault / Complaint Type</span>
            <select value={faultType} onChange={(e) => setFaultType(e.target.value)}>
              {FAULT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option>High</option>
              <option>Med</option>
              <option>Low</option>
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Problem</span>
            <input value={problem} onChange={(e) => setProblem(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Parts / Item Needed</span>
            <input value={itemNeeded} onChange={(e) => setItemNeeded(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Technician / Contact Name</span>
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Contact Phone</span>
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Photo</span>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field">
            <span className="text-muted">Assigned To</span>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Est. Cost (₹)</span>
            <input className="num" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
          <ShareActions
            onWhatsApp={() => shareWhatsApp(requestText())}
            onPrint={() =>
              printSummary(
                'Machine Breakdown',
                rowsToHtml([
                  ['Machine', machine],
                  ['Type', faultType],
                  ['Priority', priority],
                  ['Problem', problem],
                  ['Parts', itemNeeded],
                  ['Contact', `${contactName} ${contactPhone}`],
                  ['Assigned', assignedTo],
                ]),
              )
            }
          />
          <button type="submit" className="primary-save" disabled={busy}>
            Open Breakdown
          </button>
        </form>
      ) : null}

      {sub === 'repair' ? (
        <>
          <form className="form-stack" onSubmit={(e) => void saveRepairOut(e)}>
            <label className="field">
              <span className="text-muted">Item</span>
              <input value={itemName} onChange={(e) => setItemName(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Kis Liye</span>
              <select value={forWhat} onChange={(e) => setForWhat(e.target.value as 'Machine' | 'Utility')}>
                <option value="Machine">Machine</option>
                <option value="Utility">Utility</option>
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Kisko Gaya</span>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Date Out</span>
              <input type="date" value={dateOut} onChange={(e) => setDateOut(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Gatepass No</span>
              <input value={gatepassNo} onChange={(e) => setGatepassNo(e.target.value)} required />
            </label>
            <ShareActions
              onWhatsApp={() =>
                shareWhatsApp(
                  `Repair OUT ${gatepassNo}\nItem ${itemName}\nFor ${forWhat}\nVendor ${vendor}\nOut ${dateOut}`,
                )
              }
              onPrint={() =>
                printSummary(
                  `Gatepass ${gatepassNo}`,
                  rowsToHtml([
                    ['Item', itemName],
                    ['For', forWhat],
                    ['Vendor', vendor],
                    ['Date Out', dateOut],
                    ['Date In', ''],
                  ]),
                )
              }
            />
            <button type="submit" className="primary-save" disabled={busy}>
              Save OUT
            </button>
          </form>

          <h2 className="section-title">Tracker</h2>
          <div className="list">
            {trackers.map((t) => (
              <article key={t.id} className="card-row surface row-top">
                <div>
                  <strong>{t.item_name}</strong>
                  <div className="text-muted">
                    {t.gatepass_no} · {t.for_what} · {t.vendor ?? '—'} · {t.status}
                  </div>
                  <div className="text-muted2">
                    Out {t.date_out} · In {t.date_in ?? '—'}
                  </div>
                </div>
                {t.status === 'out' ? (
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void markReturned(t)}>
                    Date In
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {sub === 'history' ? (
        <>
          <div className="form-stack surface card-row" style={{ marginBottom: 12 }}>
            <label className="field">
              <span className="text-muted">Machine filter</span>
              <select value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)}>
                <option value="ALL">All machines</option>
                {MACHINES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <ShareActions
              onPrint={() =>
                printSummary(
                  `Machine Service History · ${filterMachine}`,
                  `<table><thead><tr><th>Machine</th><th>Type</th><th>Status</th><th>Problem</th><th>Pay</th><th>Parts</th></tr></thead><tbody>${historyRows
                    .map(
                      (r) =>
                        `<tr><td>${r.machine_no}</td><td>${r.fault_type || '—'}</td><td>${statusLabel(r)}</td><td>${r.problem || '—'}</td><td>${r.payment_amount ?? r.cost ?? 0}</td><td>${r.parts_changed || '—'}</td></tr>`,
                    )
                    .join('')}</tbody></table>`,
                )
              }
            />
          </div>
          <div className="list">
            {historyRows.length === 0 ? (
              <p className="text-muted">No Data</p>
            ) : (
              historyRows.map((r) => (
                <article key={r.id} className="card-row surface">
                  <strong>
                    {r.machine_no} · {r.fault_type || 'Breakdown'} · {statusLabel(r)}
                  </strong>
                  <div className="text-muted">{r.problem || '—'}</div>
                  <div className="text-muted2">
                    Opened {r.opened_at || r.created_at}
                    {r.resolved_at ? ` · Resolved ${r.resolved_at}` : ''}
                    {r.parts_changed ? ` · Parts ${r.parts_changed}` : ''}
                    {r.payment_amount != null ? ` · Pay ₹${r.payment_amount}` : ''}
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
