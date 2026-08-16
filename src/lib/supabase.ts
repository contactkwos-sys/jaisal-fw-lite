import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

function resolveFunctionsUrl() {
  const explicit = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
  if (explicit) return explicit
  if (import.meta.env.VITE_USE_LOCAL_FUNCTIONS === '1' && typeof window !== 'undefined') {
    return `${window.location.origin}/functions/v1`
  }
  return undefined
}

const functionsUrl = resolveFunctionsUrl()

export const supabase = createClient(url ?? '', anonKey ?? '', {
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
