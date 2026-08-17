import { useCallback, useEffect, useMemo, useState } from 'react'
import { InputModePanel } from '../components/InputModePanel'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { RepairingTracker } from '../lib/database.types'
import { applyOrQueue, todayISO, uploadPurchasePhoto } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type Sub = 'general' | 'weft' | 'maint_in' | 'repair_inv' | 'report'
type Mode = 'scan' | 'manual' | 'photo'
type Props = { initialSub?: string }

const GST_OPTIONS = [0, 5, 12, 18] as const
const MANUAL_PHOTO: Mode[] = ['manual', 'photo']

type GenItem = {
  key: string
  item_name: string
  pieces: string
  weight_kg: string
  rate: string
  billing_mode: 'weight' | 'piece'
}

type WeftItem = { key: string; quality: string; weight_kg: string; rate: string }
type MaintItem = { key: string; item_name: string; qty: string; rate: string }

type ReportRow = {
  id: string
  type: 'General' | 'Weft' | 'Maint In' | 'Repair Inv'
  date: string
  party: string
  docNo: string
  grandTotal: number
  created_at: string
  detail: Record<string, unknown>
}

function n(v: string) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function money(v: number) {
  return v.toFixed(2)
}

function genAmount(row: GenItem) {
  return row.billing_mode === 'piece' ? n(row.pieces) * n(row.rate) : n(row.weight_kg) * n(row.rate)
}

function emptyGen(): GenItem {
  return {
    key: crypto.randomUUID(),
    item_name: '',
    pieces: '',
    weight_kg: '',
    rate: '',
    billing_mode: 'weight',
  }
}

function emptyWeft(): WeftItem {
  return { key: crypto.randomUUID(), quality: '', weight_kg: '', rate: '' }
}

function emptyMaint(): MaintItem {
  return { key: crypto.randomUUID(), item_name: '', qty: '', rate: '' }
}

function TotalsBlock({
  subtotal,
  gstPct,
  grand,
}: {
  subtotal: number
  gstPct: number
  grand: number
}) {
  const gstAmt = subtotal * (gstPct / 100)
  return (
    <div className="form-stack surface2 card-row">
      <label className="field">
        <span className="text-muted">Subtotal</span>
        <input className="num readonly" value={money(subtotal)} readOnly />
      </label>
      <label className="field">
        <span className="text-muted">GST amount</span>
        <input className="num readonly" value={money(gstAmt)} readOnly />
      </label>
      <label className="field">
        <span className="text-muted">Grand Total</span>
        <input className="num readonly text-weft" value={money(grand)} readOnly />
      </label>
    </div>
  )
}

export function PurchaseScreen({ initialSub }: Props) {
  const { isCeo, profile } = useAuth()
  const resolvedInitial: Sub =
    initialSub === 'general' ||
    initialSub === 'weft' ||
    initialSub === 'maint_in' ||
    initialSub === 'repair_inv' ||
    initialSub === 'report'
      ? initialSub
      : initialSub === 'warp' || initialSub === 'beam_out' || initialSub === 'beam_in'
        ? 'general'
        : 'general'

  const [sub, setSub] = useState<Sub>(resolvedInitial)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Shared mode / photo
  const [mode, setMode] = useState<Mode>('manual')
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  // General
  const [gDate, setGDate] = useState(todayISO())
  const [gParty, setGParty] = useState('')
  const [gChallan, setGChallan] = useState('')
  const [gGst, setGGst] = useState(0)
  const [gItems, setGItems] = useState<GenItem[]>([emptyGen()])

  // Weft
  const [wDate, setWDate] = useState(todayISO())
  const [wParty, setWParty] = useState('')
  const [wChallan, setWChallan] = useState('')
  const [wGst, setWGst] = useState(0)
  const [wItems, setWItems] = useState<WeftItem[]>([emptyWeft()])

  // Maintenance inward
  const [mDate, setMDate] = useState(todayISO())
  const [mParty, setMParty] = useState('')
  const [mChallan, setMChallan] = useState('')
  const [mGst, setMGst] = useState(0)
  const [mItems, setMItems] = useState<MaintItem[]>([emptyMaint()])

  // Repair invoice
  const [rDate, setRDate] = useState(todayISO())
  const [rVendor, setRVendor] = useState('')
  const [rInvoice, setRInvoice] = useState('')
  const [rTrackerId, setRTrackerId] = useState('')
  const [rCost, setRCost] = useState('')
  const [rGst, setRGst] = useState(0)
  const [trackers, setTrackers] = useState<RepairingTracker[]>([])

  // Report
  const [reportRows, setReportRows] = useState<ReportRow[]>([])
  const [filterType, setFilterType] = useState<'all' | ReportRow['type']>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [detail, setDetail] = useState<ReportRow | null>(null)

  const gSubtotal = useMemo(() => gItems.reduce((s, r) => s + genAmount(r), 0), [gItems])
  const gGrand = useMemo(() => gSubtotal * (1 + gGst / 100), [gSubtotal, gGst])

  const wSubtotal = useMemo(
    () => wItems.reduce((s, r) => s + n(r.weight_kg) * n(r.rate), 0),
    [wItems],
  )
  const wGrand = useMemo(() => wSubtotal * (1 + wGst / 100), [wSubtotal, wGst])

  const mSubtotal = useMemo(
    () => mItems.reduce((s, r) => s + n(r.qty) * n(r.rate), 0),
    [mItems],
  )
  const mGrand = useMemo(() => mSubtotal * (1 + mGst / 100), [mSubtotal, mGst])

  const rGrand = useMemo(() => n(rCost) * (1 + rGst / 100), [rCost, rGst])

  const gCanSave =
    !!gDate && gParty.trim().length > 0 && gItems.some((r) => r.item_name.trim() && genAmount(r) > 0)
  const wCanSave =
    !!wDate && wParty.trim().length > 0 && wItems.some((r) => r.quality.trim() && n(r.weight_kg) > 0)
  const mCanSave =
    !!mDate && mParty.trim().length > 0 && mItems.some((r) => r.item_name.trim() && n(r.qty) > 0)
  const rCanSave = !!rDate && rVendor.trim().length > 0 && n(rCost) > 0

  const loadTrackers = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('repairing_tracker')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) throw err
    setTrackers((data as RepairingTracker[]) ?? [])
  }, [])

  const loadReport = useCallback(async () => {
    const [g, w, m, r] = await Promise.all([
      supabase
        .from('general_purchases')
        .select('*, general_purchase_items(*)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('weft_purchases')
        .select('*, weft_purchase_items(*)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('maintenance_inward')
        .select('*, maintenance_inward_items(*)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('maintenance_repair_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])
    if (g.error) throw g.error
    if (w.error) throw w.error
    if (m.error) throw m.error
    if (r.error) throw r.error

    const rows: ReportRow[] = [
      ...(g.data ?? []).map((row) => ({
        id: row.id as string,
        type: 'General' as const,
        date: String(row.purchase_date || '').slice(0, 10),
        party: String(row.party_name || '—'),
        docNo: String(row.challan_no || '—'),
        grandTotal: Number(row.grand_total || 0),
        created_at: String(row.created_at),
        detail: row as Record<string, unknown>,
      })),
      ...(w.data ?? []).map((row) => ({
        id: row.id as string,
        type: 'Weft' as const,
        date: String(row.purchase_date || row.created_at || '').slice(0, 10),
        party: String(row.party_name || row.supplier || '—'),
        docNo: String(row.challan_no || '—'),
        grandTotal: Number(row.grand_total || 0),
        created_at: String(row.created_at),
        detail: row as Record<string, unknown>,
      })),
      ...(m.data ?? []).map((row) => ({
        id: row.id as string,
        type: 'Maint In' as const,
        date: String(row.inward_date || '').slice(0, 10),
        party: String(row.party_name || '—'),
        docNo: String(row.challan_no || '—'),
        grandTotal: Number(row.grand_total || 0),
        created_at: String(row.created_at),
        detail: row as Record<string, unknown>,
      })),
      ...(r.data ?? []).map((row) => ({
        id: row.id as string,
        type: 'Repair Inv' as const,
        date: String(row.invoice_date || '').slice(0, 10),
        party: String(row.vendor_name || '—'),
        docNo: String(row.invoice_no || '—'),
        grandTotal: Number(row.grand_total || 0),
        created_at: String(row.created_at),
        detail: row as Record<string, unknown>,
      })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

    setReportRows(rows)
  }, [])

  useEffect(() => {
    if (initialSub) {
      const next =
        initialSub === 'general' ||
        initialSub === 'weft' ||
        initialSub === 'maint_in' ||
        initialSub === 'repair_inv' ||
        initialSub === 'report'
          ? initialSub
          : 'general'
      setSub(next)
    }
  }, [initialSub])

  useEffect(() => {
    if (sub === 'repair_inv') void loadTrackers().catch((e: Error) => setError(e.message))
    if (sub === 'report') void loadReport().catch((e: Error) => setError(e.message))
  }, [sub, loadTrackers, loadReport])

  async function maybePhoto(folder: string) {
    if (mode === 'photo' && photoFile) return uploadPurchasePhoto(photoFile, folder)
    return null
  }

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !gCanSave) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const photo_url = await maybePhoto('general')
      const items = gItems
        .filter((r) => r.item_name.trim())
        .map((r) => ({
          item_name: r.item_name.trim(),
          pieces: n(r.pieces),
          weight_kg: n(r.weight_kg),
          rate: n(r.rate),
          billing_mode: r.billing_mode,
        }))
      const header = {
        purchase_date: gDate,
        party_name: gParty.trim(),
        challan_no: gChallan.trim() || null,
        gst_pct: gGst,
        subtotal: gSubtotal,
        grand_total: gGrand,
        photo_url,
        input_mode: mode,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'general_purchases',
        action: 'insert',
        recordId: null,
        payload: { ...header, items },
        apply: async () => {
          const { data, error: iErr } = await supabase
            .from('general_purchases')
            .insert(header)
            .select('id')
            .single()
          if (iErr) throw iErr
          const { error: itemsErr } = await supabase.from('general_purchase_items').insert(
            items.map((it) => ({ purchase_id: data.id, ...it })),
          )
          if (itemsErr) throw itemsErr
        },
      })
      setMessage(result === 'applied' ? 'General purchase saved' : 'Sent to approval queue')
      setGParty('')
      setGChallan('')
      setGItems([emptyGen()])
      setPhotoFile(null)
      if (sub === 'report') await loadReport()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveWeft(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !wCanSave) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const photo_url = await maybePhoto('weft')
      const items = wItems
        .filter((r) => r.quality.trim())
        .map((r) => ({
          quality: r.quality.trim(),
          weight_kg: n(r.weight_kg),
          rate: n(r.rate),
        }))
      const first = items[0]
      const header = {
        quality: first?.quality || 'multi',
        weight_kg: items.reduce((s, r) => s + r.weight_kg, 0),
        rate: first?.rate || 0,
        supplier: wParty.trim() || null,
        party_name: wParty.trim(),
        challan_no: wChallan.trim() || null,
        gst_pct: wGst,
        subtotal: wSubtotal,
        grand_total: wGrand,
        purchase_date: wDate,
        input_mode: mode,
        photo_url,
        barcode: null as string | null,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'weft_purchases',
        action: 'insert',
        recordId: null,
        payload: { ...header, items },
        apply: async () => {
          const { data, error: iErr } = await supabase
            .from('weft_purchases')
            .insert(header)
            .select('id')
            .single()
          if (iErr) throw iErr
          const { error: itemsErr } = await supabase.from('weft_purchase_items').insert(
            items.map((it) => ({ purchase_id: data.id, ...it })),
          )
          if (itemsErr) throw itemsErr

          for (const it of items) {
            const { data: existing } = await supabase
              .from('weft_yarn_stock')
              .select('*')
              .eq('supplier', wParty.trim())
              .eq('colour_name', it.quality)
              .maybeSingle()
            if (existing) {
              const { error: uErr } = await supabase
                .from('weft_yarn_stock')
                .update({
                  stock_kg: Number(existing.stock_kg) + it.weight_kg,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
              if (uErr) throw uErr
            } else {
              const { error: sErr } = await supabase.from('weft_yarn_stock').insert({
                supplier: wParty.trim() || null,
                colour_name: it.quality,
                stock_kg: it.weight_kg,
              })
              if (sErr) throw sErr
            }
          }
        },
      })
      setMessage(result === 'applied' ? 'Weft purchase saved + stock updated' : 'Sent to approval queue')
      setWParty('')
      setWChallan('')
      setWItems([emptyWeft()])
      setPhotoFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveMaintIn(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !mCanSave) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const photo_url = await maybePhoto('maint-inward')
      const items = mItems
        .filter((r) => r.item_name.trim())
        .map((r) => ({
          item_name: r.item_name.trim(),
          qty: n(r.qty),
          rate: n(r.rate),
        }))
      const header = {
        inward_date: mDate,
        party_name: mParty.trim(),
        challan_no: mChallan.trim() || null,
        gst_pct: mGst,
        subtotal: mSubtotal,
        grand_total: mGrand,
        photo_url,
        input_mode: mode,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maintenance_inward',
        action: 'insert',
        recordId: null,
        payload: { ...header, items },
        apply: async () => {
          const { data, error: iErr } = await supabase
            .from('maintenance_inward')
            .insert(header)
            .select('id')
            .single()
          if (iErr) throw iErr
          const { error: itemsErr } = await supabase.from('maintenance_inward_items').insert(
            items.map((it) => ({ inward_id: data.id, ...it })),
          )
          if (itemsErr) throw itemsErr
        },
      })
      setMessage(result === 'applied' ? 'Maintenance inward saved' : 'Sent to approval queue')
      setMParty('')
      setMChallan('')
      setMItems([emptyMaint()])
      setPhotoFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveRepairInv(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !rCanSave) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const photo_url = await maybePhoto('repair-invoice')
      const payload = {
        invoice_date: rDate,
        vendor_name: rVendor.trim(),
        invoice_no: rInvoice.trim() || null,
        repairing_tracker_id: rTrackerId || null,
        repair_cost: n(rCost),
        gst_pct: rGst,
        photo_url,
        input_mode: mode,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maintenance_repair_invoices',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('maintenance_repair_invoices').insert(payload)
          if (iErr) throw iErr
          if (rTrackerId) {
            await supabase
              .from('repairing_tracker')
              .update({ cost: n(rCost), status: 'in', date_in: rDate })
              .eq('id', rTrackerId)
          }
        },
      })
      setMessage(result === 'applied' ? 'Repair invoice saved' : 'Sent to approval queue')
      setRVendor('')
      setRInvoice('')
      setRTrackerId('')
      setRCost('')
      setPhotoFile(null)
      await loadTrackers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const filteredReport = reportRows.filter((row) => {
    if (filterType !== 'all' && row.type !== filterType) return false
    if (fromDate && row.date < fromDate) return false
    if (toDate && row.date > toDate) return false
    return true
  })

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Purchase & Inward</h1>
        <SubTabs
          value={sub}
          onChange={(id) => {
            setSub(id as Sub)
            setPhotoFile(null)
            setMode('manual')
            setDetail(null)
            setMessage(null)
            setError(null)
          }}
          options={[
            { id: 'general', label: 'General' },
            { id: 'weft', label: 'Weft Yarn' },
            { id: 'maint_in', label: 'Maint In' },
            { id: 'repair_inv', label: 'Repair Inv' },
            { id: 'report', label: 'Report' },
          ]}
        />
      </header>

      {sub === 'general' ? (
        <form className="form-stack" onSubmit={(e) => void saveGeneral(e)}>
          <InputModePanel
            value={mode}
            onChange={setMode}
            modes={MANUAL_PHOTO}
            onPhoto={setPhotoFile}
          >
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Party / Supplier</span>
              <input value={gParty} onChange={(e) => setGParty(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Challan No.</span>
              <input value={gChallan} onChange={(e) => setGChallan(e.target.value)} />
            </label>
          </InputModePanel>

          <div className="row-top">
            <h2 className="section-title">Items</h2>
            <button type="button" className="btn-ghost" onClick={() => setGItems((p) => [...p, emptyGen()])}>
              + Add Item
            </button>
          </div>
          {gItems.map((row) => (
            <div key={row.key} className="card-row surface form-stack">
              <label className="field">
                <span className="text-muted">Colour / Item</span>
                <input
                  value={row.item_name}
                  onChange={(e) =>
                    setGItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, item_name: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Billing</span>
                <select
                  value={row.billing_mode}
                  onChange={(e) =>
                    setGItems((prev) =>
                      prev.map((r) =>
                        r.key === row.key
                          ? { ...r, billing_mode: e.target.value as 'weight' | 'piece' }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="weight">By Weight</option>
                  <option value="piece">By Piece</option>
                </select>
              </label>
              <label className="field">
                <span className="text-muted">Gola / Pieces</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.pieces}
                  onChange={(e) =>
                    setGItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, pieces: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Weight (kg)</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.weight_kg}
                  onChange={(e) =>
                    setGItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, weight_kg: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Rate</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.rate}
                  onChange={(e) =>
                    setGItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, rate: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Amount</span>
                <input className="num readonly" value={money(genAmount(row))} readOnly />
              </label>
              {gItems.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost text-danger"
                  onClick={() => setGItems((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}

          <label className="field">
            <span className="text-muted">GST %</span>
            <select value={gGst} onChange={(e) => setGGst(Number(e.target.value))}>
              {GST_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </label>
          <TotalsBlock subtotal={gSubtotal} gstPct={gGst} grand={gGrand} />
          <button type="submit" className="primary-save" disabled={busy || !gCanSave}>
            Save General Purchase
          </button>
        </form>
      ) : null}

      {sub === 'weft' ? (
        <form className="form-stack" onSubmit={(e) => void saveWeft(e)}>
          <InputModePanel value={mode} onChange={setMode} modes={MANUAL_PHOTO} onPhoto={setPhotoFile}>
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={wDate} onChange={(e) => setWDate(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Party / Supplier</span>
              <input value={wParty} onChange={(e) => setWParty(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Challan No.</span>
              <input value={wChallan} onChange={(e) => setWChallan(e.target.value)} />
            </label>
          </InputModePanel>

          <div className="row-top">
            <h2 className="section-title">Yarn items</h2>
            <button type="button" className="btn-ghost" onClick={() => setWItems((p) => [...p, emptyWeft()])}>
              + Add Item
            </button>
          </div>
          {wItems.map((row) => (
            <div key={row.key} className="card-row surface form-stack">
              <label className="field">
                <span className="text-muted">Quality / Colour</span>
                <input
                  value={row.quality}
                  onChange={(e) =>
                    setWItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, quality: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Weight (kg)</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.weight_kg}
                  onChange={(e) =>
                    setWItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, weight_kg: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Rate (₹/kg)</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.rate}
                  onChange={(e) =>
                    setWItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, rate: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Amount</span>
                <input
                  className="num readonly"
                  value={money(n(row.weight_kg) * n(row.rate))}
                  readOnly
                />
              </label>
              {wItems.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost text-danger"
                  onClick={() => setWItems((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}

          <label className="field">
            <span className="text-muted">GST %</span>
            <select value={wGst} onChange={(e) => setWGst(Number(e.target.value))}>
              {GST_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </label>
          <TotalsBlock subtotal={wSubtotal} gstPct={wGst} grand={wGrand} />
          <button type="submit" className="primary-save" disabled={busy || !wCanSave}>
            Save Weft Purchase
          </button>
        </form>
      ) : null}

      {sub === 'maint_in' ? (
        <form className="form-stack" onSubmit={(e) => void saveMaintIn(e)}>
          <InputModePanel value={mode} onChange={setMode} modes={MANUAL_PHOTO} onPhoto={setPhotoFile}>
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Party / Supplier</span>
              <input value={mParty} onChange={(e) => setMParty(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Challan No.</span>
              <input value={mChallan} onChange={(e) => setMChallan(e.target.value)} />
            </label>
          </InputModePanel>

          <div className="row-top">
            <h2 className="section-title">Items</h2>
            <button type="button" className="btn-ghost" onClick={() => setMItems((p) => [...p, emptyMaint()])}>
              + Add Item
            </button>
          </div>
          {mItems.map((row) => (
            <div key={row.key} className="card-row surface form-stack">
              <label className="field">
                <span className="text-muted">Item name</span>
                <input
                  value={row.item_name}
                  onChange={(e) =>
                    setMItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, item_name: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Qty</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.qty}
                  onChange={(e) =>
                    setMItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, qty: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Rate</span>
                <input
                  className="num"
                  type="number"
                  step="any"
                  value={row.rate}
                  onChange={(e) =>
                    setMItems((prev) =>
                      prev.map((r) => (r.key === row.key ? { ...r, rate: e.target.value } : r)),
                    )
                  }
                />
              </label>
              <label className="field">
                <span className="text-muted">Amount</span>
                <input className="num readonly" value={money(n(row.qty) * n(row.rate))} readOnly />
              </label>
              {mItems.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost text-danger"
                  onClick={() => setMItems((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}

          <label className="field">
            <span className="text-muted">GST %</span>
            <select value={mGst} onChange={(e) => setMGst(Number(e.target.value))}>
              {GST_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}%
                </option>
              ))}
            </select>
          </label>
          <TotalsBlock subtotal={mSubtotal} gstPct={mGst} grand={mGrand} />
          <button type="submit" className="primary-save" disabled={busy || !mCanSave}>
            Save Maintenance Inward
          </button>
        </form>
      ) : null}

      {sub === 'repair_inv' ? (
        <form className="form-stack" onSubmit={(e) => void saveRepairInv(e)}>
          <InputModePanel value={mode} onChange={setMode} modes={MANUAL_PHOTO} onPhoto={setPhotoFile}>
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Vendor Name</span>
              <input value={rVendor} onChange={(e) => setRVendor(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Invoice No.</span>
              <input value={rInvoice} onChange={(e) => setRInvoice(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Linked repair OUT</span>
              <select
                value={rTrackerId}
                onChange={(e) => {
                  setRTrackerId(e.target.value)
                  const t = trackers.find((x) => x.id === e.target.value)
                  if (t?.vendor && !rVendor) setRVendor(t.vendor)
                }}
              >
                <option value="">— select repairing_tracker —</option>
                {trackers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.gatepass_no} · {t.item_name} · {t.vendor || '—'} ({t.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Repair Cost</span>
              <input
                className="num"
                type="number"
                step="any"
                value={rCost}
                onChange={(e) => setRCost(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="text-muted">GST %</span>
              <select value={rGst} onChange={(e) => setRGst(Number(e.target.value))}>
                {GST_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}%
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Grand Total</span>
              <input className="num readonly text-weft" value={money(rGrand)} readOnly />
            </label>
          </InputModePanel>
          <button type="submit" className="primary-save" disabled={busy || !rCanSave}>
            Save Repair Invoice
          </button>
        </form>
      ) : null}

      {sub === 'report' ? (
        <div className="form-stack">
          <div className="row-top" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <label className="field" style={{ flex: '1 1 120px' }}>
              <span className="text-muted">Type</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as typeof filterType)}
              >
                <option value="all">All</option>
                <option value="General">General</option>
                <option value="Weft">Weft</option>
                <option value="Maint In">Maint In</option>
                <option value="Repair Inv">Repair Inv</option>
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 120px' }}>
              <span className="text-muted">From</span>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="field" style={{ flex: '1 1 120px' }}>
              <span className="text-muted">To</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>

          <div className="list">
            {filteredReport.map((row) => (
              <button
                key={`${row.type}-${row.id}`}
                type="button"
                className="card-row surface"
                style={{ textAlign: 'left', width: '100%' }}
                onClick={() => setDetail(row)}
              >
                <div className="row-top">
                  <strong>
                    {row.type} · {row.party}
                  </strong>
                  <span className="num text-weft">₹{money(row.grandTotal)}</span>
                </div>
                <div className="text-muted">
                  {row.date} · {row.docNo}
                </div>
              </button>
            ))}
            {!filteredReport.length ? <p className="text-muted">No entries in range</p> : null}
          </div>

          {detail ? (
            <article className="card-row surface form-stack">
              <div className="row-top">
                <strong>
                  {detail.type} detail
                </strong>
                <button type="button" className="btn-ghost" onClick={() => setDetail(null)}>
                  Close
                </button>
              </div>
              <pre className="payload-preview">{JSON.stringify(detail.detail, null, 2)}</pre>
              {typeof detail.detail.photo_url === 'string' && detail.detail.photo_url ? (
                <a href={String(detail.detail.photo_url)} target="_blank" rel="noreferrer">
                  Open photo
                </a>
              ) : null}
            </article>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
