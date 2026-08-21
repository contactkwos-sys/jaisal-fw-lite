/**
 * HR & Payroll — JAISAL FASHIONWEAVE INDUSTRIES
 * Attendance → Payroll → Bank Salary Letter (no cheques).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type {
  Attendance,
  BankSalaryLetter,
  BankSalaryLetterItem,
  Holiday,
  LeaveEntry,
  PayrollEntry,
  PayrollRate,
  PayrollRun,
  Role,
  SalaryRate,
  Worker,
} from '../lib/database.types'
import {
  amountInWords,
  ATTENDANCE_STATUSES,
  calculateEmployeePayroll,
  dailyFromMonthly,
  DEFAULT_COMPANY,
  DEFAULT_MONTHLY_DIVISOR,
  formatINR,
  formatINRExact,
  isPresentStatus,
  maskAccountNumber,
  monthBounds,
  PAY_TYPES,
  PAYROLL_STATUSES,
  payableDayFromAttendance,
  SHIFTS,
  statusBadgeClass,
  todayISO,
  type CompanyProfile,
} from '../lib/hrPayroll'
import { supabase } from '../lib/supabase'

type Sub =
  | 'dashboard'
  | 'employees'
  | 'leave'
  | 'rates'
  | 'payroll'
  | 'statutory'
  | 'register'
  | 'payment'
  | 'bank-letter'
  | 'reports'

type Props = {
  initialSub?: string
  onNavigate?: (t: {
    screen: 'hr-payroll' | 'attendance' | 'module-hub'
    sub?: string
    module?: 'hr-payroll'
    filter?: string
  }) => void
}

type WorkerForm = {
  id: string | null
  full_name: string
  employee_code: string
  designation: string
  department: string
  shift: string
  pay_type: string
  phone: string
  joining_date: string
  bank_name: string
  bank_account_no: string
  bank_ifsc: string
  bank_branch: string
  esi_applicable: boolean
  pf_applicable: boolean
  pt_applicable: boolean
  is_active: boolean
}

type RateDraft = {
  pay_type: string
  monthly_rate: string
  daily_rate: string
  hourly_rate: string
  ot_rate: string
  effective_from: string
  status: string
  rateId: string | null
}

type DashboardKpis = {
  totalEmployees: number
  presentToday: number
  absentToday: number
  onLeave: number
  payrollReady: number
  paymentDone: number
}

const SUBS: Array<{ id: Sub; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'employees', label: 'Employees' },
  { id: 'leave', label: 'Leave' },
  { id: 'rates', label: 'Rates' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'statutory', label: 'Statutory' },
  { id: 'register', label: 'Register' },
  { id: 'payment', label: 'Payment' },
  { id: 'bank-letter', label: 'Bank Letter' },
  { id: 'reports', label: 'Reports' },
]

const DEPT_SUGGESTIONS = ['Weaving', 'Folding', 'Security', 'Maintenance', 'Office', 'Quality', 'Other']
const MIGRATION_HINT = 'Run public/migration-hr-payroll-module.sql in Supabase SQL editor, then refresh.'

function isMigrationError(msg: string): boolean {
  return /does not exist|schema cache|PGRST/i.test(msg)
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function canViewFullAccounts(isCeo: boolean, roleName: string): boolean {
  const r = roleName.toLowerCase()
  return (
    isCeo ||
    r === 'ceo' ||
    r === 'md' ||
    r === 'managing director' ||
    r === 'owner' ||
    r.includes('account') ||
    r === 'admin'
  )
}

function emptyWorkerForm(): WorkerForm {
  return {
    id: null,
    full_name: '',
    employee_code: '',
    designation: '',
    department: '',
    shift: 'Day',
    pay_type: 'Daily',
    phone: '',
    joining_date: '',
    bank_name: '',
    bank_account_no: '',
    bank_ifsc: '',
    bank_branch: '',
    esi_applicable: false,
    pf_applicable: false,
    pt_applicable: false,
    is_active: true,
  }
}

function workerToForm(w: Worker): WorkerForm {
  return {
    id: w.id,
    full_name: w.full_name,
    employee_code: w.employee_code || '',
    designation: w.designation || '',
    department: w.department || '',
    shift: w.shift || 'Day',
    pay_type: w.pay_type || 'Daily',
    phone: w.phone || '',
    joining_date: w.joining_date || '',
    bank_name: w.bank_name || '',
    bank_account_no: w.bank_account_no || '',
    bank_ifsc: w.bank_ifsc || '',
    bank_branch: w.bank_branch || '',
    esi_applicable: !!w.esi_applicable,
    pf_applicable: !!w.pf_applicable,
    pt_applicable: !!w.pt_applicable,
    is_active: w.is_active,
  }
}

function pickLatestRate(rates: SalaryRate[], workerId: string, toDate: string): SalaryRate | null {
  return (
    rates
      .filter((r) => r.worker_id === workerId && r.effective_from <= toDate)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null
  )
}

function fallbackDailyRate(worker: Worker, roles: Role[], payrollRates: PayrollRate[]): number {
  const roleId = worker.role_id || roles.find((r) => r.role_name === worker.department)?.id
  if (!roleId) return 0
  return Number(payrollRates.find((r) => r.role_id === roleId)?.rate_per_day ?? 0)
}

function titleForSub(sub: Sub): string {
  const labels: Record<Sub, string> = {
    dashboard: 'HR & Payroll Dashboard',
    employees: 'Employee Master',
    leave: 'Leave / Holiday',
    rates: 'Salary Rate Master',
    payroll: 'Payroll',
    statutory: 'ESI / PF / PT',
    register: 'Salary Register',
    payment: 'Salary Payment',
    'bank-letter': 'Bank Salary Letter',
    reports: 'HR & Payroll Reports',
  }
  return labels[sub]
}

function parseSub(s?: string): Sub {
  const ok = SUBS.map((x) => x.id)
  if (s && ok.includes(s as Sub)) return s as Sub
  return 'dashboard'
}

export function HrPayrollScreen({ initialSub, onNavigate }: Props) {
  const { isCeo, roleName, profile } = useAuth()
  const showFullAccounts = canViewFullAccounts(isCeo, roleName)

  const [sub, setSub] = useState<Sub>(() => parseSub(initialSub))
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [workers, setWorkers] = useState<Worker[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [payrollRates, setPayrollRates] = useState<PayrollRate[]>([])
  const [salaryRates, setSalaryRates] = useState<SalaryRate[]>([])
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY)

  const [payrollMonth, setPayrollMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [payrollRun, setPayrollRun] = useState<PayrollRun | null>(null)
  const [entries, setEntries] = useState<PayrollEntry[]>([])

  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([])
  const [letters, setLetters] = useState<BankSalaryLetter[]>([])
  const [letterItems, setLetterItems] = useState<BankSalaryLetterItem[]>([])
  const [viewLetterId, setViewLetterId] = useState<string | null>(null)

  const [kpis, setKpis] = useState<DashboardKpis>({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    onLeave: 0,
    payrollReady: 0,
    paymentDone: 0,
  })

  const [workerForm, setWorkerForm] = useState<WorkerForm>(emptyWorkerForm())
  const [showWorkerForm, setShowWorkerForm] = useState(false)
  const [rateDrafts, setRateDrafts] = useState<Record<string, RateDraft>>({})

  const [workingDays, setWorkingDays] = useState(DEFAULT_MONTHLY_DIVISOR)
  const [runEsi, setRunEsi] = useState(true)
  const [runPf, setRunPf] = useState(true)
  const [runPt, setRunPt] = useState(true)
  const [runOther, setRunOther] = useState(true)

  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set())
  const [detailEntry, setDetailEntry] = useState<PayrollEntry | null>(null)
  const [editEntry, setEditEntry] = useState<PayrollEntry | null>(null)

  const [holidayDate, setHolidayDate] = useState('')
  const [holidayTitle, setHolidayTitle] = useState('')
  const [leaveWorkerId, setLeaveWorkerId] = useState('')
  const [leaveDate, setLeaveDate] = useState(todayISO())
  const [leaveType, setLeaveType] = useState('Leave')
  const [leaveRemarks, setLeaveRemarks] = useState('')
  const [syncAttendanceLeave, setSyncAttendanceLeave] = useState(true)

  const [regSearch, setRegSearch] = useState('')
  const [regMonth, setRegMonth] = useState('')
  const [regDept, setRegDept] = useState('')
  const [regStatus, setRegStatus] = useState('')

  const [reportKind, setReportKind] = useState<
    'attendance' | 'payroll' | 'statutory' | 'payment' | 'letters' | 'history'
  >('attendance')
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [historyWorkerId, setHistoryWorkerId] = useState('')

  const bounds = useMemo(() => monthBounds(payrollMonth), [payrollMonth])
  const activeWorkers = useMemo(() => workers.filter((w) => w.is_active), [workers])

  const handleDbError = useCallback((e: unknown) => {
    const msg = errMsg(e)
    if (isMigrationError(msg)) {
      setMigrationMissing(true)
      setError(MIGRATION_HINT)
    } else {
      setError(msg)
    }
  }, [])

  const loadCompany = useCallback(async () => {
    const { data, error: cErr } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'company_profile')
      .maybeSingle()
    if (cErr && isMigrationError(cErr.message)) throw cErr
    if (data?.value) {
      try {
        setCompany({ ...DEFAULT_COMPANY, ...(JSON.parse(data.value) as CompanyProfile) })
      } catch {
        setCompany(DEFAULT_COMPANY)
      }
    }
  }, [])

  const loadWorkers = useCallback(async () => {
    const { data, error: wErr } = await supabase.from('workers').select('*').order('full_name')
    if (wErr) throw wErr
    setWorkers((data as Worker[]) ?? [])
  }, [])

  const loadRolesAndRates = useCallback(async () => {
    const [{ data: r }, { data: pr }] = await Promise.all([
      supabase.from('roles').select('*').order('role_name'),
      supabase.from('payroll_rates').select('*'),
    ])
    setRoles((r as Role[]) ?? [])
    setPayrollRates((pr as PayrollRate[]) ?? [])
  }, [])

  const loadSalaryRates = useCallback(async () => {
    const { data, error: sErr } = await supabase
      .from('salary_rates')
      .select('*')
      .order('effective_from', { ascending: false })
    if (sErr) throw sErr
    setSalaryRates((data as SalaryRate[]) ?? [])
  }, [])

  const loadPayrollRun = useCallback(async (month: string) => {
    const { data: run, error: rErr } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('payroll_month', month)
      .maybeSingle()
    if (rErr) throw rErr
    const typed = (run as PayrollRun | null) ?? null
    setPayrollRun(typed)
    if (typed) {
      setWorkingDays(Number(typed.working_days) || DEFAULT_MONTHLY_DIVISOR)
      setRunEsi(!!typed.esi_on)
      setRunPf(!!typed.pf_on)
      setRunPt(!!typed.pt_on)
      setRunOther(!!typed.other_deduction_on)
      const { data: ent, error: eErr } = await supabase
        .from('payroll_entries')
        .select('*')
        .eq('payroll_run_id', typed.id)
        .order('employee_name')
      if (eErr) throw eErr
      setEntries((ent as PayrollEntry[]) ?? [])
    } else {
      setEntries([])
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    const today = todayISO()
    const active = workers.filter((w) => w.is_active)
    const { data: att, error: aErr } = await supabase.from('attendance').select('*').eq('date', today)
    if (aErr) throw aErr
    const attRows = (att as Attendance[]) ?? []
    const attByWorker = new Map(attRows.map((a) => [a.worker_id, a]))
    let present = 0
    let absent = 0
    let onLeave = 0
    for (const w of active) {
      const row = attByWorker.get(w.id)
      const st = (row?.status || 'Absent').trim()
      if (st === 'Leave') onLeave++
      else if (isPresentStatus(st)) present++
      else absent++
    }
    const { data: ready, error: rErr } = await supabase
      .from('payroll_entries')
      .select('id')
      .eq('status', 'Ready for Salary Payment')
    if (rErr) throw rErr
    const { data: done, error: dErr } = await supabase
      .from('payroll_entries')
      .select('id')
      .eq('status', 'Payment Processed')
    if (dErr) throw dErr
    setKpis({
      totalEmployees: active.length,
      presentToday: present,
      absentToday: absent,
      onLeave,
      payrollReady: ready?.length ?? 0,
      paymentDone: done?.length ?? 0,
    })
  }, [workers])

  const loadHolidaysLeave = useCallback(async () => {
    const [{ data: h }, { data: l }] = await Promise.all([
      supabase.from('holidays').select('*').order('holiday_date', { ascending: false }),
      supabase.from('leave_entries').select('*').order('leave_date', { ascending: false }).limit(200),
    ])
    if (h === null && l === null) return
    setHolidays((h as Holiday[]) ?? [])
    setLeaveEntries((l as LeaveEntry[]) ?? [])
  }, [])

  const loadLetters = useCallback(async (letterId?: string | null) => {
    const { data: ls, error: lErr } = await supabase
      .from('bank_salary_letters')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (lErr) throw lErr
    const list = (ls as BankSalaryLetter[]) ?? []
    setLetters(list)
    const pick = letterId || viewLetterId || list[0]?.id || null
    setViewLetterId(pick)
    if (pick) {
      const { data: items, error: iErr } = await supabase
        .from('bank_salary_letter_items')
        .select('*')
        .eq('letter_id', pick)
        .order('sno')
      if (iErr) throw iErr
      setLetterItems((items as BankSalaryLetterItem[]) ?? [])
    } else {
      setLetterItems([])
    }
  }, [viewLetterId])

  const loadRegisterEntries = useCallback(async () => {
    const { data, error: eErr } = await supabase
      .from('payroll_entries')
      .select('*, payroll_runs!inner(payroll_month)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (eErr) throw eErr
    setEntries((data as PayrollEntry[]) ?? [])
  }, [])

  useEffect(() => {
    if (initialSub) setSub(parseSub(initialSub))
  }, [initialSub])

  useEffect(() => {
    if (migrationMissing) return
    void (async () => {
      try {
        setError(null)
        await Promise.all([loadWorkers(), loadRolesAndRates(), loadCompany()])
      } catch (e) {
        handleDbError(e)
      }
    })()
  }, [migrationMissing, loadWorkers, loadRolesAndRates, loadCompany, handleDbError])

  useEffect(() => {
    if (migrationMissing) return
    void (async () => {
      try {
        setError(null)
        if (sub === 'dashboard') await loadDashboard()
        if (sub === 'rates') await loadSalaryRates()
        if (sub === 'leave') await loadHolidaysLeave()
        if (sub === 'payroll' || sub === 'statutory' || sub === 'payment') await loadPayrollRun(payrollMonth)
        if (sub === 'register') await loadRegisterEntries()
        if (sub === 'bank-letter' || sub === 'reports') await loadLetters(viewLetterId)
      } catch (e) {
        handleDbError(e)
      }
    })()
  }, [
    sub,
    payrollMonth,
    migrationMissing,
    loadDashboard,
    loadSalaryRates,
    loadHolidaysLeave,
    loadPayrollRun,
    loadRegisterEntries,
    loadLetters,
    viewLetterId,
    handleDbError,
  ])

  useEffect(() => {
    if (sub !== 'rates') return
    const drafts: Record<string, RateDraft> = {}
    for (const w of activeWorkers) {
      const latest = pickLatestRate(salaryRates, w.id, todayISO())
      const payType = latest?.pay_type || w.pay_type || 'Daily'
      const monthly = latest?.monthly_rate ?? 0
      drafts[w.id] = {
        pay_type: payType,
        monthly_rate: String(monthly || ''),
        daily_rate: String((latest?.daily_rate ?? dailyFromMonthly(monthly)) || fallbackDailyRate(w, roles, payrollRates)),
        hourly_rate: String(latest?.hourly_rate ?? 0),
        ot_rate: String(latest?.ot_rate ?? 0),
        effective_from: latest?.effective_from || todayISO(),
        status: latest?.status || 'Active',
        rateId: latest?.id ?? null,
      }
    }
    setRateDrafts(drafts)
  }, [sub, activeWorkers, salaryRates, roles, payrollRates])

  function goNav(targetSub: Sub, letterId?: string) {
    setSub(targetSub)
    if (letterId) setViewLetterId(letterId)
    onNavigate?.({
      screen: 'hr-payroll',
      sub: targetSub,
      module: 'hr-payroll',
      filter: letterId,
    })
  }

  function quickNav(screen: string, targetSub?: string) {
    if (screen === 'attendance') {
      onNavigate?.({ screen: 'attendance', module: 'hr-payroll' })
      return
    }
    if (targetSub) goNav(targetSub as Sub)
  }

  async function saveWorker(e: React.FormEvent) {
    e.preventDefault()
    if (!workerForm.full_name.trim()) {
      setError('Full name required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        full_name: workerForm.full_name.trim(),
        employee_code: workerForm.employee_code.trim() || null,
        designation: workerForm.designation.trim() || null,
        department: workerForm.department.trim() || null,
        shift: workerForm.shift,
        pay_type: workerForm.pay_type,
        phone: workerForm.phone.trim() || null,
        joining_date: workerForm.joining_date || null,
        bank_name: workerForm.bank_name.trim() || null,
        bank_account_no: workerForm.bank_account_no.trim() || null,
        bank_ifsc: workerForm.bank_ifsc.trim() || null,
        bank_branch: workerForm.bank_branch.trim() || null,
        esi_applicable: workerForm.esi_applicable,
        pf_applicable: workerForm.pf_applicable,
        pt_applicable: workerForm.pt_applicable,
        is_active: workerForm.is_active,
      }
      if (workerForm.id) {
        const { error: uErr } = await supabase.from('workers').update(payload).eq('id', workerForm.id)
        if (uErr) throw uErr
        setMessage('Employee updated')
      } else {
        const { error: iErr } = await supabase.from('workers').insert(payload)
        if (iErr) throw iErr
        setMessage('Employee added')
      }
      setShowWorkerForm(false)
      setWorkerForm(emptyWorkerForm())
      await loadWorkers()
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function deactivateWorker(w: Worker) {
    if (!window.confirm(`Deactivate ${w.full_name}?`)) return
    setBusy(true)
    try {
      const { error: uErr } = await supabase.from('workers').update({ is_active: false }).eq('id', w.id)
      if (uErr) throw uErr
      setMessage(`${w.full_name} deactivated`)
      await loadWorkers()
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function addHoliday(e: React.FormEvent) {
    e.preventDefault()
    if (!holidayDate || !holidayTitle.trim()) {
      setError('Date and title required')
      return
    }
    setBusy(true)
    try {
      const { error: iErr } = await supabase.from('holidays').insert({
        holiday_date: holidayDate,
        title: holidayTitle.trim(),
      })
      if (iErr) throw iErr
      setHolidayDate('')
      setHolidayTitle('')
      setMessage('Holiday saved')
      await loadHolidaysLeave()
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function saveLeave(e: React.FormEvent) {
    e.preventDefault()
    if (!leaveWorkerId || !leaveDate) {
      setError('Employee and date required')
      return
    }
    setBusy(true)
    try {
      const { error: iErr } = await supabase.from('leave_entries').upsert(
        {
          worker_id: leaveWorkerId,
          leave_date: leaveDate,
          leave_type: leaveType,
          remarks: leaveRemarks.trim() || null,
        },
        { onConflict: 'worker_id,leave_date' },
      )
      if (iErr) throw iErr
      if (syncAttendanceLeave) {
        const { data: existing } = await supabase
          .from('attendance')
          .select('id')
          .eq('worker_id', leaveWorkerId)
          .eq('date', leaveDate)
          .maybeSingle()
        const attPayload = { worker_id: leaveWorkerId, date: leaveDate, status: 'Leave', payable_day: 0 }
        if (existing?.id) {
          await supabase.from('attendance').update(attPayload).eq('id', existing.id)
        } else {
          await supabase.from('attendance').insert(attPayload)
        }
      }
      setLeaveRemarks('')
      setMessage('Leave entry saved')
      await loadHolidaysLeave()
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  function updateRateDraft(workerId: string, patch: Partial<RateDraft>) {
    setRateDrafts((prev) => {
      const cur = prev[workerId]
      if (!cur) return prev
      const next = { ...cur, ...patch }
      if (patch.monthly_rate !== undefined) {
        const m = Number(patch.monthly_rate) || 0
        next.daily_rate = String(dailyFromMonthly(m))
      }
      return { ...prev, [workerId]: next }
    })
  }

  async function saveRate(worker: Worker) {
    const draft = rateDrafts[worker.id]
    if (!draft) return
    const existing = salaryRates.find(
      (r) =>
        r.worker_id === worker.id &&
        r.effective_from === draft.effective_from &&
        r.status === 'Active' &&
        r.approved,
    )
    if (existing && existing.id !== draft.rateId) {
      if (!window.confirm('An active rate exists for this effective date. Overwrite?')) return
    } else if (draft.rateId && draft.status === 'Active') {
      const old = salaryRates.find((r) => r.id === draft.rateId)
      if (old && old.status === 'Active' && old.approved && old.effective_from !== draft.effective_from) {
        if (!window.confirm('Create new rate row with updated effective date (history preserved)?')) return
      }
    }
    setBusy(true)
    try {
      const payload = {
        worker_id: worker.id,
        pay_type: draft.pay_type,
        monthly_rate: Number(draft.monthly_rate) || 0,
        daily_rate: Number(draft.daily_rate) || 0,
        hourly_rate: Number(draft.hourly_rate) || 0,
        ot_rate: Number(draft.ot_rate) || 0,
        effective_from: draft.effective_from,
        status: draft.status || 'Active',
        approved: true,
        updated_at: new Date().toISOString(),
      }
      const sameDateActive = salaryRates.find(
        (r) => r.worker_id === worker.id && r.effective_from === draft.effective_from && r.id === draft.rateId,
      )
      if (sameDateActive && draft.rateId) {
        const { error: uErr } = await supabase.from('salary_rates').update(payload).eq('id', draft.rateId)
        if (uErr) throw uErr
      } else {
        const { error: iErr } = await supabase.from('salary_rates').insert(payload)
        if (iErr) throw iErr
      }
      await supabase.from('workers').update({ pay_type: draft.pay_type }).eq('id', worker.id)
      setMessage(`Rate saved · ${worker.full_name}`)
      await loadSalaryRates()
      await loadWorkers()
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  function buildEntryPayload(
    worker: Worker,
    attRows: Attendance[],
    rate: SalaryRate | null,
    run: PayrollRun,
  ): Omit<PayrollEntry, 'id' | 'created_at' | 'updated_at'> {
    let presentDays = 0
    let leaveDays = 0
    let payableDays = 0
    for (const a of attRows) {
      const st = a.status || 'Absent'
      if (isPresentStatus(st)) presentDays++
      if (st === 'Leave') leaveDays++
      payableDays += Number(a.payable_day ?? payableDayFromAttendance(st, Number(a.total_hours) || 0))
    }
    payableDays = Math.round(payableDays * 100) / 100

    const payType = rate?.pay_type || worker.pay_type || 'Daily'
    let monthlyRate = Number(rate?.monthly_rate) || 0
    let dailyRate = Number(rate?.daily_rate) || 0
    let hourlyRate = Number(rate?.hourly_rate) || 0
    const otRate = Number(rate?.ot_rate) || 0
    if (!dailyRate && monthlyRate) dailyRate = dailyFromMonthly(monthlyRate)
    if (!dailyRate) dailyRate = fallbackDailyRate(worker, roles, payrollRates)

    const esiOn = run.esi_on && worker.esi_applicable !== false
    const pfOn = run.pf_on && worker.pf_applicable !== false
    const ptOn = run.pt_on && worker.pt_applicable !== false
    const otherOn = run.other_deduction_on

    const calc = calculateEmployeePayroll({
      payType,
      monthlyRate,
      dailyRate,
      hourlyRate,
      otRate,
      presentDays,
      payableDays,
      workingDays: Number(run.working_days) || DEFAULT_MONTHLY_DIVISOR,
      esiOn,
      pfOn,
      ptOn,
      otherOn,
    })

    return {
      payroll_run_id: run.id,
      worker_id: worker.id,
      employee_code: worker.employee_code ?? null,
      employee_name: worker.full_name,
      designation: worker.designation ?? null,
      department: worker.department ?? null,
      pay_type: payType,
      working_days: Number(run.working_days) || DEFAULT_MONTHLY_DIVISOR,
      present_days: presentDays,
      leave_days: leaveDays,
      payable_days: payableDays,
      basic_salary: calc.basic,
      allowances: calc.allowances,
      ot_amount: calc.ot,
      gross_salary: calc.gross,
      esi_amount: calc.esi,
      pf_amount: calc.pf,
      pt_amount: calc.pt,
      other_deduction: calc.other,
      advance: calc.advance,
      total_deduction: calc.totalDeduction,
      net_payable: calc.net,
      status: 'Payroll Calculated',
      esi_on: esiOn,
      pf_on: pfOn,
      pt_on: ptOn,
      other_deduction_on: otherOn,
      bank_name: worker.bank_name ?? null,
      bank_account_no: worker.bank_account_no ?? null,
      bank_ifsc: worker.bank_ifsc ?? null,
      bank_branch: worker.bank_branch ?? null,
      payment_date: null,
      selected_for_letter: false,
    }
  }

  async function calculatePayroll() {
    setBusy(true)
    setError(null)
    try {
      const { from, to } = bounds
      const runPayload = {
        payroll_month: payrollMonth,
        from_date: from,
        to_date: to,
        status: 'Payroll Calculated',
        esi_on: runEsi,
        pf_on: runPf,
        pt_on: runPt,
        other_deduction_on: runOther,
        working_days: workingDays,
        updated_at: new Date().toISOString(),
        created_by: profile?.id ?? null,
      }
      let run = payrollRun
      if (run) {
        const { error: uErr } = await supabase.from('payroll_runs').update(runPayload).eq('id', run.id)
        if (uErr) throw uErr
        run = { ...run, ...runPayload }
      } else {
        const { data, error: iErr } = await supabase.from('payroll_runs').insert(runPayload).select('*').single()
        if (iErr) throw iErr
        run = data as PayrollRun
      }
      setPayrollRun(run)

      const { data: attAll, error: aErr } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', from)
        .lte('date', to)
      if (aErr) throw aErr
      const attByWorker = new Map<string, Attendance[]>()
      for (const a of (attAll as Attendance[]) ?? []) {
        const list = attByWorker.get(a.worker_id) || []
        list.push(a)
        attByWorker.set(a.worker_id, list)
      }

      for (const worker of activeWorkers) {
        const rate = pickLatestRate(salaryRates, worker.id, to) || null
        const payload = buildEntryPayload(worker, attByWorker.get(worker.id) || [], rate, run)
        const { error: upErr } = await supabase.from('payroll_entries').upsert(payload, {
          onConflict: 'payroll_run_id,worker_id',
        })
        if (upErr) throw upErr
      }
      setMessage('Payroll calculated')
      await loadPayrollRun(payrollMonth)
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function recalcEntry(entry: PayrollEntry, patch?: Partial<PayrollEntry>) {
    const worker = workers.find((w) => w.id === entry.worker_id)
    const run = payrollRun
    if (!worker || !run) return
    const merged = { ...entry, ...patch }
    const rate = pickLatestRate(salaryRates, worker.id, run.to_date)
    const payType = merged.pay_type || rate?.pay_type || worker.pay_type || 'Daily'
    let monthlyRate = Number(rate?.monthly_rate) || 0
    let dailyRate = Number(rate?.daily_rate) || 0
    let hourlyRate = Number(rate?.hourly_rate) || 0
    const otRate = Number(rate?.ot_rate) || 0
    if (!dailyRate && monthlyRate) dailyRate = dailyFromMonthly(monthlyRate)
    if (!dailyRate) dailyRate = fallbackDailyRate(worker, roles, payrollRates)

    const esiOn = (merged.esi_on ?? run.esi_on) && worker.esi_applicable !== false
    const pfOn = (merged.pf_on ?? run.pf_on) && worker.pf_applicable !== false
    const ptOn = (merged.pt_on ?? run.pt_on) && worker.pt_applicable !== false
    const otherOn = merged.other_deduction_on ?? run.other_deduction_on

    const calc = calculateEmployeePayroll({
      payType,
      monthlyRate,
      dailyRate,
      hourlyRate,
      otRate,
      presentDays: Number(merged.present_days) || 0,
      payableDays: Number(merged.payable_days) || 0,
      workingDays: Number(merged.working_days) || Number(run.working_days) || DEFAULT_MONTHLY_DIVISOR,
      allowances: Number(merged.allowances) || 0,
      advance: Number(merged.advance) || 0,
      otherDeduction: Number(merged.other_deduction) || 0,
      esiOn,
      pfOn,
      ptOn,
      otherOn,
    })

    const update = {
      allowances: Number(merged.allowances) || 0,
      advance: Number(merged.advance) || 0,
      other_deduction: Number(merged.other_deduction) || 0,
      basic_salary: calc.basic,
      ot_amount: calc.ot,
      gross_salary: calc.gross,
      esi_amount: calc.esi,
      pf_amount: calc.pf,
      pt_amount: calc.pt,
      total_deduction: calc.totalDeduction,
      net_payable: calc.net,
      esi_on: esiOn,
      pf_on: pfOn,
      pt_on: ptOn,
      other_deduction_on: otherOn,
      updated_at: new Date().toISOString(),
    }
    const { error: uErr } = await supabase.from('payroll_entries').update(update).eq('id', entry.id)
    if (uErr) throw uErr
    await loadPayrollRun(payrollMonth)
  }

  async function updateEntryStatus(ids: string[], status: string) {
    if (!ids.length) return
    setBusy(true)
    try {
      const { error: uErr } = await supabase.from('payroll_entries').update({ status }).in('id', ids)
      if (uErr) throw uErr
      setMessage(`${ids.length} entries → ${status}`)
      setSelectedEntryIds(new Set())
      await loadPayrollRun(payrollMonth)
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function updateRunToggles(patch: Partial<PayrollRun>) {
    if (!payrollRun) return
    setBusy(true)
    try {
      const next = { ...payrollRun, ...patch, updated_at: new Date().toISOString() }
      const { error: uErr } = await supabase.from('payroll_runs').update(patch).eq('id', payrollRun.id)
      if (uErr) throw uErr
      setPayrollRun(next as PayrollRun)
      if (patch.esi_on !== undefined) setRunEsi(!!patch.esi_on)
      if (patch.pf_on !== undefined) setRunPf(!!patch.pf_on)
      if (patch.pt_on !== undefined) setRunPt(!!patch.pt_on)
      if (patch.other_deduction_on !== undefined) setRunOther(!!patch.other_deduction_on)
      for (const ent of entries) {
        await recalcEntry(ent, {
          esi_on: patch.esi_on ?? ent.esi_on,
          pf_on: patch.pf_on ?? ent.pf_on,
          pt_on: patch.pt_on ?? ent.pt_on,
          other_deduction_on: patch.other_deduction_on ?? ent.other_deduction_on,
        })
      }
      setMessage('Statutory toggles updated — entries recalculated')
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function generateBankLetter() {
    const ready = entries.filter(
      (e) => selectedEntryIds.has(e.id) && e.status === 'Ready for Salary Payment',
    )
    if (!ready.length) {
      setError('Select entries with status Ready for Salary Payment')
      return
    }
    if (!payrollRun) {
      setError('No payroll run loaded')
      return
    }
    setBusy(true)
    try {
      const total = ready.reduce((s, e) => s + Number(e.net_payable), 0)
      const words = amountInWords(total)
      const { data: letter, error: lErr } = await supabase
        .from('bank_salary_letters')
        .insert({
          payroll_run_id: payrollRun.id,
          letter_date: todayISO(),
          salary_month: payrollMonth,
          total_employees: ready.length,
          total_amount: total,
          amount_in_words: words,
          status: 'Generated',
          created_by: profile?.id ?? null,
        })
        .select('*')
        .single()
      if (lErr) throw lErr
      const items = ready.map((e, idx) => ({
        letter_id: (letter as BankSalaryLetter).id,
        payroll_entry_id: e.id,
        sno: idx + 1,
        employee_code: e.employee_code,
        employee_name: e.employee_name || '—',
        designation: e.designation,
        bank_name: e.bank_name,
        bank_account_no: e.bank_account_no,
        bank_ifsc: e.bank_ifsc,
        net_salary: e.net_payable,
      }))
      const { error: iErr } = await supabase.from('bank_salary_letter_items').insert(items)
      if (iErr) throw iErr
      await supabase
        .from('payroll_entries')
        .update({ status: 'Included in Bank Salary Letter', selected_for_letter: true })
        .in(
          'id',
          ready.map((e) => e.id),
        )
      setViewLetterId((letter as BankSalaryLetter).id)
      setMessage('Bank Salary Letter generated')
      setSelectedEntryIds(new Set())
      goNav('bank-letter', (letter as BankSalaryLetter).id)
      await loadPayrollRun(payrollMonth)
      await loadLetters((letter as BankSalaryLetter).id)
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  async function regenerateLetter() {
    const letter = letters.find((l) => l.id === viewLetterId)
    if (!letter || !payrollRun) return
    setBusy(true)
    try {
      const included = entries.filter((e) => e.status === 'Included in Bank Salary Letter' || e.selected_for_letter)
      if (!included.length) {
        setError('No entries marked for letter')
        return
      }
      await supabase.from('bank_salary_letter_items').delete().eq('letter_id', letter.id)
      const total = included.reduce((s, e) => s + Number(e.net_payable), 0)
      const items = included.map((e, idx) => ({
        letter_id: letter.id,
        payroll_entry_id: e.id,
        sno: idx + 1,
        employee_code: e.employee_code,
        employee_name: e.employee_name || '—',
        designation: e.designation,
        bank_name: e.bank_name,
        bank_account_no: e.bank_account_no,
        bank_ifsc: e.bank_ifsc,
        net_salary: e.net_payable,
      }))
      await supabase.from('bank_salary_letter_items').insert(items)
      await supabase
        .from('bank_salary_letters')
        .update({
          total_employees: included.length,
          total_amount: total,
          amount_in_words: amountInWords(total),
        })
        .eq('id', letter.id)
      setMessage('Letter regenerated')
      await loadLetters(letter.id)
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  const selectedTotals = useMemo(() => {
    const sel = entries.filter((e) => selectedEntryIds.has(e.id))
    return {
      count: sel.length,
      net: sel.reduce((s, e) => s + Number(e.net_payable), 0),
    }
  }, [entries, selectedEntryIds])

  const paymentEntries = useMemo(
    () => entries.filter((e) => e.status === 'Ready for Salary Payment'),
    [entries],
  )

  const registerRows = useMemo(() => {
    return entries.filter((e) => {
      const name = (e.employee_name || '').toLowerCase()
      const code = (e.employee_code || '').toLowerCase()
      const q = regSearch.toLowerCase()
      if (q && !name.includes(q) && !code.includes(q)) return false
      if (regDept && e.department !== regDept) return false
      if (regStatus && e.status !== regStatus) return false
      return true
    })
  }, [entries, regSearch, regDept, regStatus])

  const activeLetter = letters.find((l) => l.id === viewLetterId) ?? letters[0] ?? null

  const reportAttendance = useMemo(() => {
    const { from, to } = monthBounds(reportMonth)
    return { from, to }
  }, [reportMonth])

  const [reportAttRows, setReportAttRows] = useState<Attendance[]>([])
  useEffect(() => {
    if (sub !== 'reports' || reportKind !== 'attendance') return
    void (async () => {
      const { data } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', reportAttendance.from)
        .lte('date', reportAttendance.to)
      setReportAttRows((data as Attendance[]) ?? [])
    })()
  }, [sub, reportKind, reportAttendance])

  const attSummary = useMemo(() => {
    const byWorker = new Map<string, { present: number; absent: number; leave: number }>()
    for (const a of reportAttRows) {
      const cur = byWorker.get(a.worker_id) || { present: 0, absent: 0, leave: 0 }
      const st = a.status || 'Absent'
      if (st === 'Leave') cur.leave++
      else if (isPresentStatus(st)) cur.present++
      else cur.absent++
      byWorker.set(a.worker_id, cur)
    }
    return activeWorkers.map((w) => ({
      worker: w,
      ...(byWorker.get(w.id) || { present: 0, absent: 0, leave: 0 }),
    }))
  }, [reportAttRows, activeWorkers])

  if (migrationMissing) {
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>HR & Payroll</h1>
        </header>
        <div className="surface card-row form-stack">
          <p className="form-error">HR & Payroll tables are not installed yet.</p>
          <p className="text-muted">{MIGRATION_HINT}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{titleForSub(sub)}</h1>
        <p className="text-muted2">JAISAL FW · Fashionweave Industries</p>
      </header>

      <nav className="hr-subnav" role="tablist" aria-label="HR sections">
        {SUBS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={sub === t.id}
            className={sub === t.id ? 'sub-tab active' : 'sub-tab'}
            onClick={() => goNav(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {sub === 'dashboard' ? (
        <div className="form-stack">
          <div className="hr-kpi-grid">
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.totalEmployees}</div>
              <div className="hr-kpi-label">Total Employees</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.presentToday}</div>
              <div className="hr-kpi-label">Present Today</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.absentToday}</div>
              <div className="hr-kpi-label">Absent Today</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.onLeave}</div>
              <div className="hr-kpi-label">On Leave</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.payrollReady}</div>
              <div className="hr-kpi-label">Payroll Ready</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.paymentDone}</div>
              <div className="hr-kpi-label">Payment Done</div>
            </div>
          </div>
          <div className="hr-quick-actions share-actions">
            <button type="button" className="btn-ghost" onClick={() => quickNav('attendance')}>
              Attendance
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('employees')}>
              Employees
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('rates')}>
              Rates
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('payroll')}>
              Payroll
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('statutory')}>
              Statutory
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('register')}>
              Register
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('payment')}>
              Payment
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('bank-letter')}>
              Bank Letter
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('reports')}>
              Reports
            </button>
          </div>
        </div>
      ) : null}

      {sub === 'employees' ? (
        <div className="form-stack">
          <div className="hr-toolbar share-actions">
            <button
              type="button"
              className="primary-save"
              onClick={() => {
                setWorkerForm(emptyWorkerForm())
                setShowWorkerForm(true)
              }}
            >
              Add Employee
            </button>
          </div>
          {showWorkerForm ? (
            <form className="surface card-row form-stack" onSubmit={(e) => void saveWorker(e)}>
              <h2 className="section-title">{workerForm.id ? 'Edit Employee' : 'New Employee'}</h2>
              <label className="field">
                <span className="text-muted">Full name</span>
                <input
                  value={workerForm.full_name}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, full_name: e.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span className="text-muted">Employee code</span>
                <input
                  className="num"
                  value={workerForm.employee_code}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, employee_code: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">Designation</span>
                <input
                  value={workerForm.designation}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, designation: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">Department</span>
                <input
                  list="hr-dept-list"
                  value={workerForm.department}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, department: e.target.value }))}
                />
                <datalist id="hr-dept-list">
                  {DEPT_SUGGESTIONS.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span className="text-muted">Shift</span>
                <select
                  value={workerForm.shift}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, shift: e.target.value }))}
                >
                  {SHIFTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="text-muted">Pay type</span>
                <select
                  value={workerForm.pay_type}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, pay_type: e.target.value }))}
                >
                  {PAY_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="text-muted">Phone</span>
                <input
                  value={workerForm.phone}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">Joining date</span>
                <input
                  type="date"
                  value={workerForm.joining_date}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, joining_date: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">Bank name</span>
                <input
                  value={workerForm.bank_name}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, bank_name: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">Account no</span>
                <input
                  className="num"
                  value={workerForm.bank_account_no}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, bank_account_no: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">IFSC</span>
                <input
                  value={workerForm.bank_ifsc}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, bank_ifsc: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="text-muted">Branch</span>
                <input
                  value={workerForm.bank_branch}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, bank_branch: e.target.value }))}
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={workerForm.esi_applicable}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, esi_applicable: e.target.checked }))}
                />
                <span>ESI applicable</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={workerForm.pf_applicable}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, pf_applicable: e.target.checked }))}
                />
                <span>PF applicable</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={workerForm.pt_applicable}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, pt_applicable: e.target.checked }))}
                />
                <span>PT applicable</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={workerForm.is_active}
                  onChange={(e) => setWorkerForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                <span>Active</span>
              </label>
              <div className="share-actions">
                <button type="submit" className="primary-save" disabled={busy}>
                  Save
                </button>
                <button type="button" className="btn-ghost" onClick={() => setShowWorkerForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Dept</th>
                  <th>Shift</th>
                  <th>Pay</th>
                  <th>Bank</th>
                  <th>ESI</th>
                  <th>PF</th>
                  <th>PT</th>
                  <th>Active</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => (
                  <tr key={w.id}>
                    <td className="num">{w.employee_code || '—'}</td>
                    <td>{w.full_name}</td>
                    <td>{w.designation || '—'}</td>
                    <td>{w.department || '—'}</td>
                    <td>{w.shift || '—'}</td>
                    <td>{w.pay_type || '—'}</td>
                    <td className="num">{maskAccountNumber(w.bank_account_no)}</td>
                    <td>{w.esi_applicable ? 'Y' : '—'}</td>
                    <td>{w.pf_applicable ? 'Y' : '—'}</td>
                    <td>{w.pt_applicable ? 'Y' : '—'}</td>
                    <td>
                      <span className={w.is_active ? 'hr-badge hr-badge-ok' : 'hr-badge hr-badge-danger'}>
                        {w.is_active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>
                      <div className="share-actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setWorkerForm(workerToForm(w))
                            setShowWorkerForm(true)
                          }}
                        >
                          Edit
                        </button>
                        {w.is_active ? (
                          <button type="button" className="btn-ghost" onClick={() => void deactivateWorker(w)}>
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sub === 'leave' ? (
        <div className="form-stack">
          <section className="surface card-row form-stack">
            <h2 className="section-title">Holidays</h2>
            <form className="form-stack" onSubmit={(e) => void addHoliday(e)}>
              <label className="field">
                <span className="text-muted">Date</span>
                <input type="date" value={holidayDate} onChange={(e) => setHolidayDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="text-muted">Title</span>
                <input value={holidayTitle} onChange={(e) => setHolidayTitle(e.target.value)} />
              </label>
              <button type="submit" className="primary-save" disabled={busy}>
                Add Holiday
              </button>
            </form>
            <div className="list">
              {holidays.map((h) => (
                <article key={h.id} className="card-row">
                  <strong>{h.holiday_date}</strong>
                  <span className="text-muted">{h.title}</span>
                </article>
              ))}
              {!holidays.length ? <p className="text-muted">No holidays</p> : null}
            </div>
          </section>
          <section className="surface card-row form-stack">
            <h2 className="section-title">Leave Entries</h2>
            <form className="form-stack" onSubmit={(e) => void saveLeave(e)}>
              <label className="field">
                <span className="text-muted">Employee</span>
                <select value={leaveWorkerId} onChange={(e) => setLeaveWorkerId(e.target.value)} required>
                  <option value="">Select…</option>
                  {activeWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.employee_code ? `${w.employee_code} · ` : ''}
                      {w.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="text-muted">Leave date</span>
                <input type="date" value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="text-muted">Type</span>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                  {ATTENDANCE_STATUSES.filter((s) => s === 'Leave' || s === 'Weekly Off' || s === 'Holiday').map(
                    (s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="field">
                <span className="text-muted">Remarks</span>
                <input value={leaveRemarks} onChange={(e) => setLeaveRemarks(e.target.value)} />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={syncAttendanceLeave}
                  onChange={(e) => setSyncAttendanceLeave(e.target.checked)}
                />
                <span>Sync attendance status to Leave for this date</span>
              </label>
              <button type="submit" className="primary-save" disabled={busy}>
                Save Leave
              </button>
            </form>
            <div className="hr-table-wrap">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveEntries.map((le) => {
                    const w = workers.find((x) => x.id === le.worker_id)
                    return (
                      <tr key={le.id}>
                        <td>{le.leave_date}</td>
                        <td>{w?.full_name || le.worker_id}</td>
                        <td>{le.leave_type}</td>
                        <td>{le.remarks || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {sub === 'rates' ? (
        <div className="form-stack">
          <p className="text-muted2">Monthly ÷ 26 auto-fills daily rate. Active rate changes create history rows.</p>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>S.No</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Dept</th>
                  <th>Pay Type</th>
                  <th>Monthly</th>
                  <th>Daily</th>
                  <th>Hourly</th>
                  <th>OT</th>
                  <th>Effective From</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activeWorkers.map((w, idx) => {
                  const d = rateDrafts[w.id]
                  if (!d) return null
                  return (
                    <tr key={w.id}>
                      <td className="num">{idx + 1}</td>
                      <td className="num">{w.employee_code || '—'}</td>
                      <td>{w.full_name}</td>
                      <td>{w.designation || '—'}</td>
                      <td>{w.department || '—'}</td>
                      <td>
                        <select
                          value={d.pay_type}
                          onChange={(e) => updateRateDraft(w.id, { pay_type: e.target.value })}
                        >
                          {PAY_TYPES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="num"
                          type="number"
                          value={d.monthly_rate}
                          onChange={(e) => updateRateDraft(w.id, { monthly_rate: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="num"
                          type="number"
                          value={d.daily_rate}
                          onChange={(e) => updateRateDraft(w.id, { daily_rate: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="num"
                          type="number"
                          value={d.hourly_rate}
                          onChange={(e) => updateRateDraft(w.id, { hourly_rate: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          className="num"
                          type="number"
                          value={d.ot_rate}
                          onChange={(e) => updateRateDraft(w.id, { ot_rate: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={d.effective_from}
                          onChange={(e) => updateRateDraft(w.id, { effective_from: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          value={d.status}
                          onChange={(e) => updateRateDraft(w.id, { status: e.target.value })}
                        >
                          <option value="Active">Active</option>
                          <option value="Draft">Draft</option>
                        </select>
                      </td>
                      <td>
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => void saveRate(w)}>
                          Save
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(sub === 'payroll' || sub === 'statutory') ? (
        <div className="form-stack">
          <div className="hr-toolbar form-stack">
            <label className="field">
              <span className="text-muted">Payroll month</span>
              <input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} />
            </label>
            <div className="share-actions">
              <label className="field">
                <span className="text-muted">From</span>
                <input type="date" value={bounds.from} readOnly />
              </label>
              <label className="field">
                <span className="text-muted">To</span>
                <input type="date" value={bounds.to} readOnly />
              </label>
              <label className="field">
                <span className="text-muted">Working days</span>
                <input
                  className="num"
                  type="number"
                  value={workingDays}
                  onChange={(e) => setWorkingDays(Number(e.target.value) || DEFAULT_MONTHLY_DIVISOR)}
                />
              </label>
            </div>
            <div className="share-actions">
              <label className="hr-toggle check-row">
                <input type="checkbox" checked={runEsi} onChange={(e) => setRunEsi(e.target.checked)} />
                <span>ESI ON</span>
              </label>
              <label className="hr-toggle check-row">
                <input type="checkbox" checked={runPf} onChange={(e) => setRunPf(e.target.checked)} />
                <span>PF ON</span>
              </label>
              <label className="hr-toggle check-row">
                <input type="checkbox" checked={runPt} onChange={(e) => setRunPt(e.target.checked)} />
                <span>PT ON</span>
              </label>
              <label className="hr-toggle check-row">
                <input type="checkbox" checked={runOther} onChange={(e) => setRunOther(e.target.checked)} />
                <span>Other Deduction ON</span>
              </label>
            </div>
            {sub === 'payroll' ? (
              <button type="button" className="primary-save" disabled={busy} onClick={() => void calculatePayroll()}>
                CALCULATE PAYROLL
              </button>
            ) : (
              <div className="share-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || !payrollRun}
                  onClick={() =>
                    void updateRunToggles({
                      esi_on: runEsi,
                      pf_on: runPf,
                      pt_on: runPt,
                      other_deduction_on: runOther,
                    })
                  }
                >
                  Apply toggles &amp; recalculate
                </button>
              </div>
            )}
            {payrollRun ? (
              <p className="text-muted2">
                Run status: <span className={statusBadgeClass(payrollRun.status)}>{payrollRun.status}</span>
              </p>
            ) : null}
          </div>

          {sub === 'payroll' ? (
            <>
              <div className="hr-toolbar share-actions">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={entries.length > 0 && selectedEntryIds.size === entries.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedEntryIds(new Set(entries.map((x) => x.id)))
                      else setSelectedEntryIds(new Set())
                    }}
                  />
                  <span>Select All</span>
                </label>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || !selectedEntryIds.size}
                  onClick={() => void updateEntryStatus([...selectedEntryIds], 'Approved')}
                >
                  Approve Selected
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || !selectedEntryIds.size}
                  onClick={() => void updateEntryStatus([...selectedEntryIds], 'Ready for Salary Payment')}
                >
                  Mark Ready for Salary Payment
                </button>
              </div>
              <div className="hr-totals-bar surface">
                Selected: <span className="num">{selectedTotals.count}</span> · Net:{' '}
                <span className="num">{formatINRExact(selectedTotals.net)}</span>
              </div>
            </>
          ) : null}

          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  {sub === 'payroll' ? <th /> : null}
                  <th>Code</th>
                  <th>Name</th>
                  <th>Dept</th>
                  <th>Present</th>
                  <th>Payable</th>
                  <th>Basic</th>
                  <th>Gross</th>
                  <th>ESI</th>
                  <th>PF</th>
                  <th>PT</th>
                  <th>Net</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    {sub === 'payroll' ? (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedEntryIds.has(e.id)}
                          onChange={(ev) => {
                            setSelectedEntryIds((prev) => {
                              const next = new Set(prev)
                              if (ev.target.checked) next.add(e.id)
                              else next.delete(e.id)
                              return next
                            })
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="num">{e.employee_code || '—'}</td>
                    <td>{e.employee_name}</td>
                    <td>{e.department || '—'}</td>
                    <td className="num">{e.present_days}</td>
                    <td className="num">{e.payable_days}</td>
                    <td className="num">{formatINRExact(e.basic_salary)}</td>
                    <td className="num">{formatINRExact(e.gross_salary)}</td>
                    <td className="num">{formatINRExact(e.esi_amount)}</td>
                    <td className="num">{formatINRExact(e.pf_amount)}</td>
                    <td className="num">{formatINRExact(e.pt_amount)}</td>
                    <td className="num">{formatINRExact(e.net_payable)}</td>
                    <td>
                      <span className={statusBadgeClass(e.status)}>{e.status}</span>
                    </td>
                    <td>
                      <div className="share-actions">
                        <button type="button" className="btn-ghost" onClick={() => setDetailEntry(e)}>
                          View
                        </button>
                        {sub === 'payroll' ? (
                          <button type="button" className="btn-ghost" onClick={() => setEditEntry(e)}>
                            Edit
                          </button>
                        ) : null}
                        {sub === 'statutory' ? (
                          <>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={!!e.esi_on}
                                onChange={(ev) => void recalcEntry(e, { esi_on: ev.target.checked })}
                              />
                              <span>ESI</span>
                            </label>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={!!e.pf_on}
                                onChange={(ev) => void recalcEntry(e, { pf_on: ev.target.checked })}
                              />
                              <span>PF</span>
                            </label>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={!!e.pt_on}
                                onChange={(ev) => void recalcEntry(e, { pt_on: ev.target.checked })}
                              />
                              <span>PT</span>
                            </label>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sub === 'register' ? (
        <div className="form-stack">
          <div className="hr-toolbar share-actions">
            <label className="field">
              <span className="text-muted">Search</span>
              <input value={regSearch} onChange={(e) => setRegSearch(e.target.value)} placeholder="Name or code" />
            </label>
            <label className="field">
              <span className="text-muted">Month</span>
              <input type="month" value={regMonth} onChange={(e) => setRegMonth(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Department</span>
              <select value={regDept} onChange={(e) => setRegDept(e.target.value)}>
                <option value="">All</option>
                {[...new Set(workers.map((w) => w.department).filter(Boolean))].map((d) => (
                  <option key={d} value={d!}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Status</span>
              <select value={regStatus} onChange={(e) => setRegStatus(e.target.value)}>
                <option value="">All</option>
                {PAYROLL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Dept</th>
                  <th>Payable</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {registerRows.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{e.employee_code || '—'}</td>
                    <td>{e.employee_name}</td>
                    <td>{e.department || '—'}</td>
                    <td className="num">{e.payable_days}</td>
                    <td className="num">{formatINRExact(e.gross_salary)}</td>
                    <td className="num">{formatINRExact(e.total_deduction)}</td>
                    <td className="num">{formatINRExact(e.net_payable)}</td>
                    <td>
                      <span className={statusBadgeClass(e.status)}>{e.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {sub === 'payment' ? (
        <div className="form-stack">
          <div className="hr-toolbar share-actions">
            <label className="field">
              <span className="text-muted">Payroll month</span>
              <input type="month" value={payrollMonth} onChange={(e) => setPayrollMonth(e.target.value)} />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={paymentEntries.length > 0 && selectedEntryIds.size === paymentEntries.length}
                onChange={(e) => {
                  if (e.target.checked) setSelectedEntryIds(new Set(paymentEntries.map((x) => x.id)))
                  else setSelectedEntryIds(new Set())
                }}
              />
              <span>Select All</span>
            </label>
            <span className="text-muted">
              Selected <span className="num">{selectedTotals.count}</span> · Total{' '}
              <span className="num">{formatINRExact(selectedTotals.net)}</span>
            </span>
            <button type="button" className="primary-save" disabled={busy} onClick={() => void generateBankLetter()}>
              GENERATE BANK SALARY LETTER
            </button>
          </div>
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead>
                <tr>
                  <th />
                  <th>Code</th>
                  <th>Name</th>
                  <th>Bank</th>
                  <th>IFSC</th>
                  <th>Net</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {paymentEntries.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.has(e.id)}
                        onChange={(ev) => {
                          setSelectedEntryIds((prev) => {
                            const next = new Set(prev)
                            if (ev.target.checked) next.add(e.id)
                            else next.delete(e.id)
                            return next
                          })
                        }}
                      />
                    </td>
                    <td className="num">{e.employee_code || '—'}</td>
                    <td>{e.employee_name}</td>
                    <td className="num">{maskAccountNumber(e.bank_account_no)}</td>
                    <td>{e.bank_ifsc || '—'}</td>
                    <td className="num">{formatINRExact(e.net_payable)}</td>
                    <td>
                      <span className={statusBadgeClass(e.status)}>{e.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!paymentEntries.length ? <p className="text-muted">No entries ready for payment</p> : null}
          </div>
        </div>
      ) : null}

      {sub === 'bank-letter' ? (
        <div className="form-stack">
          <div className="hr-toolbar share-actions">
            <label className="field">
              <span className="text-muted">Letter</span>
              <select
                value={viewLetterId || ''}
                onChange={(e) => {
                  setViewLetterId(e.target.value || null)
                  void loadLetters(e.target.value || null)
                }}
              >
                {letters.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.salary_month} · {formatINR(l.total_amount)} · {l.letter_date}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>
              Print
            </button>
            <button type="button" className="btn-ghost" onClick={() => window.print()}>
              Download/Print PDF
            </button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => void regenerateLetter()}>
              Regenerate
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('payroll')}>
              Back to Payroll
            </button>
          </div>
          {activeLetter ? (
            <article className="hr-letter hr-letter-print surface">
              <header>
                <strong>{company.name}</strong>
                <div className="text-muted2">{company.address}</div>
                {company.phone ? <div className="text-muted2">Ph: {company.phone}</div> : null}
              </header>
              <h2>SALARY PAYMENT INSTRUCTION</h2>
              <p>
                Date: <strong>{activeLetter.letter_date}</strong>
              </p>
              <p>
                Salary Month: <strong>{activeLetter.salary_month}</strong>
              </p>
              <p>To The Bank Manager</p>
              <p>
                Subject: Salary payment for {bounds.label || activeLetter.salary_month} —{' '}
                {activeLetter.total_employees} employees
              </p>
              <div className="hr-table-wrap">
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Designation</th>
                      <th>Bank</th>
                      <th>Account</th>
                      <th>IFSC</th>
                      <th>Net Salary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {letterItems.map((it) => (
                      <tr key={it.id}>
                        <td className="num">{it.sno}</td>
                        <td className="num">{it.employee_code || '—'}</td>
                        <td>{it.employee_name}</td>
                        <td>{it.designation || '—'}</td>
                        <td>{it.bank_name || '—'}</td>
                        <td className="num">
                          {showFullAccounts ? it.bank_account_no || '—' : maskAccountNumber(it.bank_account_no)}
                        </td>
                        <td>{it.bank_ifsc || '—'}</td>
                        <td className="num">{formatINRExact(it.net_salary)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="hr-totals-bar">
                Total: <span className="num">{formatINRExact(activeLetter.total_amount)}</span>
              </div>
              <p>{activeLetter.amount_in_words || amountInWords(activeLetter.total_amount)}</p>
              <footer className="form-stack" style={{ marginTop: '2rem' }}>
                <p>For {company.name}</p>
                <p>Authorized Signatory</p>
                <p className="text-muted2">_________________________</p>
              </footer>
            </article>
          ) : (
            <p className="text-muted">No bank salary letter yet — generate from Salary Payment.</p>
          )}
        </div>
      ) : null}

      {sub === 'reports' ? (
        <div className="form-stack">
          <div className="hr-quick-actions share-actions">
            {(
              [
                ['attendance', 'Attendance Summary'],
                ['payroll', 'Payroll Summary'],
                ['statutory', 'ESI / PF / PT'],
                ['payment', 'Payment Report'],
                ['letters', 'Bank Letter History'],
                ['history', 'Salary History'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={reportKind === id ? 'primary-save' : 'btn-ghost'}
                onClick={() => setReportKind(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="text-muted">Month</span>
            <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          </label>

          {reportKind === 'attendance' ? (
            <div className="hr-table-wrap">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Leave</th>
                  </tr>
                </thead>
                <tbody>
                  {attSummary.map((row) => (
                    <tr key={row.worker.id}>
                      <td>{row.worker.full_name}</td>
                      <td className="num">{row.present}</td>
                      <td className="num">{row.absent}</td>
                      <td className="num">{row.leave}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {reportKind === 'payroll' || reportKind === 'statutory' || reportKind === 'payment' ? (
            <ReportPayrollBlock kind={reportKind} month={reportMonth} workers={workers} />
          ) : null}

          {reportKind === 'letters' ? (
            <div className="hr-table-wrap">
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Month</th>
                    <th>Employees</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {letters.map((l) => (
                    <tr key={l.id}>
                      <td>{l.letter_date}</td>
                      <td>{l.salary_month}</td>
                      <td className="num">{l.total_employees}</td>
                      <td className="num">{formatINRExact(l.total_amount)}</td>
                      <td>
                        <span className={statusBadgeClass(l.status)}>{l.status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => {
                            setViewLetterId(l.id)
                            goNav('bank-letter', l.id)
                          }}
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {reportKind === 'history' ? (
            <SalaryHistoryBlock
              month={reportMonth}
              workerId={historyWorkerId}
              onWorkerChange={setHistoryWorkerId}
              workers={activeWorkers}
            />
          ) : null}
        </div>
      ) : null}

      {detailEntry ? (
        <div className="surface card-row form-stack" role="dialog">
          <h2 className="section-title">{detailEntry.employee_name}</h2>
          <p className="text-muted">
            {detailEntry.employee_code} · {detailEntry.department} · {detailEntry.pay_type}
          </p>
          <div className="list">
            <div>Present days: {detailEntry.present_days}</div>
            <div>Leave days: {detailEntry.leave_days}</div>
            <div>Payable days: {detailEntry.payable_days}</div>
            <div>Basic: {formatINRExact(detailEntry.basic_salary)}</div>
            <div>Allowances: {formatINRExact(detailEntry.allowances)}</div>
            <div>Gross: {formatINRExact(detailEntry.gross_salary)}</div>
            <div>ESI: {formatINRExact(detailEntry.esi_amount)}</div>
            <div>PF: {formatINRExact(detailEntry.pf_amount)}</div>
            <div>PT: {formatINRExact(detailEntry.pt_amount)}</div>
            <div>Advance: {formatINRExact(detailEntry.advance)}</div>
            <div>Net: {formatINRExact(detailEntry.net_payable)}</div>
            <div>
              Status: <span className={statusBadgeClass(detailEntry.status)}>{detailEntry.status}</span>
            </div>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setDetailEntry(null)}>
            Close
          </button>
        </div>
      ) : null}

      {editEntry ? (
        <div className="surface card-row form-stack" role="dialog">
          <h2 className="section-title">Edit · {editEntry.employee_name}</h2>
          <label className="field">
            <span className="text-muted">Allowances</span>
            <input
              className="num"
              type="number"
              value={editEntry.allowances}
              onChange={(e) => setEditEntry({ ...editEntry, allowances: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span className="text-muted">Other deduction</span>
            <input
              className="num"
              type="number"
              value={editEntry.other_deduction}
              onChange={(e) => setEditEntry({ ...editEntry, other_deduction: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span className="text-muted">Advance</span>
            <input
              className="num"
              type="number"
              value={editEntry.advance}
              onChange={(e) => setEditEntry({ ...editEntry, advance: Number(e.target.value) || 0 })}
            />
          </label>
          <div className="share-actions">
            <button
              type="button"
              className="primary-save"
              disabled={busy}
              onClick={() => {
                void recalcEntry(editEntry, editEntry).then(() => {
                  setEditEntry(null)
                  setMessage('Entry recalculated')
                })
              }}
            >
              Recalculate &amp; Save
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditEntry(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}

function ReportPayrollBlock({
  kind,
  month,
  workers,
}: {
  kind: 'payroll' | 'statutory' | 'payment'
  month: string
  workers: Worker[]
}) {
  const [rows, setRows] = useState<PayrollEntry[]>([])
  useEffect(() => {
    void (async () => {
      const { data: run } = await supabase.from('payroll_runs').select('id').eq('payroll_month', month).maybeSingle()
      if (!run?.id) {
        setRows([])
        return
      }
      let q = supabase.from('payroll_entries').select('*').eq('payroll_run_id', run.id)
      if (kind === 'payment') q = q.eq('status', 'Ready for Salary Payment')
      const { data } = await q.order('employee_name')
      setRows((data as PayrollEntry[]) ?? [])
    })()
  }, [kind, month])

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, e) => ({
          gross: acc.gross + Number(e.gross_salary),
          esi: acc.esi + Number(e.esi_amount),
          pf: acc.pf + Number(e.pf_amount),
          pt: acc.pt + Number(e.pt_amount),
          net: acc.net + Number(e.net_payable),
        }),
        { gross: 0, esi: 0, pf: 0, pt: 0, net: 0 },
      ),
    [rows],
  )

  if (!rows.length) return <p className="text-muted">No payroll data for {month}</p>

  if (kind === 'statutory') {
    return (
      <div className="form-stack">
        <div className="hr-kpi-grid">
          <div className="hr-kpi surface">
            <div className="hr-kpi-value num">{formatINR(totals.esi)}</div>
            <div className="hr-kpi-label">Total ESI</div>
          </div>
          <div className="hr-kpi surface">
            <div className="hr-kpi-value num">{formatINR(totals.pf)}</div>
            <div className="hr-kpi-label">Total PF</div>
          </div>
          <div className="hr-kpi surface">
            <div className="hr-kpi-value num">{formatINR(totals.pt)}</div>
            <div className="hr-kpi-label">Total PT</div>
          </div>
        </div>
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>ESI</th>
                <th>PF</th>
                <th>PT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{e.employee_name}</td>
                  <td className="num">{formatINRExact(e.esi_amount)}</td>
                  <td className="num">{formatINRExact(e.pf_amount)}</td>
                  <td className="num">{formatINRExact(e.pt_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="hr-table-wrap">
      <table className="hr-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Dept</th>
            <th>Gross</th>
            <th>Net</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{e.employee_name}</td>
              <td>{e.department || workers.find((w) => w.id === e.worker_id)?.department || '—'}</td>
              <td className="num">{formatINRExact(e.gross_salary)}</td>
              <td className="num">{formatINRExact(e.net_payable)}</td>
              <td>
                <span className={statusBadgeClass(e.status)}>{e.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <strong>Totals</strong>
            </td>
            <td className="num">{formatINRExact(totals.gross)}</td>
            <td className="num">{formatINRExact(totals.net)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function SalaryHistoryBlock({
  month,
  workerId,
  onWorkerChange,
  workers,
}: {
  month: string
  workerId: string
  onWorkerChange: (id: string) => void
  workers: Worker[]
}) {
  const [rows, setRows] = useState<PayrollEntry[]>([])
  useEffect(() => {
    void (async () => {
      if (!workerId) {
        setRows([])
        return
      }
      const { data } = await supabase
        .from('payroll_entries')
        .select('*, payroll_runs!inner(payroll_month)')
        .eq('worker_id', workerId)
        .eq('payroll_runs.payroll_month', month)
        .order('created_at', { ascending: false })
      setRows((data as PayrollEntry[]) ?? [])
    })()
  }, [workerId, month])

  return (
    <div className="form-stack">
      <label className="field">
        <span className="text-muted">Employee</span>
        <select value={workerId} onChange={(e) => onWorkerChange(e.target.value)}>
          <option value="">Select…</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
      </label>
      {!workerId ? <p className="text-muted">Select an employee</p> : null}
      {workerId && !rows.length ? <p className="text-muted">No salary rows for this month</p> : null}
      {rows.length ? (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Payable</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="num">{e.payable_days}</td>
                  <td className="num">{formatINRExact(e.gross_salary)}</td>
                  <td className="num">{formatINRExact(e.total_deduction)}</td>
                  <td className="num">{formatINRExact(e.net_payable)}</td>
                  <td>
                    <span className={statusBadgeClass(e.status)}>{e.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
