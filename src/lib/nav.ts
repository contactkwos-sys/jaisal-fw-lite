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
  | 'warp-beam-pipe'
  | 'warp-yarn'
  | 'yarn-inward'
  | 'maint-material'
  | 'loan-tracker'
  | 'geb-readings'
  | 'orders-pending'
  | 'module-hub'
  | 'settings-hub'
  | 'placeholder'
  | 'program-dispatch'

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
    label: 'Program & Dispatch',
    icon: 'production',
    screen: 'program-dispatch',
    sub: 'pto',
    hasHub: false,
    mobileNav: true,
    items: [
      {
        id: 'pto',
        label: 'Program to Production',
        screen: 'program-dispatch',
        sub: 'pto',
        hint: 'Orders → machine programs · live KPIs',
      },
      {
        id: 'prod-entry',
        label: 'Production Entry',
        screen: 'program-dispatch',
        sub: 'entry',
        hint: 'Shift / machine / operator meters',
      },
      {
        id: 'tracking',
        label: 'Production Tracking',
        screen: 'program-dispatch',
        sub: 'tracking',
        hint: 'Order → dispatched live meters',
      },
      {
        id: 'folding',
        label: 'Folding & Checking',
        screen: 'program-dispatch',
        sub: 'folding',
        hint: 'Lots · damage · final meter',
      },
      {
        id: 'dispatch',
        label: 'Dispatch / Challan',
        screen: 'program-dispatch',
        sub: 'challan',
        hint: 'Select lots · create challan',
      },
      {
        id: 'gatepass',
        label: 'Gate Pass',
        screen: 'program-dispatch',
        sub: 'gatepass',
        hint: 'Vehicle · print gate pass',
      },
      {
        id: 'invoice',
        label: 'Invoice',
        screen: 'program-dispatch',
        sub: 'invoice',
        hint: 'GST invoice · print / PDF',
      },
      {
        id: 'pd-reports',
        label: 'Reports',
        screen: 'program-dispatch',
        sub: 'reports',
        hint: 'Production · checking · dispatch',
      },
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
      { id: 'yarn-stock', label: 'Yarn Stock', screen: 'stock', sub: 'weft', hint: 'Opening stock & yarn item master' },
      {
        id: 'warp-yarn',
        label: 'Warp Yarn Management',
        screen: 'warp-yarn',
        sub: 'overview',
        hint: 'Overview · Machines · Godown · Empty · Warper · Reports',
      },
      { id: 'yarn-inward', label: 'Yarn Inward OCR', screen: 'yarn-inward', hint: 'Warp/Weft invoice OCR' },
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
    label: 'Orders & Pending',
    icon: 'orders',
    screen: 'module-hub',
    hasHub: true,
    mobileNav: true,
    items: [
      { id: 'orders-pending', label: 'Orders & Pending', screen: 'orders-pending', hint: 'Raise & track pending orders' },
      { id: 'order-book', label: 'Order Book', screen: 'orders', sub: 'entry', hint: 'Party orders' },
      { id: 'design-job', label: 'Design & Job Card', screen: 'design', hint: 'Design register' },
      { id: 'design-costing', label: 'Design Wise Costing', screen: 'design-wise-costing', hint: 'Warp / weft cost per DIN' },
      { id: 'sample-job', label: 'Sample Job Card', screen: 'sample-job-card', hint: 'Sample cards' },
      { id: 'design-catalog', label: 'Design Catalog', screen: 'design-catalog', hint: 'Design DNA catalog' },
      { id: 'broadcast', label: 'Design Broadcast', screen: 'broadcast', hint: 'Post & share designs' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'reports',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'design-costing', label: 'Design Wise Costing', screen: 'design-wise-costing', hint: 'Cost per design' },
      { id: 'prod-report', label: 'Production Report', screen: 'production', sub: 'report', hint: 'Daily production' },
      { id: 'stock-report', label: 'Stock Report', screen: 'purchase', sub: 'report', hint: 'Stock & purchase' },
      { id: 'party-delivery', label: 'Party Delivery Report', screen: 'orders', sub: 'report', hint: 'Delivery by party' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      { id: 'machine-report', label: 'Machine Report', screen: 'production', sub: 'report', filter: 'machine', hint: 'Machine output' },
      { id: 'costing-report', label: 'Costing Report', screen: 'costing', sub: 'summary', hint: 'Daily costing' },
      { id: 'geb-readings', label: 'GEB Electricity', screen: 'geb-readings', hint: 'Daily meter units & cost' },
      { id: 'loan-tracker', label: 'Loan Tracker', screen: 'loan-tracker', hint: 'Party-wise loan ledger' },
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
      { id: 'maint-material', label: 'Material Out / In', screen: 'maint-material', hint: 'Material + auto gate pass' },
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
      { id: 'pin-mgmt', label: 'PIN Management', screen: 'admin', sub: 'roles', hint: 'Roles & PIN on one page' },
      { id: 'perm-mgmt', label: 'Permission Management', screen: 'admin', sub: 'permissions', hint: 'Module access by role' },
      { id: 'security-gate', label: 'Security Gate', screen: 'security', sub: 'inward', hint: 'Gate logs' },
      { id: 'yarn-inward-sec', label: 'Yarn Inward OCR', screen: 'yarn-inward', hint: 'Invoice scan (Security)' },
      { id: 'geb-sec', label: 'GEB Reading', screen: 'geb-readings', hint: 'Electricity meter entry' },
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
  'warp-beam-pipe': 'Warp Beam Pipe',
  'warp-yarn': 'Warp Yarn Management',
  'yarn-inward': 'Yarn Inward OCR',
  'maint-material': 'Maintenance Material',
  'loan-tracker': 'Loan Tracker',
  'geb-readings': 'GEB Electricity',
  'orders-pending': 'Orders & Pending',
  'module-hub': 'Module',
  'settings-hub': 'Settings',
  placeholder: 'Coming Soon',
  'program-dispatch': 'Program & Dispatch',
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

  if (screen === 'production' || screen === 'dispatch' || screen === 'program-dispatch' || screen === 'programs') {
    return 'production'
  }
  if (
    screen === 'stock' ||
    screen === 'purchase' ||
    screen === 'warp-beam-pipe' ||
    screen === 'warp-yarn' ||
    screen === 'yarn-inward'
  ) {
    return 'inventory'
  }
  if (screen === 'cash-book') return 'cash-book'
  if (
    screen === 'orders' ||
    screen === 'orders-pending' ||
    screen === 'design' ||
    screen === 'design-wise-costing' ||
    screen === 'sample-job-card' ||
    screen === 'design-catalog' ||
    screen === 'broadcast'
  ) {
    return 'orders'
  }
  if (
    screen === 'costing' ||
    screen === 'beam-remaining' ||
    screen === 'sample-register' ||
    screen === 'attendance' ||
    screen === 'loan-tracker' ||
    screen === 'geb-readings'
  ) {
    return 'reports'
  }
  if (screen === 'maintenance' || screen === 'maint-material') return 'maintenance'
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
  if (screen === 'warp-yarn') {
    const labels: Record<string, string> = {
      overview: 'Warp Yarn Management',
      machines: 'Warp Yarn · On Machines',
      godown: 'Warp Yarn · Godown – Filled',
      empty: 'Warp Yarn · Empty Pipes',
      warper: 'Warp Yarn · At Warper',
      reports: 'Warp Yarn · Transactions & Reports',
    }
    return labels[sub || 'overview'] || 'Warp Yarn Management'
  }
  if (screen === 'stock' && sub === 'weft') return 'Yarn Stock'
  if (screen === 'stock') return 'Warp Beam Stock (Legacy)'
  if (screen === 'purchase' && sub === 'weft') return 'Weft Issue'
  if (screen === 'purchase' && sub === 'report') return 'Stock Reports'
  if (screen === 'purchase' && sub === 'maint_in') return 'Consumables / Inward'
  if (screen === 'purchase' && sub === 'repair_inv') return 'Repair Invoices'
  if (screen === 'dispatch' && sub === 'folding') return 'Folding & Checking'
  if (screen === 'dispatch') return 'Dispatch'
  if (screen === 'production' && sub === 'report') return 'Production Report'
  if (screen === 'production' && sub === 'job') return 'Job Card Issue'
  if (screen === 'production' && sub === 'entry') return 'Production Entry'
  if (screen === 'program-dispatch') {
    const labels: Record<string, string> = {
      pto: 'Program to Production',
      entry: 'Production Entry',
      tracking: 'Production Tracking',
      folding: 'Folding & Checking',
      challan: 'Dispatch / Challan',
      gatepass: 'Gate Pass',
      invoice: 'Invoice',
      reports: 'Program & Dispatch Reports',
    }
    return labels[sub || 'pto'] || 'Program & Dispatch'
  }
  if (screen === 'orders' && sub === 'report') return 'Party Delivery Report'
  if (screen === 'programs' && sub === 'pending') return 'Program Pending'
  if (screen === 'programs') return 'Program Card'
  if (screen === 'security') return 'Security Gate'
  if (screen === 'admin' && sub === 'payroll') return 'Payroll'
  if (screen === 'admin' && sub === 'permissions') return 'Permission Management'
  if (screen === 'admin' && sub === 'approvals') return 'Approvals'
  if (screen === 'admin') return 'PIN Management'
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
    if (item.screen === 'program-dispatch' && item.sub === 'challan') {
      return (sub || '') === 'challan'
    }
    if (item.screen === 'dispatch' && item.sub === 'challan') {
      return (sub || 'challan') === 'challan' || sub === 'gatepass'
    }
    return false
  }
  if (item.filter && filter && item.filter !== filter) return false
  return true
}
