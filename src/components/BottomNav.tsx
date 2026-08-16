import { useAuth } from '../lib/auth'
import type { AppScreen } from '../lib/nav'

type Props = {
  active: AppScreen
  isCeo: boolean
  onChange: (tab: AppScreen) => void
}

const BASE_TABS: Array<{ id: AppScreen; label: string }> = [
  { id: 'attendance', label: 'Attend' },
  { id: 'stock', label: 'Stock' },
  { id: 'purchase', label: 'Inward' },
  { id: 'production', label: 'Prod' },
  { id: 'maintenance', label: 'Maint' },
  { id: 'dispatch', label: 'Out' },
  { id: 'design', label: 'Design' },
  { id: 'admin', label: 'Admin' },
]

export function BottomNav({ active, isCeo, onChange }: Props) {
  const { logout } = useAuth()
  const tabs = [
    ...(isCeo ? [{ id: 'home' as AppScreen, label: 'Home' }] : []),
    ...BASE_TABS,
    ...(isCeo ? [{ id: 'costing' as AppScreen, label: 'Cost' }] : []),
  ]

  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-scroll">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={active === t.id ? 'nav-item active' : 'nav-item'}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
        <button type="button" className="nav-item nav-logout" onClick={() => void logout()}>
          Out
        </button>
      </div>
    </nav>
  )
}
