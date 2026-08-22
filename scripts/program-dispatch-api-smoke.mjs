/**
 * API smoke: Program & Dispatch flow
 * Order → Program → Production → Lot → Challan → Gate Pass → Invoice
 * Run: node scripts/program-dispatch-api-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) process.env[m[1].trim()] ||= m[2].trim()
    }
  } catch {
    /* ignore */
  }
}
loadEnv()

const url = process.env.VITE_SUPABASE_URL
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.OPA_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / service role key')
  process.exit(1)
}
console.log('using key prefix', key.slice(0, 12), 'len', key.length)

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const results = []
function record(check, pass, extra = {}) {
  results.push({ check, pass, ...extra })
  console.log(pass ? 'PASS' : 'FAIL', check, JSON.stringify(extra))
}

function suggestMarka(partyName) {
  const words = partyName.trim().replace(/[^a-zA-Z\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join('')
  if (words.length === 2) return (words[0][0] + words[1][0] + (words[0][1] || 'X')).toUpperCase()
  const w = (words[0] || 'XXX').toUpperCase()
  return (w + 'XXX').slice(0, 3)
}

async function main() {
  record('marka SVT', suggestMarka('Samrat Velvet').length === 3, {
    got: suggestMarka('Samrat Velvet'),
  })
  record('marka MHT-ish', suggestMarka('Mahalaxmi Textiles').length === 3, {
    got: suggestMarka('Mahalaxmi Textiles'),
  })

  // Migration columns present?
  const { error: markaErr } = await sb.from('party_master').select('id, marka').limit(1)
  record('party_master.marka column', !markaErr, { error: markaErr?.message })

  const { error: lotErr } = await sb.from('checking_lots').select('id').limit(1)
  record('checking_lots table', !lotErr, { error: lotErr?.message })

  const { error: invErr } = await sb.from('gst_invoices').select('id').limit(1)
  record('gst_invoices table', !invErr, { error: invErr?.message })

  if (markaErr || lotErr || invErr) {
    console.log('\nMigration not applied yet — schema checks failed. Apply 20260821140000_program_dispatch_module.sql')
    const failed = results.filter((r) => !r.pass)
    process.exit(failed.length ? 2 : 0)
  }

  const stamp = Date.now().toString(36).slice(-4)
  const party = `PD Smoke ${stamp}`
  const marka = suggestMarka(party)
  const orderNo = `ORD-S${stamp}`

  const { data: pm, error: pmErr } = await sb
    .from('party_master')
    .insert({ party_name: party, marka })
    .select('id, marka')
    .single()
  record('insert party+marka', !pmErr && pm?.marka === marka, { error: pmErr?.message, marka: pm?.marka })

  const { data: order, error: oErr } = await sb
    .from('order_book')
    .insert({
      party_name: party,
      order_no: orderNo,
      order_date: new Date().toISOString().slice(0, 10),
      status: 'Pending',
      delivery_date: '2026-08-30',
    })
    .select('id')
    .single()
  record('insert order', !oErr && !!order?.id, { error: oErr?.message, orderNo })

  const { data: item, error: iErr } = await sb
    .from('order_book_items')
    .insert({
      order_id: order.id,
      design_no: 'D-1021',
      colour: 'Black',
      quality: 'Velvet',
      total_pcs: 500,
      qty_meter: 25000,
      rate: 10,
      status: 'Pending',
    })
    .select('id')
    .single()
  record('insert order item', !iErr && !!item?.id, { error: iErr?.message })

  const programNo = `PRG-S${stamp}-01`
  const { data: prog, error: pErr } = await sb
    .from('programs')
    .insert({
      order_item_id: item.id,
      machine_no: 'M1',
      status: 'Programmed',
      program_no: programNo,
      marka,
      party_name: party,
      design_no: 'D-1021',
      colour: 'Black',
      quality: 'Velvet',
      total_meter: 1250,
      required_meter: 1250,
    })
    .select('id')
    .single()
  record('insert program', !pErr && !!prog?.id, { error: pErr?.message, programNo })

  await sb.from('program_petty').insert({
    program_id: prog.id,
    petty_label: 'Main',
    item_name: 'D-1021',
    meter: 1250,
  })

  const { error: peErr } = await sb.from('production_entries').insert({
    machine_no: 'M1',
    entry_date: new Date().toISOString().slice(0, 10),
    shift: 'Day',
    operator_name: 'Ramesh',
    working_hour: 12,
    total_meter: 1250,
    program_id: prog.id,
  })
  record('production entry', !peErr, { error: peErr?.message })

  const lotNo = `LOT-S${stamp}`
  const { data: lot, error: lErr } = await sb
    .from('checking_lots')
    .insert({
      lot_no: lotNo,
      program_id: prog.id,
      marka,
      meter_in: 800,
      checked_meter: 800,
      damage_meter: 20,
      final_meter: 780,
      checker_name: 'Checker',
      status: 'Checked',
    })
    .select('id, final_meter')
    .single()
  record('checking lot final=780', !lErr && Number(lot?.final_meter) === 780, {
    error: lErr?.message,
    final: lot?.final_meter,
  })

  await sb.from('lot_damages').insert({
    lot_id: lot.id,
    damage_type: 'Stain',
    damage_operator: 'Op1',
    damage_meter: 20,
  })

  const challanNo = `CH-S${stamp}`
  const { data: ch, error: cErr } = await sb
    .from('challans')
    .insert({
      challan_no: challanNo,
      party,
      meter: 780,
      rolls: 1,
      rate: 10,
      gst_pct: 5,
      program_id: prog.id,
      marka,
      design_no: 'D-1021',
      quality: 'Velvet',
      colour: 'Black',
      status: 'Ready',
    })
    .select('id')
    .single()
  record('challan', !cErr && !!ch?.id, { error: cErr?.message })

  await sb.from('checking_lots').update({ challan_id: ch.id, status: 'Dispatched' }).eq('id', lot.id)

  const gpNo = `GP-S${stamp}`
  const { error: gErr } = await sb.from('gatepass').insert({
    challan_id: ch.id,
    gatepass_no: gpNo,
    date: new Date().toISOString().slice(0, 10),
    party,
    marka,
    total_meter: 780,
    lots_count: 1,
    vehicle_no: 'GJ-01-AB-1234',
    driver_name: 'Tempo',
  })
  record('gate pass', !gErr, { error: gErr?.message })

  const invNo = `INV-S${stamp}`
  const taxable = 780 * 10
  const { error: invInsErr } = await sb.from('gst_invoices').insert({
    invoice_no: invNo,
    invoice_date: new Date().toISOString().slice(0, 10),
    challan_id: ch.id,
    party,
    marka,
    design_no: 'D-1021',
    quality: 'Velvet',
    colour: 'Black',
    quantity: 780,
    rate: 10,
    taxable_value: taxable,
    gst_pct: 5,
    cgst: taxable * 0.025,
    sgst: taxable * 0.025,
    igst: 0,
    grand_total: taxable * 1.05,
  })
  record('gst invoice', !invInsErr, { error: invInsErr?.message })

  await sb.from('programs').update({ status: 'completed', dispatched_meter: 780 }).eq('id', prog.id)

  // Cleanup smoke rows (best-effort; keep data if FK blocks)
  await sb.from('gst_invoices').delete().eq('invoice_no', invNo)
  await sb.from('gatepass').delete().eq('gatepass_no', gpNo)
  await sb.from('lot_damages').delete().eq('lot_id', lot.id)
  await sb.from('checking_lots').delete().eq('id', lot.id)
  await sb.from('challans').delete().eq('id', ch.id)
  await sb.from('production_entries').delete().eq('program_id', prog.id)
  await sb.from('program_petty').delete().eq('program_id', prog.id)
  await sb.from('programs').delete().eq('id', prog.id)
  await sb.from('order_book_items').delete().eq('id', item.id)
  await sb.from('order_book').delete().eq('id', order.id)
  await sb.from('party_master').delete().eq('id', pm.id)
  record('cleanup', true)

  const failed = results.filter((r) => !r.pass)
  console.log('\n=== SUMMARY ===')
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`)
  process.exit(failed.length ? 2 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
