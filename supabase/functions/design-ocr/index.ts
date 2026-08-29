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
 * Extracts Design No., Feeder/Colour columns + Pick, TOTAL LOOM PICK for DIN Costing.
 * Secret: ANTHROPIC_API_KEY (server-side only).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'ANTHROPIC_API_KEY not configured',
          detail:
            'Set ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets, then retry Design Import.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const imageBase64 = body.image_base64 as string | undefined
    const mediaType = (body.media_type as string) || 'image/jpeg'
    const subject = (body.subject as string) || ''
    const filename = (body.filename as string) || ''

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return new Response(JSON.stringify({ error: 'image_base64 required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Reject obviously oversized payloads early (gateway timeout risk)
    if (imageBase64.length > 12_000_000) {
      return new Response(
        JSON.stringify({
          error: 'Image too large for OCR',
          detail: 'Compress/resize the photo (max ~8MB) and retry.',
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const authHeader = req.headers.get('Authorization')
    if (supabaseUrl && anonKey && authHeader) {
      try {
        const userClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        await userClient.auth.getUser()
      } catch {
        // Auth optional — OCR still runs for anon/session callers
      }
    }

    const prompt = `You are reading a textile jacquard DESIGN / DIN reference sheet for costing.
This is a DIN sheet from a diner (design vendor) — e.g. Aditya / Aditya Graphics is the DINER name on the letterhead, NOT a product/card name. Ignore diner branding.
The photo may be rotated 90°/180° or taken at an angle — mentally rotate so text is upright, then extract.
Extract ONLY costing-relevant fields. Return ONLY valid JSON (no markdown):

{
  "designNumber": { "value": "JFG1674", "confidence": "high"|"low"|"missing", "source": "image"|"subject"|"filename" },
  "loomPick": { "value": "112", "confidence": "high"|"low"|"missing" },
  "qualityName": { "value": "WXB", "confidence": "high"|"low"|"missing" },
  "feeders": [
    { "feederNo": 1, "yarnType": "HSY", "confidence": "high"|"low"|"missing", "sourceLabel": "Feeder 1" },
    { "feederNo": 2, "yarnType": "TEX", "confidence": "high"|"low"|"missing", "sourceLabel": "Feeder 2" }
  ],
  "weftRows": [
    { "pic": "25", "strings": "432", "confidence": "high"|"low"|"missing" },
    { "pic": "25", "strings": "432", "confidence": "high"|"low"|"missing" }
  ],
  "totalPick": { "value": "50", "confidence": "high"|"low"|"missing" },
  "totalStrings": { "value": "864", "confidence": "high"|"low"|"missing" },
  "raw_text": "full OCR text of the document"
}

Rules — DIN SHEET LAYOUTS FROM DINERS (all common):
1) DESIGN / DIN NUMBER (required):
   - Labels: "Design Number - …", "DESIGNE-NUMBER" (often misspelled with extra E), "DESI / Design No."
   - Values often include a QUALITY SUFFIX: "JFG2247 BRT", "jfg1738-wxb", "JFG-1674-wxb", "Design Number-jfg1738-wxb".
   - designNumber.value = letters+digits ONLY (e.g. JFG2247, JFG1738, JFG1674). Put the suffix (BRT, WXB) into qualityName.value.
   - NEVER use diner names (Aditya, Aditya Graphics), phone numbers (e.g. 9998309548), websites (adityagraphics.com), QR text, or Gmail/Yahoo chrome as the design number.
   - Filenames like jfg2247-50-brt.EP / jfg1738-wxb.jpg are strong hints for designNumber + qualityName.
2) Feeder / Colour rows (= filters; dynamic count 2, 3, …):
   - Layout A (common diner print): "feeder-1" / "feeder-2" with yarn in coloured cell (hsy, tex) + Pick + Strings columns.
   - Layout B: "Colour 1" … "Colour 6" table with Pick / Strings; skip rows where Pick and Strings are both 0.
   - Layout C: column-wise colour swatches left-to-right = Feeder 1, 2, 3…
   - Map row/column N → feeders[N] + weftRows[N].pic in the SAME order. Yarn blank → yarnType "-". zaree/zari/jari → "ZARI". hsy→HSY, tex→TEX.
3) TOTAL LOOM PICK = sum of the feeder/filter picks (2 filters, 3 filters, whatever is printed):
   - Prefer explicit "Total" pick, "112-pick", "on-loom-48", "TOTAL LOOM PICK".
   - Else SUM of active feeder/colour Pick values → loomPick AND totalPick.
4) Strings column is optional reference only — empty string OK; never invent strings.
5) Preserve EXACT feeder/colour order. Do NOT reorder. Skip Pick 0 rows.
6) If unsure, set confidence to "low" or "missing" — do not guess.
- Email subject hint: ${subject || '(none)'}
- Attachment filename hint: ${filename || '(none)'}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)

    let anthropicRes: Response
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
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
    } catch (e) {
      clearTimeout(timeout)
      const msg = e instanceof Error ? e.message : 'Anthropic request failed'
      const timedOut = /abort/i.test(msg)
      return new Response(
        JSON.stringify({
          error: timedOut ? 'OCR timed out' : 'OCR request failed',
          detail: timedOut
            ? 'Vision API took too long — try a clearer/smaller photo.'
            : msg,
        }),
        { status: timedOut ? 504 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } finally {
      clearTimeout(timeout)
    }

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

    // Ensure loomPick is filled from feeder pick sum when vision omitted it
    try {
      const weftRows = Array.isArray(parsed.weftRows) ? parsed.weftRows : []
      const sumPics = weftRows.reduce(
        (s: number, r: { pic?: string }) => s + (Number(r?.pic) || 0),
        0,
      )
      if ((!parsed.loomPick?.value || parsed.loomPick.confidence === 'missing') && sumPics > 0) {
        const v = String(Math.round(sumPics * 100) / 100)
        parsed.loomPick = { value: v, confidence: 'high', source: 'sum_feeder_picks' }
        if (!parsed.totalPick?.value) {
          parsed.totalPick = { value: v, confidence: 'high', source: 'sum_feeder_picks' }
        }
      }
    } catch {
      // keep parsed as-is
    }

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
