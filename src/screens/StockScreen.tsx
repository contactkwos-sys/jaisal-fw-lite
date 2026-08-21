import { useCallback, useEffect, useState } from 'react'
import { YarnStockPanel } from '../components/YarnStockPanel'
import { enqueueApproval } from '../lib/approval'
import { useAuth } from '../lib/auth'
import type { BeamPipeStock } from '../lib/database.types'
import { supabase } from '../lib/supabase'

type Tab = 'beam' | 'weft'
type Props = {
  initialTab?: Tab
  onTabChange?: (tab: Tab) => void
}

export function StockScreen({ initialTab = 'beam', onTabChange }: Props) {
  const { isCeo, profile } = useAuth()
  const [tab, setTab] = useState<Tab>(initialTab)

  useEffect(() => {
    if (initialTab) setTab(initialTab)
  }, [initialTab])

  function selectTab(next: Tab) {
    setTab(next)
    onTabChange?.(next)
  }

  const [beams, setBeams] = useState<BeamPipeStock[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadBeams = useCallback(async () => {
    const { data: b, error: bErr } = await supabase
      .from('beam_pipe_stock')
      .select('*')
      .order('variety_name')
    if (bErr) throw bErr
    setBeams((b as BeamPipeStock[]) ?? [])
  }, [])

  useEffect(() => {
    if (tab !== 'beam') return
    void loadBeams().catch((e: Error) => setError(e.message))
  }, [tab, loadBeams])

  async function applyOrQueue(
    tableName: 'beam_pipe_stock',
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
    await loadBeams()
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

  if (tab === 'weft') {
    return (
      <div className="screen yarn-stock-screen">
        <YarnStockPanel />
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Warp Beam Stock</h1>
        <div className="segment">
          <button
            type="button"
            className={tab === 'beam' ? 'seg active' : 'seg'}
            onClick={() => selectTab('beam')}
          >
            Beam Pipe
          </button>
          <button
            type="button"
            className="seg"
            onClick={() => selectTab('weft')}
          >
            Yarn Stock
          </button>
        </div>
      </header>

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
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
      <button type="button" className="btn-warp" disabled={busy} onClick={() => void addBeamVariety()}>
        + Add Variety
      </button>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
