/**
 * Local stand-in for Supabase Edge Functions (pin-login + roles-gate)
 * when Management API access token is unavailable.
 */
import http from 'node:http'
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

const PORT = Number(process.env.FUNCTIONS_PORT || 54321)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)
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

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
}

function send(res, status, body) {
  cors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function parsePinHash(stored) {
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') {
    throw new Error('Unsupported pin_hash format')
  }
  return { iterations: Number(parts[2]), saltB64: parts[3], hashB64: parts[4] }
}

async function verifyPin(pin, stored) {
  const { iterations, saltB64, hashB64 } = parsePinHash(stored)
  const salt = Buffer.from(saltB64, 'base64')
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await webcrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return Buffer.from(bits).toString('base64') === hashB64
}

async function handleRoles(body) {
  const action = body.action || 'list'
  if (action === 'list' || action === 'ensure') {
    const { data, error } = await admin
      .from('roles')
      .select('id, role_name, is_custom, created_at')
      .order('created_at', { ascending: true })
    let rows = !error && data ? data : []
    const have = new Set(rows.map((r) => r.role_name))
    const missing = DEFAULT_ROLES.filter((name) => !have.has(name))
    if (missing.length) {
      await admin.from('roles').insert(missing.map((role_name) => ({ role_name, is_custom: false })))
      const again = await admin
        .from('roles')
        .select('id, role_name, is_custom, created_at')
        .order('created_at', { ascending: true })
      if (!again.error && again.data?.length) rows = again.data
    }
    if (rows.length) return { roles: rows }

    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
    const fromUsers = (listed?.users || [])
      .map((u) => u.user_metadata?.role_name)
      .filter(Boolean)
    const names = [...new Set([...DEFAULT_ROLES, ...fromUsers])]
    return {
      roles: names.map((role_name) => ({
        id: `meta-${role_name.toLowerCase()}`,
        role_name,
        is_custom: !DEFAULT_ROLES.includes(role_name),
        created_at: new Date(0).toISOString(),
      })),
    }
  }
  if (action === 'pin-status') {
    const listedRoles = await handleRoles({ action: 'ensure' })
    const roles = listedRoles.roles || []
    const { data: dbUsers } = await admin
      .from('users')
      .select('id, role_id, pin_hash, is_active, created_at')
      .eq('is_active', true)
    const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 })
    const authUsers = listed?.users || []
    const byRoleId = new Map()
    for (const u of dbUsers || []) {
      const auth = authUsers.find((a) => a.id === u.id)
      const meta = auth?.user_metadata || {}
      const hint = meta.pin_hint && String(meta.pin_hint).length === 4 ? String(meta.pin_hint) : null
      byRoleId.set(u.role_id, {
        pin_hint: hint,
        has_pin: Boolean(u.pin_hash),
        last_updated: auth?.updated_at || u.created_at || null,
      })
    }
    const status = roles.map((role) => {
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
      const byName = authUsers.find((a) => a.user_metadata?.role_name === role.role_name)
      if (byName) {
        const meta = byName.user_metadata || {}
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
    return { status }
  }
  if (action === 'create') {
    const name = String(body.role_name || '').trim()
    if (!name) return { status: 400, body: { error: 'role_name required' } }
    const { data, error } = await admin
      .from('roles')
      .insert({ role_name: name, is_custom: true })
      .select('id, role_name, is_custom, created_at')
      .single()
    if (!error && data) return { role: data }
    return {
      role: {
        id: `meta-${name.toLowerCase()}`,
        role_name: name,
        is_custom: true,
        created_at: new Date().toISOString(),
      },
      warning: error?.message,
    }
  }
  return { status: 400, body: { error: 'Unknown action' } }
}

async function handlePinLogin(body) {
  const { role_id, role_name, pin } = body
  if (!pin || String(pin).length !== 4) return { status: 400, body: { error: 'PIN must be 4 digits' } }
  if (!role_id && !role_name) return { status: 400, body: { error: 'role_id or role_name required' } }

  let user = null
  let roleId = role_id
  if (!roleId && role_name) {
    const { data: role } = await admin.from('roles').select('id').eq('role_name', role_name).maybeSingle()
    roleId = role?.id
  }
  if (roleId) {
    const { data } = await admin
      .from('users')
      .select('id, full_name, role_id, pin_hash, is_active')
      .eq('role_id', roleId)
      .eq('is_active', true)
      .maybeSingle()
    if (data?.pin_hash) user = data
  }

  if (!user) {
    const { data: listed, error } = await admin.auth.admin.listUsers({ perPage: 200 })
    if (error) throw error
    const match = (listed.users || []).find((u) => {
      const meta = u.user_metadata || {}
      return (role_name && meta.role_name === role_name) || (role_id && meta.role_id === role_id)
    })
    if (!match?.user_metadata?.pin_hash) {
      return { status: 401, body: { error: 'No active user for this role' } }
    }
    user = {
      id: match.id,
      full_name: match.user_metadata.full_name || match.email,
      role_id: match.user_metadata.role_id || role_id || null,
      pin_hash: match.user_metadata.pin_hash,
    }
  }

  if (!(await verifyPin(String(pin), user.pin_hash))) {
    return { status: 401, body: { error: 'Invalid PIN' } }
  }

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user.id)
  if (authErr || !authUser.user?.email) return { status: 500, body: { error: 'Auth user missing' } }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  })
  if (linkErr) throw linkErr

  const tokenHash = linkData?.properties?.hashed_token || linkData?.hashed_token
  if (!tokenHash) return { status: 500, body: { error: 'Failed to create session token' } }

  const { data: sessionData, error: otpErr } = await admin.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  })
  if (otpErr) throw otpErr

  return {
    access_token: sessionData.session?.access_token,
    refresh_token: sessionData.session?.refresh_token,
    user: { id: user.id, full_name: user.full_name, role_id: user.role_id },
  }
}

const server = http.createServer(async (req, res) => {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end('ok')
    return
  }
  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
    const path = url.pathname.replace(/\/+$/, '')
    const body = req.method === 'POST' ? await readJson(req) : {}

    if (path.endsWith('/roles-gate')) {
      const out = await handleRoles(body)
      if (out.status) return send(res, out.status, out.body)
      return send(res, 200, out)
    }
    if (path.endsWith('/pin-login')) {
      const out = await handlePinLogin(body)
      if (out.status) return send(res, out.status, out.body)
      return send(res, 200, out)
    }
    send(res, 404, { error: 'Not found', path })
  } catch (e) {
    send(res, 500, { error: e instanceof Error ? e.message : 'Server error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`functions local on http://127.0.0.1:${PORT}/functions/v1`)
})
