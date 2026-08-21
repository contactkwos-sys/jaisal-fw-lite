/**
 * Payroll Master Job List — designations used for payroll / attendance departments.
 * Prefers `payroll_jobs` table when migrated; falls back to `app_settings.payroll_job_master`.
 */

import { supabase } from './supabase'

export type PayrollJob = {
  id: string
  job_name: string
  job_code: string
  is_active: boolean
}

export const PAYROLL_JOB_LIMIT = 50

/** Required titles for Security / Sweeper payroll master */
export const REQUIRED_PAYROLL_JOBS = [
  'ASO',
  'Assistant Security Officer',
  'Security Guard',
  'Security',
  'Sweeper',
  'sweeper 1',
  'sweeper 2',
] as const

/** Extra common titles matching the factory master list */
export const DEFAULT_PAYROLL_JOBS = [
  ...REQUIRED_PAYROLL_JOBS,
  'Cleaner',
  'Maintenance man',
  'Supervisor',
  'Signal man / 2nd',
  'Watcher',
] as const

const SETTINGS_KEY = 'payroll_job_master'

function norm(name: string) {
  return name.trim().toLowerCase()
}

function makeCode(seed: number): string {
  return String(152345 + seed)
}

function fromNames(names: string[]): PayrollJob[] {
  return names.map((job_name, i) => ({
    id: crypto.randomUUID(),
    job_name,
    job_code: makeCode(i),
    is_active: true,
  }))
}

async function loadFromTable(): Promise<PayrollJob[] | null> {
  const { data, error } = await supabase
    .from('payroll_jobs')
    .select('id, job_name, job_code, is_active')
    .eq('is_active', true)
    .order('job_name')
  if (error) {
    // Table missing until migration applied
    if (/does not exist|schema cache|PGRST/i.test(error.message)) return null
    throw error
  }
  return (data as PayrollJob[]) ?? []
}

async function saveToTable(jobs: PayrollJob[]): Promise<boolean> {
  // Upsert by deleting inactive gaps is complex; replace-all for migrated table
  const { error: delErr } = await supabase.from('payroll_jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (delErr) {
    if (/does not exist|schema cache|PGRST/i.test(delErr.message)) return false
    throw delErr
  }
  if (!jobs.length) return true
  const { error } = await supabase.from('payroll_jobs').insert(
    jobs.map((j) => ({
      id: j.id,
      job_name: j.job_name,
      job_code: j.job_code,
      is_active: j.is_active,
      updated_at: new Date().toISOString(),
    })),
  )
  if (error) throw error
  return true
}

async function loadFromSettings(): Promise<PayrollJob[]> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()
  if (error) throw error
  if (!data?.value) return []
  try {
    const parsed = JSON.parse(data.value) as PayrollJob[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((j) => j && typeof j.job_name === 'string')
  } catch {
    return []
  }
}

async function saveToSettings(jobs: PayrollJob[]): Promise<void> {
  const payload = {
    key: SETTINGS_KEY,
    value: JSON.stringify(jobs),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'key' })
  if (error) throw error
}

/** Merge required titles into a job list without duplicates (case-insensitive). */
export function ensureRequiredJobs(jobs: PayrollJob[]): PayrollJob[] {
  const have = new Set(jobs.map((j) => norm(j.job_name)))
  const next = [...jobs]
  let codeSeed = next.length
  for (const name of REQUIRED_PAYROLL_JOBS) {
    if (have.has(norm(name))) continue
    next.push({
      id: crypto.randomUUID(),
      job_name: name,
      job_code: makeCode(codeSeed++),
      is_active: true,
    })
    have.add(norm(name))
  }
  return next.sort((a, b) => a.job_name.localeCompare(b.job_name, undefined, { sensitivity: 'base' }))
}

export async function listPayrollJobs(): Promise<PayrollJob[]> {
  const fromTable = await loadFromTable()
  let jobs = fromTable ?? (await loadFromSettings())
  let dirty = false
  if (!jobs.length) {
    jobs = fromNames([...DEFAULT_PAYROLL_JOBS])
    dirty = true
  }
  const before = jobs.length
  const namesBefore = new Set(jobs.map((j) => norm(j.job_name)))
  jobs = ensureRequiredJobs(jobs)
  if (jobs.length !== before || jobs.some((j) => !namesBefore.has(norm(j.job_name)))) {
    dirty = true
  }
  if (dirty) await persistPayrollJobs(jobs)
  return jobs
}

export async function persistPayrollJobs(jobs: PayrollJob[]): Promise<void> {
  if (jobs.length > PAYROLL_JOB_LIMIT) {
    throw new Error(`Maximum ${PAYROLL_JOB_LIMIT} jobs allowed`)
  }
  const cleaned = jobs
    .map((j) => ({
      ...j,
      job_name: j.job_name.trim(),
      job_code: (j.job_code || '').trim() || makeCode(0),
      is_active: j.is_active !== false,
    }))
    .filter((j) => j.job_name)
  const seen = new Set<string>()
  for (const j of cleaned) {
    const key = norm(j.job_name)
    if (seen.has(key)) throw new Error(`Duplicate job name: ${j.job_name}`)
    seen.add(key)
  }
  const savedTable = await saveToTable(cleaned).catch((e: Error) => {
    if (/does not exist|schema cache|PGRST/i.test(e.message)) return false
    throw e
  })
  if (!savedTable) await saveToSettings(cleaned)
}

export async function addPayrollJob(jobName: string, jobCode?: string): Promise<PayrollJob[]> {
  const jobs = await listPayrollJobs()
  const name = jobName.trim()
  if (!name) throw new Error('Job name required')
  if (jobs.length >= PAYROLL_JOB_LIMIT) throw new Error(`Maximum ${PAYROLL_JOB_LIMIT} jobs allowed`)
  if (jobs.some((j) => norm(j.job_name) === norm(name))) {
    throw new Error(`Job “${name}” already exists`)
  }
  const next = [
    ...jobs,
    {
      id: crypto.randomUUID(),
      job_name: name,
      job_code: (jobCode || '').trim() || makeCode(jobs.length),
      is_active: true,
    },
  ]
  await persistPayrollJobs(next)
  return ensureRequiredJobs(next)
}

export async function updatePayrollJob(
  id: string,
  patch: { job_name?: string; job_code?: string },
): Promise<PayrollJob[]> {
  const jobs = await listPayrollJobs()
  const idx = jobs.findIndex((j) => j.id === id)
  if (idx < 0) throw new Error('Job not found')
  const name = (patch.job_name ?? jobs[idx].job_name).trim()
  if (!name) throw new Error('Job name required')
  if (jobs.some((j, i) => i !== idx && norm(j.job_name) === norm(name))) {
    throw new Error(`Job “${name}” already exists`)
  }
  const next = jobs.map((j) =>
    j.id === id
      ? {
          ...j,
          job_name: name,
          job_code: (patch.job_code ?? j.job_code).trim() || j.job_code,
        }
      : j,
  )
  await persistPayrollJobs(next)
  return next
}

export async function removePayrollJob(id: string): Promise<PayrollJob[]> {
  const jobs = await listPayrollJobs()
  const next = jobs.filter((j) => j.id !== id)
  await persistPayrollJobs(next)
  return next
}
