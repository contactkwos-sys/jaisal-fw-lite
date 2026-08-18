import { useEffect, useId, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import {
  ADMIN_NAV,
  PRIMARY_NAV,
  isNavItemActive,
  titleFor,
  type AppScreen,
  type NavItem,
  type NavTarget,
} from '../lib/nav'
import { todayISO } from '../lib/mutate'

type Props = {
  active: AppScreen
  sub?: string
  isCeo: boolean
  onNavigate: (t: NavTarget) => void
  children: ReactNode
}

function NavList({
  items,
  active,
  sub,
  onSelect,
}: {
  items: NavItem[]
  active: AppScreen
  sub?: string
  onSelect: (item: NavItem) => void
}) {
  return (
    <ul className="side-nav-list">
      {items.map((item) => {
        const isActive = isNavItemActive(item, active, sub)
        return (
          <li key={item.id}>
            <button
              type="button"
              className={isActive ? 'side-nav-item active' : 'side-nav-item'}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(item)}
            >
              {item.label}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function AppShell({ active, sub, isCeo, onNavigate, children }: Props) {
  const { logout, profile } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const brandId = useId()
  const today = todayISO()
  const pageTitle = titleFor(active, sub)
  const roleName = profile?.roles?.role_name || profile?.full_name || 'User'
  const userName = profile?.full_name || roleName

  const primary = PRIMARY_NAV.filter((i) => !i.ceoOnly || isCeo)
  const admin = ADMIN_NAV.filter((i) => !i.ceoOnly || isCeo)

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

  function select(item: NavItem) {
    onNavigate({ screen: item.screen, sub: item.sub })
    setDrawerOpen(false)
  }

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
          <span aria-hidden="true">☰</span>
        </button>
        <div className="mobile-topbar-title">{pageTitle}</div>
      </header>

      <div
        className="drawer-backdrop"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside id="app-sidebar" className="app-sidebar" aria-labelledby={brandId}>
        <div className="sidebar-brand">
          <div id={brandId} className="sidebar-brand-name">
            JAISAL FW
          </div>
          <div className="sidebar-brand-sub">Fashionweave Industries</div>
        </div>

        <nav className="side-nav" aria-label="Main">
          <NavList items={primary} active={active} sub={sub} onSelect={select} />
          <div className="side-nav-group-label">ADMIN</div>
          <NavList items={admin} active={active} sub={sub} onSelect={select} />
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="side-nav-item side-nav-logout"
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-content">
        <div className="content-topbar">
          <h1 className="content-page-title">{pageTitle}</h1>
          <div className="content-meta">
            <span>{today}</span>
            <span className="meta-dot" aria-hidden="true">
              ·
            </span>
            <span>Day shift</span>
            <span className="meta-dot" aria-hidden="true">
              ·
            </span>
            <span>{userName}</span>
          </div>
        </div>
        <main className="app-main">{children}</main>
      </div>
    </div>
  )
}
