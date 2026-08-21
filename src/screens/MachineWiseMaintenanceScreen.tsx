/**
 * Machine-wise Maintenance — unified JAISAL FW module
 * Overview · Breakdown · Complaints · Entry · Schedule · History · Spares · Contacts · Reports
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES } from '../lib/database.types'
import {
  BREAKDOWN_STATUSES,
  buildMachineOverview,
  callPhone,
  COMPLAINT_STATUSES,
  computeTimelineMinutes,
  CONTACT_CATEGORIES,
  csvDownload,
  deriveScheduleStatus,
  errMsg,
  FAULT_TYPES,
  filterBreakdowns,
  formatINR,
  formatMinutes,
  isLowStock,
  isMigrationError,
  machineLabel,
  MIGRATION_HINT,
  nowTimeHHMM,
  PAYMENT_MODES,
  PAYMENT_STATUSES,
  PRIORITIES,
  printMaintenanceReport,
  SHIFTS,
  spareBalance,
  statusBadgeClass,
  todayISO,
  whatsAppTo,
  type BreakdownPart,
  type MaintComplaint,
  type MaintContact,
  type MaintEntry,
  type MaintSchedule,
  type MaintSparePart,
  type MachineBreakdown,
  type ReportFilter,
} from '../lib/machineMaintenance'
import { applyOrQueue, uploadFactoryPhoto } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'
import '../styles/machine-maintenance.css'

export type MwmSub =
  | 'overview'
  | 'breakdown'
  | 'complaints'
  | 'entry'
  | 'schedule'
  | 'history'
  | 'spares'
  | 'contacts'
  | 'reports'
  | 'repair-legacy'

type Props = {
  initialSub?: string
  filter?: string
  onNavigate?: (t: NavTarget) => void
}

const SUBS: Array<{ id: MwmSub; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'complaints', label: 'Complaints' },
  { id: 'entry', label: 'Maint. Entry' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'history', label: 'History' },
  { id: 'spares', label: 'Spare Parts' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'reports', label: 'Reports' },
]

function normalizeSub(raw?: string): MwmSub {
  const map: Record<string, MwmSub> = {
    overview: 'overview',
    request: 'entry',
    entry: 'entry',
    repair: 'breakdown',
    breakdown: 'breakdown',
    complaints: 'complaints',
    complaint: 'complaints',
    schedule: 'schedule',
    'maint-schedule': 'schedule',
    history: 'history',
    'service-history': 'history',
    spares: 'spares',
    'spare-parts': 'spares',
    contacts: 'contacts',
    reports: 'reports',
    'maint-reports': 'reports',
    'repair-legacy': 'repair-legacy',
  }
  return map[raw || ''] || 'overview'
}

type PartDraft = { part_name: string; part_number: string; qty: string; amount: string; spare_part_id: string }

const emptyPart = (): PartDraft => ({
  part_name: '',
  part_number: '',
  qty: '1',
  amount: '0',
  spare_part_id: '',
})

export function MachineWiseMaintenanceScreen({ initialSub, filter, onNavigate }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<MwmSub>(normalizeSub(initialSub))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [migrationHint, setMigrationHint] = useState(false)

  const [breakdowns, setBreakdowns] = useState<MachineBreakdown[]>([])
  const [partsByBreakdown, setPartsByBreakdown] = useState<Record<string, BreakdownPart[]>>({})
  const [contacts, setContacts] = useState<MaintContact[]>([])
  const [complaints, setComplaints] = useState<MaintComplaint[]>([])
  const [entries, setEntries] = useState<MaintEntry[]>([])
  const [schedules, setSchedules] = useState<MaintSchedule[]>([])
  const [spares, setSpares] = useState<MaintSparePart[]>([])

  const [selectedMachine, setSelectedMachine] = useState<string>(filter && MACHINES.includes(filter as typeof MACHINES[number]) ? filter : '')
  const [activeBreakdownId, setActiveBreakdownId] = useState<string | null>(null)

  // Breakdown form
  const [bdDate, setBdDate] = useState(todayISO())
  const [bdTime, setBdTime] = useState(nowTimeHHMM())
  const [bdMachine, setBdMachine] = useState<string>(MACHINES[0])
  const [bdShift, setBdShift] = useState('Day')
  const [bdFault, setBdFault] = useState<string>(FAULT_TYPES[0])
  const [bdSubFault, setBdSubFault] = useState('')
  const [bdPriority, setBdPriority] = useState('Medium')
  const [bdDesc, setBdDesc] = useState('')
  const [bdContactId, setBdContactId] = useState('')
  const [bdParts, setBdParts] = useState<PartDraft[]>([emptyPart()])
  const [bdDoneBy, setBdDoneBy] = useState('')
  const [bdWork, setBdWork] = useState('')
  const [bdRoot, setBdRoot] = useState('')
  const [bdAction, setBdAction] = useState('')
  const [bdRemarks, setBdRemarks] = useState('')
  const [bdLabour, setBdLabour] = useState('0')
  const [bdPartsCharges, setBdPartsCharges] = useState('0')
  const [bdOtherCharges, setBdOtherCharges] = useState('0')
  const [bdPayMode, setBdPayMode] = useState('Cash')
  const [bdPayStatus, setBdPayStatus] = useState('Pending')
  const [bdPayDate, setBdPayDate] = useState(todayISO())
  const [bdPayRemarks, setBdPayRemarks] = useState('')

  // Contact form
  const [cName, setCName] = useState('')
  const [cCat, setCCat] = useState('Electrical')
  const [cMob1, setCMob1] = useState('')
  const [cMob2, setCMob2] = useState('')
  const [cCompany, setCCompany] = useState('')
  const [cRemarks, setCRemarks] = useState('')
  const [cActive, setCActive] = useState(true)
  const [editContactId, setEditContactId] = useState<string | null>(null)

  // Complaint form
  const [cpDate, setCpDate] = useState(todayISO())
  const [cpMachine, setCpMachine] = useState<string>(MACHINES[0])
  const [cpText, setCpText] = useState('')
  const [cpBy, setCpBy] = useState('')
  const [cpPriority, setCpPriority] = useState('Medium')
  const [cpAssigned, setCpAssigned] = useState('')
  const [cpStatus, setCpStatus] = useState('Open')
  const [cpResolution, setCpResolution] = useState('')
  const [cpResolved, setCpResolved] = useState('')
  const [cpRemarks, setCpRemarks] = useState('')

  // Maintenance entry
  const [meMachine, setMeMachine] = useState<string>(MACHINES[0])
  const [meDate, setMeDate] = useState(todayISO())
  const [meType, setMeType] = useState('Preventive')
  const [meWork, setMeWork] = useState('')
  const [meTech, setMeTech] = useState('')
  const [meParts, setMeParts] = useState('')
  const [meCost, setMeCost] = useState('0')
  const [meNext, setMeNext] = useState('')
  const [meRemarks, setMeRemarks] = useState('')
  const [mePhoto, setMePhoto] = useState<File | null>(null)
  const [mePriority, setMePriority] = useState('Med')

  // Schedule form
  const [scMachine, setScMachine] = useState<string>(MACHINES[0])
  const [scType, setScType] = useState('Preventive')
  const [scLast, setScLast] = useState('')
  const [scNext, setScNext] = useState(todayISO())
  const [scPerson, setScPerson] = useState('')
  const [scRemarks, setScRemarks] = useState('')

  // Spare form
  const [spName, setSpName] = useState('')
  const [spNumber, setSpNumber] = useState('')
  const [spMachine, setSpMachine] = useState('')
  const [spOpen, setSpOpen] = useState('0')
  const [spRecv, setSpRecv] = useState('0')
  const [spUsed, setSpUsed] = useState('0')
  const [spMin, setSpMin] = useState('0')
  const [spRate, setSpRate] = useState('0')
  const [spSupplier, setSpSupplier] = useState('')
  const [editSpareId, setEditSpareId] = useState<string | null>(null)

  // Filters
  const [histFilter, setHistFilter] = useState<ReportFilter>({
    dateFrom: '',
    dateTo: '',
    machine: '',
    faultType: '',
    status: '',
  })
  const [histSearch, setHistSearch] = useState('')
  const [reportType, setReportType] = useState('machine-wise')
  const [repFilter, setRepFilter] = useState<ReportFilter>({
    dateFrom: todayISO().slice(0, 8) + '01',
    dateTo: todayISO(),
    machine: '',
    faultType: '',
    status: '',
  })

  useEffect(() => {
    setSub(normalizeSub(initialSub))
  }, [initialSub])

  useEffect(() => {
    if (filter && MACHINES.includes(filter as (typeof MACHINES)[number])) {
      setSelectedMachine(filter)
      setSub('history')
      setHistFilter((f) => ({ ...f, machine: filter }))
    }
  }, [filter])

  const flash = (ok: string | null, err: string | null = null) => {
    setMessage(ok)
    setError(err)
    if (err && isMigrationError(err)) setMigrationHint(true)
  }

  const loadAll = useCallback(async () => {
    setError(null)
    const results = await Promise.all([
      supabase.from('machine_breakdowns').select('*').order('breakdown_at', { ascending: false }).limit(500),
      supabase.from('maint_contacts').select('*').order('contact_name'),
      supabase.from('maint_complaints').select('*').order('complaint_date', { ascending: false }).limit(300),
      supabase.from('maintenance_requests').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('maint_schedules').select('*').order('next_due'),
      supabase.from('maint_spare_parts').select('*').order('part_name'),
      supabase.from('machine_breakdown_parts').select('*').order('created_at', { ascending: false }).limit(1000),
    ])

    const firstErr = results.find((r) => r.error)?.error
    if (firstErr) {
      const msg = firstErr.message
      flash(null, msg)
      if (isMigrationError(msg)) setMigrationHint(true)
    }

    setBreakdowns((results[0].data as MachineBreakdown[]) ?? [])
    setContacts((results[1].data as MaintContact[]) ?? [])
    setComplaints((results[2].data as MaintComplaint[]) ?? [])
    setEntries((results[3].data as MaintEntry[]) ?? [])
    const sched = ((results[4].data as MaintSchedule[]) ?? []).map((s) => ({
      ...s,
      status: deriveScheduleStatus(s.next_due, s.status),
    }))
    setSchedules(sched)
    setSpares((results[5].data as MaintSparePart[]) ?? [])

    const partsMap: Record<string, BreakdownPart[]> = {}
    for (const p of (results[6].data as BreakdownPart[]) ?? []) {
      ;(partsMap[p.breakdown_id] ||= []).push(p)
    }
    setPartsByBreakdown(partsMap)
  }, [])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const activeContacts = useMemo(() => contacts.filter((c) => c.is_active), [contacts])
  const selectedContact = activeContacts.find((c) => c.id === bdContactId) || null
  const activeBreakdown = breakdowns.find((b) => b.id === activeBreakdownId) || null

  const overview = useMemo(
    () => buildMachineOverview(MACHINES, breakdowns, entries, complaints, schedules),
    [breakdowns, entries, complaints, schedules],
  )

  const today = todayISO()
  const kpis = useMemo(() => {
    const todayBd = breakdowns.filter((b) => b.breakdown_date === today)
    const pending = breakdowns.filter((b) => b.status !== 'RESOLVED')
    const resolved = breakdowns.filter((b) => b.status === 'RESOLVED' && b.resolved_at?.slice(0, 10) === today)
    const downtime = pending.reduce((s, b) => {
      if (b.downtime_minutes != null) return s + Number(b.downtime_minutes)
      return s + (computeTimelineMinutes(b).downtime_minutes || 0)
    }, 0)
    const cost =
      breakdowns.reduce((s, b) => s + Number(b.total_amount || 0), 0) +
      entries.reduce((s, e) => s + Number(e.cost || 0), 0)
    return {
      todayCount: todayBd.length,
      pending: pending.length,
      resolvedToday: resolved.length,
      downtime,
      cost,
      underBd: overview.filter((o) => o.status === 'Breakdown').length,
      underMaint: overview.filter((o) => o.status === 'Under Maintenance').length,
      running: overview.filter((o) => o.status === 'Running').length,
    }
  }, [breakdowns, entries, overview, today])

  const historyRows = useMemo(() => {
    let rows = filterBreakdowns(breakdowns, histFilter, histSearch)
    if (selectedMachine) rows = rows.filter((r) => r.machine_no === selectedMachine)
    return rows
  }, [breakdowns, histFilter, histSearch, selectedMachine])

  const serviceHistory = useMemo(() => {
    const fromBd = breakdowns.map((b) => ({
      id: `bd-${b.id}`,
      date: b.breakdown_date,
      machine_no: b.machine_no,
      problem: b.sub_fault || b.description || b.fault_type,
      work: b.work_performed || b.action_taken || '—',
      parts: (partsByBreakdown[b.id] || []).map((p) => p.part_name).join(', ') || '—',
      technician: b.done_by || b.contact_name || '—',
      cost: Number(b.total_amount || 0),
      downtime: formatMinutes(b.downtime_minutes),
      status: b.status,
      source: 'Breakdown' as const,
    }))
    const fromMe = entries.map((e) => ({
      id: `me-${e.id}`,
      date: e.entry_date || e.created_at.slice(0, 10),
      machine_no: e.machine_no,
      problem: e.problem || e.maintenance_type || 'Maintenance',
      work: e.work_details || e.problem || '—',
      parts: e.parts_used || e.item_needed || '—',
      technician: e.technician || e.assigned_to || '—',
      cost: Number(e.cost || 0),
      downtime: '—',
      status: e.status,
      source: 'Maintenance' as const,
    }))
    return [...fromBd, ...fromMe].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [breakdowns, entries, partsByBreakdown])

  async function saveContact(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !cName.trim()) return
    setBusy(true)
    flash(null)
    try {
      const payload = {
        contact_name: cName.trim(),
        category: cCat,
        mobile1: cMob1.trim() || null,
        mobile2: cMob2.trim() || null,
        company: cCompany.trim() || null,
        remarks: cRemarks.trim() || null,
        is_active: cActive,
        updated_at: new Date().toISOString(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maint_contacts',
        action: editContactId ? 'update' : 'insert',
        recordId: editContactId,
        payload,
        apply: async () => {
          if (editContactId) {
            const { error: uErr } = await supabase.from('maint_contacts').update(payload).eq('id', editContactId)
            if (uErr) throw uErr
          } else {
            const { error: iErr } = await supabase.from('maint_contacts').insert(payload)
            if (iErr) throw iErr
          }
        },
      })
      flash(result === 'applied' ? (editContactId ? 'Contact updated' : 'Contact saved') : 'Sent to approval queue')
      setCName('')
      setCMob1('')
      setCMob2('')
      setCCompany('')
      setCRemarks('')
      setCActive(true)
      setEditContactId(null)
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveBreakdown(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    flash(null)
    try {
      const contact = activeContacts.find((c) => c.id === bdContactId)
      const breakdown_at = new Date(`${bdDate}T${bdTime.length === 5 ? bdTime + ':00' : bdTime}`).toISOString()
      const payload = {
        machine_no: bdMachine,
        breakdown_date: bdDate,
        breakdown_time: bdTime.length === 5 ? bdTime + ':00' : bdTime,
        shift: bdShift,
        fault_type: bdFault,
        sub_fault: bdSubFault.trim() || null,
        priority: bdPriority,
        description: bdDesc.trim() || null,
        contact_id: bdContactId || null,
        contact_name: contact?.contact_name || null,
        contact_mobile1: contact?.mobile1 || null,
        contact_mobile2: contact?.mobile2 || null,
        status: 'OPEN',
        breakdown_at,
        payment_status: 'Pending',
        updated_at: new Date().toISOString(),
      }
      let newId: string | null = null
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'machine_breakdowns',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { data, error: iErr } = await supabase.from('machine_breakdowns').insert(payload).select('id').single()
          if (iErr) throw iErr
          newId = data.id
        },
      })
      flash(result === 'applied' ? 'Breakdown saved — status OPEN' : 'Sent to approval queue')
      if (newId) setActiveBreakdownId(newId)
      setBdSubFault('')
      setBdDesc('')
      setBdParts([emptyPart()])
      await loadAll()
      setSub('breakdown')
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function advanceStatus(row: MachineBreakdown, next: string) {
    if (!profile) return
    setBusy(true)
    flash(null)
    try {
      const now = new Date().toISOString()
      const patch: Record<string, unknown> = { status: next, updated_at: now }
      if (next === 'CALL_DONE') patch.called_at = row.called_at || now
      if (next === 'ARRIVED') patch.arrived_at = row.arrived_at || now
      if (next === 'WORK_STARTED') patch.work_started_at = row.work_started_at || now
      if (next === 'RESOLVED') patch.resolved_at = row.resolved_at || now
      const merged = { ...row, ...patch } as MachineBreakdown
      const times = computeTimelineMinutes(merged)
      Object.assign(patch, times)

      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'machine_breakdowns',
        action: 'update',
        recordId: row.id,
        payload: patch,
        apply: async () => {
          const { error: uErr } = await supabase.from('machine_breakdowns').update(patch).eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      flash(result === 'applied' ? `Status → ${next}` : 'Sent to approval queue')
      setActiveBreakdownId(row.id)
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveResolution(row: MachineBreakdown) {
    if (!profile) return
    setBusy(true)
    flash(null)
    try {
      const partsChargesCalc = bdParts.reduce((s, p) => s + Number(p.amount || 0), 0)
      const labour = Number(bdLabour) || 0
      const partsCh = Number(bdPartsCharges) || partsChargesCalc
      const other = Number(bdOtherCharges) || 0
      const patch = {
        done_by: bdDoneBy.trim() || null,
        work_performed: bdWork.trim() || null,
        root_cause: bdRoot.trim() || null,
        action_taken: bdAction.trim() || null,
        remarks: bdRemarks.trim() || null,
        labour_charges: labour,
        parts_charges: partsCh,
        other_charges: other,
        total_amount: labour + partsCh + other,
        payment_mode: bdPayMode,
        payment_status: bdPayStatus,
        payment_date: bdPayDate || null,
        payment_remarks: bdPayRemarks.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'machine_breakdowns',
        action: 'update',
        recordId: row.id,
        payload: patch,
        apply: async () => {
          const { error: uErr } = await supabase.from('machine_breakdowns').update(patch).eq('id', row.id)
          if (uErr) throw uErr

          // Replace parts for this breakdown (idempotent update)
          const existing = partsByBreakdown[row.id] || []
          for (const old of existing) {
            if (old.spare_part_id) {
              const spare = spares.find((s) => s.id === old.spare_part_id)
              if (spare) {
                await supabase
                  .from('maint_spare_parts')
                  .update({ used: Math.max(0, Number(spare.used) - Number(old.qty)), updated_at: new Date().toISOString() })
                  .eq('id', spare.id)
              }
            }
          }
          await supabase.from('machine_breakdown_parts').delete().eq('breakdown_id', row.id)

          const validParts = bdParts.filter((p) => p.part_name.trim())
          if (validParts.length) {
            const rows = validParts.map((p) => ({
              breakdown_id: row.id,
              spare_part_id: p.spare_part_id || null,
              part_name: p.part_name.trim(),
              part_number: p.part_number.trim() || null,
              qty: Number(p.qty) || 1,
              amount: Number(p.amount) || 0,
            }))
            const { error: pErr } = await supabase.from('machine_breakdown_parts').insert(rows)
            if (pErr) throw pErr
            for (const p of rows) {
              if (!p.spare_part_id) continue
              const spare = spares.find((s) => s.id === p.spare_part_id)
              if (!spare) continue
              const { error: sErr } = await supabase
                .from('maint_spare_parts')
                .update({
                  used: Number(spare.used) + Number(p.qty),
                  updated_at: new Date().toISOString(),
                })
                .eq('id', spare.id)
              if (sErr) throw sErr
            }
          }
        },
      })
      flash(result === 'applied' ? 'Resolution & payment saved' : 'Sent to approval queue')
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveComplaint(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !cpText.trim()) return
    setBusy(true)
    flash(null)
    try {
      const payload = {
        complaint_date: cpDate,
        machine_no: cpMachine,
        complaint: cpText.trim(),
        reported_by: cpBy.trim() || null,
        priority: cpPriority,
        assigned_to: cpAssigned.trim() || null,
        status: cpStatus,
        resolution: cpResolution.trim() || null,
        resolved_date: cpResolved || null,
        remarks: cpRemarks.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maint_complaints',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('maint_complaints').insert(payload)
          if (iErr) throw iErr
        },
      })
      flash(result === 'applied' ? 'Complaint registered' : 'Sent to approval queue')
      setCpText('')
      setCpResolution('')
      setCpRemarks('')
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveMaintEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !meWork.trim()) return
    setBusy(true)
    flash(null)
    try {
      let photo_url: string | null = null
      if (mePhoto) photo_url = await uploadFactoryPhoto(mePhoto, 'maintenance')
      const payload = {
        machine_no: meMachine,
        priority: mePriority,
        problem: meWork.trim(),
        item_needed: meParts.trim() || null,
        photo_url,
        assigned_to: meTech.trim() || null,
        status: 'closed',
        cost: Number(meCost) || 0,
        entry_date: meDate,
        maintenance_type: meType,
        work_details: meWork.trim(),
        parts_used: meParts.trim() || null,
        next_maintenance_date: meNext || null,
        remarks: meRemarks.trim() || null,
        technician: meTech.trim() || null,
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
          if (meNext) {
            await supabase.from('maint_schedules').insert({
              machine_no: meMachine,
              maintenance_type: meType,
              last_done: meDate,
              next_due: meNext,
              assigned_person: meTech.trim() || null,
              status: deriveScheduleStatus(meNext),
              remarks: 'From maintenance entry',
            })
          }
        },
      })
      flash(result === 'applied' ? 'Maintenance entry saved' : 'Sent to approval queue')
      setMeWork('')
      setMeParts('')
      setMeRemarks('')
      setMePhoto(null)
      setMeCost('0')
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    flash(null)
    try {
      const payload = {
        machine_no: scMachine,
        maintenance_type: scType,
        last_done: scLast || null,
        next_due: scNext,
        assigned_person: scPerson.trim() || null,
        status: deriveScheduleStatus(scNext),
        remarks: scRemarks.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maint_schedules',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('maint_schedules').insert(payload)
          if (iErr) throw iErr
        },
      })
      flash(result === 'applied' ? 'Schedule saved' : 'Sent to approval queue')
      setScRemarks('')
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function markScheduleDone(row: MaintSchedule) {
    if (!profile) return
    setBusy(true)
    try {
      const payload = {
        status: 'Completed',
        last_done: todayISO(),
        updated_at: new Date().toISOString(),
      }
      await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maint_schedules',
        action: 'update',
        recordId: row.id,
        payload,
        apply: async () => {
          const { error: uErr } = await supabase.from('maint_schedules').update(payload).eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      flash('Schedule marked completed')
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveSpare(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !spName.trim()) return
    setBusy(true)
    flash(null)
    try {
      const payload = {
        part_name: spName.trim(),
        part_number: spNumber.trim() || null,
        machine_no: spMachine || null,
        opening_stock: Number(spOpen) || 0,
        received: Number(spRecv) || 0,
        used: Number(spUsed) || 0,
        min_stock: Number(spMin) || 0,
        rate: Number(spRate) || 0,
        supplier: spSupplier.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maint_spare_parts',
        action: editSpareId ? 'update' : 'insert',
        recordId: editSpareId,
        payload,
        apply: async () => {
          if (editSpareId) {
            const { error: uErr } = await supabase.from('maint_spare_parts').update(payload).eq('id', editSpareId)
            if (uErr) throw uErr
          } else {
            const { error: iErr } = await supabase.from('maint_spare_parts').insert(payload)
            if (iErr) throw iErr
          }
        },
      })
      flash(result === 'applied' ? 'Spare part saved' : 'Sent to approval queue')
      setSpName('')
      setSpNumber('')
      setSpOpen('0')
      setSpRecv('0')
      setSpUsed('0')
      setSpMin('0')
      setSpRate('0')
      setSpSupplier('')
      setEditSpareId(null)
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function deleteBreakdown(id: string) {
    if (!profile || !window.confirm('Delete this breakdown entry?')) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'machine_breakdowns',
        action: 'delete',
        recordId: id,
        payload: {},
        apply: async () => {
          const { error: dErr } = await supabase.from('machine_breakdowns').delete().eq('id', id)
          if (dErr) throw dErr
        },
      })
      flash('Breakdown deleted')
      if (activeBreakdownId === id) setActiveBreakdownId(null)
      await loadAll()
    } catch (err) {
      flash(null, errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  function loadBreakdownIntoForm(row: MachineBreakdown) {
    setActiveBreakdownId(row.id)
    setBdDate(row.breakdown_date)
    setBdTime((row.breakdown_time || '').slice(0, 5))
    setBdMachine(row.machine_no)
    setBdShift(row.shift)
    setBdFault(row.fault_type)
    setBdSubFault(row.sub_fault || '')
    setBdPriority(row.priority)
    setBdDesc(row.description || '')
    setBdContactId(row.contact_id || '')
    setBdDoneBy(row.done_by || '')
    setBdWork(row.work_performed || '')
    setBdRoot(row.root_cause || '')
    setBdAction(row.action_taken || '')
    setBdRemarks(row.remarks || '')
    setBdLabour(String(row.labour_charges ?? 0))
    setBdPartsCharges(String(row.parts_charges ?? 0))
    setBdOtherCharges(String(row.other_charges ?? 0))
    setBdPayMode(row.payment_mode || 'Cash')
    setBdPayStatus(row.payment_status || 'Pending')
    setBdPayDate(row.payment_date || todayISO())
    setBdPayRemarks(row.payment_remarks || '')
    const pts = partsByBreakdown[row.id] || []
    setBdParts(
      pts.length
        ? pts.map((p) => ({
            part_name: p.part_name,
            part_number: p.part_number || '',
            qty: String(p.qty),
            amount: String(p.amount),
            spare_part_id: p.spare_part_id || '',
          }))
        : [emptyPart()],
    )
    setSub('breakdown')
  }

  function goMachineHistory(machineNo: string) {
    setSelectedMachine(machineNo)
    setHistFilter((f) => ({ ...f, machine: machineNo }))
    setSub('history')
  }

  function buildReportRows() {
    const filtered = filterBreakdowns(breakdowns, repFilter)
    switch (reportType) {
      case 'breakdown':
        return {
          name: 'Breakdown Report',
          cols: ['Date', 'Machine', 'Fault', 'Problem', 'Priority', 'Status', 'Downtime'],
          rows: filtered.map((b) => [
            b.breakdown_date,
            machineLabel(b.machine_no),
            b.fault_type,
            b.sub_fault || b.description,
            b.priority,
            b.status,
            formatMinutes(b.downtime_minutes),
          ]),
        }
      case 'electrical':
        return {
          name: 'Electrical Fault Report',
          cols: ['Date', 'Machine', 'Problem', 'Contact', 'Status', 'Cost'],
          rows: filtered
            .filter((b) => b.fault_type === 'Electrical Fault')
            .map((b) => [
              b.breakdown_date,
              machineLabel(b.machine_no),
              b.sub_fault || b.description,
              b.contact_name,
              b.status,
              formatINR(b.total_amount),
            ]),
        }
      case 'mechanical':
        return {
          name: 'Mechanical Fault Report',
          cols: ['Date', 'Machine', 'Problem', 'Contact', 'Status', 'Cost'],
          rows: filtered
            .filter((b) => b.fault_type === 'Mechanical Fault')
            .map((b) => [
              b.breakdown_date,
              machineLabel(b.machine_no),
              b.sub_fault || b.description,
              b.contact_name,
              b.status,
              formatINR(b.total_amount),
            ]),
        }
      case 'parts': {
        const rows: Array<Array<string | number>> = []
        for (const b of filtered) {
          for (const p of partsByBreakdown[b.id] || []) {
            rows.push([
              b.breakdown_date,
              machineLabel(b.machine_no),
              p.part_name,
              p.part_number || '',
              p.qty,
              formatINR(p.amount),
            ])
          }
        }
        return {
          name: 'Parts Replacement Report',
          cols: ['Date', 'Machine', 'Part', 'Part No', 'Qty', 'Amount'],
          rows,
        }
      }
      case 'technician':
        return {
          name: 'Technician / Contractor Report',
          cols: ['Date', 'Machine', 'Technician', 'Fault', 'Status', 'Amount'],
          rows: filtered.map((b) => [
            b.breakdown_date,
            machineLabel(b.machine_no),
            b.done_by || b.contact_name,
            b.fault_type,
            b.status,
            formatINR(b.total_amount),
          ]),
        }
      case 'cost':
        return {
          name: 'Maintenance Cost Report',
          cols: ['Date', 'Machine', 'Labour', 'Parts', 'Other', 'Total', 'Pay Status'],
          rows: filtered.map((b) => [
            b.breakdown_date,
            machineLabel(b.machine_no),
            formatINR(b.labour_charges),
            formatINR(b.parts_charges),
            formatINR(b.other_charges),
            formatINR(b.total_amount),
            b.payment_status,
          ]),
        }
      case 'downtime':
        return {
          name: 'Downtime Report',
          cols: ['Date', 'Machine', 'Fault', 'Response', 'Repair', 'Total Downtime', 'Status'],
          rows: filtered.map((b) => [
            b.breakdown_date,
            machineLabel(b.machine_no),
            b.fault_type,
            formatMinutes(b.response_minutes),
            formatMinutes(b.repair_minutes),
            formatMinutes(b.downtime_minutes),
            b.status,
          ]),
        }
      case 'comparison': {
        const rows = MACHINES.map((m) => {
          const list = filtered.filter((b) => b.machine_no === m)
          const dt = list.reduce((s, b) => s + Number(b.downtime_minutes || 0), 0)
          const cost = list.reduce((s, b) => s + Number(b.total_amount || 0), 0)
          return [
            machineLabel(m),
            list.length,
            list.filter((b) => b.fault_type === 'Electrical Fault').length,
            list.filter((b) => b.fault_type === 'Mechanical Fault').length,
            formatMinutes(dt),
            formatINR(cost),
            list.filter((b) => b.status !== 'RESOLVED').length,
          ]
        })
        return {
          name: 'Machine Comparison Report',
          cols: ['Machine', 'Breakdowns', 'Electrical', 'Mechanical', 'Downtime', 'Cost', 'Pending'],
          rows,
        }
      }
      case 'pending':
        return {
          name: 'Pending Breakdown Report',
          cols: ['Date', 'Machine', 'Fault', 'Problem', 'Priority', 'Contact', 'Status'],
          rows: filtered
            .filter((b) => b.status !== 'RESOLVED')
            .map((b) => [
              b.breakdown_date,
              machineLabel(b.machine_no),
              b.fault_type,
              b.sub_fault || b.description,
              b.priority,
              b.contact_name,
              b.status,
            ]),
        }
      default:
        return {
          name: 'Machine-wise Maintenance Report',
          cols: ['Date', 'Machine', 'Fault', 'Problem', 'Technician', 'Parts', 'Amount', 'Status'],
          rows: filtered.map((b) => [
            b.breakdown_date,
            machineLabel(b.machine_no),
            b.fault_type,
            b.sub_fault || b.description,
            b.done_by || b.contact_name,
            (partsByBreakdown[b.id] || []).map((p) => p.part_name).join(', '),
            formatINR(b.total_amount),
            b.status,
          ]),
        }
    }
  }

  function runPrint() {
    const r = buildReportRows()
    printMaintenanceReport({
      reportName: r.name,
      dateFrom: repFilter.dateFrom,
      dateTo: repFilter.dateTo,
      machine: repFilter.machine || undefined,
      columns: r.cols,
      rows: r.rows,
    })
  }

  function runCsv() {
    const r = buildReportRows()
    csvDownload(`${r.name.replace(/\s+/g, '-').toLowerCase()}.csv`, r.cols, r.rows)
  }

  function copyReport() {
    const r = buildReportRows()
    const text = [r.name, r.cols.join('\t'), ...r.rows.map((row) => row.join('\t'))].join('\n')
    void navigator.clipboard?.writeText(text).then(() => flash('Copied to clipboard'))
  }

  const machineSummary = (m: string) => {
    const list = breakdowns.filter((b) => b.machine_no === m)
    const entriesM = entries.filter((e) => e.machine_no === m)
    const dt = list.reduce((s, b) => s + Number(b.downtime_minutes || 0), 0)
    const repairs = list.filter((b) => b.repair_minutes != null)
    const avgRepair =
      repairs.length > 0
        ? Math.round(repairs.reduce((s, b) => s + Number(b.repair_minutes), 0) / repairs.length)
        : null
    const partsCount = list.reduce((s, b) => s + (partsByBreakdown[b.id]?.length || 0), 0)
    const cost =
      list.reduce((s, b) => s + Number(b.total_amount || 0), 0) +
      entriesM.reduce((s, e) => s + Number(e.cost || 0), 0)
    const next = schedules
      .filter((s) => s.machine_no === m && s.status !== 'Completed')
      .sort((a, b) => a.next_due.localeCompare(b.next_due))[0]
    return {
      total: list.length,
      electrical: list.filter((b) => b.fault_type === 'Electrical Fault').length,
      mechanical: list.filter((b) => b.fault_type === 'Mechanical Fault').length,
      other: list.filter((b) => b.fault_type !== 'Electrical Fault' && b.fault_type !== 'Mechanical Fault').length,
      downtime: formatMinutes(dt),
      avgRepair: formatMinutes(avgRepair),
      parts: partsCount,
      cost: formatINR(cost),
      pending: list.filter((b) => b.status !== 'RESOLVED').length,
      lastMaint: entriesM[0]?.entry_date || entriesM[0]?.created_at?.slice(0, 10) || '—',
      nextMaint: next?.next_due || '—',
    }
  }

  return (
    <div className="screen mwm-screen">
      <header className="screen-header mwm-header no-print">
        <div>
          <p className="mwm-eyebrow text-muted">JAISAL FW · Fashionweave Industries</p>
          <h1>Machine-wise Maintenance</h1>
        </div>
        <div className="mwm-header-actions">
          <button type="button" className="btn-ghost" onClick={() => onNavigate?.({ screen: 'maint-material', module: 'maintenance' })}>
            Material Out/In
          </button>
          <button type="button" className="btn-ghost" onClick={() => onNavigate?.({ screen: 'maintenance', sub: 'repair', module: 'maintenance' })}>
            Repair Out/In
          </button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void loadAll()}>
            Refresh
          </button>
        </div>
      </header>

      <div className="no-print">
        <SubTabs
          value={sub}
          onChange={(id) => {
            setSub(id as MwmSub)
            if (id !== 'history') setSelectedMachine('')
          }}
          options={SUBS}
        />
      </div>

      {migrationHint ? (
        <p className="form-error text-danger no-print">{MIGRATION_HINT}</p>
      ) : null}
      {error ? <p className="form-error text-danger no-print">{error}</p> : null}
      {message ? <p className="form-ok text-sage no-print">{message}</p> : null}

      {/* ---------- OVERVIEW ---------- */}
      {sub === 'overview' ? (
        <div className="mwm-overview">
          <div className="mwm-kpi-row">
            <article className="mwm-kpi"><span>Today&apos;s Breakdowns</span><strong>{kpis.todayCount}</strong></article>
            <article className="mwm-kpi mwm-kpi-warn"><span>Pending</span><strong>{kpis.pending}</strong></article>
            <article className="mwm-kpi mwm-kpi-ok"><span>Resolved Today</span><strong>{kpis.resolvedToday}</strong></article>
            <article className="mwm-kpi"><span>Total Downtime</span><strong>{formatMinutes(kpis.downtime)}</strong></article>
            <article className="mwm-kpi"><span>Maint. Cost</span><strong>{formatINR(kpis.cost)}</strong></article>
            <article className="mwm-kpi mwm-kpi-ok"><span>Running</span><strong>{kpis.running}</strong></article>
          </div>

          <div className="mwm-quick no-print">
            <button type="button" className="mwm-qa mwm-qa-blue" onClick={() => setSub('breakdown')}>+ Create New Entry</button>
            <button type="button" className="mwm-qa mwm-qa-green" onClick={() => setSub('breakdown')}>Breakdown Entry</button>
            <button type="button" className="mwm-qa mwm-qa-slate" onClick={() => setSub('entry')}>Maintenance Entry</button>
            <button type="button" className="mwm-qa mwm-qa-amber" onClick={() => setSub('contacts')}>Add Contact</button>
            <button type="button" className="mwm-qa mwm-qa-grey" onClick={() => setSub('reports')}>Reports</button>
          </div>

          <div className="mwm-machine-grid">
            {overview.map((card) => (
              <button
                key={card.machine_no}
                type="button"
                className={`mwm-machine-card status-${card.status.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => goMachineHistory(card.machine_no)}
              >
                <div className="mwm-machine-card-top">
                  <strong>{card.label}</strong>
                  <span className={statusBadgeClass(card.status)}>{card.status}</span>
                </div>
                <dl className="mwm-machine-meta">
                  <div><dt>Last Maintenance</dt><dd>{card.lastMaintenance || '—'}</dd></div>
                  <div><dt>Last Breakdown</dt><dd>{card.lastBreakdown || '—'}</dd></div>
                  <div><dt>Current Problem</dt><dd>{card.currentProblem || '—'}</dd></div>
                  <div><dt>Downtime</dt><dd>{formatMinutes(card.downtimeMinutes)}</dd></div>
                  <div><dt>MTBF</dt><dd>{card.mtbfHours != null ? `${card.mtbfHours}h` : '—'}</dd></div>
                  <div><dt>Last Updated</dt><dd>{card.lastUpdated ? new Date(card.lastUpdated).toLocaleString() : '—'}</dd></div>
                </dl>
              </button>
            ))}
          </div>

          <h2 className="section-title">Machine-wise Summary</h2>
          <div className="table-scroll">
            <table className="mwm-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Breakdowns</th>
                  <th>Electrical</th>
                  <th>Mechanical</th>
                  <th>Other</th>
                  <th>Downtime</th>
                  <th>Avg Repair</th>
                  <th>Parts</th>
                  <th>Cost</th>
                  <th>Pending</th>
                  <th>Last Maint</th>
                  <th>Next Maint</th>
                </tr>
              </thead>
              <tbody>
                {MACHINES.map((m) => {
                  const s = machineSummary(m)
                  return (
                    <tr key={m}>
                      <td><button type="button" className="linkish" onClick={() => goMachineHistory(m)}>{machineLabel(m)}</button></td>
                      <td>{s.total}</td>
                      <td>{s.electrical}</td>
                      <td>{s.mechanical}</td>
                      <td>{s.other}</td>
                      <td>{s.downtime}</td>
                      <td>{s.avgRepair}</td>
                      <td>{s.parts}</td>
                      <td>{s.cost}</td>
                      <td>{s.pending}</td>
                      <td>{s.lastMaint}</td>
                      <td>{s.nextMaint}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ---------- BREAKDOWN ---------- */}
      {sub === 'breakdown' ? (
        <div className="mwm-two-col">
          <div>
            <form className="form-stack surface mwm-panel" onSubmit={(e) => void saveBreakdown(e)}>
              <h2 className="section-title">Breakdown Entry</h2>
              <div className="mwm-form-grid">
                <label className="field"><span className="text-muted">Date</span>
                  <input type="date" value={bdDate} onChange={(e) => setBdDate(e.target.value)} required /></label>
                <label className="field"><span className="text-muted">Time</span>
                  <input type="time" value={bdTime} onChange={(e) => setBdTime(e.target.value)} required /></label>
                <label className="field"><span className="text-muted">Machine No.</span>
                  <select value={bdMachine} onChange={(e) => setBdMachine(e.target.value)}>
                    {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
                  </select></label>
                <label className="field"><span className="text-muted">Shift</span>
                  <select value={bdShift} onChange={(e) => setBdShift(e.target.value)}>
                    {SHIFTS.map((s) => <option key={s}>{s}</option>)}
                  </select></label>
                <label className="field"><span className="text-muted">Fault Type</span>
                  <select value={bdFault} onChange={(e) => setBdFault(e.target.value)}>
                    {FAULT_TYPES.map((f) => <option key={f}>{f}</option>)}
                  </select></label>
                <label className="field"><span className="text-muted">Sub Fault / Problem</span>
                  <input value={bdSubFault} onChange={(e) => setBdSubFault(e.target.value)} required /></label>
                <label className="field"><span className="text-muted">Priority</span>
                  <select value={bdPriority} onChange={(e) => setBdPriority(e.target.value)}>
                    {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                  </select></label>
                <label className="field field-span"><span className="text-muted">Description</span>
                  <textarea value={bdDesc} onChange={(e) => setBdDesc(e.target.value)} rows={2} /></label>
                <label className="field field-span"><span className="text-muted">Contact Person</span>
                  <select value={bdContactId} onChange={(e) => setBdContactId(e.target.value)}>
                    <option value="">— Select contact —</option>
                    {activeContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.contact_name} ({c.category})</option>
                    ))}
                  </select></label>
              </div>

              {selectedContact ? (
                <div className="mwm-contact-chip">
                  <div>
                    <strong>{selectedContact.contact_name}</strong>
                    <div className="text-muted">{selectedContact.mobile1 || '—'}{selectedContact.mobile2 ? ` · ${selectedContact.mobile2}` : ''}</div>
                  </div>
                  <div className="mwm-contact-actions">
                    <button type="button" className="mwm-call" onClick={() => callPhone(selectedContact.mobile1)}>CALL</button>
                    <button type="button" className="mwm-wa" onClick={() => whatsAppTo(selectedContact.mobile1, `Breakdown ${machineLabel(bdMachine)}: ${bdSubFault}`)}>WhatsApp</button>
                    <button type="button" className="btn-ghost" onClick={() => setSub('contacts')}>Add New Contact</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn-ghost" onClick={() => setSub('contacts')}>+ Add New Contact</button>
              )}

              <button type="submit" className="primary-save" disabled={busy}>Save Breakdown</button>
            </form>

            {activeBreakdown ? (
              <div className="surface mwm-panel">
                <h2 className="section-title">Tracking · {machineLabel(activeBreakdown.machine_no)}</h2>
                <span className={statusBadgeClass(activeBreakdown.status)}>{activeBreakdown.status}</span>
                <div className="mwm-timeline no-print">
                  {BREAKDOWN_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      className={activeBreakdown.status === st ? 'mwm-tl active' : 'mwm-tl'}
                      disabled={busy || activeBreakdown.status === 'RESOLVED'}
                      onClick={() => void advanceStatus(activeBreakdown, st)}
                    >
                      {st.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <dl className="mwm-machine-meta">
                  <div><dt>Breakdown</dt><dd>{new Date(activeBreakdown.breakdown_at).toLocaleString()}</dd></div>
                  <div><dt>Called At</dt><dd>{activeBreakdown.called_at ? new Date(activeBreakdown.called_at).toLocaleString() : '—'}</dd></div>
                  <div><dt>Arrived At</dt><dd>{activeBreakdown.arrived_at ? new Date(activeBreakdown.arrived_at).toLocaleString() : '—'}</dd></div>
                  <div><dt>Resolved At</dt><dd>{activeBreakdown.resolved_at ? new Date(activeBreakdown.resolved_at).toLocaleString() : '—'}</dd></div>
                  <div><dt>Response</dt><dd>{formatMinutes(activeBreakdown.response_minutes)}</dd></div>
                  <div><dt>Repair</dt><dd>{formatMinutes(activeBreakdown.repair_minutes)}</dd></div>
                  <div><dt>Total Downtime</dt><dd>{formatMinutes(activeBreakdown.downtime_minutes)}</dd></div>
                </dl>

                <h3 className="section-title">Work / Resolution</h3>
                <div className="mwm-form-grid">
                  <label className="field"><span className="text-muted">Done By</span>
                    <input value={bdDoneBy} onChange={(e) => setBdDoneBy(e.target.value)} /></label>
                  <label className="field field-span"><span className="text-muted">Work Performed</span>
                    <input value={bdWork} onChange={(e) => setBdWork(e.target.value)} /></label>
                  <label className="field field-span"><span className="text-muted">Root Cause</span>
                    <input value={bdRoot} onChange={(e) => setBdRoot(e.target.value)} /></label>
                  <label className="field field-span"><span className="text-muted">Action Taken</span>
                    <input value={bdAction} onChange={(e) => setBdAction(e.target.value)} /></label>
                  <label className="field field-span"><span className="text-muted">Remarks</span>
                    <input value={bdRemarks} onChange={(e) => setBdRemarks(e.target.value)} /></label>
                </div>

                <h3 className="section-title">Parts Changed</h3>
                {bdParts.map((p, i) => (
                  <div className="mwm-part-row" key={i}>
                    <input placeholder="Part Name" value={p.part_name} onChange={(e) => {
                      const next = [...bdParts]; next[i] = { ...p, part_name: e.target.value }; setBdParts(next)
                    }} />
                    <input placeholder="Part No" value={p.part_number} onChange={(e) => {
                      const next = [...bdParts]; next[i] = { ...p, part_number: e.target.value }; setBdParts(next)
                    }} />
                    <input className="num" type="number" placeholder="Qty" value={p.qty} onChange={(e) => {
                      const next = [...bdParts]; next[i] = { ...p, qty: e.target.value }; setBdParts(next)
                    }} />
                    <input className="num" type="number" placeholder="Amount" value={p.amount} onChange={(e) => {
                      const next = [...bdParts]; next[i] = { ...p, amount: e.target.value }; setBdParts(next)
                    }} />
                    <select value={p.spare_part_id} onChange={(e) => {
                      const spare = spares.find((s) => s.id === e.target.value)
                      const next = [...bdParts]
                      next[i] = {
                        ...p,
                        spare_part_id: e.target.value,
                        part_name: spare?.part_name || p.part_name,
                        part_number: spare?.part_number || p.part_number,
                        amount: spare ? String(Number(spare.rate) * Number(p.qty || 1)) : p.amount,
                      }
                      setBdParts(next)
                    }}>
                      <option value="">Stock link</option>
                      {spares.map((s) => (
                        <option key={s.id} value={s.id}>{s.part_name} (bal {spareBalance(s)})</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button type="button" className="btn-ghost" onClick={() => setBdParts([...bdParts, emptyPart()])}>+ Add Part</button>

                <h3 className="section-title">Payment</h3>
                <div className="mwm-form-grid">
                  <label className="field"><span className="text-muted">Labour</span>
                    <input className="num" type="number" value={bdLabour} onChange={(e) => setBdLabour(e.target.value)} /></label>
                  <label className="field"><span className="text-muted">Parts Charges</span>
                    <input className="num" type="number" value={bdPartsCharges} onChange={(e) => setBdPartsCharges(e.target.value)} /></label>
                  <label className="field"><span className="text-muted">Other</span>
                    <input className="num" type="number" value={bdOtherCharges} onChange={(e) => setBdOtherCharges(e.target.value)} /></label>
                  <label className="field"><span className="text-muted">Total</span>
                    <input className="num" readOnly value={Number(bdLabour || 0) + Number(bdPartsCharges || 0) + Number(bdOtherCharges || 0)} /></label>
                  <label className="field"><span className="text-muted">Mode</span>
                    <select value={bdPayMode} onChange={(e) => setBdPayMode(e.target.value)}>
                      {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
                    </select></label>
                  <label className="field"><span className="text-muted">Status</span>
                    <select value={bdPayStatus} onChange={(e) => setBdPayStatus(e.target.value)}>
                      {PAYMENT_STATUSES.map((m) => <option key={m}>{m}</option>)}
                    </select></label>
                  <label className="field"><span className="text-muted">Payment Date</span>
                    <input type="date" value={bdPayDate} onChange={(e) => setBdPayDate(e.target.value)} /></label>
                  <label className="field field-span"><span className="text-muted">Payment Remarks</span>
                    <input value={bdPayRemarks} onChange={(e) => setBdPayRemarks(e.target.value)} /></label>
                </div>
                <button type="button" className="primary-save" disabled={busy} onClick={() => void saveResolution(activeBreakdown)}>
                  Save Resolution & Payment
                </button>
              </div>
            ) : null}
          </div>

          <aside className="mwm-aside">
            <div className="surface mwm-panel">
              <h2 className="section-title">Contact Directory</h2>
              <div className="list">
                {activeContacts.slice(0, 8).map((c) => (
                  <article key={c.id} className="card-row surface row-top">
                    <div>
                      <strong>{c.contact_name}</strong>
                      <div className="text-muted">{c.category} · {c.mobile1 || '—'}</div>
                    </div>
                    <div className="mwm-contact-actions">
                      <button type="button" className="mwm-call" onClick={() => callPhone(c.mobile1)}>CALL</button>
                      <button type="button" className="mwm-wa" onClick={() => whatsAppTo(c.mobile1)}>WA</button>
                    </div>
                  </article>
                ))}
                {!activeContacts.length ? <p className="text-muted">No contacts yet</p> : null}
              </div>
            </div>
            <div className="surface mwm-panel">
              <h2 className="section-title">Recent Breakdowns</h2>
              <div className="list">
                {breakdowns.slice(0, 10).map((b) => (
                  <article key={b.id} className="card-row surface row-top">
                    <div>
                      <strong>{machineLabel(b.machine_no)}</strong>
                      <div className="text-muted">{b.breakdown_date} · {b.sub_fault || b.fault_type}</div>
                      <span className={statusBadgeClass(b.status)}>{b.status}</span>
                    </div>
                    <button type="button" className="btn-ghost" onClick={() => loadBreakdownIntoForm(b)}>Open</button>
                  </article>
                ))}
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {/* ---------- CONTACTS ---------- */}
      {sub === 'contacts' ? (
        <div className="mwm-two-col">
          <form className="form-stack surface mwm-panel" onSubmit={(e) => void saveContact(e)}>
            <h2 className="section-title">{editContactId ? 'Edit Contact' : 'Add Contact'}</h2>
            <div className="mwm-form-grid">
              <label className="field"><span className="text-muted">Contact Name</span>
                <input value={cName} onChange={(e) => setCName(e.target.value)} required /></label>
              <label className="field"><span className="text-muted">Category</span>
                <select value={cCat} onChange={(e) => setCCat(e.target.value)}>
                  {CONTACT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select></label>
              <label className="field"><span className="text-muted">Mobile 1</span>
                <input value={cMob1} onChange={(e) => setCMob1(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Mobile 2</span>
                <input value={cMob2} onChange={(e) => setCMob2(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Company / Contractor</span>
                <input value={cCompany} onChange={(e) => setCCompany(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Active</span>
                <select value={cActive ? 'yes' : 'no'} onChange={(e) => setCActive(e.target.value === 'yes')}>
                  <option value="yes">Active</option>
                  <option value="no">Inactive</option>
                </select></label>
              <label className="field field-span"><span className="text-muted">Remarks</span>
                <input value={cRemarks} onChange={(e) => setCRemarks(e.target.value)} /></label>
            </div>
            <button type="submit" className="primary-save" disabled={busy}>{editContactId ? 'Update Contact' : 'Save Contact'}</button>
          </form>
          <div className="list">
            {contacts.map((c) => (
              <article key={c.id} className="card-row surface row-top">
                <div>
                  <strong>{c.contact_name}</strong>
                  <div className="text-muted">{c.category} · {c.company || '—'} · {c.is_active ? 'Active' : 'Inactive'}</div>
                  <div className="text-muted2">{c.mobile1 || '—'}{c.mobile2 ? ` / ${c.mobile2}` : ''}</div>
                </div>
                <div className="mwm-contact-actions">
                  <button type="button" className="mwm-call" onClick={() => callPhone(c.mobile1)}>CALL</button>
                  <button type="button" className="mwm-wa" onClick={() => whatsAppTo(c.mobile1)}>WA</button>
                  <button type="button" className="btn-ghost" onClick={() => {
                    setEditContactId(c.id)
                    setCName(c.contact_name)
                    setCCat(c.category)
                    setCMob1(c.mobile1 || '')
                    setCMob2(c.mobile2 || '')
                    setCCompany(c.company || '')
                    setCRemarks(c.remarks || '')
                    setCActive(c.is_active)
                  }}>Edit</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- COMPLAINTS ---------- */}
      {sub === 'complaints' ? (
        <div className="mwm-two-col">
          <form className="form-stack surface mwm-panel" onSubmit={(e) => void saveComplaint(e)}>
            <h2 className="section-title">Complaint Register</h2>
            <div className="mwm-form-grid">
              <label className="field"><span className="text-muted">Date</span>
                <input type="date" value={cpDate} onChange={(e) => setCpDate(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Machine</span>
                <select value={cpMachine} onChange={(e) => setCpMachine(e.target.value)}>
                  {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
                </select></label>
              <label className="field field-span"><span className="text-muted">Complaint</span>
                <input value={cpText} onChange={(e) => setCpText(e.target.value)} required /></label>
              <label className="field"><span className="text-muted">Reported By</span>
                <input value={cpBy} onChange={(e) => setCpBy(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Priority</span>
                <select value={cpPriority} onChange={(e) => setCpPriority(e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select></label>
              <label className="field"><span className="text-muted">Assigned To</span>
                <input value={cpAssigned} onChange={(e) => setCpAssigned(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Status</span>
                <select value={cpStatus} onChange={(e) => setCpStatus(e.target.value)}>
                  {COMPLAINT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select></label>
              <label className="field field-span"><span className="text-muted">Resolution</span>
                <input value={cpResolution} onChange={(e) => setCpResolution(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Resolved Date</span>
                <input type="date" value={cpResolved} onChange={(e) => setCpResolved(e.target.value)} /></label>
              <label className="field field-span"><span className="text-muted">Remarks</span>
                <input value={cpRemarks} onChange={(e) => setCpRemarks(e.target.value)} /></label>
            </div>
            <button type="submit" className="primary-save" disabled={busy}>Save Complaint</button>
          </form>
          <div className="list">
            {complaints.map((c) => (
              <article key={c.id} className="card-row surface">
                <strong>{machineLabel(c.machine_no)}</strong> · {c.complaint_date}
                <div className="text-muted">{c.complaint}</div>
                <span className={statusBadgeClass(c.status)}>{c.status}</span>
                <span className="text-muted2"> · {c.priority} · {c.assigned_to || '—'}</span>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- MAINTENANCE ENTRY ---------- */}
      {sub === 'entry' ? (
        <div className="mwm-two-col">
          <form className="form-stack surface mwm-panel" onSubmit={(e) => void saveMaintEntry(e)}>
            <h2 className="section-title">Maintenance Entry</h2>
            <div className="mwm-form-grid">
              <label className="field"><span className="text-muted">Machine</span>
                <select value={meMachine} onChange={(e) => setMeMachine(e.target.value)}>
                  {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
                </select></label>
              <label className="field"><span className="text-muted">Date</span>
                <input type="date" value={meDate} onChange={(e) => setMeDate(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Maintenance Type</span>
                <select value={meType} onChange={(e) => setMeType(e.target.value)}>
                  <option>Preventive</option>
                  <option>Corrective</option>
                  <option>General</option>
                  <option>Lubrication</option>
                  <option>Inspection</option>
                </select></label>
              <label className="field"><span className="text-muted">Priority</span>
                <select value={mePriority} onChange={(e) => setMePriority(e.target.value)}>
                  <option>High</option><option>Med</option><option>Low</option>
                </select></label>
              <label className="field field-span"><span className="text-muted">Work Details</span>
                <textarea value={meWork} onChange={(e) => setMeWork(e.target.value)} rows={2} required /></label>
              <label className="field"><span className="text-muted">Technician</span>
                <input value={meTech} onChange={(e) => setMeTech(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Parts Used</span>
                <input value={meParts} onChange={(e) => setMeParts(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Cost (₹)</span>
                <input className="num" type="number" value={meCost} onChange={(e) => setMeCost(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Next Maintenance Date</span>
                <input type="date" value={meNext} onChange={(e) => setMeNext(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Photo</span>
                <input type="file" accept="image/*" onChange={(e) => setMePhoto(e.target.files?.[0] ?? null)} /></label>
              <label className="field field-span"><span className="text-muted">Remarks</span>
                <input value={meRemarks} onChange={(e) => setMeRemarks(e.target.value)} /></label>
            </div>
            <button type="submit" className="primary-save" disabled={busy}>Save Maintenance Entry</button>
          </form>
          <div className="list">
            {entries.slice(0, 40).map((e) => (
              <article key={e.id} className="card-row surface">
                <strong>{machineLabel(e.machine_no)}</strong> · {e.entry_date || e.created_at.slice(0, 10)}
                <div className="text-muted">{e.maintenance_type || 'General'} · {e.work_details || e.problem}</div>
                <div className="text-muted2">{e.technician || e.assigned_to || '—'} · {formatINR(e.cost)}</div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- SCHEDULE ---------- */}
      {sub === 'schedule' ? (
        <div className="mwm-two-col">
          <form className="form-stack surface mwm-panel" onSubmit={(e) => void saveSchedule(e)}>
            <h2 className="section-title">Maintenance Schedule</h2>
            <div className="mwm-form-grid">
              <label className="field"><span className="text-muted">Machine</span>
                <select value={scMachine} onChange={(e) => setScMachine(e.target.value)}>
                  {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
                </select></label>
              <label className="field"><span className="text-muted">Type</span>
                <input value={scType} onChange={(e) => setScType(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Last Done</span>
                <input type="date" value={scLast} onChange={(e) => setScLast(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Next Due</span>
                <input type="date" value={scNext} onChange={(e) => setScNext(e.target.value)} required /></label>
              <label className="field"><span className="text-muted">Assigned Person</span>
                <input value={scPerson} onChange={(e) => setScPerson(e.target.value)} /></label>
              <label className="field field-span"><span className="text-muted">Remarks</span>
                <input value={scRemarks} onChange={(e) => setScRemarks(e.target.value)} /></label>
            </div>
            <button type="submit" className="primary-save" disabled={busy}>Save Schedule</button>
          </form>
          <div className="table-scroll">
            <table className="mwm-table">
              <thead>
                <tr>
                  <th>Machine</th><th>Type</th><th>Last Done</th><th>Next Due</th><th>Assigned</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => {
                  const st = deriveScheduleStatus(s.next_due, s.status)
                  return (
                    <tr key={s.id} className={st === 'Overdue' ? 'mwm-row-overdue' : ''}>
                      <td>{machineLabel(s.machine_no)}</td>
                      <td>{s.maintenance_type}</td>
                      <td>{s.last_done || '—'}</td>
                      <td>{s.next_due}</td>
                      <td>{s.assigned_person || '—'}</td>
                      <td><span className={statusBadgeClass(st)}>{st}</span></td>
                      <td>
                        {st !== 'Completed' ? (
                          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void markScheduleDone(s)}>Done</button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ---------- HISTORY / SERVICE ---------- */}
      {sub === 'history' ? (
        <div>
          <div className="mwm-filter-bar no-print surface">
            <label className="field"><span className="text-muted">Machine</span>
              <select value={histFilter.machine || selectedMachine} onChange={(e) => {
                setSelectedMachine(e.target.value)
                setHistFilter({ ...histFilter, machine: e.target.value })
              }}>
                <option value="">All</option>
                {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
              </select></label>
            <label className="field"><span className="text-muted">From</span>
              <input type="date" value={histFilter.dateFrom} onChange={(e) => setHistFilter({ ...histFilter, dateFrom: e.target.value })} /></label>
            <label className="field"><span className="text-muted">To</span>
              <input type="date" value={histFilter.dateTo} onChange={(e) => setHistFilter({ ...histFilter, dateTo: e.target.value })} /></label>
            <label className="field"><span className="text-muted">Fault</span>
              <select value={histFilter.faultType} onChange={(e) => setHistFilter({ ...histFilter, faultType: e.target.value })}>
                <option value="">All</option>
                {FAULT_TYPES.map((f) => <option key={f}>{f}</option>)}
              </select></label>
            <label className="field"><span className="text-muted">Status</span>
              <select value={histFilter.status} onChange={(e) => setHistFilter({ ...histFilter, status: e.target.value })}>
                <option value="">All</option>
                {BREAKDOWN_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select></label>
            <label className="field"><span className="text-muted">Search</span>
              <input placeholder="Problem / Contact / Tech" value={histSearch} onChange={(e) => setHistSearch(e.target.value)} /></label>
          </div>

          <h2 className="section-title">
            {selectedMachine ? `${machineLabel(selectedMachine)} History` : 'Service History'}
          </h2>
          <p className="text-muted">Auto-generated from breakdowns and maintenance entries.</p>

          <div className="table-scroll">
            <table className="mwm-table">
              <thead>
                <tr>
                  <th>Date</th><th>Machine</th><th>Problem</th><th>Work Done</th><th>Parts</th>
                  <th>Technician</th><th>Cost</th><th>Downtime</th><th>Status</th><th>Source</th><th className="no-print">Action</th>
                </tr>
              </thead>
              <tbody>
                {(selectedMachine || histFilter.machine
                  ? serviceHistory.filter((r) => r.machine_no === (selectedMachine || histFilter.machine))
                  : serviceHistory
                )
                  .filter((r) => {
                    if (histFilter.dateFrom && r.date < histFilter.dateFrom) return false
                    if (histFilter.dateTo && r.date > histFilter.dateTo) return false
                    if (histSearch) {
                      const q = histSearch.toLowerCase()
                      return [r.problem, r.work, r.parts, r.technician].join(' ').toLowerCase().includes(q)
                    }
                    return true
                  })
                  .slice(0, 200)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{machineLabel(r.machine_no)}</td>
                      <td>{r.problem}</td>
                      <td>{r.work}</td>
                      <td>{r.parts}</td>
                      <td>{r.technician}</td>
                      <td>{formatINR(r.cost)}</td>
                      <td>{r.downtime}</td>
                      <td><span className={statusBadgeClass(r.status)}>{r.status}</span></td>
                      <td>{r.source}</td>
                      <td className="no-print">
                        {r.source === 'Breakdown' ? (
                          <button type="button" className="btn-ghost" onClick={() => {
                            const id = r.id.replace('bd-', '')
                            const row = breakdowns.find((b) => b.id === id)
                            if (row) loadBreakdownIntoForm(row)
                          }}>View</button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <h2 className="section-title">Breakdown Detail</h2>
          <div className="mwm-history-cards">
            {historyRows.slice(0, 30).map((b) => (
              <article key={b.id} className="surface mwm-panel">
                <div className="mwm-machine-card-top">
                  <strong>{machineLabel(b.machine_no)} · {b.breakdown_date} {String(b.breakdown_time).slice(0, 5)}</strong>
                  <span className={statusBadgeClass(b.status)}>{b.status}</span>
                </div>
                <div className="text-muted">{b.fault_type} · {b.sub_fault || b.description}</div>
                <div className="text-muted2">Contact {b.contact_name || '—'} · Done by {b.done_by || '—'} · {formatINR(b.total_amount)}</div>
                <div className="mwm-contact-actions no-print">
                  <button type="button" className="btn-ghost" onClick={() => loadBreakdownIntoForm(b)}>Edit</button>
                  <button type="button" className="btn-ghost text-danger" onClick={() => void deleteBreakdown(b.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------- SPARES ---------- */}
      {sub === 'spares' ? (
        <div className="mwm-two-col">
          <form className="form-stack surface mwm-panel" onSubmit={(e) => void saveSpare(e)}>
            <h2 className="section-title">{editSpareId ? 'Edit Spare Part' : 'Spare Parts'}</h2>
            <p className="text-muted">Also linked from Purchase → Maint Inward for receipts.</p>
            <div className="mwm-form-grid">
              <label className="field"><span className="text-muted">Part Name</span>
                <input value={spName} onChange={(e) => setSpName(e.target.value)} required /></label>
              <label className="field"><span className="text-muted">Part Number</span>
                <input value={spNumber} onChange={(e) => setSpNumber(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Machine</span>
                <select value={spMachine} onChange={(e) => setSpMachine(e.target.value)}>
                  <option value="">All / Common</option>
                  {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
                </select></label>
              <label className="field"><span className="text-muted">Opening Stock</span>
                <input className="num" type="number" value={spOpen} onChange={(e) => setSpOpen(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Received</span>
                <input className="num" type="number" value={spRecv} onChange={(e) => setSpRecv(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Used</span>
                <input className="num" type="number" value={spUsed} onChange={(e) => setSpUsed(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Minimum Stock</span>
                <input className="num" type="number" value={spMin} onChange={(e) => setSpMin(e.target.value)} /></label>
              <label className="field"><span className="text-muted">Rate</span>
                <input className="num" type="number" value={spRate} onChange={(e) => setSpRate(e.target.value)} /></label>
              <label className="field field-span"><span className="text-muted">Supplier</span>
                <input value={spSupplier} onChange={(e) => setSpSupplier(e.target.value)} /></label>
            </div>
            <div className="mwm-header-actions">
              <button type="submit" className="primary-save" disabled={busy}>Save Spare</button>
              <button type="button" className="btn-ghost" onClick={() => onNavigate?.({ screen: 'purchase', sub: 'maint_in', module: 'maintenance' })}>
                Maint Inward
              </button>
            </div>
          </form>
          <div className="table-scroll">
            <table className="mwm-table">
              <thead>
                <tr>
                  <th>Part</th><th>No</th><th>Machine</th><th>Open</th><th>Recv</th><th>Used</th><th>Balance</th><th>Min</th><th>Rate</th><th>Supplier</th><th></th>
                </tr>
              </thead>
              <tbody>
                {spares.map((s) => {
                  const bal = spareBalance(s)
                  const low = isLowStock(s)
                  return (
                    <tr key={s.id} className={low ? 'mwm-row-overdue' : ''}>
                      <td>{s.part_name}{low ? <span className="mwm-badge mwm-badge-danger"> LOW STOCK</span> : null}</td>
                      <td>{s.part_number || '—'}</td>
                      <td>{s.machine_no ? machineLabel(s.machine_no) : 'Common'}</td>
                      <td>{s.opening_stock}</td>
                      <td>{s.received}</td>
                      <td>{s.used}</td>
                      <td>{bal}</td>
                      <td>{s.min_stock}</td>
                      <td>{formatINR(s.rate)}</td>
                      <td>{s.supplier || '—'}</td>
                      <td>
                        <button type="button" className="btn-ghost" onClick={() => {
                          setEditSpareId(s.id)
                          setSpName(s.part_name)
                          setSpNumber(s.part_number || '')
                          setSpMachine(s.machine_no || '')
                          setSpOpen(String(s.opening_stock))
                          setSpRecv(String(s.received))
                          setSpUsed(String(s.used))
                          setSpMin(String(s.min_stock))
                          setSpRate(String(s.rate))
                          setSpSupplier(s.supplier || '')
                        }}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* ---------- REPORTS ---------- */}
      {sub === 'reports' ? (
        <div className="mwm-reports">
          <div className="mwm-filter-bar surface no-print">
            <label className="field"><span className="text-muted">Report</span>
              <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
                <option value="machine-wise">A. Machine-wise Maintenance</option>
                <option value="breakdown">B. Breakdown Report</option>
                <option value="electrical">C. Electrical Fault</option>
                <option value="mechanical">D. Mechanical Fault</option>
                <option value="parts">E. Parts Replacement</option>
                <option value="technician">F. Technician/Contractor</option>
                <option value="cost">G. Maintenance Cost</option>
                <option value="downtime">H. Downtime</option>
                <option value="comparison">I. Machine Comparison</option>
                <option value="pending">J. Pending Breakdown</option>
              </select></label>
            <label className="field"><span className="text-muted">From</span>
              <input type="date" value={repFilter.dateFrom} onChange={(e) => setRepFilter({ ...repFilter, dateFrom: e.target.value })} /></label>
            <label className="field"><span className="text-muted">To</span>
              <input type="date" value={repFilter.dateTo} onChange={(e) => setRepFilter({ ...repFilter, dateTo: e.target.value })} /></label>
            <label className="field"><span className="text-muted">Machine</span>
              <select value={repFilter.machine} onChange={(e) => setRepFilter({ ...repFilter, machine: e.target.value })}>
                <option value="">All</option>
                {MACHINES.map((m) => <option key={m} value={m}>{machineLabel(m)}</option>)}
              </select></label>
            <label className="field"><span className="text-muted">Fault</span>
              <select value={repFilter.faultType} onChange={(e) => setRepFilter({ ...repFilter, faultType: e.target.value })}>
                <option value="">All</option>
                {FAULT_TYPES.map((f) => <option key={f}>{f}</option>)}
              </select></label>
            <label className="field"><span className="text-muted">Status</span>
              <select value={repFilter.status} onChange={(e) => setRepFilter({ ...repFilter, status: e.target.value })}>
                <option value="">All</option>
                {BREAKDOWN_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select></label>
          </div>

          <div className="mwm-header-actions no-print">
            <ShareActions onPrint={runPrint} />
            <button type="button" className="btn-ghost" onClick={copyReport}>Copy to Clipboard</button>
            <button type="button" className="btn-ghost" onClick={runPrint}>A4 Print / PDF</button>
            <button type="button" className="btn-ghost" onClick={runCsv}>Excel (CSV)</button>
            <button type="button" className="btn-ghost" onClick={() => onNavigate?.({ screen: 'purchase', sub: 'repair_inv', module: 'maintenance' })}>
              Repair Invoices
            </button>
          </div>

          {(() => {
            const r = buildReportRows()
            return (
              <div className="mwm-print-area">
                <div className="mwm-print-header">
                  <strong>JAISAL FW</strong>
                  <div>Fashionweave Industries</div>
                  <h2>{r.name}</h2>
                  <p className="text-muted">
                    {repFilter.dateFrom || '—'} to {repFilter.dateTo || '—'}
                    {repFilter.machine ? ` · ${machineLabel(repFilter.machine)}` : ' · All Machines'}
                  </p>
                </div>
                <div className="table-scroll">
                  <table className="mwm-table">
                    <thead>
                      <tr>{r.cols.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {r.rows.length ? r.rows.map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                      )) : (
                        <tr><td colSpan={r.cols.length}>No records for selected filters</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </div>
      ) : null}
    </div>
  )
}
