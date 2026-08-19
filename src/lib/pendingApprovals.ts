import { supabase } from './supabase'

export const EDIT_WINDOW_DAYS = 7

export type PendingApproval = {
  id: string
  table_name: string
  record_id: string | null
  action: 'edit' | 'delete'
  requested_by: string
  requested_at: string
  new_data: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  resolved_by?: string | null
  resolved_at?: string | null
}

export function isWithinEditWindow(createdAt: string, days = EDIT_WINDOW_DAYS): boolean {
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return false
  return Date.now() - t <= days * 24 * 60 * 60 * 1000
}

type QueueArgs = {
  tableName: string
  recordId: string
  action: 'edit' | 'delete'
  requestedBy: string
  newData?: Record<string, unknown> | null
}

export async function enqueuePendingApproval(args: QueueArgs) {
  const { error } = await supabase.from('pending_approvals').insert({
    table_name: args.tableName,
    record_id: args.recordId,
    action: args.action,
    requested_by: args.requestedBy,
    new_data: args.newData ?? null,
    status: 'pending',
  })
  if (error) throw error
}

type MutateArgs = {
  isCeo: boolean
  createdAt: string
  tableName: string
  recordId: string
  action: 'edit' | 'delete'
  requestedBy: string
  newData?: Record<string, unknown> | null
  apply: () => Promise<void>
}

/** Within 7 days (or CEO): apply now. Older: queue pending_approvals. */
export async function applyEditDeleteOrQueue(args: MutateArgs): Promise<'applied' | 'queued'> {
  if (args.isCeo || isWithinEditWindow(args.createdAt)) {
    await args.apply()
    return 'applied'
  }
  await enqueuePendingApproval({
    tableName: args.tableName,
    recordId: args.recordId,
    action: args.action,
    requestedBy: args.requestedBy,
    newData: args.newData,
  })
  return 'queued'
}

export async function fetchPendingApprovals(): Promise<PendingApproval[]> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('*')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
  if (error) throw error
  return (data as PendingApproval[]) ?? []
}

/** Apply approved edit/delete against the target table, then mark status. */
export async function resolvePendingApproval(
  item: PendingApproval,
  status: 'approved' | 'rejected',
  resolvedBy: string,
): Promise<void> {
  if (status === 'approved' && item.record_id) {
    if (item.action === 'delete') {
      const { error } = await supabase.from(item.table_name).delete().eq('id', item.record_id)
      if (error) throw error
    } else if (item.action === 'edit' && item.new_data) {
      const { error } = await supabase
        .from(item.table_name)
        .update(item.new_data)
        .eq('id', item.record_id)
      if (error) throw error
    }
  }

  const { error } = await supabase
    .from('pending_approvals')
    .update({
      status,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', item.id)
  if (error) throw error
}
