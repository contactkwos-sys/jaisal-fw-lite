const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

/**
 * DEPRECATED — DIN Costing Design Import uses browser Tesseract.js only.
 * No Anthropic / ANTHROPIC_API_KEY. Stub only (mirrors supabase/functions/design-ocr).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: 'design-ocr Edge Function retired',
      detail:
        'DIN Costing reads design sheets in the browser with Tesseract.js — no API key required. Update the app to latest main.',
      deprecated: true,
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
