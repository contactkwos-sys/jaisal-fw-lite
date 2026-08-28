import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

/**
 * Design reference OCR via Anthropic Vision.
 * Extracts DIN/Design No., Loom Pick, Feeders, Pick/Strings weft rows for DIN Costing.
 * Secret: ANTHROPIC_API_KEY (server-side only).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const imageBase64 = body.image_base64 as string | undefined
    const mediaType = (body.media_type as string) || 'image/jpeg'
    const subject = (body.subject as string) || ''
    const filename = (body.filename as string) || ''

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: 'image_base64 required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authHeader = req.headers.get('Authorization')
    if (supabaseUrl && anonKey && authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      await userClient.auth.getUser()
    }

    const prompt = `You are reading a textile jacquard DESIGN / DIN reference sheet for costing.
Extract ONLY costing-relevant fields. Return ONLY valid JSON (no markdown):

{
  "designNumber": { "value": "JFG2248", "confidence": "high"|"low"|"missing", "source": "image"|"subject"|"filename" },
  "loomPick": { "value": "56", "confidence": "high"|"low"|"missing" },
  "qualityName": { "value": "", "confidence": "high"|"low"|"missing" },
  "feeders": [
    { "feederNo": 1, "yarnType": "HSY", "confidence": "high"|"low"|"missing" }
  ],
  "weftRows": [
    { "pic": "28.00", "strings": "2222", "confidence": "high"|"low"|"missing" }
  ],
  "totalPick": { "value": "57.89", "confidence": "high"|"low"|"missing" },
  "totalStrings": { "value": "4594", "confidence": "high"|"low"|"missing" },
  "raw_text": "full OCR text of the document"
}

Rules:
- Design numbers look like JFG2248, JFG2249, JFG1591 (letters + digits). Do NOT use phone numbers, websites, or customer refs.
- Pick/Strings table rows are WEFT data — preserve EXACT order as shown (row 1 first, then row 2, etc.). Do NOT reorder.
- "Pick" column maps to pic; "Strings" column maps to strings.
- Feeders may appear as Feeder-1 HSY, FD.1 HSY, FD1=TEX, etc.
- Loom Pick is separate from individual weft PIC rows.
- If unsure, set confidence to "low" or "missing" — do not guess.
- Email subject hint: ${subject || '(none)'}
- Attachment filename hint: ${filename || '(none)'}`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(
        JSON.stringify({
          error: `Anthropic API error: ${anthropicRes.status}`,
          detail: errText.slice(0, 400),
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const result = await anthropicRes.json()
    const text =
      (result?.content ?? [])
        .filter((c: { type?: string }) => c.type === 'text')
        .map((c: { text?: string }) => c.text || '')
        .join('\n') || ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Could not parse OCR JSON', raw: text.slice(0, 800), raw_text: text }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const parsed = JSON.parse(jsonMatch[0])
    return new Response(JSON.stringify({ ...parsed, raw_text: parsed.raw_text || text }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Design OCR failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
