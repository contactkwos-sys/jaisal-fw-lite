/** CEO PIN Management — module PINs, departments, users, audit */

import type { MainModuleId } from './nav'
import { supabase } from './supabase'

const UNLOCK_KEY = 'jaisal_module_unlocks_v1'

export type ModulePinRow = {
  id: string
  module_key: string
  module_name: string
  department_id: string | null
  department_name: string | null
  pin: string
  is_active: boolean
  updated_at: string
}

export type PinSummary = {
  total_modules: number
  active_pins: number
  departments: number
  users: number
  ceo_pin_set: boolean
  ceo_pin_updated_at: string | null
}

export type PinDepartment = {
  id: string
  name: string
  code: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PinDepartmentUser = {
  id: string
  department_id: string | null
  worker_id: string | null
  full_name: string
  email: string | null
  mobile: string | null
  designation: string | null
  custom_designation: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  pin_departments?: { name: string } | null
  pin_user_module_access?: Array<{ module_key: string; can_access: boolean }>
}

export type PinAuditRow = {
  id: string
  action: string
  module_key: string | null
  module_name: string | null
  department_name: string | null
  target_user: string | null
  reference: string | null
  performed_by_name: string | null
  created_at: string
}

export type SalaryAdvanceRow = {
  id: string
  worker_id: string
  advance_date: string
  amount: number
  payment_mode: 'Cash' | 'Cheque' | 'Bank Transfer'
  reference_no: string | null
  bank_name: string | null
  remarks: string | null
  is_voided: boolean
  created_by_name: string | null
  created_at: string
  workers?: { full_name: string; employee_code: string | null } | null
}

async function invokeModulePin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('module-pin-manager', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    let msg = error.message
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.clone().json()) as { error?: string }
        if (payload.error) msg = payload.error
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg || 'module-pin-manager failed')
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

export function readUnlockedModules(): Set<string> {
  try {
    const raw = sessionStorage.getItem(UNLOCK_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

export function unlockModule(moduleId: MainModuleId | string): void {
  const set = readUnlockedModules()
  set.add(moduleId)
  sessionStorage.setItem(UNLOCK_KEY, JSON.stringify([...set]))
}

export function clearModuleUnlocks(): void {
  sessionStorage.removeItem(UNLOCK_KEY)
}

export function isModuleUnlocked(moduleId: MainModuleId | string, isCeo: boolean): boolean {
  if (isCeo) return true
  return readUnlockedModules().has(moduleId)
}

export async function verifyModulePin(moduleKey: string, pin: string): Promise<boolean> {
  const res = await invokeModulePin<{ ok: boolean }>({
    action: 'verify_module_pin',
    module_key: moduleKey,
    pin,
  })
  return Boolean(res.ok)
}

export async function verifyCeoPin(pin: string): Promise<boolean> {
  const res = await invokeModulePin<{ ok: boolean }>({
    action: 'verify_ceo_pin',
    pin,
  })
  return Boolean(res.ok)
}

export async function fetchModulePins(): Promise<{ modules: ModulePinRow[]; summary: PinSummary }> {
  return invokeModulePin({ action: 'list_modules' })
}

export async function syncModulePins(): Promise<void> {
  await invokeModulePin({ action: 'sync_modules' })
}

export async function setModulePin(moduleKey: string, pin: string): Promise<string> {
  const res = await invokeModulePin<{ ok: boolean; pin: string }>({
    action: 'set_module_pin',
    module_key: moduleKey,
    pin,
  })
  return res.pin
}

export async function resetModulePin(moduleKey: string): Promise<string> {
  const res = await invokeModulePin<{ ok: boolean; pin: string }>({
    action: 'reset_module_pin',
    module_key: moduleKey,
  })
  return res.pin
}

export async function toggleModulePin(moduleKey: string, isActive?: boolean): Promise<boolean> {
  const res = await invokeModulePin<{ ok: boolean; is_active: boolean }>({
    action: 'toggle_module',
    module_key: moduleKey,
    is_active: isActive,
  })
  return res.is_active
}

export async function setModuleDepartment(moduleKey: string, departmentId: string | null): Promise<void> {
  await invokeModulePin({
    action: 'set_module_department',
    module_key: moduleKey,
    department_id: departmentId,
  })
}

export async function changeCeoPin(args: {
  currentPin?: string
  newPin: string
  otpPin?: string
}): Promise<void> {
  await invokeModulePin({
    action: 'change_ceo_pin',
    current_pin: args.currentPin,
    new_pin: args.newPin,
    otp_pin: args.otpPin,
  })
}

export async function logPinShared(args: {
  moduleKey: string
  departmentName?: string
  targetUser?: string
  channel: string
}): Promise<void> {
  await invokeModulePin({
    action: 'log_pin_shared',
    module_key: args.moduleKey,
    department_name: args.departmentName,
    target_user: args.targetUser,
    channel: args.channel,
  })
}

export async function fetchPinAudit(limit = 100): Promise<PinAuditRow[]> {
  const res = await invokeModulePin<{ rows: PinAuditRow[] }>({
    action: 'list_audit',
    limit,
  })
  return res.rows ?? []
}

export async function fetchPinDepartments(): Promise<PinDepartment[]> {
  const { data, error } = await supabase
    .from('pin_departments')
    .select('*')
    .order('name')
  if (error) throw error
  return (data as PinDepartment[]) ?? []
}

export async function upsertPinDepartment(row: Partial<PinDepartment> & { name: string }): Promise<void> {
  const payload = {
    name: row.name.trim(),
    code: row.code?.trim() || null,
    is_active: row.is_active ?? true,
    updated_at: new Date().toISOString(),
  }
  if (row.id) {
    const { error } = await supabase.from('pin_departments').update(payload).eq('id', row.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('pin_departments').insert(payload)
    if (error) throw error
  }
}

export async function fetchPinUsers(): Promise<PinDepartmentUser[]> {
  const { data, error } = await supabase
    .from('pin_department_users')
    .select('*, pin_departments(name), pin_user_module_access(module_key, can_access)')
    .order('full_name')
  if (error) throw error
  return (data as PinDepartmentUser[]) ?? []
}

export async function upsertPinUser(
  row: {
    id?: string
    department_id?: string | null
    worker_id?: string | null
    full_name: string
    email?: string | null
    mobile?: string | null
    designation?: string | null
    custom_designation?: string | null
    is_active?: boolean
    module_keys?: string[]
  },
  performedBy?: { id?: string; name?: string },
): Promise<void> {
  const payload = {
    department_id: row.department_id || null,
    worker_id: row.worker_id || null,
    full_name: row.full_name.trim(),
    email: row.email?.trim() || null,
    mobile: row.mobile?.trim() || null,
    designation: row.designation?.trim() || null,
    custom_designation: row.custom_designation?.trim() || null,
    is_active: row.is_active ?? true,
    updated_at: new Date().toISOString(),
  }
  let userId = row.id
  if (userId) {
    const { error } = await supabase.from('pin_department_users').update(payload).eq('id', userId)
    if (error) throw error
  } else {
    const { data, error } = await supabase.from('pin_department_users').insert(payload).select('id').single()
    if (error) throw error
    userId = (data as { id: string }).id
  }
  if (row.module_keys && userId) {
    await supabase.from('pin_user_module_access').delete().eq('user_id', userId)
    if (row.module_keys.length) {
      const { error } = await supabase.from('pin_user_module_access').insert(
        row.module_keys.map((module_key) => ({
          user_id: userId,
          module_key,
          can_access: true,
        })),
      )
      if (error) throw error
    }
  }
  await supabase.from('pin_management_audit').insert({
    action: row.id ? 'User access changed' : 'User access created',
    target_user: row.full_name,
    performed_by: performedBy?.id ?? null,
    performed_by_name: performedBy?.name ?? null,
  })
}

export function buildPinShareMessage(args: {
  moduleName: string
  departmentName?: string
  pin: string
  issuedBy?: string
}): string {
  const lines = [
    'JAISAL FASHIONWEAV INDUSTRIES',
    '',
    args.departmentName ? `Department: ${args.departmentName}` : null,
    `Module: ${args.moduleName}`,
    `PIN: ${args.pin}`,
    '',
    `Use this PIN to access the ${args.moduleName} module.`,
    '',
    `Issued by: ${args.issuedBy || 'CEO'}`,
    `Date: ${new Date().toLocaleString('en-IN')}`,
  ]
  return lines.filter(Boolean).join('\n')
}

export async function fetchSalaryAdvances(workerId?: string): Promise<SalaryAdvanceRow[]> {
  let q = supabase
    .from('salary_advance_transactions')
    .select('*, workers(full_name, employee_code)')
    .eq('is_voided', false)
    .order('advance_date', { ascending: false })
    .limit(500)
  if (workerId) q = q.eq('worker_id', workerId)
  const { data, error } = await q
  if (error) throw error
  return (data as SalaryAdvanceRow[]) ?? []
}

export async function sumSalaryAdvancesForWorker(
  workerId: string,
  fromDate?: string,
  toDate?: string,
): Promise<number> {
  let q = supabase
    .from('salary_advance_transactions')
    .select('amount')
    .eq('worker_id', workerId)
    .eq('is_voided', false)
  if (fromDate) q = q.gte('advance_date', fromDate)
  if (toDate) q = q.lte('advance_date', toDate)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).reduce((s, r) => s + Number(r.amount || 0), 0)
}

export async function createSalaryAdvance(
  input: {
    worker_id: string
    advance_date: string
    amount: number
    payment_mode: 'Cash' | 'Cheque' | 'Bank Transfer' | 'Other'
    reference_no?: string
    bank_name?: string
    remarks?: string
  },
  createdBy?: { id?: string; name?: string },
): Promise<void> {
  const { error } = await supabase.from('salary_advance_transactions').insert({
    worker_id: input.worker_id,
    advance_date: input.advance_date,
    amount: input.amount,
    payment_mode: input.payment_mode,
    reference_no: input.reference_no?.trim() || null,
    bank_name: input.bank_name?.trim() || null,
    remarks: input.remarks?.trim() || null,
    created_by: createdBy?.id ?? null,
    created_by_name: createdBy?.name ?? null,
  })
  if (error) throw error
  await supabase.from('pin_management_audit').insert({
    action: 'Advance salary created',
    target_user: input.worker_id,
    reference: `${input.payment_mode} ₹${input.amount}`,
    performed_by: createdBy?.id ?? null,
    performed_by_name: createdBy?.name ?? null,
    metadata: { advance_date: input.advance_date },
  })
}

export async function updateSalaryAdvance(
  id: string,
  input: Partial<{
    advance_date: string
    amount: number
    payment_mode: string
    reference_no: string
    bank_name: string
    remarks: string
  }>,
  performedBy?: { id?: string; name?: string },
): Promise<void> {
  const { error } = await supabase
    .from('salary_advance_transactions')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await supabase.from('pin_management_audit').insert({
    action: 'Advance salary edited',
    reference: id,
    performed_by: performedBy?.id ?? null,
    performed_by_name: performedBy?.name ?? null,
  })
}
