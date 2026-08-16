import { useAuth } from '../lib/auth'

type Tab = 'attendance' | 'stock' | 'design'

type Props = {
  active: Tab
  onChange: (tab: Tab) => void
}

export function BottomNav({ active, onChange }: Props) {
  const { logout } = useAuth()

  return (
    <nav className="bottom-nav" aria-label="Main">
      <button
        type="button"
        className={active === 'attendance' ? 'nav-item active' : 'nav-item'}
        onClick={() => onChange('attendance')}
      >
        Attendance
      </button>
      <button
        type="button"
        className={active === 'stock' ? 'nav-item active' : 'nav-item'}
        onClick={() => onChange('stock')}
      >
        Stock
      </button>
      <button
        type="button"
        className={active === 'design' ? 'nav-item active' : 'nav-item'}
        onClick={() => onChange('design')}
      >
        Design
      </button>
      <button type="button" className="nav-item nav-logout" onClick={() => void logout()}>
        Logout
      </button>
    </nav>
  )
}
