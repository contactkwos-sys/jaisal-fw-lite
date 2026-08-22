/**
 * Daily Pending Work (Factory) — business logic
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { whatsAppTo } from './machineMaintenance'
import { todayISO } from './mutate'
import { shareWhatsAppBusiness } from './share'

export const FACTORY_MACHINES = [
  { code: 'M1', label: 'M-01', name: 'Rapier Loom - 01' },
  { code: 'M2', label: 'M-02', name: 'Rapier Loom - 02' },
  { code: 'M3', label: 'M-03', name: 'Rapier Loom - 03' },
  { code: 'M4', label: 'M-04', name: 'Rapier Loom - 04' },
  { code: 'M5', label: 'M-05', name: 'Rapier Loom - 05' },
  { code: 'M6', label: 'M-06', name: 'Circular Knitting - 01' },
  { code: 'OTR', label: 'OTH', name: 'Others / Utility' },
] as const

export const MACHINE_STATUSES = [
  'Running OK',
  'Warning',
  'Error / Issue',
  'Stopped',
  'Under Maintenance',
] as const

export const WORK_STATUSES = ['Pending', 'In Progress', 'Completed', 'Carry Forward'] as const

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const

export type DpwWork = {
  id: string
  work_id: string
  work_date: string
  work_category: 'machine' | 'general' | string
  work_time: string | null
  machine_no: string | null
  machine_name: string | null
  area: string | null
  work_description: string | null
  common_problem_id: string | null
  machine_status: string | null
  status: string
  priority: string | null
  assigned_to: string | null
  contact_id: string | null
  contact_source: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_phone_business: string | null
  remarks: string | null
  is_carry_forward: boolean
  original_work_date: string | null
  carry_forward_to_date: string | null
  parent_work_id: string | null
  completed_at: string | null
  completed_by: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type DpwCommonProblem = {
  id: string
  problem_text: string
  name_key: string
  usage_count: number
}

export type DpwCommHistory = {
  id: string
  work_id: string
  activity: string
  communication_mode: string | null
  message: string | null
  person: string | null
  activity_at: string
}

export type DpwStatusHistory = {
  id: string
  work_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  remarks: string | null
  changed_at: string
}

export type AssignableContact = {
  id: string
  name: string
  phone: string | null
  phoneBusiness: string | null
  source: 'maint_contacts' | 'order_service_providers'
  category?: string
}

export type DpwKpis = {
  total: number
  pending: number
  inProgress: number
  completed: number
  carryForward: number
}

export function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

export function machineDisplay(code: string): string {
  const m = FACTORY_MACHINES.find((x) => x.code === code)
  return m ? `${m.label} ${m.name}` : code
}

export function machineLabelOnly(code: string): string {
  return FACTORY_MACHINES.find((x) => x.code === code)?.label || code
}

export function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase()
  if (['completed', 'running ok'].includes(s)) return 'dpw-badge dpw-badge-ok'
  if (['in progress', 'warning'].includes(s)) return 'dpw-badge dpw-badge-warn'
  if (['pending', 'carry forward'].includes(s)) return 'dpw-badge dpw-badge-pending'
  if (['error / issue', 'stopped', 'critical', 'high'].includes(s)) return 'dpw-badge dpw-badge-danger'
  return 'dpw-badge'
}

export function priorityBadgeClass(p: string): string {
  const s = (p || '').toLowerCase()
  if (s === 'critical' || s === 'high') return 'dpw-badge dpw-badge-danger'
  if (s === 'medium') return 'dpw-badge dpw-badge-warn'
  return 'dpw-badge dpw-badge-slate'
}

export function computeKpis(works: DpwWork[]): DpwKpis {
  return {
    total: works.length,
    pending: works.filter((w) => w.status === 'Pending').length,
    inProgress: works.filter((w) => w.status === 'In Progress').length,
    completed: works.filter((w) => w.status === 'Completed').length,
    carryForward: works.filter((w) => w.status === 'Carry Forward' || w.is_carry_forward).length,
  }
}

export async function nextWorkId(client: SupabaseClient): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `DPW-${year}-`
  const { data } = await client
    .from('dpw_daily_works')
    .select('work_id')
    .like('work_id', `${prefix}%`)
    .order('work_id', { ascending: false })
    .limit(50)
  let max = 0
  for (const row of data ?? []) {
    const m = String(row.work_id || '').match(/-(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

export async function loadCommonProblems(client: SupabaseClient): Promise<DpwCommonProblem[]> {
  const { data, error } = await client.from('dpw_common_problems').select('*').order('usage_count', { ascending: false })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as DpwCommonProblem[]) ?? []
}

export async function ensureCommonProblem(client: SupabaseClient, text: string): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null
  const key = nameKey(trimmed)
  const { data: existing } = await client.from('dpw_common_problems').select('id').eq('name_key', key).maybeSingle()
  if (existing?.id) {
    await client.from('dpw_common_problems').update({ usage_count: (existing as { usage_count?: number }).usage_count || 0 }).eq('id', existing.id)
    return existing.id
  }
  const { data, error } = await client.from('dpw_common_problems').insert({ problem_text: trimmed, name_key: key, usage_count: 1 }).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function loadAssignableContacts(client: SupabaseClient): Promise<AssignableContact[]> {
  const contacts: AssignableContact[] = []
  const { data: maint } = await client.from('maint_contacts').select('*').eq('is_active', true).order('contact_name')
  for (const c of maint ?? []) {
    contacts.push({
      id: c.id,
      name: c.contact_name,
      phone: c.mobile1,
      phoneBusiness: c.mobile2,
      source: 'maint_contacts',
      category: c.category,
    })
  }
  const { data: providers } = await client.from('order_service_providers').select('*').order('company_name')
  for (const p of providers ?? []) {
    contacts.push({
      id: p.id,
      name: p.company_name + (p.contact_person ? ` · ${p.contact_person}` : ''),
      phone: p.whatsapp || p.mobile,
      phoneBusiness: p.whatsapp_business,
      source: 'order_service_providers',
      category: p.specialization,
    })
  }
  return contacts
}

export async function loadWorksForDate(client: SupabaseClient, date: string): Promise<DpwWork[]> {
  const { data: onDate, error: e1 } = await client
    .from('dpw_daily_works')
    .select('*')
    .eq('work_date', date)
    .order('created_at')
  if (e1) {
    if (/relation .* does not exist/i.test(e1.message)) return []
    throw e1
  }
  const { data: carried } = await client
    .from('dpw_daily_works')
    .select('*')
    .eq('carry_forward_to_date', date)
    .neq('status', 'Completed')
  const map = new Map<string, DpwWork>()
  for (const w of [...(onDate ?? []), ...(carried ?? [])] as DpwWork[]) {
    map.set(w.id, w)
  }
  return Array.from(map.values())
}

export async function loadAllWorks(client: SupabaseClient, filters?: {
  dateFrom?: string
  dateTo?: string
  machine?: string
  status?: string
  priority?: string
  assigned?: string
  search?: string
}): Promise<DpwWork[]> {
  let q = client.from('dpw_daily_works').select('*').order('work_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
  if (filters?.dateFrom) q = q.gte('work_date', filters.dateFrom)
  if (filters?.dateTo) q = q.lte('work_date', filters.dateTo)
  if (filters?.machine) q = q.eq('machine_no', filters.machine)
  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.priority) q = q.eq('priority', filters.priority)
  const { data, error } = await q
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  let rows = (data as DpwWork[]) ?? []
  if (filters?.assigned) {
    const a = filters.assigned.toLowerCase()
    rows = rows.filter((w) => (w.assigned_to || '').toLowerCase().includes(a))
  }
  if (filters?.search) {
    const s = filters.search.toLowerCase()
    rows = rows.filter((w) =>
      [w.work_id, w.work_description, w.machine_name, w.area, w.assigned_to, w.remarks]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(s),
    )
  }
  return rows
}

export async function loadCarryForwardWorks(client: SupabaseClient): Promise<DpwWork[]> {
  const { data, error } = await client
    .from('dpw_daily_works')
    .select('*')
    .in('status', ['Carry Forward', 'Pending', 'In Progress'])
    .or('is_carry_forward.eq.true,status.eq.Carry Forward')
    .order('original_work_date', { ascending: true })
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as DpwWork[]) ?? []
}

export async function addStatusHistory(
  client: SupabaseClient,
  workId: string,
  oldStatus: string | null,
  newStatus: string,
  changedBy: string,
  remarks?: string,
): Promise<void> {
  await client.from('dpw_work_status_history').insert({
    work_id: workId,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: changedBy,
    remarks: remarks || null,
  })
}

export async function addCommHistory(
  client: SupabaseClient,
  workId: string,
  activity: string,
  person: string,
  mode?: string,
  message?: string,
): Promise<void> {
  await client.from('dpw_work_communication_history').insert({
    work_id: workId,
    activity,
    person,
    communication_mode: mode || null,
    message: message || null,
  })
}

export type SaveWorkInput = Partial<DpwWork> & {
  work_category: 'machine' | 'general'
  work_date: string
  created_by: string
}

export async function saveWork(client: SupabaseClient, input: SaveWorkInput): Promise<DpwWork> {
  const now = new Date().toISOString()
  let problemId = input.common_problem_id
  if (input.work_description?.trim()) {
    problemId = (await ensureCommonProblem(client, input.work_description)) || problemId
  }

  const payload = {
    work_date: input.work_date,
    work_category: input.work_category,
    work_time: input.work_time || null,
    machine_no: input.machine_no || null,
    machine_name: input.machine_name || null,
    area: input.area || null,
    work_description: input.work_description?.trim() || null,
    common_problem_id: problemId,
    machine_status: input.machine_status || null,
    status: input.status || 'Pending',
    priority: input.priority || 'Medium',
    assigned_to: input.assigned_to || null,
    contact_id: input.contact_id || null,
    contact_source: input.contact_source || null,
    contact_name: input.contact_name || null,
    contact_phone: input.contact_phone || null,
    contact_phone_business: input.contact_phone_business || null,
    remarks: input.remarks || null,
    is_carry_forward: input.is_carry_forward ?? false,
    original_work_date: input.original_work_date || null,
    carry_forward_to_date: input.carry_forward_to_date || null,
    updated_by: input.created_by,
    updated_at: now,
  }

  if (input.id) {
    const { data: old } = await client.from('dpw_daily_works').select('status').eq('id', input.id).single()
    const { data, error } = await client.from('dpw_daily_works').update({
      ...payload,
      completed_at: input.status === 'Completed' ? now : input.completed_at,
      completed_by: input.status === 'Completed' ? input.created_by : input.completed_by,
    }).eq('id', input.id).select('*').single()
    if (error) throw error
    if (old && old.status !== input.status) {
      await addStatusHistory(client, input.id, old.status, input.status || 'Pending', input.created_by)
    }
    return data as DpwWork
  }

  const work_id = await nextWorkId(client)
  const { data, error } = await client.from('dpw_daily_works').insert({
    ...payload,
    work_id,
    created_by: input.created_by,
  }).select('*').single()
  if (error) throw error
  await addStatusHistory(client, data.id, null, payload.status, input.created_by, 'Created')
  return data as DpwWork
}

export async function carryForwardWork(
  client: SupabaseClient,
  work: DpwWork,
  toDate: string,
  userName: string,
): Promise<DpwWork> {
  const { data, error } = await client.from('dpw_daily_works').update({
    status: 'Carry Forward',
    is_carry_forward: true,
    original_work_date: work.original_work_date || work.work_date,
    carry_forward_to_date: toDate,
    updated_by: userName,
    updated_at: new Date().toISOString(),
  }).eq('id', work.id).select('*').single()
  if (error) throw error
  await addStatusHistory(client, work.id, work.status, 'Carry Forward', userName, `Carried to ${toDate}`)
  return data as DpwWork
}

export async function completeWork(client: SupabaseClient, work: DpwWork, userName: string): Promise<DpwWork> {
  const now = new Date().toISOString()
  const { data, error } = await client.from('dpw_daily_works').update({
    status: 'Completed',
    completed_at: now,
    completed_by: userName,
    updated_by: userName,
    updated_at: now,
  }).eq('id', work.id).select('*').single()
  if (error) throw error
  await addStatusHistory(client, work.id, work.status, 'Completed', userName)
  return data as DpwWork
}

export function buildWhatsAppMessage(work: DpwWork): string {
  const machine = work.machine_no
    ? `${machineLabelOnly(work.machine_no)} ${work.machine_name || ''}`.trim()
    : work.area || 'Factory'
  const problem = work.work_description || work.remarks || '—'
  return `Namaste ji,

From JAISAL FASHIONWEAV INDUSTRIES.

Machine: ${machine}
Problem: ${problem}
Priority: ${work.priority || 'Medium'}

Kripya urgent visit karke problem check aur repair karein.

Please WhatsApp par apne visit ka confirmation time ke saath bhej dein.

Thank you.`
}

export function sendWorkWhatsApp(work: DpwWork, business = false): void {
  const msg = buildWhatsAppMessage(work)
  const phone = business ? work.contact_phone_business || work.contact_phone : work.contact_phone
  if (phone) {
    if (business) {
      const digits = phone.replace(/\D/g, '')
      const num = digits.length === 10 ? `91${digits}` : digits
      shareWhatsAppBusiness(msg)
      void num
    } else {
      whatsAppTo(phone, msg)
    }
  } else {
    if (business) shareWhatsAppBusiness(msg)
    else whatsAppTo(null, msg)
  }
}

export async function loadCommHistory(client: SupabaseClient, workId: string): Promise<DpwCommHistory[]> {
  const { data, error } = await client
    .from('dpw_work_communication_history')
    .select('*')
    .eq('work_id', workId)
    .order('activity_at', { ascending: false })
  if (error) throw error
  return (data as DpwCommHistory[]) ?? []
}

export async function loadAllCommHistory(client: SupabaseClient, limit = 100): Promise<DpwCommHistory[]> {
  const { data, error } = await client
    .from('dpw_work_communication_history')
    .select('*')
    .order('activity_at', { ascending: false })
    .limit(limit)
  if (error) {
    if (/relation .* does not exist/i.test(error.message)) return []
    throw error
  }
  return (data as DpwCommHistory[]) ?? []
}

export function printWorkReport(title: string, works: DpwWork[]) {
  const rows = works.map((w) => `
    <tr>
      <td>${w.work_time?.slice(0, 5) || '—'}</td>
      <td>${w.work_description || '—'}</td>
      <td>${w.machine_no ? machineLabelOnly(w.machine_no) : w.area || '—'}</td>
      <td>${w.assigned_to || '—'}</td>
      <td>${w.priority || '—'}</td>
      <td>${w.status}</td>
      <td>${w.remarks || '—'}</td>
    </tr>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}h1{text-align:center;color:#1e40af}
table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#f0f4f8}</style>
</head><body>
<h1>JAISAL FASHIONWEAV INDUSTRIES</h1>
<h2 style="text-align:center">${title}</h2>
<table><thead><tr><th>Time</th><th>Work / Issue</th><th>Machine / Area</th><th>Assigned To</th><th>Priority</th><th>Status</th><th>Remarks</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="margin-top:24px;color:#666;font-size:12px">Generated ${new Date().toLocaleString('en-IN')}</p>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export function printPersonWiseReport(works: DpwWork[]) {
  const pending = works.filter((w) => w.status !== 'Completed')
  const byPerson = new Map<string, DpwWork[]>()
  for (const w of pending) {
    const key = w.assigned_to?.trim() || 'Unassigned'
    const list = byPerson.get(key) || []
    list.push(w)
    byPerson.set(key, list)
  }
  const sections = Array.from(byPerson.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([person, items]) => {
      const rows = items.map((w) => `
        <tr>
          <td>${w.work_id}</td>
          <td>${w.work_date}</td>
          <td>${w.work_description || '—'}</td>
          <td>${w.machine_no ? machineLabelOnly(w.machine_no) : w.area || '—'}</td>
          <td>${w.priority || '—'}</td>
          <td>${w.status}</td>
        </tr>`).join('')
      return `<h3>${person} (${items.length})</h3>
<table><thead><tr><th>Work ID</th><th>Date</th><th>Description</th><th>Machine/Area</th><th>Priority</th><th>Status</th></tr></thead>
<tbody>${rows}</tbody></table>`
    }).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Person-wise Pending Work</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}h1{text-align:center;color:#1e40af}h3{margin-top:20px;color:#334155}
table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#f0f4f8}</style>
</head><body>
<h1>JAISAL FASHIONWEAV INDUSTRIES</h1>
<h2 style="text-align:center">Person-wise Pending Work</h2>
${sections || '<p>No pending work</p>'}
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export function printCommHistoryReport(history: DpwCommHistory[]) {
  const rows = history.map((h) => `
    <tr>
      <td>${new Date(h.activity_at).toLocaleString('en-IN')}</td>
      <td>${h.activity}</td>
      <td>${h.person || '—'}</td>
      <td>${h.communication_mode || '—'}</td>
      <td>${(h.message || '—').slice(0, 120)}</td>
    </tr>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>WhatsApp Communication History</title>
<style>body{font-family:system-ui,sans-serif;padding:24px}h1{text-align:center;color:#1e40af}
table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#f0f4f8}</style>
</head><body>
<h1>JAISAL FASHIONWEAV INDUSTRIES</h1>
<h2 style="text-align:center">WhatsApp Communication History</h2>
<table><thead><tr><th>Date/Time</th><th>Activity</th><th>Person</th><th>Mode</th><th>Message</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(html)
  w.document.close()
  w.focus()
  w.print()
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export { todayISO }
