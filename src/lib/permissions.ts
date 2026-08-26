import type { MainModuleId } from './nav'
import { MAIN_MODULES } from './nav'
import { supabase } from './supabase'

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
  'order-to-program',
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
  /** Salesman — Order to Program only (no Design Master write access) */
  salesman: ['order-to-program', 'orders', 'masters', 'reports', 'cash-book'],
  /** Dispatch — dispatch + reports */
  'checker & dispatch': ['production', 'program-dispatch', 'order-to-program', 'inventory', 'security', 'reports'],
  dispatch: ['production', 'program-dispatch', 'order-to-program', 'reports'],
  'program supervisor': ['production', 'program-dispatch', 'order-to-program', 'orders', 'reports'],
  'mill incharge': [
    'production',
    'program-dispatch',
    'order-to-program',
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
    'order-to-program',
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
  /** Production — Program to Machine + Production */
  'production incharge': ['production', 'program-dispatch', 'order-to-program', 'orders', 'reports'],
  production: ['production', 'program-dispatch', 'order-to-program', 'reports'],
  programmer: ['production', 'program-dispatch', 'order-to-program', 'orders', 'reports'],
  operator: ['production', 'program-dispatch', 'utilities'],
  security: ['security', 'inventory', 'warp-yarn', 'hr-payroll'],
  account: ['cash-book', 'hr-payroll', 'reports', 'masters', 'security'],
  admin: ['cash-book', 'hr-payroll', 'reports', 'masters', 'security', 'settings'],
  accounts: ['cash-book', 'hr-payroll', 'reports', 'masters'],
  hr: ['hr-payroll', 'masters', 'reports'],
  payroll: ['hr-payroll', 'reports'],
  /** Design team — Design Master full + read sales */
  design: ['design-to-order', 'order-to-program', 'orders', 'masters', 'reports'],
  'design team': ['design-to-order', 'order-to-program', 'orders', 'masters', 'reports'],
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

/** Program / Production — Order to Program without Design Master write screens */
const PROGRAM_OTP_SUBS: string[] = ['order-status', 'program-to-machine', 'otp-reports']

/** Salesman — Order to Program four sections only */
const SALESMAN_OTP_SUBS: string[] = ['order-booking', 'order-status', 'program-to-machine', 'otp-reports']

/** Dispatch — status + reports (and program-dispatch elsewhere) */
const DISPATCH_OTP_SUBS: string[] = ['order-status', 'otp-reports']

function normalizeRole(name: string): string {
  return name.trim().toLowerCase()
}

export function isSalesmanRole(roleName: string): boolean {
  const n = normalizeRole(roleName)
  return n === 'salesman' || n === 'sales' || n.includes('salesman')
}

export function isProductionRole(roleName: string): boolean {
  const n = normalizeRole(roleName)
  return (
    n === 'production' ||
    n === 'production incharge' ||
    n === 'programmer' ||
    n === 'program supervisor' ||
    n.includes('production')
  )
}

export function isDispatchRole(roleName: string): boolean {
  const n = normalizeRole(roleName)
  return n === 'dispatch' || n === 'checker & dispatch' || n.includes('dispatch')
}

/** Design Master write (costing / rate / formula / intake edits) */
export function canEditDesignMaster(roleName: string): boolean {
  const n = normalizeRole(roleName)
  if (isSalesmanRole(n)) return false
  return (
    n === 'ceo' ||
    n === 'md' ||
    n === 'managing director' ||
    n === 'owner' ||
    n === 'manager' ||
    n === 'admin' ||
    n === 'design' ||
    n === 'design team' ||
    n.includes('ceo') ||
    n.includes('director') ||
    n.includes('design')
  )
}

/** Production / dispatch status changes — not salesman */
export function canChangeProductionStatus(roleName: string): boolean {
  const n = normalizeRole(roleName)
  if (isSalesmanRole(n)) return false
  return (
    n === 'ceo' ||
    n === 'md' ||
    n === 'managing director' ||
    n === 'owner' ||
    n === 'manager' ||
    n === 'admin' ||
    isProductionRole(n) ||
    n === 'mill incharge' ||
    n === 'mill' ||
    n === 'machine supervisor'
  )
}

export function canChangeDispatchStatus(roleName: string): boolean {
  const n = normalizeRole(roleName)
  if (isSalesmanRole(n)) return false
  return (
    n === 'ceo' ||
    n === 'md' ||
    n === 'managing director' ||
    n === 'owner' ||
    n === 'manager' ||
    n === 'admin' ||
    isDispatchRole(n)
  )
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
  const salesman = isSalesmanRole(n)
  const dispatch = isDispatchRole(n)
  const isProgram =
    n.includes('program') ||
    n === 'programmer' ||
    n === 'program supervisor' ||
    n === 'production incharge' ||
    n === 'production' ||
    n === 'mill incharge' ||
    n === 'mill'

  return modules.map((moduleId) => {
    let subIds: string[] | undefined
    if (isOperator && OPERATOR_SUBS[moduleId]) subIds = OPERATOR_SUBS[moduleId]
    if (isSecurity && SECURITY_SUBS[moduleId]) subIds = SECURITY_SUBS[moduleId]
    if (salesman && moduleId === 'order-to-program') subIds = SALESMAN_OTP_SUBS
    if (salesman && moduleId === 'design-to-order') subIds = [] // hard deny design subs
    if (dispatch && moduleId === 'order-to-program') subIds = DISPATCH_OTP_SUBS
    if (isProgram && moduleId === 'order-to-program') subIds = PROGRAM_OTP_SUBS
    if (isProgram && moduleId === 'design-to-order') {
      // Program roles may view rate only — no design intake/costing write
      subIds = ['din-costing-view']
    }
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
  // Salesman never gets Design Master module
  if (isSalesmanRole(n) && moduleId === 'design-to-order') return false
  return getPermissionsForRole(roleName).some((p) => p.moduleId === moduleId)
}

export function canAccessSub(roleName: string, moduleId: MainModuleId, subId: string): boolean {
  const n = normalizeRole(roleName)
  if (n === 'ceo' || n === 'md' || n === 'managing director' || n === 'owner') return true
  if (n === 'manager' && moduleId === 'dashboard') return false
  // Salesman cannot open any Design Master sub
  if (isSalesmanRole(n) && moduleId === 'design-to-order') return false
  // DIN Costing full edit — CEO / MD / Owner / Manager / Design only
  if (
    (subId === 'din-costing' || subId === 'design-costing' || subId === 'rate-master' || subId === 'formula-master') &&
    !(
      n === 'manager' ||
      n.includes('ceo') ||
      n === 'md' ||
      n.includes('director') ||
      n === 'owner' ||
      n === 'admin' ||
      n === 'design' ||
      n === 'design team' ||
      n.includes('design')
    )
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
      n === 'admin' ||
      n.includes('design')
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
    .filter((id) => !(isSalesmanRole(n) && id === 'design-to-order'))
}

export function firstAllowedLanding(roleName: string): {
  module: MainModuleId
  screen: import('./nav').AppScreen
  sub?: string
  filter?: string
} {
  const n = normalizeRole(roleName)
  const isSecurity = n === 'security' || (n.includes('security') && !n.includes('supervisor'))
  if (isSecurity) {
    return { module: 'security', screen: 'security-inventory', sub: 'dashboard' }
  }
  // Salesman opens Order to Program dashboard (not Design Master)
  if (isSalesmanRole(n)) {
    return { module: 'order-to-program', screen: 'order-to-program', filter: 'dashboard' }
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
    if (item) return { module: mod.id, screen: item.screen, sub: item.sub, filter: item.filter }
  }
  return { module: mod.id, screen: mod.screen, sub: mod.sub }
}

/** Screens belonging to Design Master — salesman must not open these */
export const DESIGN_MASTER_SCREENS = new Set([
  'dto-hub',
  'dto-intake',
  'dto-sample-job',
  'dto-tracking',
  'dto-promotion',
  'dto-reports',
  'rate-master',
  'formula-master',
  'design-wise-costing',
])

export const ALL_MODULE_OPTIONS = MAIN_MODULES.map((m) => ({
  id: m.id,
  label: m.label,
  items: m.items.map((i) => ({ id: i.id, label: i.label })),
}))

/** Client-side Design Master write gate (also enforced by DB RLS). */
export async function assertDesignMasterWrite(): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const meta = (data.user?.user_metadata || {}) as { role_name?: string; full_name?: string }
  const role = resolveAccessRoleName({
    roleName: meta.role_name,
    fullName: meta.full_name,
    fallback: 'User',
  })
  if (!canEditDesignMaster(role)) {
    throw new Error(
      'Unauthorized: Salesman cannot modify Design Master (costing, rates, formula, DIN). Use Order to Program to consume approved DIN data.',
    )
  }
}
