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
  ceo: ['dashboard', 'production', 'inventory', 'orders', 'reports', 'maintenance', 'masters', 'security', 'settings'],
  'mill incharge': ['dashboard', 'production', 'inventory', 'orders', 'reports', 'maintenance'],
  mill: ['dashboard', 'production', 'inventory', 'orders', 'reports', 'maintenance'],
  'store incharge': ['inventory', 'reports'],
  store: ['inventory', 'reports'],
  'production incharge': ['production', 'orders', 'reports'],
  programmer: ['production', 'orders', 'reports'],
  operator: ['production'],
  security: ['security'],
  account: ['reports', 'masters', 'security'],
  admin: ['reports', 'masters', 'security', 'settings'],
  accounts: ['reports', 'masters'],
}

/** Operator may only open production entry / related entry screens */
const OPERATOR_SUBS: Partial<Record<MainModuleId, string[]>> = {
  production: ['prod-entry', 'weft-issue', 'warp-issue', 'folding'],
}

/** Security role — gate + basic verification */
const SECURITY_SUBS: Partial<Record<MainModuleId, string[]>> = {
  security: ['security-gate', 'login-activity'],
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
  // Unknown custom roles: conservative — dashboard + production
  return ['dashboard', 'production']
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
  const isSecurity = n === 'security' || n.includes('security')

  return modules.map((moduleId) => {
    let subIds: string[] | undefined
    if (isOperator && OPERATOR_SUBS[moduleId]) subIds = OPERATOR_SUBS[moduleId]
    if (isSecurity && SECURITY_SUBS[moduleId]) subIds = SECURITY_SUBS[moduleId]
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
  if (normalizeRole(roleName) === 'ceo') return true
  return getPermissionsForRole(roleName).some((p) => p.moduleId === moduleId)
}

export function canAccessSub(roleName: string, moduleId: MainModuleId, subId: string): boolean {
  if (normalizeRole(roleName) === 'ceo') return true
  const perm = getPermissionsForRole(roleName).find((p) => p.moduleId === moduleId)
  if (!perm) return false
  if (!perm.subIds || perm.subIds.length === 0) return true
  return perm.subIds.includes(subId)
}

export function allowedModules(roleName: string): MainModuleId[] {
  if (normalizeRole(roleName) === 'ceo') {
    return MAIN_MODULES.map((m) => m.id)
  }
  return getPermissionsForRole(roleName).map((p) => p.moduleId)
}

export function firstAllowedLanding(roleName: string): { module: MainModuleId; screen: import('./nav').AppScreen; sub?: string } {
  const mods = allowedModules(roleName)
  const first = mods[0] || 'dashboard'
  if (first === 'dashboard') return { module: 'dashboard', screen: 'home' }
  const mod = MAIN_MODULES.find((m) => m.id === first)
  if (!mod) return { module: 'dashboard', screen: 'home' }
  if (mod.hasHub) return { module: mod.id, screen: 'module-hub', sub: mod.id }
  return { module: mod.id, screen: mod.screen, sub: mod.sub }
}

export const ALL_MODULE_OPTIONS = MAIN_MODULES.map((m) => ({
  id: m.id,
  label: m.label,
  items: m.items.map((i) => ({ id: i.id, label: i.label })),
}))
