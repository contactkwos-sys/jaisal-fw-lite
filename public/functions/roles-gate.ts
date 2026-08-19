import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const DEFAULT_ROLES = [
  'CEO',
  'Manager',
  'Machine Supervisor',
  'Salesman',
  'Checker & Dispatch',
  'Program Supervisor',
  'Programmer',
  'Security',
  'Operator',
]

async function fetchRoles(admin: { from: (t: string) => any }) {
  return admin
    .from('roles')
    .select('id, role_name, is_custom, created_at')
    .order('created_at', { ascending: true })
}

/** Insert any missing system roles (Manager, Machine Supervisor, …) then return full list. */
async function ensureSystemRoles(admin: any) {
  const { data, error } = await fetchRoles(admin)
  const rows = (!error && data ? data : []) as Array<{
    id: string
    role_name: string
    is_custom: boolean
    created_at: string
  }>
  const have = new Set(rows.map((r) => r.role_name))
  const missing = DEFAULT_ROLES.filter((name) => !have.has(name))
  if (missing.length) {
    await admin.from('roles').insert(missing.map((role_name) => ({ role_name, is_custom: false })))
    const again = await fetchRoles(admin)
    if (!again.error && again.data?.length) return again.data
  }
  if (rows.length) return rows

  // Fallback when table grants are missing: auth metadata + defaults
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
  const fromUsers = (listed?.users || [])
    .map((u: { user_metadata?: { role_name?: string } | null }) => u.user_metadata?.role_name)
    .filter(Boolean) as string[]
  const names = [...new Set([...DEFAULT_ROLES, ...fromUsers])]
  return names.map((role_name) => ({
    id: `meta-${role_name.toLowerCase()}`,
    role_name,
    is_custom: !DEFAULT_ROLES.includes(role_name),
    created_at: new Date(0).toISOString(),
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)
    const body = req.method === 'POST' ? await req.json() : {}
    const action = body.action ?? 'list'

    if (action === 'list' || action === 'ensure') {
      const roles = await ensureSystemRoles(admin)
      return new Response(JSON.stringify({ roles }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'pin-status') {
      const roles = await ensureSystemRoles(admin)
      const { data: dbUsers } = await admin
        .from('users')
        .select('id, role_id, pin_hash, is_active, created_at')
        .eq('is_active', true)

      const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
      const authUsers = listed?.users || []

      const byRoleId = new Map<
        string,
        { pin_hint: string | null; has_pin: boolean; last_updated: string | null }
      >()

      for (const u of dbUsers || []) {
        const auth = authUsers.find((a) => a.id === u.id)
        const meta = (auth?.user_metadata || {}) as Record<string, string>
        const hint = meta.pin_hint && String(meta.pin_hint).length === 4 ? String(meta.pin_hint) : null
        byRoleId.set(u.role_id, {
          pin_hint: hint,
          has_pin: Boolean(u.pin_hash),
          last_updated: auth?.updated_at || u.created_at || null,
        })
      }

      // Auth-only users (no public.users row yet) keyed by role_id / role_name
      for (const auth of authUsers) {
        const meta = (auth.user_metadata || {}) as Record<string, string>
        const roleId = meta.role_id
        if (!roleId || byRoleId.has(roleId)) continue
        const hint = meta.pin_hint && String(meta.pin_hint).length === 4 ? String(meta.pin_hint) : null
        byRoleId.set(roleId, {
          pin_hint: hint,
          has_pin: Boolean(meta.pin_hash || hint),
          last_updated: auth.updated_at || null,
        })
      }

      const status = roles.map((role: { id: string; role_name: string }) => {
        const hit = byRoleId.get(role.id)
        if (hit) {
          return {
            role_id: role.id,
            role_name: role.role_name,
            pin_hint: hit.pin_hint,
            has_pin: hit.has_pin,
            last_updated: hit.last_updated,
          }
        }
        // Match by role_name when role_id in metadata is a synthetic meta-* id
        const byName = authUsers.find((a) => {
          const m = (a.user_metadata || {}) as Record<string, string>
          return m.role_name === role.role_name
        })
        if (byName) {
          const meta = (byName.user_metadata || {}) as Record<string, string>
          const hint = meta.pin_hint && String(meta.pin_hint).length === 4 ? String(meta.pin_hint) : null
          return {
            role_id: role.id,
            role_name: role.role_name,
            pin_hint: hint,
            has_pin: Boolean(meta.pin_hash || hint),
            last_updated: byName.updated_at || null,
          }
        }
        return {
          role_id: role.id,
          role_name: role.role_name,
          pin_hint: null,
          has_pin: false,
          last_updated: null,
        }
      })

      return new Response(JSON.stringify({ status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'create') {
      const name = String(body.role_name ?? '').trim()
      if (!name) {
        return new Response(JSON.stringify({ error: 'role_name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data, error } = await admin
        .from('roles')
        .insert({ role_name: name, is_custom: true })
        .select('id, role_name, is_custom, created_at')
        .single()

      if (!error && data) {
        return new Response(JSON.stringify({ role: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Fallback synthetic role when grants missing
      const role = {
        id: `meta-${name.toLowerCase()}`,
        role_name: name,
        is_custom: true,
        created_at: new Date().toISOString(),
      }
      return new Response(JSON.stringify({ role, warning: error?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'update') {
      const roleId = String(body.role_id ?? '').trim()
      const name = String(body.role_name ?? '').trim()
      if (!roleId || !name) {
        return new Response(JSON.stringify({ error: 'role_id and role_name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data, error } = await admin
        .from('roles')
        .update({ role_name: name })
        .eq('id', roleId)
        .select('id, role_name, is_custom, created_at')
        .single()
      if (error) throw error
      return new Response(JSON.stringify({ role: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const roleId = String(body.role_id ?? '').trim()
      if (!roleId) {
        return new Response(JSON.stringify({ error: 'role_id required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: role } = await admin.from('roles').select('is_custom').eq('id', roleId).maybeSingle()
      if (role && role.is_custom === false) {
        return new Response(JSON.stringify({ error: 'Cannot delete default role' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await admin.from('roles').delete().eq('id', roleId)
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Roles gate failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
