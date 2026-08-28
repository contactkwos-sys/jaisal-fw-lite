/**
 * Machine-wise Production — matching-wise weft KG from DIN Costing engine.
 * Reuses weftWeightKg / round2 from designWiseCosting (same ÷ 9_000_000 formula).
 */

import type { DesignCostingWeft, WeftYarnStock } from './database.types'
import { MACHINES } from './database.types'
import type { DinMatching, DinWithMatchings } from './designToOrder'
import { fetchDinByNumber, matchingColourLabel } from './designToOrder'
import { round2, weftWeightKg } from './designWiseCosting'
import { nextDocNo, todayISO } from './mutate'
import { insertLedgerEntry, nextYarnTxnNo } from './yarnStock'
import { supabase } from './supabase'

export { MACHINES }

export type IssueStatus = 'Pending' | 'Partially Issued' | 'Fully Issued'
export type ProgramStatusLabel = 'PENDING' | 'IN PROGRESS' | 'COMPLETED'
export type WeftRoleKind = 'main_ground' | 'jari' | 'contrast'

export type MatchingYarnLine = {
  key: string
  matching_no: number
  matching_id: string | null
  colour_name: string
  role_label: string
  role_kind: WeftRoleKind
  is_main_ground: boolean
  colour_hex: string
  required_kg: number
  issued_kg: number
  balance_kg: number
  status: IssueStatus
  denier: number | null
  pic: number | null
  width: number | null
  costing_weft_id: string | null
  yarn_stock_id: string | null
  sr_no: number
}

export type MatchingGroup = {
  matching_no: number
  matching_id: string | null
  badge: string
  colour_label: string
  lines: MatchingYarnLine[]
  total_required_kg: number
  total_issued_kg: number
  total_balance_kg: number
}

export type CostingWeftParams = {
  id: string
  weft_name: string
  denier: number
  pic: number
  width: number
  length_mtr: number
  weight_kg: number | null
}

const COLOUR_MAP: Array<{ re: RegExp; hex: string }> = [
  { re: /\b(gold|jari|zari|golden)\b/i, hex: '#C9A227' },
  { re: /\b(silver|sliver)\b/i, hex: '#A8A29E' },
  { re: /\b(maroon|wine)\b/i, hex: '#7F1D1D' },
  { re: /\b(red|rani|crimson)\b/i, hex: '#DC2626' },
  { re: /\b(orange|rust)\b/i, hex: '#EA580C' },
  { re: /\b(yellow|mustard|lemon)\b/i, hex: '#EAB308' },
  { re: /\b(green|mehendi|olive|pista)\b/i, hex: '#16A34A' },
  { re: /\b(teal|turquoise|cyan)\b/i, hex: '#0D9488' },
  { re: /\b(blue|navy|royal|indigo)\b/i, hex: '#2563EB' },
  { re: /\b(purple|violet|magenta|lavender)\b/i, hex: '#7C3AED' },
  { re: /\b(pink|rose|peach)\b/i, hex: '#DB2777' },
  { re: /\b(brown|beige|cream|khaki|coffee)\b/i, hex: '#92400E' },
  { re: /\b(black|kala)\b/i, hex: '#1F2937' },
  { re: /\b(white|off\s*white|ivory)\b/i, hex: '#F8FAFC' },
  { re: /\b(grey|gray)\b/i, hex: '#6B7280' },
]

export function colourHex(name: string): string {
  const s = String(name || '').trim()
  for (const { re, hex } of COLOUR_MAP) {
    if (re.test(s)) return hex
  }
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 55% 42%)`
}

export function matchingBadge(no: number): string {
  return `MATCHING ${String(no).padStart(2, '0')}`
}

export function issueLineStatus(required: number, issued: number): IssueStatus {
  if (issued <= 0.001) return 'Pending'
  if (issued + 0.001 >= required) return 'Fully Issued'
  return 'Partially Issued'
}

export function programStatusLabel(programMeter: number, produced: number): ProgramStatusLabel {
  if (produced <= 0.001) return 'PENDING'
  if (programMeter > 0 && produced + 0.001 >= programMeter) return 'COMPLETED'
  return 'IN PROGRESS'
}

function norm(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isJariName(name: string): boolean {
  return /\b(jari|zari|gold\s*jari|silver\s*jari)\b/i.test(name)
}

export function rolesForMatching(
  m: Pick<DinMatching, 'ground_colour' | 'weft_1' | 'weft_2' | 'weft_3' | 'weft_4'>,
): Array<{
  colour_name: string
  role_label: string
  role_kind: WeftRoleKind
  is_main_ground: boolean
  slot: number
}> {
  const out: Array<{
    colour_name: string
    role_label: string
    role_kind: WeftRoleKind
    is_main_ground: boolean
    slot: number
  }> = []
  const ground = (m.ground_colour || '').trim()
  if (ground) {
    out.push({
      colour_name: ground,
      role_label: 'Main Ground',
      role_kind: 'main_ground',
      is_main_ground: true,
      slot: 0,
    })
  }
  let contrastIdx = 0
  const wefts = [m.weft_1, m.weft_2, m.weft_3, m.weft_4]
  for (let i = 0; i < wefts.length; i++) {
    const c = (wefts[i] || '').trim()
    if (!c) continue
    if (isJariName(c)) {
      out.push({
        colour_name: c,
        role_label: 'Jari',
        role_kind: 'jari',
        is_main_ground: false,
        slot: i + 1,
      })
    } else {
      contrastIdx += 1
      out.push({
        colour_name: c,
        role_label: contrastIdx === 1 ? 'Contrast 1' : `Contrast ${contrastIdx}`,
        role_kind: 'contrast',
        is_main_ground: false,
        slot: i + 1,
      })
    }
  }
  return out
}

export function findCostingWeft(
  colour: string,
  role_kind: WeftRoleKind,
  wefts: CostingWeftParams[],
  usedIds: Set<string>,
): CostingWeftParams | null {
  const c = norm(colour)
  if (!c || !wefts.length) return null
  const unused = wefts.filter((w) => !usedIds.has(w.id))

  let hit = unused.find((w) => norm(w.weft_name) === c)
  if (hit) return hit

  hit = unused.find((w) => {
    const n = norm(w.weft_name)
    return n.includes(c) || c.includes(n)
  })
  if (hit) return hit

  if (role_kind === 'main_ground') {
    hit = unused.find((w) => /main|ground/i.test(w.weft_name))
    if (hit) return hit
  }
  if (role_kind === 'jari') {
    hit = unused.find((w) => /jari|zari|gold/i.test(w.weft_name))
    if (hit) return hit
  }
  return unused.find((w) => w.denier > 0 && w.pic > 0 && w.width > 0) || null
}

/** Same DIN Costing formula: (denier × pic × width × length_mtr) / 9_000_000 */
export function requiredWeftKgForMeters(
  params: Pick<CostingWeftParams, 'denier' | 'pic' | 'width' | 'length_mtr' | 'weight_kg'>,
  programMeter: number,
): number {
  const meters = Number(programMeter) || 0
  if (meters <= 0) return 0
  const denier = Number(params.denier) || 0
  const pic = Number(params.pic) || 0
  const width = Number(params.width) || 0
  if (denier > 0 && pic > 0 && width > 0) {
    return round2(weftWeightKg(denier, pic, width, meters))
  }
  const baseLen = Number(params.length_mtr) || 0
  const baseWt = Number(params.weight_kg) || 0
  if (baseLen > 0 && baseWt > 0) return round2((baseWt * meters) / baseLen)
  return 0
}

export function buildMatchingGroups(
  matchings: DinMatching[],
  wefts: CostingWeftParams[],
  programMeter: number,
  issuedByKey: Map<string, number> = new Map(),
  filterMatchingNo: number | null = null,
): MatchingGroup[] {
  const sorted = [...matchings].sort((a, b) => a.matching_no - b.matching_no)
  const scoped =
    filterMatchingNo != null ? sorted.filter((m) => m.matching_no === filterMatchingNo) : sorted

  return scoped.map((m) => {
    const roles = rolesForMatching(m)
    const usedIds = new Set<string>()
    const lines: MatchingYarnLine[] = roles.map((r, idx) => {
      const costing = findCostingWeft(r.colour_name, r.role_kind, wefts, usedIds)
      if (costing) usedIds.add(costing.id)
      const required = costing ? requiredWeftKgForMeters(costing, programMeter) : 0
      const key = `${m.matching_no}::${norm(r.colour_name)}::${r.role_label}`
      const issued = round2(issuedByKey.get(key) || 0)
      const balance = round2(Math.max(0, required - issued))
      return {
        key,
        matching_no: m.matching_no,
        matching_id: m.id,
        colour_name: r.colour_name,
        role_label: r.role_label,
        role_kind: r.role_kind,
        is_main_ground: r.is_main_ground,
        colour_hex: colourHex(r.colour_name),
        required_kg: required,
        issued_kg: issued,
        balance_kg: balance,
        status: issueLineStatus(required, issued),
        denier: costing?.denier ?? null,
        pic: costing?.pic ?? null,
        width: costing?.width ?? null,
        costing_weft_id: costing?.id ?? null,
        yarn_stock_id: null,
        sr_no: idx + 1,
      }
    })
    const total_required_kg = round2(lines.reduce((s, l) => s + l.required_kg, 0))
    const total_issued_kg = round2(lines.reduce((s, l) => s + l.issued_kg, 0))
    const total_balance_kg = round2(lines.reduce((s, l) => s + l.balance_kg, 0))
    return {
      matching_no: m.matching_no,
      matching_id: m.id,
      badge: matchingBadge(m.matching_no),
      colour_label: matchingColourLabel(m),
      lines,
      total_required_kg,
      total_issued_kg,
      total_balance_kg,
    }
  })
}

export async function loadCostingWeftsForDin(dinNumber: string): Promise<{
  costingId: string | null
  designLengthMtr: number
  wefts: CostingWeftParams[]
}> {
  const trimmed = dinNumber.trim()
  if (!trimmed) return { costingId: null, designLengthMtr: 0, wefts: [] }

  const { data: headers, error } = await supabase
    .from('design_costing')
    .select('id, design_length_mtr, status, created_at')
    .eq('din_number', trimmed)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error

  const header =
    (headers ?? []).find((h) => h.status === 'final') || (headers ?? [])[0] || null
  if (!header) return { costingId: null, designLengthMtr: 0, wefts: [] }

  const { data: rows, error: wErr } = await supabase
    .from('design_costing_weft')
    .select('*')
    .eq('costing_id', header.id)
    .order('sr_no')
  if (wErr) throw wErr

  const wefts: CostingWeftParams[] = ((rows as DesignCostingWeft[]) ?? []).map((r) => ({
    id: r.id,
    weft_name: r.weft_name || '',
    denier: Number(r.denier) || 0,
    pic: Number(r.pic) || 0,
    width: Number(r.width) || 0,
    length_mtr: Number(r.length_mtr) || Number(header.design_length_mtr) || 0,
    weight_kg: r.weight_kg != null ? Number(r.weight_kg) : null,
  }))

  return {
    costingId: header.id,
    designLengthMtr: Number(header.design_length_mtr) || 0,
    wefts,
  }
}

export type ProgramOption = {
  id: string
  program_no: string
  machine_no: string
  din_number: string
  design_no: string
  design_name: string
  party_name: string
  marka: string
  colour: string
  job_card_no: string
  matching_no: number | null
  program_meter: number
  status: string
  label: string
}

export async function loadProgramOptions(): Promise<ProgramOption[]> {
  const [{ data: progs }, { data: petty }] = await Promise.all([
    supabase
      .from('programs')
      .select(
        'id, program_no, machine_no, din_number, design_no, colour, party_name, marka, job_card_no, matching_no, total_meter, required_meter, status, order_item_id',
      )
      .not('status', 'in', '("completed","Cancelled","cancelled")')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('program_petty').select('program_id, meter'),
  ])

  const pettyMap = new Map<string, number>()
  for (const p of petty ?? []) {
    pettyMap.set(p.program_id, (pettyMap.get(p.program_id) || 0) + Number(p.meter || 0))
  }

  const itemIds = [...new Set((progs ?? []).map((p) => p.order_item_id).filter(Boolean))] as string[]
  const itemMeta = new Map<
    string,
    { design: string; colour: string; party: string; matching_no: number | null }
  >()
  if (itemIds.length) {
    const { data: items } = await supabase
      .from('order_book_items')
      .select('id, design_no, colour, matching_no, order_book(party_name)')
      .in('id', itemIds)
    for (const it of items ?? []) {
      itemMeta.set(it.id, {
        design: it.design_no || '',
        colour: it.colour || '',
        party: (it as { order_book?: { party_name?: string } }).order_book?.party_name || '',
        matching_no: it.matching_no != null ? Number(it.matching_no) : null,
      })
    }
  }

  const designNos = [
    ...new Set(
      (progs ?? []).map((p) => (p.din_number || p.design_no || '').trim()).filter(Boolean),
    ),
  ]

  const dinByKey = new Map<string, { din_number: string; design_name: string }>()
  if (designNos.length) {
    const orFilter = designNos.map((d) => `din_number.eq.${d}`).join(',')
    const { data: dins } = await supabase.from('dins').select('din_number, design_name').or(orFilter).limit(300)
    for (const d of dins ?? []) {
      dinByKey.set(norm(d.din_number), { din_number: d.din_number, design_name: d.design_name || '' })
    }
    const missing = designNos.filter((d) => !dinByKey.has(norm(d)))
    if (missing.length) {
      const { data: costings } = await supabase
        .from('design_costing')
        .select('din_number, quality_name')
        .in('din_number', missing)
        .limit(100)
      for (const c of costings ?? []) {
        if (!dinByKey.has(norm(c.din_number))) {
          dinByKey.set(norm(c.din_number), {
            din_number: c.din_number,
            design_name: c.quality_name || '',
          })
        }
      }
    }
  }

  return (progs ?? []).map((p) => {
    const meta = p.order_item_id ? itemMeta.get(p.order_item_id) : null
    const designKey = (p.din_number || p.design_no || meta?.design || '').trim()
    const dinInfo = dinByKey.get(norm(designKey))
    const din_number = p.din_number || dinInfo?.din_number || designKey
    const design_name = dinInfo?.design_name || p.design_no || meta?.design || '—'
    const party = p.party_name || meta?.party || '—'
    const colour = p.colour || meta?.colour || ''
    const matching_no = p.matching_no != null ? Number(p.matching_no) : (meta?.matching_no ?? null)
    const fromPetty = pettyMap.get(p.id) || 0
    const program_meter = fromPetty || Number(p.total_meter || p.required_meter || 0)
    const program_no = p.program_no || p.id.slice(0, 8)
    return {
      id: p.id,
      program_no,
      machine_no: p.machine_no || MACHINES[0],
      din_number,
      design_no: p.design_no || designKey,
      design_name,
      party_name: party,
      marka: p.marka || '',
      colour,
      job_card_no: p.job_card_no || '',
      matching_no,
      program_meter,
      status: p.status,
      label: `${program_no} · ${p.machine_no || '—'} · ${din_number || '—'} · ${party}`,
    }
  })
}

export async function loadProducedMeter(programId: string): Promise<number> {
  if (!programId) return 0
  const { data } = await supabase.from('production_entries').select('total_meter').eq('program_id', programId)
  return round2((data ?? []).reduce((s, r) => s + Number(r.total_meter || 0), 0))
}

export async function loadIssuedMap(
  programId: string | null,
  dinNumber: string,
  machineNo: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  let query = supabase
    .from('machine_weft_issues')
    .select('id, machine_weft_issue_items(matching_no, colour_name, role_label, issued_kg)')
    .eq('din_number', dinNumber)
  if (programId) query = query.eq('program_id', programId)
  if (machineNo) query = query.eq('machine_no', machineNo)

  const { data, error } = await query.limit(100)
  if (error) {
    console.warn('loadIssuedMap', error.message)
    return map
  }
  for (const issue of data ?? []) {
    const items = (
      issue as {
        machine_weft_issue_items?: Array<{
          matching_no: number
          colour_name: string
          role_label: string
          issued_kg: number
        }>
      }
    ).machine_weft_issue_items
    for (const it of items ?? []) {
      const key = `${it.matching_no}::${norm(it.colour_name)}::${it.role_label}`
      map.set(key, round2((map.get(key) || 0) + Number(it.issued_kg || 0)))
    }
  }
  return map
}

export async function resolveDinContext(dinNumber: string): Promise<DinWithMatchings | null> {
  if (!dinNumber.trim()) return null
  const din = await fetchDinByNumber(dinNumber.trim())
  if (din) return din
  const { data: costing } = await supabase
    .from('design_costing')
    .select('din_number, quality_name')
    .eq('din_number', dinNumber.trim())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!costing) return null
  return {
    id: '',
    din_number: costing.din_number,
    received_date: todayISO(),
    design_name: costing.quality_name,
    party_name: null,
    din_image_url: null,
    main_sample_photo_url: null,
    combined_matching_photo_url: null,
    approved_sale_rate: null,
    common_warp: null,
    remarks: null,
    status: 'Costing Done',
    matching_count: 0,
    costing_id: null,
    costing_status: 'done',
    costing_date: null,
    costing_version: 1,
    base_cost_per_mtr: null,
    gst_percent: null,
    gst_amount: null,
    final_cost_per_mtr: null,
    source: 'costing',
    source_email: null,
    source_email_from: null,
    gmail_message_id: null,
    gmail_attachment_id: null,
    gmail_import_id: null,
    created_by: null,
    created_at: '',
    updated_at: '',
    din_matchings: [],
  }
}

export function syntheticMatchingFromWefts(wefts: CostingWeftParams[]): DinMatching[] {
  if (!wefts.length) return []
  const ground = wefts[0]?.weft_name || 'Main'
  const rest = wefts.slice(1)
  return [
    {
      id: 'synthetic',
      din_id: '',
      matching_no: 1,
      ground_colour: ground,
      weft_1: rest[0]?.weft_name || null,
      weft_2: rest[1]?.weft_name || null,
      weft_3: rest[2]?.weft_name || null,
      weft_4: rest[3]?.weft_name || null,
      common_warp: null,
      remarks: 'From DIN Costing weft rows',
      status: 'Approved',
      sample_photo_url: null,
      approved_photo_url: null,
      sample_produced_at: null,
      sample_received_date: null,
      sample_received_by: null,
      actual_meter: null,
      created_at: '',
    },
  ]
}

export async function nextWeftIssueNo(): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('machine_weft_issues')
    .select('issue_no')
    .like('issue_no', `WYI-${year}-%`)
    .order('created_at', { ascending: false })
    .limit(50)
  return nextDocNo(`WYI-${year}-`, (data ?? []).map((r) => r.issue_no || ''))
}

export function matchYarnStock(colour: string, yarns: WeftYarnStock[]): WeftYarnStock | null {
  const c = norm(colour)
  if (!c) return null
  const active = yarns.filter((y) => y.is_active !== false)
  return (
    active.find((y) => norm(y.colour_name) === c) ||
    active.find((y) => norm(y.colour_name).includes(c) || c.includes(norm(y.colour_name))) ||
    null
  )
}

export type IssueDraftLine = {
  matching_no: number
  matching_id: string | null
  colour_name: string
  role_label: string
  is_main_ground: boolean
  colour_hex: string
  required_kg: number
  issue_kg: number
  denier: number | null
  pic: number | null
  width: number | null
  costing_weft_id: string | null
  yarn_stock_id: string | null
  sr_no: number
}

export type SaveIssueInput = {
  issue_date: string
  shift: string
  machine_no: string
  program_id: string | null
  program_no: string
  job_card_no: string
  din_number: string
  din_id: string | null
  design_name: string
  party_name: string
  marka: string
  matching_no: number | null
  program_meter: number
  issued_by: string
  received_by: string
  remarks: string
  allow_over_issue: boolean
  lines: IssueDraftLine[]
  created_by: string | null
  created_by_name: string | null
}

export async function saveWeftYarnIssue(input: SaveIssueInput): Promise<{ issue_no: string; id: string }> {
  const toIssue = input.lines.filter((l) => l.issue_kg > 0)
  if (!toIssue.length) throw new Error('Enter at least one issue quantity (KG)')

  for (const line of toIssue) {
    if (!input.allow_over_issue && line.issue_kg > line.required_kg + 0.001) {
      throw new Error(
        `Over-issue blocked for ${line.colour_name} (${line.role_label}): ` +
          `${line.issue_kg} KG > required ${line.required_kg} KG. Authorised user can allow over-issue.`,
      )
    }
  }

  const issue_no = await nextWeftIssueNo()
  const total_required_kg = round2(input.lines.reduce((s, l) => s + l.required_kg, 0))
  const total_issued_kg = round2(toIssue.reduce((s, l) => s + l.issue_kg, 0))

  const header = {
    issue_no,
    issue_date: input.issue_date || todayISO(),
    shift: input.shift || null,
    machine_no: input.machine_no,
    program_id: input.program_id,
    program_no: input.program_no || null,
    job_card_no: input.job_card_no || null,
    din_number: input.din_number,
    din_id: input.din_id || null,
    design_name: input.design_name || null,
    party_name: input.party_name || null,
    marka: input.marka || null,
    matching_no: input.matching_no,
    program_meter: input.program_meter,
    total_required_kg,
    total_issued_kg,
    issued_by: input.issued_by || null,
    received_by: input.received_by || null,
    remarks: input.remarks || null,
    status: 'Issued',
    allow_over_issue: input.allow_over_issue,
    created_by: input.created_by,
  }

  const { data: inserted, error } = await supabase
    .from('machine_weft_issues')
    .insert(header)
    .select('id')
    .single()
  if (error) throw error
  const issueId = inserted.id as string

  const itemRows = toIssue.map((l, i) => ({
    issue_id: issueId,
    matching_no: l.matching_no,
    matching_id: l.matching_id && l.matching_id !== 'synthetic' ? l.matching_id : null,
    colour_name: l.colour_name,
    role_label: l.role_label,
    is_main_ground: l.is_main_ground,
    colour_hex: l.colour_hex,
    required_kg: l.required_kg,
    issued_kg: l.issue_kg,
    balance_kg: round2(Math.max(0, l.required_kg - l.issue_kg)),
    yarn_stock_id: l.yarn_stock_id,
    costing_weft_id: l.costing_weft_id,
    denier: l.denier,
    pic: l.pic,
    width: l.width,
    sr_no: l.sr_no || i + 1,
  }))

  const { error: iErr } = await supabase.from('machine_weft_issue_items').insert(itemRows)
  if (iErr) throw iErr

  for (const line of toIssue) {
    if (!line.yarn_stock_id || line.issue_kg <= 0) continue
    const { data: yarn, error: yErr } = await supabase
      .from('weft_yarn_stock')
      .select('*')
      .eq('id', line.yarn_stock_id)
      .maybeSingle()
    if (yErr) throw yErr
    if (!yarn) continue
    const prev = Number(yarn.stock_kg || 0)
    const next = round2(prev - line.issue_kg)
    if (next < -0.001 && !input.allow_over_issue) {
      throw new Error(`Insufficient stock for ${line.colour_name}: available ${prev} KG`)
    }
    const { error: uErr } = await supabase
      .from('weft_yarn_stock')
      .update({ stock_kg: Math.max(0, next), updated_at: new Date().toISOString() })
      .eq('id', yarn.id)
    if (uErr) throw uErr

    const txn_no = await nextYarnTxnNo('WY-OUT')
    await insertLedgerEntry({
      yarn_id: yarn.id,
      txn_date: input.issue_date || todayISO(),
      txn_no,
      txn_type: 'outward',
      reference: issue_no,
      inward_kg: 0,
      outward_kg: line.issue_kg,
      balance_kg: Math.max(0, next),
      rate: Number(yarn.rate_per_kg || 0),
      value_amount: round2(line.issue_kg * Number(yarn.rate_per_kg || 0)),
      lot_number: yarn.lot_number || null,
      location: yarn.location || null,
      gst_pct: Number(yarn.gst_pct || 0),
      invoice_no: null,
      remarks: `Machine weft issue ${input.machine_no} · ${input.din_number} · M${line.matching_no}`,
      created_by: input.created_by,
      created_by_name: input.created_by_name,
    })
  }

  return { issue_no, id: issueId }
}

export type WeftIssueReportRow = {
  issue_date: string
  machine_no: string
  din_number: string
  program_no: string
  matching_no: number
  colour_name: string
  role_label: string
  required_kg: number
  issued_kg: number
  balance_kg: number
  issued_by: string
  received_by: string
  party_name: string
  marka: string
  issue_no: string
}

export async function loadWeftIssueReport(filters: {
  dateFrom?: string
  dateTo?: string
  machine?: string
  din?: string
  program?: string
  matching?: string
  party?: string
  marka?: string
}): Promise<WeftIssueReportRow[]> {
  let q = supabase
    .from('machine_weft_issues')
    .select(
      'issue_no, issue_date, machine_no, din_number, program_no, party_name, marka, issued_by, received_by, machine_weft_issue_items(*)',
    )
    .order('issue_date', { ascending: false })
    .limit(500)
  if (filters.dateFrom) q = q.gte('issue_date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('issue_date', filters.dateTo)
  if (filters.machine) q = q.eq('machine_no', filters.machine)
  if (filters.din) q = q.ilike('din_number', `%${filters.din}%`)
  if (filters.program) q = q.ilike('program_no', `%${filters.program}%`)
  if (filters.party) q = q.ilike('party_name', `%${filters.party}%`)
  if (filters.marka) q = q.ilike('marka', `%${filters.marka}%`)

  const { data, error } = await q
  if (error) throw error

  const rows: WeftIssueReportRow[] = []
  for (const issue of data ?? []) {
    const items = (issue as { machine_weft_issue_items?: Array<Record<string, unknown>> })
      .machine_weft_issue_items
    for (const it of items ?? []) {
      const matching_no = Number(it.matching_no || 0)
      if (filters.matching && String(matching_no) !== String(filters.matching)) continue
      rows.push({
        issue_date: String(issue.issue_date || ''),
        machine_no: String(issue.machine_no || ''),
        din_number: String(issue.din_number || ''),
        program_no: String(issue.program_no || ''),
        matching_no,
        colour_name: String(it.colour_name || ''),
        role_label: String(it.role_label || ''),
        required_kg: Number(it.required_kg || 0),
        issued_kg: Number(it.issued_kg || 0),
        balance_kg: Number(it.balance_kg || 0),
        issued_by: String(issue.issued_by || ''),
        received_by: String(issue.received_by || ''),
        party_name: String(issue.party_name || ''),
        marka: String(issue.marka || ''),
        issue_no: String(issue.issue_no || ''),
      })
    }
  }
  return rows
}

export type ProductionReportRow = {
  entry_date: string
  machine_no: string
  din_number: string
  design: string
  program_no: string
  job_card_no: string
  party_name: string
  marka: string
  matching: string
  lot_no: string
  shift: string
  operator_name: string
  program_meter: number
  produced_meter: number
  balance: number
  weft_kg_issued: number
  status: string
}

export async function loadProductionReport(filters: {
  dateFrom?: string
  dateTo?: string
  machine?: string
  din?: string
  program?: string
  shift?: string
  party?: string
  marka?: string
}): Promise<ProductionReportRow[]> {
  let q = supabase
    .from('production_entries')
    .select(
      'entry_date, machine_no, shift, operator_name, total_meter, program_id, programs(program_no, din_number, design_no, party_name, marka, job_card_no, colour, matching_no, total_meter, required_meter)',
    )
    .order('entry_date', { ascending: false })
    .limit(500)
  if (filters.dateFrom) q = q.gte('entry_date', filters.dateFrom)
  if (filters.dateTo) q = q.lte('entry_date', filters.dateTo)
  if (filters.machine) q = q.eq('machine_no', filters.machine)
  if (filters.shift) q = q.eq('shift', filters.shift)

  const { data, error } = await q
  if (error) throw error

  const programIds = [...new Set((data ?? []).map((e) => e.program_id).filter(Boolean))] as string[]
  const weftByProgram = new Map<string, number>()
  if (programIds.length) {
    const { data: issues } = await supabase
      .from('machine_weft_issues')
      .select('program_id, total_issued_kg')
      .in('program_id', programIds)
    for (const iss of issues ?? []) {
      if (!iss.program_id) continue
      weftByProgram.set(
        iss.program_id,
        round2((weftByProgram.get(iss.program_id) || 0) + Number(iss.total_issued_kg || 0)),
      )
    }
  }

  const producedByProgram = new Map<string, number>()
  for (const e of data ?? []) {
    if (!e.program_id) continue
    producedByProgram.set(
      e.program_id,
      round2((producedByProgram.get(e.program_id) || 0) + Number(e.total_meter || 0)),
    )
  }

  const rows: ProductionReportRow[] = []
  for (const e of data ?? []) {
    const rawProg = (e as { programs?: Record<string, unknown> | Record<string, unknown>[] | null })
      .programs
    const prog = (Array.isArray(rawProg) ? rawProg[0] : rawProg) as Record<string, unknown> | null | undefined
    const din = String(prog?.din_number || prog?.design_no || '')
    const program_no = String(prog?.program_no || '')
    const party = String(prog?.party_name || '')
    const marka = String(prog?.marka || '')
    if (filters.din && !din.toLowerCase().includes(filters.din.toLowerCase())) continue
    if (filters.program && !program_no.toLowerCase().includes(filters.program.toLowerCase())) continue
    if (filters.party && !party.toLowerCase().includes(filters.party.toLowerCase())) continue
    if (filters.marka && !marka.toLowerCase().includes(filters.marka.toLowerCase())) continue

    const program_meter = Number(prog?.total_meter || prog?.required_meter || 0)
    const produced_total = e.program_id
      ? producedByProgram.get(e.program_id) || 0
      : Number(e.total_meter || 0)
    const balance = round2(Math.max(0, program_meter - produced_total))
    const matching =
      prog?.matching_no != null ? matchingBadge(Number(prog.matching_no)) : String(prog?.colour || '—')

    rows.push({
      entry_date: String(e.entry_date || ''),
      machine_no: String(e.machine_no || ''),
      din_number: din,
      design: String(prog?.design_no || ''),
      program_no,
      job_card_no: String(prog?.job_card_no || ''),
      party_name: party,
      marka,
      matching,
      lot_no: '—',
      shift: String(e.shift || ''),
      operator_name: String(e.operator_name || ''),
      program_meter,
      produced_meter: Number(e.total_meter || 0),
      balance,
      weft_kg_issued: e.program_id ? weftByProgram.get(e.program_id) || 0 : 0,
      status: programStatusLabel(program_meter, produced_total),
    })
  }
  return rows
}

export function flattenGroups(groups: MatchingGroup[]): MatchingYarnLine[] {
  return groups.flatMap((g) => g.lines)
}

export function totalsFromGroups(groups: MatchingGroup[]) {
  return {
    required: round2(groups.reduce((s, g) => s + g.total_required_kg, 0)),
    issued: round2(groups.reduce((s, g) => s + g.total_issued_kg, 0)),
    balance: round2(groups.reduce((s, g) => s + g.total_balance_kg, 0)),
    matchings: groups.length,
  }
}

export type SlipData = {
  issue_no: string
  issue_date: string
  machine_no: string
  din_number: string
  design_name: string
  program_no: string
  job_card_no: string
  party_name: string
  marka: string
  program_meter: number
  shift: string
  issued_by: string
  received_by: string
  groups: MatchingGroup[]
  total_required_kg: number
  total_issued_kg: number
}

export function slipWhatsAppText(slip: SlipData): string {
  const lines: string[] = [
    '*JAISAL FW — Fashionweave Industries*',
    '*WEFT YARN ISSUE SLIP*',
    '',
    `Issue No.: ${slip.issue_no}`,
    `Date: ${slip.issue_date}`,
    `Machine: ${slip.machine_no}`,
    `DIN: ${slip.din_number}`,
    `Design: ${slip.design_name}`,
    `Program: ${slip.program_no}`,
    `Job Card: ${slip.job_card_no || '—'}`,
    `Party: ${slip.party_name}`,
    `Marka: ${slip.marka || '—'}`,
    `Program Meter: ${slip.program_meter} MTR`,
    `Shift: ${slip.shift || '—'}`,
    '',
    '*MATCHING-WISE YARN REQUIREMENT*',
  ]
  for (const g of slip.groups) {
    lines.push(`\n*${g.badge}*`)
    for (const l of g.lines) {
      lines.push(
        `• ${l.colour_name} (${l.role_label}) — Req ${l.required_kg.toFixed(2)} / Iss ${l.issued_kg.toFixed(2)} KG`,
      )
    }
    lines.push(`Total ${g.badge}: ${g.total_required_kg.toFixed(2)} KG`)
  }
  lines.push('', `*TOTAL WEFT KG:* ${slip.total_required_kg.toFixed(2)}`)
  lines.push(`Issued this slip: ${slip.total_issued_kg.toFixed(2)} KG`)
  lines.push('', `Issued By (Yarn Store): ${slip.issued_by || '—'}`)
  lines.push(`Received By (Machine/Operator): ${slip.received_by || '—'}`)
  return lines.join('\n')
}

/** Pure helper for smoke tests — JFG-15-98 style matching calc */
export function computeMatchingWeftDemo(
  matchings: Array<{
    matching_no: number
    ground_colour: string
    weft_1?: string
    weft_2?: string
    weft_3?: string
    weft_4?: string
  }>,
  costingWefts: Array<{ weft_name: string; denier: number; pic: number; width: number }>,
  programMeter: number,
): MatchingGroup[] {
  const wefts: CostingWeftParams[] = costingWefts.map((w, i) => ({
    id: `w${i}`,
    weft_name: w.weft_name,
    denier: w.denier,
    pic: w.pic,
    width: w.width,
    length_mtr: programMeter,
    weight_kg: null,
  }))
  const dinMatchings: DinMatching[] = matchings.map((m, i) => ({
    id: `m${i}`,
    din_id: 'd',
    matching_no: m.matching_no,
    ground_colour: m.ground_colour,
    weft_1: m.weft_1 || null,
    weft_2: m.weft_2 || null,
    weft_3: m.weft_3 || null,
    weft_4: m.weft_4 || null,
    common_warp: null,
    remarks: null,
    status: 'Approved',
    sample_photo_url: null,
    approved_photo_url: null,
    sample_produced_at: null,
    sample_received_date: null,
    sample_received_by: null,
    actual_meter: null,
    created_at: '',
  }))
  return buildMatchingGroups(dinMatchings, wefts, programMeter)
}
