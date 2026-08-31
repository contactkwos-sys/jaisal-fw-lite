/**
 * Security Machine & Production Update
 * Extremely simple mobile entry for Security gate staff.
 * Syncs submitted rows into production_entries for ERP dashboard KPIs.
 */

import { MACHINES } from './database.types'
import { todayISO } from './mutate'
import { supabase } from './supabase'

export { MACHINES }

export const STOP_REASONS = [
  'Electronic Fault',
  'Mechanical Fault',
  'Operator Problem',
] as const

export type StopReason = (typeof STOP_REASONS)[number]
export type ShiftKind = 'Day' | 'Night'
export type MachineStatus = 'running' | 'stopped'

export type MachineLineState = {
  machine_no: string
  status: MachineStatus
  stop_reason: StopReason | null
  operator_name: string
  production_mtr: string
}

export type SecurityUpdateDraft = {
  version: 1
  updatedAt: number
  entry_date: string
  shift: ShiftKind
  machines: MachineLineState[]
  submitted: boolean
}

export type SecurityOperator = {
  id: string
  full_name: string
  is_active: boolean
}

export type DashboardMachineRow = {
  machine_no: string
  status: MachineStatus
  day_mtr: number
  night_mtr: number
  total_mtr: number
  stop_reason: string | null
  day_operator: string | null
  night_operator: string | null
}

export type DashboardOperatorRow = {
  operator_name: string
  machines: string[]
  day_mtr: number
  night_mtr: number
  total_mtr: number
}

export type SecurityDashboardSummary = {
  entry_date: string
  day_total: number
  night_total: number
  daily_total: number
  running_count: number
  stopped_count: number
  machines: DashboardMachineRow[]
  operators: DashboardOperatorRow[]
  last_updated: string | null
}

export const SECURITY_DRAFT_KEY = 'jaisal-security-machine-update-draft-v1'
export const SECURITY_OPERATORS_CACHE_KEY = 'jaisal-security-operators-cache-v1'
export const SECURITY_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Day shift roughly 06:00–17:59; Night otherwise. */
export function detectShift(now = new Date()): ShiftKind {
  const h = now.getHours()
  return h >= 6 && h < 18 ? 'Day' : 'Night'
}

export function formatDisplayDate(isoDate: string, now = new Date()): string {
  const d = isoDate ? new Date(`${isoDate}T12:00:00`) : now
  if (Number.isNaN(d.getTime())) {
    return now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDisplayTime(now = new Date()): string {
  return now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function emptyMachineLines(): MachineLineState[] {
  return MACHINES.map((m) => ({
    machine_no: m,
    status: 'running',
    stop_reason: null,
    operator_name: '',
    production_mtr: '',
  }))
}

export function createEmptyDraft(shift?: ShiftKind): SecurityUpdateDraft {
  return {
    version: 1,
    updatedAt: Date.now(),
    entry_date: todayISO(),
    shift: shift ?? detectShift(),
    machines: emptyMachineLines(),
    submitted: false,
  }
}

export function saveSecurityDraft(draft: SecurityUpdateDraft): void {
  try {
    if (typeof localStorage === 'undefined') return
    const payload: SecurityUpdateDraft = { ...draft, version: 1, updatedAt: Date.now(), submitted: false }
    localStorage.setItem(SECURITY_DRAFT_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function clearSecurityDraft(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(SECURITY_DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function loadSecurityDraft(): SecurityUpdateDraft | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(SECURITY_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SecurityUpdateDraft
    if (!parsed || parsed.version !== 1 || parsed.submitted) return null
    if (
      typeof parsed.updatedAt === 'number' &&
      Date.now() - parsed.updatedAt > SECURITY_DRAFT_MAX_AGE_MS
    ) {
      clearSecurityDraft()
      return null
    }
    if (!Array.isArray(parsed.machines) || parsed.machines.length !== MACHINES.length) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function cacheOperatorsLocal(names: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )
    localStorage.setItem(SECURITY_OPERATORS_CACHE_KEY, JSON.stringify(unique))
  } catch {
    /* ignore */
  }
}

export function loadOperatorsLocal(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(SECURITY_OPERATORS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as string[]
    return Array.isArray(parsed) ? parsed.filter(Boolean) : []
  } catch {
    return []
  }
}

export function totalProduction(machines: MachineLineState[]): number {
  return machines.reduce((sum, m) => {
    if (m.status !== 'running') return sum
    const n = Number(m.production_mtr)
    return sum + (Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
}

export function runningMachines(machines: MachineLineState[]): MachineLineState[] {
  return machines.filter((m) => m.status === 'running')
}

export function validateDraft(draft: SecurityUpdateDraft): string | null {
  for (const m of draft.machines) {
    if (m.status === 'stopped' && !m.stop_reason) {
      return `Select stop reason for ${m.machine_no}`
    }
  }
  const running = runningMachines(draft.machines)
  for (const m of running) {
    if (!m.operator_name.trim()) {
      return `Select operator for ${m.machine_no}`
    }
    const n = Number(m.production_mtr)
    if (m.production_mtr.trim() === '' || !Number.isFinite(n) || n < 0) {
      return `Enter production meters for ${m.machine_no}`
    }
  }
  return null
}

/** Build the short WhatsApp / WhatsApp Business message. */
export function buildWhatsAppMessage(draft: SecurityUpdateDraft, now = new Date()): string {
  const dateLabel = formatDisplayDate(draft.entry_date, now)
  const shiftLabel = draft.shift === 'Day' ? 'DAY SHIFT' : 'NIGHT SHIFT'
  const lines: string[] = [`*${dateLabel}*`, `*${shiftLabel}*`, '', '*Machine Run:*']

  for (const m of draft.machines) {
    if (m.status === 'running') {
      lines.push(`${m.machine_no} ✓`)
    } else {
      lines.push(`${m.machine_no} ✕ ${m.stop_reason || ''}`.trim())
    }
  }

  lines.push('', '*Production:*')
  for (const m of runningMachines(draft.machines)) {
    const mtr = Number(m.production_mtr) || 0
    lines.push(`${m.machine_no} - ${fmtMtrPlain(mtr)} Mtr - ${m.operator_name.trim() || '—'}`)
  }

  lines.push('', `*Total Production: ${fmtMtrPlain(totalProduction(draft.machines))} Mtr*`)
  return lines.join('\n')
}

export function fmtMtr(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('en-IN')
}

/** Plain meters for WhatsApp (no thousand separators). */
export function fmtMtrPlain(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(Math.round(n))
}

export async function loadSecurityOperators(): Promise<string[]> {
  const local = loadOperatorsLocal()
  try {
    const { data, error } = await supabase
      .from('security_operators')
      .select('full_name')
      .eq('is_active', true)
      .order('full_name')
    if (error) throw error
    const names = (data ?? []).map((r) => String(r.full_name || '').trim()).filter(Boolean)
    // Also merge active workers as fallback suggestions
    const { data: workers } = await supabase
      .from('workers')
      .select('full_name')
      .eq('is_active', true)
      .limit(200)
    const workerNames = (workers ?? []).map((w) => String(w.full_name || '').trim()).filter(Boolean)
    const merged = [...new Set([...names, ...workerNames, ...local])].sort((a, b) =>
      a.localeCompare(b),
    )
    cacheOperatorsLocal(merged)
    return merged
  } catch {
    return [...new Set(local)].sort((a, b) => a.localeCompare(b))
  }
}

export async function addSecurityOperator(fullName: string): Promise<string> {
  const name = fullName.trim()
  if (!name) throw new Error('Enter operator name')
  if (name.length > 60) throw new Error('Name too long')

  const local = loadOperatorsLocal()
  if (!local.includes(name)) {
    cacheOperatorsLocal([...local, name])
  }

  try {
    const { error } = await supabase.from('security_operators').upsert(
      { full_name: name, is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'full_name' },
    )
    if (error) throw error
  } catch (e) {
    // Keep local cache even if remote table is not migrated yet
    console.warn('addSecurityOperator remote', e)
  }
  return name
}

export type SubmitSecurityUpdateResult = {
  update_id: string
  total_production_mtr: number
  message: string
}

/**
 * Persist submitted update + sync running-machine meters into production_entries
 * so the main ERP Dashboard auto-updates.
 */
export async function submitSecurityUpdate(args: {
  draft: SecurityUpdateDraft
  created_by: string | null
  created_by_name: string | null
  markWhatsAppSent?: boolean
}): Promise<SubmitSecurityUpdateResult> {
  const { draft } = args
  const err = validateDraft(draft)
  if (err) throw new Error(err)

  // Ensure operators exist in master
  const ops = [
    ...new Set(runningMachines(draft.machines).map((m) => m.operator_name.trim()).filter(Boolean)),
  ]
  for (const name of ops) {
    await addSecurityOperator(name)
  }

  const total = totalProduction(draft.machines)
  const nowIso = new Date().toISOString()

  const { data: header, error: hErr } = await supabase
    .from('security_machine_updates')
    .insert({
      entry_date: draft.entry_date,
      shift: draft.shift,
      reported_at: nowIso,
      submitted_at: nowIso,
      status: 'submitted',
      total_production_mtr: total,
      created_by: args.created_by,
      created_by_name: args.created_by_name || 'Security',
      whatsapp_sent: Boolean(args.markWhatsAppSent),
    })
    .select('id')
    .single()
  if (hErr) throw hErr
  const updateId = header.id as string

  const lineRows = []
  for (let i = 0; i < draft.machines.length; i++) {
    const m = draft.machines[i]
    let production_entry_id: string | null = null
    const meters = m.status === 'running' ? Number(m.production_mtr) || 0 : 0

    if (m.status === 'running' && meters >= 0) {
      const { data: pe, error: pErr } = await supabase
        .from('production_entries')
        .insert({
          machine_no: m.machine_no,
          entry_date: draft.entry_date,
          shift: draft.shift,
          operator_name: m.operator_name.trim() || null,
          working_hour: 12,
          total_meter: meters,
        })
        .select('id')
        .single()
      if (pErr) throw pErr
      production_entry_id = pe.id as string
    }

    lineRows.push({
      update_id: updateId,
      machine_no: m.machine_no,
      is_running: m.status === 'running',
      stop_reason: m.status === 'stopped' ? m.stop_reason : null,
      operator_name: m.status === 'running' ? m.operator_name.trim() || null : null,
      production_mtr: meters,
      production_entry_id,
      sr_no: i + 1,
    })
  }

  const { error: lErr } = await supabase.from('security_machine_update_lines').insert(lineRows)
  if (lErr) throw lErr

  clearSecurityDraft()
  return {
    update_id: updateId,
    total_production_mtr: total,
    message: buildWhatsAppMessage(draft),
  }
}

/**
 * Pure helpers for dashboard aggregation — used by smoke tests.
 * Mirrors loadSecurityDashboardSummary reduction without I/O.
 */
export function summarizeSecurityLines(
  entries: Array<{
    shift: ShiftKind
    submitted_at?: string
    lines: Array<{
      machine_no: string
      is_running: boolean
      stop_reason: string | null
      operator_name: string | null
      production_mtr: number
    }>
  }>,
): Pick<
  SecurityDashboardSummary,
  'day_total' | 'night_total' | 'daily_total' | 'running_count' | 'stopped_count' | 'machines' | 'operators'
> {
  const byMachine = new Map<string, DashboardMachineRow>()
  for (const m of MACHINES) {
    byMachine.set(m, {
      machine_no: m,
      status: 'running',
      day_mtr: 0,
      night_mtr: 0,
      total_mtr: 0,
      stop_reason: null,
      day_operator: null,
      night_operator: null,
    })
  }
  let day_total = 0
  let night_total = 0
  const latestStatusSeen = new Set<string>()
  const opMap = new Map<string, DashboardOperatorRow>()

  for (const u of entries) {
    const shift = u.shift
    for (const line of u.lines) {
      const row = byMachine.get(line.machine_no)
      if (!row) continue
      const mtr = Number(line.production_mtr) || 0
      if (shift === 'Day') {
        row.day_mtr += mtr
        day_total += mtr
        if (line.operator_name) row.day_operator = line.operator_name
      } else {
        row.night_mtr += mtr
        night_total += mtr
        if (line.operator_name) row.night_operator = line.operator_name
      }
      row.total_mtr = row.day_mtr + row.night_mtr

      const statusKey = `${line.machine_no}::${shift}`
      if (!latestStatusSeen.has(statusKey)) {
        latestStatusSeen.add(statusKey)
        if (!line.is_running) {
          row.status = 'stopped'
          row.stop_reason = line.stop_reason
        } else if (row.status !== 'stopped') {
          row.status = 'running'
          row.stop_reason = null
        }
      }

      const opName = (line.operator_name || '').trim()
      if (opName && mtr > 0) {
        const existing = opMap.get(opName) || {
          operator_name: opName,
          machines: [],
          day_mtr: 0,
          night_mtr: 0,
          total_mtr: 0,
        }
        if (!existing.machines.includes(line.machine_no)) existing.machines.push(line.machine_no)
        if (shift === 'Day') existing.day_mtr += mtr
        else existing.night_mtr += mtr
        existing.total_mtr = existing.day_mtr + existing.night_mtr
        opMap.set(opName, existing)
      }
    }
  }

  const machines = MACHINES.map((m) => byMachine.get(m)!).filter(Boolean)
  return {
    day_total,
    night_total,
    daily_total: day_total + night_total,
    running_count: machines.filter((m) => m.status === 'running').length,
    stopped_count: machines.filter((m) => m.status === 'stopped').length,
    machines,
    operators: [...opMap.values()].sort((a, b) => b.total_mtr - a.total_mtr),
  }
}

/** Mark WhatsApp sent flag after opening the share link (best-effort). */
export async function markWhatsAppSent(updateId: string): Promise<void> {
  if (!updateId) return
  try {
    await supabase
      .from('security_machine_updates')
      .update({ whatsapp_sent: true, updated_at: new Date().toISOString() })
      .eq('id', updateId)
  } catch {
    /* ignore */
  }
}

export async function loadSecurityDashboardSummary(
  entryDate = todayISO(),
): Promise<SecurityDashboardSummary> {
  const emptyMachines: DashboardMachineRow[] = MACHINES.map((m) => ({
    machine_no: m,
    status: 'running',
    day_mtr: 0,
    night_mtr: 0,
    total_mtr: 0,
    stop_reason: null,
    day_operator: null,
    night_operator: null,
  }))

  try {
    const { data: updates, error } = await supabase
      .from('security_machine_updates')
      .select(
        'id, entry_date, shift, submitted_at, reported_at, total_production_mtr, security_machine_update_lines(*)',
      )
      .eq('entry_date', entryDate)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
    if (error) throw error

    const byMachine = new Map<string, DashboardMachineRow>()
    for (const m of emptyMachines) byMachine.set(m.machine_no, { ...m })

    let day_total = 0
    let night_total = 0
    let last_updated: string | null = null
    const opMap = new Map<string, DashboardOperatorRow>()

    // Prefer latest status per shift for running/stopped; sum production across submissions
    const latestStatusSeen = new Set<string>() // machine+shift

    for (const u of updates ?? []) {
      const shift = (u.shift === 'Night' ? 'Night' : 'Day') as ShiftKind
      const when = String(u.submitted_at || u.reported_at || '')
      if (when && (!last_updated || when > last_updated)) last_updated = when

      const lines = (
        u as {
          security_machine_update_lines?: Array<{
            machine_no: string
            is_running: boolean
            stop_reason: string | null
            operator_name: string | null
            production_mtr: number
          }>
        }
      ).security_machine_update_lines

      for (const line of lines ?? []) {
        const row = byMachine.get(line.machine_no)
        if (!row) continue
        const mtr = Number(line.production_mtr) || 0
        if (shift === 'Day') {
          row.day_mtr += mtr
          day_total += mtr
          if (line.operator_name) row.day_operator = line.operator_name
        } else {
          row.night_mtr += mtr
          night_total += mtr
          if (line.operator_name) row.night_operator = line.operator_name
        }
        row.total_mtr = row.day_mtr + row.night_mtr

        const statusKey = `${line.machine_no}::${shift}`
        if (!latestStatusSeen.has(statusKey)) {
          latestStatusSeen.add(statusKey)
          // Latest update for this shift wins for status (updates ordered desc)
          if (!line.is_running) {
            row.status = 'stopped'
            row.stop_reason = line.stop_reason
          } else if (row.status !== 'stopped') {
            row.status = 'running'
            row.stop_reason = null
          }
        }

        const opName = (line.operator_name || '').trim()
        if (opName && mtr > 0) {
          const existing = opMap.get(opName) || {
            operator_name: opName,
            machines: [],
            day_mtr: 0,
            night_mtr: 0,
            total_mtr: 0,
          }
          if (!existing.machines.includes(line.machine_no)) {
            existing.machines.push(line.machine_no)
          }
          if (shift === 'Day') existing.day_mtr += mtr
          else existing.night_mtr += mtr
          existing.total_mtr = existing.day_mtr + existing.night_mtr
          opMap.set(opName, existing)
        }
      }
    }

    // Fallback: if no security_machine_updates yet, derive meters from production_entries
    if (!(updates ?? []).length) {
      const { data: pe } = await supabase
        .from('production_entries')
        .select('machine_no, shift, operator_name, total_meter, created_at')
        .eq('entry_date', entryDate)
      for (const e of pe ?? []) {
        const row = byMachine.get(String(e.machine_no))
        if (!row) continue
        const mtr = Number(e.total_meter) || 0
        const shift = String(e.shift || '')
        if (/night/i.test(shift)) {
          row.night_mtr += mtr
          night_total += mtr
          if (e.operator_name) row.night_operator = String(e.operator_name)
        } else {
          row.day_mtr += mtr
          day_total += mtr
          if (e.operator_name) row.day_operator = String(e.operator_name)
        }
        row.total_mtr = row.day_mtr + row.night_mtr
        const when = String(e.created_at || '')
        if (when && (!last_updated || when > last_updated)) last_updated = when
        const opName = String(e.operator_name || '').trim()
        if (opName && mtr > 0) {
          const existing = opMap.get(opName) || {
            operator_name: opName,
            machines: [],
            day_mtr: 0,
            night_mtr: 0,
            total_mtr: 0,
          }
          if (!existing.machines.includes(String(e.machine_no))) {
            existing.machines.push(String(e.machine_no))
          }
          if (/night/i.test(shift)) existing.night_mtr += mtr
          else existing.day_mtr += mtr
          existing.total_mtr = existing.day_mtr + existing.night_mtr
          opMap.set(opName, existing)
        }
      }
    }

    const machines = MACHINES.map((m) => byMachine.get(m)!).filter(Boolean)
    const running_count = machines.filter((m) => m.status === 'running').length
    const stopped_count = machines.length - running_count

    return {
      entry_date: entryDate,
      day_total,
      night_total,
      daily_total: day_total + night_total,
      running_count,
      stopped_count,
      machines,
      operators: [...opMap.values()].sort((a, b) => b.total_mtr - a.total_mtr),
      last_updated,
    }
  } catch (e) {
    console.warn('loadSecurityDashboardSummary', e)
    return {
      entry_date: entryDate,
      day_total: 0,
      night_total: 0,
      daily_total: 0,
      running_count: 6,
      stopped_count: 0,
      machines: emptyMachines,
      operators: [],
      last_updated: null,
    }
  }
}
