import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { Challan, Gatepass, JobCard } from '../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO } from '../lib/mutate'
import { markProgramDispatched } from '../lib/programs'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'folding' | 'challan' | 'gatepass'
type Props = { initialSub?: Sub; filter?: string }

export function DispatchScreen({ initialSub = 'folding' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [dno, setDno] = useState('')
  const [meterFolded, setMeterFolded] = useState('')
  const [rolls, setRolls] = useState('')

  const [challanNo, setChallanNo] = useState('')
  const [party, setParty] = useState('')
  const [meter, setMeter] = useState('')
  const [challanRolls, setChallanRolls] = useState('')
  const [rate, setRate] = useState('')
  const [gstPct, setGstPct] = useState('5')
  const [challans, setChallans] = useState<Challan[]>([])
  const [jobCards, setJobCards] = useState<JobCard[]>([])
  const [linkJobCardId, setLinkJobCardId] = useState('')
  const [linkProgramId, setLinkProgramId] = useState('')

  const [challanId, setChallanId] = useState('')
  const [tempo, setTempo] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [gpDate, setGpDate] = useState(todayISO())
  const [gpNo, setGpNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [receivedName, setReceivedName] = useState('')
  const [driverSigned, setDriverSigned] = useState(false)
  const [receivedSigned, setReceivedSigned] = useState(false)
  const [pendingGp, setPendingGp] = useState<Gatepass[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const total = useMemo(() => {
    const m = Number(meter) || 0
    const r = Number(rate) || 0
    const g = Number(gstPct) || 0
    return m * r * (1 + g / 100)
  }, [meter, rate, gstPct])

  const loadChallans = useCallback(async () => {
    const [{ data: ch }, { data: gp }, { data: jobs }] = await Promise.all([
      supabase.from('challans').select('*').order('created_at', { ascending: false }).limit(50),
      supabase
        .from('gatepass')
        .select('*')
        .or('driver_signed.eq.false,received_signed.eq.false')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('job_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    setChallans((ch as Challan[]) ?? [])
    setPendingGp((gp as Gatepass[]) ?? [])
    setJobCards((jobs as JobCard[]) ?? [])
    setChallanNo(nextDocNo('CH-', (ch ?? []).map((c) => c.challan_no)))
    setGpNo(nextDocNo('DG-', (gp ?? []).map((g) => g.gatepass_no ?? '')))
    if (!challanId && ch?.[0]) setChallanId(ch[0].id)
  }, [challanId])

  useEffect(() => {
    void loadChallans().catch((e: Error) => setError(e.message))
  }, [loadChallans])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  function setupCanvas() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#ede9e2'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }

  useEffect(() => {
    if (sub === 'gatepass') setupCanvas()
  }, [sub])

  async function saveFolding(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        dno: dno.trim(),
        meter_folded: Number(meterFolded) || 0,
        rolls: Number(rolls) || 0,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'folding_entries',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('folding_entries').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Folding saved' : 'Sent to approval queue')
      setDno('')
      setMeterFolded('')
      setRolls('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveChallan(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const linkedJob = jobCards.find((j) => j.id === linkJobCardId)
      const payload = {
        challan_no: challanNo,
        party: party.trim(),
        meter: Number(meter) || 0,
        rolls: Number(challanRolls) || 0,
        rate: Number(rate) || 0,
        gst_pct: Number(gstPct) || 0,
        program_id: linkProgramId || linkedJob?.program_id || null,
        job_card_id: linkJobCardId || null,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'challans',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('challans').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Challan saved' : 'Sent to approval queue')
      setParty('')
      setMeter('')
      setChallanRolls('')
      setRate('')
      setLinkJobCardId('')
      setLinkProgramId('')
      await loadChallans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function billHtml(includeChallanNo: boolean) {
    return rowsToHtml([
      ...(includeChallanNo ? ([['Challan No', challanNo]] as Array<[string, string]>) : []),
      ['Party / Marka', party],
      ['Meter', meter],
      ['Rolls', challanRolls],
      ['Rate', rate],
      ['GST %', gstPct],
      ['Total', total.toFixed(2)],
    ])
  }

  async function saveGatepass(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        challan_id: challanId || null,
        tempo_driver: tempo.trim() || null,
        vehicle_no: vehicle.trim() || null,
        date: gpDate,
        gatepass_no: gpNo,
        driver_signed: driverSigned || Boolean(driverName.trim()),
        received_signed: receivedSigned || Boolean(receivedName.trim()),
        signed_by_driver: driverName.trim() || null,
        signed_by_received: receivedName.trim() || null,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'gatepass',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('gatepass').insert(payload)
          if (iErr) throw iErr
          const delivered =
            Boolean(payload.driver_signed) && Boolean(payload.received_signed) && Boolean(challanId)
          if (delivered) {
            const ch = challans.find((c) => c.id === challanId)
            if (ch?.program_id) {
              await markProgramDispatched(ch.program_id, Number(ch.meter || 0))
            }
          }
        },
      })
      setMessage(result === 'applied' ? 'Gatepass saved' : 'Sent to approval queue')
      setTempo('')
      setVehicle('')
      setDriverName('')
      setReceivedName('')
      setDriverSigned(false)
      setReceivedSigned(false)
      await loadChallans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function pointerPos(ev: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Dispatch</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'folding', label: 'Folding' },
            { id: 'challan', label: 'Challan' },
            { id: 'gatepass', label: 'Gatepass' },
          ]}
        />
      </header>

      {sub === 'folding' ? (
        <form className="form-stack" onSubmit={(e) => void saveFolding(e)}>
          <label className="field">
            <span className="text-muted">Dno</span>
            <input value={dno} onChange={(e) => setDno(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Meter Folded</span>
            <input className="num" type="number" step="0.01" value={meterFolded} onChange={(e) => setMeterFolded(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Rolls</span>
            <input className="num" type="number" value={rolls} onChange={(e) => setRolls(e.target.value)} />
          </label>
          <button type="submit" className="primary-save" disabled={busy}>Save</button>
        </form>
      ) : null}

      {sub === 'challan' ? (
        <form className="form-stack" onSubmit={(e) => void saveChallan(e)}>
          <label className="field">
            <span className="text-muted">Challan No</span>
            <input value={challanNo} onChange={(e) => setChallanNo(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Link Job Card</span>
            <select
              value={linkJobCardId}
              onChange={(e) => {
                const id = e.target.value
                setLinkJobCardId(id)
                const job = jobCards.find((j) => j.id === id)
                if (job?.program_id) setLinkProgramId(job.program_id)
                if (job?.dno && !party) setParty(job.dno)
                if (job?.total_meter != null && !meter) setMeter(String(job.total_meter))
              }}
            >
              <option value="">—</option>
              {jobCards.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_card_no || j.id.slice(0, 8)} · {j.dno} · {j.machine_no}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Party / Marka</span>
            <input value={party} onChange={(e) => setParty(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Meter</span>
            <input className="num" type="number" step="0.01" value={meter} onChange={(e) => setMeter(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Rolls</span>
            <input className="num" type="number" value={challanRolls} onChange={(e) => setChallanRolls(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Rate</span>
            <input className="num" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">GST %</span>
            <select value={gstPct} onChange={(e) => setGstPct(e.target.value)}>
              <option value="5">5</option>
              <option value="12">12</option>
              <option value="18">18</option>
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Total</span>
            <input className="num readonly" value={total.toFixed(2)} readOnly />
          </label>
          <ShareActions
            onWhatsApp={() =>
              shareWhatsApp(
                `Challan ${challanNo}\nParty ${party}\n${meter}m × ₹${rate} + GST ${gstPct}% = ₹${total.toFixed(2)}`,
              )
            }
            onPrint={() => printSummary(`Challan ${challanNo}`, billHtml(true))}
            extra={
              <button
                type="button"
                className="btn-warp"
                onClick={() => printSummary('Invoice / Bill', billHtml(false))}
              >
                Generate Bill
              </button>
            }
          />
          <button type="submit" className="primary-save" disabled={busy}>Save Challan</button>

          <h2 className="section-title">Recent</h2>
          <div className="list">
            {challans.slice(0, 8).map((c) => (
              <article key={c.id} className="card-row surface">
                <strong>{c.challan_no}</strong>
                <div className="text-muted">
                  {c.party} · {c.meter}m · ₹<span className="num">{Number(c.total).toFixed(2)}</span>
                </div>
              </article>
            ))}
          </div>
        </form>
      ) : null}

      {sub === 'gatepass' ? (
        <form className="form-stack" onSubmit={(e) => void saveGatepass(e)}>
          <label className="field">
            <span className="text-muted">Link Challan</span>
            <select value={challanId} onChange={(e) => setChallanId(e.target.value)}>
              <option value="">—</option>
              {challans.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.challan_no} · {c.party}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Gatepass No</span>
            <input value={gpNo} onChange={(e) => setGpNo(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Tempo / Driver</span>
            <input value={tempo} onChange={(e) => setTempo(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Vehicle No</span>
            <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={gpDate} onChange={(e) => setGpDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Signed by (Driver)</span>
            <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Signed by: ___" />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={driverSigned} onChange={(e) => setDriverSigned(e.target.checked)} />
            Driver signed
          </label>
          <label className="field">
            <span className="text-muted">Received sign</span>
            <input value={receivedName} onChange={(e) => setReceivedName(e.target.value)} placeholder="Received by: ___" />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={receivedSigned} onChange={(e) => setReceivedSigned(e.target.checked)} />
            Received signed
          </label>
          <div className="field">
            <span className="text-muted">Signature pad (optional)</span>
            <canvas
              ref={canvasRef}
              width={320}
              height={120}
              className="sign-pad"
              onPointerDown={(ev) => {
                drawing.current = true
                const ctx = canvasRef.current?.getContext('2d')
                const p = pointerPos(ev)
                ctx?.beginPath()
                ctx?.moveTo(p.x, p.y)
                ;(ev.target as HTMLCanvasElement).setPointerCapture(ev.pointerId)
              }}
              onPointerMove={(ev) => {
                if (!drawing.current) return
                const ctx = canvasRef.current?.getContext('2d')
                const p = pointerPos(ev)
                ctx?.lineTo(p.x, p.y)
                ctx?.stroke()
              }}
              onPointerUp={() => {
                drawing.current = false
                setDriverSigned(true)
              }}
            />
          </div>
          <button type="submit" className="primary-save" disabled={busy}>Save Gatepass</button>

          {pendingGp.length ? (
            <>
              <h2 className="section-title">Pending sign-off</h2>
              <div className="list">
                {pendingGp.map((g) => (
                  <article key={g.id} className="card-row surface">
                    <strong>{g.gatepass_no ?? g.id.slice(0, 8)}</strong>
                    <div className="text-muted">
                      {g.tempo_driver ?? '—'} · {g.vehicle_no ?? '—'} · driver{' '}
                      {g.driver_signed ? '✓' : '…'} · recv {g.received_signed ? '✓' : '…'}
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </form>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
