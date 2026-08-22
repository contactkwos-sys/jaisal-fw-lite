import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES } from '../lib/database.types'
import { applyOrQueue } from '../lib/mutate'
import { completeProgram, programTargetMeter } from '../lib/programs'
import { supabase } from '../lib/supabase'

type Sub = 'create' | 'pending'
type Props = { initialSub?: string }

type OrderItemOpt = {
  id: string
  label: string
  party: string
  design_no: string
  colour: string
  qty_meter: number
  rate: number
  matching_no: number | null
}

type PettyDraft = {
  key: string
  petty_label: string
  item_name: string
  meter: string
}

type PendingRow = {
  id: string
  status: string
  machine_no: string | null
  created_at: string
  party: string
  design_no: string
  colour: string
  target: number
}

const PETTY_PRESETS = ['Main', 'Jari', 'Avaj Effect']

function emptyPetty(): PettyDraft {
  return { key: crypto.randomUUID(), petty_label: 'Main', item_name: '', meter: '' }
}

export function ProgramScreen({ initialSub }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub === 'pending' ? 'pending' : 'create')
  const [items, setItems] = useState<OrderItemOpt[]>([])
  const [orderItemId, setOrderItemId] = useState('')
  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [pettys, setPettys] = useState<PettyDraft[]>([emptyPetty()])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [sortKey, setSortKey] = useState<'machine' | 'date' | 'party'>('date')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (initialSub === 'pending' || initialSub === 'create') setSub(initialSub)
  }, [initialSub])

  const selected = useMemo(
    () => items.find((i) => i.id === orderItemId) || null,
    [items, orderItemId],
  )

  const pettyTotal = useMemo(
    () => pettys.reduce((s, p) => s + (Number(p.meter) || 0), 0),
    [pettys],
  )

  const loadItems = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('order_book_items')
      .select('id, design_no, colour, qty_meter, rate, matching_no, settled, order_book(party_name, order_date)')
      .eq('settled', false)
      .limit(200)
    if (err) throw err
    const opts: OrderItemOpt[] = (data ?? []).map((row: any) => ({
      id: row.id,
      party: row.order_book?.party_name || '—',
      design_no: row.design_no || '—',
      colour: row.colour || '—',
      qty_meter: Number(row.qty_meter || 0),
      rate: Number(row.rate || 0),
      matching_no: row.matching_no != null ? Number(row.matching_no) : null,
      label: `${row.order_book?.party_name || '—'} · ${row.design_no || '—'} · ${row.colour || '—'} (${Number(row.qty_meter || 0)} m · ₹${Number(row.rate || 0)}/m)`,
    }))
    setItems(opts)
    if (!orderItemId && opts[0]) setOrderItemId(opts[0].id)
  }, [orderItemId])

  const loadPending = useCallback(async () => {
    const { data: progs, error: err } = await supabase
      .from('programs')
      .select('id, status, machine_no, created_at, order_item_id')
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(200)
    if (err) throw err
    const itemIds = [...new Set((progs ?? []).map((p) => p.order_item_id).filter(Boolean))] as string[]
    let itemMap = new Map<string, { party: string; design_no: string; colour: string }>()
    if (itemIds.length) {
      const { data: its } = await supabase
        .from('order_book_items')
        .select('id, design_no, colour, order_book(party_name)')
        .in('id', itemIds)
      for (const it of its ?? []) {
        itemMap.set(it.id, {
          party: (it as any).order_book?.party_name || '—',
          design_no: it.design_no || '—',
          colour: it.colour || '—',
        })
      }
    }
    const rows: PendingRow[] = []
    for (const p of progs ?? []) {
      const meta = p.order_item_id ? itemMap.get(p.order_item_id) : null
      const target = await programTargetMeter(p.id)
      rows.push({
        id: p.id,
        status: p.status,
        machine_no: p.machine_no,
        created_at: p.created_at,
        party: meta?.party || '—',
        design_no: meta?.design_no || '—',
        colour: meta?.colour || '—',
        target,
      })
    }
    setPending(rows)
  }, [])

  useEffect(() => {
    if (sub === 'create') void loadItems().catch((e: Error) => setError(e.message))
    if (sub === 'pending') void loadPending().catch((e: Error) => setError(e.message))
  }, [sub, loadItems, loadPending])

  async function saveProgram(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !orderItemId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const pettyRows = pettys
        .filter((p) => Number(p.meter) > 0)
        .map((p) => ({
          petty_label: p.petty_label.trim() || 'Main',
          item_name: p.item_name.trim() || null,
          meter: Number(p.meter) || 0,
        }))
      if (!pettyRows.length) throw new Error('Add at least one petty with meter')
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'programs',
        action: 'insert',
        recordId: null,
        payload: { order_item_id: orderItemId, machine_no: machine, petty: pettyRows },
        apply: async () => {
          const { data, error: pErr } = await supabase
            .from('programs')
            .insert({ order_item_id: orderItemId, machine_no: machine, status: 'pending' })
            .select('id')
            .single()
          if (pErr) throw pErr
          const { error: tErr } = await supabase.from('program_petty').insert(
            pettyRows.map((r) => ({ ...r, program_id: data.id })),
          )
          if (tErr) throw tErr
        },
      })
      setMessage(result === 'applied' ? 'Program saved' : 'Sent to approval queue')
      setPettys([emptyPetty()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function markComplete(id: string) {
    if (!profile) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'programs',
        action: 'update',
        recordId: id,
        payload: { status: 'completed' },
        apply: async () => {
          await completeProgram(id)
        },
      })
      await loadPending()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function markRunning(id: string) {
    if (!profile) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'programs',
        action: 'update',
        recordId: id,
        payload: { status: 'running' },
        apply: async () => {
          const { error: uErr } = await supabase
            .from('programs')
            .update({ status: 'running' })
            .eq('id', id)
          if (uErr) throw uErr
        },
      })
      await loadPending()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const sortedPending = useMemo(() => {
    const rows = [...pending]
    if (sortKey === 'machine') rows.sort((a, b) => String(a.machine_no).localeCompare(String(b.machine_no)))
    else if (sortKey === 'party') rows.sort((a, b) => a.party.localeCompare(b.party))
    else rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return rows
  }, [pending, sortKey])

  const orderedQty = selected?.qty_meter ?? 0
  const compareNote =
    selected && Math.abs(pettyTotal - orderedQty) > 0.01
      ? `Petty total ${pettyTotal.toFixed(1)} m vs ordered ${orderedQty.toFixed(1)} m`
      : selected
        ? `Matches ordered ${orderedQty.toFixed(1)} m`
        : ''

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Program</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'create', label: 'Program Card' },
            { id: 'pending', label: 'Pending Tracker' },
          ]}
        />
      </header>

      {sub === 'create' ? (
        <form className="form-stack program-card-form" onSubmit={(e) => void saveProgram(e)}>
          <div className="program-meta-grid">
            <label className="field">
              <span className="text-muted">Order / Party / Design</span>
              <select value={orderItemId} onChange={(e) => setOrderItemId(e.target.value)} required>
                <option value="">Select order item</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
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
          </div>

          {selected ? (
            <div className="program-summary-cards">
              <div className="program-summary-card surface">
                <span className="text-muted2">Party</span>
                <strong>{selected.party}</strong>
              </div>
              <div className="program-summary-card surface">
                <span className="text-muted2">DIN / Design</span>
                <strong>{selected.design_no}</strong>
              </div>
              <div className="program-summary-card surface">
                <span className="text-muted2">Colour / Matching</span>
                <strong>
                  {selected.colour}
                  {selected.matching_no != null ? ` · #${selected.matching_no}` : ''}
                </strong>
              </div>
              <div className="program-summary-card surface">
                <span className="text-muted2">Ordered meter</span>
                <strong className="num">{selected.qty_meter.toFixed(1)}</strong>
              </div>
              <div className="program-summary-card surface">
                <span className="text-muted2">Order Rate</span>
                <strong className="num">₹{selected.rate.toFixed(2)} / Mtr</strong>
              </div>
            </div>
          ) : null}

          <h2 className="section-title">Petty / Matching entries</h2>
          {pettys.map((p, idx) => (
            <fieldset key={p.key} className="colour-block surface program-petty-block">
              <legend>Petty {idx + 1}</legend>
              <div className="program-petty-grid">
                <label className="field">
                  <span className="text-muted">Petty / Matching</span>
                  <input
                    list={`petty-presets-${idx}`}
                    value={p.petty_label}
                    onChange={(e) => {
                      const next = [...pettys]
                      next[idx] = { ...p, petty_label: e.target.value }
                      setPettys(next)
                    }}
                  />
                  <datalist id={`petty-presets-${idx}`}>
                    {PETTY_PRESETS.map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </label>
                <label className="field">
                  <span className="text-muted">Item</span>
                  <input
                    value={p.item_name}
                    onChange={(e) => {
                      const next = [...pettys]
                      next[idx] = { ...p, item_name: e.target.value }
                      setPettys(next)
                    }}
                  />
                </label>
                <label className="field">
                  <span className="text-muted">Meter</span>
                  <input
                    className="num"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={p.meter}
                    onChange={(e) => {
                      const next = [...pettys]
                      next[idx] = { ...p, meter: e.target.value }
                      setPettys(next)
                    }}
                  />
                </label>
              </div>
              {pettys.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPettys(pettys.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              ) : null}
            </fieldset>
          ))}
          <button type="button" className="btn-warp" onClick={() => setPettys([...pettys, emptyPetty()])}>
            + Add Petty
          </button>
          <div className="program-totals surface">
            <div>
              <span className="text-muted2">Total petty meter</span>
              <strong className="num">{pettyTotal.toFixed(1)} m</strong>
            </div>
            <div>
              <span className="text-muted2">Ordered meter</span>
              <strong className="num">{orderedQty.toFixed(1)} m</strong>
            </div>
            <div>
              <span className="text-muted2">Remaining</span>
              <strong className={`num ${orderedQty - pettyTotal < 0 ? 'text-danger' : 'text-sage'}`}>
                {(orderedQty - pettyTotal).toFixed(1)} m
              </strong>
            </div>
          </div>
          <p className={Math.abs(pettyTotal - orderedQty) > 0.01 ? 'text-weft' : 'text-sage'}>
            {compareNote}
          </p>
          <button type="submit" className="primary-save program-save-btn" disabled={busy || !orderItemId}>
            Save Program
          </button>
        </form>
      ) : null}

      {sub === 'pending' ? (
        <div>
          <div className="segment">
            {(
              [
                ['date', 'Date'],
                ['machine', 'Machine'],
                ['party', 'Party'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={sortKey === id ? 'seg active' : 'seg'}
                onClick={() => setSortKey(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="list">
            {sortedPending.map((row) => (
              <article key={row.id} className="card-row surface">
                <div className="row-top">
                  <div>
                    <strong>
                      {row.design_no} · {row.colour}
                    </strong>
                    <div className="text-muted">
                      {row.party} · {row.machine_no || '—'} ·{' '}
                      {String(row.created_at).slice(0, 10)} · target{' '}
                      <span className="num">{row.target.toFixed(1)}</span> m
                    </div>
                  </div>
                  <span
                    className={`status-chip ${row.status === 'running' ? 'status-on-break' : 'status-absent'}`}
                  >
                    {row.status === 'running' ? 'Running' : 'Pending'}
                  </span>
                </div>
                <div className="share-actions">
                  {row.status === 'pending' ? (
                    <button type="button" className="btn-ghost" disabled={busy} onClick={() => void markRunning(row.id)}>
                      Mark running
                    </button>
                  ) : null}
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void markComplete(row.id)}>
                    Mark complete
                  </button>
                </div>
              </article>
            ))}
            {!sortedPending.length ? <p className="text-muted">No pending programs</p> : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
