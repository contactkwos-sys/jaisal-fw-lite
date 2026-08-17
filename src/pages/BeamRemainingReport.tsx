import { useCallback, useEffect, useMemo, useState } from 'react'
import { MACHINES } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

export type BeamRemainingRow = {
  machine_no: string
  item_name: string
  quality: string | null
  remaining_meter: number
  avg_daily_production: number
  remain_days: number | null
  today_production: number | null
  status: string | null
}

type LoadForm = {
  machine_no: string
  item_name: string
  quality: string
  pipe_no: string
  beam_count: string
  meter_per_beam: string
}

const emptyForm = (): LoadForm => ({
  machine_no: MACHINES[0],
  item_name: '',
  quality: '',
  pipe_no: '',
  beam_count: '1',
  meter_per_beam: '',
})

function rowTone(remainDays: number | null): 'urgent' | 'warn' | 'ok' {
  if (remainDays == null) return 'ok'
  if (remainDays < 5) return 'urgent'
  if (remainDays <= 10) return 'warn'
  return 'ok'
}

export function BeamRemainingReport() {
  const [rows, setRows] = useState<BeamRemainingRow[]>([])
  const [form, setForm] = useState<LoadForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('v_beam_remaining_report')
      .select(
        'machine_no, item_name, quality, remaining_meter, avg_daily_production, remain_days, today_production, status',
      )
      .order('machine_no')
    if (err) throw err
    setRows((data as BeamRemainingRow[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const totalRemaining = useMemo(
    () => rows.reduce((s, r) => s + Number(r.remaining_meter || 0), 0),
    [rows],
  )

  async function saveLoading(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const beamCount = Math.max(1, Number(form.beam_count) || 1)
      const meterPerBeam = Number(form.meter_per_beam)
      if (!form.item_name.trim()) throw new Error('Item name required')
      if (!(meterPerBeam > 0)) throw new Error('Meter per beam must be > 0')

      const total = beamCount * meterPerBeam
      const payload = {
        machine_no: form.machine_no,
        item_name: form.item_name.trim(),
        quality: form.quality.trim() || null,
        pipe_no: form.pipe_no.trim() || null,
        beam_count: beamCount,
        meter_per_beam: meterPerBeam,
        remaining_meter: total,
        loaded_date: todayISO(),
        status: 'RUNNING',
      }

      const { error: iErr } = await supabase.from('beam_loading').insert(payload)
      if (iErr) throw iErr

      setMessage('Beam loading saved')
      setForm(emptyForm())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen beam-remaining-screen">
      <header className="screen-header">
        <h1>Beam Remaining Report</h1>
      </header>

      <section className="surface beam-load-panel">
        <h2 className="section-title text-warp">New Beam Loading</h2>
        <form className="form-stack" onSubmit={(e) => void saveLoading(e)}>
          <label className="field">
            <span className="text-muted">Machine No</span>
            <select
              value={form.machine_no}
              onChange={(e) => setForm((f) => ({ ...f, machine_no: e.target.value }))}
            >
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Item Name</span>
            <input
              value={form.item_name}
              onChange={(e) => setForm((f) => ({ ...f, item_name: e.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span className="text-muted">Quality</span>
            <input
              value={form.quality}
              onChange={(e) => setForm((f) => ({ ...f, quality: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Pipe No</span>
            <input
              value={form.pipe_no}
              onChange={(e) => setForm((f) => ({ ...f, pipe_no: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="text-muted">Beam Count</span>
            <input
              className="num"
              type="number"
              min="1"
              step="1"
              value={form.beam_count}
              onChange={(e) => setForm((f) => ({ ...f, beam_count: e.target.value }))}
              required
            />
          </label>
          <label className="field">
            <span className="text-muted">Meter Per Beam</span>
            <input
              className="num"
              type="number"
              min="0"
              step="0.01"
              value={form.meter_per_beam}
              onChange={(e) => setForm((f) => ({ ...f, meter_per_beam: e.target.value }))}
              required
            />
          </label>
          <button type="submit" className="primary-save" disabled={busy}>
            Save Beam Loading
          </button>
        </form>
      </section>

      <section className="beam-report-panel">
        <div className="dash-table-wrap surface">
          <table className="dash-table beam-remain-table">
            <thead>
              <tr>
                <th>Machine No</th>
                <th>Item Name</th>
                <th>Quality</th>
                <th className="num">Remaining Meter</th>
                <th className="num">Today&apos;s Production</th>
                <th className="num">Remain Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const tone = rowTone(r.remain_days == null ? null : Number(r.remain_days))
                return (
                  <tr key={`${r.machine_no}-${r.item_name}-${idx}`} className={`beam-row-${tone}`}>
                    <td>{r.machine_no}</td>
                    <td>{r.item_name}</td>
                    <td>{r.quality || '—'}</td>
                    <td className="num">{Number(r.remaining_meter || 0).toFixed(1)}</td>
                    <td className="num">
                      {r.today_production == null ? '—' : Number(r.today_production).toFixed(1)}
                    </td>
                    <td className="num">
                      {r.remain_days == null ? '—' : Number(r.remain_days).toFixed(1)}
                    </td>
                    <td>{r.status || '—'}</td>
                  </tr>
                )
              })}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    No beam loadings yet
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="beam-total-row">
                <td colSpan={3}>
                  <strong>Total</strong>
                </td>
                <td className="num text-weft">
                  <strong>{totalRemaining.toFixed(1)}</strong>
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
