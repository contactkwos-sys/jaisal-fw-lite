import { useCallback, useEffect, useState } from 'react'
import { RecordActions } from '../../components/RecordActions'
import { useAuth } from '../../lib/auth'
import { MACHINES, type ProductionEntry } from '../../lib/database.types'
import { applyOrQueue, todayISO } from '../../lib/mutate'
import { maybeCompleteProgramFromProduction } from '../../lib/programs'
import { supabase } from '../../lib/supabase'
import { deductWarpBeamConsumption } from '../../lib/warpBeamStock'

type ProgramOpt = {
  id: string
  program_no: string
  label: string
  party: string
  marka: string
  design: string
  colour: string
  quality: string
  machine_no: string
  job_card_no: string
}

export function PdEntry() {
  const { isCeo, profile } = useAuth()
  const [programs, setPrograms] = useState<ProgramOpt[]>([])
  const [operators, setOperators] = useState<string[]>([])
  const [date, setDate] = useState(todayISO())
  const [shift, setShift] = useState<'Day' | 'Night'>('Day')
  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [programId, setProgramId] = useState('')
  const [operator, setOperator] = useState('')
  const [meter, setMeter] = useState('')
  const [workingHour, setWorkingHour] = useState('12')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [recent, setRecent] = useState<ProductionEntry[]>([])
  const [viewRow, setViewRow] = useState<ProductionEntry | null>(null)

  const selected = programs.find((p) => p.id === programId)

  const load = useCallback(async () => {
    const [{ data: progs }, { data: workers }] = await Promise.all([
      supabase
        .from('programs')
        .select('id, program_no, machine_no, party_name, marka, design_no, colour, quality, job_card_no, status, order_item_id')
        .not('status', 'in', '("completed","Cancelled","Cancelled")')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase.from('workers').select('full_name').eq('is_active', true),
    ])
    setOperators((workers ?? []).map((w) => w.full_name))

    const itemIds = [...new Set((progs ?? []).map((p) => p.order_item_id).filter(Boolean))] as string[]
    const meta = new Map<string, { design: string; colour: string; party: string }>()
    if (itemIds.length) {
      const { data: items } = await supabase
        .from('order_book_items')
        .select('id, design_no, colour, order_book(party_name)')
        .in('id', itemIds)
      for (const it of items ?? []) {
        meta.set(it.id, {
          design: it.design_no || '—',
          colour: it.colour || '—',
          party: (it as { order_book?: { party_name?: string } }).order_book?.party_name || '—',
        })
      }
    }

    const opts: ProgramOpt[] = (progs ?? [])
      .filter((p) => !['completed', 'Cancelled', 'cancelled'].includes(p.status))
      .map((p) => {
        const m = p.order_item_id ? meta.get(p.order_item_id) : null
        const party = p.party_name || m?.party || '—'
        const design = p.design_no || m?.design || '—'
        const colour = p.colour || m?.colour || '—'
        return {
          id: p.id,
          program_no: p.program_no || p.id.slice(0, 8),
          party,
          marka: p.marka || '',
          design,
          colour,
          quality: p.quality || '—',
          machine_no: p.machine_no || MACHINES[0],
          job_card_no: p.job_card_no || '',
          label: `${p.program_no || 'PRG'} · ${party} · ${design} · ${p.machine_no || '—'}`,
        }
      })
    setPrograms(opts)
    if (!programId && opts[0]) {
      setProgramId(opts[0].id)
      setMachine(opts[0].machine_no)
    }

    const { data: recentEntries } = await supabase
      .from('production_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setRecent((recentEntries as ProductionEntry[]) ?? [])
  }, [programId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    if (!selected) return
    setMachine(selected.machine_no)
  }, [selected])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !programId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const wh = Number(workingHour) || 0
      const payload = {
        machine_no: machine,
        entry_date: date,
        shift,
        operator_name: operator.trim() || null,
        working_hour: wh,
        total_meter: Number(meter) || 0,
        program_id: programId,
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
          await deductWarpBeamConsumption(supabase, machine, date, Number(meter) || 0)
          await maybeCompleteProgramFromProduction(programId)
          await supabase.from('programs').update({ status: 'Running' }).eq('id', programId).in('status', [
            'pending',
            'Programmed',
            'Pending',
          ])
        },
      })
      setMessage(result === 'applied' ? 'Production entry saved' : 'Sent to approval queue')
      setMeter('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Production Entry</h1>
        <p className="pd-lead">Linked to order / program — party &amp; marka fill automatically.</p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form className="form-stack pd-form" onSubmit={(e) => void save(e)}>
        <div className="pd-form-grid">
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Machine</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m, i) => (
                <option key={m} value={m}>
                  Machine {i + 1} ({m})
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Program No.</span>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              required
            >
              <option value="">Select program</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Job Card No.</span>
            <input value={selected?.job_card_no || '—'} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Operator</span>
            <input
              list="pd-ops"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              required
            />
            <datalist id="pd-ops">
              {operators.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span className="text-muted">Working Hours</span>
            <input type="number" step="0.5" value={workingHour} onChange={(e) => setWorkingHour(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Meter Produced</span>
            <input type="number" step="0.1" value={meter} onChange={(e) => setMeter(e.target.value)} required />
          </label>
        </div>

        {selected ? (
          <div className="pd-autofill">
            <div>
              <span>Party</span>
              <strong>{selected.party}</strong>
            </div>
            <div>
              <span>Marka</span>
              <strong className="pd-marka">{selected.marka || '—'}</strong>
            </div>
            <div>
              <span>Design</span>
              <strong>{selected.design}</strong>
            </div>
            <div>
              <span>Colour</span>
              <strong>{selected.colour}</strong>
            </div>
            <div>
              <span>Quality</span>
              <strong>{selected.quality}</strong>
            </div>
            <div>
              <span>Machine</span>
              <strong>{selected.machine_no}</strong>
            </div>
          </div>
        ) : null}

        <button type="submit" className="primary-save" disabled={busy}>
          Save Production Entry
        </button>
      </form>

      <section className="pd-panel" style={{ marginTop: 16 }}>
        <h2>Recent Entries</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Machine</th>
                <th className="num">Meter</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td>{r.entry_date}</td>
                  <td>{r.machine_no}</td>
                  <td className="num">{Number(r.total_meter || 0).toFixed(1)}</td>
                  <td>
                    <RecordActions busy={busy} canEdit={false} canDelete={false} onView={() => setViewRow(r)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {viewRow ? (
          <article className="card-row surface form-stack" style={{ marginTop: 12 }}>
            <div className="row-top">
              <strong>Entry detail</strong>
              <button type="button" className="btn-ghost" onClick={() => setViewRow(null)}>Close</button>
            </div>
            <pre className="payload-preview">{JSON.stringify(viewRow, null, 2)}</pre>
          </article>
        ) : null}
      </section>
    </div>
  )
}
