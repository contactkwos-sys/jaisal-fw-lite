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
import { firstAllowedLanding, DESIGN_MASTER_SCREENS, isSalesmanRole } from './lib/permissions'
import { AdminScreen } from './screens/AdminScreen'
import { AttendanceScreen } from './screens/AttendanceScreen'
import { CostingScreen } from './screens/CostingScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DesignBroadcastScreen } from './screens/DesignBroadcastScreen'
import { DesignScreen } from './screens/DesignScreen'
import { DispatchScreen } from './screens/DispatchScreen'
import { LoginScreen } from './screens/LoginScreen'
import { MaintenanceScreen } from './screens/MaintenanceScreen'
import { MachineWiseMaintenanceScreen } from './screens/MachineWiseMaintenanceScreen'
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
import { FormulaMasterScreen } from './screens/FormulaMasterScreen'
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
import { DtoSampleJobScreen } from './screens/DtoSampleJobScreen'
import { DtoSampleTrackingScreen } from './screens/DtoSampleTrackingScreen'
import { OrderToProgramScreen } from './screens/OrderToProgramScreen'
import { DtoSamplePromotionScreen } from './screens/DtoSamplePromotionScreen'
import { DtoFollowupScreen } from './screens/DtoFollowupScreen'
import { DtoReportsScreen } from './screens/DtoReportsScreen'
import { RateMasterScreen, parseRateMasterPreset } from './screens/RateMasterScreen'
import { QualityMasterScreen } from './screens/QualityMasterScreen'
import { HrPayrollScreen } from './screens/HrPayrollScreen'
import { ProgramDispatchScreen } from './screens/ProgramDispatchScreen'
import { MachineWiseProductionScreen } from './screens/MachineWiseProductionScreen'
import { SecurityInventoryScreen, type SiSub } from './screens/SecurityInventoryScreen'
import { SecurityMachineUpdateScreen } from './screens/SecurityMachineUpdateScreen'
import { ItemMasterScreen } from './screens/ItemMasterScreen'
import { CeoPinManagementScreen } from './screens/CeoPinManagementScreen'
import { CeoDataReviewScreen } from './screens/CeoDataReviewScreen'
import { OrderEntryScreen } from './screens/OrderEntryScreen'
import { DailyPendingWorkScreen } from './screens/DailyPendingWorkScreen'
import { NotebookScreen } from './screens/NotebookScreen'
import { ModulePinGate } from './components/ModulePinGate'
import { isModuleUnlocked } from './lib/ceoPinManagement'

function AuthenticatedApp() {
  const { session, loading, isCeo, isManager, roleName } = useAuth()
  const [tab, setTab] = useState<AppScreen>('home')
  const [sub, setSub] = useState<string | undefined>()
  const [filter, setFilter] = useState<string | undefined>()
  const [activeModule, setActiveModule] = useState<MainModuleId>('dashboard')
  const [pinGateModule, setPinGateModule] = useState<MainModuleId | null>(null)
  const [pendingNav, setPendingNav] = useState<NavTarget | null>(null)
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
    setFilter(landing.filter ?? (landing.module === landing.sub ? landing.module : undefined))
    setActiveModule(landing.module)
  }, [session, loading, roleName, isCeo])

  // Hard-block Manager from CEO Dashboard route
  useEffect(() => {
    if (!session || !isManager || isCeo) return
    if (tab === 'home' || activeModule === 'dashboard') {
      const landing = firstAllowedLanding('Manager')
      setTab(landing.screen)
      setSub(landing.sub)
      setFilter(landing.filter ?? (landing.module === landing.sub ? landing.module : undefined))
      setActiveModule(landing.module)
    }
  }, [session, isManager, isCeo, tab, activeModule])

  // Hard-block Salesman from Design Master screens
  useEffect(() => {
    if (!session || !isSalesmanRole(roleName || '')) return
    if (DESIGN_MASTER_SCREENS.has(tab) || activeModule === 'design-to-order') {
      const landing = firstAllowedLanding('Salesman')
      setTab(landing.screen)
      setSub(landing.sub)
      setFilter(landing.filter ?? 'dashboard')
      setActiveModule(landing.module)
    }
  }, [session, roleName, tab, activeModule])

  // Hard-block Security from all ERP screens except Machine & Production Update
  useEffect(() => {
    if (!session || loading) return
    const n = (roleName || '').trim().toLowerCase()
    const isSecurity = n === 'security' || (n.includes('security') && !n.includes('supervisor'))
    if (!isSecurity || isCeo) return
    if (tab !== 'security-machine-update') {
      setTab('security-machine-update')
      setSub(undefined)
      setFilter(undefined)
      setActiveModule('security')
    }
  }, [session, loading, roleName, isCeo, tab])

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

  function applyNav(t: NavTarget) {
    const nextScreen = t.screen
    const nextSub = t.hub || t.sub
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

  function go(t: NavTarget) {
    if (isManager && (t.screen === 'home' || t.module === 'dashboard' || t.hub === 'dashboard')) {
      return
    }
    if (t.screen === 'ceo-pin-management' && !isCeo) {
      return
    }
    // Salesman cannot open Design Master
    if (
      isSalesmanRole(roleName || '') &&
      (t.module === 'design-to-order' ||
        t.hub === 'design-to-order' ||
        DESIGN_MASTER_SCREENS.has(t.screen))
    ) {
      return
    }
    // Security may only open Machine & Production Update
    {
      const n = (roleName || '').trim().toLowerCase()
      const isSecurity = n === 'security' || (n.includes('security') && !n.includes('supervisor'))
      if (isSecurity && !isCeo && t.screen !== 'security-machine-update') {
        applyNav({ screen: 'security-machine-update', module: 'security' })
        return
      }
    }
    const nextScreen = t.screen
    const nextSub = t.hub || t.sub
    const nextFilter = Object.prototype.hasOwnProperty.call(t, 'filter')
      ? t.filter
      : t.hub
        ? t.hub
        : undefined
    const nextModule = (t.module || t.hub || moduleForScreen(nextScreen, nextSub, nextFilter)) as MainModuleId
    const skipPinGate =
      isCeo ||
      t.screen === 'ceo-pin-management' ||
      nextModule === activeModule ||
      isModuleUnlocked(nextModule, isCeo)
    if (!skipPinGate) {
      setPendingNav(t)
      setPinGateModule(nextModule)
      return
    }
    applyNav(t)
  }

  function onModulePinUnlocked() {
    if (pendingNav) {
      applyNav(pendingNav)
      setPendingNav(null)
    }
    setPinGateModule(null)
  }

  function onModulePinGateCancel() {
    setPendingNav(null)
    setPinGateModule(null)
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
      {pinGateModule ? (
        <ModulePinGate
          moduleId={pinGateModule}
          onUnlocked={onModulePinUnlocked}
          onCancel={onModulePinGateCancel}
        />
      ) : null}
      {tab === 'ceo-pin-management' ? <CeoPinManagementScreen /> : null}
      {tab === 'ceo-data-review' ? <CeoDataReviewScreen /> : null}
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
      {tab === 'order-entry' ? (
        <OrderEntryScreen
          initialTab={(sub as 'warp' | 'weft' | 'material' | 'repair' | 'list' | 'history' | 'delivery' | 'reports') || 'warp'}
          scope={
            sub === 'material' || sub === 'repair' || activeModule === 'maintenance'
              ? 'maintenance'
              : 'yarn'
          }
        />
      ) : null}
      {tab === 'daily-pending-work' ? (
        <DailyPendingWorkScreen initialTab={(sub as 'today' | 'all' | 'carry' | 'reports') || 'today'} />
      ) : null}
      {tab === 'notebook' ? (
        <NotebookScreen initialSub={sub} initialMachine={filter?.startsWith('M') ? filter : undefined} />
      ) : null}
      {tab === 'orders-pending' ? <OrdersPendingScreen /> : null}
      {tab === 'program-dispatch' ? (
        <ProgramDispatchScreen
          initialSub={sub || 'pto'}
          initialProgramId={
            filter &&
            !['pto', 'entry', 'tracking', 'folding', 'challan', 'gatepass', 'invoice', 'reports', 'view-only'].includes(
              filter,
            )
              ? filter
              : undefined
          }
          onNavigate={go}
        />
      ) : null}
      {tab === 'machine-wise-production' ? (
        <MachineWiseProductionScreen initialTab={sub || 'weft'} />
      ) : null}
      {tab === 'security-machine-update' ? <SecurityMachineUpdateScreen /> : null}
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
      {tab === 'item-master' ? <ItemMasterScreen /> : null}
      {tab === 'purchase' ? <PurchaseScreen initialSub={sub || 'general'} /> : null}
      {tab === 'orders' ? (
        <OrderBookScreen
          initialSub={sub || 'report'}
          onNavigate={go}
        />
      ) : null}
      {tab === 'programs' ? <ProgramScreen initialSub={sub || 'create'} /> : null}
      {tab === 'security' ? <SecurityGateScreen initialSub={sub || 'inward'} /> : null}
      {tab === 'production' ? (
        <ProductionScreen
          initialSub={(sub as 'job' | 'entry' | 'report') || 'job'}
          filter={filter}
        />
      ) : null}
      {tab === 'maintenance' ? (
        sub === 'repair' ? (
          <MaintenanceScreen initialSub="repair" filter={filter} />
        ) : (
          <MachineWiseMaintenanceScreen
            initialSub={sub || 'overview'}
            filter={filter}
            onNavigate={go}
          />
        )
      ) : null}
      {tab === 'dispatch' ? (
        <DispatchScreen
          initialSub={(sub as 'folding' | 'challan' | 'gatepass') || 'folding'}
          filter={filter}
        />
      ) : null}
      {tab === 'admin' ? (
        <AdminScreen initialSub={(sub as 'roles' | 'payroll' | 'approvals' | 'permissions' | 'gmail') || 'roles'} />
      ) : null}
      {tab === 'costing' ? (
        <CostingScreen
          initialSub={(sub as 'factory' | 'production' | 'dispatch' | 'mtd' | 'monthly' | 'sources' | 'summary' | 'electricity') || 'factory'}
          onOpenGeb={() => go({ screen: 'geb-readings', module: 'reports' })}
        />
      ) : null}
      {tab === 'sample-job-card' ? <SampleJobCard /> : null}
      {tab === 'sample-register' ? <SampleRegister /> : null}
      {tab === 'beam-remaining' ? <BeamRemainingReport /> : null}
      {tab === 'design-wise-costing' ? (
        <DesignWiseCosting
          viewOnly={filter === 'view-only'}
          onNavigate={go}
          initialDin={
            filter &&
            filter !== 'view-only' &&
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
              'item-master',
            ].includes(filter)
              ? filter
              : ''
          }
        />
      ) : null}
      {tab === 'dto-hub' ? <DesignToOrderHub onNavigate={go} /> : null}
      {/* Design Intake removed — legacy dto-intake opens DIN Costing */}
      {tab === 'dto-intake' ? <DesignWiseCosting onNavigate={go} /> : null}
      {tab === 'dto-sample-job' ? <DtoSampleJobScreen onNavigate={go} initialDinId={filter} /> : null}
      {tab === 'dto-tracking' ? <DtoSampleTrackingScreen onNavigate={go} initialDinId={filter} /> : null}
      {tab === 'dto-order-booking' ? (
        <OrderToProgramScreen onNavigate={go} initialStep="order-entry" initialDinNumber={filter} />
      ) : null}
      {tab === 'dto-order-status' ? (
        <OrderToProgramScreen onNavigate={go} initialStep="order-status" />
      ) : null}
      {tab === 'order-to-program' ? (
        <OrderToProgramScreen
          onNavigate={go}
          initialStep={
            filter === 'order-entry' ||
            filter === 'order-status' ||
            filter === 'program' ||
            filter === 'reports' ||
            filter === 'dashboard'
              ? filter
              : 'dashboard'
          }
          initialDinNumber={
            filter &&
            !['order-entry', 'order-status', 'program', 'reports', 'dashboard', 'view-only'].includes(filter)
              ? filter
              : undefined
          }
        />
      ) : null}
      {tab === 'dto-promotion' ? (
        <DtoSamplePromotionScreen onNavigate={go} initialDinId={filter} />
      ) : null}
      {tab === 'dto-followup' ? <DtoFollowupScreen /> : null}
      {tab === 'dto-reports' ? <DtoReportsScreen onNavigate={go} /> : null}
      {tab === 'rate-master' ? <RateMasterScreen preset={parseRateMasterPreset(filter)} /> : null}
      {tab === 'quality-master' ? <QualityMasterScreen /> : null}
      {tab === 'formula-master' ? <FormulaMasterScreen /> : null}
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
