/** DIN Costing Formula Master — fixed parameters (CEO/Admin editable) */

import { supabase } from './supabase'

export type FormulaMasterConfig = {
  id: string
  calc_factor: number
  default_base_length_mtr: number
  default_wastage_mtr: number
  default_wastage_percent: number
  default_usable_length_mtr: number
  updated_by: string | null
  updated_at: string | null
}

export const FORMULA_DEFAULTS: Omit<FormulaMasterConfig, 'id' | 'updated_by' | 'updated_at'> = {
  calc_factor: 9_000_000,
  default_base_length_mtr: 110,
  default_wastage_mtr: 10,
  default_wastage_percent: 10,
  default_usable_length_mtr: 100,
}

export async function fetchFormulaMaster(): Promise<FormulaMasterConfig> {
  const { data, error } = await supabase.from('din_formula_master').select('*').limit(1).maybeSingle()
  if (error) throw error
  if (!data) return { id: '', ...FORMULA_DEFAULTS, updated_by: null, updated_at: null }
  return {
    id: data.id,
    calc_factor: Number(data.calc_factor ?? FORMULA_DEFAULTS.calc_factor),
    default_base_length_mtr: Number(data.default_base_length_mtr ?? FORMULA_DEFAULTS.default_base_length_mtr),
    default_wastage_mtr: Number(data.default_wastage_mtr ?? FORMULA_DEFAULTS.default_wastage_mtr),
    default_wastage_percent: Number(data.default_wastage_percent ?? FORMULA_DEFAULTS.default_wastage_percent),
    default_usable_length_mtr: Number(data.default_usable_length_mtr ?? FORMULA_DEFAULTS.default_usable_length_mtr),
    updated_by: data.updated_by,
    updated_at: data.updated_at,
  }
}

export async function updateFormulaMaster(
  patch: Partial<Omit<FormulaMasterConfig, 'id' | 'updated_by' | 'updated_at'>>,
  userId: string | null,
): Promise<void> {
  const current = await fetchFormulaMaster()
  const payload = {
    calc_factor: patch.calc_factor ?? current.calc_factor,
    default_base_length_mtr: patch.default_base_length_mtr ?? current.default_base_length_mtr,
    default_wastage_mtr: patch.default_wastage_mtr ?? current.default_wastage_mtr,
    default_wastage_percent: patch.default_wastage_percent ?? current.default_wastage_percent,
    default_usable_length_mtr: patch.default_usable_length_mtr ?? current.default_usable_length_mtr,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }
  if (current.id) {
    const { error } = await supabase.from('din_formula_master').update(payload).eq('id', current.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('din_formula_master').insert(payload)
    if (error) throw error
  }
}
