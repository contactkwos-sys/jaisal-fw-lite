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
  COMMON_DEPARTMENTS,
  COMMON_DESIGNATIONS,
  dailyFromMonthly,
  DEFAULT_COMPANY,
  DEFAULT_MONTHLY_DIVISOR,
  EMPLOYEE_PAY_TYPES,
  EMPLOYEE_SHIFTS,
  formatINR,
  formatINRExact,
  formatUserError,
  isPresentStatus,
  maskAccountNumber,
  mergeSelectOptions,
  monthBounds,
  PAY_TYPES,
  PAYROLL_STATUSES,
  payableDayFromAttendance,
  resolveSelectValue,
  splitSelectChoice,
  statusBadgeClass,
  todayISO,
  type CompanyProfile,
} from '../lib/hrPayroll'
import {
  createSalaryAdvance,
  fetchSalaryAdvances,
  type SalaryAdvanceRow,
} from '../lib/ceoPinManagement'
import { HrPayrollReportsPanel } from '../components/hr/HrPayrollReportsPanel'
import { SalaryUpToDatePanel } from '../components/hr/SalaryUpToDatePanel'
import { listPayrollJobs } from '../lib/payrollJobs'
import { supabase } from '../lib/supabase'
import { buildPayrollEntryFromAttendance, pickLatestSalaryRate } from '../lib/hrPayroll'

type Sub =
  | 'dashboard'
  | 'employees'
  | 'leave'
  | 'rates'
  | 'advance'
  | 'payroll'
  | 'statutory'
  | 'register'
  | 'payment'
  | 'bank-letter'
  | 'reports'
  | 'salary-status'

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
  designation_choice: string
  designation_other: string
  department_choice: string
  department_other: string
  shift_choice: string
  shift_other: string
  pay_type_choice: string
  pay_type_other: string
  salary_rate: string
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

type WorkerFormErrors = {
  full_name?: string
  designation?: string
  department?: string
  shift?: string
  employee_code?: string
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
  monthPresentDays: number
  monthPaidDays: number
  salaryEarnedMtd: number
  advanceMtd: number
  salaryPaidMtd: number
  salaryOutstanding: number
}

const SUBS: Array<{ id: Sub; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'employees', label: 'Employees' },
  { id: 'leave', label: 'Leave' },
  { id: 'rates', label: 'Rates' },
  { id: 'advance', label: 'Advance Salary' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'statutory', label: 'Statutory' },
  { id: 'register', label: 'Register' },
  { id: 'payment', label: 'Payment' },
  { id: 'bank-letter', label: 'Bank Letter' },
  { id: 'reports', label: 'Reports' },
  { id: 'salary-status', label: 'Salary Up To Date' },
]

const MIGRATION_HINT = 'Run public/migration-hr-payroll-module.sql in Supabase SQL editor, then refresh.'

function isMigrationError(msg: string): boolean {
  return /does not exist|schema cache|PGRST/i.test(msg)
}

function errMsg(e: unknown): string {
  return formatUserError(e)
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
    designation_choice: '',
    designation_other: '',
    department_choice: '',
    department_other: '',
    shift_choice: 'Day',
    shift_other: '',
    pay_type_choice: 'Daily',
    pay_type_other: '',
    salary_rate: '',
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

function workerToForm(
  w: Worker,
  opts: { designations: string[]; departments: string[]; shifts: string[]; payTypes: string[] },
  latestRate?: SalaryRate | null,
): WorkerForm {
  const desig = splitSelectChoice(w.designation, opts.designations)
  const dept = splitSelectChoice(w.department, opts.departments)
  const shift = splitSelectChoice(w.shift || 'Day', opts.shifts)
  const pay = splitSelectChoice(w.pay_type || 'Daily', opts.payTypes)
  let salaryRate = ''
  if (latestRate) {
    const pt = (latestRate.pay_type || w.pay_type || 'Daily').toLowerCase()
    if (pt === 'monthly') salaryRate = String(latestRate.monthly_rate || '')
    else if (pt === 'hourly') salaryRate = String(latestRate.hourly_rate || '')
    else salaryRate = String(latestRate.daily_rate || '')
  }
  return {
    id: w.id,
    full_name: w.full_name,
    employee_code: w.employee_code || '',
    designation_choice: desig.choice,
    designation_other: desig.other,
    department_choice: dept.choice,
    department_other: dept.other,
    shift_choice: shift.choice || 'Day',
    shift_other: shift.other,
    pay_type_choice: pay.choice || 'Daily',
    pay_type_other: pay.other,
    salary_rate: salaryRate && salaryRate !== '0' ? salaryRate : '',
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

function rateLabelForPayType(payType: string): string {
  const p = payType.toLowerCase()
  if (p === 'monthly') return 'Monthly salary (₹)'
  if (p === 'hourly') return 'Hourly rate (₹)'
  if (p === 'other') return 'Salary / rate (₹)'
  return 'Daily rate (₹)'
}

function pickLatestRate(rates: SalaryRate[], workerId: string, toDate: string): SalaryRate | null {
  return pickLatestSalaryRate(rates, workerId, toDate)
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
    advance: 'Advance Salary',
    payroll: 'Payroll',
    statutory: 'ESI / PF / PT',
    register: 'Salary Register',
    payment: 'Salary Payment',
    'bank-letter': 'Bank Salary Letter',
    reports: 'HR & Payroll Reports',
    'salary-status': 'Salary Up To Date',
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
  const [dashboardBusy, setDashboardBusy] = useState(false)
  const [workersReady, setWorkersReady] = useState(false)

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

  const [advances, setAdvances] = useState<SalaryAdvanceRow[]>([])
  const [advanceWorkerId, setAdvanceWorkerId] = useState('')
  const [advanceDate, setAdvanceDate] = useState(() => todayISO())
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceMode, setAdvanceMode] = useState<'Cash' | 'Cheque' | 'Bank Transfer' | 'Other'>('Cash')
  const [advanceRef, setAdvanceRef] = useState('')
  const [advanceBank, setAdvanceBank] = useState('')
  const [advanceRemarks, setAdvanceRemarks] = useState('')

  const [kpis, setKpis] = useState<DashboardKpis>({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    onLeave: 0,
    payrollReady: 0,
    paymentDone: 0,
    monthPresentDays: 0,
    monthPaidDays: 0,
    salaryEarnedMtd: 0,
    advanceMtd: 0,
    salaryPaidMtd: 0,
    salaryOutstanding: 0,
  })

  const [workerForm, setWorkerForm] = useState<WorkerForm>(emptyWorkerForm())
  const [workerFormErrors, setWorkerFormErrors] = useState<WorkerFormErrors>({})
  const [showWorkerForm, setShowWorkerForm] = useState(false)
  const [jobNames, setJobNames] = useState<string[]>([])
  const [empSearch, setEmpSearch] = useState('')
  const [empFilterDesig, setEmpFilterDesig] = useState('')
  const [empFilterDept, setEmpFilterDept] = useState('')
  const [empFilterShift, setEmpFilterShift] = useState('')
  const [empFilterActive, setEmpFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
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

  const [historyWorkerId, setHistoryWorkerId] = useState('')

  const bounds = useMemo(() => monthBounds(payrollMonth), [payrollMonth])
  const activeWorkers = useMemo(() => workers.filter((w) => w.is_active), [workers])

  const designationOptions = useMemo(
    () =>
      mergeSelectOptions(
        COMMON_DESIGNATIONS,
        jobNames,
        workers.map((w) => w.designation),
      ),
    [jobNames, workers],
  )

  const departmentOptions = useMemo(
    () =>
      mergeSelectOptions(
        COMMON_DEPARTMENTS,
        roles.map((r) => r.role_name),
        workers.map((w) => w.department),
      ),
    [roles, workers],
  )

  const shiftOptions = useMemo(
    () => mergeSelectOptions(EMPLOYEE_SHIFTS, workers.map((w) => w.shift)),
    [workers],
  )

  const payTypeOptions = useMemo(
    () => mergeSelectOptions(EMPLOYEE_PAY_TYPES, workers.map((w) => w.pay_type)),
    [workers],
  )

  const filterDesignationOptions = useMemo(
    () => designationOptions.filter((d) => d.toLowerCase() !== 'other'),
    [designationOptions],
  )

  const filterDepartmentOptions = useMemo(
    () => departmentOptions.filter((d) => d.toLowerCase() !== 'other'),
    [departmentOptions],
  )

  const filterShiftOptions = useMemo(
    () => shiftOptions.filter((d) => d.toLowerCase() !== 'other'),
    [shiftOptions],
  )

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    return workers.filter((w) => {
      if (empFilterActive === 'active' && !w.is_active) return false
      if (empFilterActive === 'inactive' && w.is_active) return false
      if (empFilterDesig && (w.designation || '').toLowerCase() !== empFilterDesig.toLowerCase()) return false
      if (empFilterDept && (w.department || '').toLowerCase() !== empFilterDept.toLowerCase()) return false
      if (empFilterShift && (w.shift || '').toLowerCase() !== empFilterShift.toLowerCase()) return false
      if (!q) return true
      const code = (w.employee_code || '').toLowerCase()
      const name = (w.full_name || '').toLowerCase()
      return name.includes(q) || code.includes(q)
    })
  }, [workers, empSearch, empFilterDesig, empFilterDept, empFilterShift, empFilterActive])

  const selectOpts = useMemo(
    () => ({
      designations: designationOptions,
      departments: departmentOptions,
      shifts: shiftOptions,
      payTypes: payTypeOptions,
    }),
    [designationOptions, departmentOptions, shiftOptions, payTypeOptions],
  )

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
    setWorkersReady(true)
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
    const monthFrom = monthBounds(today.slice(0, 7)).from
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

    const { data: monthAtt, error: maErr } = await supabase
      .from('attendance')
      .select('*')
      .gte('date', monthFrom)
      .lte('date', today)
    if (maErr) throw maErr
    let monthPresentDays = 0
    let monthPaidDays = 0
    for (const a of (monthAtt as Attendance[]) ?? []) {
      const st = a.status || 'Absent'
      if (isPresentStatus(st)) monthPresentDays++
      monthPaidDays += Number(a.payable_day ?? payableDayFromAttendance(st, Number(a.total_hours) || 0))
    }
    monthPaidDays = Math.round(monthPaidDays * 100) / 100

    const { data: advMtd, error: advErr } = await supabase
      .from('salary_advance_transactions')
      .select('amount')
      .eq('is_voided', false)
      .gte('advance_date', monthFrom)
      .lte('advance_date', today)
    let advanceMtd = 0
    if (advErr) {
      if (isMigrationError(advErr.message)) throw advErr
      console.error('Dashboard advance MTD query failed:', advErr)
    } else {
      advanceMtd = (advMtd ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount || 0), 0)
    }

    let salaryEarnedMtd = 0
    let salaryPaidMtd = 0
    const attByWorkerMonth = new Map<string, Attendance[]>()
    for (const a of (monthAtt as Attendance[]) ?? []) {
      const list = attByWorkerMonth.get(a.worker_id) || []
      list.push(a)
      attByWorkerMonth.set(a.worker_id, list)
    }
    for (const w of active) {
      const rate = pickLatestRate(salaryRates, w.id, today)
      const pseudoRun: PayrollRun = {
        id: 'dash',
        payroll_month: today.slice(0, 7),
        from_date: monthFrom,
        to_date: today,
        status: 'Draft',
        esi_on: true,
        pf_on: true,
        pt_on: true,
        other_deduction_on: true,
        working_days: DEFAULT_MONTHLY_DIVISOR,
        notes: null,
        created_by: null,
        created_at: '',
        updated_at: '',
      }
      const entry = buildPayrollEntryFromAttendance(
        w,
        attByWorkerMonth.get(w.id) || [],
        rate,
        pseudoRun,
        0,
        roles,
        payrollRates,
      )
      salaryEarnedMtd += Number(entry.gross_salary)
    }

    const { data: ready, error: rErr } = await supabase
      .from('payroll_entries')
      .select('id')
      .eq('status', 'Ready for Salary Payment')
    if (rErr) throw rErr
    const { data: done, error: dErr } = await supabase
      .from('payroll_entries')
      .select('net_payable')
      .in('status', ['Payment Processed', 'Included in Bank Salary Letter'])
    if (dErr) throw dErr
    salaryPaidMtd = (done ?? []).reduce((s, r) => s + Number((r as { net_payable: number }).net_payable || 0), 0)

    setKpis({
      totalEmployees: active.length,
      presentToday: present,
      absentToday: absent,
      onLeave,
      payrollReady: ready?.length ?? 0,
      paymentDone: done?.length ?? 0,
      monthPresentDays,
      monthPaidDays,
      salaryEarnedMtd: Math.round(salaryEarnedMtd * 100) / 100,
      advanceMtd,
      salaryPaidMtd: Math.round(salaryPaidMtd * 100) / 100,
      salaryOutstanding: Math.round((salaryEarnedMtd - advanceMtd - salaryPaidMtd) * 100) / 100,
    })
  }, [workers, salaryRates, roles, payrollRates])

  const loadHolidaysLeave = useCallback(async () => {
    const [{ data: h }, { data: l }] = await Promise.all([
      supabase.from('holidays').select('*').order('holiday_date', { ascending: false }),
      supabase.from('leave_entries').select('*').order('leave_date', { ascending: false }).limit(200),
    ])
    if (h === null && l === null) return
    setHolidays((h as Holiday[]) ?? [])
    setLeaveEntries((l as LeaveEntry[]) ?? [])
  }, [])

  const loadAdvances = useCallback(async () => {
    const rows = await fetchSalaryAdvances()
    setAdvances(rows)
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
        if (sub === 'dashboard' || sub === 'salary-status' || sub === 'reports') {
          await loadSalaryRates()
        }
        if (sub === 'employees' || sub === 'rates') await loadSalaryRates()
        if (sub === 'employees') {
          try {
            const jobs = await listPayrollJobs()
            setJobNames(jobs.map((j) => j.job_name))
          } catch {
            setJobNames([])
          }
        }
        if (sub === 'leave') await loadHolidaysLeave()
        if (sub === 'advance') await loadAdvances()
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
    loadSalaryRates,
    loadHolidaysLeave,
    loadAdvances,
    loadPayrollRun,
    loadRegisterEntries,
    loadLetters,
    viewLetterId,
    handleDbError,
  ])

  const refreshDashboard = useCallback(async () => {
    if (migrationMissing || sub !== 'dashboard') return
    setDashboardBusy(true)
    setError(null)
    try {
      await loadSalaryRates()
      await loadDashboard()
    } catch (e) {
      handleDbError(e)
    } finally {
      setDashboardBusy(false)
    }
  }, [migrationMissing, sub, loadSalaryRates, loadDashboard, handleDbError])

  useEffect(() => {
    if (!workersReady || migrationMissing || sub !== 'dashboard') return
    void refreshDashboard()
  }, [workersReady, migrationMissing, sub, refreshDashboard])

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
    const designation = resolveSelectValue(workerForm.designation_choice, workerForm.designation_other)
    const department = resolveSelectValue(workerForm.department_choice, workerForm.department_other)
    const shift = resolveSelectValue(workerForm.shift_choice, workerForm.shift_other)
    const payType = resolveSelectValue(workerForm.pay_type_choice, workerForm.pay_type_other) || 'Daily'
    const code = workerForm.employee_code.trim()
    const errors: WorkerFormErrors = {}
    if (!workerForm.full_name.trim()) errors.full_name = 'Employee name is required'
    if (!designation) errors.designation = 'Designation is required'
    if (!department) errors.department = 'Department is required'
    if (!shift) errors.shift = 'Shift is required'
    if (code) {
      const dup = workers.find(
        (w) =>
          w.id !== workerForm.id &&
          (w.employee_code || '').trim().toLowerCase() === code.toLowerCase(),
      )
      if (dup) errors.employee_code = `Code “${code}” already used by ${dup.full_name}`
    }
    setWorkerFormErrors(errors)
    if (Object.keys(errors).length) {
      setError('Please fix the highlighted fields')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        full_name: workerForm.full_name.trim(),
        employee_code: code || null,
        designation,
        department,
        shift,
        pay_type: payType,
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
      let workerId = workerForm.id
      if (workerForm.id) {
        const { error: uErr } = await supabase.from('workers').update(payload).eq('id', workerForm.id)
        if (uErr) throw uErr
        setMessage('Employee updated')
      } else {
        const { data: inserted, error: iErr } = await supabase
          .from('workers')
          .insert(payload)
          .select('id')
          .single()
        if (iErr) throw iErr
        workerId = (inserted as { id: string } | null)?.id ?? null
        setMessage('Employee added')
      }

      const rateNum = Number(workerForm.salary_rate)
      if (workerId && workerForm.salary_rate.trim() && !Number.isNaN(rateNum) && rateNum > 0) {
        const existing = pickLatestRate(salaryRates, workerId, todayISO())
        const ptLower = payType.toLowerCase()
        const storedPay = ['monthly', 'daily', 'hourly'].includes(ptLower) ? payType : 'Daily'
        const monthly = ptLower === 'monthly' ? rateNum : 0
        const hourly = ptLower === 'hourly' ? rateNum : 0
        const daily =
          ptLower === 'monthly' ? dailyFromMonthly(rateNum) : ptLower === 'hourly' ? 0 : rateNum
        const sameAsExisting =
          existing &&
          (existing.pay_type || '').toLowerCase() === storedPay.toLowerCase() &&
          Number(existing.monthly_rate) === monthly &&
          Number(existing.daily_rate) === daily &&
          Number(existing.hourly_rate) === hourly
        // New employees always get a rate row; edits only insert when no rate yet or values changed
        // (never overwrite history — insert a new effective row instead).
        if (!sameAsExisting) {
          const ratePayload = {
            worker_id: workerId,
            pay_type: storedPay,
            monthly_rate: monthly,
            daily_rate: daily,
            hourly_rate: hourly,
            ot_rate: Number(existing?.ot_rate) || 0,
            effective_from: existing ? todayISO() : workerForm.joining_date || todayISO(),
            status: 'Active',
            approved: true,
            updated_at: new Date().toISOString(),
          }
          const { error: rErr } = await supabase.from('salary_rates').insert(ratePayload)
          if (rErr) throw rErr
          await loadSalaryRates()
        }
      }

      setShowWorkerForm(false)
      setWorkerForm(emptyWorkerForm())
      setWorkerFormErrors({})
      await loadWorkers()
    } catch (e) {
      handleDbError(e)
    } finally {
      setBusy(false)
    }
  }

  function openAddEmployee() {
    setWorkerForm(emptyWorkerForm())
    setWorkerFormErrors({})
    setError(null)
    setShowWorkerForm(true)
  }

  function openEditEmployee(w: Worker) {
    const latest = pickLatestRate(salaryRates, w.id, todayISO())
    setWorkerForm(workerToForm(w, selectOpts, latest))
    setWorkerFormErrors({})
    setError(null)
    setShowWorkerForm(true)
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
    advanceAmount = 0,
  ): Omit<PayrollEntry, 'id' | 'created_at' | 'updated_at'> {
    return buildPayrollEntryFromAttendance(worker, attRows, rate, run, advanceAmount, roles, payrollRates)
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
      const { data: advAll, error: advErr } = await supabase
        .from('salary_advance_transactions')
        .select('worker_id, amount')
        .eq('is_voided', false)
        .gte('advance_date', from)
        .lte('advance_date', to)
      if (advErr) throw advErr
      const advanceByWorker = new Map<string, number>()
      for (const row of advAll ?? []) {
        const wid = String((row as { worker_id: string }).worker_id)
        advanceByWorker.set(
          wid,
          (advanceByWorker.get(wid) || 0) + Number((row as { amount: number }).amount || 0),
        )
      }
      const attByWorker = new Map<string, Attendance[]>()
      for (const a of (attAll as Attendance[]) ?? []) {
        const list = attByWorker.get(a.worker_id) || []
        list.push(a)
        attByWorker.set(a.worker_id, list)
      }

      for (const worker of activeWorkers) {
        const rate = pickLatestRate(salaryRates, worker.id, to) || null
        const payload = buildEntryPayload(
          worker,
          attByWorker.get(worker.id) || [],
          rate,
          run,
          advanceByWorker.get(worker.id) || 0,
        )
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
    <div className="screen hr-screen">
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
          {dashboardBusy ? <p className="text-muted">Loading dashboard…</p> : null}
          {!dashboardBusy && workersReady && !activeWorkers.length ? (
            <p className="text-muted">No active employees found. Add employees in Employee Master.</p>
          ) : null}
          <div className="hr-kpi-grid">
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.totalEmployees}</div>
              <div className="hr-kpi-label">Total Employees</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.presentToday}</div>
              <div className="hr-kpi-label">Attendance Today</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.absentToday}</div>
              <div className="hr-kpi-label">Absent Today</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{kpis.monthPaidDays}</div>
              <div className="hr-kpi-label">Month Paid Days</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{formatINR(kpis.salaryEarnedMtd)}</div>
              <div className="hr-kpi-label">Salary Earned (MTD)</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{formatINR(kpis.advanceMtd)}</div>
              <div className="hr-kpi-label">Advance (MTD)</div>
            </div>
            <div className="hr-kpi surface">
              <div className="hr-kpi-value num">{formatINR(kpis.salaryPaidMtd)}</div>
              <div className="hr-kpi-label">Salary Paid</div>
            </div>
            <div className="hr-kpi surface danger">
              <div className="hr-kpi-value num">{formatINR(kpis.salaryOutstanding)}</div>
              <div className="hr-kpi-label">Salary Outstanding</div>
            </div>
          </div>
          <div className="hr-quick-actions share-actions">
            <button type="button" className="btn-ghost" disabled={dashboardBusy} onClick={() => void refreshDashboard()}>
              Refresh
            </button>
            <button type="button" className="btn-ghost" onClick={() => quickNav('attendance')}>
              Attendance
            </button>
            <button type="button" className="btn-ghost" onClick={() => goNav('salary-status')}>
              Salary Up To Date
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
        <div className="hr-emp-master">
          <div className="hr-toolbar hr-emp-toolbar-row">
            <div className="hr-emp-filters">
              <label className="field hr-emp-search">
                <span>Search name / code</span>
                <input
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder="Type to search…"
                  autoComplete="off"
                />
              </label>
              <label className="field">
                <span>Designation</span>
                <select value={empFilterDesig} onChange={(e) => setEmpFilterDesig(e.target.value)}>
                  <option value="">All</option>
                  {filterDesignationOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Department</span>
                <select value={empFilterDept} onChange={(e) => setEmpFilterDept(e.target.value)}>
                  <option value="">All</option>
                  {filterDepartmentOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Shift</span>
                <select value={empFilterShift} onChange={(e) => setEmpFilterShift(e.target.value)}>
                  <option value="">All</option>
                  {filterShiftOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={empFilterActive}
                  onChange={(e) => setEmpFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <button type="button" className="primary-save" onClick={openAddEmployee}>
              Add Employee
            </button>
          </div>

          {showWorkerForm ? (
            <form className="hr-emp-form" onSubmit={(e) => void saveWorker(e)} noValidate>
              <h2 className="section-title">{workerForm.id ? 'Edit Employee' : 'Add Employee'}</h2>

              <section className="hr-emp-section">
                <h3 className="hr-emp-section-title">A. Basic Information</h3>
                <div className="hr-emp-form-grid">
                  <label className={`field${workerFormErrors.full_name ? ' has-error' : ''}`}>
                    <span>Employee Name *</span>
                    <input
                      value={workerForm.full_name}
                      onChange={(e) => {
                        setWorkerForm((f) => ({ ...f, full_name: e.target.value }))
                        setWorkerFormErrors((err) => ({ ...err, full_name: undefined }))
                      }}
                      autoFocus={!workerForm.id}
                    />
                    {workerFormErrors.full_name ? (
                      <span className="hr-emp-field-error">{workerFormErrors.full_name}</span>
                    ) : null}
                  </label>
                  <label className={`field${workerFormErrors.employee_code ? ' has-error' : ''}`}>
                    <span>Employee Code</span>
                    <input
                      className="num"
                      value={workerForm.employee_code}
                      onChange={(e) => {
                        setWorkerForm((f) => ({ ...f, employee_code: e.target.value }))
                        setWorkerFormErrors((err) => ({ ...err, employee_code: undefined }))
                      }}
                      placeholder="Optional · must be unique"
                    />
                    {workerFormErrors.employee_code ? (
                      <span className="hr-emp-field-error">{workerFormErrors.employee_code}</span>
                    ) : null}
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input
                      value={workerForm.phone}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Joining date</span>
                    <input
                      type="date"
                      value={workerForm.joining_date}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, joining_date: e.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="hr-emp-section">
                <h3 className="hr-emp-section-title">B. Job Information</h3>
                <div className="hr-emp-form-grid">
                  <label className={`field${workerFormErrors.designation ? ' has-error' : ''}`}>
                    <span>Designation *</span>
                    <select
                      value={workerForm.designation_choice}
                      onChange={(e) => {
                        setWorkerForm((f) => ({
                          ...f,
                          designation_choice: e.target.value,
                          designation_other: e.target.value === 'Other' ? f.designation_other : '',
                        }))
                        setWorkerFormErrors((err) => ({ ...err, designation: undefined }))
                      }}
                    >
                      <option value="">Select designation…</option>
                      {designationOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {workerFormErrors.designation ? (
                      <span className="hr-emp-field-error">{workerFormErrors.designation}</span>
                    ) : null}
                  </label>
                  {workerForm.designation_choice === 'Other' ? (
                    <label className={`field${workerFormErrors.designation ? ' has-error' : ''}`}>
                      <span>Enter Designation *</span>
                      <input
                        value={workerForm.designation_other}
                        onChange={(e) => {
                          setWorkerForm((f) => ({ ...f, designation_other: e.target.value }))
                          setWorkerFormErrors((err) => ({ ...err, designation: undefined }))
                        }}
                        placeholder="Custom designation"
                      />
                    </label>
                  ) : null}
                  <label className={`field${workerFormErrors.department ? ' has-error' : ''}`}>
                    <span>Department *</span>
                    <select
                      value={workerForm.department_choice}
                      onChange={(e) => {
                        setWorkerForm((f) => ({
                          ...f,
                          department_choice: e.target.value,
                          department_other: e.target.value === 'Other' ? f.department_other : '',
                        }))
                        setWorkerFormErrors((err) => ({ ...err, department: undefined }))
                      }}
                    >
                      <option value="">Select department…</option>
                      {departmentOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {workerFormErrors.department ? (
                      <span className="hr-emp-field-error">{workerFormErrors.department}</span>
                    ) : null}
                  </label>
                  {workerForm.department_choice === 'Other' ? (
                    <label className={`field${workerFormErrors.department ? ' has-error' : ''}`}>
                      <span>Enter Department *</span>
                      <input
                        value={workerForm.department_other}
                        onChange={(e) => {
                          setWorkerForm((f) => ({ ...f, department_other: e.target.value }))
                          setWorkerFormErrors((err) => ({ ...err, department: undefined }))
                        }}
                        placeholder="Custom department"
                      />
                    </label>
                  ) : null}
                  <label className={`field${workerFormErrors.shift ? ' has-error' : ''}`}>
                    <span>Shift *</span>
                    <select
                      value={workerForm.shift_choice}
                      onChange={(e) => {
                        setWorkerForm((f) => ({
                          ...f,
                          shift_choice: e.target.value,
                          shift_other: e.target.value === 'Other' ? f.shift_other : '',
                        }))
                        setWorkerFormErrors((err) => ({ ...err, shift: undefined }))
                      }}
                    >
                      <option value="">Select shift…</option>
                      {shiftOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    {workerFormErrors.shift ? (
                      <span className="hr-emp-field-error">{workerFormErrors.shift}</span>
                    ) : null}
                  </label>
                  {workerForm.shift_choice === 'Other' ? (
                    <label className={`field${workerFormErrors.shift ? ' has-error' : ''}`}>
                      <span>Enter Shift *</span>
                      <input
                        value={workerForm.shift_other}
                        onChange={(e) => {
                          setWorkerForm((f) => ({ ...f, shift_other: e.target.value }))
                          setWorkerFormErrors((err) => ({ ...err, shift: undefined }))
                        }}
                        placeholder="Custom shift"
                      />
                    </label>
                  ) : null}
                </div>
              </section>

              <section className="hr-emp-section">
                <h3 className="hr-emp-section-title">C. Salary &amp; Pay</h3>
                <div className="hr-emp-form-grid">
                  <label className="field">
                    <span>Pay Type</span>
                    <select
                      value={workerForm.pay_type_choice}
                      onChange={(e) =>
                        setWorkerForm((f) => ({
                          ...f,
                          pay_type_choice: e.target.value,
                          pay_type_other: e.target.value === 'Other' ? f.pay_type_other : '',
                        }))
                      }
                    >
                      {payTypeOptions.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  {workerForm.pay_type_choice === 'Other' ? (
                    <label className="field">
                      <span>Enter Pay Type</span>
                      <input
                        value={workerForm.pay_type_other}
                        onChange={(e) => setWorkerForm((f) => ({ ...f, pay_type_other: e.target.value }))}
                        placeholder="Custom pay type"
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>
                      {rateLabelForPayType(
                        workerForm.pay_type_choice === 'Other'
                          ? workerForm.pay_type_other || 'Other'
                          : workerForm.pay_type_choice,
                      )}
                    </span>
                    <input
                      className="num"
                      inputMode="decimal"
                      value={workerForm.salary_rate}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, salary_rate: e.target.value }))}
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </section>

              <section className="hr-emp-section">
                <h3 className="hr-emp-section-title">D. Statutory</h3>
                <div className="hr-emp-checks">
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
                </div>
              </section>

              <section className="hr-emp-section">
                <h3 className="hr-emp-section-title">E. Bank Details</h3>
                <div className="hr-emp-form-grid">
                  <label className="field">
                    <span>Bank name</span>
                    <input
                      value={workerForm.bank_name}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, bank_name: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Account no</span>
                    <input
                      className="num"
                      value={workerForm.bank_account_no}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, bank_account_no: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>IFSC</span>
                    <input
                      value={workerForm.bank_ifsc}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, bank_ifsc: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>Branch</span>
                    <input
                      value={workerForm.bank_branch}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, bank_branch: e.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="hr-emp-section">
                <h3 className="hr-emp-section-title">F. Status</h3>
                <div className="hr-emp-checks">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={workerForm.is_active}
                      onChange={(e) => setWorkerForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    <span>Active</span>
                  </label>
                </div>
              </section>

              <div className="hr-emp-form-actions share-actions">
                <button type="submit" className="primary-save" disabled={busy}>
                  Save
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setShowWorkerForm(false)
                    setWorkerFormErrors({})
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <div className="hr-emp-count">
            Showing {filteredEmployees.length} of {workers.length} employees
          </div>

          <div className="hr-emp-table-wrap hr-force-table">
            <table className="hr-emp-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Department</th>
                  <th>Shift</th>
                  <th className="hr-emp-secondary">Pay Type</th>
                  <th className="hr-emp-secondary">Bank</th>
                  <th className="hr-emp-secondary">ESI</th>
                  <th className="hr-emp-secondary">PF</th>
                  <th className="hr-emp-secondary">PT</th>
                  <th>Active</th>
                  <th className="hr-emp-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((w) => (
                  <tr key={w.id}>
                    <td className="num">{w.employee_code || '—'}</td>
                    <td className="hr-emp-name">{w.full_name}</td>
                    <td className="hr-emp-desig">{w.designation || '—'}</td>
                    <td className="hr-emp-dept">{w.department || '—'}</td>
                    <td className="hr-emp-shift">{w.shift || '—'}</td>
                    <td className="hr-emp-secondary">{w.pay_type || '—'}</td>
                    <td className="hr-emp-secondary num">{maskAccountNumber(w.bank_account_no)}</td>
                    <td className="hr-emp-secondary">{w.esi_applicable ? 'Y' : '—'}</td>
                    <td className="hr-emp-secondary">{w.pf_applicable ? 'Y' : '—'}</td>
                    <td className="hr-emp-secondary">{w.pt_applicable ? 'Y' : '—'}</td>
                    <td>
                      <span className={w.is_active ? 'hr-badge hr-badge-ok' : 'hr-badge hr-badge-danger'}>
                        {w.is_active ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="hr-emp-actions">
                      <div className="share-actions">
                        <button type="button" className="btn-ghost" onClick={() => openEditEmployee(w)}>
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
                {!filteredEmployees.length ? (
                  <tr>
                    <td colSpan={12} className="text-muted">
                      No employees match the current filters.
                    </td>
                  </tr>
                ) : null}
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
            <div className="hr-table-wrap hr-force-table">
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
        <div className="hr-rates-master form-stack">
          <p className="text-muted2">Monthly ÷ 26 auto-fills daily rate. Active rate changes create history rows.</p>
          <p className="hr-emp-count">{activeWorkers.length} active employees · scroll horizontally for all columns</p>
          <div className="hr-rates-table-wrap hr-force-table">
            <table className="hr-rates-table">
              <thead>
                <tr>
                  <th className="hr-rates-sticky hr-rates-sticky-code">S.No</th>
                  <th className="hr-rates-sticky hr-rates-sticky-code">Code</th>
                  <th className="hr-rates-sticky hr-rates-sticky-name">Name</th>
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
                      <td className="num hr-rates-sticky hr-rates-sticky-code">{idx + 1}</td>
                      <td className="num hr-rates-sticky hr-rates-sticky-code">{w.employee_code || '—'}</td>
                      <td className="hr-rates-sticky hr-rates-sticky-name">{w.full_name}</td>
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
                        <button type="button" className="btn-ghost hr-rates-save" disabled={busy} onClick={() => void saveRate(w)}>
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

      {sub === 'advance' ? (
        <div className="form-stack surface hr-panel">
          <h2 className="section-title">Advance Salary Entry</h2>
          <p className="text-muted">
            Record multiple cash / cheque / bank advances per employee. Totals auto-deduct in payroll for the selected month.
          </p>
          <div className="hr-toolbar form-stack">
            <label className="field">
              <span className="text-muted">Employee</span>
              <select value={advanceWorkerId} onChange={(e) => setAdvanceWorkerId(e.target.value)}>
                <option value="">Select employee…</option>
                {activeWorkers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.employee_code ? `${w.employee_code} · ` : ''}{w.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={advanceDate} onChange={(e) => setAdvanceDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Amount (₹)</span>
              <input
                className="num"
                type="number"
                min="1"
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="text-muted">Payment mode</span>
              <select
                value={advanceMode}
                onChange={(e) => setAdvanceMode(e.target.value as 'Cash' | 'Cheque' | 'Bank Transfer' | 'Other')}
              >
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Other">Other</option>
              </select>
            </label>
            {advanceMode === 'Cheque' ? (
              <label className="field">
                <span className="text-muted">Cheque no.</span>
                <input value={advanceRef} onChange={(e) => setAdvanceRef(e.target.value)} />
              </label>
            ) : null}
            {advanceMode === 'Bank Transfer' ? (
              <>
                <label className="field">
                  <span className="text-muted">Transfer reference</span>
                  <input value={advanceRef} onChange={(e) => setAdvanceRef(e.target.value)} />
                </label>
                <label className="field">
                  <span className="text-muted">Bank</span>
                  <input value={advanceBank} onChange={(e) => setAdvanceBank(e.target.value)} />
                </label>
              </>
            ) : null}
            <label className="field">
              <span className="text-muted">Remarks</span>
              <input value={advanceRemarks} onChange={(e) => setAdvanceRemarks(e.target.value)} />
            </label>
            <button
              type="button"
              className="primary-save"
              disabled={busy}
              onClick={() => void (async () => {
                if (!advanceWorkerId || !advanceAmount) {
                  setError('Select employee and amount')
                  return
                }
                setBusy(true)
                setError(null)
                try {
                  await createSalaryAdvance(
                    {
                      worker_id: advanceWorkerId,
                      advance_date: advanceDate,
                      amount: Number(advanceAmount),
                      payment_mode: advanceMode,
                      reference_no: advanceRef || undefined,
                      bank_name: advanceBank || undefined,
                      remarks: advanceRemarks || undefined,
                    },
                    { id: profile?.id, name: profile?.full_name || profile?.roles?.role_name },
                  )
                  setMessage('Advance recorded')
                  setAdvanceAmount('')
                  setAdvanceRef('')
                  setAdvanceBank('')
                  setAdvanceRemarks('')
                  await loadAdvances()
                } catch (e) {
                  handleDbError(e)
                } finally {
                  setBusy(false)
                }
              })()}
            >
              Save Advance
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Reference</th>
                  <th>Remarks</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a) => (
                  <tr key={a.id}>
                    <td>{a.advance_date}</td>
                    <td>
                      {a.workers?.employee_code ? `${a.workers.employee_code} · ` : ''}
                      {a.workers?.full_name || a.worker_id}
                    </td>
                    <td className="num">{formatINRExact(a.amount)}</td>
                    <td>{a.payment_mode}</td>
                    <td>{a.reference_no || a.bank_name || '—'}</td>
                    <td>{a.remarks || '—'}</td>
                    <td>{a.created_by_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {advances.length ? (
            <p className="text-muted">
              Outstanding advance total (all active entries):{' '}
              <strong className="num">{formatINRExact(advances.reduce((s, a) => s + Number(a.amount), 0))}</strong>
            </p>
          ) : null}
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

          <div className="hr-table-wrap hr-force-table">
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
          <div className="hr-table-wrap hr-force-table">
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
          <div className="hr-table-wrap hr-force-table">
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
              <div className="hr-table-wrap hr-force-table">
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

      {sub === 'salary-status' ? (
        <SalaryUpToDatePanel
          workers={workers}
          salaryRates={salaryRates}
          roles={roles}
          payrollRates={payrollRates}
          onOpenWorker={(id) => {
            setHistoryWorkerId(id)
            goNav('reports')
          }}
        />
      ) : null}

      {sub === 'reports' ? (
        <HrPayrollReportsPanel
          workers={workers}
          salaryRates={salaryRates}
          roles={roles}
          payrollRates={payrollRates}
          initialWorkerId={historyWorkerId}
          onOpenWorkerHistory={(id) => setHistoryWorkerId(id)}
        />
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

      {error ? (
        <p className="form-error text-danger">
          {error}
          {sub === 'dashboard' ? (
            <>
              {' '}
              <button type="button" className="btn-ghost" onClick={() => void refreshDashboard()}>
                Retry
              </button>
            </>
          ) : null}
        </p>
      ) : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
