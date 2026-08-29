/// <reference types="vite/client" />

declare const __APP_BUILD_ID__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_BUILD_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
