import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const NAME_CANDIDATES = [
  'party_name',
  'name',
  'party',
  'customer_name',
  'party_nm',
  'firm_name',
  'company_name',
]

const PHONE_CANDIDATES = [
  'whatsapp',
  'whatsapp_number',
  'whatsapp_no',
  'wa_number',
  'wa',
  'mobile',
  'mobile_no',
  'mobile_number',
  'phone',
  'phone_no',
  'phone_number',
  'contact',
  'contact_no',
  'contact_number',
  'cellphone',
]

function pickField(keys: string[], candidates: string[]): string | null {
  const lower = new Map(keys.map((k) => [k.toLowerCase(), k]))
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase())
    if (hit) return hit
  }
  // fuzzy: any key containing whatsapp / mobile / phone
  for (const k of keys) {
    const l = k.toLowerCase()
    if (candidates === PHONE_CANDIDATES && /(whatsapp|wa[_-]?no|mobile|phone|contact)/.test(l)) {
      return k
    }
    if (candidates === NAME_CANDIDATES && /(party|name|firm|company)/.test(l)) {
      return k
    }
  }
  return null
}

function normalizeWhatsApp(raw: unknown): string | null {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length === 10) digits = `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) digits = `91${digits.slice(1)}`
  if (digits.length < 10) return null
  return `+${digits}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const jaisalUrl = Deno.env.get('SUPABASE_URL')!
    const jaisalService = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const jaisalAnon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''

    // Verify caller has a valid user JWT (PIN session)
    const userClient = createClient(jaisalUrl, jaisalAnon || jaisalService, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const kmosUrl =
      Deno.env.get('KMOS_SUPABASE_URL') || 'https://mvsmbhiqydyiinewxydj.supabase.co'
    const kmosKey = Deno.env.get('KMOS_SERVICE_ROLE_KEY')
    if (!kmosKey) {
      return new Response(
        JSON.stringify({
          error:
            'KMOS_SERVICE_ROLE_KEY is not set on this Edge Function. Add it in Supabase → Edge Functions → Secrets.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const kmos = createClient(kmosUrl, kmosKey)
    const jaisal = createClient(jaisalUrl, jaisalService)

    const { data: rows, error: fetchErr } = await kmos.from('party_master').select('*')
    if (fetchErr) {
      return new Response(JSON.stringify({ error: `KMOS read failed: ${fetchErr.message}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const list = (rows ?? []) as Record<string, unknown>[]
    const sampleKeys = list[0] ? Object.keys(list[0]) : []
    const nameField = sampleKeys.length ? pickField(sampleKeys, NAME_CANDIDATES) : null
    const phoneField = sampleKeys.length ? pickField(sampleKeys, PHONE_CANDIDATES) : null

    if (!nameField) {
      return new Response(
        JSON.stringify({
          error: `Could not detect name column on KMOS party_master. Columns: ${sampleKeys.join(', ') || '(empty table)'}`,
          mapped_name_field: null,
          mapped_phone_field: phoneField,
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { data: existing, error: exErr } = await jaisal.from('crm_customers').select('*')
    if (exErr) throw exErr
    const byPhone = new Map(
      ((existing ?? []) as Array<{ whatsapp_number: string; source: string; id: string }>).map(
        (r) => [r.whatsapp_number, r],
      ),
    )
    const byKmosId = new Map(
      ((existing ?? []) as Array<{ kmos_party_id: string | null; id: string }>)
        .filter((r) => r.kmos_party_id)
        .map((r) => [r.kmos_party_id as string, r]),
    )

    let inserted = 0
    let updated = 0
    let skipped_no_phone = 0
    let skipped_manual_conflict = 0

    for (const row of list) {
      const name = String(row[nameField] ?? '').trim()
      if (!name) continue
      const kmosId = row.id != null ? String(row.id) : null
      const phone = phoneField ? normalizeWhatsApp(row[phoneField]) : null
      if (!phone) {
        skipped_no_phone += 1
        continue
      }

      const existingByPhone = byPhone.get(phone)
      if (existingByPhone) {
        if (existingByPhone.source === 'jaisal_manual') {
          // Default B: do not overwrite manual name/notes; optionally attach kmos id if empty
          skipped_manual_conflict += 1
          if (kmosId && !byKmosId.has(kmosId)) {
            await jaisal
              .from('crm_customers')
              .update({ kmos_party_id: kmosId })
              .eq('id', existingByPhone.id)
              .is('kmos_party_id', null)
          }
          continue
        }
        const { error: upErr } = await jaisal
          .from('crm_customers')
          .update({
            name,
            whatsapp_number: phone,
            source: 'kmos_sync',
            kmos_party_id: kmosId,
          })
          .eq('id', existingByPhone.id)
        if (upErr) throw upErr
        updated += 1
        continue
      }

      if (kmosId && byKmosId.has(kmosId)) {
        const { error: upErr } = await jaisal
          .from('crm_customers')
          .update({ name, whatsapp_number: phone, source: 'kmos_sync' })
          .eq('kmos_party_id', kmosId)
        if (upErr) throw upErr
        updated += 1
        continue
      }

      const { error: insErr } = await jaisal.from('crm_customers').insert({
        name,
        whatsapp_number: phone,
        source: 'kmos_sync',
        kmos_party_id: kmosId,
      })
      if (insErr) {
        // unique race — count as skip
        if (insErr.code === '23505') {
          skipped_manual_conflict += 1
          continue
        }
        throw insErr
      }
      inserted += 1
      byPhone.set(phone, { whatsapp_number: phone, source: 'kmos_sync', id: 'new' })
    }

    return new Response(
      JSON.stringify({
        inserted,
        updated,
        skipped_no_phone,
        skipped_manual_conflict,
        total_kmos: list.length,
        mapped_name_field: nameField,
        mapped_phone_field: phoneField,
        columns_seen: sampleKeys,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Sync failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
