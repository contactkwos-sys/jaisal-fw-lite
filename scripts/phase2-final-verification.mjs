#!/usr/bin/env node
/**
 * Phase 2 FINAL verification — READ-ONLY.
 * Does NOT modify, delete, archive, or merge any data.
 *
 * Run: node scripts/phase2-final-verification.mjs
 * Env: SUPABASE_URL / VITE_SUPABASE_URL + service role or anon/publishable key
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

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

const TABLES = [
  'order_book',
  'order_book_items',
  'adjustment_notes',
  'programs',
  'program_petty',
  'program_recipe_feeders',
  'dins',
  'din_matchings',
  'design_costing',
  'design_costing_warp',
  'design_costing_weft',
  'designs',
  'design_warp',
  'design_weft',
  'party_master',
  'workers',
  'weft_yarn_stock',
  'order_suppliers',
  'inventory_item_master',
  'order_weft_colours',
  'payroll_rates',
  'salary_rates',
  'warp_beam_pipe',
  'warp_pipes',
  'beam_pipe_in',
  'beam_pipe_out',
  'order_repair_history',
  'production_entries',
  'checking_lots',
  'challans',
  'gatepass',
]

const MASTER_SPECS = [
  { table: 'party_master', key: 'party_name', label: 'Customers', idCol: 'id', extra: 'marka' },
  { table: 'workers', key: 'full_name', label: 'Employees', idCol: 'id', extra: 'employee_code' },
  { table: 'weft_yarn_stock', key: 'colour_no', label: 'Yarn colours', idCol: 'id', extra: 'quality' },
  { table: 'dins', key: 'din_number', label: 'DIN', idCol: 'id', extra: 'design_name' },
  { table: 'designs', key: 'dno', label: 'Designs (legacy)', idCol: 'id', extra: 'colour' },
  { table: 'order_suppliers', key: 'name_key', label: 'Suppliers', idCol: 'id', extra: 'name' },
  { table: 'inventory_item_master', key: 'name_key', label: 'Items', idCol: 'id', extra: 'item_name' },
  { table: 'order_weft_colours', key: 'colour_name', label: 'Colours (order entry)', idCol: 'id', extra: null },
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

async function count(supabase, table) {
  const { count: c, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (error) return { error: error.message, count: null }
  return { count: c ?? 0 }
}

async function sampleLatest(supabase, table, cols = 'id, created_at') {
  const { data, error } = await supabase.from(table).select(cols).order('created_at', { ascending: false }).limit(1)
  if (error) {
    // some tables may lack created_at
    const fallback = await supabase.from(table).select('*').limit(1)
    return { error: error.message, fallbackError: fallback.error?.message, sample: fallback.data?.[0] || null }
  }
  return { sample: data?.[0] || null }
}

async function main() {
  console.log('=== Phase 2 FINAL Verification (READ-ONLY) ===')
  console.log(`URL: ${url}`)
  console.log(`Key source: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : process.env.SUPABASE_SECRET_KEY ? 'secret' : process.env.SUPABASE_PUBLISHABLE_KEY ? 'publishable' : 'anon/vite'}`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  if (!key) {
    console.error('FAIL: No Supabase key in environment')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const report = {
    meta: { url, timestamp: new Date().toISOString(), mode: 'READ_ONLY' },
    tables: {},
    orderBook: {},
    orphans: {},
    masters: {},
    futureMerges: {},
    integrity: {},
  }

  // 1) Table counts
  for (const t of TABLES) {
    const c = await count(supabase, t)
    report.tables[t] = c
  }

  // 2) Order book detail
  const ob = report.tables.order_book?.count
  const obi = report.tables.order_book_items?.count
  const { count: legacyLines, error: legErr } = await supabase
    .from('order_book_items')
    .select('*', { count: 'exact', head: true })
    .is('din_id', null)
    .is('matching_no', null)
  const { count: dinLinked, error: dinErr } = await supabase
    .from('order_book_items')
    .select('*', { count: 'exact', head: true })
    .not('din_id', 'is', null)
  const { count: withMatching } = await supabase
    .from('order_book_items')
    .select('*', { count: 'exact', head: true })
    .not('matching_no', 'is', null)

  report.orderBook = {
    headers: ob,
    lines: obi,
    legacyLinesNoDinNoMatching: legErr ? { error: legErr.message } : legacyLines ?? 0,
    dinLinkedLines: dinErr ? { error: dinErr.message } : dinLinked ?? 0,
    matchingLinkedLines: withMatching ?? 0,
    note: 'BEFORE/AFTER comparison: Phase 2 UI-only — counts must be unchanged vs pre-Phase-2 baseline if no new orders entered',
  }

  // 3) Orphan candidates — count + latest
  for (const t of ['design_warp', 'design_weft', 'beam_pipe_in', 'order_repair_history']) {
    const c = report.tables[t]
    const latest = await sampleLatest(supabase, t)
    report.orphans[t] = { ...c, latest }
  }

  // 4) Master duplicates
  for (const m of MASTER_SPECS) {
    const cols = ['id', m.key, m.extra].filter(Boolean).join(', ')
    const { data, error } = await supabase.from(m.table).select(cols).limit(5000)
    if (error) {
      report.masters[m.table] = { label: m.label, error: error.message }
      continue
    }
    const rows = data ?? []
    const dupes = findDupes(rows, m.key)
    report.masters[m.table] = {
      label: m.label,
      totalFetched: rows.length,
      duplicateGroups: dupes.length,
      groups: dupes.slice(0, 50).map(([k, list]) => ({
        normalizedName: k,
        canonicalId: list[0].id,
        duplicateIds: list.slice(1).map((r) => r.id),
        names: list.map((r) => r[m.key]),
        extras: m.extra ? list.map((r) => r[m.extra]) : undefined,
        recommendedAction: 'CEO APPROVAL REQUIRED — map duplicates → update FKs → archive (DO NOT AUTO-MERGE)',
      })),
    }
  }

  // 5) Future merges — counts only
  report.futureMerges = {
    payroll_rates_to_salary_rates: {
      payroll_rates: report.tables.payroll_rates,
      salary_rates: report.tables.salary_rates,
      recommendation:
        'PROPOSED MERGE — dailyCosting falls back to payroll_rates; migrate workers to salary_rates first, then deprecate payroll_rates UI',
    },
    warp_beam_pipe_to_warp_pipes: {
      warp_beam_pipe: report.tables.warp_beam_pipe,
      warp_pipes: report.tables.warp_pipes,
      recommendation:
        'PROPOSED MERGE — WarpYarnManagementScreen dual-writes; finish migration then make warp_beam_pipe read-only',
    },
  }

  // 6) Integrity spot checks
  const { count: orphanPrograms } = await supabase
    .from('programs')
    .select('*', { count: 'exact', head: true })
    .not('order_item_id', 'is', null)
  const { count: feedersOver6 } = await supabase
    .from('program_recipe_feeders')
    .select('*', { count: 'exact', head: true })
    .gt('feeder_no', 6)

  report.integrity = {
    programsWithOrderItem: orphanPrograms ?? 0,
    feedersWithFeederNoGreaterThan6: feedersOver6 ?? 0,
    maxFeedersEnforcedInCode: 6,
  }

  const outPath = '/tmp/cursor/artifacts/phase2-final-verification.json'
  fs.mkdirSync('/tmp/cursor/artifacts', { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
  console.log('Done. No data was modified.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
