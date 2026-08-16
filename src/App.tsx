import { useEffect, useState } from 'react'
import { BottomNav } from './components/BottomNav'
import { AuthProvider, useAuth } from './lib/auth'
import type { AppScreen } from './lib/nav'
import { AdminScreen } from './screens/AdminScreen'
import { AttendanceScreen } from './screens/AttendanceScreen'
import { CostingScreen } from './screens/CostingScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DesignScreen } from './screens/DesignScreen'
import { DispatchScreen } from './screens/DispatchScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MaintenanceScreen } from './screens/MaintenanceScreen'
import { ProductionScreen } from './screens/ProductionScreen'
import { PurchaseScreen } from './screens/PurchaseScreen'
import { StockScreen } from './screens/StockScreen'

function AppShell() {
  const { session, loading, isCeo } = useAuth()
  const [tab, setTab] = useState<AppScreen>('attendance')
  const [sub, setSub] = useState<string | undefined>()
  const [filter, setFilter] = useState<string | undefined>()

  // CEO lands on dashboard; others keep Phase 1 attendance home
  useEffect(() => {
    if (!session) return
    setTab(isCeo ? 'home' : 'attendance')
  }, [session, isCeo])

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

  function go(screen: AppScreen, nextSub?: string, nextFilter?: string) {
    setTab(screen)
    setSub(nextSub)
    setFilter(nextFilter)
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        {tab === 'home' ? (
          <DashboardScreen
            onNavigate={(t) => go(t.screen, t.sub, t.filter)}
          />
        ) : null}
        {tab === 'attendance' ? <AttendanceScreen /> : null}
        {tab === 'stock' ? <StockScreen /> : null}
        {tab === 'design' ? <DesignScreen /> : null}
        {tab === 'purchase' ? (
          <PurchaseScreen initialSub={(sub as 'weft' | 'beam_out' | 'beam_in' | 'warp') || 'weft'} />
        ) : null}
        {tab === 'production' ? (
          <ProductionScreen
            initialSub={(sub as 'job' | 'entry' | 'report') || 'job'}
            filter={filter}
          />
        ) : null}
        {tab === 'maintenance' ? (
          <MaintenanceScreen
            initialSub={(sub as 'request' | 'repair') || 'request'}
            filter={filter}
          />
        ) : null}
        {tab === 'dispatch' ? (
          <DispatchScreen
            initialSub={(sub as 'folding' | 'challan' | 'gatepass') || 'folding'}
            filter={filter}
          />
        ) : null}
        {tab === 'admin' ? (
          <AdminScreen initialSub={(sub as 'roles' | 'payroll' | 'approvals') || 'roles'} />
        ) : null}
        {tab === 'costing' ? (
          <CostingScreen initialSub={(sub as 'summary' | 'electricity') || 'summary'} />
        ) : null}
      </div>
      <BottomNav
        active={tab}
        isCeo={isCeo}
        onChange={(next) => go(next)}
      />
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
