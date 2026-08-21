/**
 * API smoke: Design Wise Costing save must not wipe warp/weft on update failure,
 * and saved rows must remain listable (Orders / Reports visibility).
 *
 * Run: node scripts/design-wise-costing-persist-smoke.mjs
 * Requires SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY in env.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://doitrzsyvcipugmrzykx.supabase.co'
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.OPA_SUPABASE_SERVICE_ROLE_KEY

if (!KEY) {
  console.error('Missing Supabase service/secret key')
  process.exit(1)
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })
const DIN = `JFG-PERSIST-${Date.now().toString().slice(-6)}`
const results = []

function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

async function main() {
  // 1) Insert header
  const { data: header, error: hErr } = await supabase
    .from('design_costing')
    .insert({
      din_number: DIN,
      quality_name: 'Persist Smoke',
      costing_date: '2026-08-21',
      design_length_mtr: 110,
      pic_conversion_rate: 0.45,
      conversion_charge: 16.65,
      total_pic: 37,
      mu_percent: 5,
      gst_percent: 5,
      gst_amount: 1,
      final_cost_per_mtr: 42.5,
      status: 'final',
    })
    .select('id')
    .single()
  record('insert design_costing header', !hErr && !!header?.id, { error: hErr?.message, DIN })
  if (!header?.id) throw new Error(hErr?.message || 'no header')

  const costingId = header.id

  // 2) Insert warp + weft
  const { error: wErr } = await supabase.from('design_costing_warp').insert({
    costing_id: costingId,
    sr_no: 1,
    yarn_name: '150 ROTO',
    denier: 155,
    tar_ends: 8900,
    length_mtr: 110,
    rate_per_kg: 137.5,
  })
  record('insert warp', !wErr, { error: wErr?.message })

  const { error: fErr } = await supabase.from('design_costing_weft').insert({
    costing_id: costingId,
    sr_no: 1,
    weft_name: '150 LICHI',
    denier: 160,
    pic: 37,
    width: 52,
    length_mtr: 110,
    rate_per_kg: 205,
  })
  record('insert weft', !fErr, { error: fErr?.message })

  // 3) Simulate safe update: insert new lines THEN delete old (app persist path)
  const { data: oldWarps } = await supabase
    .from('design_costing_warp')
    .select('id')
    .eq('costing_id', costingId)
  const { data: oldWefts } = await supabase
    .from('design_costing_weft')
    .select('id')
    .eq('costing_id', costingId)

  const { error: w2Err } = await supabase.from('design_costing_warp').insert({
    costing_id: costingId,
    sr_no: 1,
    yarn_name: '150 ROTO UPDATED',
    denier: 155,
    tar_ends: 8900,
    length_mtr: 110,
    rate_per_kg: 140,
  })
  record('re-insert warp before delete', !w2Err, { error: w2Err?.message })

  const { error: f2Err } = await supabase.from('design_costing_weft').insert({
    costing_id: costingId,
    sr_no: 1,
    weft_name: '150 LICHI UPDATED',
    denier: 160,
    pic: 37,
    width: 52,
    length_mtr: 110,
    rate_per_kg: 210,
  })
  record('re-insert weft before delete', !f2Err, { error: f2Err?.message })

  if (oldWarps?.length) {
    const { error: dw } = await supabase
      .from('design_costing_warp')
      .delete()
      .in(
        'id',
        oldWarps.map((r) => r.id),
      )
    record('delete previous warp after insert', !dw, { error: dw?.message })
  }
  if (oldWefts?.length) {
    const { error: df } = await supabase
      .from('design_costing_weft')
      .delete()
      .in(
        'id',
        oldWefts.map((r) => r.id),
      )
    record('delete previous weft after insert', !df, { error: df?.message })
  }

  const { data: warpsLeft } = await supabase
    .from('design_costing_warp')
    .select('yarn_name')
    .eq('costing_id', costingId)
  const { data: weftsLeft } = await supabase
    .from('design_costing_weft')
    .select('weft_name')
    .eq('costing_id', costingId)
  record('exactly one warp after safe replace', warpsLeft?.length === 1, {
    warps: warpsLeft,
  })
  record('exactly one weft after safe replace', weftsLeft?.length === 1, {
    wefts: weftsLeft,
  })
  record(
    'updated yarn names present',
    warpsLeft?.[0]?.yarn_name === '150 ROTO UPDATED' &&
      weftsLeft?.[0]?.weft_name === '150 LICHI UPDATED',
  )

  // 4) List visibility (Orders Design Master / DWC history query)
  const { data: listed, error: listErr } = await supabase
    .from('design_costing')
    .select('id, din_number, final_cost_per_mtr, status')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(40)
  record('list query works', !listErr, { error: listErr?.message })
  record(
    'smoke DIN visible in list',
    (listed ?? []).some((r) => r.din_number === DIN),
    { count: listed?.length },
  )

  // 5) Existing production DIN still present
  const { data: jfg } = await supabase
    .from('design_costing')
    .select('din_number')
    .ilike('din_number', 'Jfg1558')
    .limit(1)
  record('legacy Jfg1558 still present', (jfg ?? []).length === 1)

  // Cleanup smoke row
  const { error: delErr } = await supabase.from('design_costing').delete().eq('id', costingId)
  record('cleanup smoke DIN', !delErr, { error: delErr?.message })
}

main()
  .catch((e) => {
    record('uncaught', false, { error: e instanceof Error ? e.message : String(e) })
  })
  .finally(() => {
    const failed = results.filter((r) => !r.pass)
    console.log('\n=== SUMMARY ===')
    console.log(JSON.stringify(results, null, 2))
    console.log(failed.length ? `${failed.length} FAILED` : 'ALL PASSED')
    process.exit(failed.length ? 1 : 0)
  })
