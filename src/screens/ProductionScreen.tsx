import { useCallback, useEffect, useMemo, useState } from 'react'
import { RecordActions } from '../components/RecordActions'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES, type JobCard, type ProductionEntry } from '../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO } from '../lib/mutate'
import { maybeCompleteProgramFromProduction, programTargetMeter } from '../lib/programs'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
import { confirmDeleteRecord } from '../lib/recordCrud'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'job' | 'entry' | 'report'
type ColourBlock = {
  colour: string
  matching: string
  pick: string
  program_meter: string
  fut_panel: string
}

type ProgramOpt = {
  id: string
  label: string
  dno: string
  colour: string
  machine_no: string
  total_meter: number
}

type Props = { initialSub?: Sub; filter?: string }

export function ProductionScreen({ initialSub = 'job' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [programOpts, setProgramOpts] = useState<ProgramOpt[]>([])
  const [programId, setProgramId] = useState('')
  const [jobCardNo, setJobCardNo] = useState('JC-0001')
  const [printCards, setPrintCards] = useState<JobCard[]>([])
  const [dno, setDno] = useState('')
  const [jobColour, setJobColour] = useState('')
  const [jobTotalMeter, setJobTotalMeter] = useState('')
  const [colours, setColours] = useState<ColourBlock[]>([
    { colour: '', matching: '', pick: '', program_meter: '', fut_panel: '' },
  ])
  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [operator, setOperator] = useState('')
  const [operators, setOperators] = useState<string[]>([])
  const [manualMode, setManualMode] = useState(false)

  const [entryMachine, setEntryMachine] = useState<string>(MACHINES[0])
  const [entryDate, setEntryDate] = useState(todayISO())
  const [shift, setShift] = useState<'Day' | 'Night'>('Day')
  const [entryOp, setEntryOp] = useState('')
  const [workingHour, setWorkingHour] = useState('12')
  const [totalMeter, setTotalMeter] = useState('')
  const [entryProgramId, setEntryProgramId] = useState('')
  const [updateBeamMeter, setUpdateBeamMeter] = useState(true)

  const [reportDate, setReportDate] = useState(todayISO())
  const [entries, setEntries] = useState<ProductionEntry[]>([])
  const [viewEntry, setViewEntry] = useState<ProductionEntry | null>(null)

  const enteredBy = profile?.full_name || profile?.id || 'Unknown'

  const wh = Number(workingHour) || 0
  const shiftDiff = 12 - wh
  const efficiency = (wh / 12) * 100

  const loadOps = useCallback(async () => {
    const { data } = await supabase.from('workers').select('full_name').eq('is_active', true)
    setOperators((data ?? []).map((w) => w.full_name))
  }, [])

  const loadPrograms = useCallback(async () => {
    const { data: progs } = await supabase
      .from('programs')
      .select('id, machine_no, order_item_id, status')
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(100)
    const itemIds = [...new Set((progs ?? []).map((p) => p.order_item_id).filter(Boolean))] as string[]
    const meta = new Map<string, { design_no: string; colour: string }>()
    if (itemIds.length) {
      const { data: items } = await supabase
        .from('order_book_items')
        .select('id, design_no, colour')
        .in('id', itemIds)
      for (const it of items ?? []) {
        meta.set(it.id, { design_no: it.design_no || '—', colour: it.colour || '—' })
      }
    }
    const opts: ProgramOpt[] = []
    for (const p of progs ?? []) {
      const m = p.order_item_id ? meta.get(p.order_item_id) : null
      const target = await programTargetMeter(p.id)
      opts.push({
        id: p.id,
        dno: m?.design_no || '—',
        colour: m?.colour || '—',
        machine_no: p.machine_no || MACHINES[0],
        total_meter: target,
        label: `${m?.design_no || '—'} · ${m?.colour || '—'} · ${p.machine_no || '—'} · ${target.toFixed(1)}m (${p.status})`,
      })
    }
    setProgramOpts(opts)

    const { data: jobs } = await supabase
      .from('job_cards')
      .select('job_card_no')
      .order('created_at', { ascending: false })
      .limit(200)
    setJobCardNo(nextDocNo('JC-', (jobs ?? []).map((j) => j.job_card_no || '')))
  }, [])

  const loadReport = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('production_entries')
      .select('*')
      .eq('entry_date', reportDate)
      .order('machine_no')
    if (err) throw err
    setEntries((data as ProductionEntry[]) ?? [])
  }, [reportDate])

  useEffect(() => {
    void loadOps().catch((e: Error) => setError(e.message))
  }, [loadOps])

  useEffect(() => {
    if (sub === 'job' || sub === 'entry') void loadPrograms().catch((e: Error) => setError(e.message))
  }, [sub, loadPrograms])

  useEffect(() => {
    if (sub === 'report') void loadReport().catch((e: Error) => setError(e.message))
  }, [sub, loadReport])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  useEffect(() => {
    if (!programId || manualMode) return
    const p = programOpts.find((x) => x.id === programId)
    if (!p) return
    setDno(p.dno)
    setJobColour(p.colour)
    setMachine(p.machine_no)
    setJobTotalMeter(String(p.total_meter))
    setColours([
      {
        colour: p.colour,
        matching: '',
        pick: '',
        program_meter: String(p.total_meter),
        fut_panel: '',
      },
    ])
  }, [programId, programOpts, manualMode])

  const dayEntries = useMemo(() => entries.filter((e) => e.shift === 'Day'), [entries])
  const nightEntries = useMemo(() => entries.filter((e) => e.shift === 'Night'), [entries])
  const total24 = useMemo(
    () => entries.reduce((s, e) => s + Number(e.total_meter || 0), 0),
    [entries],
  )

  function jobSummaryText() {
    return `Job Card ${jobCardNo}\nDno ${dno}\nMachine ${machine} · Colour ${jobColour}\nTotal ${jobTotalMeter}m · Op ${operator}`
  }

  function printJobSheet(cards: JobCard[]) {
    const slots = [...cards]
    while (slots.length < 4) {
      slots.push({
        id: `blank-${slots.length}`,
        dno: '',
        machine_no: null,
        operator_name: null,
        created_at: '',
        program_id: null,
        job_card_no: '',
        issued_at: null,
        colour: null,
        total_meter: null,
      })
    }
    const cells = slots
      .slice(0, 4)
      .map(
        (c) => `<div class="jc">
  <div class="jc-no">${c.job_card_no || '—'}</div>
  <div><b>Dno</b> ${c.dno || '—'}</div>
  <div><b>Machine</b> ${c.machine_no || '—'}</div>
  <div><b>Colour</b> ${c.colour || '—'}</div>
  <div><b>Total m</b> ${c.total_meter ?? '—'}</div>
  <div><b>Op</b> ${c.operator_name || '—'}</div>
</div>`,
      )
      .join('')
    printSummary(
      'Job Cards (A4 2×2)',
      `<style>
@page{size:A4;margin:12mm}
.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10mm;height:260mm}
.jc{border:1px solid #333;padding:10px;border-radius:4px;font-size:13px}
.jc-no{font-size:16px;font-weight:700;margin-bottom:8px}
@media print{body{padding:0}.grid{height:270mm}}
</style><div class="grid">${cells}</div>`,
    )
  }

  async function saveJob(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        dno: dno.trim(),
        machine_no: machine,
        operator_name: operator.trim() || null,
        program_id: programId || null,
        job_card_no: jobCardNo,
        colour: jobColour.trim() || colours[0]?.colour || null,
        total_meter: Number(jobTotalMeter) || Number(colours[0]?.program_meter) || null,
        issued_at: new Date().toISOString(),
      }
      let saved: JobCard | null = null
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'job_cards',
        action: 'insert',
        recordId: null,
        payload: { ...payload, colours },
        apply: async () => {
          const { data, error: iErr } = await supabase
            .from('job_cards')
            .insert(payload)
            .select('*')
            .single()
          if (iErr) throw iErr
          saved = data as JobCard
          const rows = colours
            .filter((c) => c.colour.trim())
            .map((c) => ({
              job_card_id: data.id,
              colour: c.colour.trim(),
              matching: c.matching || null,
              pick: c.pick ? Number(c.pick) : null,
              program_meter: c.program_meter ? Number(c.program_meter) : null,
              fut_panel: c.fut_panel || null,
            }))
          if (rows.length) {
            const { error: cErr } = await supabase.from('job_card_colours').insert(rows)
            if (cErr) throw cErr
          }
          if (programId) {
            await supabase
              .from('programs')
              .update({ status: 'running' })
              .eq('id', programId)
              .eq('status', 'pending')
          }
        },
      })
      setMessage(result === 'applied' ? 'Job card issued' : 'Sent to approval queue')
      if (saved) setPrintCards((prev) => [saved!, ...prev].slice(0, 4))
      await loadPrograms()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        machine_no: entryMachine,
        entry_date: entryDate,
        shift,
        operator_name: entryOp.trim() || null,
        working_hour: wh,
        total_meter: Number(totalMeter) || 0,
        program_id: entryProgramId || null,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'production_entries',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('production_entries').insert(payload)
          if (iErr) throw iErr
          if (entryProgramId) await maybeCompleteProgramFromProduction(entryProgramId)

          if (updateBeamMeter) {
            const meter = Number(totalMeter) || 0
            const { data: loading, error: lErr } = await supabase
              .from('beam_loading')
              .select('id')
              .eq('machine_no', entryMachine)
              .eq('status', 'RUNNING')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (lErr) throw lErr
            if (loading?.id) {
              const { data: existing, error: eErr } = await supabase
                .from('daily_beam_production')
                .select('id, production_meter')
                .eq('beam_loading_id', loading.id)
                .eq('production_date', entryDate)
                .maybeSingle()
              if (eErr) throw eErr
              if (existing?.id) {
                const { error: uErr } = await supabase
                  .from('daily_beam_production')
                  .update({
                    production_meter: Number(existing.production_meter || 0) + meter,
                    efficiency,
                  })
                  .eq('id', existing.id)
                if (uErr) throw uErr
              } else {
                const { error: bErr } = await supabase.from('daily_beam_production').insert({
                  beam_loading_id: loading.id,
                  machine_no: entryMachine,
                  production_date: entryDate,
                  production_meter: meter,
                  efficiency,
                })
                if (bErr) throw bErr
              }
            }
          }
        },
      })
      setMessage(
        result === 'applied'
          ? updateBeamMeter
            ? 'Production entry saved · beam meter updated'
            : 'Production entry saved'
          : 'Sent to approval queue',
      )
      setTotalMeter('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteEntry(row: ProductionEntry) {
    if (!profile) return
    const label = `${row.machine_no} · ${row.entry_date} · ${row.total_meter}m`
    if (!confirmDeleteRecord({ label, linked: Boolean(row.program_id) })) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at,
        tableName: 'production_entries',
        recordId: row.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('production_entries').delete().eq('id', row.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Entry deleted' : 'Delete queued for CEO approval')
      if (viewEntry?.id === row.id) setViewEntry(null)
      await loadReport()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function renderShift(title: string, rows: ProductionEntry[]) {
    return (
      <section className="report-section">
        <h2 className="text-weft">{title}</h2>
        <div className="list">
          {rows.map((r) => (
            <article key={r.id} className="card-row surface row-top">
              <div>
                <strong>{r.machine_no}</strong>
                <div className="text-muted">
                  {r.operator_name ?? '—'} · {r.total_meter} m · WH {Number(r.working_hour).toFixed(1)}h
                </div>
              </div>
              <RecordActions
                busy={busy}
                canEdit={false}
                onView={() => setViewEntry(r)}
                onDelete={() => void handleDeleteEntry(r)}
              />
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No entries</p> : null}
        </div>
      </section>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Production</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'job', label: 'Job Card' },
            { id: 'entry', label: 'Machine Entry' },
            { id: 'report', label: 'Daily Report' },
          ]}
        />
      </header>

      {sub === 'job' ? (
        <form className="form-stack" onSubmit={(e) => void saveJob(e)}>
          <label className="check-row">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={(e) => setManualMode(e.target.checked)}
            />
            Manual entry (no program link)
          </label>
          {!manualMode ? (
            <label className="field">
              <span className="text-muted">Program</span>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                required={!manualMode}
              >
                <option value="">Select program</option>
                {programOpts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span className="text-muted">Job Card No.</span>
            <input value={jobCardNo} onChange={(e) => setJobCardNo(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Dno</span>
            <input value={dno} onChange={(e) => setDno(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Colour</span>
            <input value={jobColour} onChange={(e) => setJobColour(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Total Meter</span>
            <input
              className="num"
              type="number"
              step="0.01"
              value={jobTotalMeter}
              onChange={(e) => setJobTotalMeter(e.target.value)}
            />
          </label>
          {manualMode
            ? colours.map((c, idx) => (
                <fieldset key={idx} className="colour-block surface">
                  <legend>Colour {idx + 1}</legend>
                  <label className="field">
                    <span className="text-muted">Colour</span>
                    <input
                      value={c.colour}
                      onChange={(e) => {
                        const next = [...colours]
                        next[idx] = { ...c, colour: e.target.value }
                        setColours(next)
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Matching</span>
                    <input
                      value={c.matching}
                      onChange={(e) => {
                        const next = [...colours]
                        next[idx] = { ...c, matching: e.target.value }
                        setColours(next)
                      }}
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Pick</span>
                    <input
                      className="num"
                      type="number"
                      value={c.pick}
                      onChange={(e) => {
                        const next = [...colours]
                        next[idx] = { ...c, pick: e.target.value }
                        setColours(next)
                      }}
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Program Meter</span>
                    <input
                      className="num"
                      type="number"
                      step="0.01"
                      value={c.program_meter}
                      onChange={(e) => {
                        const next = [...colours]
                        next[idx] = { ...c, program_meter: e.target.value }
                        setColours(next)
                      }}
                    />
                  </label>
                  <label className="field">
                    <span className="text-muted">Fut / Panel (optional)</span>
                    <input
                      value={c.fut_panel}
                      onChange={(e) => {
                        const next = [...colours]
                        next[idx] = { ...c, fut_panel: e.target.value }
                        setColours(next)
                      }}
                    />
                  </label>
                </fieldset>
              ))
            : null}
          {manualMode ? (
            <button
              type="button"
              className="btn-warp"
              onClick={() =>
                setColours([
                  ...colours,
                  { colour: '', matching: '', pick: '', program_meter: '', fut_panel: '' },
                ])
              }
            >
              + Add Colour
            </button>
          ) : null}
          <label className="field">
            <span className="text-muted">Machine</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Operator</span>
            <input list="op-list" value={operator} onChange={(e) => setOperator(e.target.value)} />
            <datalist id="op-list">
              {operators.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <ShareActions
            disabled={busy || !dno}
            onWhatsApp={() => shareWhatsApp(jobSummaryText())}
            onPrint={() =>
              printCards.length
                ? printJobSheet(printCards)
                : printSummary(
                    `Job Card ${jobCardNo}`,
                    rowsToHtml([
                      ['Job Card No', jobCardNo],
                      ['Dno', dno],
                      ['Machine', machine],
                      ['Colour', jobColour],
                      ['Total m', jobTotalMeter],
                      ['Operator', operator],
                    ]),
                  )
            }
          />
          <button type="submit" className="primary-save" disabled={busy}>
            Issue Job Card
          </button>

          {printCards.length ? (
            <section className="job-print-preview">
              <h2 className="section-title">Print sheet (A4 2×2)</h2>
              <div className="job-card-grid">
                {[0, 1, 2, 3].map((i) => {
                  const c = printCards[i]
                  return (
                    <article key={i} className="job-card-tile surface">
                      <strong>{c?.job_card_no || '—'}</strong>
                      <div className="text-muted">Dno {c?.dno || '—'}</div>
                      <div className="text-muted">Machine {c?.machine_no || '—'}</div>
                      <div className="text-muted">Colour {c?.colour || '—'}</div>
                      <div className="num">{c?.total_meter ?? '—'} m</div>
                    </article>
                  )
                })}
              </div>
              <button type="button" className="btn-warp" onClick={() => printJobSheet(printCards)}>
                Print 2×2 sheet
              </button>
            </section>
          ) : null}
        </form>
      ) : null}

      {sub === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void saveEntry(e)}>
          <label className="field">
            <span className="text-muted">Link Program (optional)</span>
            <select value={entryProgramId} onChange={(e) => setEntryProgramId(e.target.value)}>
              <option value="">—</option>
              {programOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Machine No</span>
            <select value={entryMachine} onChange={(e) => setEntryMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Operator Naam</span>
            <input list="op-list2" value={entryOp} onChange={(e) => setEntryOp(e.target.value)} />
            <datalist id="op-list2">
              {operators.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="text-muted">Working Hour</span>
            <input
              className="num"
              type="number"
              step="0.01"
              min="0"
              max="12"
              value={workingHour}
              onChange={(e) => setWorkingHour(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="text-muted">Shift Diff (12 − WH)</span>
            <input className="num readonly" value={shiftDiff.toFixed(2)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Efficiency %</span>
            <input className="num readonly" value={efficiency.toFixed(1)} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Total Meter</span>
            <input
              className="num"
              type="number"
              step="0.01"
              value={totalMeter}
              onChange={(e) => setTotalMeter(e.target.value)}
              required
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={updateBeamMeter}
              onChange={(e) => setUpdateBeamMeter(e.target.checked)}
            />
            Update Beam Meter (deduct from running beam on this machine)
          </label>
          <button type="submit" className="primary-save" disabled={busy}>
            Save Entry
          </button>
        </form>
      ) : null}

      {sub === 'report' ? (
        <div className="form-stack">
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </label>
          {renderShift('Day Shift', dayEntries)}
          {renderShift('Night Shift', nightEntries)}
          <p className="kpi-total">
            24hr Total Meter: <span className="num text-weft">{total24.toFixed(2)}</span>
          </p>

          {viewEntry ? (
            <article className="card-row surface form-stack">
              <div className="row-top">
                <strong>Production entry</strong>
                <button type="button" className="btn-ghost" onClick={() => setViewEntry(null)}>
                  Close
                </button>
              </div>
              <pre className="payload-preview">{JSON.stringify(viewEntry, null, 2)}</pre>
            </article>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
