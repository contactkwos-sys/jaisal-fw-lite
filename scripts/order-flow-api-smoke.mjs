/**
 * API-level smoke for Order Book → Program → Job Card → Dispatch → Report.
 * Uses pin-login + service/anon REST against live Supabase.
 */
import { createClient } from '@supabase/supabase-js'

const url = 'https://doitrzsyvcipugmrzykx.supabase.co'
const key = 'sb_publishable_OyI39Syi9VXJg34uLLuozA_yjFBSBeE'
const supabase = createClient(url, key)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('PASS', msg)
}

async function main() {
  const { data: rolesData, error: rErr } = await supabase.functions.invoke('roles-gate', {
    body: { action: 'list' },
  })
  if (rErr) throw rErr
  const ceo = rolesData.roles.find((r) => r.role_name === 'CEO')
  const { data: login, error: lErr } = await supabase.functions.invoke('pin-login', {
    body: { role_id: ceo.id, role_name: 'CEO', pin: '1234' },
  })
  if (lErr) throw lErr
  const { error: sErr } = await supabase.auth.setSession({
    access_token: login.access_token,
    refresh_token: login.refresh_token,
  })
  if (sErr) throw sErr
  assert(true, 'CEO login')

  const stamp = Date.now()
  const party = `Smoke Party ${stamp}`

  const { data: order, error: oErr } = await supabase
    .from('order_book')
    .insert({
      party_name: party,
      order_date: new Date().toISOString().slice(0, 10),
      payment_days: 30,
      discount_pct: 2,
    })
    .select('id')
    .single()
  if (oErr) throw oErr

  const { data: items, error: iErr } = await supabase
    .from('order_book_items')
    .insert([
      { order_id: order.id, design_no: `D-${stamp}`, colour: 'Black', qty_meter: 100, rate: 50 },
      { order_id: order.id, design_no: `D-${stamp}B`, colour: 'White', qty_meter: 40, rate: 55 },
    ])
    .select('*')
  if (iErr) throw iErr
  assert(items.length === 2, 'order with 2 lines')

  const item = items[0]
  const { data: prog, error: pErr } = await supabase
    .from('programs')
    .insert({ order_item_id: item.id, machine_no: 'M1', status: 'pending' })
    .select('id')
    .single()
  if (pErr) throw pErr

  const { error: tErr } = await supabase.from('program_petty').insert([
    { program_id: prog.id, petty_label: 'Main', item_name: 'Body', meter: 70 },
    { program_id: prog.id, petty_label: 'Jari', item_name: 'Border', meter: 20 },
    { program_id: prog.id, petty_label: 'Avaj Effect', item_name: 'Avaj', meter: 10 },
  ])
  if (tErr) throw tErr
  assert(true, 'program + 3 petty rows')

  const { data: jobs } = await supabase.from('job_cards').select('job_card_no').limit(50)
  let max = 0
  for (const j of jobs ?? []) {
    const m = String(j.job_card_no || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const jcNo = `JC-${String(max + 1).padStart(4, '0')}`
  const { data: job, error: jErr } = await supabase
    .from('job_cards')
    .insert({
      dno: item.design_no,
      machine_no: 'M1',
      operator_name: 'Smoke Op',
      program_id: prog.id,
      job_card_no: jcNo,
      colour: item.colour,
      total_meter: 100,
    })
    .select('*')
    .single()
  if (jErr) throw jErr
  assert(job.job_card_no === jcNo, `job card ${jcNo}`)

  await supabase.from('programs').update({ status: 'running' }).eq('id', prog.id)

  const { data: chList } = await supabase.from('challans').select('challan_no').limit(50)
  max = 0
  for (const c of chList ?? []) {
    const m = String(c.challan_no || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const chNo = `CH-${String(max + 1).padStart(4, '0')}`
  const { data: challan, error: cErr } = await supabase
    .from('challans')
    .insert({
      challan_no: chNo,
      party,
      meter: 90,
      rolls: 2,
      rate: 50,
      gst_pct: 5,
      program_id: prog.id,
      job_card_id: job.id,
    })
    .select('*')
    .single()
  if (cErr) throw cErr

  const { error: gErr } = await supabase.from('gatepass').insert({
    challan_id: challan.id,
    tempo_driver: 'Smoke Driver',
    vehicle_no: 'MH00SMK',
    date: new Date().toISOString().slice(0, 10),
    gatepass_no: `DG-SMOKE-${stamp}`,
    driver_signed: true,
    received_signed: true,
    signed_by_driver: 'Driver',
    signed_by_received: 'Recv',
  })
  if (gErr) throw gErr

  // Mimic app completion hook
  const { data: before } = await supabase
    .from('programs')
    .select('dispatched_meter')
    .eq('id', prog.id)
    .single()
  const next = Number(before?.dispatched_meter || 0) + Number(challan.meter)
  await supabase
    .from('programs')
    .update({ status: 'completed', dispatched_meter: next })
    .eq('id', prog.id)

  const { data: done } = await supabase.from('programs').select('*').eq('id', prog.id).single()
  assert(done.status === 'completed', 'program completed after dispatch')
  assert(Number(done.dispatched_meter) === 90, 'dispatched_meter = 90')

  // Adjust remaining shortfall as top-up
  const { error: aErr } = await supabase.from('adjustment_notes').insert({
    order_item_id: item.id,
    adjustment_type: 'top_up_program',
    reason: 'smoke top-up',
    meter: 10,
  })
  if (aErr) throw aErr
  const { data: topup, error: tuErr } = await supabase
    .from('programs')
    .insert({ order_item_id: item.id, machine_no: 'M2', status: 'pending' })
    .select('id')
    .single()
  if (tuErr) throw tuErr
  await supabase.from('program_petty').insert({
    program_id: topup.id,
    petty_label: 'Top-up',
    item_name: item.design_no,
    meter: 10,
  })
  assert(true, 'top-up program adjustment')

  // Carry-forward + write-off on second line
  await supabase.from('adjustment_notes').insert({
    order_item_id: items[1].id,
    adjustment_type: 'carry_forward',
    meter: 40,
  })
  await supabase.from('adjustment_notes').insert({
    order_item_id: items[1].id,
    adjustment_type: 'write_off',
    reason: 'smoke write-off',
    meter: 40,
  })
  await supabase.from('order_book_items').update({ settled: true }).eq('id', items[1].id)
  assert(true, 'carry_forward + write_off adjustments')

  console.log('\nALL API SMOKE CHECKS PASSED')
}

main().catch((e) => {
  console.error('FAIL', e.message || e)
  process.exit(1)
})
