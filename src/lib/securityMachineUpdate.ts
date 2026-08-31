/**
 * Security Machine & Production Update — data layer.
 * Extremely simple Security-operator flow → ERP production_entries + dashboard.
 */
import { MACHINES } from './database.types'
import { todayISO } from './mutate'
import { supabase } from './supabase'

export const SECURITY_MACHINES = MACHINES

export const STOP_REASONS = [
  'Electronic Fault',
  'Mechanical Fault',
  'Operator Problem',
] as const

export type StopReason = (typeof STOP_REASONS)[number]
export type ShiftName = 'Day' | 'Night'

export type MachineRunState = {
  machine: string
  running: boolean
  stopReason: StopReason | null
  operatorName: string
  productionMeters: string
}

export type SecurityDraft = {
  entryDate: string
  shift: ShiftName
  machines: MachineRunState[]
  updatedAt: string
}

export type SecurityOperator = {
  id: string
  full_name: string
  is_active: boolean
}

export type SecurityShiftMachineRow = {
  id: string
  submission_id: string
  machine_no: string
  is_running: boolean
  stop_reason: string | null
  operator_name: string | null
  production_meters: number
  production_entry_id: string | null
  sort_order: number
}

export type SecurityShiftSubmission = {
  id: string
  entry_date: string
  shift: string
  status: string
  total_production: number
  running_count: number
  stopped_count: number
  submitted_by: string | null
  submitted_at: string
  machines?: SecurityShiftMachineRow[]
}

export type DashboardSecuritySummary = {
  entryDate: string
  dayTotal: number
  nightTotal: number
  dailyTotal: number
  runningMachines: number
  stoppedMachines: number
  machineRows: Array<{
    machine: string
    status: 'Running' | 'Stopped' | '—'
    dayMeters: number
    nightMeters: number
    totalMeters: number
    stopReason: string | null
    dayOperator: string | null
    nightOperator: string | null
  }>
  operatorRows: Array<{
    operator: string
    machines: string[]
    dayMeters: number
    nightMeters: number
    totalMeters: number
  }>
  latestSubmissionAt: string | null
}

const DRAFT_KEY = 'jaisal_fw_security_machine_draft_v1'
const OPERATORS_CACHE_KEY = 'jaisal_fw_security_operators_cache_v1'

export function detectShift(now = new Date()): ShiftName {
  const h = now.getHours()
  // Day 06:00–17:59 · Night 18:00–05:59
  return h >= 6 && h < 18 ? 'Day' : 'Night'
}

export function formatDisplayDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDisplayTime(now = new Date()): string {
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function emptyMachineState(machine: string): MachineRunState {
  return {
    machine,
    running: true,
    stopReason: null,
    operatorName: '',
    productionMeters: '',
  }
}

export function defaultDraft(shift?: ShiftName): SecurityDraft {
  return {
    entryDate: todayISO(),
    shift: shift ?? detectShift(),
    machines: SECURITY_MACHINES.map((m) => emptyMachineState(m)),
    updatedAt: new Date().toISOString(),
  }
}

export function loadDraft(): SecurityDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SecurityDraft
    if (!parsed?.machines?.length) return null
    return parsed
  } catch {
    return null
  }
}

export function saveDraft(draft: SecurityDraft): void {
  const next = { ...draft, updatedAt: new Date().toISOString() }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function cacheOperatorsLocally(names: string[]): void {
  try {
    const prev = loadCachedOperatorNames()
    const merged = [...new Set([...prev, ...names.map((n) => n.trim()).filter(Boolean)])]
    localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify(merged))
  } catch {
    /* ignore */
  }
}

export function loadCachedOperatorNames(): string[] {
  try {
    const raw = localStorage.getItem(OPERATORS_CACHE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr.filter(Boolean) : []
  } catch {
    return []
  }
}

/** Load permanent operator names (DB + local cache merge). */
export async function loadOperators(): Promise<string[]> {
  const cached = loadCachedOperatorNames()
  try {
    const { data, error } = await supabase
      .from('security_operators')
      .select('id, full_name, is_active')
      .eq('is_active', true)
      .order('full_name')
    if (error) throw error
    const fromDb = (data ?? []).map((r) => String(r.full_name || '').trim()).filter(Boolean)
    const merged = [...new Set([...fromDb, ...cached])].sort((a, b) => a.localeCompare(b))
    cacheOperatorsLocally(merged)
    return merged
  } catch {
    return [...new Set(cached)].sort((a, b) => a.localeCompare(b))
  }
}

/** Permanently save a new operator name. */
export async function addOperator(fullName: string, createdBy?: string): Promise<string> {
  const name = fullName.trim()
  if (!name) throw new Error('Enter operator name')
  const nameKey = normalizeNameKey(name)
  cacheOperatorsLocally([name])

  const { data, error } = await supabase
    .from('security_operators')
    .upsert(
      {
        full_name: name,
        name_key: nameKey,
        is_active: true,
        created_by: createdBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name_key' },
    )
    .select('full_name')
    .maybeSingle()

  if (error) {
    // Table may not exist yet — keep local cache so Security can continue
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return name
    }
    throw error
  }
  return data?.full_name || name
}

export function totalProduction(machines: MachineRunState[]): number {
  return machines.reduce((sum, m) => {
    if (!m.running) return sum
    const n = Number(m.productionMeters)
    return sum + (Number.isFinite(n) ? n : 0)
  }, 0)
}

export function buildWhatsAppMessage(draft: SecurityDraft, now = new Date()): string {
  const dateLabel = formatDisplayDate(draft.entryDate)
  const shiftLabel = `${draft.shift.toUpperCase()} SHIFT`
  const lines: string[] = [dateLabel, shiftLabel, '', 'Machine Run:']

  for (const m of draft.machines) {
    if (m.running) {
      lines.push(`${m.machine} ✓`)
    } else {
      const reason = m.stopReason ? ` ${m.stopReason}` : ''
      lines.push(`${m.machine} ✕${reason}`)
    }
  }

  lines.push('', 'Production:')
  const runningWithProd = draft.machines.filter((m) => m.running)
  for (const m of runningWithProd) {
    const meters = Number(m.productionMeters) || 0
    const op = m.operatorName.trim() || '—'
    lines.push(`${m.machine} - ${meters} Mtr - ${op}`)
  }

  const total = totalProduction(draft.machines)
  lines.push('', `Total Production: ${total} Mtr`)
  lines.push('', `Time: ${formatDisplayTime(now)}`)
  return lines.join('\n')
}

export type SubmitResult = {
  submissionId: string
  totalProduction: number
  productionEntryIds: string[]
}

/**
 * Submit shift update:
 * 1) Insert production_entries for running machines (dashboard sync — always)
 * 2) Upsert security_shift_submissions + machines when migration is applied
 * 3) Clear local draft
 */
export async function submitSecurityShiftUpdate(args: {
  draft: SecurityDraft
  submittedBy: string
  submittedByUserId?: string | null
}): Promise<SubmitResult> {
  const { draft, submittedBy, submittedByUserId } = args
  const machines = draft.machines

  for (const m of machines) {
    if (!m.running && !m.stopReason) {
      throw new Error(`Select stop reason for ${m.machine}`)
    }
    if (m.running && !m.operatorName.trim()) {
      throw new Error(`Select operator for ${m.machine}`)
    }
    if (m.running) {
      const meters = Number(m.productionMeters)
      if (!Number.isFinite(meters) || meters < 0) {
        throw new Error(`Enter production meters for ${m.machine}`)
      }
    }
  }

  // Persist any newly typed operators permanently (DB or local cache)
  for (const m of machines) {
    if (m.running && m.operatorName.trim()) {
      await addOperator(m.operatorName, submittedBy)
    }
  }

  const running = machines.filter((m) => m.running)
  const stopped = machines.filter((m) => !m.running)
  const total = totalProduction(machines)
  const productionEntryIds: string[] = []

  // --- Always sync running machines into production_entries (ERP dashboard) ---
  for (const m of running) {
    const meters = Number(m.productionMeters) || 0
    const base = {
      machine_no: m.machine,
      entry_date: draft.entryDate,
      shift: draft.shift,
      operator_name: m.operatorName.trim() || null,
      working_hour: 12,
      total_meter: meters,
    }
    let peId: string | null = null
    const withSource = { ...base, source: 'security_mobile' }
    const { data: pe, error: pErr } = await supabase
      .from('production_entries')
      .insert(withSource)
      .select('id')
      .single()
    if (pErr) {
      if (/source|column/i.test(pErr.message)) {
        const { data: pe2, error: pErr2 } = await supabase
          .from('production_entries')
          .insert(base)
          .select('id')
          .single()
        if (pErr2) throw pErr2
        peId = pe2?.id ?? null
      } else {
        throw pErr
      }
    } else {
      peId = pe?.id ?? null
    }
    if (peId) productionEntryIds.push(peId)
  }

  // --- Optional security_* tables (machine status / stop reasons for dashboard) ---
  let submissionId = `local-${Date.now()}`
  try {
    const { data: existing } = await supabase
      .from('security_shift_submissions')
      .select('id')
      .eq('entry_date', draft.entryDate)
      .eq('shift', draft.shift)
      .eq('status', 'submitted')
      .maybeSingle()

    if (existing?.id) {
      await supabase.from('security_shift_machines').delete().eq('submission_id', existing.id)
      await supabase.from('security_shift_submissions').delete().eq('id', existing.id)
    }

    const { data: header, error: hErr } = await supabase
      .from('security_shift_submissions')
      .insert({
        entry_date: draft.entryDate,
        shift: draft.shift,
        status: 'submitted',
        total_production: total,
        running_count: running.length,
        stopped_count: stopped.length,
        submitted_by: submittedBy,
        submitted_by_user_id: submittedByUserId || null,
        submitted_at: new Date().toISOString(),
        whatsapp_sent: true,
      })
      .select('id')
      .single()

    if (!hErr && header?.id) {
      submissionId = header.id as string
      const peByMachine = new Map<string, string>()
      // Map production entry ids in running order
      running.forEach((m, idx) => {
        if (productionEntryIds[idx]) peByMachine.set(m.machine, productionEntryIds[idx])
      })
      const machineRows = machines.map((m, i) => ({
        submission_id: submissionId,
        machine_no: m.machine,
        is_running: m.running,
        stop_reason: m.running ? null : m.stopReason,
        operator_name: m.running ? m.operatorName.trim() || null : null,
        production_meters: m.running ? Number(m.productionMeters) || 0 : 0,
        production_entry_id: peByMachine.get(m.machine) || null,
        sort_order: i,
      }))
      await supabase.from('security_shift_machines').insert(machineRows)
    }
  } catch {
    // Migration not applied yet — production_entries sync above is enough for dashboard meters
  }

  // Persist a local mirror so dashboard fallback / reopen still has status context
  try {
    localStorage.setItem(
      `jaisal_fw_security_last_submit_${draft.entryDate}_${draft.shift}`,
      JSON.stringify({
        entryDate: draft.entryDate,
        shift: draft.shift,
        machines,
        total,
        submittedAt: new Date().toISOString(),
      }),
    )
  } catch {
    /* ignore */
  }

  clearDraft()
  return { submissionId, totalProduction: total, productionEntryIds }
}

/** Load latest submitted machines for a date (both shifts) for dashboard. */
export async function loadDashboardSecuritySummary(entryDate = todayISO()): Promise<DashboardSecuritySummary> {
  const empty: DashboardSecuritySummary = {
    entryDate,
    dayTotal: 0,
    nightTotal: 0,
    dailyTotal: 0,
    runningMachines: 0,
    stoppedMachines: 0,
    machineRows: SECURITY_MACHINES.map((machine) => ({
      machine,
      status: '—',
      dayMeters: 0,
      nightMeters: 0,
      totalMeters: 0,
      stopReason: null,
      dayOperator: null,
      nightOperator: null,
    })),
    operatorRows: [],
    latestSubmissionAt: null,
  }

  const { data: subs, error } = await supabase
    .from('security_shift_submissions')
    .select('id, entry_date, shift, total_production, running_count, stopped_count, submitted_at, status')
    .eq('entry_date', entryDate)
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: false })

  if (error || !subs?.length) {
    // Fallback: aggregate from production_entries only
    return loadSummaryFromProductionEntries(entryDate, empty)
  }

  const subIds = subs.map((s) => s.id)
  const { data: lines } = await supabase
    .from('security_shift_machines')
    .select('*')
    .in('submission_id', subIds)

  const daySub = subs.find((s) => s.shift === 'Day')
  const nightSub = subs.find((s) => s.shift === 'Night')
  const dayTotal = Number(daySub?.total_production || 0)
  const nightTotal = Number(nightSub?.total_production || 0)

  const byMachine = new Map(
    SECURITY_MACHINES.map((machine) => [
      machine,
      {
        machine,
        status: '—' as 'Running' | 'Stopped' | '—',
        dayMeters: 0,
        nightMeters: 0,
        totalMeters: 0,
        stopReason: null as string | null,
        dayOperator: null as string | null,
        nightOperator: null as string | null,
      },
    ]),
  )

  const opMap = new Map<
    string,
    { operator: string; machines: Set<string>; dayMeters: number; nightMeters: number; totalMeters: number }
  >()

  let latestAt: string | null = null
  let runningMachines = 0
  let stoppedMachines = 0

  // Prefer most recent submission's live status for "current" running/stopped
  const latest = subs[0]
  latestAt = latest?.submitted_at ?? null

  for (const line of lines ?? []) {
    const sub = subs.find((s) => s.id === line.submission_id)
    if (!sub) continue
    const row = byMachine.get(line.machine_no)
    if (!row) continue
    const meters = Number(line.production_meters || 0)
    if (sub.shift === 'Day') {
      row.dayMeters += meters
      if (line.operator_name) row.dayOperator = line.operator_name
    } else {
      row.nightMeters += meters
      if (line.operator_name) row.nightOperator = line.operator_name
    }
    row.totalMeters = row.dayMeters + row.nightMeters
    if (line.stop_reason) row.stopReason = line.stop_reason

    if (line.operator_name) {
      const key = line.operator_name.trim()
      const prev = opMap.get(key) || {
        operator: key,
        machines: new Set<string>(),
        dayMeters: 0,
        nightMeters: 0,
        totalMeters: 0,
      }
      prev.machines.add(line.machine_no)
      if (sub.shift === 'Day') prev.dayMeters += meters
      else prev.nightMeters += meters
      prev.totalMeters = prev.dayMeters + prev.nightMeters
      opMap.set(key, prev)
    }
  }

  // Status from latest submission for the preferred shift (or latest overall)
  const statusSubId = latest?.id
  for (const line of (lines ?? []).filter((l) => l.submission_id === statusSubId)) {
    const row = byMachine.get(line.machine_no)
    if (!row) continue
    row.status = line.is_running ? 'Running' : 'Stopped'
    if (!line.is_running) {
      stoppedMachines += 1
      row.stopReason = line.stop_reason
    } else {
      runningMachines += 1
    }
  }

  return {
    entryDate,
    dayTotal,
    nightTotal,
    dailyTotal: dayTotal + nightTotal,
    runningMachines,
    stoppedMachines,
    machineRows: [...byMachine.values()],
    operatorRows: [...opMap.values()]
      .map((o) => ({
        operator: o.operator,
        machines: [...o.machines].sort(),
        dayMeters: o.dayMeters,
        nightMeters: o.nightMeters,
        totalMeters: o.totalMeters,
      }))
      .sort((a, b) => b.totalMeters - a.totalMeters),
    latestSubmissionAt: latestAt,
  }
}

async function loadSummaryFromProductionEntries(
  entryDate: string,
  empty: DashboardSecuritySummary,
): Promise<DashboardSecuritySummary> {
  const { data } = await supabase
    .from('production_entries')
    .select('machine_no, shift, operator_name, total_meter, created_at')
    .eq('entry_date', entryDate)

  if (!data?.length) return empty

  const byMachine = new Map(empty.machineRows.map((r) => [r.machine, { ...r }]))
  const opMap = new Map<
    string,
    { operator: string; machines: Set<string>; dayMeters: number; nightMeters: number; totalMeters: number }
  >()
  let dayTotal = 0
  let nightTotal = 0
  let latestAt: string | null = null

  for (const row of data) {
    const machine = String(row.machine_no || '')
    const meters = Number(row.total_meter || 0)
    const shift = String(row.shift || '')
    const m = byMachine.get(machine)
    if (m) {
      if (shift === 'Night') {
        m.nightMeters += meters
        nightTotal += meters
        if (row.operator_name) m.nightOperator = row.operator_name
      } else {
        m.dayMeters += meters
        dayTotal += meters
        if (row.operator_name) m.dayOperator = row.operator_name
      }
      m.totalMeters = m.dayMeters + m.nightMeters
      if (m.totalMeters > 0) m.status = 'Running'
    }
    if (row.operator_name) {
      const key = String(row.operator_name).trim()
      const prev = opMap.get(key) || {
        operator: key,
        machines: new Set<string>(),
        dayMeters: 0,
        nightMeters: 0,
        totalMeters: 0,
      }
      if (machine) prev.machines.add(machine)
      if (shift === 'Night') prev.nightMeters += meters
      else prev.dayMeters += meters
      prev.totalMeters = prev.dayMeters + prev.nightMeters
      opMap.set(key, prev)
    }
    if (row.created_at && (!latestAt || row.created_at > latestAt)) latestAt = row.created_at
  }

  const machineRows = [...byMachine.values()]
  return {
    entryDate,
    dayTotal,
    nightTotal,
    dailyTotal: dayTotal + nightTotal,
    runningMachines: machineRows.filter((r) => r.status === 'Running').length,
    stoppedMachines: machineRows.filter((r) => r.status === 'Stopped').length,
    machineRows,
    operatorRows: [...opMap.values()]
      .map((o) => ({
        operator: o.operator,
        machines: [...o.machines].sort(),
        dayMeters: o.dayMeters,
        nightMeters: o.nightMeters,
        totalMeters: o.totalMeters,
      }))
      .sort((a, b) => b.totalMeters - a.totalMeters),
    latestSubmissionAt: latestAt,
  }
}
