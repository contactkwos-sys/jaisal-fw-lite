import { useCallback, useEffect, useState } from 'react'
import { checkForNewerBuild, forceAppRefresh } from '../lib/appUpdate'

/** Icon-only hard refresh — unregister SW, clear caches, reload. */
export function AppRefreshButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false)

  const onRefresh = useCallback(async () => {
    if (busy) return
    setBusy(true)
    try {
      await forceAppRefresh()
    } catch {
      setBusy(false)
      window.location.reload()
    }
  }, [busy])

  return (
    <button
      type="button"
      className={className ? `app-refresh-btn ${className}` : 'app-refresh-btn'}
      title="Refresh / Check for Updates"
      aria-label="Refresh / Check for Updates"
      disabled={busy}
      onClick={() => void onRefresh()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="app-refresh-ico">
        <path
          fill="currentColor"
          d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
        />
      </svg>
    </button>
  )
}

/** Silent build-id check → optional banner (does not auto-force reload). */
export function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = () => {
      void checkForNewerBuild().then((newer) => {
        if (!cancelled && newer) setUpdateAvailable(true)
      })
    }
    run()
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div className="app-update-banner" role="status">
      <span>New version available — Tap to refresh</span>
      <button
        type="button"
        className="app-update-banner-btn"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void forceAppRefresh().catch(() => {
            setBusy(false)
            window.location.reload()
          })
        }}
      >
        Refresh
      </button>
    </div>
  )
}
