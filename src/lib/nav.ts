/**
 * Navigation — JAISAL FW simplified module structure (audit cleanup Aug 2026).
 * Each function has ONE logical home; Reports/Masters may deep-link only.
 * Old / Historical screens stay routable but are labeled and grouped at module bottom.
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
  | 'formula-master'
  | 'quality-master'
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
  | 'order-to-program'
  | 'rate-master'
  | 'hr-payroll'
  | 'program-dispatch'
  | 'machine-wise-production'
  | 'security-inventory'
  | 'security-machine-update'
  | 'module-hub'
  | 'settings-hub'
  | 'ceo-pin-management'
  | 'order-entry'
  | 'daily-pending-work'
  | 'notebook'
  | 'ceo-data-review'
  | 'placeholder'

export type MainModuleId =
  | 'dashboard'
  | 'production'
  | 'inventory'
  | 'design-to-order'
  | 'order-to-program'
  | 'program-dispatch'
  | 'warp-yarn'
  | 'hr-payroll'
  | 'maintenance'
  | 'security'
  | 'orders'
  | 'daily-pending-work'
  | 'cash-book'
  | 'reports'
  | 'masters'
  | 'settings'
  | 'utilities'

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
  /** Sidebar section heading — visually separates module groups */
  navGroup?: string
}

/**
 * Simplified sidebar — one home per function (audit Aug 2026).
 * Module id `production` kept for permission compatibility.
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
    label: 'Design',
    icon: 'design-to-order',
    screen: 'dto-hub',
    mobileNav: true,
    navGroup: 'DESIGN',
    items: [
      {
        id: 'din-costing',
        label: 'DIN Costing',
        screen: 'design-wise-costing',
        hint: 'Jacquard warp/weft costing — CEO sale rate',
      },
      {
        id: 'formula-master',
        label: 'Formula Master',
        screen: 'formula-master',
        hint: 'Calc factor, base length, wastage defaults',
      },
      {
        id: 'rate-master',
        label: 'Rate Master',
        screen: 'rate-master',
        hint: 'Date-wise warp & weft yarn rates',
      },
      {
        id: 'quality-master',
        label: 'Quality Master',
        screen: 'quality-master',
        hint: 'Quality recipes — auto-fill Warp/Weft in DIN Costing',
      },
      { id: 'sample-job', label: 'Sample', screen: 'dto-sample-job', hint: 'Issue sample cards from DIN' },
      { id: 'sample-tracking', label: 'Sample Approval', screen: 'dto-tracking', hint: 'Produce · receive · approve matching' },
      { id: 'sample-promotion', label: 'Sample Promotion', screen: 'dto-promotion', hint: 'Share approved matching' },
      {
        id: 'design-reports',
        label: 'Design Reports',
        screen: 'dto-reports',
        hint: 'DIN pipeline · costing · sample status',
      },
      {
        id: 'din-costing-view',
        label: 'Design Preview (read-only)',
        screen: 'design-wise-costing',
        filter: 'view-only',
        hint: 'Approved rate view — no costing edit',
      },
      {
        id: 'legacy-design-register',
        label: 'Design Register (Old / Historical)',
        screen: 'design',
        hint: 'Old design list — use DIN Costing for new DINs',
      },
      {
        id: 'legacy-sample-card',
        label: 'Sample Card (Old / Historical)',
        screen: 'sample-job-card',
        hint: 'Old screen — use Sample above',
      },
    ],
  },
  {
    id: 'order-to-program',
    label: 'Sales & Order',
    icon: 'order-to-program',
    screen: 'order-to-program',
    mobileNav: true,
    navGroup: 'SALES & ORDER',
    items: [
      {
        id: 'order-booking',
        label: 'Customer Order',
        screen: 'order-to-program',
        filter: 'order-entry',
        hint: 'Matching-wise fabric order from approved DIN',
      },
      {
        id: 'order-status',
        label: 'Order Status',
        screen: 'order-to-program',
        filter: 'order-status',
        hint: 'Order → Program → Production → Dispatch',
      },
      {
        id: 'order-followup',
        label: 'Order Follow-up',
        screen: 'dto-followup',
        hint: 'Party follow-up reminders',
      },
      {
        id: 'program-to-machine',
        label: 'Program to Machine',
        screen: 'order-to-program',
        filter: 'program',
        hint: 'Machine · warp · matching recipe · job card',
      },
      {
        id: 'otp-reports',
        label: 'Order Reports',
        screen: 'order-to-program',
        filter: 'reports',
        hint: 'Order / matching / machine / dispatch reports',
      },
    ],
  },
  {
    id: 'program-dispatch',
    label: 'Production & Dispatch',
    icon: 'program-dispatch',
    screen: 'program-dispatch',
    sub: 'entry',
    mobileNav: true,
    navGroup: 'PRODUCTION',
    items: [
      {
        id: 'prod-entry',
        label: 'Production',
        screen: 'program-dispatch',
        sub: 'entry',
        hint: 'Shift / operator / meters entry',
      },
      {
        id: 'folding',
        label: 'Checking',
        screen: 'program-dispatch',
        sub: 'folding',
        hint: 'Folding · checking · damage · final meter',
      },
      {
        id: 'dispatch',
        label: 'Dispatch',
        screen: 'program-dispatch',
        sub: 'challan',
        hint: 'Select lots · create challan',
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
        hint: 'Production · checking · dispatch history',
      },
      {
        id: 'gatepass',
        label: 'Gate Pass',
        screen: 'program-dispatch',
        sub: 'gatepass',
        hint: 'Vehicle · print gate pass',
      },
      {
        id: 'pto',
        label: 'Program to Production (Old / Historical)',
        screen: 'program-dispatch',
        sub: 'pto',
        hint: 'Old hub — prefer Sales & Order → Program to Machine',
      },
      {
        id: 'tracking',
        label: 'Production Tracking (Old / Historical)',
        screen: 'program-dispatch',
        sub: 'tracking',
        hint: 'Live meters — use Order Status in Sales & Order',
      },
      {
        id: 'legacy-program',
        label: 'Program Card (Old / Historical)',
        screen: 'programs',
        sub: 'create',
        hint: 'Old screen — use Program to Machine',
      },
      {
        id: 'legacy-dispatch',
        label: 'Classic Dispatch (Old / Historical)',
        screen: 'dispatch',
        sub: 'folding',
        hint: 'Old screen — use Checking / Challan / Gate Pass above',
      },
    ],
  },
  {
    id: 'production',
    label: 'Machine Production',
    icon: 'production',
    screen: 'module-hub',
    hasHub: true,
    navGroup: 'PRODUCTION',
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
        hint: 'Main shift / operator / meters entry',
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
        label: 'Classic Production Entry (Old / Historical)',
        screen: 'production',
        sub: 'entry',
        hint: 'Old screen — use Production Entry above',
      },
    ],
  },
  {
    id: 'warp-yarn',
    label: 'Warp Yarn Management',
    icon: 'warp-yarn',
    screen: 'warp-yarn',
    sub: 'overview',
    navGroup: 'INVENTORY',
    items: [
      { id: 'wy-overview', label: 'Overview', screen: 'warp-yarn', sub: 'overview', hint: 'Live beam / pipe KPIs' },
      { id: 'wy-machines', label: 'On Machines', screen: 'warp-yarn', sub: 'machines', hint: 'M1–M6 + Others beams on loom' },
      { id: 'wy-godown', label: 'Godown – Filled Pipes', screen: 'warp-yarn', sub: 'godown', hint: 'Filled pipes in godown' },
      { id: 'wy-empty', label: 'Empty Pipes', screen: 'warp-yarn', sub: 'empty', hint: 'Empty pipe inventory' },
      { id: 'wy-warper', label: 'At Warper / Job Work', screen: 'warp-yarn', sub: 'warper', hint: 'Send · receive · KG/meter diff' },
      { id: 'wy-reports', label: 'Transactions & Reports', screen: 'warp-yarn', sub: 'reports', hint: 'Movement history & stock reports' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      {
        id: 'legacy-beam',
        label: 'Beam Pipe (Old / Historical)',
        screen: 'warp-beam-pipe',
        hint: 'Old screen — prefer Warp Yarn Management tabs',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'inventory',
    screen: 'module-hub',
    hasHub: true,
    navGroup: 'INVENTORY',
    items: [
      { id: 'yarn-stock', label: 'Yarn Stock', screen: 'stock', sub: 'weft', hint: 'Weft yarn opening stock & item master' },
      {
        id: 'warp-yarn-link',
        label: 'Warp Yarn',
        screen: 'warp-yarn',
        sub: 'overview',
        hint: 'Beam / pipe / warper — full Warp Yarn module',
      },
      {
        id: 'chemical-store',
        label: 'Chemical / Consumables',
        screen: 'purchase',
        sub: 'maint_in',
        hint: 'Maintenance material inward & stock',
      },
      {
        id: 'maint-store',
        label: 'Maintenance Store',
        screen: 'maint-material',
        hint: 'Spare parts out / in + gate pass',
      },
      {
        id: 'stock-reports',
        label: 'Inventory Reports',
        screen: 'purchase',
        sub: 'report',
        hint: 'Purchase & stock accounting reports',
      },
      {
        id: 'purchase-legacy',
        label: 'Purchase Entry (Old / Historical)',
        screen: 'purchase',
        sub: 'general',
        hint: 'Old screen — prefer Security gate inward',
      },
    ],
  },
  {
    id: 'hr-payroll',
    label: 'HR & Payroll',
    icon: 'hr-payroll',
    screen: 'module-hub',
    hasHub: true,
    navGroup: 'HR & PAYROLL',
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
      { id: 'hr-attendance', label: 'Attendance', screen: 'attendance', hint: 'Bulk table & date-range matrix' },
      { id: 'hr-leave', label: 'Leave / Holiday', screen: 'hr-payroll', sub: 'leave', hint: 'Leave entries & holidays' },
      { id: 'hr-rates', label: 'Salary Rate Master', screen: 'hr-payroll', sub: 'rates', hint: 'Monthly / daily / hourly rates' },
      { id: 'hr-advance', label: 'Advance Salary', screen: 'hr-payroll', sub: 'advance', hint: 'Cash / cheque / bank advance entries' },
      { id: 'hr-salary-status', label: 'Salary Up To Date', screen: 'hr-payroll', sub: 'salary-status', hint: 'Live salary liability as of any date' },
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
    label: 'Machine Maintenance',
    icon: 'maintenance',
    screen: 'module-hub',
    hasHub: true,
    navGroup: 'MACHINE MAINTENANCE',
    items: [
      { id: 'overview', label: 'Dashboard', screen: 'maintenance', sub: 'overview', hint: 'M1–M6 status board' },
      { id: 'machine-master', label: 'Machine Master', screen: 'maintenance', sub: 'overview', hint: 'Machine 1–6 (M1–M6)' },
      { id: 'maint-schedule', label: 'Preventive Maintenance', screen: 'maintenance', sub: 'schedule', hint: 'Calendar & due dates' },
      { id: 'breakdown', label: 'Breakdown', screen: 'maintenance', sub: 'breakdown', hint: 'OPEN → CALL → ARRIVED → RESOLVED' },
      { id: 'spare-parts', label: 'Spare Parts', screen: 'maintenance', sub: 'spares', hint: 'Stock & low-stock alerts' },
      {
        id: 'maint-material',
        label: 'Maintenance Store',
        screen: 'maint-material',
        hint: 'Material out / in + auto gate pass',
      },
      { id: 'maint-entry', label: 'Maintenance Job Card', screen: 'maintenance', sub: 'entry', hint: 'Planned / general maintenance orders' },
      { id: 'contacts', label: 'Technician', screen: 'maintenance', sub: 'contacts', hint: 'Technicians & contractors' },
      { id: 'maint-reports', label: 'Maintenance Reports', screen: 'maintenance', sub: 'reports', hint: 'A4 print & CSV reports' },
      { id: 'complaints', label: 'Maintenance Request', screen: 'maintenance', sub: 'complaints', hint: 'Machine complaints & requests' },
      { id: 'pending-work', label: 'Pending Work', screen: 'maintenance', sub: 'breakdown', hint: 'Open breakdowns & pending jobs' },
      { id: 'service-history', label: 'Service History', screen: 'maintenance', sub: 'history', hint: 'Completed maintenance entries' },
      {
        id: 'maint-material-order',
        label: 'Material Supply Order',
        screen: 'order-entry',
        sub: 'material',
        hint: 'Order spare parts (not customer fabric)',
      },
      {
        id: 'maint-repair-order',
        label: 'Repair Supply Order',
        screen: 'order-entry',
        sub: 'repair',
        hint: 'Order repair / service (not customer fabric)',
      },
      {
        id: 'si-repair-link',
        label: 'Security Repair Gate',
        screen: 'security-inventory',
        sub: 'maint-out',
        hint: 'Gate record for repair outward / return',
      },
      {
        id: 'repair-out',
        label: 'Repair Tracker (Old / Historical)',
        screen: 'maintenance',
        sub: 'repair',
        hint: 'Old repairing tracker',
      },
    ],
  },
  {
    id: 'daily-pending-work',
    label: 'Daily Pending Work',
    icon: 'daily-pending-work',
    screen: 'daily-pending-work',
    sub: 'today',
    mobileNav: true,
    items: [
      { id: 'dpw-today', label: "Today's Work", screen: 'daily-pending-work', sub: 'today', hint: 'Machine checklist & factory work' },
      { id: 'dpw-all', label: 'All Daily Works', screen: 'daily-pending-work', sub: 'all', hint: 'Full work list with filters' },
      { id: 'dpw-carry', label: 'Carry Forward', screen: 'daily-pending-work', sub: 'carry', hint: 'Unfinished work carried to next day' },
      { id: 'dpw-reports', label: 'Work Reports', screen: 'daily-pending-work', sub: 'reports', hint: 'Print & summary reports' },
    ],
  },
  {
    id: 'orders',
    label: 'Supply & Historical',
    icon: 'orders',
    screen: 'module-hub',
    hasHub: true,
    items: [
      {
        id: 'party-settlement',
        label: 'Party Settlement (Historical Records)',
        screen: 'orders',
        sub: 'report',
        hint: 'Historical delivery report & short-meter adjustment',
      },
      {
        id: 'customer-delivery',
        label: 'Party Delivery Report',
        screen: 'orders',
        sub: 'report',
        hint: 'Delivery by party & follow-up',
      },
      {
        id: 'order-adjustment',
        label: 'Order Adjustment',
        screen: 'orders',
        sub: 'report',
        hint: 'Carry forward · write-off · program adjustment',
      },
      {
        id: 'open-customer-order',
        label: 'Customer Order (use Sales & Order)',
        screen: 'order-to-program',
        filter: 'order-entry',
        hint: 'Opens the only Customer Order screen — not a second order book',
      },
      { id: 'parties', label: 'Party / Customer', screen: 'parties', hint: 'Customer & party master' },
      {
        id: 'yarn-supply-orders',
        label: 'Yarn Supply Orders',
        screen: 'order-entry',
        sub: 'warp',
        hint: 'Warp & weft yarn POs — not customer fabric',
      },
      {
        id: 'orders-pending',
        label: 'Internal Pending',
        screen: 'orders-pending',
        hint: 'Factory internal tasks — not customer fabric orders',
      },
      { id: 'design-catalog', label: 'Design Catalog', screen: 'design-catalog', hint: 'Design DNA catalog' },
      { id: 'broadcast', label: 'Design Broadcast', screen: 'broadcast', hint: 'WhatsApp design share' },
      {
        id: 'legacy-sample-register',
        label: 'Sample Register (Historical Records)',
        screen: 'sample-register',
        hint: 'Historical sample log',
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
        id: 'prod-report',
        label: 'Production & Dispatch',
        screen: 'program-dispatch',
        sub: 'reports',
        hint: 'Program & Dispatch reports',
      },
      {
        id: 'mwp-report',
        label: 'Machine Production',
        screen: 'machine-wise-production',
        sub: 'report',
        hint: 'Weft issue + machine production reports',
      },
      {
        id: 'otp-report-link',
        label: 'Order Reports',
        screen: 'order-to-program',
        filter: 'reports',
        hint: 'Order / matching / machine status',
      },
      { id: 'stock-report', label: 'Inventory Reports', screen: 'purchase', sub: 'report', hint: 'Stock & purchase' },
      { id: 'party-delivery', label: 'Party Delivery', screen: 'orders', sub: 'report', hint: 'Delivery by party' },
      { id: 'beam-remaining', label: 'Beam Remaining', screen: 'beam-remaining', hint: 'Beam meters left' },
      {
        id: 'costing-report',
        label: 'Daily Costing & P&L',
        screen: 'costing',
        sub: 'factory',
        hint: 'Factory P&L — separate from DIN Costing',
      },
      { id: 'geb-readings', label: 'GEB Electricity', screen: 'geb-readings', hint: 'Daily meter units & cost' },
      { id: 'loan-tracker', label: 'Loan Tracker', screen: 'loan-tracker', hint: 'Party-wise loan ledger' },
      {
        id: 'attendance-report',
        label: 'HR & Payroll Reports',
        screen: 'hr-payroll',
        sub: 'reports',
        hint: 'Attendance & payroll reports',
      },
      {
        id: 'maint-report-link',
        label: 'Maintenance Reports',
        screen: 'maintenance',
        sub: 'reports',
        hint: 'Machine maintenance reports',
      },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    icon: 'masters',
    screen: 'module-hub',
    hasHub: true,
    navGroup: 'MASTERS',
    items: [
      { id: 'party-master', label: 'Party Master', screen: 'parties', hint: 'Customers / parties + Marka' },
      {
        id: 'item-master',
        label: 'Item Master',
        screen: 'item-master',
        hint: 'Store / inventory item master',
      },
      {
        id: 'employee-master',
        label: 'Employee Master',
        screen: 'hr-payroll',
        sub: 'employees',
        hint: 'Open HR & Payroll → Employee Master',
      },
      { id: 'crm', label: 'CRM Customer Master', screen: 'crm', hint: 'WhatsApp customers' },
      { id: 'dept-master', label: 'Department Master', screen: 'placeholder', filter: 'dept-master', hint: 'Departments (coming soon)' },
      { id: 'shift-master', label: 'Shift Master', screen: 'placeholder', filter: 'shift-master', hint: 'Shift definitions (coming soon)' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: 'security',
    screen: 'security-machine-update',
    hasHub: true,
    mobileNav: true,
    navGroup: 'SECURITY / SETTINGS',
    items: [
      {
        id: 'machine-production-update',
        label: 'Machine & Production Update',
        screen: 'security-machine-update',
        hint: 'Security mobile — M1–M6 run status · production · WhatsApp',
      },
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
        hint: 'Main weft gate inward + stock post',
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
    id: 'utilities',
    label: 'More',
    icon: 'utilities',
    screen: 'module-hub',
    hasHub: true,
    items: [
      {
        id: 'notebook',
        label: 'Notebook',
        screen: 'notebook',
        hint: 'Digital Factory Notebook — type or photo notes',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    screen: 'module-hub',
    hasHub: true,
    navGroup: 'SECURITY / SETTINGS',
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
      { id: 'ceo-pin-mgmt', label: 'CEO PIN Management', screen: 'ceo-pin-management', hint: 'Module PINs · departments · audit' },
      { id: 'ceo-data-review', label: 'CEO Data Review', screen: 'ceo-data-review', hint: 'Yarn possible duplicates · salary rate comparison · historical empty stores' },
      { id: 'user-mgmt', label: 'Role Login PINs', screen: 'admin', sub: 'roles', hint: 'Role-based login PINs' },
      { id: 'perm-mgmt', label: 'Permission Management', screen: 'admin', sub: 'permissions', hint: 'Module access by role' },
      {
        id: 'legacy-payroll',
        label: 'Payroll Rates (Old / Historical)',
        screen: 'admin',
        sub: 'payroll',
        hint: 'Old rates — compare in CEO Data Review before any change',
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
  dispatch: 'Classic Dispatch (Old / Historical)',
  admin: 'Admin',
  costing: 'Daily Costing & P&L',
  orders: 'Order Book',
  programs: 'Program Card (Old / Historical)',
  security: 'Security Gate',
  broadcast: 'Design Broadcast',
  parties: 'Party Master',
  'sample-job-card': 'Sample Job Card (Old / Historical)',
  'sample-register': 'Sample Register (Archive)',
  'beam-remaining': 'Beam Remaining',
  'design-wise-costing': 'DIN Costing',
  'formula-master': 'Formula Master',
  'quality-master': 'Quality Master',
  'rate-master': 'Rate Master',
  'design-catalog': 'Design Catalog',
  crm: 'CRM',
  'cash-book': 'Cash Book',
  'warp-beam-pipe': 'Warp Beam Pipe (Old / Historical)',
  'warp-yarn': 'Warp Yarn Management',
  'yarn-inward': 'Yarn Inward OCR',
  'maint-material': 'Repair / Material Out · In',
  'loan-tracker': 'Loan Tracker',
  'geb-readings': 'GEB Electricity',
  'item-master': 'Item Master',
  'orders-pending': 'Internal Pending',
  'dto-hub': 'Design',
  'ceo-pin-management': 'CEO PIN Management',
  'order-entry': 'Order Entry',
  'daily-pending-work': 'Daily Pending Work',
  notebook: 'Digital Factory Notebook',
  'ceo-data-review': 'CEO Data Review',
  'dto-intake': 'DIN Costing',
  'dto-sample-job': 'Sample Job Card',
  'dto-tracking': 'Sample Tracking',
  'dto-order-booking': 'Customer Order',
  'dto-order-status': 'Order Status',
  'dto-promotion': 'Sample Promotion',
  'dto-followup': 'Order Follow-up',
  'dto-reports': 'Design Reports',
  'order-to-program': 'Sales & Order',
  'hr-payroll': 'HR & Payroll',
  'program-dispatch': 'Production & Dispatch',
  'machine-wise-production': 'Machine-wise Production',
  'security-inventory': 'Security Inventory',
  'security-machine-update': 'Machine & Production Update',
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
  if (screen === 'security-inventory' || screen === 'security-machine-update') return 'security'
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
    screen === 'dto-promotion' ||
    screen === 'dto-reports' ||
    screen === 'rate-master' ||
    screen === 'quality-master' ||
    screen === 'formula-master' ||
    screen === 'design-wise-costing'
  ) {
    return 'design-to-order'
  }

  if (
    screen === 'order-to-program' ||
    screen === 'dto-order-booking' ||
    screen === 'dto-order-status' ||
    screen === 'dto-followup'
  ) {
    return 'order-to-program'
  }
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
  if (screen === 'order-entry') {
    if (sub === 'material' || sub === 'repair') return 'maintenance'
    return 'orders'
  }
  if (screen === 'daily-pending-work') return 'daily-pending-work'
  if (screen === 'notebook') return 'utilities'
  if (screen === 'costing' || screen === 'loan-tracker' || screen === 'geb-readings') return 'reports'
  if (screen === 'maintenance' || screen === 'maint-material') return 'maintenance'
  if (screen === 'parties' || screen === 'crm' || screen === 'item-master') return 'masters'
  if (screen === 'security') return 'security'
  if (screen === 'ceo-pin-management' || screen === 'ceo-data-review') return 'settings'
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
  if (screen === 'order-to-program') {
    if (filter === 'dashboard') return 'Sales & Order'
    if (filter === 'order-entry') return 'Customer Order'
    if (filter === 'order-status') return 'Order Status'
    if (filter === 'program') return 'Program to Machine'
    if (filter === 'reports') return 'Order Reports'
    return 'Sales & Order'
  }
  if (screen === 'hr-payroll') {
    const labels: Record<string, string> = {
      dashboard: 'HR & Payroll Dashboard',
      employees: 'Employee Master',
      leave: 'Leave / Holiday',
      rates: 'Salary Rate Master',
      advance: 'Advance Salary',
      payroll: 'Payroll',
      statutory: 'ESI / PF / PT',
      register: 'Salary Register',
      payment: 'Salary Payment',
      'bank-letter': 'Bank Salary Letter',
      reports: 'HR & Payroll Reports',
      'salary-status': 'Salary Up To Date',
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
  if (screen === 'security-machine-update') return 'Machine & Production Update'
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
      machines: 'On Machines',
      godown: 'Godown – Filled Pipes',
      empty: 'Empty Pipes',
      warper: 'At Warper / Job Work',
      reports: 'Transactions & Reports',
    }
    return labels[sub || 'overview'] || 'Warp Yarn Management'
  }
  if (screen === 'order-entry') {
    const labels: Record<string, string> = {
      warp: 'Warp Yarn Order',
      weft: 'Weft Yarn Order',
      material: 'Maintenance Material Order',
      repair: 'Maintenance Repair Order',
      list: 'Order List',
      history: 'Order History',
      delivery: 'Delivery & Follow-up',
      reports: 'Order Reports',
    }
    return labels[sub || 'warp'] || 'Order Entry'
  }
  if (screen === 'daily-pending-work') {
    const labels: Record<string, string> = {
      today: "Today's Work",
      all: 'All Daily Works',
      carry: 'Carry Forward',
      reports: 'Work Reports',
    }
    return labels[sub || 'today'] || 'Daily Pending Work'
  }
  if (screen === 'notebook') return 'MY NOTEBOOK'
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
      notes: 'Notes',
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
  if (screen === 'stock') return 'Warp Beam Stock (Old / Historical)'
  if (screen === 'purchase' && sub === 'weft') return 'Weft Purchase / Inward'
  if (screen === 'purchase' && sub === 'report') return 'Stock Reports'
  if (screen === 'purchase' && sub === 'maint_in') return 'Consumables / Inward'
  if (screen === 'purchase' && sub === 'repair_inv') return 'Repair Invoices'
  if (screen === 'dispatch' && sub === 'folding') return 'Folding'
  if (screen === 'dispatch') return 'Dispatch'
  if (screen === 'production' && sub === 'report') return 'Shift-wise Production Report'
  if (screen === 'production' && sub === 'job') return 'Machine-wise Job Card'
  if (screen === 'production' && sub === 'entry') return 'Classic Production Entry (Old / Historical)'
  if (screen === 'orders' && sub === 'report') return 'Party Delivery Report'
  if (screen === 'programs' && sub === 'pending') return 'Program Pending'
  if (screen === 'programs') return 'Program Card (Old / Historical)'
  if (screen === 'security') return 'Security Gate'
  if (screen === 'admin' && sub === 'payroll') return 'Payroll Rates (Old / Historical)'
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
