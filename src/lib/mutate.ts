import { enqueueApproval } from './approval'
import { supabase } from './supabase'

type MutateArgs = {
  isCeo: boolean
  userId: string
  tableName: string
  action: 'insert' | 'update' | 'delete'
  recordId: string | null
  payload: Record<string, unknown>
  apply: () => Promise<void>
}

/** CEO applies immediately; other roles go to approval_queue (Phase 1 pattern). */
export async function applyOrQueue(args: MutateArgs): Promise<'applied' | 'queued'> {
  if (args.isCeo) {
    await args.apply()
    return 'applied'
  }
  await enqueueApproval({
    tableName: args.tableName,
    recordId: args.recordId,
    action: args.action,
    requestedBy: args.userId,
    payload: args.payload,
  })
  return 'queued'
}

export async function uploadFactoryPhoto(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('factory-uploads').upload(path, file, { upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from('factory-uploads').getPublicUrl(path)
  return data.publicUrl
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function nowTimeHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function nextDocNo(prefix: string, existing: string[]): string {
  let max = 0
  for (const n of existing) {
    const m = n.match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}
