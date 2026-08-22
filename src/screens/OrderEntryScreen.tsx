/**
 * Order Entry Module — Warp / Weft / Maintenance Material / Repair orders.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { YarnSearchSelect } from '../components/YarnSearchSelect'
import { useAuth } from '../lib/auth'
import { MACHINES } from '../lib/database.types'
import {
  DELIVERY_TIMELINES,
  ORDER_TYPE_LABELS,
  ORDER_TYPES,
  type OrderEntry,
  type OrderEntryLine,
  type OrderHistory,
  type OrderMaintItem,
  type OrderServiceProvider,
  type OrderSupplier,
  type OrderType,
  type OrderWarpItem,
  type OrderWeftColour,
  addHistory,
  buildWhatsAppMessage,
  calcLineAmount,
  calcOrderTotals,
  emptyLine,
  ensureServiceProvider,
  ensureSupplier,
  loadAllHistory,
  loadMaintItems,
  loadOrderHistory,
  loadOrders,
  loadServiceProviders,
  loadSuppliers,
  loadWarpItems,
  loadWeftColours,
  printOrder,
  saveOrder,
  shareWhatsAppToPhone,
  todayISO,
} from '../lib/orderEntry'
import { shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { supabase } from '../lib/supabase'
import { handleUserError } from '../lib/userError'

type TabId = 'warp' | 'weft' | 'material' | 'repair' | 'list' | 'history' | 'delivery' | 'reports'

export type OrderEntryScope = 'yarn' | 'maintenance' | 'all'

type Props = {
  initialTab?: TabId
  onTabChange?: (tab: TabId) => void
  /** Restrict tabs: yarn = warp/weft only; maintenance = material/repair only */
  scope?: OrderEntryScope
}

const ALL_TABS: Array<{ id: TabId; label: string; scope: OrderEntryScope[] }> = [
  { id: 'warp', label: 'Warp Yarn', scope: ['yarn', 'all'] },
  { id: 'weft', label: 'Weft Yarn', scope: ['yarn', 'all'] },
  { id: 'material', label: 'Maint. Material', scope: ['maintenance', 'all'] },
  { id: 'repair', label: 'Repair / Service', scope: ['maintenance', 'all'] },
  { id: 'list', label: 'Order List', scope: ['yarn', 'maintenance', 'all'] },
  { id: 'history', label: 'Order History', scope: ['yarn', 'maintenance', 'all'] },
  { id: 'delivery', label: 'Delivery & Follow-up', scope: ['yarn', 'maintenance', 'all'] },
  { id: 'reports', label: 'Reports', scope: ['yarn', 'maintenance', 'all'] },
]

export function OrderEntryScreen({ initialTab = 'warp', onTabChange, scope = 'all' }: Props) {
  const { profile } = useAuth()
  const userName = profile?.full_name || profile?.roles?.role_name || 'User'

  const [tab, setTab] = useState<TabId>(initialTab)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tablesReady, setTablesReady] = useState(true)

  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([])
  const [providers, setProviders] = useState<OrderServiceProvider[]>([])
  const [warpItems, setWarpItems] = useState<OrderWarpItem[]>([])
  const [weftColours, setWeftColours] = useState<OrderWeftColour[]>([])
  const [maintItems, setMaintItems] = useState<OrderMaintItem[]>([])
  const [orders, setOrders] = useState<OrderEntry[]>([])
  const [allHistory, setAllHistory] = useState<(OrderHistory & { order_no?: string })[]>([])

  const [editId, setEditId] = useState<string | null>(null)
  const [orderType, setOrderType] = useState<OrderType>('warp')
  const [orderDate, setOrderDate] = useState(todayISO())
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [providerId, setProviderId] = useState('')
  const [providerName, setProviderName] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [whatsappBiz, setWhatsappBiz] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryTimeline, setDeliveryTimeline] = useState('± 2–5 Days')
  const [deliveryParty, setDeliveryParty] = useState('JAISAL FASHIONWEAV INDUSTRIES')
  const [deliveryInstructions, setDeliveryInstructions] = useState('')
  const [remarks, setRemarks] = useState('')
  const [lines, setLines] = useState<OrderEntryLine[]>([emptyLine('warp')])
  const [waMessage, setWaMessage] = useState('')
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([])

  // Repair fields
  const [machineNo, setMachineNo] = useState<string>(MACHINES[0])
  const [machineName, setMachineName] = useState('')
  const [department, setDepartment] = useState('Weaving')
  const [problemCategory, setProblemCategory] = useState('Electrical')
  const [problemDesc, setProblemDesc] = useState('')
  const [urgency, setUrgency] = useState('URGENT')
  const [requestedDate, setRequestedDate] = useState(todayISO())
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [expectedCompletion, setExpectedCompletion] = useState('')

  const [listFilter, setListFilter] = useState({ type: '', status: '', search: '', dateFrom: '', dateTo: '' })

  const TABS = ALL_TABS.filter((t) => t.scope.includes(scope))

  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    if (!TABS.some((t) => t.id === tab)) {
      const fallback = TABS[0]?.id ?? 'warp'
      setTab(fallback)
      onTabChange?.(fallback)
    }
  }, [scope, tab, TABS, onTabChange])

  function selectTab(t: TabId) {
    setTab(t)
    onTabChange?.(t)
    if (t === 'warp') setOrderType('warp')
    if (t === 'weft') setOrderType('weft')
    if (t === 'material') setOrderType('maint_material')
    if (t === 'repair') setOrderType('maint_repair')
  }

  const reload = useCallback(async () => {
    try {
      const [s, p, w, m, o, h] = await Promise.all([
        loadSuppliers(supabase),
        loadServiceProviders(supabase),
        loadWarpItems(supabase),
        loadMaintItems(supabase),
        loadOrders(supabase),
        loadAllHistory(supabase),
      ])
      setSuppliers(s)
      setProviders(p)
      setWarpItems(w)
      setMaintItems(m)
      setOrders(o)
      setAllHistory(h)
      setTablesReady(true)
      if (supplierId) {
        const cols = await loadWeftColours(supabase, supplierId)
        setWeftColours(cols)
      }
    } catch (e) {
      if (/relation .* does not exist/i.test(String(e))) {
        setTablesReady(false)
        setError('Order Entry tables not applied. Run public/migration-order-entry-module.sql in Supabase.')
      } else {
        setError(handleUserError('OrderEntry.load', e, 'Unable to load orders. Please try again.'))
      }
    }
  }, [supplierId])

  useEffect(() => {
    void reload()
  }, [reload])

  const supplier = useMemo(() => suppliers.find((s) => s.id === supplierId), [suppliers, supplierId])
  const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId])
  const totals = useMemo(() => calcOrderTotals(lines), [lines])

  useEffect(() => {
    if (supplier) {
      setContactPerson(supplier.contact_person || '')
      setWhatsapp(supplier.whatsapp || supplier.mobile || '')
      setWhatsappBiz(supplier.whatsapp_business || '')
    }
  }, [supplier])

  useEffect(() => {
    if (provider) {
      setContactPerson(provider.contact_person || '')
      setWhatsapp(provider.whatsapp || provider.mobile || '')
      setWhatsappBiz(provider.whatsapp_business || '')
    }
  }, [provider])

  function resetForm(type: OrderType) {
    setEditId(null)
    setOrderType(type)
    setOrderDate(todayISO())
    setSupplierId('')
    setSupplierName('')
    setProviderId('')
    setProviderName('')
    setContactPerson('')
    setWhatsapp('')
    setWhatsappBiz('')
    setDeliveryDate('')
    setDeliveryTimeline('± 2–5 Days')
    setDeliveryParty('JAISAL FASHIONWEAV INDUSTRIES')
    setDeliveryInstructions('')
    setRemarks('')
    setLines([emptyLine(type)])
    setWaMessage('')
    setOrderHistory([])
    setProblemDesc('')
    setMachineNo(MACHINES[0])
    setMachineName('')
    setRequestedDate(todayISO())
    setVisitDate('')
    setVisitTime('')
  }

  function updateLine(idx: number, patch: Partial<OrderEntryLine>) {
    setLines((prev) => {
      const next = [...prev]
      const merged = { ...next[idx], ...patch }
      const c = calcLineAmount(merged)
      next[idx] = { ...merged, gst_amount: c.gst_amount, amount: c.amount }
      return next
    })
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine(orderType), line_no: prev.length + 1 }])
  }

  function removeLine(idx: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  async function handleSave(status = 'Draft') {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let sid = supplierId || null
      let pid = providerId || null
      if (orderType !== 'maint_repair' && supplierName.trim()) {
        const s = await ensureSupplier(supabase, {
          supplier_name: supplierName.trim(),
          contact_person: contactPerson,
          whatsapp,
          whatsapp_business: whatsappBiz,
        }, userName)
        sid = s.id
        setSupplierId(s.id)
      }
      if (orderType === 'maint_repair' && providerName.trim()) {
        const p = await ensureServiceProvider(supabase, {
          company_name: providerName.trim(),
          contact_person: contactPerson,
          whatsapp,
          whatsapp_business: whatsappBiz,
        }, userName)
        pid = p.id
        setProviderId(p.id)
      }

      const order = await saveOrder(supabase, {
        id: editId || undefined,
        order_type: orderType,
        order_date: orderDate,
        status,
        supplier_id: sid,
        service_provider_id: pid,
        delivery_party: deliveryParty,
        delivery_date: deliveryDate || undefined,
        delivery_timeline: deliveryTimeline,
        delivery_instructions: deliveryInstructions,
        contact_person: contactPerson,
        whatsapp,
        whatsapp_business: whatsappBiz,
        remarks,
        machine_no: machineNo,
        machine_name: machineName || `Machine ${machineNo}`,
        department,
        problem_category: problemCategory,
        problem_description: problemDesc,
        urgency,
        requested_date: requestedDate,
        required_visit_date: visitDate || undefined,
        preferred_visit_time: visitTime,
        expected_completion: expectedCompletion || undefined,
        whatsapp_message: waMessage || undefined,
        lines,
        created_by: userName,
      })
      setEditId(order.id)
      setMessage(`${status === 'Draft' ? 'Draft saved' : 'Order saved'} · ${order.order_no}`)
      await reload()
      const hist = await loadOrderHistory(supabase, order.id)
      setOrderHistory(hist)
    } catch (e) {
      setError(handleUserError('OrderEntry.save', e, 'Save failed. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSendWhatsApp(business = false) {
    if (!editId) {
      await handleSave('Sent')
    }
    const order = orders.find((o) => o.id === editId) || {
      id: editId,
      order_no: 'DRAFT',
      order_type: orderType,
      order_date: orderDate,
      delivery_date: deliveryDate,
      delivery_timeline: deliveryTimeline,
      machine_no: machineNo,
      machine_name: machineName,
      problem_description: problemDesc,
      urgency,
      total_payable: totals.total_payable,
      status: 'Sent',
    } as OrderEntry
    const msg = waMessage || buildWhatsAppMessage(order, lines)
    setWaMessage(msg)
    const phone = business ? whatsappBiz || whatsapp : whatsapp
    if (phone) {
      shareWhatsAppToPhone(phone, msg, business)
    } else if (business) {
      shareWhatsAppBusiness(msg)
    } else {
      shareWhatsApp(msg)
    }
    if (editId) {
      await addHistory(supabase, editId, business ? 'WhatsApp Business Sent' : 'WhatsApp Sent', userName, 'WhatsApp', msg)
      await supabase.from('order_entries').update({ status: 'Sent', sent_by: userName }).eq('id', editId)
      await reload()
    }
    setMessage(business ? 'Opened WhatsApp Business' : 'Opened WhatsApp')
  }

  function handlePrint() {
    const order = {
      order_no: editId ? orders.find((o) => o.id === editId)?.order_no || 'DRAFT' : 'DRAFT',
      order_type: orderType,
      order_date: orderDate,
      delivery_date: deliveryDate,
      delivery_timeline: deliveryTimeline,
      delivery_party: deliveryParty,
      status: 'Draft',
      machine_no: machineNo,
      machine_name: machineName,
      problem_description: problemDesc,
      urgency,
      required_visit_date: visitDate,
      remarks,
      created_by: userName,
      ...totals,
    } as OrderEntry
    const name = orderType === 'maint_repair' ? providerName : supplierName
    printOrder(order, lines, name)
  }

  function loadOrderForEdit(o: OrderEntry) {
    setEditId(o.id)
    setOrderType(o.order_type as OrderType)
    setOrderDate(o.order_date)
    setSupplierId(o.supplier_id || '')
    setSupplierName(suppliers.find((s) => s.id === o.supplier_id)?.supplier_name || '')
    setProviderId(o.service_provider_id || '')
    setProviderName(providers.find((p) => p.id === o.service_provider_id)?.company_name || '')
    setContactPerson(o.contact_person || '')
    setWhatsapp(o.whatsapp || '')
    setWhatsappBiz(o.whatsapp_business || '')
    setDeliveryDate(o.delivery_date || '')
    setDeliveryTimeline(o.delivery_timeline || '± 2–5 Days')
    setDeliveryParty(o.delivery_party || '')
    setDeliveryInstructions(o.delivery_instructions || '')
    setRemarks(o.remarks || '')
    setMachineNo(o.machine_no || MACHINES[0])
    setMachineName(o.machine_name || '')
    setDepartment(o.department || '')
    setProblemCategory(o.problem_category || '')
    setProblemDesc(o.problem_description || '')
    setUrgency(o.urgency || '')
    setRequestedDate(o.requested_date || todayISO())
    setVisitDate(o.required_visit_date || '')
    setVisitTime(o.preferred_visit_time || '')
    setExpectedCompletion(o.expected_completion || '')
    setWaMessage(o.whatsapp_message || '')
    setLines(o.lines?.length ? o.lines : [emptyLine(o.order_type as OrderType)])
    const t = o.order_type as OrderType
    if (t === 'warp') selectTab('warp')
    else if (t === 'weft') selectTab('weft')
    else if (t === 'maint_material') selectTab('material')
    else selectTab('repair')
    void loadOrderHistory(supabase, o.id).then(setOrderHistory)
  }

  const scopedOrders = useMemo(() => {
    if (scope === 'yarn') return orders.filter((o) => o.order_type === 'warp' || o.order_type === 'weft')
    if (scope === 'maintenance')
      return orders.filter((o) => o.order_type === 'maint_material' || o.order_type === 'maint_repair')
    return orders
  }, [orders, scope])

  const filteredOrders = useMemo(() => {
    return scopedOrders.filter((o) => {
      if (listFilter.type && o.order_type !== listFilter.type) return false
      if (listFilter.status && o.status !== listFilter.status) return false
      if (listFilter.dateFrom && o.order_date < listFilter.dateFrom) return false
      if (listFilter.dateTo && o.order_date > listFilter.dateTo) return false
      if (listFilter.search) {
        const s = listFilter.search.toLowerCase()
        if (!o.order_no.toLowerCase().includes(s) && !(o.delivery_party || '').toLowerCase().includes(s)) return false
      }
      return true
    })
  }, [scopedOrders, listFilter])

  const pendingDeliveries = useMemo(
    () =>
      scopedOrders.filter((o) => ['Sent', 'Confirmed', 'Follow-up Required'].includes(o.status) && o.delivery_date),
    [scopedOrders],
  )

  const supplierOptions = suppliers.map((s) => s.supplier_name)
  const providerOptions = providers.map((p) => p.company_name)
  const warpItemOptions = warpItems.map((i) => i.item_name)
  const maintItemOptions = maintItems.map((i) => i.item_name)

  const allowedOrderTypes = useMemo(() => {
    if (scope === 'yarn') return ORDER_TYPES.filter((t) => t === 'warp' || t === 'weft')
    if (scope === 'maintenance') return ORDER_TYPES.filter((t) => t === 'maint_material' || t === 'maint_repair')
    return ORDER_TYPES
  }, [scope])

  function renderOrderForm() {
    const isRepair = orderType === 'maint_repair'
    return (
      <div className="oe-form-layout">
        <div className="oe-main">
          <div className="oe-quick-actions surface">
            {allowedOrderTypes.map((t) => (
              <button
                key={t}
                type="button"
                className={`btn-warp oe-quick-btn${orderType === t ? ' active' : ''}`}
                onClick={() => {
                  resetForm(t)
                  selectTab(t === 'warp' ? 'warp' : t === 'weft' ? 'weft' : t === 'maint_material' ? 'material' : 'repair')
                }}
              >
                + {ORDER_TYPE_LABELS[t].replace(' Order', '')}
              </button>
            ))}
          </div>

          <form className="oe-form surface" onSubmit={(e) => { e.preventDefault(); void handleSave('Draft') }}>
            <h2 className="oe-form-title">{ORDER_TYPE_LABELS[orderType]}</h2>

            <div className="oe-fields-grid">
              <label className="field">
                <span className="text-muted">Order Date</span>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
              </label>

              {isRepair ? (
                <YarnSearchSelect
                  label="Service Provider / Engineer"
                  required
                  value={providerName}
                  options={providerOptions}
                  onChange={(v) => {
                    setProviderName(v)
                    const p = providers.find((x) => x.company_name === v)
                    setProviderId(p?.id || '')
                  }}
                />
              ) : (
                <YarnSearchSelect
                  label="Supplier"
                  required
                  value={supplierName}
                  options={supplierOptions}
                  onChange={(v) => {
                    setSupplierName(v)
                    const s = suppliers.find((x) => x.supplier_name === v)
                    setSupplierId(s?.id || '')
                  }}
                />
              )}

              <label className="field">
                <span className="text-muted">Contact Person</span>
                <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
              </label>
              <label className="field">
                <span className="text-muted">WhatsApp Number</span>
                <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" />
              </label>
              <label className="field">
                <span className="text-muted">WhatsApp Business</span>
                <input value={whatsappBiz} onChange={(e) => setWhatsappBiz(e.target.value)} inputMode="tel" />
              </label>

              {!isRepair ? (
                <>
                  <label className="field">
                    <span className="text-muted">Delivery Date</span>
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="text-muted">Delivery Timeline</span>
                    <select value={deliveryTimeline} onChange={(e) => setDeliveryTimeline(e.target.value)}>
                      {DELIVERY_TIMELINES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="text-muted">Delivery To / Party</span>
                    <input value={deliveryParty} onChange={(e) => setDeliveryParty(e.target.value)} />
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    <span className="text-muted">Machine No.</span>
                    <select value={machineNo} onChange={(e) => setMachineNo(e.target.value)}>
                      {MACHINES.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="OTR">Others</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="text-muted">Machine Name</span>
                    <input value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="e.g. Rapier Loom No. 05" />
                  </label>
                  <label className="field">
                    <span className="text-muted">Department</span>
                    <input value={department} onChange={(e) => setDepartment(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="text-muted">Problem Category</span>
                    <select value={problemCategory} onChange={(e) => setProblemCategory(e.target.value)}>
                      {['Electrical', 'Mechanical', 'Electronic', 'Pneumatic', 'Other'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="text-muted">Urgency</span>
                    <select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                      <option value="URGENT">URGENT</option>
                      <option value="Normal">Normal</option>
                      <option value="Low">Low</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="text-muted">Required Visit Date</span>
                    <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
                  </label>
                  <label className="field">
                    <span className="text-muted">Preferred Visit Time</span>
                    <input value={visitTime} onChange={(e) => setVisitTime(e.target.value)} placeholder="e.g. 10:00 AM" />
                  </label>
                </>
              )}
            </div>

            {isRepair ? (
              <label className="field oe-full">
                <span className="text-muted">Problem Description</span>
                <textarea rows={4} value={problemDesc} onChange={(e) => setProblemDesc(e.target.value)} required placeholder="Describe the machine problem…" />
              </label>
            ) : (
              <>
                <label className="field oe-full">
                  <span className="text-muted">Delivery Instructions</span>
                  <textarea rows={2} value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} />
                </label>

                <h3 className="oe-section-title">Order Items</h3>
                <div className="oe-lines">
                  {lines.map((line, idx) => (
                    <article key={idx} className="oe-line-card">
                      <div className="oe-line-header">
                        <strong>#{idx + 1}</strong>
                        {lines.length > 1 ? (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => removeLine(idx)}>Remove</button>
                        ) : null}
                      </div>
                      <div className="oe-line-grid">
                        {orderType === 'weft' ? (
                          <>
                            <YarnSearchSelect
                              label="Colour Name"
                              required
                              value={line.colour_name}
                              options={weftColours.map((c) => c.colour_name)}
                              onChange={(v) => {
                                const c = weftColours.find((x) => x.colour_name === v)
                                updateLine(idx, {
                                  colour_name: v,
                                  supplier_colour_no: c?.supplier_colour_no || line.supplier_colour_no,
                                  internal_colour_no: c?.internal_colour_no || '',
                                  item_name: c?.yarn_quality || line.item_name,
                                  denier: c?.denier || line.denier,
                                  rate: c?.last_rate || line.rate,
                                })
                              }}
                            />
                            <label className="field">
                              <span className="text-muted">Supplier Colour No.</span>
                              <input value={line.supplier_colour_no} onChange={(e) => updateLine(idx, { supplier_colour_no: e.target.value })} />
                            </label>
                            <YarnSearchSelect
                              label="Yarn Item / Quality"
                              value={line.item_name}
                              options={warpItemOptions}
                              onChange={(v) => updateLine(idx, { item_name: v })}
                            />
                          </>
                        ) : orderType === 'maint_material' ? (
                          <>
                            <YarnSearchSelect
                              label="Item Name"
                              required
                              value={line.item_name}
                              options={maintItemOptions}
                              onChange={(v) => {
                                const it = maintItems.find((x) => x.item_name === v)
                                updateLine(idx, {
                                  item_name: v,
                                  item_code: it?.item_code || '',
                                  specification: it?.specification || '',
                                  unit: it?.unit || 'Pcs',
                                  rate: it?.last_rate || line.rate,
                                })
                              }}
                            />
                            <label className="field">
                              <span className="text-muted">Item Code</span>
                              <input value={line.item_code} onChange={(e) => updateLine(idx, { item_code: e.target.value })} />
                            </label>
                            <label className="field">
                              <span className="text-muted">Specification</span>
                              <input value={line.specification} onChange={(e) => updateLine(idx, { specification: e.target.value })} />
                            </label>
                            <label className="field">
                              <span className="text-muted">Unit</span>
                              <input value={line.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })} />
                            </label>
                          </>
                        ) : (
                          <>
                            <YarnSearchSelect
                              label="Item / Yarn Name"
                              required
                              value={line.item_name}
                              options={warpItemOptions}
                              onChange={(v) => {
                                const it = warpItems.find((x) => x.item_name === v)
                                updateLine(idx, {
                                  item_name: v,
                                  denier: it?.denier || line.denier,
                                  quality_type: it?.quality_type || line.quality_type,
                                  rate: it?.last_rate || line.rate,
                                })
                              }}
                            />
                            <label className="field">
                              <span className="text-muted">Denier</span>
                              <input value={line.denier} onChange={(e) => updateLine(idx, { denier: e.target.value })} />
                            </label>
                            <label className="field">
                              <span className="text-muted">Quality / Type</span>
                              <input value={line.quality_type} onChange={(e) => updateLine(idx, { quality_type: e.target.value })} />
                            </label>
                          </>
                        )}
                        <label className="field">
                          <span className="text-muted">Rate (₹)</span>
                          <input type="number" step="0.01" value={line.rate || ''} onChange={(e) => updateLine(idx, { rate: Number(e.target.value) })} />
                        </label>
                        <label className="field">
                          <span className="text-muted">Qty</span>
                          <input type="number" step="0.01" value={line.quantity || ''} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} />
                        </label>
                        <label className="field">
                          <span className="text-muted">GST %</span>
                          <input type="number" step="0.01" value={line.gst_pct} onChange={(e) => updateLine(idx, { gst_pct: Number(e.target.value) })} />
                        </label>
                        <label className="field">
                          <span className="text-muted">Freight (₹)</span>
                          <input type="number" step="0.01" value={line.freight || ''} onChange={(e) => updateLine(idx, { freight: Number(e.target.value) })} />
                        </label>
                        <label className="field">
                          <span className="text-muted">Other Charges</span>
                          <input type="number" step="0.01" value={line.other_charges || ''} onChange={(e) => updateLine(idx, { other_charges: Number(e.target.value) })} />
                        </label>
                        <div className="oe-line-amount">
                          <span className="text-muted">Amount</span>
                          <strong>₹{line.amount.toLocaleString('en-IN')}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <button type="button" className="btn-ghost oe-add-line" onClick={addLine}>+ Add Item</button>

                <div className="oe-totals">
                  <div><span>Total Qty</span><strong>{totals.total_qty}</strong></div>
                  <div><span>Basic Amount</span><strong>₹{totals.total_basic.toLocaleString('en-IN')}</strong></div>
                  <div><span>GST</span><strong>₹{totals.total_gst.toLocaleString('en-IN')}</strong></div>
                  <div><span>Freight</span><strong>₹{totals.total_freight.toLocaleString('en-IN')}</strong></div>
                  <div className="oe-total-payable"><span>Total Payable</span><strong>₹{totals.total_payable.toLocaleString('en-IN')}</strong></div>
                </div>
              </>
            )}

            <label className="field oe-full">
              <span className="text-muted">Remarks</span>
              <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </label>

            <label className="field oe-full">
              <span className="text-muted">WhatsApp Message (editable)</span>
              <textarea rows={6} value={waMessage} onChange={(e) => setWaMessage(e.target.value)} placeholder="Auto-generated on send…" />
            </label>

            <div className="oe-actions">
              <button type="button" className="btn-ghost" onClick={handlePrint}>Preview / Print</button>
              <button type="submit" className="btn-ghost" disabled={busy || !tablesReady}>Save Draft</button>
              <button type="button" className="btn-warp" disabled={busy || !tablesReady} onClick={() => void handleSave('Sent')}>Save Order</button>
              <button type="button" className="btn-wa" disabled={busy} onClick={() => void handleSendWhatsApp(false)}>
                Send on WhatsApp
              </button>
              <button type="button" className="btn-wa-biz" disabled={busy} onClick={() => void handleSendWhatsApp(true)}>
                Send WhatsApp Business
              </button>
            </div>
          </form>

          {orderHistory.length ? (
            <section className="surface oe-history-section">
              <h3 className="section-title">Communication History</h3>
              <div className="oe-history-list">
                {orderHistory.map((h) => (
                  <article key={h.id} className="oe-history-item">
                    <time>{new Date(h.activity_at).toLocaleString('en-IN')}</time>
                    <strong>{h.activity}</strong>
                    <span>{h.person} · {h.communication_mode || '—'}</span>
                    {h.message ? <p>{h.message.slice(0, 200)}{h.message.length > 200 ? '…' : ''}</p> : null}
                    {h.response ? <p className="oe-response">Reply: {h.response}</p> : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="oe-side">
          {supplier && !isRepair ? (
            <article className="surface oe-side-panel">
              <h3 className="section-title">Supplier Quick Info</h3>
              <p><strong>{supplier.supplier_name}</strong></p>
              <p>{supplier.contact_person || '—'}</p>
              <p>{supplier.whatsapp || supplier.mobile || '—'}</p>
              <p className="text-muted">{supplier.address || '—'}</p>
            </article>
          ) : null}
          {provider && isRepair ? (
            <article className="surface oe-side-panel">
              <h3 className="section-title">Service Provider</h3>
              <p><strong>{provider.company_name}</strong></p>
              <p>{provider.contact_person || '—'}</p>
              <p>{provider.whatsapp || provider.mobile || '—'}</p>
              <p className="text-muted">{provider.specialization || '—'}</p>
            </article>
          ) : null}
          <article className="surface oe-side-panel">
            <h3 className="section-title">Order Summary</h3>
            <p>Items: {lines.filter((l) => l.item_name || l.colour_name).length}</p>
            <p>Total: <strong>₹{totals.total_payable.toLocaleString('en-IN')}</strong></p>
            <p>Status: {editId ? orders.find((o) => o.id === editId)?.status || 'Draft' : 'New'}</p>
          </article>
          <article className="surface oe-side-panel">
            <h3 className="section-title">Recent Orders</h3>
            <div className="oe-recent-list">
              {orders.slice(0, 8).map((o) => (
                <button key={o.id} type="button" className="oe-recent-item" onClick={() => loadOrderForEdit(o)}>
                  <strong>{o.order_no}</strong>
                  <span>{ORDER_TYPE_LABELS[o.order_type as OrderType]?.split(' ')[0] || o.order_type}</span>
                  <span className={`oe-status oe-status-${o.status.toLowerCase().replace(/\s/g, '-')}`}>{o.status}</span>
                </button>
              ))}
            </div>
          </article>
        </aside>
      </div>
    )
  }

  return (
    <div className="screen oe-screen">
      <header className="screen-header">
        <div>
          <p className="yarn-crumb">Orders · <strong>Order Entry</strong></p>
          <h1>Order Entry</h1>
          <p className="text-muted">Warp · Weft · Maintenance Material · Repair / Service</p>
        </div>
      </header>

      <SubTabs options={TABS} value={tab} onChange={(id) => selectTab(id as TabId)} />

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      {['warp', 'weft', 'material', 'repair'].includes(tab) ? renderOrderForm() : null}

      {tab === 'list' ? (
        <section className="oe-list-section">
          <div className="oe-filters surface">
            <input placeholder="Search order no…" value={listFilter.search} onChange={(e) => setListFilter((f) => ({ ...f, search: e.target.value }))} />
            <select value={listFilter.type} onChange={(e) => setListFilter((f) => ({ ...f, type: e.target.value }))}>
              <option value="">All Types</option>
              {ORDER_TYPES.map((t) => <option key={t} value={t}>{ORDER_TYPE_LABELS[t]}</option>)}
            </select>
            <input type="date" value={listFilter.dateFrom} onChange={(e) => setListFilter((f) => ({ ...f, dateFrom: e.target.value }))} />
            <input type="date" value={listFilter.dateTo} onChange={(e) => setListFilter((f) => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <div className="oe-table-wrap surface">
            <table className="oe-table oe-table-desktop">
              <thead>
                <tr>
                  <th>Order No.</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Delivery</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((o) => (
                  <tr key={o.id}>
                    <td><strong>{o.order_no}</strong></td>
                    <td>{ORDER_TYPE_LABELS[o.order_type as OrderType] || o.order_type}</td>
                    <td>{o.order_date}</td>
                    <td><span className={`oe-status oe-status-${o.status.toLowerCase().replace(/\s/g, '-')}`}>{o.status}</span></td>
                    <td className="num">₹{Number(o.total_payable).toLocaleString('en-IN')}</td>
                    <td>{o.delivery_date || '—'}</td>
                    <td><button type="button" className="btn-ghost btn-sm" onClick={() => loadOrderForEdit(o)}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="oe-cards-mobile">
              {filteredOrders.map((o) => (
                <article key={o.id} className="oe-order-card" onClick={() => loadOrderForEdit(o)}>
                  <strong>{o.order_no}</strong>
                  <span>{ORDER_TYPE_LABELS[o.order_type as OrderType]}</span>
                  <span>{o.order_date}</span>
                  <span className={`oe-status oe-status-${o.status.toLowerCase().replace(/\s/g, '-')}`}>{o.status}</span>
                  <strong>₹{Number(o.total_payable).toLocaleString('en-IN')}</strong>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="surface oe-history-section">
          <h3 className="section-title">Order Communication History</h3>
          <div className="oe-history-list">
            {allHistory.map((h) => (
              <article key={h.id} className="oe-history-item">
                <time>{new Date(h.activity_at).toLocaleString('en-IN')}</time>
                <strong>{h.order_no} — {h.activity}</strong>
                <span>{h.person} · {h.communication_mode || '—'}</span>
                {h.message ? <p>{h.message.slice(0, 150)}…</p> : null}
              </article>
            ))}
            {!allHistory.length ? <p className="text-muted">No history yet</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'delivery' ? (
        <section className="oe-list-section">
          <h3 className="section-title">Pending Deliveries & Follow-up</h3>
          <div className="oe-cards-mobile">
            {pendingDeliveries.map((o) => (
              <article key={o.id} className="oe-order-card" onClick={() => loadOrderForEdit(o)}>
                <strong>{o.order_no}</strong>
                <span>Delivery: {o.delivery_date}</span>
                <span className={`oe-status oe-status-${o.status.toLowerCase().replace(/\s/g, '-')}`}>{o.status}</span>
                <button type="button" className="btn-warp btn-sm" onClick={(e) => { e.stopPropagation(); loadOrderForEdit(o); void handleSendWhatsApp() }}>Follow-up</button>
              </article>
            ))}
            {!pendingDeliveries.length ? <p className="text-muted">No pending deliveries</p> : null}
          </div>
        </section>
      ) : null}

      {tab === 'reports' ? (
        <section className="oe-list-section">
          <h3 className="section-title">Order Reports</h3>
          <div className="oe-report-grid">
            {[
              { label: 'All Orders', count: scopedOrders.length },
              { label: 'Warp Orders', count: scopedOrders.filter((o) => o.order_type === 'warp').length },
              { label: 'Weft Orders', count: scopedOrders.filter((o) => o.order_type === 'weft').length },
              { label: 'Material Orders', count: scopedOrders.filter((o) => o.order_type === 'maint_material').length },
              { label: 'Repair Orders', count: scopedOrders.filter((o) => o.order_type === 'maint_repair').length },
              {
                label: 'Pending',
                count: scopedOrders.filter((o) =>
                  ['Sent', 'Waiting for Reply', 'Follow-up Required'].includes(o.status),
                ).length,
              },
              { label: 'Confirmed', count: scopedOrders.filter((o) => o.status === 'Confirmed').length },
              { label: 'Completed', count: scopedOrders.filter((o) => o.status === 'Completed').length },
            ].map((r) => (
              <article key={r.label} className="oe-report-card surface">
                <span>{r.label}</span>
                <strong>{r.count}</strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
