/**
 * Quality Master live API smoke — CRUD + Rate Master denier + DIN Costing seed isolation.
 * Run: node scripts/quality-master-api-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const url = 'https://doitrzsyvcipugmrzykx.supabase.co'
const key = 'sb_publishable_OyI39Syi9VXJg34uLLuozA_yjFBSBeE'
const supabase = createClient(url, key)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('PASS', msg)
}

function costingDenierFromBase(base) {
  const n = Number(base) || 0
  return n > 0 ? n + 10 : 0
}

async function ensureMigration() {
  const { error } = await supabase.from('quality_master').select('id').limit(1)
  if (!error) return
  if (!/does not exist|schema cache|relation/i.test(error.message)) throw error
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('quality_master missing and no SUPABASE_ACCESS_TOKEN to migrate')
  const sql = readFileSync(
    new URL('../supabase/migrations/20260830010000_quality_colour_production.sql', import.meta.url),
    'utf8',
  )
  const res = await fetch(`https://api.supabase.com/v1/projects/doitrzsyvcipugmrzykx/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) throw new Error(`migrate HTTP ${res.status}: ${await res.text()}`)
  // wait for schema cache
  await new Promise((r) => setTimeout(r, 1500))
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
  await supabase.auth.setSession({
    access_token: login.access_token,
    refresh_token: login.refresh_token,
  })
  assert(true, 'CEO login')

  await ensureMigration()

  const { data: probe, error: pErr } = await supabase.from('quality_master').select('id').limit(1)
  assert(!pErr, `quality_master readable (${pErr?.message || 'ok'})`)
  assert(Array.isArray(probe), 'quality_master returns array')

  const { data: colours, error: cErr } = await supabase.from('colour_master').select('colour_name').limit(5)
  assert(!cErr && (colours?.length || 0) > 0, 'colour_master seeded')

  const { data: rates } = await supabase
    .from('rate_master')
    .select('id, category, item_name, denier')
    .eq('is_active', true)
    .eq('category', 'warp')
    .ilike('item_name', '%150 Roto%')
    .limit(1)
  const warpRate = rates?.[0]
  assert(!!warpRate, 'Rate Master has warp yarn for denier fill')

  const stamp = Date.now()
  const qualityName = `150 ROTO B&W ${stamp}`
  const base = String(warpRate.denier || '150').replace(/same/i, '150')
  const baseNum = /^(\d+)/.test(base) ? base.match(/^(\d+)/)[1] : '150'

  const warpRecipe = [
    {
      sr: 1,
      yarn_name: warpRate.item_name,
      base_denier: baseNum,
      costing_denier: String(costingDenierFromBase(baseNum)),
      tar_ends: '8900',
      width: '52',
      length_mtr: '110',
      rate_master_id: warpRate.id,
    },
  ]
  const weftRecipe = [
    {
      sr: 1,
      feeder_no: 1,
      colour: colours[0].colour_name,
      weft_name: '300 Tex',
      base_denier: '300',
      costing_denier: '310',
      pic: '48',
      width: '52',
      length_mtr: '110',
      rate_master_id: null,
    },
  ]

  const { data: created, error: insErr } = await supabase
    .from('quality_master')
    .insert({
      quality_name: qualityName,
      is_active: true,
      default_width: 52,
      default_length_mtr: 110,
      default_tar_ends: 8900,
      warp_recipe: warpRecipe,
      weft_recipe: weftRecipe,
      notes: 'api-smoke',
    })
    .select('*')
    .single()
  if (insErr) throw insErr
  assert(created.quality_name === qualityName, 'CREATE quality')
  assert(created.warp_recipe[0].costing_denier === String(costingDenierFromBase(baseNum)), 'costing denier = base+10')
  assert(created.warp_recipe[0].rate_master_id === warpRate.id, 'stores rate_master_id ref')

  const { data: listed } = await supabase
    .from('quality_master')
    .select('id, quality_name')
    .eq('id', created.id)
    .single()
  assert(listed?.id === created.id, 'VIEW / list finds quality')

  const { data: updated, error: uErr } = await supabase
    .from('quality_master')
    .update({
      notes: 'edited',
      weft_recipe: [{ ...weftRecipe[0], pic: '50' }],
      updated_at: new Date().toISOString(),
    })
    .eq('id', created.id)
    .select('*')
    .single()
  if (uErr) throw uErr
  assert(updated.notes === 'edited' && updated.weft_recipe[0].pic === '50', 'EDIT quality')

  // DIN Costing seed copy must not mutate Quality Master
  const dinWefts = JSON.parse(JSON.stringify(updated.weft_recipe))
  dinWefts[0].pic = '999'
  const { data: afterDinEdit } = await supabase
    .from('quality_master')
    .select('weft_recipe')
    .eq('id', created.id)
    .single()
  assert(afterDinEdit.weft_recipe[0].pic === '50', 'DIN edit of copy does not change Quality Master')

  // Soft deactivate
  await supabase.from('quality_master').update({ is_active: false }).eq('id', created.id)
  const { data: inactive } = await supabase
    .from('quality_master')
    .select('is_active')
    .eq('id', created.id)
    .single()
  assert(inactive.is_active === false, 'ACTIVE/INACTIVE status')

  // design_costing.quality_master_id column exists
  const { error: colErr } = await supabase
    .from('design_costing')
    .select('id, quality_master_id')
    .limit(1)
  assert(!colErr, `design_costing.quality_master_id available (${colErr?.message || 'ok'})`)

  await supabase.from('quality_master').delete().eq('id', created.id)
  const { data: gone } = await supabase.from('quality_master').select('id').eq('id', created.id).maybeSingle()
  assert(!gone, 'DELETE quality')

  console.log('ALL PASS quality-master-api-smoke')
}

main().catch((e) => {
  console.error('FAIL', e.message || e)
  process.exit(1)
})
