import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PinHashParts = {
  iterations: number
  saltB64: string
  hashB64: string
}

function parsePinHash(stored: string): PinHashParts {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    throw new Error('Unsupported pin_hash format')
  }
  return {
    iterations: Number(parts[2]),
    saltB64: parts[3],
    hashB64: parts[4],
  }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToB64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}

async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const { iterations, saltB64, hashB64 } = parsePinHash(stored)
  const salt = b64ToBytes(saltB64)
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
  return bytesToB64(bits) === hashB64
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { role_id, role_name, pin } = await req.json()
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

    let user: {
      id: string
      full_name: string
      role_id: string | null
      pin_hash: string
    } | null = null

    // Prefer public.users when grants exist; fall back to auth user_metadata
    if (role_id || role_name) {
      let roleId = role_id as string | undefined
      if (!roleId && role_name) {
        const { data: role } = await admin
          .from('roles')
          .select('id')
          .eq('role_name', role_name)
          .maybeSingle()
        roleId = role?.id
      }
      if (roleId) {
        const { data } = await admin
          .from('users')
          .select('id, full_name, role_id, pin_hash, is_active')
          .eq('role_id', roleId)
          .eq('is_active', true)
          .maybeSingle()
        if (data?.pin_hash) {
          user = {
            id: data.id,
            full_name: data.full_name,
            role_id: data.role_id,
            pin_hash: data.pin_hash,
          }
        }
      }
    }

    if (!user) {
      const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 })
      if (listErr) throw listErr
      const match = (listed.users || []).find((u) => {
        const meta = (u.user_metadata || {}) as Record<string, string>
        if (role_name && meta.role_name === role_name) return true
        if (role_id && meta.role_id === role_id) return true
        return false
      })
      if (!match) {
        return new Response(JSON.stringify({ error: 'No active user for this role' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const meta = (match.user_metadata || {}) as Record<string, string>
      if (!meta.pin_hash) {
        return new Response(JSON.stringify({ error: 'PIN not configured for user' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      user = {
        id: match.id,
        full_name: meta.full_name || match.email || 'User',
        role_id: meta.role_id || role_id || null,
        pin_hash: meta.pin_hash,
      }
    }

    const ok = await verifyPin(String(pin), user.pin_hash)
    if (!ok) {
      return new Response(JSON.stringify({ error: 'Invalid PIN' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user.id)
    if (authErr || !authUser.user?.email) {
      return new Response(JSON.stringify({ error: 'Auth user missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email,
    })
    if (linkErr) throw linkErr

    const tokenHash =
      (linkData as { properties?: { hashed_token?: string }; hashed_token?: string }).properties
        ?.hashed_token ||
      (linkData as { hashed_token?: string }).hashed_token
    if (!tokenHash) {
      return new Response(JSON.stringify({ error: 'Failed to create session token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: sessionData, error: otpErr } = await admin.auth.verifyOtp({
      type: 'email',
      token_hash: tokenHash,
    })
    if (otpErr) throw otpErr

    return new Response(
      JSON.stringify({
        access_token: sessionData.session?.access_token,
        refresh_token: sessionData.session?.refresh_token,
        user: {
          id: user.id,
          full_name: user.full_name,
          role_id: user.role_id,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
