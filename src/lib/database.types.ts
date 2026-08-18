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
  matching_image_url: string
  notes: string | null
  created_at: string
  created_by: string | null
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

/** assumed: 6 looms labelled M1–M6 */
export const MACHINES = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'] as const

/** assumed: weft low-stock alert threshold = 50 kg (configurable) */
export const WEFT_LOW_STOCK_KG = 50
