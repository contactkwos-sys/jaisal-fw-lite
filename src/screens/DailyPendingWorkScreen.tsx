/**
 * Daily Pending Work (Factory) — machine checklist, general work, WhatsApp, reports
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { YarnSearchSelect } from '../components/YarnSearchSelect'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  FACTORY_MACHINES,
  MACHINE_STATUSES,
  PRIORITIES,
  WORK_STATUSES,
  addCommHistory,
  buildWhatsAppMessage,
  carryForwardWork,
  completeWork,
  computeKpis,
  loadAllCommHistory,
  loadAllWorks,
  loadAssignableContacts,
  loadCarryForwardWorks,
  loadCommHistory,
  loadCommonProblems,
  loadWorksForDate,
  machineLabelOnly,
  printWorkReport,
  priorityBadgeClass,
  saveWork,
  sendWorkWhatsApp,
  statusBadgeClass,
  todayISO,
  addDaysISO,
  type AssignableContact,
  type DpwCommHistory,
  type DpwCommonProblem,
  type DpwWork,
} from '../lib/dailyPendingWork'
import { supabase } from '../lib/supabase'

type TabId = 'today' | 'all' | 'carry' | 'reports'
type MachineRow = {
  machine_no: string
  machine_name: string
  machine_label: string
  work?: DpwWork | null
  machine_status: string
  work_description: string
  priority: string
  assigned_to: string
  contact_id: string
  contact_source: string
  contact_name: string
  contact_phone: string
  contact_phone_business: string
  status: string
  remarks: string
  work_id?: string
  db_id?: string
}

type Props = {
  initialTab?: TabId
  onTabChange?: (tab: TabId) => void
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'today', label: "Today's Work" },
  { id: 'all', label: 'All Daily Works' },
  { id: 'carry', label: 'Carry Forward' },
  { id: 'reports', label: 'Work Reports' },
]

function isDpwWork(row: MachineRow | DpwWork): row is DpwWork {
  return 'work_category' in row
}

function workDbId(row: MachineRow | DpwWork): string | undefined {
  if (isDpwWork(row)) return row.id
  return row.db_id
}

function emptyMachineRow(m: (typeof FACTORY_MACHINES)[number]): MachineRow {
  return {
    machine_no: m.code,
    machine_name: m.name,
    machine_label: m.label,
    machine_status: 'Running OK',
    work_description: '',
    priority: 'Medium',
    assigned_to: '',
    contact_id: '',
    contact_source: '',
    contact_name: '',
    contact_phone: '',
    contact_phone_business: '',
    status: 'Pending',
    remarks: '',
  }
}

export function DailyPendingWorkScreen({ initialTab = 'today', onTabChange }: Props) {
  const { profile } = useAuth()
  const userName = profile?.full_name || profile?.roles?.role_name || 'User'

  const [tab, setTab] = useState<TabId>(initialTab)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tablesReady, setTablesReady] = useState(true)

  const [works, setWorks] = useState<DpwWork[]>([])
  const [generalWorks, setGeneralWorks] = useState<DpwWork[]>([])
  const [machineRows, setMachineRows] = useState<MachineRow[]>(FACTORY_MACHINES.map(emptyMachineRow))
  const [contacts, setContacts] = useState<AssignableContact[]>([])
  const [problems, setProblems] = useState<DpwCommonProblem[]>([])
  const [allWorks, setAllWorks] = useState<DpwWork[]>([])
  const [carryWorks, setCarryWorks] = useState<DpwWork[]>([])
  const [commHistory, setCommHistory] = useState<DpwCommHistory[]>([])
  const [historyWorkId, setHistoryWorkId] = useState<string | null>(null)
  const [showAddGeneral, setShowAddGeneral] = useState(false)

  const [genDesc, setGenDesc] = useState('')
  const [genArea, setGenArea] = useState('')
  const [genPriority, setGenPriority] = useState('Medium')
  const [genAssigned, setGenAssigned] = useState('')
  const [genRemarks, setGenRemarks] = useState('')

  const [filters, setFilters] = useState({ search: '', machine: '', status: '', priority: '', assigned: '', dateFrom: '', dateTo: '' })

  function selectTab(t: TabId) {
    setTab(t)
    onTabChange?.(t)
  }

  const reload = useCallback(async () => {
    try {
      const [dayWorks, cts, probs, all, carry, comm] = await Promise.all([
        loadWorksForDate(supabase, selectedDate),
        loadAssignableContacts(supabase),
        loadCommonProblems(supabase),
        loadAllWorks(supabase, filters),
        loadCarryForwardWorks(supabase),
        loadAllCommHistory(supabase),
      ])
      setWorks(dayWorks)
      setContacts(cts)
      setProblems(probs)
      setAllWorks(all)
      setCarryWorks(carry)
      setCommHistory(comm)
      setTablesReady(true)

      const machineWorks = dayWorks.filter((w) => w.work_category === 'machine')
      const general = dayWorks.filter((w) => w.work_category === 'general')
      setGeneralWorks(general)

      setMachineRows(
        FACTORY_MACHINES.map((m) => {
          const existing = machineWorks.find((w) => w.machine_no === m.code)
          if (existing) {
            return {
              machine_no: m.code,
              machine_name: existing.machine_name || m.name,
              machine_label: m.label,
              work: existing,
              machine_status: existing.machine_status || 'Running OK',
              work_description: existing.work_description || '',
              priority: existing.priority || 'Medium',
              assigned_to: existing.assigned_to || '',
              contact_id: existing.contact_id || '',
              contact_source: existing.contact_source || '',
              contact_name: existing.contact_name || '',
              contact_phone: existing.contact_phone || '',
              contact_phone_business: existing.contact_phone_business || '',
              status: existing.status,
              remarks: existing.remarks || '',
              work_id: existing.work_id,
              db_id: existing.id,
            }
          }
          return emptyMachineRow(m)
        }),
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Load failed'
      if (/relation .* does not exist/i.test(msg)) {
        setTablesReady(false)
        setError('Daily Pending Work tables not applied. Run public/migration-daily-pending-work.sql in Supabase.')
      } else setError(msg)
    }
  }, [selectedDate, filters])

  useEffect(() => {
    void reload()
  }, [reload])

  const kpis = useMemo(() => computeKpis(works), [works])
  const problemOptions = problems.map((p) => p.problem_text)
  const contactOptions = contacts.map((c) => c.name)

  function updateMachineRow(idx: number, patch: Partial<MachineRow>) {
    setMachineRows((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      if (patch.assigned_to) {
        const c = contacts.find((x) => x.name === patch.assigned_to)
        if (c) {
          next[idx].contact_id = c.id
          next[idx].contact_source = c.source
          next[idx].contact_name = c.name
          next[idx].contact_phone = c.phone || ''
          next[idx].contact_phone_business = c.phoneBusiness || ''
        }
      }
      return next
    })
  }

  async function saveMachineRows() {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      for (const row of machineRows) {
        const needsSave =
          row.machine_status !== 'Running OK' ||
          row.work_description.trim() ||
          row.assigned_to.trim() ||
          row.db_id
        if (!needsSave) continue
        const workStatus =
          row.machine_status === 'Running OK' && !row.work_description.trim()
            ? 'Completed'
            : row.status || 'Pending'
        await saveWork(supabase, {
          id: row.db_id,
          work_category: 'machine',
          work_date: selectedDate,
          machine_no: row.machine_no,
          machine_name: row.machine_name,
          machine_status: row.machine_status,
          work_description: row.work_description,
          status: workStatus,
          priority: row.priority,
          assigned_to: row.assigned_to,
          contact_id: row.contact_id || null,
          contact_source: row.contact_source || null,
          contact_name: row.contact_name || null,
          contact_phone: row.contact_phone || null,
          contact_phone_business: row.contact_phone_business || null,
          remarks: row.remarks,
          created_by: userName,
        })
      }
      setMessage('Work saved successfully.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveGeneralWork() {
    if (!genDesc.trim()) {
      setError('Work description required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveWork(supabase, {
        work_category: 'general',
        work_date: selectedDate,
        work_time: new Date().toTimeString().slice(0, 8),
        area: genArea,
        work_description: genDesc,
        status: 'Pending',
        priority: genPriority,
        assigned_to: genAssigned,
        remarks: genRemarks,
        created_by: userName,
      })
      setGenDesc('')
      setGenArea('')
      setGenRemarks('')
      setShowAddGeneral(false)
      setMessage('Work saved successfully.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleWhatsApp(row: MachineRow | DpwWork, business = false) {
    const work: DpwWork = isDpwWork(row)
      ? row
      : ({
          work_id: row.work_id || '—',
          machine_no: row.machine_no,
          machine_name: row.machine_name,
          work_description: row.work_description,
          priority: row.priority,
          contact_phone: row.contact_phone,
          contact_phone_business: row.contact_phone_business,
          area: null,
        } as DpwWork)
    sendWorkWhatsApp(work, business)
    const id = workDbId(row)
    if (id) {
      await addCommHistory(supabase, id, business ? 'WhatsApp Business Sent' : 'WhatsApp Sent', userName, 'WhatsApp', buildWhatsAppMessage(work))
    }
    setMessage(business ? 'Opened WhatsApp Business' : 'Opened WhatsApp')
  }

  async function handleComplete(work: DpwWork) {
    setBusy(true)
    try {
      await completeWork(supabase, work, userName)
      setMessage('Work marked completed.')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCarryForward(work: DpwWork) {
    setBusy(true)
    try {
      await carryForwardWork(supabase, work, addDaysISO(selectedDate, 1), userName)
      setMessage(`Carried forward to ${addDaysISO(selectedDate, 1)}`)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  async function viewCommHistory(workId: string) {
    const h = await loadCommHistory(supabase, workId)
    setCommHistory(h)
    setHistoryWorkId(workId)
  }

  const todayOverview = useMemo(() => {
    return [...works].sort((a, b) => (a.work_time || '').localeCompare(b.work_time || ''))
  }, [works])

  return (
    <div className="screen dpw-screen" data-screen="daily-pending-work">
      <header className="screen-header dpw-header">
        <div>
          <p className="yarn-crumb">Factory · <strong>Daily Pending Work</strong></p>
          <h1>Daily Pending Work (Factory)</h1>
          <p className="text-muted">Machine status · factory work · WhatsApp · carry forward</p>
        </div>
        <div className="dpw-header-actions">
          <label className="field dpw-date-field">
            <span className="text-muted">Date</span>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          <button type="button" className="btn-warp dpw-add-btn" onClick={() => setShowAddGeneral(true)}>
            + Add New Work
          </button>
        </div>
      </header>

      <SubTabs options={TABS} value={tab} onChange={(id) => selectTab(id as TabId)} />

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      <div className="dpw-kpi-grid">
        <article className="dpw-kpi dpw-kpi-total"><span>Total Works</span><strong>{kpis.total}</strong></article>
        <article className="dpw-kpi dpw-kpi-pending"><span>Pending</span><strong>{kpis.pending}</strong></article>
        <article className="dpw-kpi dpw-kpi-progress"><span>In Progress</span><strong>{kpis.inProgress}</strong></article>
        <article className="dpw-kpi dpw-kpi-done"><span>Completed</span><strong>{kpis.completed}</strong></article>
        <article className="dpw-kpi dpw-kpi-carry"><span>Carry Forward</span><strong>{kpis.carryForward}</strong></article>
      </div>

      {tab === 'today' ? (
        <div className="dpw-today-layout">
          <section className="surface dpw-section">
            <h2 className="section-title">Machine Status &amp; Issues</h2>
            <div className="dpw-table-wrap dpw-machine-table-wrap">
              <table className="dpw-table dpw-table-desktop">
                <thead>
                  <tr>
                    <th>Machine No.</th>
                    <th>Machine Name</th>
                    <th>Status</th>
                    <th>Issue / Problem</th>
                    <th>Priority</th>
                    <th>Assigned To</th>
                    <th>Contact</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {machineRows.map((row, idx) => (
                    <tr key={row.machine_no}>
                      <td><strong>{row.machine_label}</strong></td>
                      <td>{row.machine_name}</td>
                      <td>
                        <select value={row.machine_status} onChange={(e) => updateMachineRow(idx, { machine_status: e.target.value })}>
                          {MACHINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <YarnSearchSelect
                          label=""
                          value={row.work_description}
                          options={problemOptions}
                          placeholder="Select or type problem…"
                          onChange={(v) => updateMachineRow(idx, { work_description: v })}
                        />
                      </td>
                      <td>
                        <select value={row.priority} onChange={(e) => updateMachineRow(idx, { priority: e.target.value })}>
                          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={row.assigned_to} onChange={(e) => updateMachineRow(idx, { assigned_to: e.target.value })}>
                          <option value="">—</option>
                          {contactOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="num">{row.contact_phone || '—'}</td>
                      <td className="dpw-actions-cell">
                        <button type="button" className="btn-wa-sm" title="WhatsApp" disabled={!row.contact_phone} onClick={() => void handleWhatsApp(row, false)}>WA</button>
                        <button type="button" className="btn-wa-biz-sm" title="WhatsApp Business" disabled={!row.contact_phone_business && !row.contact_phone} onClick={() => void handleWhatsApp(row, true)}>Biz</button>
                        {row.db_id ? (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => void viewCommHistory(row.db_id!)}>History</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="dpw-cards-mobile">
                {machineRows.map((row, idx) => (
                  <article key={row.machine_no} className="dpw-machine-card">
                    <header>
                      <strong>{row.machine_label}</strong>
                      <span>{row.machine_name}</span>
                    </header>
                    <label className="field">
                      <span>Status</span>
                      <select value={row.machine_status} onChange={(e) => updateMachineRow(idx, { machine_status: e.target.value })}>
                        {MACHINE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <YarnSearchSelect label="Issue / Problem" value={row.work_description} options={problemOptions} onChange={(v) => updateMachineRow(idx, { work_description: v })} />
                    <div className="dpw-card-row">
                      <label className="field"><span>Priority</span>
                        <select value={row.priority} onChange={(e) => updateMachineRow(idx, { priority: e.target.value })}>
                          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                      <label className="field"><span>Assigned</span>
                        <select value={row.assigned_to} onChange={(e) => updateMachineRow(idx, { assigned_to: e.target.value })}>
                          <option value="">—</option>
                          {contactOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="dpw-card-actions">
                      <button type="button" className="btn-wa" onClick={() => void handleWhatsApp(row, false)}>WhatsApp</button>
                      <button type="button" className="btn-wa-biz" onClick={() => void handleWhatsApp(row, true)}>WA Business</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <button type="button" className="btn-warp dpw-save-all" disabled={busy || !tablesReady} onClick={() => void saveMachineRows()}>
              {busy ? 'Saving…' : 'Save All Changes'}
            </button>
          </section>

          <div className="dpw-bottom-grid">
            <section className="surface dpw-section">
              <h2 className="section-title">Other Works (General)</h2>
              <div className="dpw-table-wrap">
                <table className="dpw-table">
                  <thead>
                    <tr><th>Work</th><th>Area</th><th>Priority</th><th>Assigned</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {generalWorks.map((w) => (
                      <tr key={w.id}>
                        <td>{w.work_description}</td>
                        <td>{w.area || '—'}</td>
                        <td><span className={priorityBadgeClass(w.priority || '')}>{w.priority}</span></td>
                        <td>{w.assigned_to || '—'}</td>
                        <td><span className={statusBadgeClass(w.status)}>{w.status}</span></td>
                        <td className="dpw-actions-cell">
                          <button type="button" className="btn-ghost btn-sm" onClick={() => void handleComplete(w)}>Done</button>
                          <button type="button" className="btn-ghost btn-sm" onClick={() => void handleCarryForward(w)}>Carry Fwd</button>
                        </td>
                      </tr>
                    ))}
                    {!generalWorks.length ? <tr><td colSpan={6} className="text-muted">No general works today</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="dpw-side-summary">
              <article className="surface dpw-side-panel">
                <h3 className="section-title">Summary for Today</h3>
                <ul className="dpw-summary-list">
                  <li><span>Total</span><strong>{kpis.total}</strong></li>
                  <li><span>Pending</span><strong>{kpis.pending}</strong></li>
                  <li><span>In Progress</span><strong>{kpis.inProgress}</strong></li>
                  <li><span>Completed</span><strong>{kpis.completed}</strong></li>
                  <li><span>Carry Forward</span><strong>{kpis.carryForward}</strong></li>
                </ul>
                <div className="dpw-tomorrow-carry">
                  <strong>Tomorrow Carry Forward</strong>
                  <p>{carryWorks.filter((w) => w.carry_forward_to_date === addDaysISO(selectedDate, 1)).length} items</p>
                </div>
              </article>
            </aside>
          </div>

          <section className="surface dpw-section">
            <h2 className="section-title">Today&apos;s Work Overview</h2>
            <div className="dpw-table-wrap">
              <table className="dpw-table">
                <thead>
                  <tr><th>Time</th><th>Work / Issue</th><th>Machine / Area</th><th>Assigned To</th><th>Priority</th><th>Status</th><th>Remarks</th></tr>
                </thead>
                <tbody>
                  {todayOverview.map((w) => (
                    <tr key={w.id}>
                      <td>{w.work_time?.slice(0, 5) || new Date(w.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{w.work_description || '—'}</td>
                      <td>{w.machine_no ? machineLabelOnly(w.machine_no) : w.area || '—'}</td>
                      <td>{w.assigned_to || '—'}</td>
                      <td><span className={priorityBadgeClass(w.priority || '')}>{w.priority}</span></td>
                      <td><span className={statusBadgeClass(w.status)}>{w.status}</span></td>
                      <td>{w.remarks || '—'}</td>
                    </tr>
                  ))}
                  {!todayOverview.length ? <tr><td colSpan={7} className="text-muted">No work recorded for this date</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'all' ? (
        <section className="surface dpw-section">
          <div className="dpw-filters">
            <input placeholder="Search…" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            <select value={filters.machine} onChange={(e) => setFilters((f) => ({ ...f, machine: e.target.value }))}>
              <option value="">All Machines</option>
              {FACTORY_MACHINES.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All Status</option>
              {WORK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            <button type="button" className="btn-ghost" onClick={() => void reload()}>Apply</button>
          </div>
          <div className="dpw-table-wrap">
            <table className="dpw-table">
              <thead>
                <tr><th>Work ID</th><th>Date</th><th>Type</th><th>Machine/Area</th><th>Description</th><th>Assigned</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {allWorks.map((w) => (
                  <tr key={w.id}>
                    <td><strong>{w.work_id}</strong></td>
                    <td>{w.work_date}{w.is_carry_forward ? ' ↪' : ''}</td>
                    <td>{w.work_category}</td>
                    <td>{w.machine_no ? machineLabelOnly(w.machine_no) : w.area || '—'}</td>
                    <td>{w.work_description || '—'}</td>
                    <td>{w.assigned_to || '—'}</td>
                    <td><span className={statusBadgeClass(w.status)}>{w.status}</span></td>
                    <td>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => void viewCommHistory(w.id)}>History</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => void handleComplete(w)}>Done</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'carry' ? (
        <section className="surface dpw-section">
          <h2 className="section-title">Carry Forward Works</h2>
          <div className="dpw-cards-mobile" style={{ display: 'flex' }}>
            {carryWorks.map((w) => (
              <article key={w.id} className="dpw-order-card">
                <strong>{w.work_id}</strong>
                <span>Original: {w.original_work_date || w.work_date}</span>
                <span>Forward to: {w.carry_forward_to_date || '—'}</span>
                <p>{w.work_description}</p>
                <span className={statusBadgeClass(w.status)}>{w.status}</span>
                <button type="button" className="btn-warp btn-sm" onClick={() => { setSelectedDate(w.carry_forward_to_date || todayISO()); selectTab('today') }}>Open</button>
              </article>
            ))}
            {!carryWorks.length ? <p className="text-muted">No carry forward items</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section className="dpw-section">
          <div className="dpw-report-actions">
            <button type="button" className="btn-warp" onClick={() => printWorkReport("Today's Work Overview", todayOverview)}>Print Daily Report</button>
            <button type="button" className="btn-ghost" onClick={() => printWorkReport('Machine-wise Issues', works.filter((w) => w.work_category === 'machine'))}>Machine Issues</button>
            <button type="button" className="btn-ghost" onClick={() => printWorkReport('Completed Work', works.filter((w) => w.status === 'Completed'))}>Completed</button>
            <button type="button" className="btn-ghost" onClick={() => printWorkReport('Carry Forward', carryWorks)}>Carry Forward</button>
          </div>
          <div className="dpw-report-grid">
            {[
              { label: 'Total Today', count: kpis.total },
              { label: 'Pending', count: kpis.pending },
              { label: 'Machine Issues', count: works.filter((w) => w.work_category === 'machine' && w.machine_status !== 'Running OK').length },
              { label: 'General Works', count: generalWorks.length },
              { label: 'WhatsApp Sent', count: commHistory.filter((c) => c.activity.includes('WhatsApp')).length },
              { label: 'Carry Forward', count: carryWorks.length },
            ].map((r) => (
              <article key={r.label} className="dpw-report-card surface">
                <span>{r.label}</span>
                <strong>{r.count}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {showAddGeneral ? (
        <div className="dpw-modal-backdrop" onClick={() => setShowAddGeneral(false)}>
          <div className="surface dpw-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add New Work</h2>
            <label className="field"><span>Work Description</span><input value={genDesc} onChange={(e) => setGenDesc(e.target.value)} required /></label>
            <label className="field"><span>Area</span><input value={genArea} onChange={(e) => setGenArea(e.target.value)} /></label>
            <label className="field"><span>Priority</span>
              <select value={genPriority} onChange={(e) => setGenPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <YarnSearchSelect label="Assigned To" value={genAssigned} options={contactOptions} onChange={setGenAssigned} />
            <label className="field"><span>Remarks</span><textarea value={genRemarks} onChange={(e) => setGenRemarks(e.target.value)} rows={2} /></label>
            <div className="dpw-modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setShowAddGeneral(false)}>Cancel</button>
              <button type="button" className="btn-warp" disabled={busy} onClick={() => void saveGeneralWork()}>Save Work</button>
            </div>
          </div>
        </div>
      ) : null}

      {historyWorkId ? (
        <div className="dpw-modal-backdrop" onClick={() => setHistoryWorkId(null)}>
          <div className="surface dpw-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Communication History</h2>
            <div className="dpw-history-list">
              {commHistory.map((h) => (
                <article key={h.id} className="dpw-history-item">
                  <time>{new Date(h.activity_at).toLocaleString('en-IN')}</time>
                  <strong>{h.activity}</strong>
                  <span>{h.person} · {h.communication_mode}</span>
                  {h.message ? <p>{h.message.slice(0, 200)}</p> : null}
                </article>
              ))}
              {!commHistory.length ? <p className="text-muted">No communication yet</p> : null}
            </div>
            <button type="button" className="btn-ghost" onClick={() => setHistoryWorkId(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
