import type { MainModuleId } from './nav'
import { MAIN_MODULES } from './nav'

export type ModulePermission = {
  moduleId: MainModuleId
  /** Empty = all sub-items in module. Otherwise only listed sub-item ids. */
  subIds?: string[]
}

const STORAGE_KEY = 'jaisal_fw_role_permissions_v1'

const CEO_MODULES: MainModuleId[] = [
  'dashboard',
  'production',
  'inventory',
  'cash-book',
  'orders',
  'reports',
  'maintenance',
  'masters',
  'security',
  'settings',
]

const MANAGER_MODULES: MainModuleId[] = [
  'production',
  'inventory',
  'cash-book',
  'orders',
  'reports',
  'maintenance',
  'masters',
  'security',
  'settings',
]

/** Default module access by role name (case-insensitive match / includes). */
const ROLE_DEFAULTS: Record<string, MainModuleId[]> = {
  ceo: CEO_MODULES,
  // Managing Director / MD — same floor access as CEO (Orders + Design Broadcast included)
  md: CEO_MODULES,
  'managing director': CEO_MODULES,
  owner: CEO_MODULES,
  // Manager: all modules EXCEPT CEO Dashboard
  manager: MANAGER_MODULES,
  'machine supervisor': ['production', 'inventory', 'maintenance', 'reports'],
  salesman: ['orders', 'masters', 'reports', 'cash-book'],
  'checker & dispatch': ['production', 'inventory', 'security'],
  'program supervisor': ['production', 'orders', 'reports'],
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

/** Security role — gate + yarn OCR + GEB */
const SECURITY_SUBS: Partial<Record<MainModuleId, string[]>> = {
  security: ['security-gate', 'yarn-inward-sec', 'geb-sec', 'login-activity'],
  inventory: ['yarn-inward'],
}

function normalizeRole(name: string): string {
  return name.trim().toLowerCase()
}

function matchDefaultModules(roleName: string): MainModuleId[] {
  const n = normalizeRole(roleName)
  if (!n) return ['production']
  if (ROLE_DEFAULTS[n]) return ROLE_DEFAULTS[n]
  // Fuzzy match only for longer names — short tokens like "md" must not match
  // inside "admin" via String.includes (that hid Orders / Design Broadcast).
  for (const [key, mods] of Object.entries(ROLE_DEFAULTS)) {
    if (n.length < 4 || key.length < 4) continue
    if (n.includes(key) || key.includes(n)) return mods
  }
  return ['production']
}

/** Prefer DB role name, then auth metadata, then display name — never blank. */
export function resolveAccessRoleName(input: {
  roleName?: string | null
  metaRoleName?: string | null
  fullName?: string | null
  fallback?: string
}): string {
  const fromRole = (input.roleName || '').trim()
  if (fromRole) return fromRole
  const fromMeta = (input.metaRoleName || '').trim()
  if (fromMeta) return fromMeta
  const fromName = (input.fullName || '').trim()
  if (fromName) return fromName
  return input.fallback || 'User'
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

  return modules.map((moduleId) => {
    let subIds: string[] | undefined
    if (isOperator && OPERATOR_SUBS[moduleId]) subIds = OPERATOR_SUBS[moduleId]
    if (isSecurity && SECURITY_SUBS[moduleId]) subIds = SECURITY_SUBS[moduleId]
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
  if (n === 'ceo' || n === 'md' || n === 'managing director' || n === 'owner') return true
  // Hard rule: Manager never gets CEO Dashboard
  if (n === 'manager' && moduleId === 'dashboard') return false
  return getPermissionsForRole(roleName).some((p) => p.moduleId === moduleId)
}

export function canAccessSub(roleName: string, moduleId: MainModuleId, subId: string): boolean {
  const n = normalizeRole(roleName)
  if (n === 'ceo' || n === 'md' || n === 'managing director' || n === 'owner') return true
  if (n === 'manager' && moduleId === 'dashboard') return false
  const perm = getPermissionsForRole(roleName).find((p) => p.moduleId === moduleId)
  if (!perm) return false
  if (!perm.subIds || perm.subIds.length === 0) return true
  return perm.subIds.includes(subId)
}

export function allowedModules(roleName: string): MainModuleId[] {
  const n = normalizeRole(roleName)
  if (n === 'ceo' || n === 'md' || n === 'managing director' || n === 'owner') {
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
