#!/usr/bin/env node
/**
 * Phase 2 read-only data audit — duplicate masters + orphan table usage.
 * Does NOT modify any data. Run: node scripts/phase2-data-audit.mjs
 *
 * Requires SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_*) in env for live counts.
 */
import { createClient } from '@supabase/supabase-js'

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://doitrzsyvcipugmrzykx.supabase.co'
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY

const ORPHAN_TABLES = ['design_warp', 'design_weft', 'beam_pipe_in', 'order_repair_history']

const MASTER_TABLES = [
  { table: 'party_master', key: 'party_name', label: 'Customers (party_master)' },
  { table: 'workers', key: 'full_name', label: 'Employees (workers)' },
  { table: 'weft_yarn_stock', key: 'colour_no', label: 'Yarn (weft_yarn_stock)' },
  { table: 'dins', key: 'din_number', label: 'DIN (dins)' },
  { table: 'order_suppliers', key: 'name_key', label: 'Suppliers (order_suppliers)' },
  { table: 'inventory_item_master', key: 'name_key', label: 'Items (inventory_item_master)' },
]

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

function findDupes(rows, key) {
  const map = new Map()
  for (const r of rows) {
    const k = norm(r[key])
    if (!k) continue
    const list = map.get(k) || []
    list.push(r)
    map.set(k, list)
  }
  return [...map.entries()].filter(([, v]) => v.length > 1)
}

async function main() {
  console.log('=== Phase 2 Data Audit (read-only) ===\n')

  if (!url || !key) {
    console.log('SKIP live DB — set SUPABASE_URL and SUPABASE_ANON_KEY for row counts.')
    console.log('Static orphan table list:', ORPHAN_TABLES.join(', '))
    process.exit(0)
  }

  const supabase = createClient(url, key)
  const report = { orphans: {}, masters: {}, orderBook: {} }

  for (const t of ORPHAN_TABLES) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    report.orphans[t] = error ? { error: error.message } : { count: count ?? 0 }
  }

  const { count: obCount } = await supabase.from('order_book').select('*', { count: 'exact', head: true })
  const { count: obiCount } = await supabase.from('order_book_items').select('*', { count: 'exact', head: true })
  const { count: legacyItems } = await supabase
    .from('order_book_items')
    .select('*', { count: 'exact', head: true })
    .is('din_id', null)
    .is('matching_no', null)
  report.orderBook = {
    headers: obCount ?? 0,
    lines: obiCount ?? 0,
    legacyLinesEstimate: legacyItems ?? 0,
  }

  for (const m of MASTER_TABLES) {
    const { data, error } = await supabase.from(m.table).select(`id, ${m.key}`).limit(2000)
    if (error) {
      report.masters[m.table] = { error: error.message }
      continue
    }
    const dupes = findDupes(data ?? [], m.key)
    report.masters[m.table] = {
      total: (data ?? []).length,
      duplicateGroups: dupes.length,
      sample: dupes.slice(0, 3).map(([k, rows]) => ({ key: k, ids: rows.map((r) => r.id) })),
    }
  }

  console.log(JSON.stringify(report, null, 2))
  console.log('\nDone. No data was modified.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
