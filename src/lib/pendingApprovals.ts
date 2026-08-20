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
  /** When true, only CEO may apply immediately; everyone else is queued. */
  requireCeoApproval?: boolean
}

/**
 * CEO (or within 7 days): apply now.
 * Older records, or modules with requireCeoApproval: queue pending_approvals.
 */
export async function applyEditDeleteOrQueue(args: MutateArgs): Promise<'applied' | 'queued'> {
  const canApplyNow =
    args.isCeo || (!args.requireCeoApproval && isWithinEditWindow(args.createdAt))
  if (canApplyNow) {
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
      if (item.table_name === 'cashbook_entries') {
        // Stamp CEO approval then delete (matches original cash-book RLS intent)
        const { error: stampErr } = await supabase
          .from(item.table_name)
          .update({
            edit_approved_by: resolvedBy,
            edit_approved_at: new Date().toISOString(),
          })
          .eq('id', item.record_id)
        if (stampErr) throw stampErr
      }
      const { error } = await supabase.from(item.table_name).delete().eq('id', item.record_id)
      if (error) throw error
    } else if (item.action === 'edit' && item.new_data) {
      const raw = { ...item.new_data }
      const lineItems = Array.isArray(raw._items) ? raw._items : null
      delete raw._items

      const updatePayload =
        item.table_name === 'cashbook_entries'
          ? {
              ...raw,
              edit_approved_by: resolvedBy,
              edit_approved_at: new Date().toISOString(),
            }
          : raw

      const { error } = await supabase
        .from(item.table_name)
        .update(updatePayload)
        .eq('id', item.record_id)
      if (error) throw error

      if (item.table_name === 'cashbook_entries' && lineItems) {
        const { error: delErr } = await supabase
          .from('cashbook_entry_items')
          .delete()
          .eq('entry_id', item.record_id)
        if (delErr) throw delErr
        const rows = (lineItems as Array<{ item_name?: unknown; amount?: unknown }>)
          .map((i) => ({
            entry_id: item.record_id as string,
            item_name: String(i.item_name ?? '').trim(),
            amount: Number(i.amount),
          }))
          .filter((i) => i.item_name && Number.isFinite(i.amount) && i.amount > 0)
        if (rows.length) {
          const { error: insErr } = await supabase.from('cashbook_entry_items').insert(rows)
          if (insErr) throw insErr
        }
      }
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
