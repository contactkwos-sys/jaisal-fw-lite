export type Role = {
  id: string
  role_name: string
  is_custom: boolean
  created_at: string
}

export type AppUser = {
  id: string
  full_name: string
  role_id: string
  pin_hash: string
  is_active: boolean
  created_at: string
  roles?: Role | null
}

export type Worker = {
  id: string
  full_name: string
  department: string | null
  is_active: boolean
  role_id?: string | null
  employee_code?: string | null
  designation?: string | null
  shift?: string | null
  pay_type?: string | null
  bank_name?: string | null
  bank_account_no?: string | null
  bank_ifsc?: string | null
  bank_branch?: string | null
  phone?: string | null
  joining_date?: string | null
  esi_applicable?: boolean | null
  pf_applicable?: boolean | null
  pt_applicable?: boolean | null
}

export type Attendance = {
  id: string
  worker_id: string
  date: string
  in_time: string | null
  break_out: string | null
  break_in: string | null
  out_time: string | null
  status: string | null
  created_at: string
  shift?: string | null
  remarks?: string | null
  total_hours?: number | null
  payable_day?: number | null
  updated_at?: string | null
}

export type SalaryRate = {
  id: string
  worker_id: string
  pay_type: string
  monthly_rate: number
  daily_rate: number
  hourly_rate: number
  ot_rate: number
  effective_from: string
  status: string
  approved: boolean
  created_at: string
  updated_at: string
}

export type PayrollRun = {
  id: string
  payroll_month: string
  from_date: string
  to_date: string
  status: string
  esi_on: boolean
  pf_on: boolean
  pt_on: boolean
  other_deduction_on: boolean
  working_days: number
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PayrollEntry = {
  id: string
  payroll_run_id: string
  worker_id: string
  employee_code: string | null
  employee_name: string | null
  designation: string | null
  department: string | null
  pay_type: string | null
  working_days: number
  present_days: number
  leave_days: number
  payable_days: number
  basic_salary: number
  allowances: number
  ot_amount: number
  gross_salary: number
  esi_amount: number
  pf_amount: number
  pt_amount: number
  other_deduction: number
  advance: number
  total_deduction: number
  net_payable: number
  status: string
  esi_on: boolean | null
  pf_on: boolean | null
  pt_on: boolean | null
  other_deduction_on: boolean | null
  bank_name: string | null
  bank_account_no: string | null
  bank_ifsc: string | null
  bank_branch: string | null
  payment_date: string | null
  selected_for_letter: boolean
  created_at: string
  updated_at: string
}

export type Holiday = {
  id: string
  holiday_date: string
  title: string
  is_paid: boolean
  created_at: string
}

export type LeaveEntry = {
  id: string
  worker_id: string
  leave_date: string
  leave_type: string
  remarks: string | null
  created_at: string
}

export type BankSalaryLetter = {
  id: string
  payroll_run_id: string
  letter_no: string | null
  letter_date: string
  salary_month: string
  total_employees: number
  total_amount: number
  amount_in_words: string | null
  status: string
  created_by: string | null
  created_at: string
}

export type BankSalaryLetterItem = {
  id: string
  letter_id: string
  payroll_entry_id: string | null
  sno: number
  employee_code: string | null
  employee_name: string
  designation: string | null
  bank_name: string | null
  bank_account_no: string | null
  bank_ifsc: string | null
  net_salary: number
}

export type PayrollJob = {
  id: string
  job_name: string
  job_code: string | null
  is_active: boolean
}

export type BeamPipeStock = {
  id: string
  variety_name: string
  quantity_pcs: number
  updated_at: string
  is_filled?: boolean
}

export type WeftYarnStock = {
  id: string
  supplier: string | null
  colour_no: string | null
  colour_name: string | null
  stock_kg: number
  updated_at: string
  quality?: string | null
  yarn_specification?: string | null
  unit?: string | null
  opening_stock?: number | null
  rate_per_kg?: number | null
  reorder_level?: number | null
  min_stock?: number | null
  max_stock?: number | null
  lot_number?: string | null
  location?: string | null
  gst_pct?: number | null
  hsn_code?: string | null
  remarks?: string | null
  is_active?: boolean | null
}

export type YarnStockLedger = {
  id: string
  yarn_id: string
  txn_date: string
  txn_no: string | null
  txn_type: string
  reference: string | null
  inward_kg: number
  outward_kg: number
  balance_kg: number
  rate: number
  value_amount: number
  lot_number: string | null
  location: string | null
  gst_pct: number
  invoice_no: string | null
  remarks: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

export type PinChangeAudit = {
  id: string
  role_id: string | null
  role_name: string
  action: string
  changed_by: string | null
  changed_by_name: string | null
  created_at: string
}

export type Design = {
  id: string
  dno: string
  colour: string | null
  image_url: string | null
  design_date: string
  cost_per_meter?: number | null
  matching_cost?: number | null
  total_cost?: number | null
  created_at: string
}

/** Design Catalog (DNA) — shareable design + matching photo pairs */
export type DesignCatalog = {
  id: string
  design_no: number
  jfg_no: string
  design_image_url: string
  matching_image_url: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

/** CRM customer master (WhatsApp share targets — separate from Order Book party_master) */
export type CrmCustomer = {
  id: string
  name: string
  whatsapp_number: string
  source: 'jaisal_manual' | 'kmos_sync'
  kmos_party_id: string | null
  notes: string | null
  created_at: string
}

export type DesignWarp = {
  id: string
  design_id: string
  item_colour: string | null
  denier: number | null
  tar: number | null
  length: number | null
  rate: number | null
  weight_kg: number | null
  amount: number | null
  conversion_rate: number | null
  created_at: string
}

export type DesignWeft = {
  id: string
  design_id: string
  item_colour: string | null
  denier: number | null
  pic: number | null
  width: number | null
  length: number | null
  rate: number | null
  weight_kg: number | null
  amount: number | null
  conversion_rate: number | null
  created_at: string
}

export type ApprovalQueue = {
  id: string
  table_name: string
  record_id: string | null
  action: string
  requested_by: string | null
  payload: Record<string, unknown> | null
  status: string
  created_at: string
}

export type WeftPurchase = {
  id: string
  quality: string
  weight_kg: number
  rate: number
  supplier: string | null
  party_name?: string | null
  challan_no?: string | null
  gst_pct?: number
  subtotal?: number
  grand_total?: number
  purchase_date?: string | null
  input_mode: string
  photo_url: string | null
  barcode: string | null
  created_at: string
}

export type WeftPurchaseItem = {
  id: string
  purchase_id: string
  quality: string | null
  weight_kg: number
  rate: number
  amount: number
}

export type GeneralPurchase = {
  id: string
  purchase_date: string
  party_name: string | null
  challan_no: string | null
  gst_pct: number
  subtotal: number
  grand_total: number
  photo_url: string | null
  input_mode?: string
  created_at: string
}

export type MaintenanceInward = {
  id: string
  inward_date: string
  party_name: string | null
  challan_no: string | null
  gst_pct: number
  subtotal: number
  grand_total: number
  photo_url: string | null
  created_at: string
}

export type MaintenanceRepairInvoice = {
  id: string
  invoice_date: string
  vendor_name: string | null
  invoice_no: string | null
  repairing_tracker_id: string | null
  repair_cost: number
  gst_pct: number
  grand_total: number
  photo_url: string | null
  created_at: string
}

export type BeamPipeOut = {
  id: string
  pipe_variety: string
  vendor_name: string
  date_out: string
  time_out: string
  status: string
  created_at: string
}

export type BeamPipeIn = {
  id: string
  pipe_variety: string
  kg: number
  tar_count: number
  meter: number
  challan_no: string | null
  gst_no: string | null
  gst_amount: number
  out_id: string | null
  created_at: string
}

export type WarpYarnInward = {
  id: string
  colour: string
  qty_kg: number
  supplier: string | null
  gst_no: string | null
  invoice_no: string | null
  input_mode: string
  photo_url: string | null
  created_at: string
}

export type JobCard = {
  id: string
  dno: string
  machine_no: string | null
  operator_name: string | null
  created_at: string
  program_id: string | null
  job_card_no: string | null
  issued_at: string | null
  colour: string | null
  total_meter: number | null
}

export type JobCardColour = {
  id: string
  job_card_id: string
  colour: string | null
  matching: string | null
  pick: number | null
  program_meter: number | null
  fut_panel: string | null
}

export type ProductionEntry = {
  id: string
  machine_no: string
  entry_date: string
  shift: string
  operator_name: string | null
  working_hour: number
  total_meter: number
  shift_diff: number
  efficiency_pct: number
  created_at: string
  program_id: string | null
}

export type OrderBook = {
  id: string
  party_name: string
  order_date: string
  payment_days: number | null
  discount_pct: number | null
  created_at: string
}

export type OrderBookItem = {
  id: string
  order_id: string
  design_no: string | null
  colour: string | null
  qty_meter: number
  rate: number
  amount: number
  settled: boolean
}

export type Program = {
  id: string
  order_item_id: string | null
  machine_no: string | null
  status: string
  dispatched_meter: number
  created_at: string
}

export type ProgramPetty = {
  id: string
  program_id: string
  petty_label: string | null
  item_name: string | null
  meter: number
}

export type AdjustmentNote = {
  id: string
  order_item_id: string | null
  adjustment_type: string
  reason: string | null
  meter: number | null
  created_at: string
}

export type DesignBroadcast = {
  id: string
  design_id: string | null
  main_photo_url: string | null
  colour_chart_url: string | null
  caption: string | null
  created_at: string
}

export type PartyMaster = {
  id: string
  party_name: string
  created_at: string
}

export type MaintenanceRequest = {
  id: string
  machine_no: string
  priority: string
  problem: string | null
  item_needed: string | null
  photo_url: string | null
  assigned_to: string | null
  status: string
  cost: number
  created_at: string
  entry_date?: string | null
  maintenance_type?: string | null
  work_details?: string | null
  parts_used?: string | null
  next_maintenance_date?: string | null
  remarks?: string | null
  technician?: string | null
}

export type RepairingTracker = {
  id: string
  item_name: string
  for_what: string
  vendor: string | null
  gatepass_no: string
  date_out: string
  date_in: string | null
  status: string
  cost: number
  created_at: string
}

export type FoldingEntry = {
  id: string
  dno: string
  meter_folded: number
  rolls: number
  created_at: string
}

export type Challan = {
  id: string
  challan_no: string
  party: string
  meter: number
  rolls: number
  rate: number
  gst_pct: number
  total: number
  created_at: string
  program_id: string | null
  job_card_id: string | null
}

export type Gatepass = {
  id: string
  challan_id: string | null
  tempo_driver: string | null
  vehicle_no: string | null
  date: string
  gatepass_no: string | null
  driver_signed: boolean
  received_signed: boolean
  signed_by_driver: string | null
  signed_by_received: string | null
  created_at: string
}

export type PayrollRate = {
  id: string
  role_id: string
  rate_per_day: number
  created_at: string
}

export type ElectricityEntry = {
  id: string
  entry_date: string
  source: string
  unit_kwh: number
  rate_per_unit: number
  total: number
  created_at: string
}

export type CashBookEntryType = 'credit' | 'debit'

export const CASHBOOK_CATEGORIES = [
  'Deposit from Owner',
  'Machine Repair',
  'Tempo/Transport',
  'Beam Supplier',
  'Other',
] as const

export type CashBookCategory = (typeof CASHBOOK_CATEGORIES)[number]

export type CashBookEntry = {
  id: string
  entry_date: string
  entry_type: CashBookEntryType
  party_name: string
  contact_number: string | null
  category: CashBookCategory
  machine_number: string | null
  purpose_notes: string | null
  amount: number
  entered_by: string
  created_at: string
  edited_by: string | null
  edit_approved_by: string | null
  edit_approved_at: string | null
  /** Joined line items (optional) */
  items?: CashBookEntryItem[]
}

export type CashBookEntryItem = {
  id: string
  entry_id: string
  item_name: string
  amount: number
  created_at?: string
}

export type CashBookItemMaster = {
  id: string
  item_name: string
  created_at: string
}

export type WarpBeamPipe = {
  id: string
  entry_date: string
  jobber_name: string
  gp_number: string | null
  beam_number: string | null
  total_ends: number | null
  yarn_count_denier: string | null
  weight_kg: number | null
  pipe_out_qty: number
  pipe_in_qty: number
  rate: number | null
  remarks: string | null
  status: 'out' | 'returned'
  entered_by: string
  created_at: string
}

/** Re-export pipe lifecycle types from warpYarn module */
export type {
  WarpPipe,
  WarpYarnTransaction,
  WarpYarnPurchase,
  WarpWarperJob,
  WarpPipeStatus,
  WarpTxnType,
  WarperJobStatus,
} from './warpYarn'

export type YarnInward = {
  id: string
  yarn_type: 'warp' | 'weft'
  supplier_name: string
  item: string | null
  qty: number | null
  amount: number | null
  invoice_image_url: string | null
  entry_date: string
  entered_by: string
  created_at: string
}

export type MaintenanceMaterial = {
  id: string
  direction: 'out' | 'in'
  material_name: string
  purpose: string | null
  sent_to: string | null
  entry_date: string
  entered_by: string
  created_at: string
}

export type GatePassRecord = {
  id: string
  ref_type: string
  ref_id: string | null
  gp_number: string
  generated_at: string
}

export type LoanEntry = {
  id: string
  party_name: string
  direction: 'given' | 'received'
  amount: number
  purpose: string | null
  entry_date: string
  entered_by: string
  created_at: string
}

export const LOAN_PARTY_DEFAULTS = ['Kiara Mills', 'Other'] as const

export type GebReading = {
  id: string
  reading_date: string
  meter_reading: number
  previous_reading: number
  unit_consumed: number
  rate_per_unit: number
  amount: number
  entered_by: string
  created_at: string
}

export const ORDER_TYPES = [
  'Maintenance Material',
  'Warp Yarn',
  'Weft Yarn',
  'Repair Call',
  'Other',
] as const

export type OrderType = (typeof ORDER_TYPES)[number]

export type AppOrder = {
  id: string
  order_type: OrderType
  detail: string | null
  raised_by: string
  order_date: string
  status: 'pending' | 'done'
  created_at: string
}

export type PendingApprovalRow = {
  id: string
  table_name: string
  record_id: string | null
  action: 'edit' | 'delete'
  requested_by: string
  requested_at: string
  new_data: Record<string, unknown> | null
  status: 'pending' | 'approved' | 'rejected'
  resolved_by: string | null
  resolved_at: string | null
}

/** Design Wise Costing header (design_costing) */
export type DesignCosting = {
  id: string
  din_number: string
  quality_name: string | null
  costing_date: string
  diary_image_url: string | null
  design_length_mtr: number | null
  pic_conversion_rate: number
  /** Calculated: total_pic × pic_conversion_rate */
  conversion_charge: number
  mu_percent: number
  gst_percent: number
  /** GST ₹ amount (after MU × GST %) — stored separately from final cost */
  gst_amount: number | null
  total_pic: number | null
  total_warp_weight_kg: number | null
  total_weft_weight_kg: number | null
  total_warp_amount: number | null
  total_weft_amount: number | null
  total_weight_kg: number | null
  total_yarn_amount: number | null
  yarn_cost_per_mtr: number | null
  subtotal_per_mtr: number | null
  after_mu_per_mtr: number | null
  final_cost_per_mtr: number | null
  status: 'draft' | 'final'
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string | null
}

export type DesignCostingWarp = {
  id: string
  costing_id: string
  sr_no: number
  yarn_name: string | null
  denier: number | null
  tar_ends: number | null
  length_mtr: number | null
  weight_kg: number | null
  rate_per_kg: number | null
  amount: number | null
}

export type DesignCostingWeft = {
  id: string
  costing_id: string
  sr_no: number
  weft_name: string | null
  denier: number | null
  pic: number | null
  width: number | null
  length_mtr: number | null
  weight_kg: number | null
  rate_per_kg: number | null
  amount: number | null
}

/** assumed: 6 looms labelled M1–M6 */
export const MACHINES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] as const

/** assumed: weft low-stock alert threshold = 50 kg (configurable) */
export const WEFT_LOW_STOCK_KG = 50
