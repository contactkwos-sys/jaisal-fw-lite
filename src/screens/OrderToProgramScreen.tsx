import { useCallback, useEffect, useMemo, useState } from 'react'
import { ImageLightbox } from '../components/ImageLightbox'
import { ShareActions } from '../components/ShareActions'
import { useAuth } from '../lib/auth'
import { todayISO } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'
import {
  buildRecipeFeeders,
  buildWhatsAppStatusMessage,
  calcRecipeTotals,
  downloadCsv,
  emptyFeeder,
  fmtInrIn,
  ITEM_NAME_OPTIONS,
  listDinOptions,
  listOperators,
  listParties,
  loadBookedOrders,
  loadDesignForOrder,
  loadMachineWarpBoard,
  loadOrderStatusRows,
  loadOtpDashboardStats,
  loadOtpReports,
  matchingMainColour,
  MAX_FEEDERS,
  OTP_MENU_STEPS,
  rowsToCsv,
  saveCustomerOrder,
  saveProgramWithJobCard,
  statusBadgeClass,
  type BookedOrderOption,
  type DesignForOrder,
  type FeederRow,
  type MachineWarpInfo,
  type MatchingOrderLine,
  type OrderStatusRow,
  type OtpDashboardStats,
  type OtpStepId,
  type ReportFilters,
  DEFAULT_ADD_WEIGHT_PCT,
} from '../lib/orderToProgram'
import {
  canChangeDispatchStatus,
  canChangeProductionStatus,
  isSalesmanRole,
} from '../lib/permissions'
import { printSummary, shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { handleUserError } from '../lib/userError'
import type { DinWithMatchings } from '../lib/designToOrder'

type Props = {
  onNavigate: (t: NavTarget) => void
  initialStep?: OtpStepId
  initialDinNumber?: string
}

type LineDraft = {
  key: string
  matchingNo: number
  matchingId: string | null
  matchingName: string
  mainColour: string
  otherInfo: string
  meter: string
}

const REPORT_KINDS = [
  { id: 'party-wise', label: 'Customer-wise Orders' },
  { id: 'din-wise', label: 'DIN-wise Orders' },
  { id: 'matching-wise', label: 'Matching-wise Orders' },
  { id: 'order-summary', label: 'Pending Orders' },
  { id: 'pending-production', label: 'Program / Production Pending' },
  { id: 'completed-production', label: 'Production Completed' },
  { id: 'dispatch-pending', label: 'Dispatch Pending' },
  { id: 'dispatch-completed', label: 'Dispatch Completed' },
  { id: 'machine-wise', label: 'Machine-wise Program' },
  { id: 'production', label: 'Production Report' },
  { id: 'order-dispatch-summary', label: 'Order to Dispatch Summary' },
] as const

function confirmWhatsApp(message: string, business: boolean) {
  const ok = window.confirm(
    'Open WhatsApp to send this status update?\n\nNothing is sent until you confirm in WhatsApp.',
  )
  if (!ok) return
  if (business) shareWhatsAppBusiness(message)
  else shareWhatsApp(message)
}

export function OrderToProgramScreen({ onNavigate, initialStep, initialDinNumber }: Props) {
  const { roleName } = useAuth()
  const salesman = isSalesmanRole(roleName)
  const canEditRecipe = !salesman
  const canChangeProd = canChangeProductionStatus(roleName)
  const canChangeDisp = canChangeDispatchStatus(roleName)

  const [step, setStep] = useState<OtpStepId>(initialStep || 'dashboard')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dashStats, setDashStats] = useState<OtpDashboardStats>({
    pendingOrders: 0,
    todaysOrders: 0,
    programPending: 0,
    productionPending: 0,
    readyForDispatch: 0,
    dispatched: 0,
  })

  useEffect(() => {
    if (initialStep) setStep(initialStep)
  }, [initialStep])

  // masters
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [parties, setParties] = useState<string[]>([])
  const [operators, setOperators] = useState<string[]>([])
  const [machines, setMachines] = useState<MachineWarpInfo[]>([])
  const [bookedOrders, setBookedOrders] = useState<BookedOrderOption[]>([])
  const [statusRows, setStatusRows] = useState<OrderStatusRow[]>([])

  // order entry
  const [orderDate, setOrderDate] = useState(todayISO())
  const [party, setParty] = useState('')
  const [itemName, setItemName] = useState<string>(ITEM_NAME_OPTIONS[0])
  const [dinNumber, setDinNumber] = useState(initialDinNumber || '')
  const [design, setDesign] = useState<DesignForOrder | null>(null)

  useEffect(() => {
    if (initialDinNumber) setDinNumber(initialDinNumber)
  }, [initialDinNumber])
  const [deliveryDays, setDeliveryDays] = useState('30')
  const [paymentTerms, setPaymentTerms] = useState('30 Days')
  const [discountPct, setDiscountPct] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([])

  // program
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [selectedItemId, setSelectedItemId] = useState('')
  const [machineNo, setMachineNo] = useState('M1')
  const [warpManual, setWarpManual] = useState('')
  const [useManualWarp, setUseManualWarp] = useState(false)
  const [programDate, setProgramDate] = useState(todayISO())
  const [operator, setOperator] = useState('')
  const [meterToWeave, setMeterToWeave] = useState('')
  const [taka, setTaka] = useState('')
  const [feeders, setFeeders] = useState<FeederRow[]>([])
  const [recipeEditable, setRecipeEditable] = useState(false)
  const [recipeOverride, setRecipeOverride] = useState(false)
  const [addWeightPct, setAddWeightPct] = useState(String(DEFAULT_ADD_WEIGHT_PCT))
  const [programRemarks, setProgramRemarks] = useState('')
  const [lastJobCard, setLastJobCard] = useState<{ no: string; programNo: string } | null>(null)
  const [programDesign, setProgramDesign] = useState<DesignForOrder | null>(null)

  // reports
  const [reportKind, setReportKind] = useState<string>('order-summary')
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: '',
    dateTo: '',
    party: '',
    din: '',
    design: '',
    orderNo: '',
    machine: '',
    matching: '',
    status: '',
  })
  const [reportCols, setReportCols] = useState<string[]>([])
  const [reportRows, setReportRows] = useState<Record<string, string | number | null>[]>([])

  const boot = useCallback(async () => {
    const [d, p, ops, m] = await Promise.all([
      listDinOptions(200),
      listParties(),
      listOperators(),
      loadMachineWarpBoard(),
    ])
    setDins(d)
    setParties(p)
    setOperators(ops)
    setMachines(m)
    if (!dinNumber && (initialDinNumber || d[0]?.din_number)) {
      setDinNumber(initialDinNumber || d[0].din_number)
    }
  }, [dinNumber, initialDinNumber])

  useEffect(() => {
    void boot().catch((e) => setError(handleUserError('OTP.boot', e, 'Unable to load masters.')))
  }, [boot])

  useEffect(() => {
    if (!dinNumber) {
      setDesign(null)
      setLines([])
      return
    }
    void loadDesignForOrder(dinNumber)
      .then((d) => {
        setDesign(d)
        if (d?.partyName && !party) setParty(d.partyName)
        const approved = (d?.matchings || []).filter((m) => m.status === 'Approved')
        const pool = approved.length ? approved : d?.matchings || []
        setLines(
          pool.map((m) => ({
            key: crypto.randomUUID(),
            matchingNo: m.matching_no,
            matchingId: m.id,
            matchingName: `M-${String(m.matching_no).padStart(2, '0')}`,
            mainColour: matchingMainColour(m),
            otherInfo: '',
            meter: '',
          })),
        )
      })
      .catch((e) => setError(handleUserError('OTP.design', e, 'Unable to load design from Design Module.')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dinNumber])

  const refreshStatusAndOrders = useCallback(async () => {
    const [orders, status, dash] = await Promise.all([
      loadBookedOrders(100),
      loadOrderStatusRows(200),
      loadOtpDashboardStats(),
    ])
    setBookedOrders(orders)
    setStatusRows(status)
    setDashStats(dash)
    if (!selectedOrderId && orders[0]) {
      setSelectedOrderId(orders[0].orderId)
      if (orders[0].items[0]) setSelectedItemId(orders[0].items[0].itemId)
    }
  }, [selectedOrderId])

  useEffect(() => {
    if (step === 'order-status' || step === 'program' || step === 'reports' || step === 'dashboard') {
      void refreshStatusAndOrders().catch((e) =>
        setError(handleUserError('OTP.status', e, 'Unable to load order status.')),
      )
    }
  }, [step, refreshStatusAndOrders])

  useEffect(() => {
    if (step !== 'reports') return
    void loadOtpReports(reportKind, filters)
      .then((r) => {
        setReportCols(r.columns)
        setReportRows(r.rows)
      })
      .catch((e) => setError(handleUserError('OTP.reports', e, 'Unable to load report.')))
  }, [step, reportKind, filters])

  const selectedOrder = useMemo(
    () => bookedOrders.find((o) => o.orderId === selectedOrderId) || null,
    [bookedOrders, selectedOrderId],
  )
  const selectedItem = useMemo(
    () => selectedOrder?.items.find((i) => i.itemId === selectedItemId) || selectedOrder?.items[0] || null,
    [selectedOrder, selectedItemId],
  )
  const selectedMachine = useMemo(
    () => machines.find((m) => m.machineNo === machineNo) || machines[0] || null,
    [machines, machineNo],
  )

  // Load design + recipe when program selection changes
  useEffect(() => {
    if (step !== 'program' || !selectedOrder) return
    const din = selectedOrder.din
    void loadDesignForOrder(din)
      .then((d) => {
        setProgramDesign(d)
        const matching =
          d?.matchings.find((m) => m.matching_no === selectedItem?.matchingNo) ||
          d?.matchings.find((m) => m.id === selectedItem?.matchingId) ||
          null
        const meter = Number(meterToWeave) || Number(selectedItem?.orderedMeter) || 0
        if (!meterToWeave && selectedItem?.orderedMeter) setMeterToWeave(String(selectedItem.orderedMeter))
        const built = buildRecipeFeeders(matching, d?.wefts || [], meter || d?.designLengthMtr || 100, d?.designLengthMtr || 100)
        setFeeders(built.length ? built : [emptyFeeder(1)])
        setRecipeOverride(false)
        setRecipeEditable(false)
        if (selectedOrder.previewUrl && d) {
          /* preview already on design */
        }
      })
      .catch((e) => setError(handleUserError('OTP.programDesign', e, 'Unable to load matching recipe.')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedOrderId, selectedItemId])

  // Recalc recipe weights when meter changes
  useEffect(() => {
    if (step !== 'program' || !programDesign || recipeOverride) return
    const matching =
      programDesign.matchings.find((m) => m.matching_no === selectedItem?.matchingNo) ||
      programDesign.matchings.find((m) => m.id === selectedItem?.matchingId) ||
      null
    const meter = Number(meterToWeave) || 0
    if (meter <= 0) return
    const built = buildRecipeFeeders(matching, programDesign.wefts, meter, programDesign.designLengthMtr)
    setFeeders(built.length ? built : feeders)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meterToWeave])

  useEffect(() => {
    if (!selectedMachine) return
    if (selectedMachine.isManual || selectedMachine.warpName === '—') {
      setUseManualWarp(true)
    } else {
      setUseManualWarp(false)
      setWarpManual('')
    }
  }, [selectedMachine])

  const salesRate = design?.salesRate || 0
  const orderTotals = useMemo(() => {
    const meter = lines.reduce((s, l) => s + (Number(l.meter) || 0), 0)
    const amount = meter * salesRate
    const disc = (amount * (Number(discountPct) || 0)) / 100
    return { meter, amount, discount: disc, net: amount - disc }
  }, [lines, salesRate, discountPct])

  const recipeTotals = useMemo(
    () => calcRecipeTotals(feeders, Number(addWeightPct) || DEFAULT_ADD_WEIGHT_PCT),
    [feeders, addWeightPct],
  )

  function addMatchingLine() {
    const nextNo = (lines.reduce((max, l) => Math.max(max, l.matchingNo), 0) || 0) + 1
    setLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        matchingNo: nextNo,
        matchingId: null,
        matchingName: `M-${String(nextNo).padStart(2, '0')}`,
        mainColour: '',
        otherInfo: '',
        meter: '',
      },
    ])
  }

  function addFeeder() {
    if (feeders.length >= MAX_FEEDERS) return
    setFeeders((prev) => [...prev, emptyFeeder(prev.length + 1)])
    setRecipeOverride(true)
  }

  async function onSaveOrder() {
    if (!design) {
      setError('Select a DIN / Design Number first.')
      return
    }
    const matchingLines: MatchingOrderLine[] = lines
      .filter((l) => Number(l.meter) > 0)
      .map((l) => ({
        key: l.key,
        matchingNo: l.matchingNo,
        matchingId: l.matchingId,
        matchingName: l.matchingName,
        mainColour: l.mainColour,
        otherInfo: l.otherInfo,
        orderedMeter: Number(l.meter) || 0,
        rate: salesRate,
        amount: (Number(l.meter) || 0) * salesRate,
      }))
    if (!party.trim() || !matchingLines.length) {
      setError('Party and at least one matching with meter are required.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await saveCustomerOrder({
        partyName: party,
        orderDate,
        itemName,
        dinId: design.dinId || null,
        dinNumber: design.dinNumber,
        qualityName: design.qualityName,
        salesRate,
        previewUrl: design.previewUrl,
        deliveryWithinDays: deliveryDays ? Number(deliveryDays) : null,
        paymentTerms,
        remarks,
        discountPct: Number(discountPct) || 0,
        discountAmount: orderTotals.discount,
        lines: matchingLines,
      })
      setMessage(`Order ${res.orderNo} saved. Program status = PROGRAM PENDING.`)
      setLines((prev) => prev.map((l) => ({ ...l, meter: '' })))
      setStep('order-status')
    } catch (e) {
      setError(handleUserError('OTP.saveOrder', e, 'Could not save customer order.'))
    } finally {
      setBusy(false)
    }
  }

  async function onSaveProgram() {
    if (!selectedOrder || !selectedItem) {
      setError('Select an order and matching first.')
      return
    }
    const meter = Number(meterToWeave) || 0
    if (meter <= 0) {
      setError('Enter meter to weave.')
      return
    }
    if (!operator.trim()) {
      setError('Select an operator.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const warpName = selectedMachine && !useManualWarp ? selectedMachine.warpName : ''
      const res = await saveProgramWithJobCard({
        orderId: selectedOrder.orderId,
        orderItemId: selectedItem.itemId,
        orderNo: selectedOrder.orderNo,
        partyName: selectedOrder.party,
        dinNumber: selectedOrder.din,
        dinId: selectedOrder.dinId,
        matchingNo: selectedItem.matchingNo,
        matchingId: selectedItem.matchingId,
        mainColour: selectedItem.mainColour,
        quality: selectedOrder.quality,
        machineNo,
        warpName: warpName === '—' ? '' : warpName,
        warpManual,
        warpIsManual: useManualWarp,
        programDate,
        operatorName: operator,
        meterToWeave: meter,
        taka: taka ? Number(taka) : null,
        salesRate: selectedOrder.salesRate,
        previewUrl: programDesign?.previewUrl || selectedOrder.previewUrl,
        feeders,
        addWeightPct: Number(addWeightPct) || DEFAULT_ADD_WEIGHT_PCT,
        remarks: programRemarks,
        recipeIsOverride: recipeOverride,
      })
      setLastJobCard({ no: res.jobCardNo, programNo: res.programNo })
      setMessage(`Program ${res.programNo} saved · Job Card ${res.jobCardNo} · Status = CREATED`)
      await refreshStatusAndOrders()
    } catch (e) {
      setError(handleUserError('OTP.saveProgram', e, 'Could not save program / job card.'))
    } finally {
      setBusy(false)
    }
  }

  function clearOrderForm() {
    setParty('')
    setRemarks('')
    setDiscountPct('')
    setDeliveryDays('30')
    setPaymentTerms('30 Days')
    setLines((prev) => prev.map((l) => ({ ...l, meter: '', otherInfo: '' })))
    setMessage(null)
    setError(null)
  }

  function waPayload() {
    return buildWhatsAppStatusMessage({
      party: selectedOrder?.party || party || '—',
      orderNo: selectedOrder?.orderNo || '—',
      din: selectedOrder?.din || design?.dinNumber || '—',
      design: programDesign?.designName || design?.designName || '—',
      matching: selectedItem
        ? `${selectedItem.matchingName} / ${selectedItem.mainColour}`
        : '—',
      producedMeter: meterToWeave || selectedItem?.orderedMeter || '—',
      status: lastJobCard ? 'PROGRAM CREATED' : 'ORDER RECEIVED',
      dispatchStatus: 'PENDING',
    })
  }

  function printJobCard() {
    const d = programDesign || design
    const warp = useManualWarp ? warpManual : selectedMachine?.warpName || '—'
    const body = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div>
          <h2 style="margin:0">JAISAL FW</h2>
          <p style="margin:4px 0;color:#555">Fashionweave Industries</p>
          <p><strong>JOB CARD NO.</strong> ${lastJobCard?.no || '— (preview)'}</p>
        </div>
        ${d?.previewUrl ? `<img src="${d.previewUrl}" alt="Design" style="width:96px;height:96px;object-fit:cover;border:1px solid #ccc"/>` : ''}
      </div>
      <table>
        <tr><th>Program Date</th><td>${programDate}</td><th>Order No.</th><td>${selectedOrder?.orderNo || '—'}</td></tr>
        <tr><th>DIN</th><td>${selectedOrder?.din || d?.dinNumber || '—'}</td><th>Party</th><td>${selectedOrder?.party || '—'}</td></tr>
        <tr><th>Quality</th><td>${selectedOrder?.quality || d?.qualityName || '—'}</td><th>Machine</th><td>${machineNo}</td></tr>
        <tr><th>Warp</th><td>${warp}</td><th>Operator</th><td>${operator || '—'}</td></tr>
        <tr><th>Matching</th><td>${selectedItem?.matchingName || '—'}</td><th>Main Colour</th><td>${selectedItem?.mainColour || '—'}</td></tr>
        <tr><th>Meter</th><td>${meterToWeave || '—'}</td><th>Taka</th><td>${taka || '—'}</td></tr>
        <tr><th>Total Pick</th><td>${recipeTotals.totalPick}</td><th>Weft Weight</th><td>${recipeTotals.totalWeftWeight} KG</td></tr>
        <tr><th>Final Weight</th><td colspan="3">${recipeTotals.finalWeight} KG (add ${recipeTotals.addWeightPct}%)</td></tr>
      </table>
      <h3>Matching Recipe (max 6 feeders)</h3>
      <table>
        <thead><tr><th>Feeder</th><th>Yarn/Weft</th><th>Colour</th><th>Denier/Tex</th><th>Quality</th><th>Pick</th><th>Weight KG</th></tr></thead>
        <tbody>
          ${feeders
            .map(
              (f) =>
                `<tr><td>${f.feederNo}</td><td>${f.yarnWeft}</td><td>${f.colour}</td><td>${f.denierTex}</td><td>${f.quality || '—'}</td><td>${f.pickEnds}</td><td>${f.weightKg}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <div style="margin-top:48px;display:flex;justify-content:space-between">
        <div>Prepared By _______________</div>
        <div>Checked By _______________</div>
      </div>
    `
    printSummary('Job Card — JAISAL FW', body)
  }

  return (
    <div className="screen otp-screen">
      <header className="screen-header otp-header">
        <div>
          <p className="otp-eyebrow">JAISAL FW · Sales &amp; Production</p>
          <h1>Order to Program</h1>
          <p className="text-muted">
            Customer Order → Order Status → Program to Machine → Reports &amp; Status
          </p>
        </div>
        <div className="otp-header-actions">
          <ShareActions
            onWhatsApp={() => confirmWhatsApp(waPayload(), false)}
            onWhatsAppBusiness={() => confirmWhatsApp(waPayload(), true)}
          />
          <button
            type="button"
            className="btn-warp"
            onClick={() => {
              setStep('reports')
              onNavigate({ screen: 'order-to-program', filter: 'reports', module: 'order-to-program' })
            }}
          >
            Reports
          </button>
          <button
            type="button"
            className="primary-save"
            onClick={() => {
              setStep('order-entry')
              clearOrderForm()
              onNavigate({ screen: 'order-to-program', filter: 'order-entry', module: 'order-to-program' })
            }}
          >
            + New Customer Order
          </button>
        </div>
      </header>

      <nav className="otp-stepper otp-stepper-5" aria-label="Order to Program steps">
        {OTP_MENU_STEPS.map((s, idx) => (
          <button
            key={s.id}
            type="button"
            className={step === s.id ? 'is-active' : undefined}
            onClick={() => {
              setStep(s.id)
              onNavigate({ screen: 'order-to-program', filter: s.id, module: 'order-to-program' })
            }}
          >
            <span className="otp-step-num">{idx + 1}</span>
            <span className="otp-step-label">{s.label}</span>
          </button>
        ))}
      </nav>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      {step === 'dashboard' ? (
        <section className="otp-section surface otp-dashboard">
          <h2 className="section-title">Salesman Dashboard</h2>
          <div className="otp-kpi-row">
            {(
              [
                ['Pending Orders', dashStats.pendingOrders, 'order-status'],
                ["Today's Orders", dashStats.todaysOrders, 'order-status'],
                ['Program Pending', dashStats.programPending, 'program'],
                ['Production Pending', dashStats.productionPending, 'order-status'],
                ['Ready for Dispatch', dashStats.readyForDispatch, 'reports'],
                ['Dispatched', dashStats.dispatched, 'reports'],
              ] as const
            ).map(([label, value, goStep]) => (
              <button
                key={label}
                type="button"
                className="otp-kpi"
                onClick={() => {
                  setStep(goStep)
                  onNavigate({ screen: 'order-to-program', filter: goStep, module: 'order-to-program' })
                }}
              >
                <span className="text-muted">{label}</span>
                <strong className="num">{value}</strong>
              </button>
            ))}
          </div>
          <div className="otp-quick-actions">
            <button
              type="button"
              className="primary-save"
              onClick={() => {
                setStep('order-entry')
                clearOrderForm()
              }}
            >
              + New Customer Order
            </button>
            <button type="button" className="btn-warp" onClick={() => setStep('order-status')}>
              Order Status
            </button>
            <button type="button" className="btn-warp" onClick={() => setStep('program')}>
              Program to Machine
            </button>
            <button type="button" className="btn-warp" onClick={() => setStep('reports')}>
              Reports
            </button>
          </div>
          <p className="text-muted otp-hint">
            Design Master data (DIN, preview, quality, approved sales rate, matchings &amp; recipe) loads
            automatically when you select a DIN. Salesman cannot edit Design Costing, Rate Master, or
            Formula Master.
          </p>
          {!canChangeProd && !canChangeDisp ? (
            <p className="text-muted otp-hint">
              You can view production &amp; dispatch status. Only authorized users can change those statuses.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 'order-entry' ? (
        <section className="otp-section surface">
          <h2 className="section-title">Customer Order</h2>
          <div className="otp-order-grid">
            <div className="otp-form-grid">
              <label className="field">
                <span>Order Date</span>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Party / Customer</span>
                <input list="otp-parties" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Select party" />
                <datalist id="otp-parties">
                  {parties.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="field">
                <span>Item Name</span>
                <select value={itemName} onChange={(e) => setItemName(e.target.value)}>
                  {ITEM_NAME_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>DIN / Design Number</span>
                <select value={dinNumber} onChange={(e) => setDinNumber(e.target.value)}>
                  <option value="">Select DIN…</option>
                  {dins.map((d) => (
                    <option key={d.id} value={d.din_number}>
                      {d.din_number} · {d.design_name || '—'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Delivery Within (Days)</span>
                <input className="num" type="number" min="0" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
              </label>
              <label className="field">
                <span>Payment Terms</span>
                <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
              </label>
              <label className="field">
                <span>Discount %</span>
                <input className="num" type="number" min="0" step="any" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
              </label>
              <label className="field otp-span-2">
                <span>Remarks</span>
                <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </label>
            </div>

            <aside className="otp-design-preview">
              <h3>Design Preview {design ? `(${design.dinNumber})` : ''}</h3>
              {design ? (
                <>
                  <ImageLightbox src={design.previewUrl} alt={design.designName} thumbClassName="otp-preview-img" />
                  <dl className="otp-meta">
                    <div><dt>Design Name</dt><dd>{design.designName}</dd></div>
                    <div><dt>Quality</dt><dd>{design.qualityName}</dd></div>
                    <div><dt>Width</dt><dd>{design.widthLabel}</dd></div>
                    <div><dt>Final Sales Rate</dt><dd>{fmtInrIn(design.salesRate)} / Meter</dd></div>
                  </dl>
                </>
              ) : (
                <p className="text-muted">Select a DIN to auto-load preview, quality &amp; sales rate from Design Module.</p>
              )}
            </aside>
          </div>

          <div className="otp-totals">
            <div><span className="text-muted">Total Order Meter</span><strong className="num">{orderTotals.meter.toFixed(2)}</strong></div>
            <div><span className="text-muted">Total Amount</span><strong className="num">{fmtInrIn(orderTotals.amount)}</strong></div>
            <div><span className="text-muted">Total Discount</span><strong className="num">{fmtInrIn(orderTotals.discount)}</strong></div>
            <div><span className="text-muted">Net Amount</span><strong className="num">{fmtInrIn(orderTotals.net)}</strong></div>
          </div>

          <div className="otp-panel-head">
            <h2 className="section-title">Matching-wise Order (Customer Confirmed)</h2>
            <button type="button" className="primary-save" onClick={addMatchingLine}>+ Add Matching</button>
          </div>
          <p className="text-muted otp-hint">
            One approved Design Sales Rate applies to all matchings ({fmtInrIn(salesRate)} / m). No per-matching rate.
          </p>
          <div className="table-wrap otp-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Matching No.</th>
                  <th>Matching Name</th>
                  <th>Main Colour</th>
                  <th>Ordered Meter</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const amt = (Number(l.meter) || 0) * salesRate
                  return (
                    <tr key={l.key}>
                      <td className="num">{l.matchingNo}</td>
                      <td>
                        <input value={l.matchingName} onChange={(e) => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, matchingName: e.target.value } : x)))} />
                      </td>
                      <td>
                        <input value={l.mainColour} onChange={(e) => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, mainColour: e.target.value } : x)))} />
                      </td>
                      <td>
                        <input className="num" type="number" min="0" step="any" value={l.meter} onChange={(e) => setLines((prev) => prev.map((x) => (x.key === l.key ? { ...x, meter: e.target.value } : x)))} />
                      </td>
                      <td className="num">{fmtInrIn(amt)}</td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="otp-footer-actions">
            <button type="button" className="primary-save" disabled={busy} onClick={() => void onSaveOrder()}>Save Order</button>
            <button type="button" className="btn-warp" onClick={() => setStep('program')}>Continue to Program</button>
            <button type="button" className="btn-ghost" onClick={clearOrderForm}>Clear</button>
          </div>
        </section>
      ) : null}

      {step === 'order-status' ? (
        <section className="otp-section surface">
          <div className="otp-panel-head">
            <h2 className="section-title">Order Status</h2>
            <button type="button" className="primary-save" onClick={() => setStep('order-entry')}>+ New Order</button>
          </div>
          <div className="table-wrap otp-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Date</th>
                  <th>Party</th>
                  <th>DIN</th>
                  <th>Preview</th>
                  <th>Quality</th>
                  <th>Meter</th>
                  <th>Matchings</th>
                  <th>Program</th>
                  <th>Production</th>
                  <th>Checking</th>
                  <th>Dispatch</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map((r) => (
                  <tr key={r.orderId}>
                    <td>{r.orderNo}</td>
                    <td>{r.orderDate}</td>
                    <td>{r.party}</td>
                    <td>{r.din}</td>
                    <td><ImageLightbox src={r.previewUrl} alt={r.din} thumbClassName="dto-thumb-sm" /></td>
                    <td>{r.quality}</td>
                    <td className="num">{r.totalMeter}</td>
                    <td className="num">{r.matchingCount}</td>
                    <td><span className={statusBadgeClass(r.programStatus)}>{r.programStatus}</span></td>
                    <td><span className={statusBadgeClass(r.productionStatus)}>{r.productionStatus}</span></td>
                    <td><span className={statusBadgeClass(r.checkingStatus)}>{r.checkingStatus}</span></td>
                    <td><span className={statusBadgeClass(r.dispatchStatus)}>{r.dispatchStatus}</span></td>
                    <td><span className={statusBadgeClass(r.overallStatus)}>{r.overallStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {step === 'program' ? (
        <section className="otp-section surface">
          <h2 className="section-title">Program to Machine (Create Job Cards)</h2>
          <div className="otp-form-grid">
            <label className="field">
              <span>Order</span>
              <select
                value={selectedOrderId}
                onChange={(e) => {
                  setSelectedOrderId(e.target.value)
                  const o = bookedOrders.find((x) => x.orderId === e.target.value)
                  if (o?.items[0]) setSelectedItemId(o.items[0].itemId)
                }}
              >
                <option value="">Select order…</option>
                {bookedOrders.map((o) => (
                  <option key={o.orderId} value={o.orderId}>
                    {o.orderNo} · {o.party} · {o.din}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Matching</span>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
              >
                {(selectedOrder?.items || []).map((it) => (
                  <option key={it.itemId} value={it.itemId}>
                    {it.matchingName} — {it.mainColour} ({it.orderedMeter} Mt)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Main Colour</span>
              <input value={selectedItem?.mainColour || ''} readOnly />
            </label>
            <label className="field">
              <span>Ordered Meter</span>
              <input className="num" value={selectedItem?.orderedMeter ?? ''} readOnly />
            </label>
            <label className="field">
              <span>Sales Rate</span>
              <input value={selectedOrder ? fmtInrIn(selectedOrder.salesRate) : ''} readOnly />
            </label>
            <label className="field">
              <span>Program Date</span>
              <input type="date" value={programDate} onChange={(e) => setProgramDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Operator</span>
              <input list="otp-ops" value={operator} onChange={(e) => setOperator(e.target.value)} />
              <datalist id="otp-ops">
                {operators.map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Meter to Weave</span>
              <input className="num" type="number" min="0" step="any" value={meterToWeave} onChange={(e) => setMeterToWeave(e.target.value)} />
            </label>
            <label className="field">
              <span>Taka / Pick</span>
              <input className="num" type="number" min="0" step="any" value={taka} onChange={(e) => setTaka(e.target.value)} />
            </label>
          </div>

          <div className="otp-program-split">
            <div>
              <h3 className="section-title">Machine (Warp Info)</h3>
              <div className="table-wrap otp-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>Machine</th>
                      <th>Status</th>
                      <th>Warp Yarn</th>
                      <th>Count</th>
                      <th>Quality</th>
                      <th>Colour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machines.map((m) => (
                      <tr key={m.machineNo} className={machineNo === m.machineNo ? 'is-selected' : undefined}>
                        <td>
                          <input
                            type="radio"
                            name="otp-machine"
                            checked={machineNo === m.machineNo}
                            onChange={() => setMachineNo(m.machineNo)}
                            aria-label={m.label}
                          />
                        </td>
                        <td>{m.label}</td>
                        <td><span className={statusBadgeClass(m.status)}>{m.status}</span></td>
                        <td>{m.warpName}</td>
                        <td>{m.yarnCount}</td>
                        <td>{m.quality}</td>
                        <td>{m.colour}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(useManualWarp || selectedMachine?.isManual) ? (
                <label className="field" style={{ marginTop: '0.75rem' }}>
                  <span>Other / Manual Warp</span>
                  <input value={warpManual} onChange={(e) => { setWarpManual(e.target.value); setUseManualWarp(true) }} placeholder="Enter warp if master unavailable" />
                </label>
              ) : (
                <p className="text-muted otp-hint">Warp auto-loaded from Warp Yarn master for {selectedMachine?.label}.</p>
              )}
            </div>

            <aside className="otp-program-summary">
              <h3>Program Summary</h3>
              <dl className="otp-meta">
                <div><dt>Selected Machine</dt><dd>{selectedMachine ? `${selectedMachine.label.replace('Machine ', '')} (${useManualWarp ? warpManual || 'Manual' : selectedMachine.warpName})` : '—'}</dd></div>
                <div><dt>Program Date</dt><dd>{programDate}</dd></div>
                <div><dt>Operator</dt><dd>{operator || '—'}</dd></div>
                <div><dt>Meter to Weave</dt><dd>{meterToWeave || '—'}</dd></div>
              </dl>
              <button type="button" className="primary-save otp-full-btn" disabled={busy} onClick={() => void onSaveProgram()}>
                Generate Job Card
              </button>
            </aside>
          </div>

          <div className="otp-panel-head" style={{ marginTop: '1.25rem' }}>
            <h2 className="section-title">Matching Recipe (As per Design Master — max 6 feeders)</h2>
            <div className="otp-header-actions">
              {canEditRecipe ? (
                <button type="button" className="btn-warp" onClick={() => { setRecipeEditable(true); setRecipeOverride(true) }}>
                  Edit Recipe (Program Override)
                </button>
              ) : (
                <span className="text-muted">Approved recipe (view only)</span>
              )}
              {canEditRecipe && feeders.length < MAX_FEEDERS ? (
                <button type="button" className="btn-warp" onClick={addFeeder}>+ Add Feeder</button>
              ) : feeders.length >= MAX_FEEDERS ? (
                <span className="text-muted">Max 6 feeders</span>
              ) : null}
            </div>
          </div>
          <div className="table-wrap otp-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Feeder</th>
                  <th>Yarn / Weft</th>
                  <th>Colour</th>
                  <th>Denier / Tex</th>
                  <th>Quality</th>
                  <th>Pick / Ends</th>
                  <th>Weight KG</th>
                </tr>
              </thead>
              <tbody>
                {feeders.map((f, idx) => (
                  <tr key={f.feederNo}>
                    <td className="num">{f.feederNo}</td>
                    <td>
                      {recipeEditable && canEditRecipe ? (
                        <input value={f.yarnWeft} onChange={(e) => setFeeders((prev) => prev.map((x, i) => (i === idx ? { ...x, yarnWeft: e.target.value } : x)))} />
                      ) : (
                        f.yarnWeft || '—'
                      )}
                    </td>
                    <td>
                      {recipeEditable && canEditRecipe ? (
                        <input value={f.colour} onChange={(e) => setFeeders((prev) => prev.map((x, i) => (i === idx ? { ...x, colour: e.target.value } : x)))} />
                      ) : (
                        f.colour || '—'
                      )}
                    </td>
                    <td>
                      {recipeEditable && canEditRecipe ? (
                        <input value={f.denierTex} onChange={(e) => setFeeders((prev) => prev.map((x, i) => (i === idx ? { ...x, denierTex: e.target.value } : x)))} />
                      ) : (
                        f.denierTex || '—'
                      )}
                    </td>
                    <td>
                      {recipeEditable && canEditRecipe ? (
                        <input value={f.quality} onChange={(e) => setFeeders((prev) => prev.map((x, i) => (i === idx ? { ...x, quality: e.target.value } : x)))} />
                      ) : (
                        f.quality || '—'
                      )}
                    </td>
                    <td>
                      {recipeEditable && canEditRecipe ? (
                        <input className="num" type="number" value={f.pickEnds} onChange={(e) => setFeeders((prev) => prev.map((x, i) => (i === idx ? { ...x, pickEnds: Number(e.target.value) || 0 } : x)))} />
                      ) : (
                        <span className="num">{f.pickEnds}</span>
                      )}
                    </td>
                    <td>
                      {recipeEditable && canEditRecipe ? (
                        <input className="num" type="number" step="any" value={f.weightKg} onChange={(e) => setFeeders((prev) => prev.map((x, i) => (i === idx ? { ...x, weightKg: Number(e.target.value) || 0 } : x)))} />
                      ) : (
                        <span className="num">{f.weightKg}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="otp-totals">
            <div><span className="text-muted">Total Pick / Ends</span><strong className="num">{recipeTotals.totalPick}</strong></div>
            <div><span className="text-muted">Total Weft Weight</span><strong className="num">{recipeTotals.totalWeftWeight} KG</strong></div>
            <div>
              <span className="text-muted">Add. Weight %</span>
              <input className="num" style={{ maxWidth: '5rem' }} type="number" value={addWeightPct} onChange={(e) => setAddWeightPct(e.target.value)} />
            </div>
            <div><span className="text-muted">Total Weight With Add.</span><strong className="num">{recipeTotals.finalWeight} KG</strong></div>
          </div>
          {recipeOverride ? <p className="text-muted otp-hint">Recipe edits save as PROGRAM OVERRIDE — master Design recipe is unchanged.</p> : null}

          <div className="otp-jobcard surface">
            <div className="otp-panel-head">
              <h2 className="section-title">Job Card Preview {selectedMachine ? `(${selectedMachine.label})` : ''}</h2>
              {lastJobCard ? <span className={statusBadgeClass('CREATED')}>{lastJobCard.no}</span> : null}
            </div>
            <div className="otp-jobcard-body">
              <div>
                <strong>JAISAL FW</strong>
                <div className="text-muted">Fashionweave Industries</div>
                <p>DIN: {selectedOrder?.din || '—'} · Party: {selectedOrder?.party || '—'} · Matching: {selectedItem?.matchingName || '—'} / {selectedItem?.mainColour || '—'}</p>
                <p>Machine {machineNo} · Warp {useManualWarp ? warpManual || 'Manual' : selectedMachine?.warpName || '—'} · Operator {operator || '—'}</p>
                <p>Meter {meterToWeave || '—'} · Pick {recipeTotals.totalPick} · Weft {recipeTotals.totalWeftWeight} KG · Final {recipeTotals.finalWeight} KG</p>
              </div>
              <ImageLightbox
                src={programDesign?.previewUrl || selectedOrder?.previewUrl}
                alt="Design preview"
                thumbClassName="otp-preview-img"
              />
            </div>
          </div>

          <div className="otp-footer-actions">
            <button type="button" className="primary-save" onClick={printJobCard}>Print Job Card</button>
            <button type="button" className="btn-wa" onClick={() => confirmWhatsApp(waPayload(), false)}>WhatsApp (Send Status)</button>
            <button type="button" className="btn-wa" onClick={() => confirmWhatsApp(waPayload(), true)}>WhatsApp Business</button>
            <button type="button" className="primary-save" disabled={busy} onClick={() => void onSaveProgram()}>Save Program</button>
            <button type="button" className="btn-ghost" onClick={() => { setMeterToWeave(''); setTaka(''); setProgramRemarks(''); setLastJobCard(null) }}>Clear</button>
          </div>
        </section>
      ) : null}

      {step === 'reports' ? (
        <section className="otp-section surface">
          <h2 className="section-title">Reports &amp; Status</h2>
          <div className="otp-form-grid">
            <label className="field"><span>Date From</span><input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} /></label>
            <label className="field"><span>Date To</span><input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} /></label>
            <label className="field"><span>Party</span><input value={filters.party} onChange={(e) => setFilters((f) => ({ ...f, party: e.target.value }))} /></label>
            <label className="field"><span>DIN</span><input value={filters.din} onChange={(e) => setFilters((f) => ({ ...f, din: e.target.value }))} /></label>
            <label className="field"><span>Order No.</span><input value={filters.orderNo} onChange={(e) => setFilters((f) => ({ ...f, orderNo: e.target.value }))} /></label>
            <label className="field"><span>Machine</span><input value={filters.machine} onChange={(e) => setFilters((f) => ({ ...f, machine: e.target.value }))} /></label>
            <label className="field"><span>Matching</span><input value={filters.matching} onChange={(e) => setFilters((f) => ({ ...f, matching: e.target.value }))} /></label>
            <label className="field"><span>Status</span><input value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} /></label>
          </div>
          <div className="otp-report-kinds">
            {REPORT_KINDS.map((k) => (
              <button key={k.id} type="button" className={reportKind === k.id ? 'is-active' : undefined} onClick={() => setReportKind(k.id)}>
                {k.label}
              </button>
            ))}
          </div>
          <div className="otp-header-actions" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              className="btn-warp"
              onClick={() => {
                const body = `<table><thead><tr>${reportCols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${reportRows
                  .map((r) => `<tr>${reportCols.map((c) => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`)
                  .join('')}</tbody></table>`
                printSummary(`JAISAL FW — ${REPORT_KINDS.find((k) => k.id === reportKind)?.label || 'Report'}`, body)
              }}
            >
              PRINT
            </button>
            <button
              type="button"
              className="btn-warp"
              onClick={() => downloadCsv(`jaisal-${reportKind}.csv`, rowsToCsv(reportCols, reportRows))}
            >
              CSV / Excel
            </button>
            <button type="button" className="btn-wa" onClick={() => confirmWhatsApp(waPayload(), false)}>WhatsApp</button>
            <button type="button" className="btn-wa" onClick={() => confirmWhatsApp(waPayload(), true)}>WhatsApp Business</button>
          </div>
          <div className="table-wrap otp-table-wrap">
            <table className="data-table">
              <thead>
                <tr>{reportCols.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {reportRows.length === 0 ? (
                  <tr><td colSpan={Math.max(reportCols.length, 1)} className="text-muted">No rows for this report / filter.</td></tr>
                ) : (
                  reportRows.map((r, i) => (
                    <tr key={i}>
                      {reportCols.map((c) => (
                        <td key={c}>{r[c] ?? '—'}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
