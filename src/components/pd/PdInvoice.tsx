import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import type { Challan } from '../../lib/database.types'
import { applyOrQueue, todayISO } from '../../lib/mutate'
import { nextInvoiceNo } from '../../lib/programDispatch'
import { printGstInvoice, shareDocWhatsApp } from '../../lib/printDocs'
import { supabase } from '../../lib/supabase'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type Props = { onGo: (s: PdSub) => void }

export function PdInvoice({ onGo }: Props) {
  const { isCeo, profile } = useAuth()
  const [challans, setChallans] = useState<Challan[]>([])
  const [challanId, setChallanId] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('INV-0001')
  const [invoiceDate, setInvoiceDate] = useState(todayISO())
  const [party, setParty] = useState('')
  const [gstin, setGstin] = useState('')
  const [billing, setBilling] = useState('')
  const [shipping, setShipping] = useState('')
  const [design, setDesign] = useState('')
  const [quality, setQuality] = useState('')
  const [colour, setColour] = useState('')
  const [marka, setMarka] = useState('')
  const [qty, setQty] = useState('')
  const [rate, setRate] = useState('')
  const [gstPct, setGstPct] = useState('5')
  const [interState, setInterState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const taxable = (Number(qty) || 0) * (Number(rate) || 0)
  const gst = Number(gstPct) || 0
  const tax = (taxable * gst) / 100
  const cgst = interState ? 0 : tax / 2
  const sgst = interState ? 0 : tax / 2
  const igst = interState ? tax : 0
  const grand = taxable + tax

  const load = useCallback(async () => {
    const [{ data }, invNo] = await Promise.all([
      supabase.from('challans').select('*').order('created_at', { ascending: false }).limit(50),
      nextInvoiceNo(),
    ])
    setChallans((data as Challan[]) ?? [])
    setInvoiceNo(invNo)
    if (!challanId && data?.[0]) setChallanId(data[0].id)
  }, [challanId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const selected = useMemo(() => challans.find((c) => c.id === challanId), [challans, challanId])

  useEffect(() => {
    if (!selected) return
    setParty(selected.party || '')
    setMarka(selected.marka || '')
    setDesign(selected.design_no || '')
    setQuality(selected.quality || '')
    setColour(selected.colour || '')
    setQty(String(selected.meter || ''))
    setRate(String(selected.rate || ''))
    setGstPct(String(selected.gst_pct || 5))
    void (async () => {
      const { data: pm } = await supabase
        .from('party_master')
        .select('gstin, billing_address, shipping_address, marka')
        .ilike('party_name', selected.party)
        .maybeSingle()
      if (pm) {
        setGstin(pm.gstin || '')
        setBilling(pm.billing_address || '')
        setShipping(pm.shipping_address || '')
        if (!selected.marka && pm.marka) setMarka(pm.marka)
      }
    })()
  }, [selected])

  async function save() {
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        invoice_no: invoiceNo,
        invoice_date: invoiceDate,
        challan_id: challanId || null,
        party: party.trim(),
        gstin: gstin.trim() || null,
        billing_address: billing.trim() || null,
        shipping_address: shipping.trim() || null,
        design_no: design.trim() || null,
        quality: quality.trim() || null,
        colour: colour.trim() || null,
        marka: marka.trim() || null,
        quantity: Number(qty) || 0,
        rate: Number(rate) || 0,
        taxable_value: taxable,
        gst_pct: gst,
        cgst,
        sgst,
        igst,
        grand_total: grand,
        is_inter_state: interState,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'gst_invoices',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('gst_invoices').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? `Invoice ${invoiceNo} saved` : 'Sent to approval queue')
      if (result === 'applied') doPreview()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function doPreview() {
    printGstInvoice({
      invoiceNo,
      invoiceDate,
      party,
      gstin,
      billing,
      shipping,
      design,
      quality,
      colour,
      marka,
      qty: Number(qty) || 0,
      rate: Number(rate) || 0,
      taxable,
      gstPct: gst,
      cgst,
      sgst,
      igst,
      grand,
    })
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>GST Invoice</h1>
        <p className="pd-lead">Optional invoice linked to challan · A4 printable.</p>
        <button type="button" className="btn-sm" onClick={() => onGo('challan')}>
          From Challan
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="pd-form-grid">
        <label className="field">
          <span className="text-muted">Link Challan</span>
          <select value={challanId} onChange={(e) => setChallanId(e.target.value)}>
            <option value="">None</option>
            {challans.map((c) => (
              <option key={c.id} value={c.id}>
                {c.challan_no} · {c.party} · {c.meter}m
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Invoice Number</span>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Invoice Date</span>
          <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Party</span>
          <input value={party} onChange={(e) => setParty(e.target.value)} required />
        </label>
        <label className="field">
          <span className="text-muted">GSTIN</span>
          <input value={gstin} onChange={(e) => setGstin(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Marka</span>
          <input value={marka} onChange={(e) => setMarka(e.target.value)} />
        </label>
        <label className="field pd-span-2">
          <span className="text-muted">Billing Address</span>
          <input value={billing} onChange={(e) => setBilling(e.target.value)} />
        </label>
        <label className="field pd-span-2">
          <span className="text-muted">Shipping Address</span>
          <input value={shipping} onChange={(e) => setShipping(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Design</span>
          <input value={design} onChange={(e) => setDesign(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Quality</span>
          <input value={quality} onChange={(e) => setQuality(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Colour</span>
          <input value={colour} onChange={(e) => setColour(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Quantity (m)</span>
          <input type="number" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Rate</span>
          <input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">GST %</span>
          <input type="number" step="0.1" value={gstPct} onChange={(e) => setGstPct(e.target.value)} />
        </label>
        <label className="field checkbox-field">
          <span className="text-muted">Inter-state (IGST)</span>
          <input type="checkbox" checked={interState} onChange={(e) => setInterState(e.target.checked)} />
        </label>
      </div>

      <div className="pd-tax-box">
        <div>
          Taxable <strong>₹{taxable.toFixed(2)}</strong>
        </div>
        <div>
          CGST <strong>₹{cgst.toFixed(2)}</strong>
        </div>
        <div>
          SGST <strong>₹{sgst.toFixed(2)}</strong>
        </div>
        <div>
          IGST <strong>₹{igst.toFixed(2)}</strong>
        </div>
        <div className="pd-grand">
          Grand Total <strong>₹{grand.toFixed(2)}</strong>
        </div>
      </div>

      <div className="pd-action-row">
        <button type="button" className="primary-save" disabled={busy || !party} onClick={() => void save()}>
          Save Invoice
        </button>
        <button type="button" className="pd-qa pd-qa-blue" onClick={doPreview}>
          Preview / Print Invoice
        </button>
        <button type="button" className="pd-qa pd-qa-teal" onClick={doPreview}>
          Download PDF
        </button>
        <button
          type="button"
          className="pd-qa pd-qa-green"
          onClick={() =>
            shareDocWhatsApp(`Invoice ${invoiceNo}`, [
              `Party: ${party}`,
              `GSTIN: ${gstin}`,
              `Marka: ${marka}`,
              `Qty: ${qty} m @ ${rate}`,
              `Grand Total: ₹${grand.toFixed(2)}`,
            ])
          }
        >
          WhatsApp
        </button>
      </div>
    </div>
  )
}
