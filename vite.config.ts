import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pagesBase = process.env.GITHUB_PAGES === 'true' ? '/jaisal-fw-lite/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // Local edge-function stand-in until Supabase Management deploy token is available
      '/functions/v1': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
      },
    },
  },
})
