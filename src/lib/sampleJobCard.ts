import { supabase } from './supabase'

export type SampleColourPair = {
  key: string
  colour_name: string
  colour_number: string
}

export type SampleMatchingDraft = {
  key: string
  matching_no: number
  colours: SampleColourPair[]
}

export type SampleJobCardRow = {
  id: string
  din_number: string
  design_image_url: string | null
  job_date: string
  machine_no: string | null
  work_quality: string | null
  status: string
  done_date: string | null
  created_by: string | null
  created_at: string
}

export type SampleMatchingRow = {
  id: string
  job_card_id: string
  matching_no: number
  sample_matching_colours?: SampleColourRow[]
}

export type SampleColourRow = {
  id: string
  matching_id: string
  colour_name: string
  colour_number: string
  sort_order: number | null
}

export type IssuedCardData = {
  id?: string
  din_number: string
  design_image_url: string | null
  job_date: string
  machine_no: string
  work_quality: string
  status: string
  done_date?: string | null
  issued_by?: string
  matchings: Array<{
    matching_no: number
    colours: Array<{ colour_name: string; colour_number: string }>
  }>
}

const COLOUR_HEX: Record<string, string> = {
  red: '#c62828',
  green: '#2e7d32',
  yellow: '#f9a825',
  blue: '#1565c0',
  black: '#212121',
  white: '#f5f5f5',
  orange: '#ef6c00',
  purple: '#6a1b9a',
  pink: '#c2185b',
  brown: '#6d4c41',
  grey: '#757575',
  gray: '#757575',
  maroon: '#880e4f',
  navy: '#0d47a1',
  cream: '#f5e6c8',
  beige: '#d7ccc8',
  gold: '#d9a441',
  silver: '#9e9e9e',
  teal: '#00897b',
  cyan: '#00acc1',
  violet: '#7b1fa2',
  olive: '#827717',
}

/** Map common colour names to hex; unrecognized names (e.g. HSV) → grey. */
export function colourSwatchHex(name: string): string {
  const key = name.trim().toLowerCase()
  if (!key) return '#9096a1'
  if (COLOUR_HEX[key]) return COLOUR_HEX[key]
  for (const [k, hex] of Object.entries(COLOUR_HEX)) {
    if (key.includes(k)) return hex
  }
  return '#9096a1'
}

export function newColourPair(): SampleColourPair {
  return { key: crypto.randomUUID(), colour_name: '', colour_number: '' }
}

export function newMatching(no: number): SampleMatchingDraft {
  return { key: crypto.randomUUID(), matching_no: no, colours: [newColourPair()] }
}

export async function previewNextDin(): Promise<string> {
  const { data, error } = await supabase
    .from('sample_job_cards')
    .select('din_number')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  let max = 1000
  for (const row of data ?? []) {
    const m = String(row.din_number || '').match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `DIN-${max + 1}`
}

export async function uploadSampleDesign(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('sample-designs').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('sample-designs').getPublicUrl(path)
  return data.publicUrl
}

export async function saveSampleJobCard(args: {
  existingId?: string | null
  design_image_url: string | null
  job_date: string
  machine_no: string
  work_quality: string
  created_by?: string | null
  matchings: SampleMatchingDraft[]
}): Promise<IssuedCardData> {
  const { existingId, matchings, ...header } = args

  let cardId = existingId || null
  let din_number = ''

  if (cardId) {
    const { data, error } = await supabase
      .from('sample_job_cards')
      .update({
        design_image_url: header.design_image_url,
        job_date: header.job_date,
        machine_no: header.machine_no || null,
        work_quality: header.work_quality || null,
      })
      .eq('id', cardId)
      .select('id, din_number')
      .single()
    if (error) throw error
    din_number = data.din_number
    await supabase.from('sample_matchings').delete().eq('job_card_id', cardId)
  } else {
    const { data, error } = await supabase
      .from('sample_job_cards')
      .insert({
        design_image_url: header.design_image_url,
        job_date: header.job_date,
        machine_no: header.machine_no || null,
        work_quality: header.work_quality || null,
        status: 'pending',
        created_by: header.created_by || null,
      })
      .select('id, din_number')
      .single()
    if (error) throw error
    cardId = data.id
    din_number = data.din_number
  }

  const savedMatchings: IssuedCardData['matchings'] = []

  for (const [idx, m] of matchings.entries()) {
    const colours = m.colours.filter((c) => c.colour_name.trim() || c.colour_number.trim())
    if (!colours.length) continue

    const { data: matching, error: mErr } = await supabase
      .from('sample_matchings')
      .insert({
        job_card_id: cardId,
        matching_no: idx + 1,
      })
      .select('id, matching_no')
      .single()
    if (mErr) throw mErr

    const colourRows = colours.map((c, sort_order) => ({
      matching_id: matching.id,
      colour_name: c.colour_name.trim() || '—',
      colour_number: c.colour_number.trim() || '—',
      sort_order,
    }))
    const { error: cErr } = await supabase.from('sample_matching_colours').insert(colourRows)
    if (cErr) throw cErr

    savedMatchings.push({
      matching_no: matching.matching_no,
      colours: colourRows.map((c) => ({
        colour_name: c.colour_name,
        colour_number: c.colour_number,
      })),
    })
  }

  return {
    id: cardId!,
    din_number,
    design_image_url: header.design_image_url,
    job_date: header.job_date,
    machine_no: header.machine_no,
    work_quality: header.work_quality,
    status: 'pending',
    matchings: savedMatchings,
  }
}

export async function fetchSampleRegister() {
  const { data, error } = await supabase
    .from('sample_job_cards')
    .select(
      `
      id, din_number, design_image_url, job_date, machine_no, work_quality, status, done_date, created_at,
      sample_matchings (
        id, matching_no,
        sample_matching_colours ( id, colour_name, colour_number, sort_order )
      )
    `,
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function markSampleDone(id: string) {
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('sample_job_cards')
    .update({ status: 'done', done_date: today })
    .eq('id', id)
  if (error) throw error
  return today
}

export function whatsappSampleMessage(card: IssuedCardData): string {
  const lines = [
    `Sample Job Card ${card.din_number}`,
    `Date: ${card.job_date}`,
    `Machine: ${card.machine_no || '—'}`,
    `Work/Quality: ${card.work_quality || '—'}`,
    `Matchings: ${card.matchings.length}`,
  ]
  if (card.design_image_url) lines.push(`Design: ${card.design_image_url}`)
  return lines.join('\n')
}
