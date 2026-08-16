import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const action = body.action ?? (req.method === 'GET' ? 'list' : null)

    if (action === 'list') {
      const { data, error } = await admin
        .from('roles')
        .select('id, role_name, is_custom, created_at')
        .order('created_at', { ascending: true })
      if (error) throw error
      return new Response(JSON.stringify({ roles: data }), {
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
      if (error) throw error

      return new Response(JSON.stringify({ role: data }), {
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
