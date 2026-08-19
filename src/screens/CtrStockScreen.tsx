import { useCallback, useEffect, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import {
  CTR_COLOUR_NAMES,
  MACHINES,
  type CtrColourStock,
  type CtrDailyIssue,
} from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type TabId = 'stock' | 'issue' | 'list'

export function CtrStockScreen() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>('stock')
  const [colours, setColours] = useState<CtrColourStock[]>([])
  const [issues, setIssues] = useState<CtrDailyIssue[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [openingEdits, setOpeningEdits] = useState<Record<string, string>>({})
  const [issueDate, setIssueDate] = useState(todayISO())
  const [machineNo, setMachineNo] = useState<string>(MACHINES[0])
  const [colourId, setColourId] = useState('')
  const [golaWeights, setGolaWeights] = useState<string[]>([''])

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const loadStock = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('ctr_colour_stock')
      .select('*')
      .order('colour_name')
    if (err) throw err
    const list = (data as CtrColourStock[]) ?? []
    setColours(list)
    const draft: Record<string, string> = {}
    for (const c of list) draft[c.id] = String(c.opening_stock_kg ?? 0)
    setOpeningEdits(draft)
    if (!colourId && list[0]) setColourId(list[0].id)
  }, [colourId])

  const loadIssues = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('ctr_daily_issue')
      .select('*')
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(80)
    if (err) throw err
    setIssues((data as CtrDailyIssue[]) ?? [])
  }, [])

  useEffect(() => {
    void loadStock().catch((e: Error) => setError(e.message))
  }, [loadStock])

  useEffect(() => {
    if (tab === 'list') void loadIssues().catch((e: Error) => setError(e.message))
  }, [tab, loadIssues])

  const golaTotal = golaWeights.reduce((s, w) => s + (Number(w) || 0), 0)

  async function saveOpening(colour: CtrColourStock) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const opening = Number(openingEdits[colour.id]) || 0
      // One-time opening: set opening and reset current to opening if current was 0 or equal prior opening
      const { error: uErr } = await supabase
        .from('ctr_colour_stock')
        .update({
          opening_stock_kg: opening,
          current_stock_kg: opening,
          updated_at: new Date().toISOString(),
        })
        .eq('id', colour.id)
      if (uErr) throw uErr
      setMessage(`Opening set for ${colour.colour_name}`)
      await loadStock()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !colourId) return
    if (golaTotal <= 0) {
      setError('Enter at least one gola weight')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const colour = colours.find((c) => c.id === colourId)
      if (!colour) throw new Error('Colour not found')
      if (Number(colour.current_stock_kg) < golaTotal) {
        throw new Error(
          `Insufficient stock for ${colour.colour_name} (have ${colour.current_stock_kg} kg)`,
        )
      }

      const { error: iErr } = await supabase.from('ctr_daily_issue').insert({
        issue_date: issueDate,
        machine_no: machineNo,
        colour_id: colourId,
        gola_weight_kg: Number(golaWeights[0]) || golaTotal,
        total_kg: golaTotal,
        entered_by: enteredBy,
      })
      if (iErr) throw iErr

      const nextStock = Number(colour.current_stock_kg) - golaTotal
      const { error: uErr } = await supabase
        .from('ctr_colour_stock')
        .update({
          current_stock_kg: nextStock,
          updated_at: new Date().toISOString(),
        })
        .eq('id', colourId)
      if (uErr) throw uErr

      setMessage(`Issued ${golaTotal.toFixed(2)} kg · stock now ${nextStock.toFixed(2)} kg`)
      setGolaWeights([''])
      await loadStock()
      setTab('list')
      await loadIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issue failed')
    } finally {
      setBusy(false)
    }
  }

  const colourName = (id: string) => colours.find((c) => c.id === id)?.colour_name || id.slice(0, 6)

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>CTR Colour Stock</h1>
        <p className="text-muted">Colour / chemical warehouse · issue deducts stock</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'stock', label: 'Stock' },
            { id: 'issue', label: 'Daily Issue' },
            { id: 'list', label: 'Issue Log' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'stock' ? (
        <div className="list">
          <p className="text-muted2">Colours: {CTR_COLOUR_NAMES.join(', ')}</p>
          {colours.map((c) => (
            <article key={c.id} className="card-row surface row-top">
              <div style={{ flex: 1 }}>
                <strong>{c.colour_name}</strong>
                <div className="text-muted">
                  Current: <span className="num">{Number(c.current_stock_kg).toFixed(2)} kg</span>
                </div>
                <label className="field" style={{ marginTop: 8 }}>
                  <span>Opening stock (kg)</span>
                  <input
                    className="num"
                    inputMode="decimal"
                    type="number"
                    step="0.01"
                    value={openingEdits[c.id] ?? ''}
                    onChange={(e) => setOpeningEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                  />
                </label>
              </div>
              <button type="button" disabled={busy} onClick={() => void saveOpening(c)}>
                Set opening
              </button>
            </article>
          ))}
          {!colours.length ? <p className="text-muted">No CTR colours seeded yet</p> : null}
        </div>
      ) : null}

      {tab === 'issue' ? (
        <form className="form-stack" onSubmit={(e) => void saveIssue(e)}>
          <label className="field">
            <span>Issue date</span>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Machine</span>
            <select value={machineNo} onChange={(e) => setMachineNo(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Colour</span>
            <select value={colourId} onChange={(e) => setColourId(e.target.value)} required>
              {colours.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.colour_name} ({Number(c.current_stock_kg).toFixed(1)} kg)
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Gola weights (kg)</span>
            {golaWeights.map((w, i) => (
              <input
                key={i}
                className="num"
                inputMode="decimal"
                type="number"
                step="0.01"
                placeholder={`Gola ${i + 1}`}
                value={w}
                onChange={(e) => {
                  const next = [...golaWeights]
                  next[i] = e.target.value
                  setGolaWeights(next)
                }}
                style={{ marginBottom: 6 }}
              />
            ))}
            <button type="button" className="btn-ghost" onClick={() => setGolaWeights((g) => [...g, ''])}>
              + Add gola
            </button>
          </div>
          <p className="text-muted2">
            Total kg (auto): <strong className="num">{golaTotal.toFixed(2)}</strong>
          </p>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Issue & deduct stock'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="list">
          {issues.map((r) => (
            <article key={r.id} className="card-row surface">
              <div>
                <strong>
                  {r.issue_date} · {r.machine_no} · {colourName(r.colour_id)}
                </strong>
                <div className="text-muted num">{Number(r.total_kg).toFixed(2)} kg · {r.entered_by}</div>
              </div>
            </article>
          ))}
          {!issues.length ? <p className="text-muted">No issues yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
