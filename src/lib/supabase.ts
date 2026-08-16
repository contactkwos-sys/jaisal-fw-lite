import { createClient } from '@supabase/supabase-js'

/** Hosted Jaisal project — anon/publishable key is safe to ship in the browser bundle. */
const PROJECT_URL = 'https://doitrzsyvcipugmrzykx.supabase.co'
const PROJECT_ANON_KEY = 'sb_publishable_OyI39Syi9VXJg34uLLuozA_yjFBSBeE'
/** Typo seen in Netlify env: digit `0` instead of letter `O` after `sb_publishable_`. */
const KNOWN_BAD_ANON_KEY = 'sb_publishable_0yI39Syi9VXJg34uLLuozA_yjFBSBeE'

function resolveAnonKey(raw: string | undefined): string {
  if (!raw || raw === KNOWN_BAD_ANON_KEY || raw.includes('your-publishable')) {
    return PROJECT_ANON_KEY
  }
  return raw
}

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PROJECT_URL
const anonKey = resolveAnonKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Using built-in Supabase URL/anon key defaults')
}

/** Production uses hosted Supabase functions by default. */
const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || undefined

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  ...(functionsUrl
    ? {
        functions: {
          url: functionsUrl,
        },
      }
    : {}),
})
