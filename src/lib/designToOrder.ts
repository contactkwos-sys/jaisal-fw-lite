/** Design to Order — DIN hub linking costing, samples, and orders */

import { supabase } from './supabase'
import { todayISO } from './mutate'

export const DIN_STATUSES = [
  'DIN Received',
  'Costing Pending',
  'Costing Done',
  'Sample Pending',
  'Sampling',
  'Sample Received',
  'Approved',
  'Order Pending',
  'Order Booked',
  'In Production',
  'Dispatched',
  'Closed',
] as const

export type DinStatus = (typeof DIN_STATUSES)[number]

export const MATCHING_STATUSES = [
  'Pending',
  'Sample Produced',
  'Sample Received',
  'Approved',
  'Rejected',
] as const

export type MatchingStatus = (typeof MATCHING_STATUSES)[number]

export const DIN_INTAKE_EMAIL = 'jaisalind2@gmail.com'

export type DinRow = {
  id: string
  din_number: string
  received_date: string
  design_name: string | null
  party_name: string | null
  din_image_url: string | null
  common_warp: string | null
  remarks: string | null
  status: string
  matching_count: number
  costing_id: string | null
  costing_status: string
  costing_date: string | null
  costing_version: number
  base_cost_per_mtr: number | null
  gst_percent: number | null
  gst_amount: number | null
  final_cost_per_mtr: number | null
  source: string
  source_email: string | null
  source_email_from: string | null
  gmail_message_id: string | null
  gmail_attachment_id: string | null
  gmail_import_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DinMatching = {
  id: string
  din_id: string
  matching_no: number
  ground_colour: string | null
  weft_1: string | null
  weft_2: string | null
  weft_3: string | null
  weft_4: string | null
  common_warp: string | null
  remarks: string | null
  status: string
  sample_photo_url: string | null
  approved_photo_url: string | null
  sample_produced_at: string | null
  sample_received_date: string | null
  sample_received_by: string | null
  actual_meter: number | null
  created_at: string
}

export type DinMatchingDraft = {
  key: string
  matching_no: number
  ground_colour: string
  weft_1: string
  weft_2: string
  weft_3: string
  weft_4: string
  common_warp: string
  remarks: string
}

export type DinSampleCard = {
  id: string
  din_id: string
  sample_job_card_id: string | null
  card_no: string
  matching_nos: number[]
  machine_no: string | null
  job_date: string
  shift: string | null
  operator_name: string | null
  supervisor_name: string | null
  warp: string | null
  weft_colours: string | null
  required_meter: number | null
  remarks: string | null
  status: string
  created_by: string | null
  created_at: string
}

export type DinFollowup = {
  id: string
  din_id: string | null
  din_number: string | null
  party_name: string | null
  followup_date: string
  reminder_note: string | null
  status: string
  created_by: string | null
  created_at: string
  resolved_at: string | null
}

export type GmailConnection = {
  id: string
  user_id: string
  email: string
  status: string
  connected_at: string | null
  updated_at: string
}

export type DinWithMatchings = DinRow & { din_matchings?: DinMatching[] }

export function emptyMatchingDraft(no: number): DinMatchingDraft {
  return {
    key: crypto.randomUUID(),
    matching_no: no,
    ground_colour: '',
    weft_1: '',
    weft_2: '',
    weft_3: '',
    weft_4: '',
    common_warp: '',
    remarks: '',
  }
}

export function matchingColourLabel(m: Pick<DinMatching, 'ground_colour' | 'weft_1' | 'weft_2' | 'weft_3' | 'weft_4'>): string {
  return [m.ground_colour, m.weft_1, m.weft_2, m.weft_3, m.weft_4].filter(Boolean).join(' / ') || '—'
}

/** Next DIN-YYYY-NNN from existing dins + sample_job_cards + design_costing. */
export async function previewNextDinNumber(year = new Date().getFullYear()): Promise<string> {
  const prefix = `DIN-${year}-`
  const [{ data: dins }, { data: samples }, { data: costings }] = await Promise.all([
    supabase.from('dins').select('din_number').ilike('din_number', `${prefix}%`).limit(500),
    supabase.from('sample_job_cards').select('din_number').ilike('din_number', `${prefix}%`).limit(200),
    supabase.from('design_costing').select('din_number').ilike('din_number', `${prefix}%`).limit(200),
  ])
  let max = 0
  for (const row of [...(dins ?? []), ...(samples ?? []), ...(costings ?? [])]) {
    const m = String(row.din_number || '').match(/DIN-\d{4}-(\d+)$/i)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

export async function uploadDinImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('din-images').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) {
    // Fallback to sample-designs if din-images bucket not yet migrated
    const { error: e2 } = await supabase.storage.from('sample-designs').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    })
    if (e2) throw e2
    const { data } = supabase.storage.from('sample-designs').getPublicUrl(path)
    return data.publicUrl
  }
  const { data } = supabase.storage.from('din-images').getPublicUrl(path)
  return data.publicUrl
}

export async function fetchDins(limit = 100): Promise<DinWithMatchings[]> {
  const { data, error } = await supabase
    .from('dins')
    .select('*, din_matchings(*)')
    .order('received_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as DinWithMatchings[]) ?? []
}

export async function fetchDinById(id: string): Promise<DinWithMatchings | null> {
  const { data, error } = await supabase
    .from('dins')
    .select('*, din_matchings(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as DinWithMatchings | null
}

export async function fetchDinByNumber(dinNumber: string): Promise<DinWithMatchings | null> {
  const { data, error } = await supabase
    .from('dins')
    .select('*, din_matchings(*)')
    .eq('din_number', dinNumber)
    .maybeSingle()
  if (error) throw error
  return data as DinWithMatchings | null
}

export async function createDin(input: {
  din_number?: string
  received_date?: string
  design_name?: string
  party_name?: string
  din_image_url?: string | null
  common_warp?: string
  remarks?: string
  source?: string
  source_email?: string
  source_email_from?: string
  gmail_message_id?: string
  gmail_attachment_id?: string
  gmail_import_id?: string
  created_by?: string | null
  matchings?: DinMatchingDraft[]
}): Promise<DinWithMatchings> {
  const din_number = input.din_number || (await previewNextDinNumber())
  const { data, error } = await supabase
    .from('dins')
    .insert({
      din_number,
      received_date: input.received_date || todayISO(),
      design_name: input.design_name || null,
      party_name: input.party_name || null,
      din_image_url: input.din_image_url || null,
      common_warp: input.common_warp || null,
      remarks: input.remarks || null,
      status: 'DIN Received',
      costing_status: 'Pending',
      source: input.source || 'upload',
      source_email: input.source_email || null,
      source_email_from: input.source_email_from || null,
      gmail_message_id: input.gmail_message_id || null,
      gmail_attachment_id: input.gmail_attachment_id || null,
      gmail_import_id: input.gmail_import_id || null,
      matching_count: input.matchings?.length || 0,
      created_by: input.created_by || null,
    })
    .select('*')
    .single()
  if (error) throw error

  const din = data as DinRow
  if (input.matchings?.length) {
    const rows = input.matchings.map((m, i) => ({
      din_id: din.id,
      matching_no: i + 1,
      ground_colour: m.ground_colour.trim() || null,
      weft_1: m.weft_1.trim() || null,
      weft_2: m.weft_2.trim() || null,
      weft_3: m.weft_3.trim() || null,
      weft_4: m.weft_4.trim() || null,
      common_warp: m.common_warp.trim() || input.common_warp || null,
      remarks: m.remarks.trim() || null,
      status: 'Pending',
    }))
    const { error: mErr } = await supabase.from('din_matchings').insert(rows)
    if (mErr) throw mErr
  }

  const full = await fetchDinById(din.id)
  return full || { ...din, din_matchings: [] }
}

export async function updateDin(
  id: string,
  patch: Partial<
    Pick<
      DinRow,
      | 'design_name'
      | 'party_name'
      | 'din_image_url'
      | 'common_warp'
      | 'remarks'
      | 'status'
      | 'matching_count'
      | 'costing_id'
      | 'costing_status'
      | 'costing_date'
      | 'costing_version'
      | 'base_cost_per_mtr'
      | 'gst_percent'
      | 'gst_amount'
      | 'final_cost_per_mtr'
    >
  >,
): Promise<void> {
  const { error } = await supabase
    .from('dins')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function upsertDinMatchings(dinId: string, matchings: DinMatchingDraft[]): Promise<void> {
  await supabase.from('din_matchings').delete().eq('din_id', dinId)
  if (!matchings.length) {
    await updateDin(dinId, { matching_count: 0 })
    return
  }
  const rows = matchings.map((m, i) => ({
    din_id: dinId,
    matching_no: i + 1,
    ground_colour: m.ground_colour.trim() || null,
    weft_1: m.weft_1.trim() || null,
    weft_2: m.weft_2.trim() || null,
    weft_3: m.weft_3.trim() || null,
    weft_4: m.weft_4.trim() || null,
    common_warp: m.common_warp.trim() || null,
    remarks: m.remarks.trim() || null,
    status: 'Pending',
  }))
  const { error } = await supabase.from('din_matchings').insert(rows)
  if (error) throw error
  await updateDin(dinId, { matching_count: rows.length })
}

export async function updateMatching(
  id: string,
  patch: Partial<
    Pick<
      DinMatching,
      | 'status'
      | 'sample_photo_url'
      | 'approved_photo_url'
      | 'sample_produced_at'
      | 'sample_received_date'
      | 'sample_received_by'
      | 'actual_meter'
      | 'remarks'
      | 'ground_colour'
      | 'weft_1'
      | 'weft_2'
      | 'weft_3'
      | 'weft_4'
      | 'common_warp'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('din_matchings').update(patch).eq('id', id)
  if (error) throw error
}

export async function syncDinCostingFromLatest(dinNumber: string): Promise<void> {
  const { data: costing } = await supabase
    .from('design_costing')
    .select(
      'id, costing_date, after_mu_per_mtr, gst_percent, gst_amount, final_cost_per_mtr, ceo_final_selling_rate, status, created_at',
    )
    .eq('din_number', dinNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: din } = await supabase.from('dins').select('id, costing_version').eq('din_number', dinNumber).maybeSingle()
  if (!din) return

  if (!costing) {
    await updateDin(din.id, { costing_status: 'Pending' })
    return
  }

  const completed = costing.status === 'final' || costing.final_cost_per_mtr != null
  await updateDin(din.id, {
    costing_id: costing.id,
    costing_status: completed ? 'Completed' : 'Draft',
    costing_date: costing.costing_date,
    costing_version: Number(din.costing_version || 0) + 1,
    base_cost_per_mtr: costing.after_mu_per_mtr != null ? Number(costing.after_mu_per_mtr) : null,
    gst_percent: costing.gst_percent != null ? Number(costing.gst_percent) : null,
    gst_amount: costing.gst_amount != null ? Number(costing.gst_amount) : null,
    final_cost_per_mtr:
      costing.ceo_final_selling_rate != null
        ? Number(costing.ceo_final_selling_rate)
        : costing.final_cost_per_mtr != null
          ? Number(costing.final_cost_per_mtr)
          : null,
    status: completed ? 'Costing Done' : 'Costing Pending',
  })
}

export async function nextSampleCardNo(): Promise<string> {
  const { data } = await supabase
    .from('din_sample_cards')
    .select('card_no')
    .order('created_at', { ascending: false })
    .limit(50)
  let max = 1000
  for (const row of data ?? []) {
    const m = String(row.card_no || '').match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `SJC-${max + 1}`
}

export async function createDinSampleCard(input: {
  din_id: string
  din_number: string
  matching_nos: number[]
  machine_no: string
  job_date: string
  shift?: string
  operator_name?: string
  supervisor_name?: string
  warp?: string
  weft_colours?: string
  required_meter?: number
  remarks?: string
  design_image_url?: string | null
  created_by?: string | null
}): Promise<DinSampleCard> {
  const card_no = await nextSampleCardNo()

  // Also create/link a sample_job_cards row so Sample Register stays in sync
  const sjcPayloadFull = {
    din_number: input.din_number,
    din_id: input.din_id,
    design_image_url: input.design_image_url || null,
    job_date: input.job_date,
    machine_no: input.machine_no,
    work_quality: input.weft_colours || null,
    shift: input.shift || null,
    operator_name: input.operator_name || null,
    supervisor_name: input.supervisor_name || null,
    required_meter: input.required_meter ?? null,
    remarks: input.remarks || null,
    status: 'pending',
    created_by: input.created_by || null,
  }
  let sjc = (
    await supabase.from('sample_job_cards').insert(sjcPayloadFull).select('id').single()
  ).data
  if (!sjc) {
    const { data, error: sjcErr } = await supabase
      .from('sample_job_cards')
      .insert({
        din_number: input.din_number,
        design_image_url: input.design_image_url || null,
        job_date: input.job_date,
        machine_no: input.machine_no,
        work_quality: input.weft_colours || null,
        status: 'pending',
        created_by: input.created_by || null,
      })
      .select('id')
      .single()
    if (sjcErr) throw sjcErr
    sjc = data
  }

  for (const [idx, no] of input.matching_nos.entries()) {
    await supabase.from('sample_matchings').insert({
      job_card_id: sjc.id,
      matching_no: no || idx + 1,
    })
  }

  const { data, error } = await supabase
    .from('din_sample_cards')
    .insert({
      din_id: input.din_id,
      sample_job_card_id: sjc.id,
      card_no,
      matching_nos: input.matching_nos,
      machine_no: input.machine_no,
      job_date: input.job_date,
      shift: input.shift || null,
      operator_name: input.operator_name || null,
      supervisor_name: input.supervisor_name || null,
      warp: input.warp || null,
      weft_colours: input.weft_colours || null,
      required_meter: input.required_meter ?? null,
      remarks: input.remarks || null,
      status: 'Issued',
      created_by: input.created_by || null,
    })
    .select('*')
    .single()
  if (error) throw error

  await updateDin(input.din_id, { status: 'Sampling' })
  return data as DinSampleCard
}

export async function fetchDinSampleCards(dinId?: string): Promise<DinSampleCard[]> {
  let q = supabase.from('din_sample_cards').select('*').order('created_at', { ascending: false }).limit(200)
  if (dinId) q = q.eq('din_id', dinId)
  const { data, error } = await q
  if (error) throw error
  return (data as DinSampleCard[]) ?? []
}

export async function fetchWarpYarnOptions(): Promise<string[]> {
  const [{ data: pipes }, { data: purchases }] = await Promise.all([
    supabase.from('warp_pipes').select('yarn_quality').not('yarn_quality', 'is', null).limit(300),
    supabase.from('warp_yarn_purchases').select('yarn_quality').not('yarn_quality', 'is', null).limit(200),
  ])
  const set = new Set<string>()
  for (const p of pipes ?? []) if (p.yarn_quality) set.add(String(p.yarn_quality).trim())
  for (const p of purchases ?? []) if (p.yarn_quality) set.add(String(p.yarn_quality).trim())
  // Helpful defaults when master is empty — still allow Other
  if (!set.size) {
    ;['150 Roto Black & White', '150 Roto Bright', '150 Roto Black', '150 Roto B&W'].forEach((x) => set.add(x))
  }
  return [...set].filter(Boolean).sort((a, b) => a.localeCompare(b))
}

export async function getGmailConnection(userId: string): Promise<GmailConnection | null> {
  const { data, error } = await supabase
    .from('gmail_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('email', DIN_INTAKE_EMAIL)
    .maybeSingle()
  if (error) throw error
  return data as GmailConnection | null
}

/** Marks connect intent — real Gmail OAuth is not configured in this project. */
export async function setGmailConnectionStatus(
  userId: string,
  status: 'disconnected' | 'pending' | 'connected',
): Promise<GmailConnection> {
  const payload = {
    user_id: userId,
    email: DIN_INTAKE_EMAIL,
    status,
    connected_at: status === 'connected' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('gmail_connections')
    .upsert(payload, { onConflict: 'user_id,email' })
    .select('*')
    .single()
  if (error) throw error
  return data as GmailConnection
}

export async function fetchFollowups(): Promise<DinFollowup[]> {
  const { data, error } = await supabase
    .from('din_followups')
    .select('*')
    .order('followup_date', { ascending: true })
    .limit(200)
  if (error) throw error
  return (data as DinFollowup[]) ?? []
}

export async function createFollowup(input: {
  din_id?: string | null
  din_number?: string
  party_name?: string
  followup_date: string
  reminder_note?: string
  created_by?: string | null
}): Promise<void> {
  const { error } = await supabase.from('din_followups').insert({
    din_id: input.din_id || null,
    din_number: input.din_number || null,
    party_name: input.party_name || null,
    followup_date: input.followup_date,
    reminder_note: input.reminder_note || null,
    status: 'open',
    created_by: input.created_by || null,
  })
  if (error) throw error
}

export async function resolveFollowup(id: string): Promise<void> {
  const { error } = await supabase
    .from('din_followups')
    .update({ status: 'done', resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function fetchDtoStats() {
  const { data: dins } = await supabase.from('dins').select('id, status, final_cost_per_mtr')
  const list = dins ?? []
  const active = list.filter((d) => !['Closed', 'Dispatched'].includes(d.status)).length
  const sampling = list.filter((d) => ['Sampling', 'Sample Pending', 'Sample Received'].includes(d.status)).length
  const { count: approved } = await supabase
    .from('din_matchings')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'Approved')
  const { data: orders } = await supabase
    .from('order_book')
    .select('id, order_book_items(amount, qty_meter, settled)')
    .limit(300)
  let pendingOrders = 0
  let totalValue = 0
  for (const o of orders ?? []) {
    const items = (o as { order_book_items?: Array<{ amount: number; settled: boolean }> }).order_book_items || []
    for (const it of items) {
      totalValue += Number(it.amount || 0)
      if (!it.settled) pendingOrders += 1
    }
  }
  const { data: challans } = await supabase
    .from('challans')
    .select('meter')
    .gte('created_at', `${new Date().getFullYear()}-01-01`)
  const dispatched = (challans ?? []).reduce((s, c) => s + Number(c.meter || 0), 0)
  return {
    activeDins: active,
    sampleUnderDev: sampling,
    approvedMatches: approved ?? 0,
    pendingOrders,
    totalOrderValue: totalValue,
    dispatchedMt: dispatched,
  }
}

export function fmtInrIn(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function whatsappDinPromoMessage(args: {
  din_number: string
  design_name?: string | null
  matching_no?: number
  colours?: string
  imageUrl?: string | null
  rate?: number | null
}): string {
  const lines = [
    `JAISAL FW – Fashionweave Industries`,
    `DIN: ${args.din_number}`,
    args.design_name ? `Design: ${args.design_name}` : null,
    args.matching_no != null ? `Matching: ${args.matching_no}` : null,
    args.colours ? `Colours: ${args.colours}` : null,
    args.rate != null ? `Rate: ${fmtInrIn(args.rate)} / Mtr` : null,
    args.imageUrl ? `Photo: ${args.imageUrl}` : null,
  ]
  return lines.filter(Boolean).join('\n')
}
