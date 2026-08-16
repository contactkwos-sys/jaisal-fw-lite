import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES, type ProductionEntry } from '../lib/database.types'
import { applyOrQueue, todayISO } from '../lib/mutate'
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

type Props = { initialSub?: Sub; filter?: string }

export function ProductionScreen({ initialSub = 'job' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Job card
  const [dno, setDno] = useState('')
  const [colours, setColours] = useState<ColourBlock[]>([
    { colour: '', matching: '', pick: '', program_meter: '', fut_panel: '' },
  ])
  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [operator, setOperator] = useState('')
  const [operators, setOperators] = useState<string[]>([])

  // Machine entry
  const [entryMachine, setEntryMachine] = useState<string>(MACHINES[0])
  const [entryDate, setEntryDate] = useState(todayISO())
  const [shift, setShift] = useState<'Day' | 'Night'>('Day')
  const [entryOp, setEntryOp] = useState('')
  const [workingHour, setWorkingHour] = useState('12')
  const [totalMeter, setTotalMeter] = useState('')

  // Daily report
  const [reportDate, setReportDate] = useState(todayISO())
  const [entries, setEntries] = useState<ProductionEntry[]>([])

  const wh = Number(workingHour) || 0
  const shiftDiff = 12 - wh
  const efficiency = (wh / 12) * 100

  const loadOps = useCallback(async () => {
    const { data } = await supabase.from('workers').select('full_name').eq('is_active', true)
    setOperators((data ?? []).map((w) => w.full_name))
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
    if (sub === 'report') void loadReport().catch((e: Error) => setError(e.message))
  }, [sub, loadReport])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  const dayEntries = useMemo(() => entries.filter((e) => e.shift === 'Day'), [entries])
  const nightEntries = useMemo(() => entries.filter((e) => e.shift === 'Night'), [entries])
  const total24 = useMemo(
    () => entries.reduce((s, e) => s + Number(e.total_meter || 0), 0),
    [entries],
  )

  function jobSummaryText() {
    const lines = colours
      .map(
        (c, i) =>
          `#${i + 1} ${c.colour} | match ${c.matching} | pick ${c.pick} | ${c.program_meter}m | ${c.fut_panel || '-'}`,
      )
      .join('\n')
    return `Job Card Dno ${dno}\nMachine ${machine} · Op ${operator}\n${lines}`
  }

  async function saveJob(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = { dno: dno.trim(), machine_no: machine, operator_name: operator.trim() || null }
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
            .select('id')
            .single()
          if (iErr) throw iErr
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
        },
      })
      setMessage(result === 'applied' ? 'Job card saved' : 'Sent to approval queue')
      setColours([{ colour: '', matching: '', pick: '', program_meter: '', fut_panel: '' }])
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
        },
      })
      setMessage(result === 'applied' ? 'Production entry saved' : 'Sent to approval queue')
      setTotalMeter('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
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
            <article key={r.id} className="card-row surface">
              <strong>{r.machine_no}</strong>
              <div className="text-muted">
                {r.operator_name ?? '—'} · {r.total_meter} m · eff{' '}
                <span className="num">{Number(r.efficiency_pct).toFixed(1)}%</span>
              </div>
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
          <label className="field">
            <span className="text-muted">Dno</span>
            <input value={dno} onChange={(e) => setDno(e.target.value)} required />
          </label>
          {colours.map((c, idx) => (
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
          ))}
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
          <label className="field">
            <span className="text-muted">Machine</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>{m}</option>
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
              printSummary(
                `Job Card ${dno}`,
                rowsToHtml([
                  ['Dno', dno],
                  ['Machine', machine],
                  ['Operator', operator],
                  ...colours.flatMap((c, i) => [
                    [`Colour ${i + 1}`, c.colour],
                    ['Matching', c.matching],
                    ['Pick', c.pick],
                    ['Program m', c.program_meter],
                    ['Fut/Panel', c.fut_panel],
                  ] as Array<[string, string]>),
                ]),
              )
            }
          />
          <button type="submit" className="primary-save" disabled={busy}>Save Job Card</button>
        </form>
      ) : null}

      {sub === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void saveEntry(e)}>
          <label className="field">
            <span className="text-muted">Machine No</span>
            <select value={entryMachine} onChange={(e) => setEntryMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>{m}</option>
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
          <button type="submit" className="primary-save" disabled={busy}>Save Entry</button>
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
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
