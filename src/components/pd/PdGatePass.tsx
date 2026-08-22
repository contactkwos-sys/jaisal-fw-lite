import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import type { Challan, Gatepass } from '../../lib/database.types'
import { applyOrQueue, nowTimeHHMM, todayISO } from '../../lib/mutate'
import { printGatePass, shareDocWhatsApp } from '../../lib/printDocs'
import { supabase } from '../../lib/supabase'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type Props = { onGo: (s: PdSub) => void }

type GpView = Gatepass & { challan?: Challan | null }

export function PdGatePass({ onGo }: Props) {
  const { isCeo, profile } = useAuth()
  const [list, setList] = useState<GpView[]>([])
  const [activeId, setActiveId] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [transporter, setTransporter] = useState('')
  const [driver, setDriver] = useState('')
  const [remarks, setRemarks] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: gps, error: err } = await supabase
      .from('gatepass')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40)
    if (err) throw err
    const challanIds = [...new Set((gps ?? []).map((g) => g.challan_id).filter(Boolean))] as string[]
    const chMap = new Map<string, Challan>()
    if (challanIds.length) {
      const { data: chs } = await supabase.from('challans').select('*').in('id', challanIds)
      for (const c of (chs as Challan[]) ?? []) chMap.set(c.id, c)
    }
    const rows: GpView[] = ((gps as Gatepass[]) ?? []).map((g) => ({
      ...g,
      challan: g.challan_id ? chMap.get(g.challan_id) || null : null,
    }))
    setList(rows)
    if (!activeId && rows[0]) {
      setActiveId(rows[0].id)
      setVehicle(rows[0].vehicle_no || '')
      setTransporter(rows[0].transporter_name || '')
      setDriver(rows[0].driver_name || rows[0].tempo_driver || '')
      setRemarks(rows[0].remarks || '')
    }
  }, [activeId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const active = list.find((g) => g.id === activeId)

  useEffect(() => {
    if (!active) return
    setVehicle(active.vehicle_no || '')
    setTransporter(active.transporter_name || '')
    setDriver(active.driver_name || active.tempo_driver || '')
    setRemarks(active.remarks || '')
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!profile || !active) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const patch = {
        vehicle_no: vehicle.trim() || null,
        transporter_name: transporter.trim() || null,
        driver_name: driver.trim() || null,
        tempo_driver: driver.trim() || null,
        remarks: remarks.trim() || null,
        party: active.party || active.challan?.party || null,
        marka: active.marka || active.challan?.marka || null,
        total_meter: active.total_meter || active.challan?.meter || 0,
        gp_time: active.gp_time || nowTimeHHMM(),
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'gatepass',
        action: 'update',
        recordId: active.id,
        payload: patch,
        apply: async () => {
          const { error: uErr } = await supabase.from('gatepass').update(patch).eq('id', active.id)
          if (uErr) throw uErr
          if (active.challan_id) {
            await supabase.from('challans').update({ status: 'Dispatched' }).eq('id', active.challan_id)
          }
        },
      })
      setMessage(result === 'applied' ? 'Gate pass updated' : 'Sent to approval queue')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function doPrint() {
    if (!active) return
    printGatePass({
      gpNo: active.gatepass_no || '—',
      challanNo: active.challan?.challan_no || '—',
      date: active.date || todayISO(),
      time: active.gp_time || nowTimeHHMM(),
      party: active.party || active.challan?.party || '—',
      marka: active.marka || active.challan?.marka || '—',
      totalMeter: Number(active.total_meter || active.challan?.meter || 0),
      lotsCount: Number(active.lots_count || active.challan?.rolls || 0),
      vehicle,
      transporter,
      driver,
      remarks,
    })
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Gate Pass</h1>
        <p className="pd-lead">Uses challan details automatically — add vehicle / tempo only.</p>
        <button type="button" className="btn-sm" onClick={() => onGo('challan')}>
          Back to Challan
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <div className="pd-split">
        <section className="pd-panel">
          <header className="pd-panel-h">
            <h2>Gate Passes</h2>
          </header>
          <ul className="pd-list">
            {list.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className={g.id === activeId ? 'is-active' : ''}
                  onClick={() => setActiveId(g.id)}
                >
                  <strong>{g.gatepass_no}</strong>
                  <span>{g.challan?.challan_no || '—'}</span>
                  <span>{g.party || g.challan?.party || '—'}</span>
                </button>
              </li>
            ))}
            {!list.length ? <li className="text-muted">No gate passes yet. Create a challan first.</li> : null}
          </ul>
        </section>

        {active ? (
          <section className="pd-panel">
            <header className="pd-panel-h">
              <h2>{active.gatepass_no}</h2>
            </header>
            <div className="pd-autofill">
              <div>
                <span>Challan No.</span>
                <strong>{active.challan?.challan_no || '—'}</strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{active.date}</strong>
              </div>
              <div>
                <span>Party</span>
                <strong>{active.party || active.challan?.party}</strong>
              </div>
              <div>
                <span>Marka</span>
                <strong className="pd-marka">{active.marka || active.challan?.marka || '—'}</strong>
              </div>
              <div>
                <span>Total Meter</span>
                <strong>{active.total_meter || active.challan?.meter}</strong>
              </div>
              <div>
                <span>No. of Lots</span>
                <strong>{active.lots_count || active.challan?.rolls}</strong>
              </div>
            </div>
            <div className="pd-form-grid">
              <label className="field">
                <span className="text-muted">Tempo / Vehicle Number</span>
                <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
              </label>
              <label className="field">
                <span className="text-muted">Transporter / Tempo Person</span>
                <input value={transporter} onChange={(e) => setTransporter(e.target.value)} />
              </label>
              <label className="field">
                <span className="text-muted">Driver Name</span>
                <input value={driver} onChange={(e) => setDriver(e.target.value)} />
              </label>
              <label className="field">
                <span className="text-muted">Remarks</span>
                <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </label>
            </div>
            <div className="pd-action-row">
              <button type="button" className="primary-save" disabled={busy} onClick={() => void save()}>
                Save Gate Pass
              </button>
              <button type="button" className="pd-qa pd-qa-orange" onClick={doPrint}>
                Print Gate Pass
              </button>
              <button
                type="button"
                className="pd-qa pd-qa-green"
                onClick={() =>
                  shareDocWhatsApp(`Gate Pass ${active.gatepass_no}`, [
                    `Challan: ${active.challan?.challan_no}`,
                    `Party: ${active.party || active.challan?.party}`,
                    `Marka: ${active.marka || active.challan?.marka}`,
                    `Meter: ${active.total_meter || active.challan?.meter}`,
                    `Vehicle: ${vehicle}`,
                    `Driver: ${driver}`,
                  ])
                }
              >
                WhatsApp
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
