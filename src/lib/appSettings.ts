import { supabase } from './supabase'

export async function getSetting(key: string, fallback = ''): Promise<string> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error) throw error
  return data?.value ?? fallback
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
