/**
 * Warp Yarn Management API smoke — pipe lifecycle against live Supabase.
 * Requires SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL || 'https://doitrzsyvcipugmrzykx.supabase.co'
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.OPA_SUPABASE_SERVICE_ROLE_KEY

if (!key) {
  console.error('Missing service role key')
  process.exit(1)
}

const sb = createClient(url, key)
const tag = `SMOKE-${Date.now().toString(36).toUpperCase()}`
const pipeNo = `BP-S${String(Date.now()).slice(-5)}`
let passed = 0
let failed = 0

function ok(name, cond, extra) {
  if (cond) {
    passed++
    console.log('PASS', name, extra || '')
  } else {
    failed++
    console.log('FAIL', name, extra || '')
  }
}

async function main() {
  // 1. Add empty pipe
  const { data: pipe, error: pErr } = await sb
    .from('warp_pipes')
    .insert({
      pipe_no: pipeNo,
      serial_no: pipeNo,
      location: 'Godown',
      status: 'EMPTY',
      remarks: tag,
      meter: 0,
      multiplier: 2,
      total_meter: 0,
      used_meter: 0,
      balance_meter: 0,
      weight_kg: 0,
    })
    .select('*')
    .single()
  ok('add empty pipe', !pErr && pipe?.pipe_no === pipeNo, pErr?.message)

  // 2. Duplicate blocked
  const { error: dupErr } = await sb.from('warp_pipes').insert({
    pipe_no: pipeNo,
    serial_no: pipeNo + '-X',
    status: 'EMPTY',
  })
  ok('reject duplicate pipe_no', !!dupErr, dupErr?.code)

  // 3. Send to warper
  const { error: jErr } = await sb.from('warp_warper_jobs').insert({
    pipe_id: pipe.id,
    pipe_no: pipeNo,
    warper_name: 'Smoke Warper',
    yarn_quality: '150 Roto Black',
    yarn_sent_kg: 500,
    expected_meter: 2000,
    multiplier: 2,
    expected_total_meter: 4000,
    status: 'SENT',
    entered_by: 'smoke',
  })
  ok('send warper job', !jErr, jErr?.message)
  await sb
    .from('warp_pipes')
    .update({ status: 'AT_WARPER', location: 'Warper · Smoke Warper', warper_name: 'Smoke Warper' })
    .eq('id', pipe.id)

  // 4. Receive with difference
  const { data: jobs } = await sb
    .from('warp_warper_jobs')
    .select('*')
    .eq('pipe_no', pipeNo)
    .eq('status', 'SENT')
    .limit(1)
  const job = jobs?.[0]
  const kgDiff = 5
  const meterDiff = 100
  const { error: rErr } = await sb
    .from('warp_warper_jobs')
    .update({
      received_date: new Date().toISOString().slice(0, 10),
      received_meter: 1900,
      received_kg: 495,
      meter_difference: meterDiff,
      kg_difference: kgDiff,
      status: 'DIFFERENCE',
    })
    .eq('id', job.id)
  ok('receive with difference', !rErr, rErr?.message)

  await sb
    .from('warp_pipes')
    .update({
      status: 'FILLED_GODOWN',
      location: 'Godown',
      yarn_quality: '150 Roto Black',
      meter: 1900,
      multiplier: 2,
      total_meter: 3800,
      used_meter: 0,
      balance_meter: 3800,
      weight_kg: 495,
    })
    .eq('id', pipe.id)

  // 5. Issue to machine via beam_loading
  const { data: loading, error: lErr } = await sb
    .from('beam_loading')
    .insert({
      machine_no: 'M6',
      item_name: '150 Roto Black',
      quality: '150 Roto Black',
      pipe_no: pipeNo,
      beam_count: 2,
      meter_per_beam: 1900,
      remaining_meter: 3800,
      status: 'RUNNING',
    })
    .select('id')
    .single()
  ok('beam_loading issue', !lErr && loading?.id, lErr?.message)

  await sb
    .from('warp_pipes')
    .update({
      status: 'ON_MACHINE',
      location: 'Machine M6',
      machine_no: 'M6',
      beam_loading_id: loading.id,
    })
    .eq('id', pipe.id)

  // 6. Production deduct + sync trigger
  const { error: dErr } = await sb.from('daily_beam_production').insert({
    beam_loading_id: loading.id,
    machine_no: 'M6',
    production_date: new Date().toISOString().slice(0, 10),
    production_meter: 1250,
  })
  ok('daily production insert', !dErr, dErr?.message)

  // allow trigger
  await new Promise((r) => setTimeout(r, 500))
  const { data: after } = await sb.from('warp_pipes').select('*').eq('id', pipe.id).single()
  ok(
    'used/balance synced from beam_loading',
    after && Number(after.used_meter) >= 1250 && Number(after.balance_meter) <= 2550,
    after && { used: after.used_meter, bal: after.balance_meter },
  )

  // 7. Transaction ledger row
  const { error: tErr } = await sb.from('warp_yarn_transactions').insert({
    txn_date: new Date().toISOString().slice(0, 10),
    pipe_id: pipe.id,
    pipe_no: pipeNo,
    txn_type: 'Issue to Machine',
    from_location: 'Godown',
    to_location: 'Machine M6',
    quality: '150 Roto Black',
    kg: 495,
    meter: 1900,
    multiplier: 2,
    total_meter: 3800,
    balance_meter: 3800,
    machine_no: 'M6',
    user_name: 'smoke',
    status: 'ON_MACHINE',
    remarks: tag,
  })
  ok('txn insert', !tErr, tErr?.message)

  // Cleanup smoke artifacts (keep schema; remove test rows)
  if (loading?.id) {
    await sb.from('daily_beam_production').delete().eq('beam_loading_id', loading.id)
    await sb.from('beam_loading').delete().eq('id', loading.id)
  }
  await sb.from('warp_yarn_transactions').delete().eq('pipe_no', pipeNo)
  await sb.from('warp_warper_jobs').delete().eq('pipe_no', pipeNo)
  await sb.from('warp_pipes').delete().eq('id', pipe.id)
  ok('cleanup', true)

  console.log(`\nRESULT ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
