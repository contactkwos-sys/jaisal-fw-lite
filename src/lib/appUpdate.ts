/**
 * PWA / browser cache bust helpers.
 * Unregisters service workers, clears Cache Storage, hard-reloads.
 */

declare const __APP_BUILD_ID__: string | undefined

export function getAppBuildId(): string {
  try {
    if (typeof __APP_BUILD_ID__ === 'string' && __APP_BUILD_ID__) return __APP_BUILD_ID__
  } catch {
    /* define missing in some test envs */
  }
  return (import.meta.env.VITE_BUILD_ID as string | undefined) || 'dev'
}

/** Unregister SW + clear Cache Storage, then hard-reload (bypass HTTP cache). */
export async function forceAppRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href)
  url.searchParams.set('_refresh', String(Date.now()))
  // Replace so back button doesn't re-hit the stale URL
  window.location.replace(url.toString())
}

type BuildIdPayload = { id?: string; buildId?: string }

/**
 * Fetch /build-id.json with no-cache and compare to the JS-embedded build id.
 * Returns true when a newer (different) build is available on the server.
 */
export async function checkForNewerBuild(): Promise<boolean> {
  const current = getAppBuildId()
  if (!current || current === 'dev') return false
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}build-id.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
    })
    if (!res.ok) return false
    const data = (await res.json()) as BuildIdPayload
    const remote = String(data.id || data.buildId || '').trim()
    if (!remote) return false
    return remote !== current
  } catch {
    return false
  }
}
