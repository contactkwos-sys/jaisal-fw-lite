import type { ReactNode } from 'react'
import { useEffect, useId, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  MAIN_MODULES,
  isSubItemActive,
  moduleById,
  moduleForScreen,
  titleFor,
  type AppScreen,
  type MainModuleId,
  type NavTarget,
} from '../lib/nav'
import { canAccessModule, canAccessSub } from '../lib/permissions'
import { todayISO } from '../lib/mutate'

type Props = {
  active: AppScreen
  sub?: string
  filter?: string
  activeModule: MainModuleId
  onNavigate: (t: NavTarget) => void
  children: ReactNode
}

const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h7v7H4v-7zm9-3h7v10h-7V10z"
      />
    </svg>
  ),
  production: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-4h2v18h-2V3zm4 8h2v10h-2V11zm4-3h2v13h-2V8z"
      />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M4 7l8-4 8 4v2H4V7zm0 3h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9zm4 2v2h8v-2H8z"
      />
    </svg>
  ),
  'cash-book': (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm2 2v12h14V6H6zm3 2h3a3 3 0 1 1 0 6H9v2H7V8h2zm0 2v2h3a1 1 0 1 0 0-2H9z"
      />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M7 4h10a2 2 0 0 1 2 2v14l-7-3-7 3V6a2 2 0 0 1 2-2zm2 4v2h6V8H9zm0 4v2h6v-2H9z"
      />
    </svg>
  ),
  'design-to-order': (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M4 4h7v7H4V4zm9 0h7v4h-7V4zM4 13h7v7H4v-7zm9 2h3v2h-3v-2zm4 0h3v5h-7v-2h4v-3zm-4 3h3v2h-3v-2z"
      />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M5 3h14a1 1 0 0 1 1 1v16l-8-3-8 3V4a1 1 0 0 1 1-1zm3 4v2h8V7H8zm0 4v2h5v-2H8z"
      />
    </svg>
  ),
  maintenance: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M21 10.5a6.5 6.5 0 0 1-9.7 5.7L5 22l-3-3 5.8-6.3A6.5 6.5 0 1 1 21 10.5zm-3.5.5a3 3 0 1 0-6 0 3 3 0 0 0 6 0z"
      />
    </svg>
  ),
  'hr-payroll': (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.33 0-10 1.67-10 5v1h20v-1c0-3.33-6.67-5-10-5zm8-9h-2v2h-2v2h2v2h2v-2h2V7h-2z"
      />
    </svg>
  ),
  'program-dispatch': (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M3 5h18v2H3V5zm0 4h12v2H3V9zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm16-5l4 3-4 3v-6z"
      />
    </svg>
  ),
  'warp-yarn': (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm2 3v6h12V9H6zm2 2h2v2H8v-2zm4 0h2v2h-2v-2z"
      />
    </svg>
  ),
  'daily-pending-work': (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M7 2h10a2 2 0 0 1 2 2v16l-7-3-7 3V4a2 2 0 0 1 2-2zm1 4v2h8V6H8zm0 4v2h5v-2H8zm0 4v2h8v-2H8z"
      />
    </svg>
  ),
  masters: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M12 3l9 4v2H3V7l9-4zm-7 8h3v8H5v-8zm5 0h4v8h-4v-8zm6 0h3v8h-3v-8z"
      />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3zm0 5a3 3 0 0 0-3 3v1H8v6h8v-6h-1V10a3 3 0 0 0-3-3zm0 2a1 1 0 0 1 1 1v1h-2v-1a1 1 0 0 1 1-1z"
      />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="nav-ico">
      <path
        fill="currentColor"
        d="M19.14 12.94a7.4 7.4 0 0 0 .06-1 7.4 7.4 0 0 0-.06-1l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.73-1L14.5 2.5a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.5l-.38 2.54a7.1 7.1 0 0 0-1.73 1l-2.39-.96a.5.5 0 0 0-.6.22L2.48 8.72a.5.5 0 0 0 .12.64L4.63 11a7.4 7.4 0 0 0-.06 1 7.4 7.4 0 0 0 .06 1l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96a7.1 7.1 0 0 0 1.73 1l.38 2.54a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5l.38-2.54a7.1 7.1 0 0 0 1.73-1l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"
      />
    </svg>
  ),
}

export function AppShell({ active, sub, filter, activeModule, onNavigate, children }: Props) {
  const { logout, profile, isCeo, roleName: authRoleName } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [expanded, setExpanded] = useState<MainModuleId | null>(activeModule)
  const brandId = useId()
  const today = todayISO()
  const pageTitle = titleFor(active, sub, activeModule, filter)
  const roleName = authRoleName || (isCeo ? 'CEO' : 'User')
  const userName = profile?.full_name || roleName

  const modules = MAIN_MODULES.filter((m) => canAccessModule(roleName, m.id))

  useEffect(() => {
    setExpanded(activeModule)
  }, [activeModule])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen)
    return () => document.body.classList.remove('drawer-open')
  }, [drawerOpen])

  function openModule(id: MainModuleId) {
    const mod = moduleById(id)
    if (mod.hasHub) {
      onNavigate({ screen: 'module-hub', sub: id, filter: id, module: id, hub: id })
    } else {
      onNavigate({ screen: mod.screen, sub: mod.sub, module: id })
    }
    setExpanded(id)
    setDrawerOpen(false)
  }

  function openSub(moduleId: MainModuleId, itemId: string) {
    const mod = moduleById(moduleId)
    const item = mod.items.find((i) => i.id === itemId)
    if (!item) return
    onNavigate({
      screen: item.screen,
      sub: item.sub,
      filter: item.filter,
      module: moduleId,
    })
    setDrawerOpen(false)
  }

  const bottom = modules.filter((m) => m.mobileNav).slice(0, 4)

  return (
    <div className={drawerOpen ? 'app-shell drawer-is-open' : 'app-shell'} data-screen={active}>
      <header className="mobile-topbar">
        <button
          type="button"
          className="hamburger"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          aria-controls="app-sidebar"
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <span className="hamburger-bars" aria-hidden="true" />
        </button>
        <div className="mobile-topbar-brand">
          <span className="mobile-brand-name">JAISAL FW</span>
          <span className="mobile-topbar-title">{pageTitle}</span>
        </div>
        <span className="mobile-role-chip">{roleName}</span>
      </header>

      <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <aside id="app-sidebar" className="app-sidebar" aria-labelledby={brandId}>
        <div className="sidebar-brand">
          <div id={brandId} className="sidebar-brand-name">
            JAISAL FW
          </div>
          <div className="sidebar-brand-sub">Fashionweave Industries</div>
        </div>

        <nav className="side-nav" aria-label="Main">
          <ul className="side-nav-list">
            {modules.map((mod) => {
              const isActive = activeModule === mod.id
              const isOpen = expanded === mod.id
              const visibleItems = mod.items.filter((item) => canAccessSub(roleName, mod.id, item.id))
              return (
                <li key={mod.id} className={isActive ? 'side-nav-group active' : 'side-nav-group'}>
                  <button
                    type="button"
                    className={isActive ? 'side-nav-item active' : 'side-nav-item'}
                    aria-current={isActive && !mod.hasHub ? 'page' : undefined}
                    onClick={() => openModule(mod.id)}
                  >
                    <span className="side-nav-ico">{ICONS[mod.icon]}</span>
                    <span className="side-nav-label">{mod.label}</span>
                  </button>
                  {visibleItems.length && (isOpen || isActive) ? (
                    <ul className="side-sub-list">
                      {visibleItems.map((item) => {
                        const subActive = isSubItemActive(item, active, sub, filter)
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              className={subActive ? 'side-sub-item active' : 'side-sub-item'}
                              onClick={() => openSub(mod.id, item.id)}
                            >
                              {item.label}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-lock" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="nav-ico">
                <path
                  fill="currentColor"
                  d="M12 2a5 5 0 0 1 5 5v2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v2h6V7a3 3 0 0 0-3-3z"
                />
              </svg>
            </div>
            <div>
              <div className="sidebar-user-label">Logged in as</div>
              <div className="sidebar-user-name">{roleName}</div>
            </div>
          </div>
          <button type="button" className="side-nav-item side-nav-logout" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-content">
        <div className="content-topbar">
          <div>
            <h1 className="content-page-title">{pageTitle}</h1>
            <div className="content-meta">
              <span>{formatDate(today)}</span>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span>Day Shift</span>
              <span className="meta-dot" aria-hidden="true">
                ·
              </span>
              <span>{userName}</span>
            </div>
          </div>
          <div className="content-top-actions" aria-hidden="true">
            <span className="top-action-dot" />
          </div>
        </div>
        <main className="app-main">{children}</main>
      </div>

      <nav className="bottom-nav" aria-label="Quick modules">
        {bottom.map((mod) => {
          const isActive = activeModule === mod.id || moduleForScreen(active, sub, filter) === mod.id
          return (
            <button
              key={mod.id}
              type="button"
              className={isActive ? 'bottom-nav-item active' : 'bottom-nav-item'}
              onClick={() => openModule(mod.id)}
            >
              <span className="bottom-nav-ico">{ICONS[mod.icon]}</span>
              <span>{mod.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
