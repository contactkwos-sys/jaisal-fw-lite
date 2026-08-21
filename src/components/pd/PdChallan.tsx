import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import type { CheckingLot } from '../../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO } from '../../lib/mutate'
import { markProgramDispatched } from '../../lib/programs'
import { printChallan, shareDocWhatsApp } from '../../lib/printDocs'
import { supabase } from '../../lib/supabase'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type Props = { onGo: (s: PdSub) => void }

export function PdChallan({ onGo }: Props) {
  const { isCeo, profile } = useAuth()
  const [lots, setLots] = useState<CheckingLot[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [challanNo, setChallanNo] = useState('CH-0001')
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
        .eq('status', 'Checked')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('challans').select('challan_no').order('created_at', { ascending: false }).limit(200),
    ])
    setLots((data as CheckingLot[]) ?? [])
    setChallanNo(nextDocNo('CH-', (ch ?? []).map((c) => c.challan_no)))
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const picked = useMemo(() => lots.filter((l) => selected.has(l.id)), [lots, selected])
  const totalMeter = picked.reduce((s, l) => s + Number(l.final_meter || 0), 0)

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
    if (!profile || !picked.length) return
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

          // Auto-create draft gate pass linked to challan
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
          })
        },
      })
      setMessage(result === 'applied' ? `Challan ${no} created · Gate Pass drafted` : 'Sent to approval queue')
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
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Challan failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Dispatch / Challan</h1>
        <p className="pd-lead">Select checked lots · auto challan · gate pass follows.</p>
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
          <span className="text-muted">Challan No.</span>
          <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Party</span>
          <input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Marka</span>
          <input value={picked[0]?.marka || ''} readOnly />
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
      </div>

      <section className="pd-panel">
        <header className="pd-panel-h">
          <h2>Available Checked Lots</h2>
          <span className="text-muted">
            Selected {picked.length} · {totalMeter.toLocaleString('en-IN')} m
          </span>
        </header>
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th />
                <th>Lot No.</th>
                <th>Marka</th>
                <th>Meter</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className={selected.has(l.id) ? 'is-selected' : ''}>
                  <td>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                  </td>
                  <td className="num">{l.lot_no}</td>
                  <td>{l.marka}</td>
                  <td className="num">{l.final_meter}</td>
                  <td>{l.entry_date}</td>
                  <td>
                    <span className="pd-pill ok">{l.status}</span>
                  </td>
                </tr>
              ))}
              {!lots.length ? (
                <tr>
                  <td colSpan={6} className="text-muted">
                    No checked lots available. Complete Folding &amp; Checking first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="pd-action-row">
        <button type="button" className="primary-save pd-qa-green" disabled={busy || !picked.length} onClick={() => void createChallan()}>
          Create Challan
        </button>
        <button
          type="button"
          className="pd-qa pd-qa-green"
          disabled={!picked.length}
          onClick={() =>
            shareDocWhatsApp(`Challan ${challanNo}`, [
              `Party: ${partyName}`,
              `Marka: ${picked[0]?.marka || ''}`,
              `Lots: ${picked.map((l) => l.lot_no).join(', ')}`,
              `Total Meter: ${totalMeter}`,
            ])
          }
        >
          WhatsApp
        </button>
        {lastChallanId ? (
          <button type="button" className="pd-qa pd-qa-orange" onClick={() => onGo('gatepass')}>
            Open Gate Pass
          </button>
        ) : null}
      </div>
    </div>
  )
}
