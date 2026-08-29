import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const pagesBase = process.env.GITHUB_PAGES === 'true' ? '/jaisal-fw-lite/' : '/'

/** Emit build-id.json + inject __APP_BUILD_ID__ for silent update checks. */
function buildIdPlugin(): Plugin {
  const buildId =
    process.env.VITE_BUILD_ID ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  process.env.VITE_BUILD_ID = buildId
  return {
    name: 'jaisal-build-id',
    config() {
      return {
        define: {
          __APP_BUILD_ID__: JSON.stringify(buildId),
          'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
        },
      }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-id.json',
        source: JSON.stringify({ id: buildId, builtAt: new Date().toISOString() }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [react(), buildIdPlugin()],
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
