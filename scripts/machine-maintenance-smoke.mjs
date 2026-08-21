/**
 * Machine-wise Maintenance API smoke test
 * Flow: contact → spare → breakdown → CALL_DONE → ARRIVED → WORK_STARTED → RESOLVED → parts → payment → history/reports
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://doitrzsyvcipugmrzykx.supabase.co'
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.OPA_SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error('Missing service role key')
  process.exit(1)
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function main() {
  const stamp = Date.now()
  console.log('1) Create contact')
  const { data: contact, error: cErr } = await supabase
    .from('maint_contacts')
    .insert({
      contact_name: `Test Tech ${stamp}`,
      category: 'Electrical',
      mobile1: '9876543210',
      mobile2: '9123456780',
      company: 'Smoke Test Contractor',
      is_active: true,
    })
    .select('*')
    .single()
  if (cErr) throw cErr

  console.log('2) Create spare part')
  const { data: spare, error: sErr } = await supabase
    .from('maint_spare_parts')
    .insert({
      part_name: `Relay ${stamp}`,
      part_number: `RL-${stamp}`,
      machine_no: 'M1',
      opening_stock: 10,
      received: 0,
      used: 0,
      min_stock: 2,
      rate: 500,
      supplier: 'Smoke Supplier',
    })
    .select('*')
    .single()
  if (sErr) throw sErr

  console.log('3) Create breakdown OPEN')
  const now = new Date()
  const breakdown_at = now.toISOString()
  const { data: bd, error: bErr } = await supabase
    .from('machine_breakdowns')
    .insert({
      machine_no: 'M1',
      breakdown_date: breakdown_at.slice(0, 10),
      breakdown_time: '10:00:00',
      shift: 'Day',
      fault_type: 'Electrical Fault',
      sub_fault: 'Main contactor trip',
      priority: 'High',
      description: 'Smoke test breakdown',
      contact_id: contact.id,
      contact_name: contact.contact_name,
      contact_mobile1: contact.mobile1,
      contact_mobile2: contact.mobile2,
      status: 'OPEN',
      breakdown_at,
    })
    .select('*')
    .single()
  if (bErr) throw bErr

  console.log('4) Advance CALL_DONE → ARRIVED → WORK_STARTED → RESOLVED')
  const called = new Date(now.getTime() + 5 * 60000).toISOString()
  const arrived = new Date(now.getTime() + 25 * 60000).toISOString()
  const started = new Date(now.getTime() + 30 * 60000).toISOString()
  const resolved = new Date(now.getTime() + 90 * 60000).toISOString()

  const { error: u1 } = await supabase
    .from('machine_breakdowns')
    .update({
      status: 'CALL_DONE',
      called_at: called,
      response_minutes: 5,
      updated_at: called,
    })
    .eq('id', bd.id)
  if (u1) throw u1

  const { error: u2 } = await supabase
    .from('machine_breakdowns')
    .update({ status: 'ARRIVED', arrived_at: arrived, updated_at: arrived })
    .eq('id', bd.id)
  if (u2) throw u2

  const { error: u3 } = await supabase
    .from('machine_breakdowns')
    .update({ status: 'WORK_STARTED', work_started_at: started, updated_at: started })
    .eq('id', bd.id)
  if (u3) throw u3

  console.log('5) Add part + payment + resolve')
  const { error: pErr } = await supabase.from('machine_breakdown_parts').insert({
    breakdown_id: bd.id,
    spare_part_id: spare.id,
    part_name: spare.part_name,
    part_number: spare.part_number,
    qty: 1,
    amount: 500,
  })
  if (pErr) throw pErr

  const { error: stockErr } = await supabase
    .from('maint_spare_parts')
    .update({ used: Number(spare.used) + 1, updated_at: resolved })
    .eq('id', spare.id)
  if (stockErr) throw stockErr

  const { data: done, error: u4 } = await supabase
    .from('machine_breakdowns')
    .update({
      status: 'RESOLVED',
      resolved_at: resolved,
      response_minutes: 5,
      repair_minutes: 60,
      downtime_minutes: 90,
      done_by: contact.contact_name,
      work_performed: 'Replaced contactor relay',
      root_cause: 'Overload',
      action_taken: 'Part replaced',
      labour_charges: 800,
      parts_charges: 500,
      other_charges: 0,
      total_amount: 1300,
      payment_mode: 'UPI',
      payment_status: 'Paid',
      payment_date: breakdown_at.slice(0, 10),
      updated_at: resolved,
    })
    .eq('id', bd.id)
    .select('*')
    .single()
  if (u4) throw u4

  console.log('6) Verify history + stock + contact link')
  const { data: hist } = await supabase.from('machine_breakdowns').select('*').eq('machine_no', 'M1').eq('id', bd.id).single()
  assert(hist?.status === 'RESOLVED', 'expected RESOLVED')
  assert(Number(hist?.total_amount) === 1300, 'expected total 1300')
  assert(hist?.contact_id === contact.id, 'contact link')

  const { data: stock } = await supabase.from('maint_spare_parts').select('*').eq('id', spare.id).single()
  assert(Number(stock?.used) === 1, 'stock used should be 1')

  const { data: parts } = await supabase.from('machine_breakdown_parts').select('*').eq('breakdown_id', bd.id)
  assert((parts || []).length === 1, 'one part')

  const { data: schedules } = await supabase.from('maint_schedules').select('machine_no')
  assert((schedules || []).length >= 6, 'schedules seeded for machines')

  console.log('7) Cleanup smoke rows')
  await supabase.from('machine_breakdown_parts').delete().eq('breakdown_id', bd.id)
  await supabase.from('machine_breakdowns').delete().eq('id', bd.id)
  await supabase.from('maint_spare_parts').delete().eq('id', spare.id)
  await supabase.from('maint_contacts').delete().eq('id', contact.id)

  console.log('PASS machine-wise-maintenance smoke', {
    contact: contact.contact_name,
    breakdown: done.id,
    downtime: done.downtime_minutes,
    total: done.total_amount,
  })
}

main().catch((e) => {
  console.error('FAIL', e.message || e)
  process.exit(1)
})
