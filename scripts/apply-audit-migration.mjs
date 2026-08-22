/**
 * Apply audit migration to production Supabase via Management API.
 * Run: node scripts/apply-audit-migration.mjs
 */
import { readFileSync } from 'fs'

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = 'doitrzsyvcipugmrzykx'
if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN')
  process.exit(1)
}

const sql = readFileSync(new URL('../supabase/migrations/20260822230000_audit_fixes.sql', import.meta.url), 'utf8')

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
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return text
}

async function main() {
  console.log('Applying audit migration...')
  try {
    const result = await runQuery(sql)
    console.log('Migration applied:', result.slice(0, 500))
  } catch (e) {
    console.error('Migration failed:', e.message)
    process.exit(1)
  }

  const verify = await runQuery(
    "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'dins') as dins_exists, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_book_items' and column_name = 'created_at') as created_at_exists",
  )
  console.log('Verify:', verify)
}

main()
