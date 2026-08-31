/**
 * Live API smoke: Customer Order Others / manual DIN save + reload.
 * Run: node scripts/customer-order-din-others-api-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = 'https://doitrzsyvcipugmrzykx.supabase.co'
const key = 'sb_publishable_OyI39Syi9VXJg34uLLuozA_yjFBSBeE'
const supabase = createClient(url, key)

const DIN_OTHERS_VALUE = '__OTHERS__'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
  console.log('PASS', msg)
}

function isManualDinSelection(dinNumber, masterDinNumbers) {
  const trimmed = dinNumber.trim()
  if (!trimmed || trimmed === DIN_OTHERS_VALUE) return true
  const lower = trimmed.toLowerCase()
  for (const n of masterDinNumbers) {
    if (String(n || '').trim().toLowerCase() === lower) return false
  }
  return true
}

async function main() {
  const { data: rolesData, error: rErr } = await supabase.functions.invoke('roles-gate', {
    body: { action: 'list' },
  })
  if (rErr) throw rErr
  const ceo = rolesData.roles.find((r) => r.role_name === 'CEO')
  const { data: login, error: lErr } = await supabase.functions.invoke('pin-login', {
    body: { role_id: ceo.id, role_name: 'CEO', pin: '1234' },
  })
  if (lErr) throw lErr
  const { error: sErr } = await supabase.auth.setSession({
    access_token: login.access_token,
    refresh_token: login.refresh_token,
  })
  if (sErr) throw sErr
  assert(true, 'CEO login')

  const { data: dins, error: dErr } = await supabase.from('dins').select('din_number').limit(200)
  if (dErr) throw dErr
  const masters = (dins ?? []).map((d) => d.din_number)
  const manualDin = `JFG9999-T${Date.now().toString(36).slice(-5).toUpperCase()}`
  assert(isManualDinSelection(manualDin, masters), 'manual DIN not in master list')

  const stamp = Date.now()
  const party = `Others DIN Party ${stamp}`
  const orderNo = `OTP-OTHERS-${stamp}`

  const { data: order, error: oErr } = await supabase
    .from('order_book')
    .insert({
      order_no: orderNo,
      party_name: party,
      order_date: new Date().toISOString().slice(0, 10),
      din_id: null,
      quality_name: null,
      sales_rate: 0,
      design_preview_url: null,
      total_order_meter: 50,
      total_amount: 0,
      net_amount: 0,
      overall_status: 'ORDER RECEIVED',
      status: 'ORDER RECEIVED',
      item_name: 'Fabric',
    })
    .select('id, order_no')
    .single()
  if (oErr) throw oErr

  const { error: iErr } = await supabase.from('order_book_items').insert({
    order_id: order.id,
    design_no: manualDin,
    colour: 'Test Colour',
    matching_name: 'M-01',
    matching_no: 1,
    matching_id: null,
    qty_meter: 50,
    rate: 0,
    din_id: null,
    quality: null,
    status: 'ORDER RECEIVED',
  })
  if (iErr) throw iErr
  assert(true, `order saved with design_no=${manualDin}`)

  const { data: loaded, error: l2Err } = await supabase
    .from('order_book')
    .select('id, din_id, order_book_items(design_no, din_id)')
    .eq('id', order.id)
    .single()
  if (l2Err) throw l2Err

  const savedDin = loaded.order_book_items?.[0]?.design_no
  assert(savedDin === manualDin, 'persisted design_no is typed DIN')
  assert(savedDin !== 'Others' && savedDin !== DIN_OTHERS_VALUE, 'did not persist Others sentinel')
  assert(loaded.din_id == null, 'header din_id remains null for unknown DIN')
  assert(isManualDinSelection(savedDin, masters), 'edit path would select Others')

  // Ensure no accidental DIN master row was created for this number
  const { data: createdDin } = await supabase.from('dins').select('id').eq('din_number', manualDin).maybeSingle()
  assert(!createdDin, 'no duplicate DIN master row created')

  // Cleanup test rows
  await supabase.from('order_book_items').delete().eq('order_id', order.id)
  await supabase.from('order_book').delete().eq('id', order.id)
  assert(true, 'cleanup')

  console.log('ALL PASS customer-order-din-others-api-smoke')
}

main().catch((e) => {
  console.error('FAIL', e.message || e)
  process.exit(1)
})
