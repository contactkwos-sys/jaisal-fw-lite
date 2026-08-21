import { useEffect, useRef, useState } from 'react'
import { AppShell } from './components/AppShell'
import { ModuleHub } from './components/ModuleHub'
import { PlaceholderScreen } from './components/PlaceholderScreen'
import { AuthProvider, useAuth } from './lib/auth'
import {
  moduleForScreen,
  titleFor,
  type AppScreen,
  type MainModuleId,
  type NavTarget,
} from './lib/nav'
import { firstAllowedLanding } from './lib/permissions'
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
import { CashBookScreen } from './screens/CashBookScreen'
import { WarpBeamPipeScreen } from './screens/WarpBeamPipeScreen'
import { WarpYarnManagementScreen } from './screens/WarpYarnManagementScreen'
import { YarnInwardScreen } from './screens/YarnInwardScreen'
import { MaintenanceMaterialScreen } from './screens/MaintenanceMaterialScreen'
import { LoanTrackerScreen } from './screens/LoanTrackerScreen'
import { GebReadingScreen } from './screens/GebReadingScreen'
import { OrdersPendingScreen } from './screens/OrdersPendingScreen'
import { DesignToOrderHub } from './screens/DesignToOrderHub'
import { DinIntakeScreen } from './screens/DinIntakeScreen'
import { DtoSampleJobScreen } from './screens/DtoSampleJobScreen'
import { DtoSampleTrackingScreen } from './screens/DtoSampleTrackingScreen'
import { DtoOrderBookingScreen } from './screens/DtoOrderBookingScreen'
import { DtoOrderStatusScreen } from './screens/DtoOrderStatusScreen'
import { DtoSamplePromotionScreen } from './screens/DtoSamplePromotionScreen'
import { DtoFollowupScreen } from './screens/DtoFollowupScreen'
import { DtoReportsScreen } from './screens/DtoReportsScreen'
import { HrPayrollScreen } from './screens/HrPayrollScreen'
import { ProgramDispatchScreen } from './screens/ProgramDispatchScreen'
import { SecurityInventoryScreen, type SiSub } from './screens/SecurityInventoryScreen'

function AuthenticatedApp() {
  const { session, loading, isCeo, isManager, roleName } = useAuth()
  const [tab, setTab] = useState<AppScreen>('home')
  const [sub, setSub] = useState<string | undefined>()
  const [filter, setFilter] = useState<string | undefined>()
  const [activeModule, setActiveModule] = useState<MainModuleId>('dashboard')
  /** Prevent auth/profile refreshes from kicking the user off Design Broadcast etc. */
  const landedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!session?.user?.id) {
      landedUserIdRef.current = null
      return
    }
    if (loading) return
    // Land once per login — TOKEN_REFRESHED / profile re-fetch must not reset the screen
    if (landedUserIdRef.current === session.user.id) return
    landedUserIdRef.current = session.user.id
    const landing = firstAllowedLanding(roleName || (isCeo ? 'CEO' : 'User'))
    setTab(landing.screen)
    setSub(landing.sub)
    setFilter(landing.module === landing.sub ? landing.module : undefined)
    setActiveModule(landing.module)
  }, [session, loading, roleName, isCeo])

  // Hard-block Manager from CEO Dashboard route
  useEffect(() => {
    if (!session || !isManager || isCeo) return
    if (tab === 'home' || activeModule === 'dashboard') {
      const landing = firstAllowedLanding('Manager')
      setTab(landing.screen)
      setSub(landing.sub)
      setFilter(landing.module === landing.sub ? landing.module : undefined)
      setActiveModule(landing.module)
    }
  }, [session, isManager, isCeo, tab, activeModule])

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-brand">
          <strong>JAISAL FW</strong>
          <p className="text-muted">Loading…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <LoginScreen />
  }

  function go(t: NavTarget) {
    if (isManager && (t.screen === 'home' || t.module === 'dashboard' || t.hub === 'dashboard')) {
      return
    }
    const nextScreen = t.screen
    const nextSub = t.hub || t.sub
    // Prefer explicit filter (including undefined) when provided so hub opens clear a prior DIN
    const nextFilter = Object.prototype.hasOwnProperty.call(t, 'filter')
      ? t.filter
      : t.hub
        ? t.hub
        : undefined
    setTab(nextScreen)
    setSub(nextSub)
    setFilter(nextFilter)
    setActiveModule(t.module || t.hub || moduleForScreen(nextScreen, nextSub, nextFilter))
  }

  const hubModule = (sub as MainModuleId) || activeModule

  return (
    <AppShell
      active={tab}
      sub={sub}
      filter={filter}
      activeModule={activeModule}
      onNavigate={go}
    >
      {tab === 'home' ? <DashboardScreen onNavigate={go} /> : null}
      {tab === 'module-hub' ? (
        <ModuleHub moduleId={hubModule} onNavigate={go} />
      ) : null}
      {tab === 'placeholder' ? (
        <PlaceholderScreen title={titleFor('placeholder', undefined, undefined, filter)} />
      ) : null}
      {tab === 'attendance' ? <AttendanceScreen /> : null}
      {tab === 'hr-payroll' ? (
        <HrPayrollScreen
          initialSub={sub || 'dashboard'}
          onNavigate={go}
        />
      ) : null}
      {tab === 'stock' ? (
        <StockScreen
          initialTab={(sub as 'beam' | 'weft') || 'beam'}
          onTabChange={(t) => setSub(t)}
        />
      ) : null}
      {tab === 'design' ? (
        <DesignScreen onOpenDesignCosting={(dno) => go({ screen: 'design-wise-costing', filter: dno, module: 'orders' })} />
      ) : null}
      {tab === 'broadcast' ? <DesignBroadcastScreen initialDesignId={filter} /> : null}
      {tab === 'design-catalog' ? <DesignCatalogScreen /> : null}
      {tab === 'crm' ? <CrmCustomersScreen /> : null}
      {tab === 'cash-book' ? <CashBookScreen /> : null}
      {tab === 'warp-beam-pipe' ? <WarpBeamPipeScreen /> : null}
      {tab === 'warp-yarn' ? (
        <WarpYarnManagementScreen
          initialTab={
            (['overview', 'machines', 'godown', 'empty', 'warper', 'reports'].includes(sub || '')
              ? sub
              : 'overview') as 'overview' | 'machines' | 'godown' | 'empty' | 'warper' | 'reports'
          }
          onNavigate={go}
          onTabChange={(t) => setSub(t)}
        />
      ) : null}
      {tab === 'yarn-inward' ? <YarnInwardScreen /> : null}
      {tab === 'maint-material' ? <MaintenanceMaterialScreen /> : null}
      {tab === 'loan-tracker' ? <LoanTrackerScreen /> : null}
      {tab === 'geb-readings' ? <GebReadingScreen /> : null}
      {tab === 'orders-pending' ? <OrdersPendingScreen /> : null}
      {tab === 'program-dispatch' ? (
        <ProgramDispatchScreen initialSub={sub || 'pto'} onNavigate={go} />
      ) : null}
      {tab === 'security-inventory' ? (
        <SecurityInventoryScreen
          initialSub={
            ([
              'dashboard',
              'warp',
              'weft',
              'maint-in',
              'maint-out',
              'general',
              'others',
              'pending',
              'documents',
              'reports',
            ].includes(sub || '')
              ? sub
              : 'dashboard') as SiSub
          }
          onSubChange={(s) => setSub(s)}
          onNavigate={go}
        />
      ) : null}
      {tab === 'parties' ? <PartyMasterScreen /> : null}
      {tab === 'purchase' ? <PurchaseScreen initialSub={sub || 'general'} /> : null}
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
          initialSub={(sub as 'overview' | 'request' | 'repair' | 'history') || 'overview'}
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
        <AdminScreen initialSub={(sub as 'roles' | 'payroll' | 'approvals' | 'permissions') || 'roles'} />
      ) : null}
      {tab === 'costing' ? (
        <CostingScreen initialSub={(sub as 'summary' | 'electricity') || 'summary'} />
      ) : null}
      {tab === 'sample-job-card' ? <SampleJobCard /> : null}
      {tab === 'sample-register' ? <SampleRegister /> : null}
      {tab === 'beam-remaining' ? <BeamRemainingReport /> : null}
      {tab === 'design-wise-costing' ? (
        <DesignWiseCosting
          initialDin={
            filter &&
            ![
              'reports',
              'orders',
              'production',
              'inventory',
              'dashboard',
              'maintenance',
              'masters',
              'security',
              'settings',
              'cash-book',
              'design-to-order',
              'hr-payroll',
              'program-dispatch',
              'warp-yarn',
            ].includes(filter)
              ? filter
              : ''
          }
        />
      ) : null}
      {tab === 'dto-hub' ? <DesignToOrderHub onNavigate={go} /> : null}
      {tab === 'dto-intake' ? <DinIntakeScreen onNavigate={go} /> : null}
      {tab === 'dto-sample-job' ? <DtoSampleJobScreen onNavigate={go} initialDinId={filter} /> : null}
      {tab === 'dto-tracking' ? <DtoSampleTrackingScreen onNavigate={go} initialDinId={filter} /> : null}
      {tab === 'dto-order-booking' ? (
        <DtoOrderBookingScreen onNavigate={go} initialDinNumber={filter} />
      ) : null}
      {tab === 'dto-order-status' ? <DtoOrderStatusScreen onNavigate={go} /> : null}
      {tab === 'dto-promotion' ? (
        <DtoSamplePromotionScreen onNavigate={go} initialDinId={filter} />
      ) : null}
      {tab === 'dto-followup' ? <DtoFollowupScreen /> : null}
      {tab === 'dto-reports' ? <DtoReportsScreen onNavigate={go} /> : null}
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
