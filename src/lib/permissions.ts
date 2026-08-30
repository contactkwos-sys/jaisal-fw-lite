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
  /** Salesman — Sales & Order only (no Design, no duplicate Orders hub) */
  salesman: ['order-to-program', 'reports'],
  /** Dispatch — dispatch workflow + order status reports */
  'checker & dispatch': ['program-dispatch', 'order-to-program', 'reports'],
  dispatch: ['program-dispatch', 'order-to-program', 'reports'],
  checking: ['program-dispatch', 'reports'],
  checker: ['program-dispatch', 'reports'],
  'program supervisor': ['production', 'program-dispatch', 'order-to-program', 'reports'],
  /** Production — program, production entry, checking */
  'production incharge': ['production', 'program-dispatch', 'order-to-program', 'reports'],
  production: ['production', 'program-dispatch', 'order-to-program', 'reports'],
  programmer: ['production', 'program-dispatch', 'order-to-program', 'reports'],
  operator: ['production', 'program-dispatch', 'utilities'],
  /** Maintenance — machine maintenance only */
  'maintenance incharge': ['maintenance', 'inventory', 'reports'],
  maintenance: ['maintenance', 'inventory', 'reports'],
  technician: ['maintenance', 'reports'],
  'store incharge': ['inventory', 'warp-yarn', 'reports', 'security'],
  store: ['inventory', 'warp-yarn', 'reports'],
  'mill incharge': [
    'production',
    'program-dispatch',
    'order-to-program',
    'inventory',
    'warp-yarn',
    'cash-book',
    'hr-payroll',
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
    'reports',
    'maintenance',
    'daily-pending-work',
    'design-to-order',
    'utilities',
  ],
  security: ['security', 'inventory', 'warp-yarn', 'hr-payroll'],
  account: ['cash-book', 'hr-payroll', 'reports', 'masters', 'security'],
  admin: ['cash-book', 'hr-payroll', 'reports', 'masters', 'security', 'settings'],
  accounts: ['cash-book', 'hr-payroll', 'reports', 'masters'],
  hr: ['hr-payroll', 'masters', 'reports'],
  payroll: ['hr-payroll', 'reports'],
  /** Design team — Design module only */
  design: ['design-to-order', 'masters', 'reports'],
  'design team': ['design-to-order', 'masters', 'reports'],
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
  inventory: ['yarn-stock', 'warp-yarn-link', 'stock-reports'],
  'warp-yarn': ['wy-overview', 'wy-machines', 'wy-godown', 'wy-empty', 'wy-warper', 'wy-reports'],
  'hr-payroll': ['hr-attendance', 'hr-dash'],
}

/** Program / Production — Program to Machine + production workflow (no customer order entry) */
const PROGRAM_OTP_SUBS: string[] = ['order-status', 'program-to-machine', 'otp-reports']

/** Salesman — Customer Order, Order Status, Follow-up, Program to Machine, Order Reports */
const SALESMAN_OTP_SUBS: string[] = [
  'order-booking',
  'order-status',
  'order-followup',
  'program-to-machine',
  'otp-reports',
]

/** Dispatch — order status + dispatch reports only in Sales module */
const DISPATCH_OTP_SUBS: string[] = ['order-status', 'otp-reports']

/** Design team — full design workflow, no legacy register unless CEO */
const DESIGN_TEAM_SUBS: string[] = [
  'din-costing',
  'formula-master',
  'rate-master',
  'quality-master',
  'sample-job',
  'sample-tracking',
  'sample-promotion',
  'design-reports',
]

/** Production role — machine production + PD workflow */
const PRODUCTION_PD_SUBS: string[] = ['prod-entry', 'folding']
const PRODUCTION_MWP_SUBS: string[] = ['weft-issue', 'job-card', 'prod-entry', 'mwp-report']

/** Dispatch role — checking through dispatch reports */
const DISPATCH_PD_SUBS: string[] = ['folding', 'dispatch', 'gatepass', 'invoice', 'pd-reports', 'tracking']
const CHECKING_PD_SUBS: string[] = ['folding', 'pd-reports']
const STORE_INVENTORY_SUBS: string[] = ['yarn-stock', 'warp-yarn-link', 'chemical-store', 'maint-store', 'stock-reports']

/** Maintenance role — CMMS only */
const MAINTENANCE_SUBS: string[] = [
  'overview',
  'machine-master',
  'maint-schedule',
  'breakdown',
  'spare-parts',
  'maint-material',
  'maint-entry',
  'contacts',
  'maint-reports',
  'complaints',
  'pending-work',
  'service-history',
  'maint-material-order',
  'maint-repair-order',
  'si-repair-link',
]

/** HR role — payroll flow only */
const HR_SUBS: string[] = [
  'hr-dash',
  'hr-employees',
  'hr-attendance',
  'hr-leave',
  'hr-rates',
  'hr-advance',
  'hr-salary-status',
  'hr-payroll-run',
  'hr-statutory',
  'hr-register',
  'hr-payment',
  'hr-bank-letter',
  'hr-reports',
]

/** Salesman reports — order reports only */
const SALESMAN_REPORTS_SUBS: string[] = ['otp-report-link', 'party-delivery', 'prod-report']

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

export function isMaintenanceRole(roleName: string): boolean {
  const n = normalizeRole(roleName)
  return (
    n === 'maintenance' ||
    n === 'maintenance incharge' ||
    n === 'technician' ||
    (n.includes('maintenance') && !n.includes('material'))
  )
}

export function isHrRole(roleName: string): boolean {
  const n = normalizeRole(roleName)
  return n === 'hr' || n === 'payroll' || n.includes('payroll')
}

export function isDesignTeamRole(roleName: string): boolean {
  const n = normalizeRole(roleName)
  return n === 'design' || n === 'design team' || (n.includes('design') && !n.includes('sales'))
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
  const maint = isMaintenanceRole(n)
  const hr = isHrRole(n)
  const designTeam = isDesignTeamRole(n)
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
    if (salesman && moduleId === 'reports') subIds = SALESMAN_REPORTS_SUBS
    if (salesman && moduleId === 'design-to-order') subIds = []
    if (dispatch && moduleId === 'order-to-program') subIds = DISPATCH_OTP_SUBS
    if (dispatch && moduleId === 'program-dispatch') subIds = DISPATCH_PD_SUBS
    if ((n === 'checking' || n === 'checker') && moduleId === 'program-dispatch') subIds = CHECKING_PD_SUBS
    if ((n === 'store' || n === 'store incharge') && moduleId === 'inventory') subIds = STORE_INVENTORY_SUBS
    if (isProgram && moduleId === 'order-to-program') subIds = PROGRAM_OTP_SUBS
    if (isProgram && moduleId === 'program-dispatch') subIds = PRODUCTION_PD_SUBS
    if (isProgram && moduleId === 'production') subIds = PRODUCTION_MWP_SUBS
    if (isProgram && moduleId === 'design-to-order') subIds = ['din-costing-view']
    if (designTeam && moduleId === 'design-to-order') subIds = DESIGN_TEAM_SUBS
    if (maint && moduleId === 'maintenance') subIds = MAINTENANCE_SUBS
    if (maint && moduleId === 'inventory') subIds = ['yarn-stock', 'maint-store', 'chemical-store', 'stock-reports']
    if (hr && moduleId === 'hr-payroll') subIds = HR_SUBS
    if (hr && moduleId === 'masters') subIds = ['employee-master']
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
    (subId === 'din-costing' ||
      subId === 'design-costing' ||
      subId === 'rate-master' ||
      subId === 'quality-master' ||
      subId === 'formula-master') &&
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
  'dto-sample-job',
  'dto-tracking',
  'dto-promotion',
  'dto-reports',
  'rate-master',
  'quality-master',
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
