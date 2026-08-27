import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import type { CheckingLot } from '../../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO } from '../../lib/mutate'
import { markProgramDispatched } from '../../lib/programs'
import { printChallan, shareDocWhatsApp } from '../../lib/printDocs'
import { supabase } from '../../lib/supabase'
import { handleUserError } from '../../lib/userError'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type Props = { onGo: (s: PdSub) => void }

export function PdChallan({ onGo }: Props) {
  const { isCeo, profile } = useAuth()
  const [lots, setLots] = useState<CheckingLot[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [challanNo, setChallanNo] = useState('CH-0001')
  const [vehicle, setVehicle] = useState('')
  const [transporter, setTransporter] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const [dispatchQty, setDispatchQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lastChallanId, setLastChallanId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data }, { data: ch }] = await Promise.all([
      supabase
        .from('checking_lots')
        .select('*')
        .is('challan_id', null)
        .in('status', ['Checked', 'Pass', 'Passed'])
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('challans').select('challan_no').order('created_at', { ascending: false }).limit(200),
    ])
    setLots((data as CheckingLot[]) ?? [])
    setChallanNo(nextDocNo('CH-', (ch ?? []).map((c) => c.challan_no)))
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(handleUserError('PD.challan.load', e, 'Could not load ready lots.')))
  }, [load])

  const picked = useMemo(() => lots.filter((l) => selected.has(l.id)), [lots, selected])
  const availableMeter = picked.reduce((s, l) => s + Number(l.final_meter || 0), 0)
  const totalMeter = dispatchQty.trim() !== '' ? Number(dispatchQty) || 0 : availableMeter

  const meta = useMemo(() => {
    return {
      party: '',
      marka: picked[0]?.marka || '',
      design: '',
      quality: '',
      colour: '',
      programId: picked[0]?.program_id || null,
    }
  }, [picked])

  const [partyName, setPartyName] = useState('')
  const [design, setDesign] = useState('')
  const [quality, setQuality] = useState('')
  const [colour, setColour] = useState('')
  const [checkStatus, setCheckStatus] = useState('READY')

  useEffect(() => {
    const pid = picked[0]?.program_id
    if (!pid) return
    void (async () => {
      const { data } = await supabase
        .from('programs')
        .select('party_name, marka, design_no, quality, colour')
        .eq('id', pid)
        .maybeSingle()
      if (data) {
        setPartyName(data.party_name || '')
        setDesign(data.design_no || '')
        setQuality(data.quality || '')
        setColour(data.colour || '')
      }
      setCheckStatus('READY')
      setDispatchQty('')
    })()
  }, [picked])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createChallan() {
    if (!profile) return
    if (!picked.length) {
      setError('Please select an order / lot ready for dispatch')
      return
    }
    if (totalMeter <= 0) {
      setError('Please enter Dispatch Qty greater than 0')
      return
    }
    if (totalMeter > availableMeter + 0.01) {
      setError(`Dispatch Qty cannot be greater than available (${availableMeter.toFixed(1)} m)`)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const no = challanNo
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'challans',
        action: 'insert',
        recordId: null,
        payload: { challan_no: no, party: partyName, meter: totalMeter },
        apply: async () => {
          const { data, error: cErr } = await supabase
            .from('challans')
            .insert({
              challan_no: no,
              party: partyName || meta.marka || 'Party',
              meter: totalMeter,
              rolls: picked.length,
              rate: 0,
              gst_pct: 5,
              program_id: meta.programId,
              marka: picked[0]?.marka || meta.marka || null,
              design_no: design || null,
              quality: quality || null,
              colour: colour || null,
              status: 'Ready',
            })
            .select('id')
            .single()
          if (cErr) throw cErr
          setLastChallanId(data.id)
          for (const lot of picked) {
            await supabase
              .from('checking_lots')
              .update({ challan_id: data.id, status: 'Dispatched' })
              .eq('id', lot.id)
          }
          if (meta.programId) await markProgramDispatched(meta.programId, totalMeter)

          const { data: gps } = await supabase
            .from('gatepass')
            .select('gatepass_no')
            .order('created_at', { ascending: false })
            .limit(100)
          const gpNo = nextDocNo('GP-', (gps ?? []).map((g) => g.gatepass_no || ''))
          await supabase.from('gatepass').insert({
            challan_id: data.id,
            date: todayISO(),
            gatepass_no: gpNo,
            party: partyName || null,
            marka: picked[0]?.marka || null,
            total_meter: totalMeter,
            lots_count: picked.length,
            gp_time: new Date().toTimeString().slice(0, 5),
            vehicle_no: vehicle.trim() || null,
            transporter_name: transporter.trim() || null,
            remarks: invoiceNo.trim() ? `Invoice ${invoiceNo.trim()}` : null,
          })
        },
      })
      setMessage(result === 'applied' ? `Dispatch Saved · Challan ${no}` : 'Sent for approval')
      if (result === 'applied') {
        printChallan({
          challanNo: no,
          date: todayISO(),
          party: partyName,
          marka: picked[0]?.marka || '',
          design,
          quality,
          colour,
          lots: picked.map((l) => ({ lot_no: l.lot_no, meter: Number(l.final_meter || 0) })),
          totalMeter,
        })
      }
      setSelected(new Set())
      setVehicle('')
      setTransporter('')
      setInvoiceNo('')
      setDispatchQty('')
      await load()
    } catch (e) {
      setError(handleUserError('PD.challan.save', e, 'Could not save dispatch. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Dispatch</h1>
        <p className="pd-lead">Orders ready for dispatch · auto customer &amp; checking status</p>
        <div className="pd-header-actions">
          <button type="button" className="btn-sm" onClick={() => onGo('gatepass')}>
            Gate Pass
          </button>
          <button type="button" className="btn-sm" onClick={() => onGo('invoice')}>
            Invoice
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="pd-form-grid" style={{ marginBottom: 12 }}>
        <label className="field">
          <span className="text-muted">Customer</span>
          <input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Order / Design</span>
          <input value={design} onChange={(e) => setDesign(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Checking Status</span>
          <input value={picked.length ? checkStatus : '—'} readOnly />
        </label>
        <label className="field">
          <span className="text-muted">Available Qty</span>
          <input className="num" value={availableMeter.toFixed(1)} readOnly />
        </label>
        <label className="field">
          <span className="text-muted">Dispatch Qty</span>
          <input
            className="num"
            type="number"
            min="0"
            step="0.1"
            value={dispatchQty}
            placeholder={availableMeter ? String(availableMeter) : ''}
            onChange={(e) => setDispatchQty(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="text-muted">Vehicle</span>
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Transporter</span>
          <input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Challan</span>
          <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Invoice</span>
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="Optional / later" />
        </label>
        <label className="field">
          <span className="text-muted">Colour</span>
          <input value={colour} onChange={(e) => setColour(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Quality</span>
          <input value={quality} onChange={(e) => setQuality(e.target.value)} />
        </label>
      </div>

      <section className="pd-panel">
        <header className="pd-panel-h">
          <h2>Ready for Dispatch</h2>
          <span className="text-muted">{lots.length} lot(s)</span>
        </header>
        {!lots.length ? <p className="text-muted">No checked lots ready</p> : null}
        <ul className="list">
          {lots.map((l) => (
            <li key={l.id} className="card-row surface row-top">
              <label className="pd-lot-pick">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                <span>
                  <strong>{l.lot_no}</strong>
                  <span className="text-muted">
                    {' '}
                    · {l.marka || '—'} · {Number(l.final_meter || 0).toFixed(1)} m · {l.status}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className="otp-sticky-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn-ghost" onClick={() => onGo('folding')}>
          Back
        </button>
        <button type="button" className="primary-save" disabled={busy || !picked.length} onClick={() => void createChallan()}>
          Save Dispatch
        </button>
        {lastChallanId ? (
          <button
            type="button"
            className="btn-warp"
            onClick={() =>
              shareDocWhatsApp(`Challan ${challanNo}`, [
                `Party: ${partyName}`,
                `Meter: ${totalMeter}`,
                `Vehicle: ${vehicle || '—'}`,
              ])
            }
          >
            Share
          </button>
        ) : null}
      </div>
    </div>
  )
}
