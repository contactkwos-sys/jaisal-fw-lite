import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const INTAKE_EMAIL = Deno.env.get('GMAIL_INTAKE_EMAIL') || 'jaisalind2@gmail.com'

type GmailConnectionRow = {
  id: string
  user_id: string
  email: string
  status: string
  connected_email: string | null
  refresh_token_encrypted: string | null
  access_token_encrypted: string | null
  token_expires_at: string | null
  scopes: string | null
  oauth_state: string | null
  connected_at: string | null
  connected_by: string | null
}

type ApprovedSender = {
  id: string
  name: string
  email: string | null
  is_active: boolean
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: url } })
}

function bytesToB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('GMAIL_TOKEN_SECRET')
  if (!secret || secret.length < 16) {
    throw new Error('GMAIL_TOKEN_SECRET is not configured')
  }
  const raw = new TextEncoder().encode(secret.padEnd(32, '0').slice(0, 32))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptToken(plain: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  )
  return `${bytesToB64(iv)}.${bytesToB64(new Uint8Array(cipher))}`
}

async function decryptToken(stored: string): Promise<string> {
  const [ivB64, cipherB64] = stored.split('.')
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted token')
  const key = await getEncryptionKey()
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    key,
    b64ToBytes(cipherB64),
  )
  return new TextDecoder().decode(plain)
}

async function audit(
  admin: SupabaseClient,
  action: string,
  userId: string | null,
  details: Record<string, unknown>,
) {
  await admin.from('gmail_audit_log').insert({ action, user_id: userId, details })
}

async function requireUser(req: Request, admin: SupabaseClient) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: 'Invalid session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return data.user
}

async function getActiveConnection(admin: SupabaseClient): Promise<GmailConnectionRow | null> {
  const { data } = await admin
    .from('gmail_connections')
    .select('*')
    .eq('email', INTAKE_EMAIL)
    .eq('status', 'connected')
    .not('refresh_token_encrypted', 'is', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as GmailConnectionRow | null
}

async function getApprovedSenders(admin: SupabaseClient): Promise<ApprovedSender[]> {
  const { data, error } = await admin
    .from('gmail_approved_senders')
    .select('id, name, email, is_active')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return ((data as ApprovedSender[]) ?? []).filter((s) => s.email && s.email.trim())
}

async function refreshAccessToken(
  admin: SupabaseClient,
  conn: GmailConnectionRow,
): Promise<{ accessToken: string; conn: GmailConnectionRow }> {
  if (!conn.refresh_token_encrypted) throw new Error('Gmail not connected')

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (conn.access_token_encrypted && expiresAt > Date.now() + 60_000) {
    const accessToken = await decryptToken(conn.access_token_encrypted)
    return { accessToken, conn }
  }

  const refreshToken = await decryptToken(conn.refresh_token_encrypted)
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Google OAuth credentials not configured')

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await res.json()
  if (!res.ok) throw new Error(payload.error_description || payload.error || 'Token refresh failed')

  const accessToken = String(payload.access_token)
  const encryptedAccess = await encryptToken(accessToken)
  const tokenExpiresAt = new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString()

  const { data: updated, error } = await admin
    .from('gmail_connections')
    .update({
      access_token_encrypted: encryptedAccess,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conn.id)
    .select('*')
    .single()
  if (error) throw error
  return { accessToken, conn: updated as GmailConnectionRow }
}

async function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Gmail API error')
  return data
}

function isJpegMime(mime: string | undefined | null): boolean {
  const m = (mime || '').toLowerCase()
  return m === 'image/jpeg' || m === 'image/jpg' || m === 'image/pjpeg'
}

function isJpegFilename(name: string | undefined | null): boolean {
  const n = (name || '').toLowerCase()
  return n.endsWith('.jpg') || n.endsWith('.jpeg')
}

function parseEmailAddress(raw: string | undefined): { name: string; email: string } {
  if (!raw) return { name: '', email: '' }
  const m = raw.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/)
  if (m) return { name: (m[1] || '').trim(), email: m[2].trim().toLowerCase() }
  return { name: '', email: raw.trim().toLowerCase() }
}

function appRedirectBase(): string {
  return (
    Deno.env.get('GMAIL_SUCCESS_REDIRECT') ||
    Deno.env.get('APP_URL') ||
    'https://jaisalfw.netlify.app'
  )
}

function oauthRedirectUri(): string {
  return (
    Deno.env.get('GOOGLE_REDIRECT_URI') ||
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-intake`
  )
}

async function handleOAuthCallback(admin: SupabaseClient, code: string, state: string) {
  const { data: conn } = await admin
    .from('gmail_connections')
    .select('*')
    .eq('oauth_state', state)
    .eq('status', 'pending')
    .maybeSingle()

  if (!conn) {
    return redirect(`${appRedirectBase()}?gmail=error&reason=invalid_state`)
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    return redirect(`${appRedirectBase()}?gmail=error&reason=oauth_not_configured`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauthRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  const tokens = await tokenRes.json()
  if (!tokenRes.ok) {
    return redirect(`${appRedirectBase()}?gmail=error&reason=token_exchange`)
  }

  const profile = await gmailFetch(tokens.access_token, '/profile')
  const connectedEmail = String(profile.emailAddress || '').toLowerCase()
  const encryptedRefresh = tokens.refresh_token ? await encryptToken(tokens.refresh_token) : null
  const encryptedAccess = await encryptToken(tokens.access_token)
  const tokenExpiresAt = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString()

  await admin
    .from('gmail_connections')
    .update({
      status: 'connected',
      connected_email: connectedEmail,
      refresh_token_encrypted: encryptedRefresh || conn.refresh_token_encrypted,
      access_token_encrypted: encryptedAccess,
      token_expires_at: tokenExpiresAt,
      scopes: GMAIL_SCOPE,
      oauth_state: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conn.id)

  await audit(admin, 'connect', conn.connected_by || conn.user_id, {
    connected_email: connectedEmail,
    expected_email: INTAKE_EMAIL,
    account_match: connectedEmail === INTAKE_EMAIL.toLowerCase(),
  })

  const match = connectedEmail === INTAKE_EMAIL.toLowerCase() ? 'connected' : 'wrong_account'
  return redirect(`${appRedirectBase()}?gmail=${match}&email=${encodeURIComponent(connectedEmail)}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (req.method === 'GET' && code && state) {
      return await handleOAuthCallback(admin, code, state)
    }

    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    if (action === 'get-auth-url') {
      const user = await requireUser(req, admin)
      const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
      if (!clientId) return json({ error: 'Google OAuth not configured' }, 503)

      const oauthState = crypto.randomUUID()
      const payload = {
        user_id: user.id,
        email: INTAKE_EMAIL,
        status: 'pending',
        oauth_state: oauthState,
        connected_by: user.id,
        updated_at: new Date().toISOString(),
      }
      const { data: conn, error } = await admin
        .from('gmail_connections')
        .upsert(payload, { onConflict: 'user_id,email' })
        .select('*')
        .single()
      if (error) throw error

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: oauthRedirectUri(),
        response_type: 'code',
        scope: GMAIL_SCOPE,
        access_type: 'offline',
        prompt: 'select_account consent',
        state: oauthState,
        include_granted_scopes: 'true',
      })
      await audit(admin, 'connect_start', user.id, { email: INTAKE_EMAIL })
      return json({
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
        connectionId: conn.id,
      })
    }

    const user = await requireUser(req, admin)

    if (action === 'status') {
      const conn = await getActiveConnection(admin)
      const senders = await getApprovedSenders(admin)
      const connectedEmail = conn?.connected_email || null
      const accountMatch = connectedEmail
        ? connectedEmail.toLowerCase() === INTAKE_EMAIL.toLowerCase()
        : null
      return json({
        configured: !!(Deno.env.get('GOOGLE_CLIENT_ID') && Deno.env.get('GOOGLE_CLIENT_SECRET')),
        intakeEmail: INTAKE_EMAIL,
        connected: !!conn,
        connectedEmail,
        accountMatch,
        connectedAt: conn?.connected_at || null,
        senders: senders.map((s) => ({ id: s.id, name: s.name, email: s.email })),
      })
    }

    if (action === 'disconnect') {
      const conn = await getActiveConnection(admin)
      if (conn) {
        await admin
          .from('gmail_connections')
          .update({
            status: 'disconnected',
            refresh_token_encrypted: null,
            access_token_encrypted: null,
            token_expires_at: null,
            oauth_state: null,
            connected_email: null,
            connected_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id)
      }
      await audit(admin, 'disconnect', user.id, { email: INTAKE_EMAIL })
      return json({ ok: true })
    }

    if (action === 'list-emails') {
      const conn = await getActiveConnection(admin)
      if (!conn) return json({ error: 'Gmail not connected' }, 400)

      const connectedEmail = (conn.connected_email || '').toLowerCase()
      if (connectedEmail !== INTAKE_EMAIL.toLowerCase()) {
        return json({
          error: 'wrong_account',
          message: `Connected account is ${connectedEmail}, expected ${INTAKE_EMAIL}`,
          connectedEmail,
          intakeEmail: INTAKE_EMAIL,
        }, 403)
      }

      const senders = await getApprovedSenders(admin)
      if (!senders.length) {
        return json({ emails: [], warning: 'No approved senders with email configured' })
      }

      const { accessToken } = await refreshAccessToken(admin, conn)
      const search = String(body.search || '').trim()
      const senderFilter = String(body.senderEmail || '').trim().toLowerCase()
      const dateFrom = String(body.dateFrom || '').trim()
      const dateTo = String(body.dateTo || '').trim()
      const jpgOnly = body.jpgOnly !== false

      const senderEmails = senders
        .map((s) => s.email?.trim().toLowerCase())
        .filter(Boolean) as string[]
      const filteredSenders = senderFilter
        ? senderEmails.filter((e) => e === senderFilter)
        : senderEmails

      if (!filteredSenders.length) {
        return json({ emails: [] })
      }

      const fromClause = filteredSenders.map((e) => `from:${e}`).join(' OR ')
      let q = `(${fromClause}) has:attachment in:inbox -in:spam -in:trash`
      if (jpgOnly) q += ' (filename:jpg OR filename:jpeg)'
      if (dateFrom) q += ` after:${dateFrom.replace(/-/g, '/')}`
      if (dateTo) q += ` before:${dateTo.replace(/-/g, '/')}`
      if (search) q += ` ${search}`

      const list = await gmailFetch(
        accessToken,
        `/messages?maxResults=40&q=${encodeURIComponent(q)}`,
      )
      const messageIds: string[] = (list.messages || []).map((m: { id: string }) => m.id)

      const { data: imports } = await admin
        .from('gmail_design_imports')
        .select('gmail_message_id, gmail_attachment_id, din_id')
        .in('gmail_message_id', messageIds.length ? messageIds : ['__none__'])

      const importMap = new Map(
        (imports || []).map((r) => [
          `${r.gmail_message_id}:${r.gmail_attachment_id}`,
          r.din_id as string | null,
        ]),
      )

      const senderNameByEmail = new Map(
        senders.map((s) => [String(s.email).toLowerCase(), s.name]),
      )

      const emails: Array<Record<string, unknown>> = []

      for (const messageId of messageIds) {
        const msg = await gmailFetch(
          accessToken,
          `/messages/${messageId}?format=full`,
        )
        const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>
        const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || ''
        const fromRaw = headers.find((h) => h.name.toLowerCase() === 'from')?.value || ''
        const dateRaw = headers.find((h) => h.name.toLowerCase() === 'date')?.value || ''
        const from = parseEmailAddress(fromRaw)
        const receivedAt = dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString()

        if (!filteredSenders.includes(from.email)) continue

        const attachments: Array<{
          attachmentId: string
          filename: string
          mimeType: string
          size: number
        }> = []

        function walkParts(parts: Array<Record<string, unknown>> | undefined) {
          for (const part of parts || []) {
            const filename = String(part.filename || '')
            const mimeType = String(part.mimeType || '')
            const body = part.body as { attachmentId?: string; size?: number } | undefined
            if (body?.attachmentId && filename) {
              if (!jpgOnly || isJpegMime(mimeType) || isJpegFilename(filename)) {
                attachments.push({
                  attachmentId: body.attachmentId,
                  filename,
                  mimeType,
                  size: Number(body.size || 0),
                })
              }
            }
            walkParts(part.parts as Array<Record<string, unknown>> | undefined)
          }
        }
        walkParts(msg.payload?.parts as Array<Record<string, unknown>> | undefined)

        for (const att of attachments) {
          const key = `${messageId}:${att.attachmentId}`
          const dinId = importMap.get(key) || null
          emails.push({
            messageId,
            attachmentId: att.attachmentId,
            senderName: senderNameByEmail.get(from.email) || from.name || from.email,
            senderEmail: from.email,
            subject,
            receivedAt,
            attachmentFilename: att.filename,
            attachmentMime: att.mimeType,
            attachmentSize: att.size,
            imported: !!dinId || importMap.has(key),
            dinId,
          })
        }
      }

      await admin
        .from('gmail_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', conn.id)

      await audit(admin, 'list', user.id, { count: emails.length, search: search || null })

      return json({ emails })
    }

    if (action === 'import-attachment') {
      const messageId = String(body.messageId || '')
      const attachmentId = String(body.attachmentId || '')
      if (!messageId || !attachmentId) {
        return json({ error: 'messageId and attachmentId required' }, 400)
      }

      const { data: existing } = await admin
        .from('gmail_design_imports')
        .select('*, dins(id, din_number)')
        .eq('gmail_message_id', messageId)
        .eq('gmail_attachment_id', attachmentId)
        .maybeSingle()

      if (existing) {
        const din = (existing as { dins?: { id: string; din_number: string } }).dins
        return json({
          alreadyImported: true,
          importId: existing.id,
          dinId: existing.din_id,
          dinNumber: din?.din_number || null,
          imageUrl: existing.image_url,
          senderEmail: existing.sender_email,
          senderName: existing.sender_name,
          receivedAt: existing.received_at,
          attachmentFilename: existing.attachment_filename,
        })
      }

      const conn = await getActiveConnection(admin)
      if (!conn) return json({ error: 'Gmail not connected' }, 400)
      if ((conn.connected_email || '').toLowerCase() !== INTAKE_EMAIL.toLowerCase()) {
        return json({ error: 'wrong_account' }, 403)
      }

      const senders = await getApprovedSenders(admin)
      const allowedEmails = new Set(senders.map((s) => String(s.email).toLowerCase()))

      const { accessToken } = await refreshAccessToken(admin, conn)
      const msg = await gmailFetch(accessToken, `/messages/${messageId}?format=full`)
      const headers = (msg.payload?.headers || []) as Array<{ name: string; value: string }>
      const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || ''
      const fromRaw = headers.find((h) => h.name.toLowerCase() === 'from')?.value || ''
      const dateRaw = headers.find((h) => h.name.toLowerCase() === 'date')?.value || ''
      const from = parseEmailAddress(fromRaw)
      if (!allowedEmails.has(from.email)) {
        return json({ error: 'Sender not approved' }, 403)
      }

      let filename = ''
      let mimeType = ''
      function findAttachment(parts: Array<Record<string, unknown>> | undefined): boolean {
        for (const part of parts || []) {
          const body = part.body as { attachmentId?: string } | undefined
          if (body?.attachmentId === attachmentId) {
            filename = String(part.filename || 'design.jpg')
            mimeType = String(part.mimeType || 'image/jpeg')
            return true
          }
          if (findAttachment(part.parts as Array<Record<string, unknown>> | undefined)) return true
        }
        return false
      }
      findAttachment(msg.payload?.parts as Array<Record<string, unknown>> | undefined)

      if (!isJpegMime(mimeType) && !isJpegFilename(filename)) {
        return json({ error: 'Only JPG/JPEG attachments are supported' }, 400)
      }

      const attData = await gmailFetch(
        accessToken,
        `/messages/${messageId}/attachments/${attachmentId}`,
      )
      const raw = String(attData.data || '')
      const bin = atob(raw.replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)

      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
      const storagePath = `gmail/${Date.now()}-${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await admin.storage.from('din-images').upload(storagePath, bytes, {
        contentType: mimeType || 'image/jpeg',
        upsert: false,
      })
      if (uploadErr) throw uploadErr
      const { data: pub } = admin.storage.from('din-images').getPublicUrl(storagePath)
      const imageUrl = pub.publicUrl

      const senderName =
        senders.find((s) => String(s.email).toLowerCase() === from.email)?.name || from.name

      const { data: importRow, error: importErr } = await admin
        .from('gmail_design_imports')
        .insert({
          gmail_message_id: messageId,
          gmail_attachment_id: attachmentId,
          sender_email: from.email,
          sender_name: senderName,
          subject,
          received_at: dateRaw ? new Date(dateRaw).toISOString() : new Date().toISOString(),
          attachment_filename: filename,
          attachment_mime: mimeType,
          image_url: imageUrl,
          imported_by: user.id,
        })
        .select('*')
        .single()
      if (importErr) throw importErr

      await audit(admin, 'import', user.id, {
        messageId,
        attachmentId,
        filename,
        sender: from.email,
      })

      return json({
        alreadyImported: false,
        importId: importRow.id,
        imageUrl,
        senderEmail: from.email,
        senderName,
        subject,
        receivedAt: importRow.received_at,
        attachmentFilename: filename,
        messageId,
        attachmentId,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (err) {
    if (err instanceof Response) return err
    const message = err instanceof Error ? err.message : 'Gmail intake failed'
    return json({ error: message }, 500)
  }
})
