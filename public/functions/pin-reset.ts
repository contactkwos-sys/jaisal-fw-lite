import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function bytesToB64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}

async function hashPin(pin: string): Promise<string> {
  const iterations = 100000
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$sha256$${iterations}$${bytesToB64(salt.buffer)}$${bytesToB64(bits)}`
}

/** Supabase Auth rejects short passwords; double the 4-digit PIN for auth only. */
function authPasswordFromPin(pin: string): string {
  return `${pin}${pin}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { role_id, role_name, pin, full_name } = await req.json()
    if (!pin || String(pin).length !== 4) {
      return new Response(JSON.stringify({ error: 'PIN must be 4 digits' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!role_id && !role_name) {
      return new Response(JSON.stringify({ error: 'role_id or role_name required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    let roleId = role_id as string | undefined
    let roleName = role_name as string | undefined
    if (!roleId && roleName) {
      const { data: role } = await admin.from('roles').select('id, role_name').eq('role_name', roleName).maybeSingle()
      roleId = role?.id
      roleName = role?.role_name ?? roleName
    }
    if (roleId && !roleName) {
      const { data: role } = await admin.from('roles').select('id, role_name').eq('id', roleId).maybeSingle()
      roleName = role?.role_name
    }
    if (!roleId) {
      return new Response(JSON.stringify({ error: 'Role not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const displayPin = String(pin)
    const authPassword = authPasswordFromPin(displayPin)
    const pin_hash = await hashPin(displayPin)
    const displayName = full_name || roleName || 'User'
    const meta = {
      role_id: roleId,
      role_name: roleName,
      full_name: displayName,
      pin_hash,
      pin_hint: displayPin,
    }

    // Update existing public.users for role, else create auth user + row
    const { data: existing } = await admin
      .from('users')
      .select('id')
      .eq('role_id', roleId)
      .eq('is_active', true)
      .maybeSingle()

    if (existing?.id) {
      const { error: uErr } = await admin.from('users').update({ pin_hash }).eq('id', existing.id)
      if (uErr) throw uErr
      await admin.auth.admin.updateUserById(existing.id, {
        password: authPassword,
        user_metadata: meta,
      })
      return new Response(JSON.stringify({ ok: true, user_id: existing.id, pin_hint: displayPin }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const email = `${String(roleName).toLowerCase().replace(/[^a-z0-9]+/g, '.')}@jaisal.local`
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
      user_metadata: meta,
    })
    if (cErr) {
      // Maybe auth user already exists — find by metadata
      const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
      const match = (listed?.users || []).find((u) => {
        const m = (u.user_metadata || {}) as Record<string, string>
        return m.role_id === roleId || m.role_name === roleName
      })
      if (!match) throw cErr
      await admin.auth.admin.updateUserById(match.id, {
        password: authPassword,
        user_metadata: meta,
      })
      await admin.from('users').upsert({
        id: match.id,
        full_name: displayName,
        role_id: roleId,
        pin_hash,
        is_active: true,
      })
      return new Response(JSON.stringify({ ok: true, user_id: match.id, pin_hint: displayPin }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userId = created.user!.id
    await admin.from('users').upsert({
      id: userId,
      full_name: displayName,
      role_id: roleId,
      pin_hash,
      is_active: true,
    })

    return new Response(JSON.stringify({ ok: true, user_id: userId, pin_hint: displayPin }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PIN reset failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
