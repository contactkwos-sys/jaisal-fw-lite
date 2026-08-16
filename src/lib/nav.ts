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

export type PurchaseSub = 'weft' | 'beam_out' | 'beam_in' | 'warp'
export type ProductionSub = 'job' | 'entry' | 'report'
export type MaintenanceSub = 'request' | 'repair'
export type DispatchSub = 'folding' | 'challan' | 'gatepass'
export type AdminSub = 'roles' | 'payroll' | 'approvals'
export type CostingSub = 'summary' | 'electricity'

export type NavTarget = {
  screen: AppScreen
  sub?: string
  filter?: string
}
