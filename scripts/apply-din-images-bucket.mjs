/**
 * Ensure din-images storage bucket exists on production Supabase.
 * Run: node scripts/apply-din-images-bucket.mjs
 */
import { readFileSync } from 'fs'

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = 'doitrzsyvcipugmrzykx'
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const sql = readFileSync(
  new URL('../supabase/migrations/20260821140000_design_to_order.sql', import.meta.url),
  'utf8',
)
const storageSql = sql.slice(sql.indexOf('-- Storage for DIN intake'))

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
  console.log('Ensuring din-images bucket...')
  const result = await runQuery(storageSql)
  console.log('Result:', result)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
