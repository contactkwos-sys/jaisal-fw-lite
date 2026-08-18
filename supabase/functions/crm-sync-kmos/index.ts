import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * Sync KMOS public.crm_customers → Jaisal public.crm_customers
 * Exact field map (no auto-detect):
 *   company_name    → name
 *   whatsapp_number → whatsapp_number
 *   id              → kmos_party_id
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type KmosRow = {
  id: string
  company_name: string | null
  whatsapp_number: string | null
}

type JaisalRow = {
  id: string
  name: string
  whatsapp_number: string
  source: string
  kmos_party_id: string | null
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

    // Exact table + columns on KMOS
    const { data: rows, error: fetchErr } = await kmos
      .from('crm_customers')
      .select('id, company_name, whatsapp_number')

    if (fetchErr) {
      return new Response(JSON.stringify({ error: `KMOS read failed: ${fetchErr.message}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const list = (rows ?? []) as KmosRow[]

    const { data: existing, error: exErr } = await jaisal.from('crm_customers').select('*')
    if (exErr) throw exErr

    const existingRows = (existing ?? []) as JaisalRow[]
    const byPhone = new Map(existingRows.map((r) => [r.whatsapp_number, r]))
    const byKmosId = new Map(
      existingRows.filter((r) => r.kmos_party_id).map((r) => [r.kmos_party_id as string, r]),
    )

    let inserted = 0
    let updated = 0
    let skipped_no_phone = 0
    let skipped_no_name = 0
    let skipped_manual_conflict = 0

    for (const row of list) {
      const name = String(row.company_name ?? '').trim()
      if (!name) {
        skipped_no_name += 1
        continue
      }

      const kmosId = row.id != null ? String(row.id) : null
      const phone = normalizeWhatsApp(row.whatsapp_number)
      if (!phone) {
        skipped_no_phone += 1
        continue
      }

      const existingByPhone = byPhone.get(phone)
      if (existingByPhone) {
        if (existingByPhone.source === 'jaisal_manual') {
          // Keep manual name/notes; attach kmos id if missing
          skipped_manual_conflict += 1
          if (kmosId && !existingByPhone.kmos_party_id) {
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
        byPhone.set(phone, {
          id: byKmosId.get(kmosId)!.id,
          name,
          whatsapp_number: phone,
          source: 'kmos_sync',
          kmos_party_id: kmosId,
        })
        continue
      }

      const { error: insErr } = await jaisal.from('crm_customers').insert({
        name,
        whatsapp_number: phone,
        source: 'kmos_sync',
        kmos_party_id: kmosId,
      })
      if (insErr) {
        if (insErr.code === '23505') {
          skipped_manual_conflict += 1
          continue
        }
        throw insErr
      }
      inserted += 1
      byPhone.set(phone, {
        id: 'new',
        name,
        whatsapp_number: phone,
        source: 'kmos_sync',
        kmos_party_id: kmosId,
      })
      if (kmosId) {
        byKmosId.set(kmosId, {
          id: 'new',
          name,
          whatsapp_number: phone,
          source: 'kmos_sync',
          kmos_party_id: kmosId,
        })
      }
    }

    return new Response(
      JSON.stringify({
        inserted,
        updated,
        skipped_no_phone,
        skipped_no_name,
        skipped_manual_conflict,
        total_kmos: list.length,
        mapped_name_field: 'company_name',
        mapped_phone_field: 'whatsapp_number',
        kmos_table: 'crm_customers',
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
