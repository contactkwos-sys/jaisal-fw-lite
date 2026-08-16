import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const DEFAULT_ROLES = ['CEO', 'Programmer', 'Security', 'Operator']

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

    if (action === 'list') {
      const { data, error } = await admin
        .from('roles')
        .select('id, role_name, is_custom, created_at')
        .order('created_at', { ascending: true })

      if (!error && data?.length) {
        return new Response(JSON.stringify({ roles: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      // Fallback when table grants are missing: auth metadata + defaults
      const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
      const fromUsers = (listed?.users || [])
        .map((u) => (u.user_metadata as { role_name?: string } | null)?.role_name)
        .filter(Boolean) as string[]
      const names = [...new Set([...DEFAULT_ROLES, ...fromUsers])]
      const roles = names.map((role_name, i) => ({
        id: `meta-${role_name.toLowerCase()}`,
        role_name,
        is_custom: !DEFAULT_ROLES.includes(role_name),
        created_at: new Date(0).toISOString(),
        _idx: i,
      }))
      return new Response(JSON.stringify({ roles }), {
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
