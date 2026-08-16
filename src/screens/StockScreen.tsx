import { useCallback, useEffect, useState } from 'react'
import { enqueueApproval } from '../lib/approval'
import { useAuth } from '../lib/auth'
import type { BeamPipeStock, WeftYarnStock } from '../lib/database.types'
import { supabase } from '../lib/supabase'

type Tab = 'beam' | 'weft'

export function StockScreen() {
  const { isCeo, profile } = useAuth()
  const [tab, setTab] = useState<Tab>('beam')
  const [beams, setBeams] = useState<BeamPipeStock[]>([])
  const [yarns, setYarns] = useState<WeftYarnStock[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data: b, error: bErr }, { data: y, error: yErr }] = await Promise.all([
      supabase.from('beam_pipe_stock').select('*').order('variety_name'),
      supabase.from('weft_yarn_stock').select('*').order('updated_at'),
    ])
    if (bErr) throw bErr
    if (yErr) throw yErr
    setBeams((b as BeamPipeStock[]) ?? [])
    setYarns((y as WeftYarnStock[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  async function applyOrQueue(
    tableName: 'beam_pipe_stock' | 'weft_yarn_stock',
    action: 'insert' | 'update' | 'delete',
    recordId: string | null,
    payload: Record<string, unknown>,
    apply: () => Promise<void>,
  ) {
    if (!profile) throw new Error('Not logged in')
    if (isCeo) {
      await apply()
      setMessage('Applied')
    } else {
      await enqueueApproval({
        tableName,
        recordId,
        action,
        requestedBy: profile.id,
        payload,
      })
      setMessage('Sent to approval queue')
    }
    await load()
  }

  async function addBeamVariety() {
    const name = window.prompt('Variety name')
    if (!name?.trim()) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = { variety_name: name.trim(), quantity_pcs: 0 }
      await applyOrQueue('beam_pipe_stock', 'insert', null, payload, async () => {
        const { error: err } = await supabase.from('beam_pipe_stock').insert(payload)
        if (err) throw err
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  async function editBeam(row: BeamPipeStock) {
    const qtyRaw = window.prompt(`Quantity for ${row.variety_name}`, String(row.quantity_pcs))
    if (qtyRaw == null) return
    const quantity_pcs = Number(qtyRaw)
    if (Number.isNaN(quantity_pcs)) {
      setError('Invalid quantity')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = { quantity_pcs, updated_at: new Date().toISOString() }
      await applyOrQueue('beam_pipe_stock', 'update', row.id, payload, async () => {
        const { error: err } = await supabase
          .from('beam_pipe_stock')
          .update(payload)
          .eq('id', row.id)
        if (err) throw err
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteBeam(row: BeamPipeStock) {
    if (!window.confirm(`Delete variety ${row.variety_name}?`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await applyOrQueue('beam_pipe_stock', 'delete', row.id, { id: row.id }, async () => {
        const { error: err } = await supabase.from('beam_pipe_stock').delete().eq('id', row.id)
        if (err) throw err
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function addYarn() {
    const supplier = window.prompt('Supplier') ?? ''
    const colour_no = window.prompt('Colour No') ?? ''
    const colour_name = window.prompt('Colour Name') ?? ''
    const stockRaw = window.prompt('Stock kg', '0') ?? '0'
    const stock_kg = Number(stockRaw)
    if (Number.isNaN(stock_kg)) {
      setError('Invalid stock')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = { supplier, colour_no, colour_name, stock_kg }
      await applyOrQueue('weft_yarn_stock', 'insert', null, payload, async () => {
        const { error: err } = await supabase.from('weft_yarn_stock').insert(payload)
        if (err) throw err
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  async function editYarn(row: WeftYarnStock) {
    const supplier = window.prompt('Supplier', row.supplier ?? '') ?? row.supplier
    const colour_no = window.prompt('Colour No', row.colour_no ?? '') ?? row.colour_no
    const colour_name = window.prompt('Colour Name', row.colour_name ?? '') ?? row.colour_name
    const stockRaw = window.prompt('Stock kg', String(row.stock_kg))
    if (stockRaw == null) return
    const stock_kg = Number(stockRaw)
    if (Number.isNaN(stock_kg)) {
      setError('Invalid stock')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        supplier,
        colour_no,
        colour_name,
        stock_kg,
        updated_at: new Date().toISOString(),
      }
      await applyOrQueue('weft_yarn_stock', 'update', row.id, payload, async () => {
        const { error: err } = await supabase
          .from('weft_yarn_stock')
          .update(payload)
          .eq('id', row.id)
        if (err) throw err
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Edit failed')
    } finally {
      setBusy(false)
    }
  }

  async function deleteYarn(row: WeftYarnStock) {
    if (!window.confirm(`Delete colour ${row.colour_name ?? row.colour_no ?? row.id}?`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await applyOrQueue('weft_yarn_stock', 'delete', row.id, { id: row.id }, async () => {
        const { error: err } = await supabase.from('weft_yarn_stock').delete().eq('id', row.id)
        if (err) throw err
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Stock Master</h1>
        <div className="segment">
          <button
            type="button"
            className={tab === 'beam' ? 'seg active' : 'seg'}
            onClick={() => setTab('beam')}
          >
            Beam Pipe
          </button>
          <button
            type="button"
            className={tab === 'weft' ? 'seg active' : 'seg'}
            onClick={() => setTab('weft')}
          >
            Weft Yarn
          </button>
        </div>
      </header>

      {tab === 'beam' ? (
        <>
          <div className="list">
            {beams.map((row) => (
              <article key={row.id} className="card-row surface row-top">
                <div>
                  <strong>{row.variety_name}</strong>
                  <div className="text-muted">{row.quantity_pcs} pcs</div>
                </div>
                <div className="icon-actions">
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    disabled={busy}
                    aria-label="Edit"
                    onClick={() => void editBeam(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    disabled={busy}
                    aria-label="Delete"
                    onClick={() => void deleteBeam(row)}
                  >
                    Del
                  </button>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="btn-warp" disabled={busy} onClick={() => void addBeamVariety()}>
            + Add Variety
          </button>
        </>
      ) : (
        <>
          <div className="list">
            {yarns.map((row) => (
              <article key={row.id} className="card-row surface row-top">
                <div>
                  <strong>{row.colour_name || row.colour_no || 'Colour'}</strong>
                  <div className="text-muted">
                    {row.supplier ?? '—'} · {row.colour_no ?? '—'} · {row.stock_kg} kg
                  </div>
                </div>
                <div className="icon-actions">
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    disabled={busy}
                    aria-label="Edit"
                    onClick={() => void editYarn(row)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    disabled={busy}
                    aria-label="Delete"
                    onClick={() => void deleteYarn(row)}
                  >
                    Del
                  </button>
                </div>
              </article>
            ))}
          </div>
          <button type="button" className="btn-warp" disabled={busy} onClick={() => void addYarn()}>
            + Add Colour
          </button>
        </>
      )}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
