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
  'design-to-order',
  'program-dispatch',
  'warp-yarn',
  'hr-payroll',
  'maintenance',
  'security',
  'orders',
  'daily-pending-work',
  'cash-book',
  'reports',
  'masters',
  'settings',
  'utilities',
]

const MANAGER_MODULES: MainModuleId[] = CEO_MODULES.filter((m) => m !== 'dashboard')

/** Default module access by role name (case-insensitive match / includes). */
const ROLE_DEFAULTS: Record<string, MainModuleId[]> = {
  ceo: CEO_MODULES,
  md: CEO_MODULES,
  'managing director': CEO_MODULES,
  owner: CEO_MODULES,
  manager: MANAGER_MODULES,
  'machine supervisor': ['production', 'program-dispatch', 'inventory', 'warp-yarn', 'maintenance', 'daily-pending-work', 'utilities', 'reports'],
  salesman: ['design-to-order', 'orders', 'masters', 'reports', 'cash-book'],
  'checker & dispatch': ['production', 'program-dispatch', 'inventory', 'security'],
  'program supervisor': ['production', 'program-dispatch', 'orders', 'reports', 'design-to-order'],
  'mill incharge': [
    'production',
    'program-dispatch',
    'inventory',
    'warp-yarn',
    'cash-book',
    'hr-payroll',
    'orders',
    'reports',
    'maintenance',
    'daily-pending-work',
    'design-to-order',
    'utilities',
  ],
  mill: [
    'production',
    'program-dispatch',
    'inventory',
    'warp-yarn',
    'cash-book',
    'hr-payroll',
    'orders',
    'reports',
    'maintenance',
    'daily-pending-work',
    'design-to-order',
    'utilities',
  ],
  'store incharge': ['inventory', 'warp-yarn', 'cash-book', 'reports', 'security'],
  store: ['inventory', 'warp-yarn', 'cash-book', 'reports'],
  'production incharge': ['production', 'program-dispatch', 'orders', 'reports', 'design-to-order'],
  programmer: ['production', 'program-dispatch', 'orders', 'reports', 'design-to-order'],
  operator: ['production', 'program-dispatch', 'utilities'],
  security: ['security', 'inventory', 'warp-yarn', 'hr-payroll'],
  account: ['cash-book', 'hr-payroll', 'reports', 'masters', 'security'],
  admin: ['cash-book', 'hr-payroll', 'reports', 'masters', 'security', 'settings'],
  accounts: ['cash-book', 'hr-payroll', 'reports', 'masters'],
  hr: ['hr-payroll', 'masters', 'reports'],
  payroll: ['hr-payroll', 'reports'],
}

/** Operator may only open production entry / related entry screens */
const OPERATOR_SUBS: Partial<Record<MainModuleId, string[]>> = {
  production: ['weft-issue', 'job-card', 'prod-entry', 'mwp-report', 'shift-wise'],
  'program-dispatch': ['prod-entry', 'folding', 'tracking'],
}

/** Security role — Security Inventory entry + gate + yarn OCR + GEB + attendance */
const SECURITY_SUBS: Partial<Record<MainModuleId, string[]>> = {
  security: [
    'security-inventory',
    'si-warp',
    'si-weft',
    'si-maint-in',
    'si-maint-out',
    'si-general',
    'si-others',
    'si-pending',
    'si-documents',
    'si-reports',
    'security-gate',
    'yarn-inward-sec',
    'geb-sec',
    'login-activity',
  ],
  inventory: [
    'yarn-stock',
    'wy-overview',
    'wy-machines',
    'wy-godown',
    'wy-empty',
    'wy-warper',
    'wy-reports',
    'stock-reports',
  ],
  'warp-yarn': ['wy-overview', 'wy-machines', 'wy-godown', 'wy-empty', 'wy-warper', 'wy-reports'],
  'hr-payroll': ['hr-attendance', 'hr-dash'],
}

/** Design to Program — DIN Costing view-only (no rates / formula master) */
const PROGRAM_SUBS: Partial<Record<MainModuleId, string[]>> = {
  'design-to-order': [
    'din-intake',
    'din-costing-view',
    'sample-job',
    'sample-tracking',
    'sample-promotion',
    'order-to-program',
    'order-booking',
    'order-status',
    'program-to-machine',
    'dto-reports',
    'followup',
  ],
}

/** Salesman — Design to Order without costing rates */
const SALESMAN_SUBS: Partial<Record<MainModuleId, string[]>> = {
  'design-to-order': [
    'din-intake',
    'sample-job',
    'sample-tracking',
    'sample-promotion',
    'order-to-program',
    'order-booking',
    'order-status',
    'program-to-machine',
    'dto-reports',
    'followup',
  ],
}

function normalizeRole(name: string): string {
  return name.trim().toLowerCase()
}

function matchDefaultModules(roleName: string): MainModuleId[] {
  const n = normalizeRole(roleName)
  if (!n) return ['production']
  if (ROLE_DEFAULTS[n]) return ROLE_DEFAULTS[n]
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
    if (n === 'salesman' && SALESMAN_SUBS[moduleId]) subIds = SALESMAN_SUBS[moduleId]
    const isProgram =
      n.includes('program') ||
      n === 'programmer' ||
      n === 'program supervisor' ||
      n === 'production incharge' ||
      n === 'mill incharge' ||
      n === 'mill'
    if (isProgram && PROGRAM_SUBS[moduleId]) subIds = PROGRAM_SUBS[moduleId]
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
  if (n === 'manager' && moduleId === 'dashboard') return false
  return getPermissionsForRole(roleName).some((p) => p.moduleId === moduleId)
}

export function canAccessSub(roleName: string, moduleId: MainModuleId, subId: string): boolean {
  const n = normalizeRole(roleName)
  if (n === 'ceo' || n === 'md' || n === 'managing director' || n === 'owner') return true
  if (n === 'manager' && moduleId === 'dashboard') return false
  // DIN Costing full edit — CEO / MD / Owner / Manager only
  if (
    (subId === 'din-costing' || subId === 'design-costing' || subId === 'rate-master' || subId === 'formula-master') &&
    !(n === 'manager' || n.includes('ceo') || n === 'md' || n.includes('director') || n === 'owner' || n === 'admin')
  ) {
    return false
  }
  // DIN Costing view-only — Design / Program roles
  if (subId === 'din-costing-view') {
    const isProgram =
      n.includes('program') ||
      n === 'programmer' ||
      n === 'program supervisor' ||
      n === 'production incharge' ||
      n === 'mill incharge' ||
      n === 'mill' ||
      n === 'machine supervisor'
  return (
      isProgram ||
      n === 'manager' ||
      n.includes('ceo') ||
      n === 'md' ||
      n.includes('director') ||
      n === 'owner' ||
      n === 'admin'
    )
  }
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

export function firstAllowedLanding(roleName: string): {
  module: MainModuleId
  screen: import('./nav').AppScreen
  sub?: string
} {
  const n = normalizeRole(roleName)
  const isSecurity = n === 'security' || (n.includes('security') && !n.includes('supervisor'))
  if (isSecurity) {
    return { module: 'security', screen: 'security-inventory', sub: 'dashboard' }
  }
  const mods = allowedModules(roleName)
  const first = mods[0] || 'production'
  if (first === 'dashboard') return { module: 'dashboard', screen: 'home' }
  const mod = MAIN_MODULES.find((m) => m.id === first)
  if (!mod) return { module: 'production', screen: 'program-dispatch', sub: 'pto' }
  if (mod.hasHub) return { module: mod.id, screen: 'module-hub', sub: mod.id }
  // Prefer first permitted sub-item when role has sub restrictions
  const perm = getPermissionsForRole(roleName).find((p) => p.moduleId === mod.id)
  if (perm?.subIds?.length) {
    const item = mod.items.find((i) => perm.subIds!.includes(i.id))
    if (item) return { module: mod.id, screen: item.screen, sub: item.sub }
  }
  return { module: mod.id, screen: mod.screen, sub: mod.sub }
}

export const ALL_MODULE_OPTIONS = MAIN_MODULES.map((m) => ({
  id: m.id,
  label: m.label,
  items: m.items.map((i) => ({ id: i.id, label: i.label })),
}))
