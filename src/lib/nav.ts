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
  | 'item-master'
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
  | 'machine-wise-production'
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

/**
 * FINAL COMPACTION (approved CEO decisions D-01…D-24).
 * Module id `production` kept for permission compatibility; label = Machine-wise Production.
 */
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
    id: 'design-to-order',
    label: 'Design to Order',
    icon: 'design-to-order',
    screen: 'dto-hub',
    mobileNav: true,
    items: [
      { id: 'din-intake', label: 'DESI Intake', screen: 'dto-intake', hint: 'DESI Inbox · Upload · Photo · Email' },
      {
        id: 'din-costing',
        label: 'Design-wise Costing',
        screen: 'design-wise-costing',
        hint: 'Canonical Design-wise Costing engine (CEO)',
      },
      { id: 'sample-job', label: 'Sample Job Card', screen: 'dto-sample-job', hint: 'Issue sample cards from DESI' },
      { id: 'sample-tracking', label: 'Sample Tracking', screen: 'dto-tracking', hint: 'Produce · receive · approve matching' },
      { id: 'order-booking', label: 'Customer Order', screen: 'dto-order-booking', hint: 'Customer fabric order from DESI' },
      { id: 'order-status', label: 'Order Status', screen: 'dto-order-status', hint: 'Pending & status tracking' },
      { id: 'sample-promotion', label: 'Customer Promotion', screen: 'dto-promotion', hint: 'Share approved matching' },
      { id: 'followup', label: 'Order Follow-up', screen: 'dto-followup', hint: 'Party follow-ups' },
      { id: 'dto-reports', label: 'DESI Reports', screen: 'dto-reports', hint: 'Design to Order reports' },
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
        hint: 'Canonical MWP Production Entry (embedded)',
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
      {
        id: 'legacy-program',
        label: 'Program Card (LEGACY)',
        screen: 'programs',
        sub: 'create',
        hint: 'Legacy — use Program to Production',
      },
      {
        id: 'legacy-dispatch',
        label: 'Classic Dispatch (LEGACY)',
        screen: 'dispatch',
        sub: 'folding',
        hint: 'Legacy — use Folding / Challan / Gate Pass above',
      },
    ],
  },
  {
    id: 'production',
    label: 'Machine-wise Production',
    icon: 'production',
    screen: 'module-hub',
    hasHub: true,
    mobileNav: true,
    items: [
      {
        id: 'weft-issue',
        label: 'Weft Yarn Issue',
        screen: 'machine-wise-production',
        sub: 'weft',
        hint: 'Matching-wise weft requirement & issue from Design-wise Costing',
      },
      {
        id: 'job-card',
        label: 'Machine-wise Job Card',
        screen: 'production',
        sub: 'job',
        hint: 'Job card issue linked to program',
      },
      {
        id: 'prod-entry',
        label: 'Production Entry',
        screen: 'machine-wise-production',
        sub: 'entry',
        hint: 'Canonical shift / operator / meters entry',
      },
      {
        id: 'mwp-report',
        label: 'Machine-wise Report',
        screen: 'machine-wise-production',
        sub: 'report',
        hint: 'Production & weft issue reports',
      },
      {
        id: 'shift-wise',
        label: 'Shift-wise Production Report',
        screen: 'production',
        sub: 'report',
        filter: 'shift',
        hint: 'By shift',
      },
      {
        id: 'legacy-entry',
        label: 'Classic Production Entry (LEGACY)',
        screen: 'production',
        sub: 'entry',
        hint: 'Legacy — use Production Entry above',
      },
    ],
  },
  {
    id: 'warp-yarn',
    label: 'Warp Yarn Management',
    icon: 'warp-yarn',
    screen: 'warp-yarn',
    sub: 'overview',
    items: [
      { id: 'wy-overview', label: 'Overview', screen: 'warp-yarn', sub: 'overview', hint: 'Live beam / pipe KPIs' },
      { id: 'wy-machines', label: 'Machine Beam Stock', screen: 'warp-yarn', sub: 'machines', hint: 'M1–M6 beams on loom' },
      { id: 'wy-godown', label: 'Warehouse Filled Beams', screen: 'warp-yarn', sub: 'godown', hint: 'Godown filled stock' },
      { id: 'wy-empty', label: 'Empty Pipe Stock', screen: 'warp-yarn', sub: 'empty', hint: 'Empty pipe inventory' },
      { id: 'wy-warper', label: 'Warper / Job Worker', screen: 'warp-yarn', sub: 'warper', hint: 'Issue · return · KG/meter' },
      { id: 'wy-reports', label: 'Warp Reports', screen: 'warp-yarn', sub: 'reports', hint: 'Transactions & history' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      {
        id: 'legacy-beam',
        label: 'Beam Pipe (LEGACY)',
        screen: 'warp-beam-pipe',
        hint: 'Legacy — prefer Warp Yarn Management tabs',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'inventory',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'yarn-stock', label: 'Yarn Stock', screen: 'stock', sub: 'weft', hint: 'Opening stock & yarn item master' },
      {
        id: 'warp-yarn-link',
        label: 'Warp Yarn Management',
        screen: 'warp-yarn',
        sub: 'overview',
        hint: 'Open Warp Yarn Management module',
      },
      {
        id: 'stock-reports',
        label: 'Stock Reports',
        screen: 'purchase',
        sub: 'report',
        hint: 'Purchase & stock accounting reports',
      },
      {
        id: 'purchase-legacy',
        label: 'Purchase Entry (LEGACY)',
        screen: 'purchase',
        sub: 'general',
        hint: 'Legacy entry — prefer Security gate inward',
      },
    ],
  },
  {
    id: 'hr-payroll',
    label: 'HR & Payroll',
    icon: 'hr-payroll',
    screen: 'module-hub',
    hasHub: true,
    items: [
      { id: 'hr-dash', label: 'Dashboard', screen: 'hr-payroll', sub: 'dashboard', hint: 'Live attendance & payroll KPIs' },
      { id: 'hr-employees', label: 'Employee Master', screen: 'hr-payroll', sub: 'employees', hint: 'Employees, bank & designation' },
      {
        id: 'hr-job-master',
        label: 'Job Master',
        screen: 'admin',
        sub: 'payroll',
        hint: 'ASO / Security Guard / Sweeper designations',
      },
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
      { id: 'overview', label: 'Machine Overview', screen: 'maintenance', sub: 'overview', hint: 'M1–M6 status board' },
      { id: 'breakdown', label: 'Breakdown Entry', screen: 'maintenance', sub: 'breakdown', hint: 'OPEN → CALL → ARRIVED → RESOLVED' },
      { id: 'complaints', label: 'Complaint Register', screen: 'maintenance', sub: 'complaints', hint: 'Machine complaints' },
      { id: 'maint-entry', label: 'Maintenance Entry', screen: 'maintenance', sub: 'entry', hint: 'Planned / general maintenance' },
      { id: 'maint-schedule', label: 'Maintenance Schedule', screen: 'maintenance', sub: 'schedule', hint: 'Calendar & due dates' },
      { id: 'service-history', label: 'Service History', screen: 'maintenance', sub: 'history', hint: 'Auto history from entries' },
      { id: 'spare-parts', label: 'Spare Parts', screen: 'maintenance', sub: 'spares', hint: 'Stock & low-stock alerts' },
      { id: 'contacts', label: 'Contacts Directory', screen: 'maintenance', sub: 'contacts', hint: 'Technicians & contractors' },
      {
        id: 'maint-material',
        label: 'Repair / Material Out · In',
        screen: 'maint-material',
        hint: 'Canonical material + auto gate pass',
      },
      {
        id: 'si-repair-link',
        label: 'Security Repair Gate',
        screen: 'security-inventory',
        sub: 'maint-out',
        hint: 'Gate record for repair outward / return',
      },
      { id: 'maint-reports', label: 'Maintenance Reports', screen: 'maintenance', sub: 'reports', hint: 'A4 print & CSV reports' },
      {
        id: 'repair-out',
        label: 'Repair Tracker (LEGACY)',
        screen: 'maintenance',
        sub: 'repair',
        hint: 'Legacy repairing tracker',
      },
    ],
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: 'orders',
    screen: 'module-hub',
    hasHub: true,
    items: [
      {
        id: 'orders-pending',
        label: 'Internal Pending',
        screen: 'orders-pending',
        hint: 'Internal store / repair / factory pending list (not customer fabric orders)',
      },
      {
        id: 'order-book',
        label: 'Order Book (Report / Adjust)',
        screen: 'orders',
        sub: 'entry',
        hint: 'View / adjust customer order book · party delivery',
      },
      { id: 'design-job', label: 'Design Master', screen: 'design', hint: 'Design register' },
      { id: 'design-catalog', label: 'Design Catalog', screen: 'design-catalog', hint: 'Design DNA catalog' },
      { id: 'broadcast', label: 'Design Broadcast', screen: 'broadcast', hint: 'Post & share new designs' },
      {
        id: 'sample-register',
        label: 'Sample Register (Archive)',
        screen: 'sample-register',
        hint: 'Archive / report of sample cards',
      },
    ],
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
        label: 'Design-wise Costing',
        screen: 'design-wise-costing',
        hint: 'Same Design-wise Costing engine (deep link)',
      },
      {
        id: 'prod-report',
        label: 'Production Report',
        screen: 'program-dispatch',
        sub: 'reports',
        hint: 'Program & Dispatch reports',
      },
      {
        id: 'mwp-report',
        label: 'Machine-wise Production',
        screen: 'machine-wise-production',
        sub: 'report',
        hint: 'Weft issue + machine production reports',
      },
      { id: 'stock-report', label: 'Stock Report', screen: 'purchase', sub: 'report', hint: 'Stock & purchase' },
      { id: 'party-delivery', label: 'Party Delivery Report', screen: 'orders', sub: 'report', hint: 'Delivery by party' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      {
        id: 'costing-report',
        label: 'Daily Costing & P&L',
        screen: 'costing',
        sub: 'factory',
        hint: 'Daily factory / production / dispatch P&L — separate from Design-wise Costing',
      },
      { id: 'geb-readings', label: 'GEB Electricity', screen: 'geb-readings', hint: 'Daily meter units & cost (sole electricity entry)' },
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
      {
        id: 'item-master',
        label: 'Item Master',
        screen: 'item-master',
        hint: 'Store / inventory item master',
      },
      {
        id: 'machine-master',
        label: 'Machine Overview',
        screen: 'maintenance',
        sub: 'overview',
        hint: 'Machine 1–6 overview (M1–M6)',
      },
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
      { id: 'crm', label: 'CRM Customer Master', screen: 'crm', hint: 'WhatsApp customers' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'security',
    screen: 'module-hub',
    hasHub: true,
    items: [
      {
        id: 'security-inventory',
        label: 'Security Inventory',
        screen: 'security-inventory',
        sub: 'dashboard',
        hint: 'Gate dashboard · Warp · Weft · Maintenance · General',
      },
      {
        id: 'si-warp',
        label: 'Warp Yarn Inward/Outward',
        screen: 'security-inventory',
        sub: 'warp',
        hint: 'Gate record · syncs to Warp Yarn / Inventory',
      },
      {
        id: 'si-weft',
        label: 'Weft Yarn Inward',
        screen: 'security-inventory',
        sub: 'weft',
        hint: 'Canonical weft gate inward + stock post',
      },
      {
        id: 'si-maint-in',
        label: 'Maintenance Material Inward',
        screen: 'security-inventory',
        sub: 'maint-in',
        hint: 'Parts / store inward at gate',
      },
      {
        id: 'si-maint-out',
        label: 'Repair Out / In (Gate)',
        screen: 'security-inventory',
        sub: 'maint-out',
        hint: 'Repair outward + return gate record',
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
        id: 'si-documents',
        label: 'Documents',
        screen: 'security-inventory',
        sub: 'documents',
        hint: 'Recent gate documents · invoice / challan / photos',
      },
      {
        id: 'si-reports',
        label: 'Security Reports',
        screen: 'security-inventory',
        sub: 'reports',
        hint: 'Daily & A4 printable reports',
      },
      { id: 'security-gate', label: 'Security Gate Logs', screen: 'security', sub: 'inward', hint: 'Consolidated gate logs' },
      { id: 'yarn-inward-sec', label: 'Yarn Inward OCR', screen: 'yarn-inward', hint: 'Invoice OCR assist at gate' },
      { id: 'approvals', label: 'Approvals', screen: 'admin', sub: 'approvals', hint: 'CEO approval queue' },
      { id: 'geb-sec', label: 'GEB Reading', screen: 'geb-readings', hint: 'Electricity meter entry' },
      { id: 'login-activity', label: 'Login Activity', screen: 'placeholder', filter: 'login-activity', hint: 'Recent sessions' },
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
      {
        id: 'preferences',
        label: 'System Preferences',
        screen: 'placeholder',
        filter: 'preferences',
        hint: 'System preferences (placeholder)',
      },
      { id: 'user-mgmt', label: 'User / PIN Management', screen: 'admin', sub: 'roles', hint: 'Users & roles' },
      { id: 'perm-mgmt', label: 'Permission Management', screen: 'admin', sub: 'permissions', hint: 'Module access by role' },
      {
        id: 'legacy-payroll',
        label: 'Payroll Rates (LEGACY)',
        screen: 'admin',
        sub: 'payroll',
        hint: 'Legacy — use HR & Payroll → Salary Rate Master',
      },
    ],
  },
]

export const PAGE_TITLES: Record<AppScreen, string> = {
  home: 'Dashboard',
  attendance: 'Attendance',
  stock: 'Stock',
  design: 'Design Master',
  purchase: 'Purchase & Inward',
  production: 'Machine-wise Production',
  maintenance: 'Machine-wise Maintenance',
  dispatch: 'Classic Dispatch (LEGACY)',
  admin: 'Admin',
  costing: 'Daily Costing & P&L',
  orders: 'Order Book',
  programs: 'Program Card (LEGACY)',
  security: 'Security Gate',
  broadcast: 'Design Broadcast',
  parties: 'Party Master',
  'sample-job-card': 'Sample Job Card (LEGACY)',
  'sample-register': 'Sample Register (Archive)',
  'beam-remaining': 'Beam Remaining',
  'design-wise-costing': 'Design-wise Costing',
  'design-catalog': 'Design Catalog',
  crm: 'CRM',
  'cash-book': 'Cash Book',
  'warp-beam-pipe': 'Warp Beam Pipe (LEGACY)',
  'warp-yarn': 'Warp Yarn Management',
  'yarn-inward': 'Yarn Inward OCR',
  'maint-material': 'Repair / Material Out · In',
  'loan-tracker': 'Loan Tracker',
  'geb-readings': 'GEB Electricity',
  'item-master': 'Item Master',
  'orders-pending': 'Internal Pending',
  'dto-hub': 'Design to Order',
  'dto-intake': 'DESI Intake',
  'dto-sample-job': 'Sample Job Card',
  'dto-tracking': 'Sample Tracking',
  'dto-order-booking': 'Customer Order',
  'dto-order-status': 'Order Status',
  'dto-promotion': 'Customer Promotion',
  'dto-followup': 'Order Follow-up',
  'dto-reports': 'DESI Reports',
  'hr-payroll': 'HR & Payroll',
  'program-dispatch': 'Program & Dispatch',
  'machine-wise-production': 'Machine-wise Production',
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
  if (screen === 'machine-wise-production') return 'production'
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
  if (screen === 'parties' || screen === 'crm' || screen === 'item-master') return 'masters'
  if (screen === 'security') return 'security'
  if (screen === 'admin') {
    if (sub === 'roles' || sub === 'permissions' || sub === 'payroll') return 'settings'
    return 'security'
  }
  if (screen === 'placeholder') {
    if (
      filter?.includes('shift') ||
      filter === 'company' ||
      filter === 'notifications' ||
      filter === 'backup' ||
      filter === 'preferences'
    ) {
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
      breakdown: 'Breakdown Entry',
      complaints: 'Complaint Register',
      entry: 'Maintenance Entry',
      request: 'Maintenance Entry',
      schedule: 'Maintenance Schedule',
      history: 'Service History',
      spares: 'Spare Parts',
      contacts: 'Contacts Directory',
      reports: 'Maintenance Reports',
      repair: 'Repair Out / In',
    }
    return labels[sub || 'overview'] || 'Machine-wise Maintenance'
  }
  if (screen === 'machine-wise-production') {
    if (sub === 'entry') return 'Machine-wise Production · Entry'
    if (sub === 'report') return 'Machine-wise Production · Report'
    return 'Machine-wise Production'
  }
  if (screen === 'stock' && sub === 'weft') return 'Yarn Stock'
  if (screen === 'stock') return 'Warp Beam Stock (Legacy)'
  if (screen === 'purchase' && sub === 'weft') return 'Weft Purchase / Inward'
  if (screen === 'purchase' && sub === 'report') return 'Stock Reports'
  if (screen === 'purchase' && sub === 'maint_in') return 'Consumables / Inward'
  if (screen === 'purchase' && sub === 'repair_inv') return 'Repair Invoices'
  if (screen === 'dispatch' && sub === 'folding') return 'Folding'
  if (screen === 'dispatch') return 'Dispatch'
  if (screen === 'production' && sub === 'report') return 'Shift-wise Production Report'
  if (screen === 'production' && sub === 'job') return 'Machine-wise Job Card'
  if (screen === 'production' && sub === 'entry') return 'Classic Production Entry (LEGACY)'
  if (screen === 'orders' && sub === 'report') return 'Party Delivery Report'
  if (screen === 'programs' && sub === 'pending') return 'Program Pending'
  if (screen === 'programs') return 'Program Card (LEGACY)'
  if (screen === 'security') return 'Security Gate'
  if (screen === 'admin' && sub === 'payroll') return 'Payroll Rates (LEGACY)'
  if (screen === 'admin' && sub === 'permissions') return 'Permission Management'
  if (screen === 'admin' && sub === 'approvals') return 'Approvals'
  if (screen === 'admin' && sub === 'gmail') return 'Gmail Integration'
  if (screen === 'admin') return 'User / PIN Management'
  if (screen === 'costing' && sub === 'factory') return 'Daily Factory P&L'
  if (screen === 'costing' && sub === 'production') return 'Production-wise P&L'
  if (screen === 'costing' && sub === 'dispatch') return 'Dispatch-wise P&L'
  if (screen === 'costing' && sub === 'mtd') return 'MTD P&L'
  if (screen === 'costing' && sub === 'monthly') return 'Monthly P&L'
  if (screen === 'costing' && sub === 'sources') return 'Cost Breakdown'
  if (screen === 'costing' && sub === 'electricity') return 'Daily Costing & P&L · Electricity'
  if (screen === 'costing') return 'Daily Costing & P&L'
  if (screen === 'sample-register') return 'Sample Register (Archive)'
  if (screen === 'placeholder') {
    const labels: Record<string, string> = {
      'machine-master': 'Machine Master',
      'dept-master': 'Department Master',
      'shift-master': 'Shift Master',
      'login-activity': 'Login Activity',
      company: 'Company Settings',
      'shift-settings': 'Shift Settings',
      notifications: 'Notification Settings',
      backup: 'Backup',
      preferences: 'System Preferences',
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
