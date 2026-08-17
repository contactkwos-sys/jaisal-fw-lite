export type AppScreen =
  | 'home'
  | 'attendance'
  | 'stock'
  | 'design'
  | 'purchase'
  | 'production'
  | 'maintenance'
  | 'dispatch'
  | 'admin'
  | 'costing'

export type PurchaseSub = 'general' | 'weft' | 'maint_in' | 'repair_inv' | 'report'
export type ProductionSub = 'job' | 'entry' | 'report'
export type MaintenanceSub = 'request' | 'repair'
export type DispatchSub = 'folding' | 'challan' | 'gatepass'
export type AdminSub = 'roles' | 'payroll' | 'approvals'
export type CostingSub = 'summary' | 'electricity'
export type StockSub = 'beam' | 'weft'

export type NavTarget = {
  screen: AppScreen
  sub?: string
  filter?: string
}

export type NavItemId =
  | 'dashboard'
  | 'attendance'
  | 'inward'
  | 'yarn'
  | 'warp-beam'
  | 'weft-issue'
  | 'production'
  | 'folding'
  | 'dispatch'
  | 'design'
  | 'maintenance'
  | 'stock-reports'
  | 'reports'
  | 'costing'
  | 'admin-master'
  | 'payroll'

export type NavItem = {
  id: NavItemId
  label: string
  screen: AppScreen
  sub?: string
  ceoOnly?: boolean
}

export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', screen: 'home', ceoOnly: true },
  { id: 'attendance', label: 'Attendance', screen: 'attendance' },
  { id: 'inward', label: 'Inward', screen: 'purchase', sub: 'general' },
  { id: 'yarn', label: 'Yarn Management', screen: 'stock', sub: 'weft' },
  { id: 'warp-beam', label: 'Warp Beam', screen: 'stock', sub: 'beam' },
  { id: 'weft-issue', label: 'Weft Issue', screen: 'purchase', sub: 'weft' },
  { id: 'production', label: 'Production', screen: 'production', sub: 'entry' },
  { id: 'folding', label: 'Folding', screen: 'dispatch', sub: 'folding' },
  { id: 'dispatch', label: 'Dispatch & Gate Pass', screen: 'dispatch', sub: 'challan' },
  { id: 'design', label: 'Design & Job Card', screen: 'design' },
]

export const ADMIN_NAV: NavItem[] = [
  { id: 'maintenance', label: 'Maintenance', screen: 'maintenance', sub: 'request' },
  { id: 'stock-reports', label: 'Stock Reports', screen: 'purchase', sub: 'report' },
  { id: 'reports', label: 'Reports', screen: 'production', sub: 'report' },
  { id: 'costing', label: 'Costing', screen: 'costing', ceoOnly: true },
  { id: 'admin-master', label: 'Admin Master', screen: 'admin', sub: 'roles' },
  { id: 'payroll', label: 'Payroll', screen: 'admin', sub: 'payroll' },
]

export const PAGE_TITLES: Record<AppScreen, string> = {
  home: 'CEO Dashboard',
  attendance: 'Attendance',
  stock: 'Stock Master',
  design: 'Design & Job Card',
  purchase: 'Purchase & Inward',
  production: 'Production',
  maintenance: 'Maintenance',
  dispatch: 'Dispatch',
  admin: 'Admin',
  costing: 'Costing',
}

/** Resolve which nav row is highlighted for the current screen/sub. */
export function isNavItemActive(item: NavItem, screen: AppScreen, sub?: string): boolean {
  if (item.screen !== screen) return false

  // Screens with competing nav rows need an exact sub match.
  if (screen === 'stock') {
    return (sub || 'beam') === (item.sub || 'beam')
  }
  if (screen === 'purchase') {
    const current = sub || 'general'
    if (item.sub === 'report') return current === 'report'
    if (item.sub === 'weft') return current === 'weft'
    if (item.sub === 'general') {
      return current === 'general' || current === 'maint_in' || current === 'repair_inv'
    }
    return current === item.sub
  }
  if (screen === 'dispatch') {
    const current = sub || 'folding'
    if (item.sub === 'folding') return current === 'folding'
    if (item.sub === 'challan') return current === 'challan' || current === 'gatepass'
    return current === item.sub
  }
  if (screen === 'production') {
    const current = sub || 'entry'
    if (item.sub === 'report') return current === 'report'
    if (item.sub === 'entry') return current === 'entry' || current === 'job'
    return current === item.sub
  }
  if (screen === 'admin') {
    const current = sub || 'roles'
    if (item.sub === 'payroll') return current === 'payroll'
    if (item.sub === 'roles') return current === 'roles' || current === 'approvals'
    return current === item.sub
  }

  return !item.sub || item.sub === sub
}

export function titleFor(screen: AppScreen, sub?: string): string {
  if (screen === 'stock' && sub === 'weft') return 'Yarn Management'
  if (screen === 'stock') return 'Warp Beam'
  if (screen === 'purchase' && sub === 'weft') return 'Weft Issue'
  if (screen === 'purchase' && sub === 'report') return 'Stock Reports'
  if (screen === 'dispatch' && sub === 'folding') return 'Folding'
  if (screen === 'dispatch') return 'Dispatch & Gate Pass'
  if (screen === 'production' && sub === 'report') return 'Reports'
  if (screen === 'admin' && sub === 'payroll') return 'Payroll'
  if (screen === 'admin') return 'Admin Master'
  return PAGE_TITLES[screen]
}
