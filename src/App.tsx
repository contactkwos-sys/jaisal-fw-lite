import { useState } from 'react'
import { BottomNav } from './components/BottomNav'
import { AuthProvider, useAuth } from './lib/auth'
import { AttendanceScreen } from './screens/AttendanceScreen'
import { DesignScreen } from './screens/DesignScreen'
import { LoginScreen } from './screens/LoginScreen'
import { StockScreen } from './screens/StockScreen'

type Tab = 'attendance' | 'stock' | 'design'

function AppShell() {
  const { session, loading } = useAuth()
  const [tab, setTab] = useState<Tab>('attendance')

  if (loading) {
    return (
      <div className="app-loading">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        {tab === 'attendance' ? <AttendanceScreen /> : null}
        {tab === 'stock' ? <StockScreen /> : null}
        {tab === 'design' ? <DesignScreen /> : null}
      </div>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
