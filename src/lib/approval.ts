import { supabase } from './supabase'

type QueueArgs = {
  tableName: string
  recordId: string | null
  action: 'insert' | 'update' | 'delete'
  requestedBy: string
  payload: Record<string, unknown>
}

export async function enqueueApproval(args: QueueArgs) {
  const { error } = await supabase.from('approval_queue').insert({
    table_name: args.tableName,
    record_id: args.recordId,
    action: args.action,
    requested_by: args.requestedBy,
    payload: args.payload,
    status: 'pending',
  })
  if (error) throw error
}
