/**
 * Navigation — final JAISAL FW module structure.
 * Each function has ONE logical home; duplicates only appear as deep links when needed.
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
  | 'dto-hub'
  | 'dto-intake'
  | 'dto-sample-job'
  | 'dto-tracking'
  | 'dto-order-booking'
  | 'dto-order-status'
  | 'dto-promotion'
  | 'dto-followup'
  | 'dto-reports'
  | 'hr-payroll'
  | 'program-dispatch'
  | 'security-inventory'
  | 'module-hub'
  | 'settings-hub'
  | 'placeholder'

export type MainModuleId =
  | 'dashboard'
  | 'production'
  | 'inventory'
  | 'design-to-order'
  | 'program-dispatch'
  | 'warp-yarn'
  | 'hr-payroll'
  | 'maintenance'
  | 'security'
  | 'orders'
  | 'cash-book'
  | 'reports'
  | 'masters'
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
      { id: 'warp-issue', label: 'Warp Issue', screen: 'warp-yarn', sub: 'machines', hint: 'Issue / return warp pipes on machines' },
      { id: 'weft-issue', label: 'Weft Issue', screen: 'purchase', sub: 'weft', hint: 'Weft yarn issue' },
      {
        id: 'prod-entry',
        label: 'Production Entry',
        screen: 'program-dispatch',
        sub: 'entry',
        hint: 'Opens Program & Dispatch entry',
      },
      {
        id: 'folding',
        label: 'Folding',
        screen: 'program-dispatch',
        sub: 'folding',
        hint: 'Folding & checking lots',
      },
      {
        id: 'dispatch',
        label: 'Dispatch',
        screen: 'program-dispatch',
        sub: 'challan',
        hint: 'Challan & dispatch',
      },
      {
        id: 'machine-wise',
        label: 'Machine-wise Production',
        screen: 'program-dispatch',
        sub: 'reports',
        hint: 'By machine',
      },
      {
        id: 'shift-wise',
        label: 'Shift-wise Production',
        screen: 'production',
        sub: 'report',
        filter: 'shift',
        hint: 'By shift',
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
        id: 'warp-yarn-link',
        label: 'Warp Yarn Management',
        screen: 'warp-yarn',
        sub: 'overview',
        hint: 'Open Warp Yarn Management module',
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
    id: 'design-to-order',
    label: 'Design to Order',
    icon: 'design-to-order',
    screen: 'dto-hub',
    mobileNav: true,
    items: [
      { id: 'din-intake', label: 'DIN Intake', screen: 'dto-intake', hint: 'DIN Inbox · Upload · Photo · Email' },
      {
        id: 'din-costing',
        label: 'DIN Costing',
        screen: 'design-wise-costing',
        hint: 'Same Design Wise Costing engine (CEO)',
      },
      { id: 'sample-job', label: 'Sample Job Card', screen: 'dto-sample-job', hint: 'Issue sample cards' },
      { id: 'sample-tracking', label: 'Sample Tracking', screen: 'dto-tracking', hint: 'Produce · receive · approve' },
      { id: 'order-booking', label: 'Order Booking', screen: 'dto-order-booking', hint: 'Customer order entry' },
      { id: 'order-status', label: 'Order Status', screen: 'dto-order-status', hint: 'Pending & status tracking' },
      { id: 'sample-promotion', label: 'Customer Promotion', screen: 'dto-promotion', hint: 'Share to parties' },
      { id: 'followup', label: 'Order Follow-up', screen: 'dto-followup', hint: 'Party follow-ups' },
      { id: 'dto-reports', label: 'Reports', screen: 'dto-reports', hint: 'Design to Order reports' },
    ],
  },
  {
    id: 'program-dispatch',
    label: 'Program & Dispatch',
    icon: 'program-dispatch',
    screen: 'program-dispatch',
    sub: 'pto',
    mobileNav: true,
    items: [
      {
        id: 'pto',
        label: 'Program to Production',
        screen: 'program-dispatch',
        sub: 'pto',
        hint: 'Order selection · machine programs',
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
        label: 'Dispatch History / Reports',
        screen: 'program-dispatch',
        sub: 'reports',
        hint: 'Production · checking · dispatch',
      },
      { id: 'legacy-program', label: 'Program Card (Legacy)', screen: 'programs', sub: 'create', hint: 'Classic program card' },
      { id: 'legacy-job', label: 'Job Card Issue (Legacy)', screen: 'production', sub: 'job', hint: 'Classic job cards' },
    ],
  },
  {
    id: 'warp-yarn',
    label: 'Warp Yarn Management',
    icon: 'warp-yarn',
    screen: 'warp-yarn',
    sub: 'overview',
    mobileNav: true,
    items: [
      { id: 'wy-overview', label: 'Overview', screen: 'warp-yarn', sub: 'overview', hint: 'Live beam / pipe KPIs' },
      { id: 'wy-machines', label: 'Machine Beam Stock', screen: 'warp-yarn', sub: 'machines', hint: 'M1–M6 beams on loom' },
      { id: 'wy-godown', label: 'Warehouse Filled Beams', screen: 'warp-yarn', sub: 'godown', hint: 'Godown filled stock' },
      { id: 'wy-empty', label: 'Empty Pipe Stock', screen: 'warp-yarn', sub: 'empty', hint: 'Empty pipe inventory' },
      { id: 'wy-warper', label: 'Warper / Job Worker', screen: 'warp-yarn', sub: 'warper', hint: 'Issue · return · KG/meter' },
      { id: 'wy-reports', label: 'Warp Reports', screen: 'warp-yarn', sub: 'reports', hint: 'Transactions & history' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      { id: 'legacy-beam', label: 'Beam Pipe (Legacy)', screen: 'warp-beam-pipe', hint: 'Legacy beam pipe screen' },
    ],
  },
  {
    id: 'hr-payroll',
    label: 'HR & Payroll',
    icon: 'hr-payroll',
    screen: 'module-hub',
    hasHub: true,
    mobileNav: true,
    items: [
      { id: 'hr-dash', label: 'Dashboard', screen: 'hr-payroll', sub: 'dashboard', hint: 'Live attendance & payroll KPIs' },
      { id: 'hr-employees', label: 'Employee Master', screen: 'hr-payroll', sub: 'employees', hint: 'Employees, bank & designation' },
      { id: 'hr-attendance', label: 'Attendance', screen: 'attendance', hint: 'Daily attendance by date & shift' },
      { id: 'hr-leave', label: 'Leave / Holiday', screen: 'hr-payroll', sub: 'leave', hint: 'Leave entries & holidays' },
      { id: 'hr-rates', label: 'Salary Rate Master', screen: 'hr-payroll', sub: 'rates', hint: 'Monthly / daily / hourly rates' },
      { id: 'hr-payroll-run', label: 'Payroll', screen: 'hr-payroll', sub: 'payroll', hint: 'Calculate & approve payroll' },
      { id: 'hr-statutory', label: 'ESI / PF / PT', screen: 'hr-payroll', sub: 'statutory', hint: 'Toggle statutory deductions' },
      { id: 'hr-register', label: 'Salary Register', screen: 'hr-payroll', sub: 'register', hint: 'Monthly salary history' },
      { id: 'hr-payment', label: 'Salary Payment', screen: 'hr-payroll', sub: 'payment', hint: 'Ready for bank transfer' },
      { id: 'hr-bank-letter', label: 'Bank Salary Letter', screen: 'hr-payroll', sub: 'bank-letter', hint: 'Printable bank statement' },
      { id: 'hr-reports', label: 'Reports', screen: 'hr-payroll', sub: 'reports', hint: 'Attendance & payroll reports' },
    ],
  },
  {
    id: 'maintenance',
    label: 'Machine-wise Maintenance',
    icon: 'maintenance',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'maint-overview', label: 'Machine Overview', screen: 'maintenance', sub: 'overview', hint: 'M1–M6 status board' },
      { id: 'maint-request', label: 'Breakdown / Complaint', screen: 'maintenance', sub: 'request', hint: 'Open breakdown tickets' },
      { id: 'breakdown', label: 'Repair / Resolution', screen: 'maintenance', sub: 'repair', hint: 'Call → arrive → resolve' },
      { id: 'maint-material', label: 'Parts / Material Out-In', screen: 'maint-material', hint: 'Material + auto gate pass' },
      { id: 'service-history', label: 'Service History', screen: 'maintenance', sub: 'history', hint: 'Machine history log' },
      { id: 'spare-parts', label: 'Spare Parts Inward', screen: 'purchase', sub: 'maint_in', hint: 'Parts inward' },
      { id: 'maint-reports', label: 'Maintenance Reports', screen: 'purchase', sub: 'repair_inv', hint: 'Repair invoices' },
    ],
  },
  {
    id: 'security',
    label: 'Security / Inward',
    icon: 'security',
    screen: 'module-hub',
    hasHub: true,
    items: [
      {
        id: 'security-inventory',
        label: 'Security Inventory',
        screen: 'security-inventory',
        sub: 'dashboard',
        hint: 'Dashboard · Warp · Weft · Maintenance · General',
      },
      {
        id: 'si-warp',
        label: 'Warp Yarn Inward/Outward',
        screen: 'security-inventory',
        sub: 'warp',
        hint: 'Syncs to Warp Yarn Management',
      },
      {
        id: 'si-weft',
        label: 'Weft Yarn Inward',
        screen: 'security-inventory',
        sub: 'weft',
        hint: 'Colour-wise weft + GST + photo',
      },
      {
        id: 'si-maint-in',
        label: 'Maintenance Material Inward',
        screen: 'security-inventory',
        sub: 'maint-in',
        hint: 'Parts / store inward',
      },
      {
        id: 'si-maint-out',
        label: 'Repair Out / In',
        screen: 'security-inventory',
        sub: 'maint-out',
        hint: 'Maintenance repair outward + return',
      },
      {
        id: 'si-general',
        label: 'General Item Inward',
        screen: 'security-inventory',
        sub: 'general',
        hint: 'Item master dropdown',
      },
      {
        id: 'si-others',
        label: 'Other Inward',
        screen: 'security-inventory',
        sub: 'others',
        hint: 'Uncommon material entry',
      },
      {
        id: 'si-pending',
        label: 'Pending Entries',
        screen: 'security-inventory',
        sub: 'pending',
        hint: 'Pending outward / repair / docs',
      },
      {
        id: 'si-reports',
        label: 'Security Reports',
        screen: 'security-inventory',
        sub: 'reports',
        hint: 'Daily & A4 printable reports',
      },
      { id: 'security-gate', label: 'Security Gate Logs', screen: 'security', sub: 'inward', hint: 'Consolidated gate logs' },
      { id: 'yarn-inward-sec', label: 'Yarn Inward OCR', screen: 'yarn-inward', hint: 'Invoice scan' },
      { id: 'user-mgmt', label: 'User / PIN Management', screen: 'admin', sub: 'roles', hint: 'Users & roles' },
      { id: 'perm-mgmt', label: 'Permission Management', screen: 'admin', sub: 'permissions', hint: 'Module access by role' },
      { id: 'approvals', label: 'Approvals', screen: 'admin', sub: 'approvals', hint: 'CEO approval queue' },
      { id: 'geb-sec', label: 'GEB Reading', screen: 'geb-readings', hint: 'Electricity meter entry' },
    ],
  },
  {
    id: 'orders',
    label: 'Orders & Pending',
    icon: 'orders',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'orders-pending', label: 'Orders & Pending', screen: 'orders-pending', hint: 'Raise & track pending orders' },
      { id: 'order-book', label: 'Order Book', screen: 'orders', sub: 'entry', hint: 'Party orders' },
      { id: 'design-job', label: 'Design & Job Card', screen: 'design', hint: 'Design register' },
      { id: 'design-catalog', label: 'Design Catalog', screen: 'design-catalog', hint: 'Design DNA catalog' },
      { id: 'broadcast', label: 'Design Broadcast', screen: 'broadcast', hint: 'Post & share designs' },
      { id: 'sample-register', label: 'Sample Register', screen: 'sample-register', hint: 'Sample log' },
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
    id: 'reports',
    label: 'Reports',
    icon: 'reports',
    screen: 'module-hub',
    hasHub: true,
    items: [
      {
        id: 'design-costing',
        label: 'DIN Costing',
        screen: 'design-wise-costing',
        hint: 'CEO Design Wise Costing (same engine)',
      },
      {
        id: 'prod-report',
        label: 'Production Report',
        screen: 'program-dispatch',
        sub: 'reports',
        hint: 'Program & Dispatch reports',
      },
      { id: 'stock-report', label: 'Stock Report', screen: 'purchase', sub: 'report', hint: 'Stock & purchase' },
      { id: 'party-delivery', label: 'Party Delivery Report', screen: 'orders', sub: 'report', hint: 'Delivery by party' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      { id: 'costing-report', label: 'Costing Report', screen: 'costing', sub: 'summary', hint: 'Daily costing' },
      { id: 'geb-readings', label: 'GEB Electricity', screen: 'geb-readings', hint: 'Daily meter units & cost' },
      { id: 'loan-tracker', label: 'Loan Tracker', screen: 'loan-tracker', hint: 'Party-wise loan ledger' },
      {
        id: 'attendance-report',
        label: 'Attendance Report',
        screen: 'hr-payroll',
        sub: 'reports',
        hint: 'Open HR & Payroll reports',
      },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    icon: 'masters',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'party-master', label: 'Party Master', screen: 'parties', hint: 'Customers / parties + Marka' },
      { id: 'item-master', label: 'Item Master', screen: 'design-catalog', hint: 'Design / item catalog' },
      { id: 'machine-master', label: 'Machine Master', screen: 'placeholder', filter: 'machine-master', hint: 'Machine list (M1–M6)' },
      {
        id: 'employee-master',
        label: 'Employee Master',
        screen: 'hr-payroll',
        sub: 'employees',
        hint: 'Open HR & Payroll → Employee Master',
      },
      { id: 'design-master', label: 'Design Master', screen: 'design', hint: 'Design register' },
      { id: 'dept-master', label: 'Department Master', screen: 'placeholder', filter: 'dept-master', hint: 'Departments' },
      { id: 'shift-master', label: 'Shift Master', screen: 'placeholder', filter: 'shift-master', hint: 'Shift definitions' },
      { id: 'crm', label: 'CRM Customers', screen: 'crm', hint: 'WhatsApp customers' },
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
  maintenance: 'Machine-wise Maintenance',
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
  'design-wise-costing': 'DIN Costing',
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
  'dto-hub': 'Design to Order',
  'dto-intake': 'DIN Intake',
  'dto-sample-job': 'Sample Job Card',
  'dto-tracking': 'Sample Tracking',
  'dto-order-booking': 'Order Booking',
  'dto-order-status': 'Order Status',
  'dto-promotion': 'Customer Promotion',
  'dto-followup': 'Order Follow-up',
  'dto-reports': 'Design to Order Reports',
  'hr-payroll': 'HR & Payroll',
  'program-dispatch': 'Program & Dispatch',
  'security-inventory': 'Security Inventory',
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
  if (screen === 'hr-payroll' || screen === 'attendance') return 'hr-payroll'
  if (screen === 'program-dispatch') return 'program-dispatch'
  if (screen === 'security-inventory') return 'security'
  if (screen === 'warp-yarn' || screen === 'warp-beam-pipe' || screen === 'beam-remaining') {
    // Prefer warp-yarn module when opened from there; inventory deep-links still work via explicit module
    return 'warp-yarn'
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

  if (
    screen === 'dto-hub' ||
    screen === 'dto-intake' ||
    screen === 'dto-sample-job' ||
    screen === 'dto-tracking' ||
    screen === 'dto-order-booking' ||
    screen === 'dto-order-status' ||
    screen === 'dto-promotion' ||
    screen === 'dto-followup' ||
    screen === 'dto-reports'
  ) {
    return 'design-to-order'
  }

  if (screen === 'design-wise-costing') return 'design-to-order'
  if (screen === 'production' || screen === 'dispatch') return 'production'
  if (screen === 'stock' || screen === 'purchase' || screen === 'yarn-inward') return 'inventory'
  if (screen === 'cash-book') return 'cash-book'
  if (
    screen === 'orders' ||
    screen === 'orders-pending' ||
    screen === 'programs' ||
    screen === 'design' ||
    screen === 'sample-job-card' ||
    screen === 'design-catalog' ||
    screen === 'broadcast' ||
    screen === 'sample-register'
  ) {
    return 'orders'
  }
  if (screen === 'costing' || screen === 'loan-tracker' || screen === 'geb-readings') return 'reports'
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
  if (screen === 'hr-payroll') {
    const labels: Record<string, string> = {
      dashboard: 'HR & Payroll Dashboard',
      employees: 'Employee Master',
      leave: 'Leave / Holiday',
      rates: 'Salary Rate Master',
      payroll: 'Payroll',
      statutory: 'ESI / PF / PT',
      register: 'Salary Register',
      payment: 'Salary Payment',
      'bank-letter': 'Bank Salary Letter',
      reports: 'HR & Payroll Reports',
    }
    return labels[sub || 'dashboard'] || 'HR & Payroll'
  }
  if (screen === 'program-dispatch') {
    const labels: Record<string, string> = {
      pto: 'Program to Production',
      entry: 'Production Entry',
      tracking: 'Production Tracking',
      folding: 'Folding & Checking',
      challan: 'Dispatch / Challan',
      gatepass: 'Gate Pass',
      invoice: 'Invoice',
      reports: 'Dispatch History / Reports',
    }
    return labels[sub || 'pto'] || 'Program & Dispatch'
  }
  if (screen === 'security-inventory') {
    const labels: Record<string, string> = {
      dashboard: 'Security Inventory',
      warp: 'Warp Yarn Inward/Outward',
      weft: 'Weft Yarn Inward',
      'maint-in': 'Maintenance Material Inward',
      'maint-out': 'Repair Out / In',
      general: 'General Item Inward',
      others: 'Other Inward',
      pending: 'Pending Entries',
      documents: 'Recent Documents',
      reports: 'Security Reports',
    }
    return labels[sub || 'dashboard'] || 'Security Inventory'
  }
  if (screen === 'warp-yarn') {
    const labels: Record<string, string> = {
      overview: 'Warp Yarn Management',
      machines: 'Machine Beam Stock',
      godown: 'Warehouse Filled Beams',
      empty: 'Empty Pipe Stock',
      warper: 'Warper / Job Worker',
      reports: 'Warp Reports',
    }
    return labels[sub || 'overview'] || 'Warp Yarn Management'
  }
  if (screen === 'maintenance') {
    const labels: Record<string, string> = {
      overview: 'Machine Overview',
      request: 'Breakdown / Complaint',
      repair: 'Repair / Resolution',
      history: 'Service History',
    }
    return labels[sub || 'overview'] || 'Machine-wise Maintenance'
  }
  if (screen === 'stock' && sub === 'weft') return 'Yarn Stock'
  if (screen === 'stock') return 'Warp Beam Stock (Legacy)'
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
  if (screen === 'admin' && sub === 'payroll') return 'Payroll (Legacy Rates)'
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
    if (item.screen === 'dispatch' && item.sub === 'challan') {
      return (sub || 'challan') === 'challan' || sub === 'gatepass'
    }
    if (item.screen === 'program-dispatch' && item.sub === 'challan') {
      return (sub || 'challan') === 'challan'
    }
    return false
  }
  if (item.filter && filter && item.filter !== filter) return false
  return true
}
