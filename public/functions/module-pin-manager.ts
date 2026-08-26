import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

/** Sidebar modules — must match src/lib/nav.ts MAIN_MODULES ids */
const MODULE_SEEDS: Array<{ key: string; name: string; dept: string }> = [
  { key: 'dashboard', name: 'Dashboard', dept: 'Admin' },
  { key: 'design-to-order', name: 'Design Master', dept: 'Design' },
  { key: 'order-to-program', name: 'Order to Program', dept: 'Sales' },
  { key: 'program-dispatch', name: 'Program & Dispatch', dept: 'Production' },
  { key: 'production', name: 'Machine-wise Production', dept: 'Production' },
  { key: 'warp-yarn', name: 'Warp Yarn Management', dept: 'Warping' },
  { key: 'inventory', name: 'Inventory', dept: 'Store' },
  { key: 'hr-payroll', name: 'HR & Payroll', dept: 'HR' },
  { key: 'maintenance', name: 'Machine-wise Maintenance', dept: 'Maintenance' },
  { key: 'orders', name: 'Orders', dept: 'Sales' },
  { key: 'reports', name: 'Reports', dept: 'Admin' },
  { key: 'masters', name: 'Masters', dept: 'Admin' },
  { key: 'security', name: 'Security', dept: 'Security' },
  { key: 'cash-book', name: 'Cash Book', dept: 'Accounts' },
  { key: 'settings', name: 'Settings', dept: 'Admin' },
]

type PinHashParts = { iterations: number; saltB64: string; hashB64: string }

function bytesToB64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i])
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function parsePinHash(stored: string): PinHashParts {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    throw new Error('Unsupported pin_hash format')
  }
  return { iterations: Number(parts[2]), saltB64: parts[3], hashB64: parts[4] }
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

function randomPin(used: Set<string>): string {
  for (let i = 0; i < 200; i++) {
    const arr = new Uint32Array(1)
    crypto.getRandomValues(arr)
    const pin = String(1000 + (arr[0] % 9000))
    if (!used.has(pin)) return pin
  }
  return '1234'
}

async function isCeoUser(admin: any, userId: string): Promise<{ ok: boolean; name: string }> {
  const { data: row } = await admin
    .from('users')
    .select('full_name, roles(role_name)')
    .eq('id', userId)
    .maybeSingle()
  if (row) {
    const roles = row.roles as { role_name?: string } | null
    const roleName = (roles?.role_name || row.full_name || '').toLowerCase()
    const isCeo =
      roleName === 'ceo' ||
      roleName === 'md' ||
      roleName === 'managing director' ||
      roleName === 'owner' ||
      row.full_name === 'CEO'
    return { ok: isCeo, name: row.full_name || roles?.role_name || 'User' }
  }
  const { data: authUser } = await admin.auth.admin.getUserById(userId)
  const meta = (authUser?.user?.user_metadata || {}) as Record<string, string>
  const roleName = (meta.role_name || meta.full_name || '').toLowerCase()
  const isCeo =
    roleName === 'ceo' ||
    roleName === 'md' ||
    roleName === 'managing director' ||
    roleName === 'owner' ||
    meta.full_name === 'CEO'
  return { ok: isCeo, name: meta.full_name || meta.role_name || 'User' }
}

async function writeAudit(
  admin: any,
  row: {
    action: string
    module_key?: string
    module_name?: string
    department_name?: string
    target_user?: string
    reference?: string
    performed_by?: string
    performed_by_name?: string
    metadata?: Record<string, unknown>
  },
) {
  await admin.from('pin_management_audit').insert({
    action: row.action,
    module_key: row.module_key ?? null,
    module_name: row.module_name ?? null,
    department_name: row.department_name ?? null,
    target_user: row.target_user ?? null,
    reference: row.reference ?? null,
    performed_by: row.performed_by ?? null,
    performed_by_name: row.performed_by_name ?? null,
    metadata: row.metadata ?? null,
  })
}

async function ensureModules(admin: any) {
  const { data: depts } = await admin.from('pin_departments').select('id, name')
  const deptByName = new Map((depts ?? []).map((d: { id: string; name: string }) => [d.name.toLowerCase(), d.id]))

  const { data: existing } = await admin.from('module_pins').select('module_key, pin_display')
  const have = new Set((existing ?? []).map((r: { module_key: string }) => r.module_key))
  const usedPins = new Set((existing ?? []).map((r: { pin_display: string }) => r.pin_display))

  for (const seed of MODULE_SEEDS) {
    if (have.has(seed.key)) continue
    const pin = randomPin(usedPins)
    usedPins.add(pin)
    const pin_hash = await hashPin(pin)
    const department_id = deptByName.get(seed.dept.toLowerCase()) ?? null
    await admin.from('module_pins').insert({
      module_key: seed.key,
      module_name: seed.name,
      department_id,
      pin_hash,
      pin_display: pin,
      is_active: true,
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    let callerId: string | null = null
    let callerName = 'User'
    if (jwt) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || serviceKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData } = await userClient.auth.getUser()
      if (userData?.user?.id) {
        callerId = userData.user.id
        const ceoCheck = await isCeoUser(admin, callerId)
        callerName = ceoCheck.name
      }
    }

    const body = req.method === 'POST' ? await req.json() : {}
    const action = body.action ?? 'list_modules'

    if (action === 'verify_module_pin') {
      const { module_key, pin } = body
      if (!module_key || !pin || String(pin).length !== 4) {
        return new Response(JSON.stringify({ error: 'module_key and 4-digit pin required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: mod } = await admin
        .from('module_pins')
        .select('pin_hash, is_active, module_name')
        .eq('module_key', module_key)
        .maybeSingle()
      if (!mod || !mod.is_active) {
        return new Response(JSON.stringify({ ok: false, error: 'Module PIN not configured' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ok = await verifyPin(String(pin), mod.pin_hash)
      return new Response(JSON.stringify({ ok, module_name: mod.module_name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'verify_ceo_pin') {
      const { pin } = body
      if (!pin || String(pin).length !== 4) {
        return new Response(JSON.stringify({ error: '4-digit pin required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: ceoRow } = await admin.from('ceo_pin_settings').select('pin_hash').limit(1).maybeSingle()
      if (!ceoRow?.pin_hash) {
        return new Response(JSON.stringify({ ok: false, error: 'CEO PIN not set' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const ok = await verifyPin(String(pin), ceoRow.pin_hash)
      return new Response(JSON.stringify({ ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const ceoCheck = await isCeoUser(admin, callerId)
    if (!ceoCheck.ok) {
      return new Response(JSON.stringify({ error: 'CEO only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    callerName = ceoCheck.name

    if (action === 'sync_modules') {
      await ensureModules(admin)
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_modules') {
      await ensureModules(admin)
      const { data: mods } = await admin
        .from('module_pins')
        .select('id, module_key, module_name, department_id, pin_display, is_active, updated_at, pin_departments(name)')
        .order('module_name')
      const modules = (mods ?? []).map((m: any) => ({
        id: m.id,
        module_key: m.module_key,
        module_name: m.module_name,
        department_id: m.department_id,
        department_name: m.pin_departments?.name ?? null,
        pin: m.pin_display,
        is_active: m.is_active,
        updated_at: m.updated_at,
      }))
      const { count: activePins } = await admin
        .from('module_pins')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      const { count: deptCount } = await admin
        .from('pin_departments')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      const { count: userCount } = await admin
        .from('pin_department_users')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
      const { data: ceoRow } = await admin.from('ceo_pin_settings').select('updated_at').limit(1).maybeSingle()
      return new Response(
        JSON.stringify({
          modules,
          summary: {
            total_modules: modules.length,
            active_pins: activePins ?? 0,
            departments: deptCount ?? 0,
            users: userCount ?? 0,
            ceo_pin_set: Boolean(ceoRow),
            ceo_pin_updated_at: ceoRow?.updated_at ?? null,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (action === 'set_module_pin') {
      const { module_key, pin } = body
      if (!module_key || !pin || !/^\d{4}$/.test(String(pin))) {
        return new Response(JSON.stringify({ error: 'module_key and 4-digit pin required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const pin_hash = await hashPin(String(pin))
      const { data: mod } = await admin
        .from('module_pins')
        .select('id, module_name, pin_departments(name)')
        .eq('module_key', module_key)
        .maybeSingle()
      if (!mod) {
        return new Response(JSON.stringify({ error: 'Module not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      await admin
        .from('module_pins')
        .update({
          pin_hash,
          pin_display: String(pin),
          updated_at: new Date().toISOString(),
        })
        .eq('module_key', module_key)
      await writeAudit(admin, {
        action: 'PIN changed',
        module_key,
        module_name: mod.module_name,
        department_name: (mod as any).pin_departments?.name,
        performed_by: callerId,
        performed_by_name: callerName,
      })
      return new Response(JSON.stringify({ ok: true, pin: String(pin) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_module_pin') {
      const { module_key } = body
      if (!module_key) {
        return new Response(JSON.stringify({ error: 'module_key required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: all } = await admin.from('module_pins').select('pin_display')
      const used = new Set((all ?? []).map((r: { pin_display: string }) => r.pin_display))
      const pin = randomPin(used)
      const pin_hash = await hashPin(pin)
      const { data: mod } = await admin
        .from('module_pins')
        .select('id, module_name, pin_departments(name)')
        .eq('module_key', module_key)
        .maybeSingle()
      if (!mod) {
        return new Response(JSON.stringify({ error: 'Module not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      await admin
        .from('module_pins')
        .update({
          pin_hash,
          pin_display: pin,
          updated_at: new Date().toISOString(),
        })
        .eq('module_key', module_key)
      await writeAudit(admin, {
        action: 'PIN reset',
        module_key,
        module_name: mod.module_name,
        department_name: (mod as any).pin_departments?.name,
        performed_by: callerId,
        performed_by_name: callerName,
      })
      return new Response(JSON.stringify({ ok: true, pin }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'toggle_module') {
      const { module_key, is_active } = body
      const { data: mod } = await admin
        .from('module_pins')
        .select('module_name, is_active')
        .eq('module_key', module_key)
        .maybeSingle()
      if (!mod) {
        return new Response(JSON.stringify({ error: 'Module not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const next = typeof is_active === 'boolean' ? is_active : !mod.is_active
      await admin
        .from('module_pins')
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq('module_key', module_key)
      await writeAudit(admin, {
        action: next ? 'PIN activated' : 'PIN deactivated',
        module_key,
        module_name: mod.module_name,
        performed_by: callerId,
        performed_by_name: callerName,
      })
      return new Response(JSON.stringify({ ok: true, is_active: next }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'set_module_department') {
      const { module_key, department_id } = body
      await admin
        .from('module_pins')
        .update({ department_id: department_id || null, updated_at: new Date().toISOString() })
        .eq('module_key', module_key)
      const { data: dept } = department_id
        ? await admin.from('pin_departments').select('name').eq('id', department_id).maybeSingle()
        : { data: null }
      await writeAudit(admin, {
        action: 'Department changed',
        module_key,
        department_name: dept?.name,
        performed_by: callerId,
        performed_by_name: callerName,
      })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'change_ceo_pin') {
      const { current_pin, new_pin, otp_pin } = body
      const confirmPin = otp_pin || current_pin
      if (!confirmPin || !new_pin || !/^\d{4}$/.test(String(new_pin))) {
        return new Response(JSON.stringify({ error: 'current/otp and new 4-digit pins required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: ceoRow } = await admin.from('ceo_pin_settings').select('id, pin_hash').limit(1).maybeSingle()
      if (ceoRow?.pin_hash) {
        const ok = await verifyPin(String(confirmPin), ceoRow.pin_hash)
        if (!ok) {
          return new Response(JSON.stringify({ error: 'Current CEO PIN / OTP incorrect' }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await admin.from('ceo_pin_settings').delete().eq('id', ceoRow.id)
      }
      const pin_hash = await hashPin(String(new_pin))
      await admin.from('ceo_pin_settings').insert({
        pin_hash,
        updated_by: callerId,
        updated_at: new Date().toISOString(),
      })
      await writeAudit(admin, {
        action: 'CEO PIN changed',
        performed_by: callerId,
        performed_by_name: callerName,
      })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'log_pin_shared') {
      const { module_key, department_name, target_user, channel } = body
      const { data: mod } = await admin
        .from('module_pins')
        .select('module_name')
        .eq('module_key', module_key)
        .maybeSingle()
      await writeAudit(admin, {
        action: 'PIN shared',
        module_key,
        module_name: mod?.module_name,
        department_name,
        target_user,
        reference: channel,
        performed_by: callerId,
        performed_by_name: callerName,
      })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'list_audit') {
      const limit = Math.min(Number(body.limit) || 100, 500)
      const { data } = await admin
        .from('pin_management_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      return new Response(
        JSON.stringify({ rows: data ?? [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'module-pin-manager failed'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
