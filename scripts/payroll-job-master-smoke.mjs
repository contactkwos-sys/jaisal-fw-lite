/**
 * Smoke: Payroll Master required job titles are present in app_settings.
 * Run: node scripts/payroll-job-master-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL || 'https://doitrzsyvcipugmrzykx.supabase.co'
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.OPA_SUPABASE_SERVICE_ROLE_KEY

const REQUIRED = [
  'ASO',
  'Assistant Security Officer',
  'Security Guard',
  'Sweeper',
  'sweeper 1',
  'sweeper 2',
]

const supabase = createClient(URL, KEY, { auth: { persistSession: false } })
const results = []
function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, Object.keys(extra).length ? JSON.stringify(extra) : '')
}

const { data, error } = await supabase
  .from('app_settings')
  .select('value')
  .eq('key', 'payroll_job_master')
  .maybeSingle()

record('settings row exists', !error && !!data?.value, { error: error?.message })
let jobs = []
try {
  jobs = JSON.parse(data?.value || '[]')
} catch (e) {
  record('parse JSON', false, { error: String(e) })
}
record('jobs is array', Array.isArray(jobs), { count: jobs.length })
const names = new Set(jobs.map((j) => String(j.job_name || '').toLowerCase()))
for (const req of REQUIRED) {
  record(`has ${req}`, names.has(req.toLowerCase()))
}

const failed = results.filter((r) => !r.pass)
console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
console.log(failed.length ? `${failed.length} FAILED` : 'ALL PASSED')
process.exit(failed.length ? 1 : 0)
