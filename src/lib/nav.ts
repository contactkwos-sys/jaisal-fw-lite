/**
 * Navigation — main sidebar modules (Cash Book sits under Inventory).
 */
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
  | 'orders'
  | 'programs'
  | 'security'
  | 'broadcast'
  | 'parties'
  | 'sample-job-card'
  | 'sample-register'
  | 'beam-remaining'
  | 'design-wise-costing'
  | 'design-catalog'
  | 'crm'
  | 'cash-book'
  | 'module-hub'
  | 'settings-hub'
  | 'placeholder'

export type MainModuleId =
  | 'dashboard'
  | 'production'
  | 'inventory'
  | 'cash-book'
  | 'orders'
  | 'reports'
  | 'maintenance'
  | 'masters'
  | 'security'
  | 'settings'

export type NavTarget = {
  screen: AppScreen
  sub?: string
  filter?: string
  module?: MainModuleId
  hub?: MainModuleId
}

export type SubItem = {
  id: string
  label: string
  screen: AppScreen
  sub?: string
  filter?: string
  /** Soft description for hub cards */
  hint?: string
}

export type MainModule = {
  id: MainModuleId
  label: string
  icon: string
  /** Default landing when opening the module */
  screen: AppScreen
  sub?: string
  /** When true, open hub of sub-items instead of a single screen */
  hasHub?: boolean
  items: SubItem[]
  /** Bottom-nav priority on mobile */
  mobileNav?: boolean
}

export const MAIN_MODULES: MainModule[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'dashboard',
    screen: 'home',
    items: [],
    mobileNav: true,
  },
  {
    id: 'production',
    label: 'Production',
    icon: 'production',
    screen: 'module-hub',
    hasHub: true,
    mobileNav: true,
    items: [
      { id: 'warp-issue', label: 'Warp Issue', screen: 'stock', sub: 'beam', hint: 'Warp beam stock & issue' },
      { id: 'weft-issue', label: 'Weft Issue', screen: 'purchase', sub: 'weft', hint: 'Weft yarn issue' },
      { id: 'prod-entry', label: 'Production Entry', screen: 'production', sub: 'entry', hint: 'Machine production meters' },
      { id: 'folding', label: 'Folding', screen: 'dispatch', sub: 'folding', hint: 'Folding entry' },
      { id: 'dispatch', label: 'Dispatch', screen: 'dispatch', sub: 'challan', hint: 'Challan & gate pass' },
      { id: 'machine-wise', label: 'Machine-wise Production', screen: 'production', sub: 'report', filter: 'machine', hint: 'By machine' },
      { id: 'shift-wise', label: 'Shift-wise Production', screen: 'production', sub: 'report', filter: 'shift', hint: 'By shift' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'inventory',
    screen: 'module-hub',
    hasHub: true,
    mobileNav: true,
    items: [
      { id: 'yarn-stock', label: 'Yarn Stock', screen: 'stock', sub: 'weft', hint: 'Weft yarn balances' },
      { id: 'beam-stock', label: 'Warp Beam Stock', screen: 'stock', sub: 'beam', hint: 'Beam pipe stock' },
      { id: 'greige-stock', label: 'Greige Stock', screen: 'production', sub: 'report', hint: 'Greige / production stock' },
      { id: 'consumables', label: 'Consumables', screen: 'purchase', sub: 'maint_in', hint: 'Maintenance inward' },
      { id: 'inward', label: 'Inward', screen: 'purchase', sub: 'general', hint: 'General purchase inward' },
      { id: 'stock-adj', label: 'Stock Adjustment', screen: 'admin', sub: 'approvals', hint: 'Approval / adjust queue' },
      { id: 'stock-reports', label: 'Stock Reports', screen: 'purchase', sub: 'report', hint: 'Purchase & stock reports' },
    ],
  },
  {
    id: 'cash-book',
    label: 'Cash Book',
    icon: 'cash-book',
    screen: 'cash-book',
    items: [],
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'orders',
    screen: 'module-hub',
    hasHub: true,
    mobileNav: true,
    items: [
      { id: 'order-book', label: 'Order Book', screen: 'orders', sub: 'entry', hint: 'Party orders' },
      { id: 'program-card', label: 'Program Card', screen: 'programs', sub: 'create', hint: 'Program + petty meters' },
      { id: 'job-card', label: 'Job Card Issue', screen: 'production', sub: 'job', hint: 'Issue job cards' },
      { id: 'design-job', label: 'Design & Job Card', screen: 'design', hint: 'Design register' },
      { id: 'sample-job', label: 'Sample Job Card', screen: 'sample-job-card', hint: 'Sample cards' },
      { id: 'design-costing', label: 'Design Wise Costing', screen: 'design-wise-costing', hint: 'Cost per design' },
      { id: 'design-catalog', label: 'Design Catalog', screen: 'design-catalog', hint: 'Design DNA catalog' },
      { id: 'broadcast', label: 'Design Broadcast', screen: 'broadcast', hint: 'Share designs' },
      { id: 'program-pending', label: 'Program Pending', screen: 'programs', sub: 'pending', hint: 'Pending tracker' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'reports',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'prod-report', label: 'Production Report', screen: 'production', sub: 'report', hint: 'Daily production' },
      { id: 'stock-report', label: 'Stock Report', screen: 'purchase', sub: 'report', hint: 'Stock & purchase' },
      { id: 'party-delivery', label: 'Party Delivery Report', screen: 'orders', sub: 'report', hint: 'Delivery by party' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      { id: 'machine-report', label: 'Machine Report', screen: 'production', sub: 'report', filter: 'machine', hint: 'Machine output' },
      { id: 'costing-report', label: 'Costing Report', screen: 'costing', sub: 'summary', hint: 'Daily costing' },
      { id: 'attendance-report', label: 'Attendance Report', screen: 'attendance', hint: 'Attendance today' },
      { id: 'sample-register', label: 'Sample Register', screen: 'sample-register', hint: 'Sample log' },
    ],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: 'maintenance',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'maint-request', label: 'Machine Maintenance', screen: 'maintenance', sub: 'request', hint: 'Maintenance requests' },
      { id: 'breakdown', label: 'Breakdown Entry', screen: 'maintenance', sub: 'repair', hint: 'Repair out / in' },
      { id: 'maint-schedule', label: 'Maintenance Schedule', screen: 'placeholder', filter: 'maint-schedule', hint: 'Schedule overview' },
      { id: 'service-history', label: 'Service History', screen: 'maintenance', sub: 'repair', hint: 'Repair tracker' },
      { id: 'spare-parts', label: 'Spare Parts', screen: 'purchase', sub: 'maint_in', hint: 'Parts inward' },
      { id: 'maint-reports', label: 'Maintenance Reports', screen: 'purchase', sub: 'repair_inv', hint: 'Repair invoices' },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    icon: 'masters',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'party-master', label: 'Party Master', screen: 'parties', hint: 'Customers / parties' },
      { id: 'item-master', label: 'Item Master', screen: 'design-catalog', hint: 'Design / item catalog' },
      { id: 'machine-master', label: 'Machine Master', screen: 'placeholder', filter: 'machine-master', hint: 'Machine list (M1–M6)' },
      { id: 'employee-master', label: 'Employee Master', screen: 'attendance', hint: 'Workers & attendance' },
      { id: 'design-master', label: 'Design Master', screen: 'design', hint: 'Design register' },
      { id: 'dept-master', label: 'Department Master', screen: 'placeholder', filter: 'dept-master', hint: 'Departments' },
      { id: 'shift-master', label: 'Shift Master', screen: 'placeholder', filter: 'shift-master', hint: 'Shift definitions' },
      { id: 'crm', label: 'CRM Customers', screen: 'crm', hint: 'WhatsApp customers' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'security',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'user-mgmt', label: 'User Management', screen: 'admin', sub: 'roles', hint: 'Users & roles' },
      { id: 'role-mgmt', label: 'Role Management', screen: 'admin', sub: 'roles', hint: 'Create / rename roles' },
      { id: 'pin-mgmt', label: 'Individual PIN Management', screen: 'admin', sub: 'roles', hint: 'Reset PINs' },
      { id: 'perm-mgmt', label: 'Permission Management', screen: 'admin', sub: 'permissions', hint: 'Module access by role' },
      { id: 'security-gate', label: 'Security Gate', screen: 'security', sub: 'inward', hint: 'Gate logs' },
      { id: 'login-activity', label: 'Login Activity', screen: 'placeholder', filter: 'login-activity', hint: 'Recent sessions' },
      { id: 'payroll', label: 'Payroll', screen: 'admin', sub: 'payroll', hint: 'Rates & payables' },
      { id: 'approvals', label: 'Approvals', screen: 'admin', sub: 'approvals', hint: 'CEO approval queue' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'company', label: 'Company Settings', screen: 'placeholder', filter: 'company', hint: 'Company profile' },
      { id: 'shift-settings', label: 'Shift Settings', screen: 'placeholder', filter: 'shift-settings', hint: 'Day / night shifts' },
      { id: 'notifications', label: 'Notification Settings', screen: 'placeholder', filter: 'notifications', hint: 'Alerts preferences' },
      { id: 'backup', label: 'Backup', screen: 'placeholder', filter: 'backup', hint: 'Data backup notes' },
      { id: 'preferences', label: 'System Preferences', screen: 'costing', sub: 'electricity', hint: 'Electricity & system' },
    ],
  },
]

export const PAGE_TITLES: Record<AppScreen, string> = {
  home: 'Dashboard',
  attendance: 'Attendance',
  stock: 'Stock',
  design: 'Design & Job Card',
  purchase: 'Purchase & Inward',
  production: 'Production',
  maintenance: 'Maintenance',
  dispatch: 'Dispatch',
  admin: 'Security / Admin',
  costing: 'Costing',
  orders: 'Order Book',
  programs: 'Program Card',
  security: 'Security Gate',
  broadcast: 'Design Broadcast',
  parties: 'Party Master',
  'sample-job-card': 'Sample Job Card',
  'sample-register': 'Sample Register',
  'beam-remaining': 'Beam Remaining',
  'design-wise-costing': 'Design Wise Costing',
  'design-catalog': 'Design Catalog',
  crm: 'CRM',
  'cash-book': 'Cash Book',
  'module-hub': 'Module',
  'settings-hub': 'Settings',
  placeholder: 'Coming Soon',
}

export function moduleById(id: MainModuleId): MainModule {
  return MAIN_MODULES.find((m) => m.id === id) || MAIN_MODULES[0]
}

/** Which main module owns a given screen/sub combination */
export function moduleForScreen(screen: AppScreen, sub?: string, filter?: string): MainModuleId {
  if (screen === 'home') return 'dashboard'
  if (screen === 'module-hub' || screen === 'settings-hub') {
    return (filter as MainModuleId) || 'dashboard'
  }

  for (const mod of MAIN_MODULES) {
    for (const item of mod.items) {
      if (item.screen !== screen) continue
      if (item.sub && sub && item.sub !== sub) continue
      if (item.filter && filter && item.filter !== filter) continue
      if (!item.sub && !item.filter) return mod.id
      if (item.sub && (!sub || item.sub === sub) && (!item.filter || !filter || item.filter === filter)) {
        return mod.id
      }
      if (!item.sub && item.filter && filter === item.filter) return mod.id
    }
  }

  // Fallbacks by screen family
  if (screen === 'production' || screen === 'dispatch') return 'production'
  if (screen === 'stock' || screen === 'purchase') return 'inventory'
  if (screen === 'cash-book') return 'cash-book'
  if (
    screen === 'orders' ||
    screen === 'programs' ||
    screen === 'design' ||
    screen === 'sample-job-card' ||
    screen === 'design-wise-costing' ||
    screen === 'design-catalog' ||
    screen === 'broadcast'
  ) {
    return 'orders'
  }
  if (screen === 'costing' || screen === 'beam-remaining' || screen === 'sample-register' || screen === 'attendance') {
    return 'reports'
  }
  if (screen === 'maintenance') return 'maintenance'
  if (screen === 'parties' || screen === 'crm') return 'masters'
  if (screen === 'admin' || screen === 'security') return 'security'
  if (screen === 'placeholder') {
    if (filter?.includes('shift') || filter === 'company' || filter === 'notifications' || filter === 'backup') {
      return 'settings'
    }
    if (filter?.includes('machine') || filter?.includes('dept')) return 'masters'
    return 'settings'
  }
  return 'dashboard'
}

export function titleFor(screen: AppScreen, sub?: string, moduleId?: MainModuleId, filter?: string): string {
  if (screen === 'module-hub' && moduleId) return moduleById(moduleId).label
  if (screen === 'stock' && sub === 'weft') return 'Yarn Stock'
  if (screen === 'stock') return 'Warp Beam Stock'
  if (screen === 'purchase' && sub === 'weft') return 'Weft Issue'
  if (screen === 'purchase' && sub === 'report') return 'Stock Reports'
  if (screen === 'purchase' && sub === 'maint_in') return 'Consumables / Inward'
  if (screen === 'purchase' && sub === 'repair_inv') return 'Repair Invoices'
  if (screen === 'dispatch' && sub === 'folding') return 'Folding'
  if (screen === 'dispatch') return 'Dispatch'
  if (screen === 'production' && sub === 'report') return 'Production Report'
  if (screen === 'production' && sub === 'job') return 'Job Card Issue'
  if (screen === 'production' && sub === 'entry') return 'Production Entry'
  if (screen === 'orders' && sub === 'report') return 'Party Delivery Report'
  if (screen === 'programs' && sub === 'pending') return 'Program Pending'
  if (screen === 'programs') return 'Program Card'
  if (screen === 'security') return 'Security Gate'
  if (screen === 'admin' && sub === 'payroll') return 'Payroll'
  if (screen === 'admin' && sub === 'permissions') return 'Permission Management'
  if (screen === 'admin' && sub === 'approvals') return 'Approvals'
  if (screen === 'admin') return 'Roles & PIN'
  if (screen === 'costing' && sub === 'electricity') return 'System Preferences'
  if (screen === 'placeholder') {
    const labels: Record<string, string> = {
      'maint-schedule': 'Maintenance Schedule',
      'machine-master': 'Machine Master',
      'dept-master': 'Department Master',
      'shift-master': 'Shift Master',
      'login-activity': 'Login Activity',
      company: 'Company Settings',
      'shift-settings': 'Shift Settings',
      notifications: 'Notification Settings',
      backup: 'Backup',
    }
    return labels[filter || ''] || 'Coming Soon'
  }
  return PAGE_TITLES[screen]
}

export function isSubItemActive(item: SubItem, screen: AppScreen, sub?: string, filter?: string): boolean {
  if (item.screen !== screen) return false
  if (item.sub && (sub || '') !== item.sub) {
    // allow related dispatch tabs under dispatch item
    if (item.screen === 'dispatch' && item.sub === 'challan') {
      return (sub || 'challan') === 'challan' || sub === 'gatepass'
    }
    return false
  }
  if (item.filter && filter && item.filter !== filter) return false
  return true
}
