/**
 * RETIRED — DIN Costing no longer performs OCR / auto-read of design sheets.
 * DIN sheet images are reference attachments only; all fields are entered manually.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  return new Response(
    JSON.stringify({
      error: 'design-ocr Edge Function retired',
      message:
        'DIN Costing does not use OCR. Upload the DIN sheet as a reference image and enter all fields manually.',
    }),
    { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } },
  )
})
