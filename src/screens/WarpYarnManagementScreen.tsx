/**
 * Warp Yarn Management — single parent module consolidating pipe / beam / warper flows.
 * Reuses beam_loading for machine consumption; does not duplicate weft yarn stock.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { SubTabs } from '../components/SubTabs'
import { WarpBeamStockEntry } from '../components/warp/WarpBeamStockEntry'
import { useAuth } from '../lib/auth'
import { createWarperGatePass, loadGatePasses, printGatePass, type WarpGatePass } from '../lib/warpBeamStock'
import { MACHINES } from '../lib/database.types'
import type { NavTarget } from '../lib/nav'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_MULTIPLIER,
  calcTotalMeter,
  computeKpis,
  emptyWarpFilters,
  filterPipes,
  filterTxns,
  filterWarperJobs,
  formatNum,
  insertTxn,
  loadWarpBundle,
  meterFields,
  nextPipeNo,
  statusBadgeClass,
  statusLabel,
  todayISO,
  type WarpPipe,
  type WarpWarperJob,
  type WarpYarnFilters,
  type WarpYarnPurchase,
  type WarpYarnTransaction,
} from '../lib/warpYarn'

type TabId = 'overview' | 'machines' | 'godown' | 'empty' | 'warper' | 'reports'
type ActionId =
  | null
  | 'purchase'
  | 'send'
  | 'receive'
  | 'issue'
  | 'return'
  | 'empty'
  | 'history'
  | 'legacy'

type Props = {
  initialTab?: TabId
  onNavigate?: (t: NavTarget) => void
  onTabChange?: (tab: TabId) => void
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'machines', label: 'On Machines' },
  { id: 'godown', label: 'Godown – Filled' },
  { id: 'empty', label: 'Empty Pipes' },
  { id: 'warper', label: 'At Warper / Job Work' },
  { id: 'reports', label: 'Transactions & Reports' },
]

const REPORT_KINDS = [
  { id: 'current', label: 'Current Stock Report' },
  { id: 'machine', label: 'Machine-wise Report' },
  { id: 'godown', label: 'Godown Stock Report' },
  { id: 'empty', label: 'Empty Pipe Report' },
  { id: 'warper-pending', label: 'Warper Pending Report' },
  { id: 'warper-received', label: 'Warper Received Report' },
  { id: 'meter', label: 'Meter Consumption Report' },
  { id: 'kg-diff', label: 'KG Difference Report' },
  { id: 'history', label: 'Pipe Movement History' },
  { id: 'monthly', label: 'Monthly Warp Yarn Report' },
] as const

type ReportKind = (typeof REPORT_KINDS)[number]['id']

export function WarpYarnManagementScreen({
  initialTab = 'overview',
  onNavigate,
  onTabChange,
}: Props) {
  const { profile } = useAuth()
  const userName = profile?.full_name || profile?.roles?.role_name || 'User'

  const [tab, setTab] = useState<TabId>(initialTab)
  const [pipes, setPipes] = useState<WarpPipe[]>([])
  const [txns, setTxns] = useState<WarpYarnTransaction[]>([])
  const [jobs, setJobs] = useState<WarpWarperJob[]>([])
  const [purchases, setPurchases] = useState<WarpYarnPurchase[]>([])
  const [filters, setFilters] = useState<WarpYarnFilters>(emptyWarpFilters())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [action, setAction] = useState<ActionId>(null)
  const [historyPipe, setHistoryPipe] = useState<WarpPipe | null>(null)
  const [reportKind, setReportKind] = useState<ReportKind>('current')
  const [tablesReady, setTablesReady] = useState(true)
  const [gatePasses, setGatePasses] = useState<WarpGatePass[]>([])

  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

  function selectTab(next: TabId) {
    setTab(next)
    onTabChange?.(next)
  }

  const reload = useCallback(async () => {
    try {
      const data = await loadWarpBundle(supabase)
      setPipes(data.pipes)
      setTxns(data.txns)
      setJobs(data.jobs)
      setPurchases(data.purchases)
      const gps = await loadGatePasses(supabase).catch(() => [] as WarpGatePass[])
      setGatePasses(gps)
      setTablesReady(true)
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Load failed'
      if (/relation .* does not exist|Could not find the table/i.test(msg)) {
        setTablesReady(false)
        setError(
          'Warp Yarn database tables are missing. Run these in Supabase SQL Editor: public/migration-warp-yarn-management.sql then public/migration-warp-beam-stock-entry.sql',
        )
      } else {
        setError(msg)
      }
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const kpis = useMemo(() => computeKpis(pipes), [pipes])
  const qualities = useMemo(() => {
    const set = new Set<string>()
    pipes.forEach((p) => {
      if (p.yarn_quality) set.add(p.yarn_quality)
    })
    return Array.from(set).sort()
  }, [pipes])

  const pipeNoOptions = useMemo(() => {
    const set = new Set<string>()
    pipes.forEach((p) => {
      if (p.pipe_no) set.add(p.pipe_no)
    })
    return Array.from(set).sort()
  }, [pipes])

  const todayConsumption = useMemo(() => {
    const today = todayISO()
    return txns
      .filter((t) => t.txn_type === 'Machine Consumption' && t.txn_date === today)
      .reduce((s, t) => s + Number(t.meter || 0), 0)
  }, [txns])

  const onMachine = useMemo(
    () => filterPipes(pipes.filter((p) => p.status === 'ON_MACHINE'), filters),
    [pipes, filters],
  )
  const godownFilled = useMemo(
    () => filterPipes(pipes.filter((p) => p.status === 'FILLED_GODOWN'), filters),
    [pipes, filters],
  )
  const emptyPipes = useMemo(
    () =>
      filterPipes(
        pipes.filter((p) => ['EMPTY', 'DAMAGED', 'UNDER_REPAIR', 'ISSUED'].includes(p.status)),
        filters,
      ),
    [pipes, filters],
  )
  const warperJobs = useMemo(() => filterWarperJobs(jobs, filters), [jobs, filters])
  const filteredTxns = useMemo(() => filterTxns(txns, filters), [txns, filters])

  const machineRows = useMemo(() => {
    const allMachines = [...MACHINES, 'OTR'] as const
    return allMachines.map((m) => {
      const pipe = onMachine.find((p) => p.machine_no === m) || null
      return { machine: m, pipe }
    })
  }, [onMachine])

  const historyRows = useMemo(() => {
    if (!historyPipe) return []
    return txns.filter((t) => t.pipe_no === historyPipe.pipe_no || t.pipe_id === historyPipe.id)
  }, [historyPipe, txns])

  function openHistory(pipe: WarpPipe) {
    setHistoryPipe(pipe)
    setAction('history')
  }

  function clearFilters() {
    setFilters(emptyWarpFilters())
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await fn()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  /* ---------- Actions ---------- */

  async function savePurchase(form: PurchaseForm) {
    await withBusy(async () => {
      const qty = Number(form.quantity_kg) || 0
      const rate = Number(form.rate) || 0
      const amount = qty * rate
      const gst = Number(form.gst_pct) || 0
      const total = amount * (1 + gst / 100)
      const payload = {
        purchase_date: form.purchase_date || todayISO(),
        supplier: form.supplier.trim(),
        invoice_no: form.invoice_no.trim() || null,
        yarn_quality: form.yarn_quality.trim(),
        yarn_specification: form.yarn_specification.trim() || null,
        quantity_kg: qty,
        rate,
        amount,
        gst_pct: gst,
        total_amount: total,
        destination: form.destination.trim() || null,
        remarks: form.remarks.trim() || null,
        entered_by: userName,
      }
      if (!payload.supplier || !payload.yarn_quality) throw new Error('Supplier and yarn quality required')
      const { error: pErr } = await supabase.from('warp_yarn_purchases').insert(payload)
      if (pErr) throw pErr

      // Also record in existing yarn_inward (warp) so OCR/legacy list stays consistent
      await supabase.from('yarn_inward').insert({
        yarn_type: 'warp',
        supplier_name: payload.supplier,
        item: payload.yarn_quality,
        qty,
        amount: total,
        entry_date: payload.purchase_date,
        entered_by: userName,
      })

      await insertTxn(supabase, {
        txn_date: payload.purchase_date,
        pipe_id: null,
        pipe_no: '—',
        txn_type: 'Purchase Yarn',
        from_location: payload.supplier,
        to_location: payload.destination || 'Godown / Warper',
        quality: payload.yarn_quality,
        kg: qty,
        meter: 0,
        multiplier: DEFAULT_MULTIPLIER,
        total_meter: 0,
        balance_meter: null,
        machine_no: null,
        warper_name: payload.destination,
        user_name: userName,
        reference: payload.invoice_no,
        status: 'Received',
        remarks: payload.remarks,
      })
      setMessage('Warp yarn purchase saved')
      setAction(null)
    })
  }

  async function saveEmptyPipe(form: EmptyForm) {
    await withBusy(async () => {
      const pipeNo = (form.pipe_no.trim() || (await nextPipeNo(supabase))).toUpperCase()
      const serial = (form.serial_no.trim() || pipeNo).toUpperCase()
      const { data: dup } = await supabase.from('warp_pipes').select('id').eq('pipe_no', pipeNo).maybeSingle()
      if (dup) throw new Error(`Pipe number ${pipeNo} already exists`)
      const payload = {
        pipe_no: pipeNo,
        serial_no: serial,
        location: form.location.trim() || 'Godown',
        status: form.status || 'EMPTY',
        remarks: form.remarks.trim() || null,
        ...meterFields(0, DEFAULT_MULTIPLIER, 0),
        weight_kg: 0,
      }
      const { data, error: iErr } = await supabase.from('warp_pipes').insert(payload).select('*').single()
      if (iErr) throw iErr
      const pipe = data as WarpPipe
      await insertTxn(supabase, {
        txn_date: todayISO(),
        pipe_id: pipe.id,
        pipe_no: pipe.pipe_no,
        txn_type: 'Empty Pipe',
        from_location: null,
        to_location: pipe.location,
        quality: null,
        kg: 0,
        meter: 0,
        multiplier: DEFAULT_MULTIPLIER,
        total_meter: 0,
        balance_meter: 0,
        machine_no: null,
        warper_name: null,
        user_name: userName,
        reference: null,
        status: pipe.status,
        remarks: pipe.remarks,
      })
      setMessage(`Empty pipe ${pipeNo} added`)
      setAction(null)
    })
  }

  async function saveSendWarper(form: SendForm) {
    await withBusy(async () => {
      const pipe = pipes.find((p) => p.id === form.pipe_id || p.pipe_no === form.pipe_no.trim().toUpperCase())
      if (!pipe) throw new Error('Select a valid pipe')
      if (!['EMPTY', 'FILLED_GODOWN', 'ISSUED'].includes(pipe.status)) {
        throw new Error('Pipe must be empty or in godown to send to warper')
      }
      const meter = Number(form.expected_meter) || 0
      const multiplier = Number(form.multiplier) || DEFAULT_MULTIPLIER
      const expectedTotal = calcTotalMeter(meter, multiplier)
      const kg = Number(form.yarn_sent_kg) || 0
      const warper = form.warper_name.trim()
      if (!warper) throw new Error('Warper name required')

      const job = {
        pipe_id: pipe.id,
        pipe_no: pipe.pipe_no,
        warper_name: warper,
        yarn_quality: form.yarn_quality.trim() || pipe.yarn_quality,
        sent_date: form.sent_date || todayISO(),
        yarn_sent_kg: kg,
        expected_meter: meter,
        multiplier,
        expected_total_meter: expectedTotal,
        challan_no: form.challan_no.trim() || null,
        remarks: form.remarks.trim() || null,
        status: 'SENT',
        entered_by: userName,
      }
      const { data: jobRow, error: jErr } = await supabase.from('warp_warper_jobs').insert(job).select('id').single()
      if (jErr) throw jErr

      const { error: uErr } = await supabase
        .from('warp_pipes')
        .update({
          status: 'AT_WARPER',
          location: `Warper · ${warper}`,
          warper_name: warper,
          yarn_quality: job.yarn_quality,
          ...meterFields(meter, multiplier, 0),
          weight_kg: kg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pipe.id)
      if (uErr) throw uErr

      // Legacy warp_beam_pipe OUT for continuity
      await supabase.from('warp_beam_pipe').insert({
        entry_date: job.sent_date,
        jobber_name: warper,
        gp_number: job.challan_no,
        beam_number: pipe.pipe_no,
        yarn_count_denier: job.yarn_quality,
        weight_kg: kg,
        pipe_out_qty: 1,
        pipe_in_qty: 0,
        remarks: form.remarks.trim() || null,
        status: 'out',
        entered_by: userName,
      })

      await insertTxn(supabase, {
        txn_date: job.sent_date,
        pipe_id: pipe.id,
        pipe_no: pipe.pipe_no,
        txn_type: 'Send to Warper',
        from_location: pipe.location,
        to_location: `Warper · ${warper}`,
        quality: job.yarn_quality,
        kg,
        meter,
        multiplier,
        total_meter: expectedTotal,
        balance_meter: expectedTotal,
        machine_no: null,
        warper_name: warper,
        user_name: userName,
        reference: job.challan_no,
        status: 'SENT',
        remarks: job.remarks,
      })

      const gp = await createWarperGatePass(supabase, {
        party_name: warper,
        pipe_no: pipe.pipe_no,
        item_yarn: job.yarn_quality,
        single_meter: meter,
        double_meter: expectedTotal,
        pass_date: job.sent_date,
        expected_return_date: form.expected_return_date || null,
        vehicle_no: form.vehicle_no?.trim() || null,
        driver_name: form.driver_name?.trim() || null,
        remarks: form.remarks.trim() || null,
        issued_by: userName,
        warper_job_id: jobRow?.id || null,
        ref_id: jobRow?.id || null,
      })

      setMessage(`Pipe ${pipe.pipe_no} sent to ${warper} · Gate Pass ${gp.gate_pass_no}`)
      setAction(null)
    })
  }

  async function saveReceiveWarper(form: ReceiveForm) {
    await withBusy(async () => {
      const job = jobs.find((j) => j.id === form.job_id)
      if (!job) throw new Error('Select a pending warper job')
      const pipe = pipes.find((p) => p.id === job.pipe_id || p.pipe_no === job.pipe_no)
      const recvMeter = Number(form.received_meter) || 0
      const recvKg = Number(form.received_kg) || 0
      const multiplier = Number(form.multiplier) || job.multiplier || DEFAULT_MULTIPLIER
      const totalMeter = calcTotalMeter(recvMeter, multiplier)
      const kgDiff = Math.round((Number(job.yarn_sent_kg) - recvKg) * 1000) / 1000
      const meterDiff = Math.round((Number(job.expected_meter) - recvMeter) * 1000) / 1000
      const status = kgDiff !== 0 || meterDiff !== 0 ? 'DIFFERENCE' : 'RECEIVED'

      const { error: jErr } = await supabase
        .from('warp_warper_jobs')
        .update({
          received_date: form.received_date || todayISO(),
          received_meter: recvMeter,
          received_kg: recvKg,
          multiplier,
          meter_difference: meterDiff,
          kg_difference: kgDiff,
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      if (jErr) throw jErr

      if (pipe) {
        const { error: uErr } = await supabase
          .from('warp_pipes')
          .update({
            status: 'FILLED_GODOWN',
            location: 'Godown',
            yarn_quality: job.yarn_quality,
            warper_name: job.warper_name,
            ...meterFields(recvMeter, multiplier, 0),
            weight_kg: recvKg,
            updated_at: new Date().toISOString(),
            last_used_at: new Date().toISOString(),
          })
          .eq('id', pipe.id)
        if (uErr) throw uErr
      }

      // Close matching legacy OUT row if present
      const { data: legacy } = await supabase
        .from('warp_beam_pipe')
        .select('id')
        .eq('status', 'out')
        .eq('beam_number', job.pipe_no)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (legacy?.id) {
        await supabase
          .from('warp_beam_pipe')
          .update({ pipe_in_qty: 1, status: 'returned' })
          .eq('id', legacy.id)
      }

      await insertTxn(supabase, {
        txn_date: form.received_date || todayISO(),
        pipe_id: pipe?.id || null,
        pipe_no: job.pipe_no,
        txn_type: 'Receive from Warper',
        from_location: `Warper · ${job.warper_name}`,
        to_location: 'Godown',
        quality: job.yarn_quality,
        kg: recvKg,
        meter: recvMeter,
        multiplier,
        total_meter: totalMeter,
        balance_meter: totalMeter,
        machine_no: null,
        warper_name: job.warper_name,
        user_name: userName,
        reference: job.challan_no,
        status,
        remarks: `KG diff ${kgDiff} · Meter diff ${meterDiff}`,
      })

      try {
        await supabase.from('warp_gate_passes').update({ status: 'Returned' }).eq('warper_job_id', job.id)
      } catch {
        /* gate pass table may not exist yet */
      }

      setMessage(`Received ${job.pipe_no} · ${status}`)
      setAction(null)
    })
  }

  async function saveIssueMachine(form: IssueForm) {
    await withBusy(async () => {
      const pipe = pipes.find((p) => p.id === form.pipe_id)
      if (!pipe) throw new Error('Select a filled pipe')
      if (pipe.status !== 'FILLED_GODOWN') throw new Error('Only godown-filled pipes can be issued')
      const machine = form.machine_no
      if (!machine) throw new Error('Machine required')
      const existing = pipes.find((p) => p.status === 'ON_MACHINE' && p.machine_no === machine)
      if (existing) throw new Error(`${machine} already has pipe ${existing.pipe_no}`)

      const meter = Number(form.starting_meter) || Number(pipe.meter) || 0
      const multiplier = Number(form.multiplier) || Number(pipe.multiplier) || DEFAULT_MULTIPLIER
      const fields = meterFields(meter, multiplier, 0)
      const kg = Number(form.starting_kg) || Number(pipe.weight_kg) || 0

      // Reuse beam_loading: beam_count = multiplier, meter_per_beam = meter
      const loadingPayload = {
        machine_no: machine,
        item_name: form.quality.trim() || pipe.yarn_quality || pipe.pipe_no,
        quality: form.quality.trim() || pipe.yarn_quality,
        pipe_no: pipe.pipe_no,
        beam_count: Math.max(1, Math.round(multiplier)),
        meter_per_beam: meter,
        remaining_meter: fields.total_meter,
        loaded_date: form.issue_date || todayISO(),
        status: 'RUNNING',
      }
      const { data: loading, error: lErr } = await supabase
        .from('beam_loading')
        .insert(loadingPayload)
        .select('id')
        .single()
      if (lErr) throw lErr

      const { error: uErr } = await supabase
        .from('warp_pipes')
        .update({
          status: 'ON_MACHINE',
          location: `Machine ${machine}`,
          machine_no: machine,
          yarn_quality: loadingPayload.quality,
          ...fields,
          weight_kg: kg,
          beam_loading_id: loading.id,
          updated_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        })
        .eq('id', pipe.id)
      if (uErr) throw uErr

      await insertTxn(supabase, {
        txn_date: form.issue_date || todayISO(),
        pipe_id: pipe.id,
        pipe_no: pipe.pipe_no,
        txn_type: 'Issue to Machine',
        from_location: 'Godown',
        to_location: `Machine ${machine}`,
        quality: loadingPayload.quality,
        kg,
        meter,
        multiplier,
        total_meter: fields.total_meter,
        balance_meter: fields.balance_meter,
        machine_no: machine,
        warper_name: null,
        user_name: form.operator.trim() || userName,
        reference: null,
        status: 'ON_MACHINE',
        remarks: null,
      })
      setMessage(`Issued ${pipe.pipe_no} to ${machine}`)
      setAction(null)
    })
  }

  async function saveReturnMachine(form: ReturnForm) {
    await withBusy(async () => {
      const pipe = pipes.find((p) => p.id === form.pipe_id)
      if (!pipe || pipe.status !== 'ON_MACHINE') throw new Error('Select an on-machine pipe')
      const remainMeter = Number(form.remaining_meter)
      const remainKg = Number(form.remaining_kg)
      const toEmpty = !(remainMeter > 0)
      const nextStatus = toEmpty ? 'EMPTY' : 'FILLED_GODOWN'
      const mult = Number(pipe.multiplier) || DEFAULT_MULTIPLIER
      const baseMeter = toEmpty ? 0 : remainMeter / mult
      const fields = meterFields(baseMeter, mult, toEmpty ? 0 : Number(pipe.used_meter) || 0)
      if (!toEmpty) {
        fields.total_meter = calcTotalMeter(baseMeter, mult)
        fields.used_meter = 0
        fields.balance_meter = fields.total_meter
      }

      if (pipe.beam_loading_id) {
        await supabase
          .from('beam_loading')
          .update({ status: 'STOP', remaining_meter: Math.max(0, remainMeter || 0) })
          .eq('id', pipe.beam_loading_id)
      }

      const { error: uErr } = await supabase
        .from('warp_pipes')
        .update({
          status: nextStatus,
          location: 'Godown',
          machine_no: null,
          beam_loading_id: null,
          ...fields,
          weight_kg: Math.max(0, remainKg || 0),
          updated_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
          remarks: form.reason.trim() || pipe.remarks,
        })
        .eq('id', pipe.id)
      if (uErr) throw uErr

      await insertTxn(supabase, {
        txn_date: form.return_date || todayISO(),
        pipe_id: pipe.id,
        pipe_no: pipe.pipe_no,
        txn_type: 'Return from Machine',
        from_location: `Machine ${pipe.machine_no}`,
        to_location: toEmpty ? 'Empty Pipes' : 'Godown',
        quality: pipe.yarn_quality,
        kg: Math.max(0, remainKg || 0),
        meter: baseMeter,
        multiplier: mult,
        total_meter: fields.total_meter,
        balance_meter: fields.balance_meter,
        machine_no: pipe.machine_no,
        warper_name: null,
        user_name: userName,
        reference: null,
        status: nextStatus,
        remarks: form.reason.trim() || null,
      })
      setMessage(`Returned ${pipe.pipe_no} → ${statusLabel(nextStatus)}`)
      setAction(null)
    })
  }

  /* ---------- Render helpers ---------- */

  function FilterBar({ showMachine = true, showWarper = true }: { showMachine?: boolean; showWarper?: boolean }) {
    return (
      <div className="wym-filters surface">
        <label className="field">
          <span className="text-muted">Search</span>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Pipe, quality, warper…"
          />
        </label>
        <label className="field">
          <span className="text-muted">From</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="text-muted">To</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="text-muted">Quality</span>
          <select
            value={filters.quality}
            onChange={(e) => setFilters((f) => ({ ...f, quality: e.target.value }))}
          >
            <option value="">All</option>
            {qualities.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Pipe No.</span>
          <input
            value={filters.pipeNo}
            onChange={(e) => setFilters((f) => ({ ...f, pipeNo: e.target.value }))}
            placeholder="BP-…"
          />
        </label>
        {showMachine ? (
          <label className="field">
            <span className="text-muted">Machine</span>
            <select
              value={filters.machine}
              onChange={(e) => setFilters((f) => ({ ...f, machine: e.target.value }))}
            >
              <option value="">All</option>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {showWarper ? (
          <label className="field">
            <span className="text-muted">Warper</span>
            <input
              value={filters.warper}
              onChange={(e) => setFilters((f) => ({ ...f, warper: e.target.value }))}
            />
          </label>
        ) : null}
        <label className="field">
          <span className="text-muted">Status</span>
          <input
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
            placeholder="Status"
          />
        </label>
        <button type="button" className="btn-ghost wym-clear" onClick={clearFilters}>
          Clear Filters
        </button>
      </div>
    )
  }

  function PipeLink({ pipe }: { pipe: WarpPipe }) {
    return (
      <button type="button" className="wym-pipe-link" onClick={() => openHistory(pipe)}>
        {pipe.pipe_no}
      </button>
    )
  }

  return (
    <div className="screen wym-screen">
      <header className="screen-header wym-header">
        <div>
          <p className="yarn-crumb">
            Inventory · <strong>Warp Yarn Management</strong>
          </p>
          <h1>Warp Yarn Management</h1>
          <p className="text-muted wym-sub">
            One module for pipes, beams, warper job-work and machine warp stock
          </p>
        </div>
      </header>

      <div className="wym-quick surface">
        <span className="wym-quick-label">Quick Actions</span>
        <div className="wym-quick-row">
          <button type="button" className="btn-warp" disabled={!tablesReady || busy} onClick={() => setAction('purchase')}>
            + Purchase Warp Yarn
          </button>
          <button type="button" className="btn-warp" disabled={!tablesReady || busy} onClick={() => setAction('send')}>
            + Send to Warper
          </button>
          <button type="button" className="btn-warp" disabled={!tablesReady || busy} onClick={() => setAction('receive')}>
            + Receive from Warper
          </button>
          <button type="button" className="btn-warp" disabled={!tablesReady || busy} onClick={() => setAction('issue')}>
            + Issue to Machine
          </button>
          <button type="button" className="btn-warp" disabled={!tablesReady || busy} onClick={() => setAction('return')}>
            + Return from Machine
          </button>
          <button type="button" className="btn-ghost" disabled={!tablesReady || busy} onClick={() => setAction('empty')}>
            + Add Empty Pipe
          </button>
        </div>
        <div className="wym-legacy-links">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onNavigate?.({ screen: 'yarn-inward', module: 'warp-yarn' })}
          >
            Yarn Inward OCR
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onNavigate?.({ screen: 'warp-beam-pipe', module: 'warp-yarn' })}
          >
            Legacy Pipe Out / In
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onNavigate?.({ screen: 'beam-remaining', module: 'reports' })}
          >
            Beam Remaining Report
          </button>
        </div>
      </div>

      <SubTabs options={TABS} value={tab} onChange={(id) => selectTab(id as TabId)} />

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      {tab === 'overview' ? (
        <section className="wym-overview">
          <div className="wym-kpi-grid">
            <KpiCard label="On Machines" value={String(kpis.onMachines)} tone="info" />
            <KpiCard label="Filled Pipes in Godown" value={String(kpis.filledGodown)} tone="ok" />
            <KpiCard label="Empty Pipes" value={String(kpis.emptyPipes)} tone="slate" />
            <KpiCard label="At Warper" value={String(kpis.atWarper)} tone="warper" />
            <KpiCard label="Total Available Meter" value={formatNum(kpis.totalAvailableMeter)} tone="info" />
            <KpiCard label="Total Used Meter" value={formatNum(kpis.totalUsedMeter)} tone="warn" />
            <KpiCard label="Total Balance Meter" value={formatNum(kpis.totalBalanceMeter)} tone="ok" />
            <KpiCard label="Today's Consumption" value={formatNum(todayConsumption)} tone="warn" />
          </div>
          <div className="wym-overview-grid">
            <article className="surface wym-panel">
              <h2 className="section-title">On Machines · snapshot</h2>
              <div className="wym-table-wrap">
                <table className="wym-table">
                  <thead>
                    <tr>
                      <th>Machine</th>
                      <th>Pipe</th>
                      <th>Quality</th>
                      <th>Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineRows.map(({ machine, pipe }) => (
                      <tr key={machine} className={pipe ? 'wym-row-active' : undefined}>
                        <td>{machine}</td>
                        <td>{pipe ? <PipeLink pipe={pipe} /> : '—'}</td>
                        <td>{pipe?.yarn_quality || '—'}</td>
                        <td className="num">{pipe ? formatNum(pipe.balance_meter) : '—'}</td>
                        <td>
                          {pipe ? (
                            <span className={statusBadgeClass(pipe.status)}>{statusLabel(pipe.status)}</span>
                          ) : (
                            <span className="wym-badge">Idle</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="surface wym-panel">
              <h2 className="section-title">Recent movements</h2>
              <div className="wym-table-wrap">
                <table className="wym-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Pipe</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.slice(0, 8).map((t) => (
                      <tr key={t.id}>
                        <td>{t.txn_date}</td>
                        <td>{t.pipe_no}</td>
                        <td>{t.txn_type}</td>
                        <td>
                          <span className={statusBadgeClass(t.status || '')}>{t.status || '—'}</span>
                        </td>
                      </tr>
                    ))}
                    {!txns.length ? (
                      <tr>
                        <td colSpan={4} className="text-muted">
                          No transactions yet
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {tab === 'machines' ? (
        <section className="wym-section">
          <WarpBeamStockEntry
            pipeOptions={pipeNoOptions}
            tablesReady={tablesReady}
            onSaved={() => void reload()}
          />
          <div className="wbs-machine-status surface">
            <h3 className="section-title">Current Machine Stock</h3>
            <div className="wym-table-wrap">
              <table className="wym-table">
                <thead>
                  <tr>
                    <th>Machine No.</th>
                    <th>Pipe No.</th>
                    <th>Yarn Quality</th>
                    <th>Original Meter</th>
                    <th>Multiplier</th>
                    <th>Total Meter</th>
                    <th>Used Meter</th>
                    <th>Balance Meter</th>
                    <th>Weight KG</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {machineRows.map(({ machine, pipe }) => (
                    <tr key={machine} className={pipe ? 'wym-row-active' : undefined}>
                      <td>
                        <strong>{machine}</strong>
                      </td>
                      <td>{pipe ? <PipeLink pipe={pipe} /> : '—'}</td>
                      <td>{pipe?.yarn_quality || '—'}</td>
                      <td className="num">{pipe ? formatNum(pipe.meter) : '—'}</td>
                      <td className="num">{pipe ? formatNum(pipe.multiplier) : '—'}</td>
                      <td className="num">{pipe ? formatNum(pipe.total_meter) : '—'}</td>
                      <td className="num">{pipe ? formatNum(pipe.used_meter) : '—'}</td>
                      <td className="num">{pipe ? formatNum(pipe.balance_meter) : '—'}</td>
                      <td className="num">{pipe ? formatNum(pipe.weight_kg, 2) : '—'}</td>
                      <td>
                        {pipe ? (
                          <span className={statusBadgeClass(pipe.status)}>{statusLabel(pipe.status)}</span>
                        ) : (
                          <span className="wym-badge">Idle</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'godown' ? (
        <section className="wym-section">
          <FilterBar showMachine={false} />
          <div className="wym-table-wrap surface">
            <table className="wym-table">
              <thead>
                <tr>
                  <th>Pipe No.</th>
                  <th>Yarn Quality</th>
                  <th>Meter</th>
                  <th>Multiplier</th>
                  <th>Total Meter</th>
                  <th>Used Meter</th>
                  <th>Balance Meter</th>
                  <th>Weight KG</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {godownFilled.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <PipeLink pipe={p} />
                    </td>
                    <td>{p.yarn_quality || '—'}</td>
                    <td className="num">{formatNum(p.meter)}</td>
                    <td className="num">{formatNum(p.multiplier)}</td>
                    <td className="num">{formatNum(p.total_meter)}</td>
                    <td className="num">{formatNum(p.used_meter)}</td>
                    <td className="num">{formatNum(p.balance_meter)}</td>
                    <td className="num">{formatNum(p.weight_kg, 2)}</td>
                    <td>
                      <span className={statusBadgeClass(p.status)}>{statusLabel(p.status)}</span>
                    </td>
                  </tr>
                ))}
                {!godownFilled.length ? (
                  <tr>
                    <td colSpan={9} className="text-muted">
                      No filled pipes in godown
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'empty' ? (
        <section className="wym-section">
          <FilterBar showMachine={false} showWarper={false} />
          <div className="wym-table-wrap surface">
            <table className="wym-table">
              <thead>
                <tr>
                  <th>Pipe No.</th>
                  <th>Serial No.</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Last Used</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {emptyPipes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <PipeLink pipe={p} />
                    </td>
                    <td>{p.serial_no || p.pipe_no}</td>
                    <td>{p.location}</td>
                    <td>
                      <span className={statusBadgeClass(p.status)}>{statusLabel(p.status)}</span>
                    </td>
                    <td>{p.last_used_at ? p.last_used_at.slice(0, 10) : '—'}</td>
                    <td>{p.remarks || '—'}</td>
                  </tr>
                ))}
                {!emptyPipes.length ? (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No empty pipes
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'warper' ? (
        <section className="wym-section">
          <FilterBar showMachine={false} />
          {gatePasses.length ? (
            <div className="wym-table-wrap surface wbs-gate-passes">
              <h3 className="section-title">Gate Passes</h3>
              <table className="wym-table">
                <thead>
                  <tr>
                    <th>GP No.</th>
                    <th>Date</th>
                    <th>Party</th>
                    <th>Pipe No.</th>
                    <th>Item / Yarn</th>
                    <th>Single M</th>
                    <th>Double M</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {gatePasses.slice(0, 20).map((gp) => (
                    <tr key={gp.id}>
                      <td>
                        <strong>{gp.gate_pass_no}</strong>
                      </td>
                      <td>{gp.pass_date}</td>
                      <td>{gp.party_name}</td>
                      <td>{gp.pipe_no}</td>
                      <td>{gp.item_yarn || '—'}</td>
                      <td className="num">{formatNum(gp.single_meter)}</td>
                      <td className="num">{formatNum(gp.double_meter)}</td>
                      <td>
                        <span className={statusBadgeClass(gp.status)}>{gp.status}</span>
                      </td>
                      <td>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => printGatePass(gp)}>
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="wym-table-wrap surface">
            <table className="wym-table">
              <thead>
                <tr>
                  <th>Pipe No.</th>
                  <th>Yarn Quality</th>
                  <th>Sent Date</th>
                  <th>Warper / Job Worker</th>
                  <th>Yarn Sent KG</th>
                  <th>Expected Meter</th>
                  <th>Multiplier</th>
                  <th>Expected Total</th>
                  <th>Received Date</th>
                  <th>Received Meter</th>
                  <th>Received KG</th>
                  <th>Meter Diff</th>
                  <th>KG Diff</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {warperJobs.map((j) => (
                  <tr key={j.id} className={j.status === 'DIFFERENCE' ? 'wym-row-diff' : undefined}>
                    <td>{j.pipe_no}</td>
                    <td>{j.yarn_quality || '—'}</td>
                    <td>{j.sent_date}</td>
                    <td>{j.warper_name}</td>
                    <td className="num">{formatNum(j.yarn_sent_kg, 2)}</td>
                    <td className="num">{formatNum(j.expected_meter)}</td>
                    <td className="num">{formatNum(j.multiplier)}</td>
                    <td className="num">{formatNum(j.expected_total_meter)}</td>
                    <td>{j.received_date || '—'}</td>
                    <td className="num">{j.received_meter != null ? formatNum(j.received_meter) : '—'}</td>
                    <td className="num">{j.received_kg != null ? formatNum(j.received_kg, 2) : '—'}</td>
                    <td className={`num ${Number(j.meter_difference) ? 'text-danger' : ''}`}>
                      {j.meter_difference != null ? formatNum(j.meter_difference) : '—'}
                    </td>
                    <td className={`num ${Number(j.kg_difference) ? 'text-danger' : ''}`}>
                      {j.kg_difference != null ? formatNum(j.kg_difference, 2) : '—'}
                    </td>
                    <td>
                      <span className={statusBadgeClass(j.status)}>{j.status}</span>
                    </td>
                  </tr>
                ))}
                {!warperJobs.length ? (
                  <tr>
                    <td colSpan={14} className="text-muted">
                      No warper / job-work records
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section className="wym-section">
          <FilterBar />
          <div className="wym-report-tabs">
            {REPORT_KINDS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={reportKind === r.id ? 'seg active' : 'seg'}
                onClick={() => setReportKind(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <ReportPanel
            kind={reportKind}
            pipes={pipes}
            txns={filteredTxns}
            jobs={jobs}
            purchases={purchases}
            onPipe={openHistory}
          />
        </section>
      ) : null}

      {action === 'purchase' ? (
        <PurchaseModal busy={busy} onClose={() => setAction(null)} onSave={(f) => void savePurchase(f)} />
      ) : null}
      {action === 'empty' ? (
        <EmptyPipeModal busy={busy} onClose={() => setAction(null)} onSave={(f) => void saveEmptyPipe(f)} />
      ) : null}
      {action === 'send' ? (
        <SendModal
          busy={busy}
          pipes={pipes.filter((p) => ['EMPTY', 'FILLED_GODOWN', 'ISSUED'].includes(p.status))}
          onClose={() => setAction(null)}
          onSave={(f) => void saveSendWarper(f)}
        />
      ) : null}
      {action === 'receive' ? (
        <ReceiveModal
          busy={busy}
          jobs={jobs.filter((j) => j.status === 'SENT' || j.status === 'IN_PROCESS')}
          onClose={() => setAction(null)}
          onSave={(f) => void saveReceiveWarper(f)}
        />
      ) : null}
      {action === 'issue' ? (
        <IssueModal
          busy={busy}
          pipes={pipes.filter((p) => p.status === 'FILLED_GODOWN')}
          onClose={() => setAction(null)}
          onSave={(f) => void saveIssueMachine(f)}
        />
      ) : null}
      {action === 'return' ? (
        <ReturnModal
          busy={busy}
          pipes={pipes.filter((p) => p.status === 'ON_MACHINE')}
          onClose={() => setAction(null)}
          onSave={(f) => void saveReturnMachine(f)}
        />
      ) : null}
      {action === 'history' && historyPipe ? (
        <HistoryModal
          pipe={historyPipe}
          rows={historyRows}
          onClose={() => {
            setAction(null)
            setHistoryPipe(null)
          }}
        />
      ) : null}
    </div>
  )
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'info' | 'ok' | 'warn' | 'slate' | 'warper'
}) {
  return (
    <article className={`wym-kpi tone-${tone}`}>
      <span className="wym-kpi-label">{label}</span>
      <strong className="wym-kpi-value">{value}</strong>
    </article>
  )
}

/* ---------- Report panel ---------- */

function ReportPanel({
  kind,
  pipes,
  txns,
  jobs,
  purchases,
  onPipe,
}: {
  kind: ReportKind
  pipes: WarpPipe[]
  txns: WarpYarnTransaction[]
  jobs: WarpWarperJob[]
  purchases: WarpYarnPurchase[]
  onPipe: (p: WarpPipe) => void
}) {
  if (kind === 'current') {
    return (
      <TableCard title="Current Stock Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Status</th>
            <th>Quality</th>
            <th>Location</th>
            <th>Total</th>
            <th>Used</th>
            <th>Balance</th>
            <th>KG</th>
          </tr>
        </thead>
        <tbody>
          {pipes.map((p) => (
            <tr key={p.id}>
              <td>
                <button type="button" className="wym-pipe-link" onClick={() => onPipe(p)}>
                  {p.pipe_no}
                </button>
              </td>
              <td>
                <span className={statusBadgeClass(p.status)}>{statusLabel(p.status)}</span>
              </td>
              <td>{p.yarn_quality || '—'}</td>
              <td>{p.location}</td>
              <td className="num">{formatNum(p.total_meter)}</td>
              <td className="num">{formatNum(p.used_meter)}</td>
              <td className="num">{formatNum(p.balance_meter)}</td>
              <td className="num">{formatNum(p.weight_kg, 2)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'machine') {
    const rows = pipes.filter((p) => p.status === 'ON_MACHINE')
    return (
      <TableCard title="Machine-wise Report">
        <thead>
          <tr>
            <th>Machine</th>
            <th>Pipe</th>
            <th>Quality</th>
            <th>Total</th>
            <th>Used</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {MACHINES.map((m) => {
            const p = rows.find((r) => r.machine_no === m)
            return (
              <tr key={m}>
                <td>{m}</td>
                <td>{p?.pipe_no || '—'}</td>
                <td>{p?.yarn_quality || '—'}</td>
                <td className="num">{p ? formatNum(p.total_meter) : '—'}</td>
                <td className="num">{p ? formatNum(p.used_meter) : '—'}</td>
                <td className="num">{p ? formatNum(p.balance_meter) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'godown') {
    const rows = pipes.filter((p) => p.status === 'FILLED_GODOWN')
    return (
      <TableCard title="Godown Stock Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Quality</th>
            <th>Meter × Mult</th>
            <th>Total</th>
            <th>Balance</th>
            <th>KG</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.pipe_no}</td>
              <td>{p.yarn_quality || '—'}</td>
              <td>
                {formatNum(p.meter)} × {formatNum(p.multiplier)}
              </td>
              <td className="num">{formatNum(p.total_meter)}</td>
              <td className="num">{formatNum(p.balance_meter)}</td>
              <td className="num">{formatNum(p.weight_kg, 2)}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={6} className="text-muted">
                No filled godown stock
              </td>
            </tr>
          ) : null}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'empty') {
    const rows = pipes.filter((p) => ['EMPTY', 'DAMAGED', 'UNDER_REPAIR', 'ISSUED'].includes(p.status))
    return (
      <TableCard title="Empty Pipe Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Serial</th>
            <th>Location</th>
            <th>Status</th>
            <th>Last Used</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.pipe_no}</td>
              <td>{p.serial_no || '—'}</td>
              <td>{p.location}</td>
              <td>
                <span className={statusBadgeClass(p.status)}>{statusLabel(p.status)}</span>
              </td>
              <td>{p.last_used_at ? p.last_used_at.slice(0, 10) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'warper-pending') {
    const rows = jobs.filter((j) => j.status === 'SENT' || j.status === 'IN_PROCESS')
    return (
      <TableCard title="Warper Pending Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Warper</th>
            <th>Sent</th>
            <th>KG Sent</th>
            <th>Expected Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id}>
              <td>{j.pipe_no}</td>
              <td>{j.warper_name}</td>
              <td>{j.sent_date}</td>
              <td className="num">{formatNum(j.yarn_sent_kg, 2)}</td>
              <td className="num">{formatNum(j.expected_total_meter)}</td>
              <td>
                <span className={statusBadgeClass(j.status)}>{j.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'warper-received') {
    const rows = jobs.filter((j) => j.status === 'RECEIVED' || j.status === 'DIFFERENCE')
    return (
      <TableCard title="Warper Received Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Warper</th>
            <th>Received</th>
            <th>Recv Meter</th>
            <th>Recv KG</th>
            <th>Meter Diff</th>
            <th>KG Diff</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id}>
              <td>{j.pipe_no}</td>
              <td>{j.warper_name}</td>
              <td>{j.received_date || '—'}</td>
              <td className="num">{formatNum(j.received_meter)}</td>
              <td className="num">{formatNum(j.received_kg, 2)}</td>
              <td className="num text-danger">{formatNum(j.meter_difference)}</td>
              <td className="num text-danger">{formatNum(j.kg_difference, 2)}</td>
              <td>
                <span className={statusBadgeClass(j.status)}>{j.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'meter') {
    const rows = pipes.filter((p) => Number(p.used_meter) > 0 || p.status === 'ON_MACHINE')
    return (
      <TableCard title="Meter Consumption Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Machine</th>
            <th>Quality</th>
            <th>Total</th>
            <th>Used</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{p.pipe_no}</td>
              <td>{p.machine_no || '—'}</td>
              <td>{p.yarn_quality || '—'}</td>
              <td className="num">{formatNum(p.total_meter)}</td>
              <td className="num">{formatNum(p.used_meter)}</td>
              <td className="num">{formatNum(p.balance_meter)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'kg-diff') {
    const rows = jobs.filter((j) => Number(j.kg_difference) !== 0 || Number(j.meter_difference) !== 0)
    return (
      <TableCard title="KG / Meter Difference Report">
        <thead>
          <tr>
            <th>Pipe</th>
            <th>Warper</th>
            <th>Sent KG</th>
            <th>Recv KG</th>
            <th>KG Diff</th>
            <th>Expected M</th>
            <th>Recv M</th>
            <th>Meter Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id} className="wym-row-diff">
              <td>{j.pipe_no}</td>
              <td>{j.warper_name}</td>
              <td className="num">{formatNum(j.yarn_sent_kg, 2)}</td>
              <td className="num">{formatNum(j.received_kg, 2)}</td>
              <td className="num text-danger">{formatNum(j.kg_difference, 2)}</td>
              <td className="num">{formatNum(j.expected_meter)}</td>
              <td className="num">{formatNum(j.received_meter)}</td>
              <td className="num text-danger">{formatNum(j.meter_difference)}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={8} className="text-muted">
                No differences recorded
              </td>
            </tr>
          ) : null}
        </tbody>
      </TableCard>
    )
  }
  if (kind === 'monthly') {
    const month = todayISO().slice(0, 7)
    const monthTxns = txns.filter((t) => t.txn_date.startsWith(month))
    const monthPurchases = purchases.filter((p) => p.purchase_date.startsWith(month))
    const purchaseKg = monthPurchases.reduce((s, p) => s + Number(p.quantity_kg || 0), 0)
    const purchaseAmt = monthPurchases.reduce((s, p) => s + Number(p.total_amount || 0), 0)
    return (
      <div className="wym-monthly">
        <div className="wym-kpi-grid">
          <KpiCard label="Month" value={month} tone="info" />
          <KpiCard label="Transactions" value={String(monthTxns.length)} tone="slate" />
          <KpiCard label="Purchase KG" value={formatNum(purchaseKg, 2)} tone="ok" />
          <KpiCard label="Purchase Amount" value={formatNum(purchaseAmt, 2)} tone="warn" />
        </div>
        <TableCard title={`Monthly Warp Yarn Report · ${month}`}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Pipe</th>
              <th>Type</th>
              <th>From</th>
              <th>To</th>
              <th>KG</th>
              <th>Total Meter</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {monthTxns.map((t) => (
              <tr key={t.id}>
                <td>{t.txn_date}</td>
                <td>{t.pipe_no}</td>
                <td>{t.txn_type}</td>
                <td>{t.from_location || '—'}</td>
                <td>{t.to_location || '—'}</td>
                <td className="num">{formatNum(t.kg, 2)}</td>
                <td className="num">{formatNum(t.total_meter)}</td>
                <td>{t.user_name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </div>
    )
  }
  // history
  return (
    <TableCard title="Pipe Movement History">
      <thead>
        <tr>
          <th>Date</th>
          <th>Pipe No.</th>
          <th>Transaction Type</th>
          <th>From</th>
          <th>To</th>
          <th>Quality</th>
          <th>KG</th>
          <th>Meter</th>
          <th>Multiplier</th>
          <th>Total Meter</th>
          <th>User</th>
          <th>Reference / Challan</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {txns.map((t) => (
          <tr key={t.id}>
            <td>{t.txn_date}</td>
            <td>{t.pipe_no}</td>
            <td>{t.txn_type}</td>
            <td>{t.from_location || '—'}</td>
            <td>{t.to_location || '—'}</td>
            <td>{t.quality || '—'}</td>
            <td className="num">{formatNum(t.kg, 2)}</td>
            <td className="num">{formatNum(t.meter)}</td>
            <td className="num">{formatNum(t.multiplier)}</td>
            <td className="num">{formatNum(t.total_meter)}</td>
            <td>{t.user_name || '—'}</td>
            <td>{t.reference || '—'}</td>
            <td>
              <span className={statusBadgeClass(t.status || '')}>{t.status || '—'}</span>
            </td>
          </tr>
        ))}
        {!txns.length ? (
          <tr>
            <td colSpan={13} className="text-muted">
              No transactions
            </td>
          </tr>
        ) : null}
      </tbody>
    </TableCard>
  )
}

function TableCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="surface wym-panel">
      <h2 className="section-title">{title}</h2>
      <div className="wym-table-wrap">
        <table className="wym-table">{children}</table>
      </div>
    </article>
  )
}

/* ---------- Modals ---------- */

type PurchaseForm = {
  purchase_date: string
  supplier: string
  invoice_no: string
  yarn_quality: string
  yarn_specification: string
  quantity_kg: string
  rate: string
  gst_pct: string
  destination: string
  remarks: string
}

function PurchaseModal({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean
  onClose: () => void
  onSave: (f: PurchaseForm) => void
}) {
  const [form, setForm] = useState<PurchaseForm>({
    purchase_date: todayISO(),
    supplier: '',
    invoice_no: '',
    yarn_quality: '',
    yarn_specification: '',
    quantity_kg: '',
    rate: '',
    gst_pct: '5',
    destination: '',
    remarks: '',
  })
  const qty = Number(form.quantity_kg) || 0
  const rate = Number(form.rate) || 0
  const amount = qty * rate
  const gst = Number(form.gst_pct) || 0
  const total = amount * (1 + gst / 100)

  return (
    <Modal title="Purchase Warp Yarn" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <div className="wym-form-grid">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              required
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Supplier</span>
            <input required value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </label>
          <label className="field">
            <span>Invoice / Challan No.</span>
            <input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
          </label>
          <label className="field">
            <span>Yarn Quality</span>
            <input
              required
              value={form.yarn_quality}
              onChange={(e) => setForm({ ...form, yarn_quality: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Yarn Specification</span>
            <input
              value={form.yarn_specification}
              onChange={(e) => setForm({ ...form, yarn_specification: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Quantity KG</span>
            <input
              type="number"
              step="0.01"
              required
              value={form.quantity_kg}
              onChange={(e) => setForm({ ...form, quantity_kg: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Rate</span>
            <input
              type="number"
              step="0.01"
              required
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </label>
          <label className="field">
            <span>GST %</span>
            <input
              type="number"
              step="0.01"
              value={form.gst_pct}
              onChange={(e) => setForm({ ...form, gst_pct: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Amount</span>
            <input readOnly value={formatNum(amount, 2)} />
          </label>
          <label className="field">
            <span>Total Amount</span>
            <input readOnly value={formatNum(total, 2)} />
          </label>
          <label className="field">
            <span>Destination / Warper</span>
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </label>
          <label className="field wym-span-2">
            <span>Remarks</span>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </label>
        </div>
        <div className="wym-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-warp" disabled={busy}>
            Save Purchase
          </button>
        </div>
      </form>
    </Modal>
  )
}

type EmptyForm = { pipe_no: string; serial_no: string; location: string; status: string; remarks: string }

function EmptyPipeModal({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean
  onClose: () => void
  onSave: (f: EmptyForm) => void
}) {
  const [form, setForm] = useState<EmptyForm>({
    pipe_no: '',
    serial_no: '',
    location: 'Godown',
    status: 'EMPTY',
    remarks: '',
  })
  return (
    <Modal title="Add Empty Pipe" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <div className="wym-form-grid">
          <label className="field">
            <span>Pipe No. (blank = auto)</span>
            <input
              placeholder="BP-001"
              value={form.pipe_no}
              onChange={(e) => setForm({ ...form, pipe_no: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Serial No.</span>
            <input value={form.serial_no} onChange={(e) => setForm({ ...form, serial_no: e.target.value })} />
          </label>
          <label className="field">
            <span>Location</span>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="EMPTY">Available</option>
              <option value="ISSUED">Issued</option>
              <option value="DAMAGED">Damaged</option>
              <option value="UNDER_REPAIR">Under Repair</option>
            </select>
          </label>
          <label className="field wym-span-2">
            <span>Remarks</span>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </label>
        </div>
        <div className="wym-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-warp" disabled={busy}>
            Add Pipe
          </button>
        </div>
      </form>
    </Modal>
  )
}

type SendForm = {
  pipe_id: string
  pipe_no: string
  warper_name: string
  sent_date: string
  yarn_quality: string
  yarn_sent_kg: string
  expected_meter: string
  multiplier: string
  challan_no: string
  remarks: string
  expected_return_date: string
  vehicle_no: string
  driver_name: string
}

function SendModal({
  busy,
  pipes,
  onClose,
  onSave,
}: {
  busy: boolean
  pipes: WarpPipe[]
  onClose: () => void
  onSave: (f: SendForm) => void
}) {
  const [form, setForm] = useState<SendForm>({
    pipe_id: pipes[0]?.id || '',
    pipe_no: pipes[0]?.pipe_no || '',
    warper_name: '',
    sent_date: todayISO(),
    yarn_quality: pipes[0]?.yarn_quality || '',
    yarn_sent_kg: '',
    expected_meter: '',
    multiplier: String(DEFAULT_MULTIPLIER),
    challan_no: '',
    remarks: '',
    expected_return_date: '',
    vehicle_no: '',
    driver_name: '',
  })
  const total = calcTotalMeter(Number(form.expected_meter) || 0, Number(form.multiplier) || 0)

  return (
    <Modal title="Send to Warper" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <div className="wym-form-grid">
          <label className="field">
            <span>Pipe No.</span>
            <select
              required
              value={form.pipe_id}
              onChange={(e) => {
                const p = pipes.find((x) => x.id === e.target.value)
                setForm({
                  ...form,
                  pipe_id: e.target.value,
                  pipe_no: p?.pipe_no || '',
                  yarn_quality: p?.yarn_quality || form.yarn_quality,
                })
              }}
            >
              <option value="">Select pipe</option>
              {pipes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pipe_no} · {statusLabel(p.status)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Warper Name</span>
            <input
              required
              value={form.warper_name}
              onChange={(e) => setForm({ ...form, warper_name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Send Date</span>
            <input
              type="date"
              required
              value={form.sent_date}
              onChange={(e) => setForm({ ...form, sent_date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Yarn Quality</span>
            <input value={form.yarn_quality} onChange={(e) => setForm({ ...form, yarn_quality: e.target.value })} />
          </label>
          <label className="field">
            <span>Yarn Sent KG</span>
            <input
              type="number"
              step="0.01"
              required
              value={form.yarn_sent_kg}
              onChange={(e) => setForm({ ...form, yarn_sent_kg: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Meter / Base Meter</span>
            <input
              type="number"
              step="0.01"
              required
              value={form.expected_meter}
              onChange={(e) => setForm({ ...form, expected_meter: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Multiplier</span>
            <input
              type="number"
              min={1}
              step={1}
              required
              value={form.multiplier}
              onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Expected Total Meter</span>
            <input readOnly value={formatNum(total)} />
          </label>
          <label className="field">
            <span>Challan No.</span>
            <input value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} />
          </label>
          <label className="field">
            <span>Expected Return Date</span>
            <input
              type="date"
              value={form.expected_return_date}
              onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Vehicle No.</span>
            <input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
          </label>
          <label className="field">
            <span>Driver Name</span>
            <input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} />
          </label>
          <label className="field">
            <span>Remarks</span>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </label>
        </div>
        <div className="wym-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-warp" disabled={busy || !pipes.length}>
            Send · Status SENT
          </button>
        </div>
      </form>
    </Modal>
  )
}

type ReceiveForm = {
  job_id: string
  received_date: string
  received_meter: string
  received_kg: string
  multiplier: string
}

function ReceiveModal({
  busy,
  jobs,
  onClose,
  onSave,
}: {
  busy: boolean
  jobs: WarpWarperJob[]
  onClose: () => void
  onSave: (f: ReceiveForm) => void
}) {
  const [form, setForm] = useState<ReceiveForm>({
    job_id: jobs[0]?.id || '',
    received_date: todayISO(),
    received_meter: jobs[0] ? String(jobs[0].expected_meter) : '',
    received_kg: jobs[0] ? String(jobs[0].yarn_sent_kg) : '',
    multiplier: jobs[0] ? String(jobs[0].multiplier) : String(DEFAULT_MULTIPLIER),
  })
  const job = jobs.find((j) => j.id === form.job_id)
  const recvMeter = Number(form.received_meter) || 0
  const mult = Number(form.multiplier) || DEFAULT_MULTIPLIER
  const total = calcTotalMeter(recvMeter, mult)
  const kgDiff = job ? Math.round((Number(job.yarn_sent_kg) - (Number(form.received_kg) || 0)) * 1000) / 1000 : 0
  const mDiff = job ? Math.round((Number(job.expected_meter) - recvMeter) * 1000) / 1000 : 0

  return (
    <Modal title="Receive from Warper" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <div className="wym-form-grid">
          <label className="field wym-span-2">
            <span>Pending Job</span>
            <select
              required
              value={form.job_id}
              onChange={(e) => {
                const j = jobs.find((x) => x.id === e.target.value)
                setForm({
                  job_id: e.target.value,
                  received_date: todayISO(),
                  received_meter: j ? String(j.expected_meter) : '',
                  received_kg: j ? String(j.yarn_sent_kg) : '',
                  multiplier: j ? String(j.multiplier) : String(DEFAULT_MULTIPLIER),
                })
              }}
            >
              <option value="">Select</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.pipe_no} → {j.warper_name} · {j.sent_date}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Receive Date</span>
            <input
              type="date"
              required
              value={form.received_date}
              onChange={(e) => setForm({ ...form, received_date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Received Meter</span>
            <input
              type="number"
              step="0.01"
              required
              value={form.received_meter}
              onChange={(e) => setForm({ ...form, received_meter: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Multiplier</span>
            <input
              type="number"
              min={1}
              required
              value={form.multiplier}
              onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Total Meter</span>
            <input readOnly value={formatNum(total)} />
          </label>
          <label className="field">
            <span>Received KG</span>
            <input
              type="number"
              step="0.01"
              required
              value={form.received_kg}
              onChange={(e) => setForm({ ...form, received_kg: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Original Sent KG</span>
            <input readOnly value={job ? formatNum(job.yarn_sent_kg, 2) : '—'} />
          </label>
          <label className="field">
            <span>KG Difference</span>
            <input readOnly className={kgDiff ? 'text-danger' : undefined} value={formatNum(kgDiff, 2)} />
          </label>
          <label className="field">
            <span>Expected Meter</span>
            <input readOnly value={job ? formatNum(job.expected_meter) : '—'} />
          </label>
          <label className="field">
            <span>Meter Difference</span>
            <input readOnly className={mDiff ? 'text-danger' : undefined} value={formatNum(mDiff)} />
          </label>
        </div>
        <div className="wym-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-warp" disabled={busy || !jobs.length}>
            Receive Filled Pipe
          </button>
        </div>
      </form>
    </Modal>
  )
}

type IssueForm = {
  pipe_id: string
  machine_no: string
  quality: string
  starting_meter: string
  multiplier: string
  starting_kg: string
  issue_date: string
  operator: string
}

function IssueModal({
  busy,
  pipes,
  onClose,
  onSave,
}: {
  busy: boolean
  pipes: WarpPipe[]
  onClose: () => void
  onSave: (f: IssueForm) => void
}) {
  const [form, setForm] = useState<IssueForm>({
    pipe_id: pipes[0]?.id || '',
    machine_no: MACHINES[0],
    quality: pipes[0]?.yarn_quality || '',
    starting_meter: pipes[0] ? String(pipes[0].meter) : '',
    multiplier: pipes[0] ? String(pipes[0].multiplier || DEFAULT_MULTIPLIER) : String(DEFAULT_MULTIPLIER),
    starting_kg: pipes[0] ? String(pipes[0].weight_kg) : '',
    issue_date: todayISO(),
    operator: '',
  })
  const total = calcTotalMeter(Number(form.starting_meter) || 0, Number(form.multiplier) || 0)

  return (
    <Modal title="Issue to Machine" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <div className="wym-form-grid">
          <label className="field">
            <span>Filled Pipe</span>
            <select
              required
              value={form.pipe_id}
              onChange={(e) => {
                const p = pipes.find((x) => x.id === e.target.value)
                setForm({
                  ...form,
                  pipe_id: e.target.value,
                  quality: p?.yarn_quality || '',
                  starting_meter: p ? String(p.meter) : '',
                  multiplier: p ? String(p.multiplier || DEFAULT_MULTIPLIER) : String(DEFAULT_MULTIPLIER),
                  starting_kg: p ? String(p.weight_kg) : '',
                })
              }}
            >
              <option value="">Select</option>
              {pipes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pipe_no} · {p.yarn_quality || '—'} · {formatNum(p.total_meter)} m
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Machine No.</span>
            <select
              required
              value={form.machine_no}
              onChange={(e) => setForm({ ...form, machine_no: e.target.value })}
            >
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Quality</span>
            <input value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} />
          </label>
          <label className="field">
            <span>Starting Meter</span>
            <input
              type="number"
              required
              value={form.starting_meter}
              onChange={(e) => setForm({ ...form, starting_meter: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Multiplier</span>
            <input
              type="number"
              min={1}
              required
              value={form.multiplier}
              onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Total Meter</span>
            <input readOnly value={formatNum(total)} />
          </label>
          <label className="field">
            <span>Starting KG</span>
            <input
              type="number"
              step="0.01"
              value={form.starting_kg}
              onChange={(e) => setForm({ ...form, starting_kg: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Issue Date</span>
            <input
              type="date"
              required
              value={form.issue_date}
              onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Operator / User</span>
            <input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
          </label>
        </div>
        <div className="wym-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-warp" disabled={busy || !pipes.length}>
            Issue to Machine
          </button>
        </div>
      </form>
    </Modal>
  )
}

type ReturnForm = {
  pipe_id: string
  remaining_meter: string
  remaining_kg: string
  return_date: string
  reason: string
}

function ReturnModal({
  busy,
  pipes,
  onClose,
  onSave,
}: {
  busy: boolean
  pipes: WarpPipe[]
  onClose: () => void
  onSave: (f: ReturnForm) => void
}) {
  const [form, setForm] = useState<ReturnForm>({
    pipe_id: pipes[0]?.id || '',
    remaining_meter: pipes[0] ? String(pipes[0].balance_meter) : '',
    remaining_kg: pipes[0] ? String(pipes[0].weight_kg) : '',
    return_date: todayISO(),
    reason: '',
  })

  return (
    <Modal title="Return from Machine" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(form)
        }}
      >
        <div className="wym-form-grid">
          <label className="field wym-span-2">
            <span>On-Machine Pipe</span>
            <select
              required
              value={form.pipe_id}
              onChange={(e) => {
                const p = pipes.find((x) => x.id === e.target.value)
                setForm({
                  ...form,
                  pipe_id: e.target.value,
                  remaining_meter: p ? String(p.balance_meter) : '',
                  remaining_kg: p ? String(p.weight_kg) : '',
                })
              }}
            >
              <option value="">Select</option>
              {pipes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.machine_no} · {p.pipe_no} · bal {formatNum(p.balance_meter)} m
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Remaining Meter (Total)</span>
            <input
              type="number"
              required
              value={form.remaining_meter}
              onChange={(e) => setForm({ ...form, remaining_meter: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Remaining KG</span>
            <input
              type="number"
              step="0.01"
              value={form.remaining_kg}
              onChange={(e) => setForm({ ...form, remaining_kg: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Return Date</span>
            <input
              type="date"
              required
              value={form.return_date}
              onChange={(e) => setForm({ ...form, return_date: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Reason</span>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </label>
        </div>
        <p className="text-muted">
          Remaining meter &gt; 0 → Godown – Filled. Remaining 0 → Empty Pipes.
        </p>
        <div className="wym-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-warp" disabled={busy || !pipes.length}>
            Return Pipe
          </button>
        </div>
      </form>
    </Modal>
  )
}

function HistoryModal({
  pipe,
  rows,
  onClose,
}: {
  pipe: WarpPipe
  rows: WarpYarnTransaction[]
  onClose: () => void
}) {
  return (
    <Modal title={`Pipe History · ${pipe.pipe_no}`} onClose={onClose} wide>
      <div className="wym-history-meta">
        <span className={statusBadgeClass(pipe.status)}>{statusLabel(pipe.status)}</span>
        <span>{pipe.yarn_quality || '—'}</span>
        <span>{pipe.location}</span>
        <span>
          Balance {formatNum(pipe.balance_meter)} m · {formatNum(pipe.weight_kg, 2)} kg
        </span>
      </div>
      <div className="wym-table-wrap">
        <table className="wym-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction</th>
              <th>Location</th>
              <th>Machine</th>
              <th>Warper</th>
              <th>Quality</th>
              <th>KG</th>
              <th>Meter</th>
              <th>Balance</th>
              <th>User</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>{t.txn_date}</td>
                <td>{t.txn_type}</td>
                <td>
                  {t.from_location || '—'} → {t.to_location || '—'}
                </td>
                <td>{t.machine_no || '—'}</td>
                <td>{t.warper_name || '—'}</td>
                <td>{t.quality || '—'}</td>
                <td className="num">{formatNum(t.kg, 2)}</td>
                <td className="num">{formatNum(t.total_meter || t.meter)}</td>
                <td className="num">{t.balance_meter != null ? formatNum(t.balance_meter) : '—'}</td>
                <td>{t.user_name || '—'}</td>
                <td>{t.reference || '—'}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={11} className="text-muted">
                  No history for this pipe yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="wym-modal-actions">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="wym-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`wym-modal surface ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="wym-modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn-ghost icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
