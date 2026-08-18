import { supabase } from './supabase'
import type { CrmCustomer } from './database.types'

/** Normalize to E.164-ish: keep leading +, digits only after. Default India +91 if 10 digits. */
export function normalizeWhatsApp(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) digits = `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.slice(1)}`
  }
  return `+${digits}`
}

/** Digits only for wa.me links */
export function whatsappDigits(raw: string): string {
  return normalizeWhatsApp(raw).replace(/\D/g, '')
}

export async function fetchCrmCustomers(): Promise<CrmCustomer[]> {
  const { data, error } = await supabase
    .from('crm_customers')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw error
  return (data as CrmCustomer[]) ?? []
}

export async function insertCrmCustomer(row: {
  name: string
  whatsapp_number: string
  notes?: string | null
}): Promise<void> {
  const payload = {
    name: row.name.trim(),
    whatsapp_number: normalizeWhatsApp(row.whatsapp_number),
    source: 'jaisal_manual' as const,
    notes: row.notes?.trim() || null,
  }
  if (!payload.name) throw new Error('Name is required')
  if (!payload.whatsapp_number) throw new Error('WhatsApp number is required')
  const { error } = await supabase.from('crm_customers').insert(payload)
  if (error) throw error
}

export async function updateCrmCustomer(
  id: string,
  row: { name: string; whatsapp_number: string; notes?: string | null },
): Promise<void> {
  const payload = {
    name: row.name.trim(),
    whatsapp_number: normalizeWhatsApp(row.whatsapp_number),
    notes: row.notes?.trim() || null,
  }
  if (!payload.name) throw new Error('Name is required')
  if (!payload.whatsapp_number) throw new Error('WhatsApp number is required')
  const { error } = await supabase.from('crm_customers').update(payload).eq('id', id)
  if (error) throw error
}

export async function deleteCrmCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('crm_customers').delete().eq('id', id)
  if (error) throw error
}

export type KmosSyncResult = {
  inserted: number
  updated: number
  skipped_no_phone: number
  skipped_manual_conflict: number
  total_kmos: number
  mapped_name_field: string | null
  mapped_phone_field: string | null
  columns_seen?: string[]
  error?: string
}

export async function syncCrmFromKmos(): Promise<KmosSyncResult> {
  const { data, error } = await supabase.functions.invoke('crm-sync-kmos', { body: {} })
  if (error) {
    let bodyError = (data as { error?: string } | null)?.error
    // Non-2xx often leaves data null; try to read JSON from the FunctionsHttpError context.
    if (!bodyError && error && typeof error === 'object' && 'context' in error) {
      try {
        const ctx = (error as { context?: Response }).context
        if (ctx && typeof ctx.json === 'function') {
          const body = (await ctx.json()) as { error?: string }
          bodyError = body?.error
        }
      } catch {
        /* ignore parse errors */
      }
    }
    throw new Error(bodyError || error.message || 'KMOS sync failed')
  }
  if (data?.error) throw new Error(String(data.error))
  return data as KmosSyncResult
}

export function exportCustomersCsv(
  customers: CrmCustomer[],
  caption?: string,
): string {
  const header = ['name', 'whatsapp_number', 'source', 'notes', 'caption']
  const lines = [header.join(',')]
  for (const c of customers) {
    const cells = [
      c.name,
      c.whatsapp_number,
      c.source,
      c.notes || '',
      caption || '',
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`)
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
