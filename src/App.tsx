import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { AuthProvider, useAuth } from './lib/auth'
import type { AppScreen } from './lib/nav'
import { AdminScreen } from './screens/AdminScreen'
import { AttendanceScreen } from './screens/AttendanceScreen'
import { CostingScreen } from './screens/CostingScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DesignBroadcastScreen } from './screens/DesignBroadcastScreen'
import { DesignScreen } from './screens/DesignScreen'
import { DispatchScreen } from './screens/DispatchScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MaintenanceScreen } from './screens/MaintenanceScreen'
import { OrderBookScreen } from './screens/OrderBookScreen'
import { PartyMasterScreen } from './screens/PartyMasterScreen'
import { ProductionScreen } from './screens/ProductionScreen'
import { ProgramScreen } from './screens/ProgramScreen'
import { PurchaseScreen } from './screens/PurchaseScreen'
import { SecurityGateScreen } from './screens/SecurityGateScreen'
import { StockScreen } from './screens/StockScreen'
import { SampleJobCard } from './pages/SampleJobCard'
import { SampleRegister } from './pages/SampleRegister'
import { BeamRemainingReport } from './pages/BeamRemainingReport'
import { DesignWiseCosting } from './pages/DesignWiseCosting'
import { DesignCatalogScreen } from './screens/DesignCatalogScreen'
import { CrmCustomersScreen } from './screens/CrmCustomersScreen'

function AuthenticatedApp() {
  const { session, loading, isCeo } = useAuth()
  const [tab, setTab] = useState<AppScreen>('attendance')
  const [sub, setSub] = useState<string | undefined>()
  const [filter, setFilter] = useState<string | undefined>()

  useEffect(() => {
    if (!session) return
    setTab(isCeo ? 'home' : 'attendance')
    setSub(undefined)
    setFilter(undefined)
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
    <AppShell
      active={tab}
      sub={sub}
      isCeo={isCeo}
      onNavigate={(t) => go(t.screen, t.sub, t.filter)}
    >
      {tab === 'home' ? (
        <DashboardScreen onNavigate={(t) => go(t.screen, t.sub, t.filter)} />
      ) : null}
      {tab === 'attendance' ? <AttendanceScreen /> : null}
      {tab === 'stock' ? (
        <StockScreen
          initialTab={(sub as 'beam' | 'weft') || 'beam'}
          onTabChange={(t) => setSub(t)}
        />
      ) : null}
      {tab === 'design' ? (
        <DesignScreen onOpenDesignCosting={(dno) => go('design-wise-costing', undefined, dno)} />
      ) : null}
      {tab === 'broadcast' ? <DesignBroadcastScreen initialDesignId={filter} /> : null}
      {tab === 'design-catalog' ? <DesignCatalogScreen /> : null}
      {tab === 'crm' ? <CrmCustomersScreen /> : null}
      {tab === 'parties' ? <PartyMasterScreen /> : null}
      {tab === 'purchase' ? (
        <PurchaseScreen initialSub={sub || 'general'} />
      ) : null}
      {tab === 'orders' ? <OrderBookScreen initialSub={sub || 'entry'} /> : null}
      {tab === 'programs' ? <ProgramScreen initialSub={sub || 'create'} /> : null}
      {tab === 'security' ? <SecurityGateScreen initialSub={sub || 'inward'} /> : null}
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
      {tab === 'sample-job-card' ? <SampleJobCard /> : null}
      {tab === 'sample-register' ? <SampleRegister /> : null}
      {tab === 'beam-remaining' ? <BeamRemainingReport /> : null}
      {tab === 'design-wise-costing' ? (
        <DesignWiseCosting initialDin={filter || ''} />
      ) : null}
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  )
}
