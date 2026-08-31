/**
 * Apply Quality Master + Colour Master migration to production Supabase.
 * Idempotent — safe to re-run. Does not drop tables or delete data.
 *
 * Run: node scripts/apply-quality-colour-migration.mjs
 * Requires: SUPABASE_ACCESS_TOKEN
 */
import { readFileSync } from 'fs'

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = 'doitrzsyvcipugmrzykx'
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const sql = readFileSync(
  new URL('../supabase/migrations/20260830010000_quality_colour_production.sql', import.meta.url),
  'utf8',
)

async function runQuery(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
  return text
}

async function main() {
  console.log('Applying quality_colour_production migration…')
  const result = await runQuery(sql)
  console.log('Migration applied:', result.slice(0, 400))

  const verify = await runQuery(`
select
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='quality_master') as quality_master,
  exists(select 1 from information_schema.tables where table_schema='public' and table_name='colour_master') as colour_master,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='design_costing' and column_name='quality_master_id') as qm_fk,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='design_costing_weft' and column_name='colour') as weft_colour,
  (select count(*)::int from public.quality_master) as quality_count,
  (select count(*)::int from public.colour_master) as colour_count
`)
  console.log('Verify:', verify)
}

main().catch((e) => {
  console.error('Migration failed:', e.message || e)
  process.exit(1)
})
