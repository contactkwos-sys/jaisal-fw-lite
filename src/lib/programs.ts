import { supabase } from './supabase'

/** Sum petty meters for a program (target). */
export async function programTargetMeter(programId: string): Promise<number> {
  const { data, error } = await supabase
    .from('program_petty')
    .select('meter')
    .eq('program_id', programId)
  if (error) throw error
  return (data ?? []).reduce((s, r) => s + Number(r.meter || 0), 0)
}

/** Mark program completed and optionally set dispatched meters. */
export async function completeProgram(
  programId: string,
  dispatchedMeter?: number,
): Promise<void> {
  const patch: Record<string, unknown> = { status: 'completed' }
  if (dispatchedMeter != null) patch.dispatched_meter = dispatchedMeter
  const { error } = await supabase.from('programs').update(patch).eq('id', programId)
  if (error) throw error
}

/**
 * After production entry: if cumulative machine/program meters meet target, complete.
 */
export async function maybeCompleteProgramFromProduction(programId: string): Promise<void> {
  const target = await programTargetMeter(programId)
  const { data, error } = await supabase
    .from('production_entries')
    .select('total_meter')
    .eq('program_id', programId)
  if (error) throw error
  const produced = (data ?? []).reduce((s, r) => s + Number(r.total_meter || 0), 0)
  if (target > 0 && produced >= target) {
    await supabase.from('programs').update({ status: 'completed' }).eq('id', programId)
  } else if (produced > 0) {
    await supabase.from('programs').update({ status: 'running' }).eq('id', programId).eq('status', 'pending')
  }
}

/** When challan/gatepass delivers, stamp dispatched_meter and complete. */
export async function markProgramDispatched(programId: string, meter: number): Promise<void> {
  const { data: prog } = await supabase
    .from('programs')
    .select('dispatched_meter')
    .eq('id', programId)
    .maybeSingle()
  const next = Number(prog?.dispatched_meter || 0) + meter
  await completeProgram(programId, next)
}
