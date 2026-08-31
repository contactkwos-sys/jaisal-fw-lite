/**
 * Security Machine & Production Update — simple Security-only gate entry.
 * Persists operators permanently, drafts in localStorage, syncs to ERP DB + production_entries.
 */

import { MACHINES } from './database.types'
import { todayISO } from './mutate'
import { supabase } from './supabase'

export { MACHINES }

export const STOP_REASONS = ['Electronic Fault', 'Mechanical Fault', 'Operator Problem'] as const
export type StopReason = (typeof STOP_REASONS)[number]
export type RunStatus = 'Running' | 'Stopped'
export type ShiftKind = 'Day' | 'Night'

export type MachineLineState = {
  machine_no: (typeof MACHINES)[number]
  run_status: RunStatus
  stop_reason: StopReason | ''
  operator_name: string
  production_meter: string
}

export type SecurityDraft = {
  entry_date: string
  shift: ShiftKind
  machines: MachineLineState[]
  updated_at: string
}

export type SecurityOperator = {
  id: string
  name: string
  is_active: boolean
  created_at: string
}

export type SecurityUpdateLine = {
  id: string
  update_id: string
  machine_no: string
  run_status: RunStatus
  stop_reason: string | null
  operator_name: string | null
  production_meter: number
  created_at: string
}

export type SecurityUpdate = {
  id: string
  entry_date: string
  shift: ShiftKind
  total_production: number
  running_count: number
  stopped_count: number
  status: string
  whatsapp_channel: string | null
  submitted_by: string | null
  submitted_by_name: string | null
  submitted_at: string
  created_at: string
  lines?: SecurityUpdateLine[]
}

export type DashboardMachineRow = {
  machine_no: string
  status: RunStatus
  day_production: number
  night_production: number
  total: number
  stop_reason: string | null
}

export type DashboardOperatorRow = {
  operator_name: string
  machines: string[]
  day_production: number
  night_production: number
  total: number
}

export type SecurityDashboardSummary = {
  entry_date: string
  day_total: number
  night_total: number
  daily_total: number
  running: number
  stopped: number
  machines: DashboardMachineRow[]
  operators: DashboardOperatorRow[]
  cumulative_by_machine: Array<{ machine_no: string; total: number }>
  operator_performance: Array<{ operator_name: string; total: number; shifts: number }>
}

const DRAFT_KEY = 'jaisal_security_machine_draft_v1'
const OPERATORS_CACHE_KEY = 'jaisal_security_operators_cache_v1'

export function defaultShift(now = new Date()): ShiftKind {
  const h = now.getHours()
  // Day 07:00–18:59, Night otherwise
  return h >= 7 && h < 19 ? 'Day' : 'Night'
}

export function emptyMachines(): MachineLineState[] {
  return MACHINES.map((machine_no) => ({
    machine_no,
    run_status: 'Running' as RunStatus,
    stop_reason: '' as const,
    operator_name: '',
    production_meter: '',
  }))
}

export function emptyDraft(shift?: ShiftKind): SecurityDraft {
  return {
    entry_date: todayISO(),
    shift: shift ?? defaultShift(),
    machines: emptyMachines(),
    updated_at: new Date().toISOString(),
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
  const next = { ...draft, updated_at: new Date().toISOString() }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}

export function cacheOperatorsLocal(names: string[]): void {
  localStorage.setItem(OPERATORS_CACHE_KEY, JSON.stringify(names))
}

export function loadOperatorsLocal(): string[] {
  try {
    const raw = localStorage.getItem(OPERATORS_CACHE_KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as string[]
    return Array.isArray(list) ? list.filter((n) => String(n || '').trim()) : []
  } catch {
    return []
  }
}

export function formatDisplayDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDisplayTime(now = new Date()): string {
  return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export function totalProduction(machines: MachineLineState[]): number {
  return machines.reduce((sum, m) => {
    if (m.run_status !== 'Running') return sum
    const n = Number(m.production_meter)
    return sum + (Number.isFinite(n) ? Math.max(0, n) : 0)
  }, 0)
}

export function buildWhatsAppMessage(
  draft: SecurityDraft,
  opts?: { now?: Date },
): string {
  const now = opts?.now ?? new Date()
  const lines: string[] = []
  lines.push(formatDisplayDate(draft.entry_date))
  lines.push(`${draft.shift.toUpperCase()} SHIFT`)
  lines.push('')
  lines.push('Machine Run:')
  for (const m of draft.machines) {
    if (m.run_status === 'Running') {
      lines.push(`${m.machine_no} ✓`)
    } else {
      const reason = m.stop_reason ? ` ${m.stop_reason}` : ''
      lines.push(`${m.machine_no} ✕${reason}`)
    }
  }
  lines.push('')
  lines.push('Production:')
  for (const m of draft.machines) {
    if (m.run_status !== 'Running') continue
    const meters = Number(m.production_meter) || 0
    const op = (m.operator_name || '').trim() || '—'
    lines.push(`${m.machine_no} - ${meters} Mtr - ${op}`)
  }
  lines.push('')
  lines.push(`Total Production: ${totalProduction(draft.machines)} Mtr`)
  lines.push('')
  lines.push(`Time: ${formatDisplayTime(now)}`)
  return lines.join('\n')
}

export function validateDraft(draft: SecurityDraft): string | null {
  for (const m of draft.machines) {
    if (m.run_status === 'Stopped' && !m.stop_reason) {
      return `Select stop reason for ${m.machine_no}`
    }
    if (m.run_status === 'Running') {
      const meters = Number(m.production_meter)
      if (!m.production_meter.trim() || !Number.isFinite(meters) || meters < 0) {
        return `Enter production meters for ${m.machine_no}`
      }
      if (!(m.operator_name || '').trim()) {
        return `Select operator for ${m.machine_no}`
      }
    }
  }
  return null
}

export async function loadOperators(): Promise<string[]> {
  const local = loadOperatorsLocal()
  const { data, error } = await supabase
    .from('security_operators')
    .select('id, name, is_active, created_at')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error || !data) {
    return local
  }
  const names = (data as SecurityOperator[]).map((r) => r.name).filter(Boolean)
  const merged = Array.from(new Set([...names, ...local])).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
  cacheOperatorsLocal(merged)
  return merged
}

export async function addOperator(name: string, userId?: string | null): Promise<string> {
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) throw new Error('Enter operator name')
  if (cleaned.length < 2) throw new Error('Operator name too short')

  const { data, error } = await supabase
    .from('security_operators')
    .upsert(
      {
        name: cleaned,
        is_active: true,
        created_by: userId || null,
      },
      { onConflict: 'name' },
    )
    .select('name')
    .maybeSingle()

  if (error) {
    // Fallback: keep local so Security can continue
    const local = loadOperatorsLocal()
    if (!local.some((n) => n.toLowerCase() === cleaned.toLowerCase())) {
      cacheOperatorsLocal([...local, cleaned].sort((a, b) => a.localeCompare(b)))
    }
    // Unique violation may still succeed conceptually
    if (!/duplicate|unique/i.test(error.message)) {
      throw new Error(error.message || 'Could not save operator')
    }
  }

  const saved = data?.name || cleaned
  const local = loadOperatorsLocal()
  if (!local.some((n) => n.toLowerCase() === saved.toLowerCase())) {
    cacheOperatorsLocal([...local, saved].sort((a, b) => a.localeCompare(b)))
  } else {
    cacheOperatorsLocal(
      Array.from(new Set([...local, saved])).sort((a, b) => a.localeCompare(b)),
    )
  }
  return saved
}

export async function submitSecurityUpdate(args: {
  draft: SecurityDraft
  userId: string | null
  userName: string
  whatsappChannel: 'WhatsApp' | 'WhatsApp Business'
}): Promise<{ updateId: string; total: number }> {
  const err = validateDraft(args.draft)
  if (err) throw new Error(err)

  const machines = args.draft.machines
  const total = totalProduction(machines)
  const running = machines.filter((m) => m.run_status === 'Running').length
  const stopped = machines.length - running

  // Replace prior submission for same date+shift
  const { data: existing } = await supabase
    .from('security_machine_updates')
    .select('id')
    .eq('entry_date', args.draft.entry_date)
    .eq('shift', args.draft.shift)
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('security_machine_update_lines').delete().eq('update_id', existing.id)
    await supabase.from('security_machine_updates').delete().eq('id', existing.id)
  }

  // Remove prior security-sourced production_entries for this date+shift (tagged via remarks pattern not available)
  // Match by date+shift+machine without program_id to avoid wiping program-linked entries
  const { data: priorProd } = await supabase
    .from('production_entries')
    .select('id, machine_no, program_id')
    .eq('entry_date', args.draft.entry_date)
    .eq('shift', args.draft.shift)
    .is('program_id', null)

  if (priorProd?.length) {
    const ids = priorProd
      .filter((r) => MACHINES.includes(r.machine_no as (typeof MACHINES)[number]))
      .map((r) => r.id)
    if (ids.length) {
      await supabase.from('production_entries').delete().in('id', ids)
    }
  }

  const { data: header, error: hErr } = await supabase
    .from('security_machine_updates')
    .insert({
      entry_date: args.draft.entry_date,
      shift: args.draft.shift,
      total_production: total,
      running_count: running,
      stopped_count: stopped,
      status: 'submitted',
      whatsapp_channel: args.whatsappChannel,
      submitted_by: args.userId,
      submitted_by_name: args.userName,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (hErr || !header) {
    throw new Error(hErr?.message || 'Could not save update. Apply migration-security-machine-production.sql')
  }

  const lineRows = machines.map((m) => ({
    update_id: header.id as string,
    machine_no: m.machine_no,
    run_status: m.run_status,
    stop_reason: m.run_status === 'Stopped' ? m.stop_reason || null : null,
    operator_name: m.run_status === 'Running' ? m.operator_name.trim() : null,
    production_meter: m.run_status === 'Running' ? Number(m.production_meter) || 0 : 0,
  }))

  const { error: lErr } = await supabase.from('security_machine_update_lines').insert(lineRows)
  if (lErr) throw new Error(lErr.message || 'Could not save machine lines')

  // Sync running machines into production_entries for existing ERP dashboard KPIs
  const prodRows = machines
    .filter((m) => m.run_status === 'Running' && Number(m.production_meter) > 0)
    .map((m) => ({
      machine_no: m.machine_no,
      entry_date: args.draft.entry_date,
      shift: args.draft.shift,
      operator_name: m.operator_name.trim(),
      working_hour: 12,
      total_meter: Number(m.production_meter) || 0,
      program_id: null,
    }))

  if (prodRows.length) {
    const { error: pErr } = await supabase.from('production_entries').insert(prodRows)
    if (pErr) {
      // Do not fail the security save if production_entries insert has a schema quirk
      console.warn('security sync production_entries', pErr.message)
    }
  }

  clearDraft()
  return { updateId: header.id as string, total }
}

export async function loadSecurityDashboard(entryDate: string): Promise<SecurityDashboardSummary> {
  const { data: updates, error } = await supabase
    .from('security_machine_updates')
    .select('*, security_machine_update_lines(*)')
    .eq('entry_date', entryDate)

  if (error) {
    return {
      entry_date: entryDate,
      day_total: 0,
      night_total: 0,
      daily_total: 0,
      running: 0,
      stopped: 0,
      machines: MACHINES.map((m) => ({
        machine_no: m,
        status: 'Running',
        day_production: 0,
        night_production: 0,
        total: 0,
        stop_reason: null,
      })),
      operators: [],
      cumulative_by_machine: MACHINES.map((m) => ({ machine_no: m, total: 0 })),
      operator_performance: [],
    }
  }

  const list = (updates || []) as Array<
    SecurityUpdate & { security_machine_update_lines?: SecurityUpdateLine[] }
  >

  const day = list.find((u) => u.shift === 'Day')
  const night = list.find((u) => u.shift === 'Night')
  const dayLines = day?.security_machine_update_lines || []
  const nightLines = night?.security_machine_update_lines || []

  const day_total = Number(day?.total_production || 0)
  const night_total = Number(night?.total_production || 0)

  const latest = night || day
  const latestLines = latest?.security_machine_update_lines || []
  let running = 0
  let stopped = 0
  for (const l of latestLines) {
    if (l.run_status === 'Running') running += 1
    else stopped += 1
  }

  const machines: DashboardMachineRow[] = MACHINES.map((m) => {
    const d = dayLines.find((l) => l.machine_no === m)
    const n = nightLines.find((l) => l.machine_no === m)
    const statusLine = (night ? n : d) || d || n
    const day_production = d?.run_status === 'Running' ? Number(d.production_meter || 0) : 0
    const night_production = n?.run_status === 'Running' ? Number(n.production_meter || 0) : 0
    return {
      machine_no: m,
      status: (statusLine?.run_status as RunStatus) || 'Running',
      day_production,
      night_production,
      total: day_production + night_production,
      stop_reason: statusLine?.run_status === 'Stopped' ? statusLine.stop_reason : null,
    }
  })

  const opMap = new Map<string, DashboardOperatorRow>()
  for (const [shift, lines] of [
    ['Day', dayLines],
    ['Night', nightLines],
  ] as const) {
    for (const l of lines) {
      if (l.run_status !== 'Running' || !l.operator_name) continue
      const key = l.operator_name.trim()
      const row = opMap.get(key) || {
        operator_name: key,
        machines: [],
        day_production: 0,
        night_production: 0,
        total: 0,
      }
      if (!row.machines.includes(l.machine_no)) row.machines.push(l.machine_no)
      const meters = Number(l.production_meter || 0)
      if (shift === 'Day') row.day_production += meters
      else row.night_production += meters
      row.total = row.day_production + row.night_production
      opMap.set(key, row)
    }
  }

  // Cumulative (all dates) — best-effort
  const { data: allLines } = await supabase
    .from('security_machine_update_lines')
    .select('machine_no, operator_name, production_meter, run_status, update_id')

  const cumMachine = new Map<string, number>()
  const cumOp = new Map<string, { total: number; updates: Set<string> }>()
  for (const m of MACHINES) cumMachine.set(m, 0)

  for (const l of allLines || []) {
    if (l.run_status !== 'Running') continue
    const meters = Number(l.production_meter || 0)
    if (MACHINES.includes(l.machine_no as (typeof MACHINES)[number])) {
      cumMachine.set(l.machine_no, (cumMachine.get(l.machine_no) || 0) + meters)
    }
    const op = (l.operator_name || '').trim()
    if (op) {
      const cur = cumOp.get(op) || { total: 0, updates: new Set<string>() }
      cur.total += meters
      if (l.update_id) cur.updates.add(String(l.update_id))
      cumOp.set(op, cur)
    }
  }

  return {
    entry_date: entryDate,
    day_total,
    night_total,
    daily_total: day_total + night_total,
    running,
    stopped,
    machines,
    operators: Array.from(opMap.values()).sort((a, b) => b.total - a.total),
    cumulative_by_machine: MACHINES.map((m) => ({
      machine_no: m,
      total: cumMachine.get(m) || 0,
    })),
    operator_performance: Array.from(cumOp.entries())
      .map(([operator_name, v]) => ({
        operator_name,
        total: v.total,
        shifts: v.updates.size,
      }))
      .sort((a, b) => b.total - a.total),
  }
}
