/**
 * Serves Vite dist/ + local edge-function handlers on one port.
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { webcrypto } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 4173)

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PUB =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY)
const DEFAULT_ROLES = ['CEO', 'Programmer', 'Security', 'Operator']

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization, x-client-info, apikey, content-type',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function sendJson(res, status, body) {
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
  if (action === 'list') {
    const { data, error } = await admin
      .from('roles')
      .select('id, role_name, is_custom, created_at')
      .order('created_at', { ascending: true })
    if (!error && data?.length) return { roles: data }
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

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname === '/') pathname = '/index.html'
  const filePath = path.normalize(path.join(DIST, pathname))
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback
    const index = path.join(DIST, 'index.html')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(index).pipe(res)
    return
  }
  const ext = path.extname(filePath)
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(200)
    res.end('ok')
    return
  }

  try {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
    const p = url.pathname.replace(/\/+$/, '') || '/'

    if (p.endsWith('/roles-gate') && p.includes('/functions/')) {
      const body = req.method === 'POST' ? await readJson(req) : { action: 'list' }
      const out = await handleRoles(body)
      if (out.status) return sendJson(res, out.status, out.body)
      return sendJson(res, 200, out)
    }
    if (p.endsWith('/pin-login') && p.includes('/functions/')) {
      const body = await readJson(req)
      const out = await handlePinLogin(body)
      if (out.status) return sendJson(res, out.status, out.body)
      return sendJson(res, 200, out)
    }

    // health
    if (p === '/health') {
      return sendJson(res, 200, {
        ok: true,
        project: SUPABASE_URL,
        hasAnon: Boolean(PUB),
      })
    }

    serveStatic(req, res)
  } catch (e) {
    sendJson(res, 500, { error: e instanceof Error ? e.message : 'Server error' })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Jaisal FW Lite listening on http://0.0.0.0:${PORT}`)
})
