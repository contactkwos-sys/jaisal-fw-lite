import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RecordActions } from '../components/RecordActions'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { Challan, Gatepass, JobCard } from '../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO } from '../lib/mutate'
import { markProgramDispatched } from '../lib/programs'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
import { confirmDeleteRecord } from '../lib/recordCrud'
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
  const [foldingEntries, setFoldingEntries] = useState<Array<Record<string, unknown>>>([])
  const [recentGp, setRecentGp] = useState<Gatepass[]>([])
  const [viewFolding, setViewFolding] = useState<Record<string, unknown> | null>(null)
  const [viewChallan, setViewChallan] = useState<Challan | null>(null)
  const [viewGatepass, setViewGatepass] = useState<Gatepass | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const total = useMemo(() => {
    const m = Number(meter) || 0
    const r = Number(rate) || 0
    const g = Number(gstPct) || 0
    return m * r * (1 + g / 100)
  }, [meter, rate, gstPct])

  const enteredBy = profile?.full_name || profile?.id || 'Unknown'

  const loadChallans = useCallback(async () => {
    const [{ data: ch }, { data: gp }, { data: jobs }, { data: fold }, { data: allGp }] = await Promise.all([
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
      supabase.from('folding_entries').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('gatepass').select('*').order('created_at', { ascending: false }).limit(20),
    ])
    setChallans((ch as Challan[]) ?? [])
    setPendingGp((gp as Gatepass[]) ?? [])
    setJobCards((jobs as JobCard[]) ?? [])
    setFoldingEntries((fold as Array<Record<string, unknown>>) ?? [])
    setRecentGp((allGp as Gatepass[]) ?? [])
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
      await loadChallans()
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

  async function handleDeleteFolding(row: Record<string, unknown>) {
    if (!profile) return
    const id = String(row.id || '')
    if (!id) return
    const label = String(row.dno || row.lot_no || 'folding entry')
    if (!confirmDeleteRecord({ label, linked: Boolean(row.program_id) })) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: String(row.created_at || ''),
        tableName: 'folding_entries',
        recordId: id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('folding_entries').delete().eq('id', id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Folding deleted' : 'Delete queued for CEO approval')
      if (viewFolding?.id === row.id) setViewFolding(null)
      await loadChallans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteChallan(c: Challan) {
    if (!profile) return
    const linked = recentGp.some((g) => g.challan_id === c.id)
    if (!confirmDeleteRecord({ label: c.challan_no || c.party, linked })) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: c.created_at,
        tableName: 'challans',
        recordId: c.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('challans').delete().eq('id', c.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Challan deleted' : 'Delete queued for CEO approval')
      if (viewChallan?.id === c.id) setViewChallan(null)
      await loadChallans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteGatepass(g: Gatepass) {
    if (!profile) return
    const linked = Boolean(g.driver_signed && g.received_signed)
    if (!confirmDeleteRecord({ label: g.gatepass_no || g.id.slice(0, 8), linked })) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: g.created_at,
        tableName: 'gatepass',
        recordId: g.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('gatepass').delete().eq('id', g.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Gatepass deleted' : 'Delete queued for CEO approval')
      if (viewGatepass?.id === g.id) setViewGatepass(null)
      await loadChallans()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
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

          <h2 className="section-title">Recent folding</h2>
          <div className="list">
            {foldingEntries.slice(0, 8).map((f) => (
              <article key={String(f.id)} className="card-row surface row-top">
                <div>
                  <strong>{String(f.dno || '—')}</strong>
                  <div className="text-muted">
                    {Number(f.meter_folded || 0)} m · {Number(f.rolls || 0)} rolls
                  </div>
                </div>
                <RecordActions
                  busy={busy}
                  canEdit={false}
                  onView={() => setViewFolding(f)}
                  onDelete={() => void handleDeleteFolding(f)}
                />
              </article>
            ))}
            {!foldingEntries.length ? <p className="text-muted">No folding entries</p> : null}
          </div>

          {viewFolding ? (
            <article className="card-row surface form-stack">
              <div className="row-top">
                <strong>Folding detail</strong>
                <button type="button" className="btn-ghost" onClick={() => setViewFolding(null)}>Close</button>
              </div>
              <pre className="payload-preview">{JSON.stringify(viewFolding, null, 2)}</pre>
            </article>
          ) : null}
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
                // Auto-bring Order Rate from linked order_book_items via program
                if (job?.program_id) {
                  void (async () => {
                    const { data: prog } = await supabase
                      .from('programs')
                      .select('order_item_id')
                      .eq('id', job.program_id)
                      .maybeSingle()
                    if (!prog?.order_item_id) return
                    const { data: item } = await supabase
                      .from('order_book_items')
                      .select('rate, qty_meter, colour, design_no, order_book(party_name)')
                      .eq('id', prog.order_item_id)
                      .maybeSingle()
                    if (!item) return
                    if (item.rate != null) setRate(String(item.rate))
                    const ob = (item as { order_book?: { party_name?: string } | null }).order_book
                    if (ob?.party_name) setParty(ob.party_name)
                    if (item.design_no && !meter) {
                      /* keep meter from job if set */
                    }
                    if (item.qty_meter != null && !meter) setMeter(String(item.qty_meter))
                  })()
                }
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
            <span className="text-muted">Rate / Meter</span>
            <input className="num" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
              Auto-filled from Order Booking rate when a linked program/job is selected
            </span>
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
              <article key={c.id} className="card-row surface row-top">
                <div>
                  <strong>{c.challan_no}</strong>
                  <div className="text-muted">
                    {c.party} · {c.meter}m · ₹<span className="num">{Number(c.total).toFixed(2)}</span>
                  </div>
                </div>
                <RecordActions
                  busy={busy}
                  canEdit={false}
                  onView={() => setViewChallan(c)}
                  onDelete={() => void handleDeleteChallan(c)}
                />
              </article>
            ))}
          </div>

          {viewChallan ? (
            <article className="card-row surface form-stack">
              <div className="row-top">
                <strong>Challan detail</strong>
                <button type="button" className="btn-ghost" onClick={() => setViewChallan(null)}>Close</button>
              </div>
              <pre className="payload-preview">{JSON.stringify(viewChallan, null, 2)}</pre>
            </article>
          ) : null}
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
                  <article key={g.id} className="card-row surface row-top">
                    <div>
                      <strong>{g.gatepass_no ?? g.id.slice(0, 8)}</strong>
                      <div className="text-muted">
                        {g.tempo_driver ?? '—'} · {g.vehicle_no ?? '—'} · driver{' '}
                        {g.driver_signed ? '✓' : '…'} · recv {g.received_signed ? '✓' : '…'}
                      </div>
                    </div>
                    <RecordActions
                      busy={busy}
                      canEdit={false}
                      onView={() => setViewGatepass(g)}
                      onDelete={() => void handleDeleteGatepass(g)}
                    />
                  </article>
                ))}
              </div>
            </>
          ) : null}

          <h2 className="section-title">Recent gatepass</h2>
          <div className="list">
            {recentGp.slice(0, 8).map((g) => (
              <article key={g.id} className="card-row surface row-top">
                <div>
                  <strong>{g.gatepass_no ?? g.id.slice(0, 8)}</strong>
                  <div className="text-muted">
                    {g.tempo_driver ?? '—'} · {g.vehicle_no ?? '—'}
                  </div>
                </div>
                <RecordActions
                  busy={busy}
                  canEdit={false}
                  onView={() => setViewGatepass(g)}
                  onDelete={() => void handleDeleteGatepass(g)}
                />
              </article>
            ))}
            {!recentGp.length ? <p className="text-muted">No gatepass entries</p> : null}
          </div>

          {viewGatepass ? (
            <article className="card-row surface form-stack">
              <div className="row-top">
                <strong>Gatepass detail</strong>
                <button type="button" className="btn-ghost" onClick={() => setViewGatepass(null)}>Close</button>
              </div>
              <pre className="payload-preview">{JSON.stringify(viewGatepass, null, 2)}</pre>
            </article>
          ) : null}
        </form>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
