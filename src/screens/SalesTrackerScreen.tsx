import { useCallback, useEffect, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { CTR_COLOUR_NAMES } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'
import { PhotoCatalogueScreen, type PhotoCatalogueRow } from './PhotoCatalogueScreen'

type TabId = 'visits' | 'orders'

const ITEM_TYPES = [
  'Garment',
  'Curtain Jute Panel',
  'Curtain Bright',
  'Curtain Allover Basic',
  'Curtain Allover Premium',
  'Other',
] as const

type Visit = {
  id: string
  customer_name: string
  contact_number: string | null
  visit_date: string
  next_visit_plan: string | null
  notes: string | null
  entered_by: string
  created_at: string
}

type SalesOrder = {
  id: string
  customer_name: string
  item_type: string
  quantity_rolls: number
  colour_option: string | null
  order_date: string
  status: 'pending' | 'confirmed' | 'dispatched'
  linked_sample_card_id: string | null
  catalogue_photo_id: string | null
  catalogue_photo_url: string | null
  entered_by: string | null
  created_at: string
}

type SampleOpt = { id: string; din_number: string | null; job_card_ref: string | null }

export function SalesTrackerScreen() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>('visits')
  const [visits, setVisits] = useState<Visit[]>([])
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [samples, setSamples] = useState<SampleOpt[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pickPhoto, setPickPhoto] = useState(false)

  const [customerName, setCustomerName] = useState('')
  const [contact, setContact] = useState('')
  const [visitDate, setVisitDate] = useState(todayISO())
  const [nextVisit, setNextVisit] = useState('')
  const [notes, setNotes] = useState('')

  const [orderCustomer, setOrderCustomer] = useState('')
  const [itemType, setItemType] = useState<(typeof ITEM_TYPES)[number]>('Garment')
  const [qty, setQty] = useState('')
  const [colourOpt, setColourOpt] = useState<string>(CTR_COLOUR_NAMES[0])
  const [orderDate, setOrderDate] = useState(todayISO())
  const [sampleId, setSampleId] = useState('')
  const [photo, setPhoto] = useState<PhotoCatalogueRow | null>(null)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const loadVisits = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('customer_visits')
      .select('*')
      .order('visit_date', { ascending: false })
      .limit(80)
    if (err) throw err
    setVisits((data as Visit[]) ?? [])
  }, [])

  const loadOrders = useCallback(async () => {
    const [{ data, error: err }, { data: samp }] = await Promise.all([
      supabase.from('sales_orders').select('*').order('order_date', { ascending: false }).limit(80),
      supabase
        .from('sample_program_cards')
        .select('id, din_number, job_card_ref')
        .order('created_at', { ascending: false })
        .limit(40),
    ])
    if (err) throw err
    setOrders((data as SalesOrder[]) ?? [])
    setSamples((samp as SampleOpt[]) ?? [])
  }, [])

  useEffect(() => {
    if (tab === 'visits') void loadVisits().catch((e: Error) => setError(e.message))
    if (tab === 'orders') void loadOrders().catch((e: Error) => setError(e.message))
  }, [tab, loadVisits, loadOrders])

  async function saveVisit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: iErr } = await supabase.from('customer_visits').insert({
        customer_name: customerName.trim(),
        contact_number: contact.trim() || null,
        visit_date: visitDate,
        next_visit_plan: nextVisit || null,
        notes: notes.trim() || null,
        entered_by: enteredBy,
      })
      if (iErr) throw iErr
      setMessage('Visit saved')
      setCustomerName('')
      setContact('')
      setNotes('')
      setNextVisit('')
      await loadVisits()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveOrder(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: iErr } = await supabase.from('sales_orders').insert({
        customer_name: orderCustomer.trim(),
        item_type: itemType,
        quantity_rolls: Number(qty) || 0,
        colour_option: colourOpt || null,
        order_date: orderDate,
        status: 'pending',
        linked_sample_card_id: sampleId || null,
        catalogue_photo_id: photo?.id || null,
        catalogue_photo_url: photo?.image_url || null,
        entered_by: enteredBy,
      })
      if (iErr) throw iErr
      setMessage('Sales order saved')
      setOrderCustomer('')
      setQty('')
      setSampleId('')
      setPhoto(null)
      await loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(row: SalesOrder, status: SalesOrder['status']) {
    setBusy(true)
    try {
      const { error: uErr } = await supabase.from('sales_orders').update({ status }).eq('id', row.id)
      if (uErr) throw uErr
      await loadOrders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (pickPhoto) {
    return (
      <div className="screen">
        <button type="button" className="btn-ghost" onClick={() => setPickPhoto(false)}>
          ← Back to order
        </button>
        <PhotoCatalogueScreen
          pickMode
          onPick={(row) => {
            setPhoto(row)
            setPickPhoto(false)
            setMessage(`Photo selected · ${row.category}`)
          }}
        />
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Sales Tracker</h1>
        <p className="text-muted">Customer visits · sales orders</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'visits', label: 'Visits' },
            { id: 'orders', label: 'Orders' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'visits' ? (
        <>
          <form className="form-stack" onSubmit={(e) => void saveVisit(e)}>
            <label className="field">
              <span>Customer name</span>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Contact number</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} inputMode="tel" />
            </label>
            <label className="field">
              <span>Visit date</span>
              <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
            </label>
            <label className="field">
              <span>Next visit plan</span>
              <input type="date" value={nextVisit} onChange={(e) => setNextVisit(e.target.value)} />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save visit'}
            </button>
          </form>
          <div className="list" style={{ marginTop: 16 }}>
            {visits.map((v) => (
              <article key={v.id} className="card-row surface">
                <div>
                  <strong>
                    {v.visit_date} · {v.customer_name}
                  </strong>
                  <div className="text-muted">
                    {v.contact_number || '—'}
                    {v.next_visit_plan ? ` · Next ${v.next_visit_plan}` : ''}
                  </div>
                  <div className="text-muted2">{v.notes || '—'}</div>
                </div>
              </article>
            ))}
            {!visits.length ? <p className="text-muted">No visits yet</p> : null}
          </div>
        </>
      ) : null}

      {tab === 'orders' ? (
        <>
          <form className="form-stack" onSubmit={(e) => void saveOrder(e)}>
            <label className="field">
              <span>Customer name</span>
              <input value={orderCustomer} onChange={(e) => setOrderCustomer(e.target.value)} required />
            </label>
            <label className="field">
              <span>Item type</span>
              <select value={itemType} onChange={(e) => setItemType(e.target.value as (typeof ITEM_TYPES)[number])}>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Quantity (rolls)</span>
              <input className="num" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="field">
              <span>Colour option</span>
              <select value={colourOpt} onChange={(e) => setColourOpt(e.target.value)}>
                {CTR_COLOUR_NAMES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Order date</span>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
            </label>
            <label className="field">
              <span>Linked sample card (optional)</span>
              <select value={sampleId} onChange={(e) => setSampleId(e.target.value)}>
                <option value="">—</option>
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.job_card_ref || s.id.slice(0, 8)} · {s.din_number || '—'}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Photo Catalogue</span>
              {photo ? (
                <div className="card-row surface row-top">
                  <img
                    src={photo.thumbnail_url || photo.image_url}
                    alt=""
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }}
                  />
                  <div>
                    {photo.category} · {photo.design_number || '—'}
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => setPhoto(null)}>
                    Clear
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setPickPhoto(true)}>
                  Select from Photo Catalogue
                </button>
              )}
            </div>
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save order'}
            </button>
          </form>
          <div className="list" style={{ marginTop: 16 }}>
            {orders.map((o) => (
              <article key={o.id} className="card-row surface row-top">
                <div>
                  <strong>
                    {o.order_date} · {o.customer_name} · {o.status}
                  </strong>
                  <div className="text-muted">
                    {o.item_type} · {o.quantity_rolls} rolls · {o.colour_option || '—'}
                  </div>
                  {o.catalogue_photo_url ? (
                    <img
                      src={o.catalogue_photo_url}
                      alt=""
                      loading="lazy"
                      style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, marginTop: 6 }}
                    />
                  ) : null}
                </div>
                <div className="icon-actions">
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void setStatus(o, 'confirmed')}>
                    Confirm
                  </button>
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void setStatus(o, 'dispatched')}>
                    Dispatch
                  </button>
                </div>
              </article>
            ))}
            {!orders.length ? <p className="text-muted">No sales orders yet</p> : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
