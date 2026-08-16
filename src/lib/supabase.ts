import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
}

/** Production uses hosted Supabase functions by default. */
const functionsUrl = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL || undefined

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
