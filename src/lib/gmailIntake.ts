/** Client helpers for Gmail DESIGN Intake (server-side OAuth via edge function). */

import { DIN_INTAKE_EMAIL } from './designToOrder'
import { supabase } from './supabase'

export type GmailStatus = {
  configured: boolean
  intakeEmail: string
  connected: boolean
  connectedEmail: string | null
  accountMatch: boolean | null
  connectedAt: string | null
  senders: Array<{ id: string; name: string; email: string | null }>
}

export type GmailEmailRow = {
  messageId: string
  attachmentId: string
  senderName: string
  senderEmail: string
  subject: string
  receivedAt: string
  attachmentFilename: string
  attachmentMime: string
  attachmentSize: number
  imported: boolean
  dinId: string | null
}

export type GmailImportResult = {
  alreadyImported: boolean
  importId: string
  imageUrl: string
  senderEmail: string
  senderName: string
  subject?: string
  receivedAt: string
  attachmentFilename: string
  messageId?: string
  attachmentId?: string
  dinId?: string | null
  dinNumber?: string | null
}

export type ApprovedSender = {
  id: string
  name: string
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gmail-intake', { body })
  if (error) throw new Error(error.message || 'Gmail request failed')
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

export async function getGmailAuthUrl(): Promise<string> {
  const data = await invoke<{ authUrl: string }>({ action: 'get-auth-url' })
  return data.authUrl
}

export async function fetchGmailStatus(): Promise<GmailStatus> {
  return invoke<GmailStatus>({ action: 'status' })
}

export async function disconnectGmail(): Promise<void> {
  await invoke({ action: 'disconnect' })
}

export async function listGmailDesignEmails(filters: {
  search?: string
  senderEmail?: string
  dateFrom?: string
  dateTo?: string
  jpgOnly?: boolean
}): Promise<{ emails: GmailEmailRow[]; warning?: string }> {
  return invoke({ action: 'list-emails', ...filters })
}

export async function importGmailAttachment(
  messageId: string,
  attachmentId: string,
): Promise<GmailImportResult> {
  return invoke<GmailImportResult>({ action: 'import-attachment', messageId, attachmentId })
}

export async function fetchApprovedSenders(): Promise<ApprovedSender[]> {
  const { data, error } = await supabase
    .from('gmail_approved_senders')
    .select('*')
    .order('name')
  if (error) throw error
  return (data as ApprovedSender[]) ?? []
}

export async function upsertApprovedSender(input: {
  id?: string
  name: string
  email: string
  is_active: boolean
  created_by?: string | null
}): Promise<ApprovedSender> {
  const email = input.email.trim().toLowerCase()
  const payload = {
    name: input.name.trim(),
    email: email || null,
    is_active: input.is_active,
    updated_at: new Date().toISOString(),
    ...(input.created_by ? { created_by: input.created_by } : {}),
  }
  if (input.id) {
    const { data, error } = await supabase
      .from('gmail_approved_senders')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single()
    if (error) throw error
    return data as ApprovedSender
  }
  const { data, error } = await supabase
    .from('gmail_approved_senders')
    .insert({ ...payload, created_by: input.created_by || null })
    .select('*')
    .single()
  if (error) throw error
  return data as ApprovedSender
}

export async function linkGmailImportToDin(importId: string, dinId: string): Promise<void> {
  const { error: importErr } = await supabase
    .from('gmail_design_imports')
    .update({ din_id: dinId })
    .eq('id', importId)
  if (importErr) throw importErr

  const { data: imp } = await supabase
    .from('gmail_design_imports')
    .select('gmail_message_id, gmail_attachment_id')
    .eq('id', importId)
    .maybeSingle()

  if (imp) {
    await supabase
      .from('dins')
      .update({
        gmail_import_id: importId,
        gmail_message_id: imp.gmail_message_id,
        gmail_attachment_id: imp.gmail_attachment_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dinId)
  }
}

export { DIN_INTAKE_EMAIL }
