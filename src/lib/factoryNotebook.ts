/**
 * Digital Factory Notebook — business logic
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { MACHINES } from './database.types'
import { todayISO } from './mutate'
import { supabase } from './supabase'

export const NOTEBOOK_CATEGORIES = [
  'General',
  'Machine',
  'Maintenance',
  'Purchase',
  'Production',
  'Electrical',
  'Mechanical',
  'Store',
  'Staff',
  'Reminder',
  'Other',
] as const

export const NOTE_PRIORITIES = ['High', 'Medium', 'Low'] as const

export const NOTE_STATUSES = ['Open', 'In Progress', 'Completed', 'Cancelled', 'Information'] as const

export const PURCHASE_PHOTO_CATEGORIES = [
  'Bill Photo',
  'Material Photo',
  'Packing Photo',
  'Supplier Document',
  'Material Condition',
  'Truck / Material',
  'Other',
] as const

export type PurchaseType = 'general' | 'weft' | 'maint_in'

export type FactoryNote = {
  id: string
  title: string
  description: string | null
  category: string
  machine_id: string | null
  priority: string
  assigned_to: string | null
  status: string
  remarks: string | null
  reminder_date: string | null
  reminder_time: string | null
  din_id: string | null
  din_ref: string | null
  note_type: string
  created_by: string | null
  created_by_id: string | null
  updated_by: string | null
  updated_by_id: string | null
  deleted_by: string | null
  deleted_at: string | null
  is_deleted: boolean
  created_at: string
  updated_at: string
  attachments?: FactoryNoteAttachment[]
}

export type FactoryNoteAttachment = {
  id: string
  note_id: string
  file_url: string
  file_name: string | null
  file_type: string | null
  source: string
  category: string | null
  machine_id: string | null
  rotation_deg: number
  created_by: string | null
  created_at: string
}

export type PurchaseRelatedPhoto = {
  id: string
  purchase_type: string
  purchase_id: string
  file_url: string
  file_name: string | null
  file_type: string | null
  photo_category: string
  source: string
  created_by: string | null
  created_at: string
}

export type NoteFilters = {
  search?: string
  category?: string
  machine?: string
  priority?: string
  assignedTo?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  myNotes?: boolean
  userName?: string
  isCeo?: boolean
  machineOnly?: boolean
  generalOnly?: boolean
  highPriority?: boolean
  pending?: boolean
  completed?: boolean
}

export type TodayNotebookStats = {
  total: number
  highPriority: number
  pending: number
  completed: number
}

export type StaffOption = { id: string; name: string }

export type PurchaseOption = {
  id: string
  type: PurchaseType
  label: string
  date: string
}

const MACHINE_LABELS: Record<string, string> = {
  M1: 'Machine No.1',
  M2: 'Machine No.2',
  M3: 'Machine No.3',
  M4: 'Machine No.4',
  M5: 'Machine No.5',
  M6: 'Machine No.6',
}

export function machineOptions(): Array<{ value: string; label: string }> {
  return [
    { value: '', label: 'All / General' },
    ...MACHINES.map((m) => ({ value: m, label: MACHINE_LABELS[m] || m })),
  ]
}

export function machineLabel(machineId: string | null | undefined): string {
  if (!machineId) return 'All / General'
  return MACHINE_LABELS[machineId] || machineId
}

export function priorityClass(priority: string): string {
  const p = priority.toLowerCase()
  if (p === 'high') return 'nb-priority-high'
  if (p === 'low') return 'nb-priority-low'
  return 'nb-priority-medium'
}

export function statusClass(status: string): string {
  const s = status.toLowerCase()
  if (s === 'completed') return 'nb-status-completed'
  if (s === 'cancelled') return 'nb-status-cancelled'
  if (s === 'in progress') return 'nb-status-progress'
  if (s === 'information') return 'nb-status-info'
  return 'nb-status-open'
}

export function formatNoteDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatNoteTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export async function uploadNotebookPhoto(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('notebook-photos').upload(path, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('notebook-photos').getPublicUrl(path)
  return data.publicUrl
}

export async function loadStaffOptions(client: SupabaseClient = supabase): Promise<StaffOption[]> {
  const { data, error } = await client
    .from('workers')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')
  if (error) return []
  return (data || []).map((w) => ({ id: w.id, name: w.full_name }))
}

export async function loadPurchaseOptions(client: SupabaseClient = supabase): Promise<PurchaseOption[]> {
  const [gen, weft, maint] = await Promise.all([
    client.from('general_purchases').select('id, purchase_date, party_name, challan_no').order('purchase_date', { ascending: false }).limit(50),
    client.from('weft_purchases').select('id, purchase_date, party_name, challan_no').order('purchase_date', { ascending: false }).limit(50),
    client.from('maintenance_inward').select('id, inward_date, party_name, challan_no').order('inward_date', { ascending: false }).limit(50),
  ])
  const out: PurchaseOption[] = []
  for (const row of gen.data || []) {
    const label = `PUR-GEN · ${row.party_name || 'General'} · ${row.challan_no || row.id.slice(0, 8)}`
    out.push({ id: row.id, type: 'general', label, date: row.purchase_date || '' })
  }
  for (const row of weft.data || []) {
    const label = `PUR-WEFT · ${row.party_name || 'Weft'} · ${row.challan_no || row.id.slice(0, 8)}`
    out.push({ id: row.id, type: 'weft', label, date: row.purchase_date || '' })
  }
  for (const row of maint.data || []) {
    const label = `PUR-MAINT · ${row.party_name || 'Maint'} · ${row.challan_no || row.id.slice(0, 8)}`
    out.push({ id: row.id, type: 'maint_in', label, date: row.inward_date || '' })
  }
  return out.sort((a, b) => (b.date > a.date ? 1 : -1))
}

function applyNoteFilters<T extends { eq: (col: string, val: unknown) => T; not: (col: string, op: string, val: unknown) => T; or: (filters: string) => T; gte: (col: string, val: string) => T; lte: (col: string, val: string) => T; in: (col: string, vals: string[]) => T; neq: (col: string, val: string) => T }>(
  query: T,
  filters: NoteFilters,
): T {
  let q = query.eq('is_deleted', false)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.machine) q = q.eq('machine_id', filters.machine)
  if (filters.priority) q = q.eq('priority', filters.priority)
  if (filters.assignedTo) q = q.eq('assigned_to', filters.assignedTo)
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.dateFrom) q = q.gte('created_at', `${filters.dateFrom}T00:00:00`)
  if (filters.dateTo) q = q.lte('created_at', `${filters.dateTo}T23:59:59`)
  if (filters.machineOnly) q = q.not('machine_id', 'is', null).neq('machine_id', '')
  if (filters.generalOnly) q = q.or('machine_id.is.null,machine_id.eq.')
  if (filters.highPriority) q = q.eq('priority', 'High')
  if (filters.pending) q = q.in('status', ['Open', 'In Progress'])
  if (filters.completed) q = q.eq('status', 'Completed')
  if (filters.myNotes && filters.userName && !filters.isCeo) {
    q = q.or(`created_by.eq.${filters.userName},assigned_to.eq.${filters.userName}`)
  }
  return q
}

export async function loadNotes(
  filters: NoteFilters = {},
  client: SupabaseClient = supabase,
): Promise<FactoryNote[]> {
  let query = client.from('factory_notes').select('*').order('created_at', { ascending: false })
  query = applyNoteFilters(query, filters)
  const { data, error } = await query.limit(500)
  if (error) {
    if (error.message.includes('does not exist') || error.code === '42P01') return []
    throw error
  }
  let rows = (data || []) as FactoryNote[]
  if (filters.search?.trim()) {
    const s = filters.search.trim().toLowerCase()
    rows = rows.filter((n) => {
      const hay = [
        n.title,
        n.description,
        n.remarks,
        n.category,
        n.machine_id,
        n.assigned_to,
        n.created_by,
        n.din_ref,
        machineLabel(n.machine_id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(s)
    })
  }
  return rows
}

export async function loadNoteById(id: string, client: SupabaseClient = supabase): Promise<FactoryNote | null> {
  const { data, error } = await client.from('factory_notes').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  const note = data as FactoryNote
  note.attachments = await loadNoteAttachments(id, client)
  return note
}

export async function loadNoteAttachments(
  noteId: string,
  client: SupabaseClient = supabase,
): Promise<FactoryNoteAttachment[]> {
  const { data, error } = await client
    .from('factory_note_attachments')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at')
  if (error) return []
  return (data || []) as FactoryNoteAttachment[]
}

export async function loadAttachmentsForNotes(
  noteIds: string[],
  client: SupabaseClient = supabase,
): Promise<Record<string, FactoryNoteAttachment[]>> {
  if (!noteIds.length) return {}
  const { data, error } = await client
    .from('factory_note_attachments')
    .select('*')
    .in('note_id', noteIds)
    .order('created_at')
  if (error) return {}
  const map: Record<string, FactoryNoteAttachment[]> = {}
  for (const row of (data || []) as FactoryNoteAttachment[]) {
    if (!map[row.note_id]) map[row.note_id] = []
    map[row.note_id].push(row)
  }
  return map
}

export async function loadTodayStats(client: SupabaseClient = supabase): Promise<TodayNotebookStats> {
  const today = todayISO()
  const { data, error } = await client
    .from('factory_notes')
    .select('priority, status')
    .eq('is_deleted', false)
    .gte('created_at', `${today}T00:00:00`)
    .lte('created_at', `${today}T23:59:59`)
  if (error) return { total: 0, highPriority: 0, pending: 0, completed: 0 }
  const rows = data || []
  return {
    total: rows.length,
    highPriority: rows.filter((r) => r.priority === 'High').length,
    pending: rows.filter((r) => ['Open', 'In Progress'].includes(r.status)).length,
    completed: rows.filter((r) => r.status === 'Completed').length,
  }
}

export async function loadLatestNotes(limit = 5, client: SupabaseClient = supabase): Promise<FactoryNote[]> {
  const { data, error } = await client
    .from('factory_notes')
    .select('*')
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data || []) as FactoryNote[]
}

export async function loadMachineNotes(
  machineId: string,
  client: SupabaseClient = supabase,
): Promise<FactoryNote[]> {
  return loadNotes({ machine: machineId }, client)
}

export async function loadDinNotes(dinId: string, client: SupabaseClient = supabase): Promise<FactoryNote[]> {
  const { data, error } = await client
    .from('factory_notes')
    .select('*')
    .eq('is_deleted', false)
    .eq('din_id', dinId)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data || []) as FactoryNote[]
}

export type SaveNoteInput = {
  title: string
  description?: string | null
  category: string
  machine_id?: string | null
  priority: string
  assigned_to?: string
  status?: string
  remarks?: string
  reminder_date?: string
  reminder_time?: string
  din_id?: string | null
  din_ref?: string
  note_type?: string
}

export async function saveNote(
  input: SaveNoteInput,
  user: { id?: string; name: string },
  noteId?: string | null,
  client: SupabaseClient = supabase,
): Promise<FactoryNote> {
  const now = new Date().toISOString()
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    category: input.category,
    machine_id: input.machine_id || null,
    priority: input.priority,
    assigned_to: input.assigned_to?.trim() || null,
    status: input.status || 'Open',
    remarks: input.remarks?.trim() || null,
    reminder_date: input.reminder_date || null,
    reminder_time: input.reminder_time || null,
    din_id: input.din_id || null,
    din_ref: input.din_ref?.trim() || null,
    note_type: input.note_type || (input.description ? 'typed' : 'photo'),
    updated_by: user.name,
    updated_by_id: user.id || null,
    updated_at: now,
  }
  if (noteId) {
    const { data, error } = await client.from('factory_notes').update(payload).eq('id', noteId).select().single()
    if (error) throw error
    return data as FactoryNote
  }
  const { data, error } = await client
    .from('factory_notes')
    .insert({
      ...payload,
      created_by: user.name,
      created_by_id: user.id || null,
    })
    .select()
    .single()
  if (error) throw error
  return data as FactoryNote
}

export async function updateNoteStatus(
  noteId: string,
  newStatus: string,
  userName: string,
  remarks?: string,
  client: SupabaseClient = supabase,
): Promise<void> {
  const existing = await loadNoteById(noteId, client)
  if (!existing) throw new Error('Note not found')
  const now = new Date().toISOString()
  const { error } = await client
    .from('factory_notes')
    .update({ status: newStatus, updated_by: userName, updated_at: now })
    .eq('id', noteId)
  if (error) throw error
  await client.from('factory_note_status_history').insert({
    note_id: noteId,
    old_status: existing.status,
    new_status: newStatus,
    changed_by: userName,
    remarks: remarks || null,
  })
}

export async function deleteNote(noteId: string, userName: string, client: SupabaseClient = supabase): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await client
    .from('factory_notes')
    .update({ is_deleted: true, deleted_by: userName, deleted_at: now, updated_at: now })
    .eq('id', noteId)
  if (error) throw error
}

export type AttachmentInput = {
  file: File
  source: 'camera' | 'gallery'
  rotation_deg?: number
}

export async function addNoteAttachments(
  noteId: string,
  items: AttachmentInput[],
  userName: string,
  machineId?: string | null,
  category?: string,
  client: SupabaseClient = supabase,
): Promise<FactoryNoteAttachment[]> {
  const out: FactoryNoteAttachment[] = []
  for (const item of items) {
    const url = await uploadNotebookPhoto(item.file, `notes/${noteId}`)
    const { data, error } = await client
      .from('factory_note_attachments')
      .insert({
        note_id: noteId,
        file_url: url,
        file_name: item.file.name,
        file_type: item.file.type,
        source: item.source,
        category: category || null,
        machine_id: machineId || null,
        rotation_deg: item.rotation_deg || 0,
        created_by: userName,
      })
      .select()
      .single()
    if (error) throw error
    out.push(data as FactoryNoteAttachment)
  }
  return out
}

export async function deleteAttachment(attachmentId: string, client: SupabaseClient = supabase): Promise<void> {
  const { error } = await client.from('factory_note_attachments').delete().eq('id', attachmentId)
  if (error) throw error
}

export async function rotateAttachment(
  attachmentId: string,
  rotationDeg: number,
  client: SupabaseClient = supabase,
): Promise<void> {
  const { error } = await client
    .from('factory_note_attachments')
    .update({ rotation_deg: rotationDeg })
    .eq('id', attachmentId)
  if (error) throw error
}

export async function savePurchasePhoto(
  input: {
    purchase_type: PurchaseType
    purchase_id: string
    file: File
    photo_category: string
    source: 'camera' | 'gallery'
  },
  userName: string,
  client: SupabaseClient = supabase,
): Promise<PurchaseRelatedPhoto> {
  const url = await uploadNotebookPhoto(input.file, `purchase/${input.purchase_type}/${input.purchase_id}`)
  const { data, error } = await client
    .from('purchase_related_photos')
    .insert({
      purchase_type: input.purchase_type,
      purchase_id: input.purchase_id,
      file_url: url,
      file_name: input.file.name,
      file_type: input.file.type,
      photo_category: input.photo_category,
      source: input.source,
      created_by: userName,
    })
    .select()
    .single()
  if (error) throw error
  return data as PurchaseRelatedPhoto
}

export async function loadPurchasePhotos(
  purchaseType: PurchaseType,
  purchaseId: string,
  client: SupabaseClient = supabase,
): Promise<PurchaseRelatedPhoto[]> {
  const { data, error } = await client
    .from('purchase_related_photos')
    .select('*')
    .eq('purchase_type', purchaseType)
    .eq('purchase_id', purchaseId)
    .order('created_at')
  if (error) return []
  return (data || []) as PurchaseRelatedPhoto[]
}

export async function tablesReady(client: SupabaseClient = supabase): Promise<boolean> {
  const { error } = await client.from('factory_notes').select('id').limit(1)
  return !error
}
