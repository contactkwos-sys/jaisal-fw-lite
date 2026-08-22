import type { MainModuleId } from './nav'
import { MAIN_MODULES } from './nav'

export type ModulePermission = {
  moduleId: MainModuleId
  /** Empty = all sub-items in module. Otherwise only listed sub-item ids. */
  subIds?: string[]
}

const STORAGE_KEY = 'jaisal_fw_role_permissions_v1'

/** Default module access by role name (case-insensitive match / includes). */
const ROLE_DEFAULTS: Record<string, MainModuleId[]> = {
  ceo: ['dashboard', 'production', 'inventory', 'cash-book', 'orders', 'reports', 'maintenance', 'masters', 'security', 'settings'],
  // Manager: all modules EXCEPT CEO Dashboard
  manager: ['production', 'inventory', 'cash-book', 'orders', 'reports', 'maintenance', 'masters', 'security', 'settings'],
  'machine supervisor': ['production', 'reports'],
  salesman: ['orders', 'masters', 'reports', 'cash-book'],
  'checker & dispatch': ['production', 'inventory'],
  'program supervisor': ['orders', 'production', 'reports'],
  'mill incharge': ['production', 'inventory', 'cash-book', 'orders', 'reports', 'maintenance'],
  mill: ['production', 'inventory', 'cash-book', 'orders', 'reports', 'maintenance'],
  'store incharge': ['inventory', 'cash-book', 'reports'],
  store: ['inventory', 'cash-book', 'reports'],
  'production incharge': ['production', 'orders', 'reports'],
  programmer: ['production', 'orders', 'reports'],
  operator: ['production'],
  security: ['security', 'inventory'],
  account: ['cash-book', 'reports', 'masters', 'security'],
  admin: ['cash-book', 'reports', 'masters', 'security', 'settings'],
  accounts: ['cash-book', 'reports', 'masters'],
}

/** Operator may only open production entry / related entry screens */
const OPERATOR_SUBS: Partial<Record<MainModuleId, string[]>> = {
  production: ['prod-entry', 'weft-issue', 'warp-issue', 'folding'],
}

/** Machine Supervisor — production report focus */
const MACHINE_SUPERVISOR_SUBS: Partial<Record<MainModuleId, string[]>> = {
  production: ['machine-prod-report', 'prod-entry', 'machine-wise', 'shift-wise'],
  reports: ['prod-report', 'machine-report'],
}

/** Checker & Dispatch */
const CHECKER_SUBS: Partial<Record<MainModuleId, string[]>> = {
  production: ['checking', 'dispatch', 'folding'],
}

/** Program Supervisor */
const PROGRAM_SUPERVISOR_SUBS: Partial<Record<MainModuleId, string[]>> = {
  orders: [
    'program-book',
    'program-card',
    'program-pending',
    'sample-program-card',
    'design-costing',
    'design-job',
    'order-book',
  ],
  production: ['job-card'],
}

/** Salesman */
const SALESMAN_SUBS: Partial<Record<MainModuleId, string[]>> = {
  orders: ['sample-program-card', 'photo-catalogue', 'sales-tracker', 'order-book', 'broadcast', 'design-catalog'],
}

/** Security role — gate + yarn OCR + GEB + CTR */
const SECURITY_SUBS: Partial<Record<MainModuleId, string[]>> = {
  security: ['security-gate', 'yarn-inward-sec', 'ctr-stock-sec', 'geb-sec', 'login-activity'],
  inventory: ['yarn-inward', 'ctr-stock'],
}

function normalizeRole(name: string): string {
  return name.trim().toLowerCase()
}

function matchDefaultModules(roleName: string): MainModuleId[] {
  const n = normalizeRole(roleName)
  if (ROLE_DEFAULTS[n]) return ROLE_DEFAULTS[n]
  for (const [key, mods] of Object.entries(ROLE_DEFAULTS)) {
    if (n.includes(key) || key.includes(n)) return mods
  }
  return ['production']
}

function readOverrides(): Record<string, ModulePermission[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, ModulePermission[]>
  } catch {
    return {}
  }
}

export function saveRolePermissions(roleKey: string, perms: ModulePermission[]): void {
  const all = readOverrides()
  all[normalizeRole(roleKey)] = perms
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function clearRolePermissionOverride(roleKey: string): void {
  const all = readOverrides()
  delete all[normalizeRole(roleKey)]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function getDefaultPermissions(roleName: string): ModulePermission[] {
  const modules = matchDefaultModules(roleName)
  const n = normalizeRole(roleName)
  const isOperator = n.includes('operator')
  const isSecurity = n === 'security' || (n.includes('security') && !n.includes('supervisor'))
  const isManager = n === 'manager'
  const isMachineSupervisor = n === 'machine supervisor' || n.includes('machine supervisor')
  const isChecker = n === 'checker & dispatch' || n.includes('checker')
  const isProgramSupervisor = n === 'program supervisor' || n.includes('program supervisor')
  const isSalesman = n === 'salesman' || n.includes('salesman')

  return modules.map((moduleId) => {
    let subIds: string[] | undefined
    if (isOperator && OPERATOR_SUBS[moduleId]) subIds = OPERATOR_SUBS[moduleId]
    if (isSecurity && SECURITY_SUBS[moduleId]) subIds = SECURITY_SUBS[moduleId]
    if (isMachineSupervisor && MACHINE_SUPERVISOR_SUBS[moduleId]) subIds = MACHINE_SUPERVISOR_SUBS[moduleId]
    if (isChecker && CHECKER_SUBS[moduleId]) subIds = CHECKER_SUBS[moduleId]
    if (isProgramSupervisor && PROGRAM_SUPERVISOR_SUBS[moduleId]) subIds = PROGRAM_SUPERVISOR_SUBS[moduleId]
    if (isSalesman && SALESMAN_SUBS[moduleId]) subIds = SALESMAN_SUBS[moduleId]
    // Manager: full access to every allowed module (no sub restriction)
    if (isManager) subIds = undefined
    return { moduleId, subIds }
  })
}

export function getPermissionsForRole(roleName: string): ModulePermission[] {
  const overrides = readOverrides()
  const key = normalizeRole(roleName)
  if (overrides[key]?.length) return overrides[key]
  return getDefaultPermissions(roleName)
}

export function canAccessModule(roleName: string, moduleId: MainModuleId): boolean {
  const n = normalizeRole(roleName)
  if (n === 'ceo') return true
  // Hard rule: Manager never gets CEO Dashboard
  if (n === 'manager' && moduleId === 'dashboard') return false
  return getPermissionsForRole(roleName).some((p) => p.moduleId === moduleId)
}

export function canAccessSub(roleName: string, moduleId: MainModuleId, subId: string): boolean {
  const n = normalizeRole(roleName)
  if (n === 'ceo') return true
  if (n === 'manager' && moduleId === 'dashboard') return false
  const perm = getPermissionsForRole(roleName).find((p) => p.moduleId === moduleId)
  if (!perm) return false
  if (!perm.subIds || perm.subIds.length === 0) return true
  return perm.subIds.includes(subId)
}

export function allowedModules(roleName: string): MainModuleId[] {
  const n = normalizeRole(roleName)
  if (n === 'ceo') {
    return MAIN_MODULES.map((m) => m.id)
  }
  return getPermissionsForRole(roleName)
    .map((p) => p.moduleId)
    .filter((id) => !(n === 'manager' && id === 'dashboard'))
}

export function firstAllowedLanding(roleName: string): { module: MainModuleId; screen: import('./nav').AppScreen; sub?: string } {
  const mods = allowedModules(roleName)
  const first = mods[0] || 'production'
  if (first === 'dashboard') return { module: 'dashboard', screen: 'home' }
  const mod = MAIN_MODULES.find((m) => m.id === first)
  if (!mod) return { module: 'production', screen: 'module-hub', sub: 'production' }
  if (mod.hasHub) return { module: mod.id, screen: 'module-hub', sub: mod.id }
  return { module: mod.id, screen: mod.screen, sub: mod.sub }
}

export const ALL_MODULE_OPTIONS = MAIN_MODULES.map((m) => ({
  id: m.id,
  label: m.label,
  items: m.items.map((i) => ({ id: i.id, label: i.label })),
}))
