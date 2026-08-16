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
  warp_rate: number
  weft_rate: number
  selling_rate: number
  conversion_charge: number
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
