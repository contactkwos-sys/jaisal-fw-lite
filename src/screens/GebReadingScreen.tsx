import { useCallback, useEffect, useMemo, useState } from 'react'
import { RecordActions } from '../components/RecordActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { GebReading } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
import { confirmDeleteRecord } from '../lib/recordCrud'
import { supabase } from '../lib/supabase'

type TabId = 'entry' | 'list' | 'graph'

const DEFAULT_RATE = 8.5

export function GebReadingScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<GebReading[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [readingDate, setReadingDate] = useState(todayISO())
  const [meterReading, setMeterReading] = useState('')
  const [previousReading, setPreviousReading] = useState(0)
  const [rate, setRate] = useState(String(DEFAULT_RATE))
  const [editId, setEditId] = useState<string | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('geb_readings')
      .select('*')
      .order('reading_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(120)
    if (err) throw err
    const list = (data as GebReading[]) ?? []
    setRows(list)
    if (!editId && list[0]) {
      setPreviousReading(Number(list[0].meter_reading) || 0)
      setRate(String(list[0].rate_per_unit ?? DEFAULT_RATE))
    } else if (!editId && !list.length) {
      setPreviousReading(0)
    }
  }, [editId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const current = Number(meterReading) || 0
  const units = Math.max(0, current - previousReading)
  const rateNum = Number(rate) || DEFAULT_RATE
  const amount = units * rateNum

  const chartRows = useMemo(() => {
    return [...rows]
      .slice(0, 14)
      .reverse()
      .map((r) => ({
        date: r.reading_date.slice(5),
        units: Number(r.unit_consumed) || 0,
        amount: Number(r.amount) || 0,
      }))
  }, [rows])

  const maxUnits = Math.max(1, ...chartRows.map((c) => c.units))

  function openView(row: GebReading) {
    setViewOnly(true)
    setEditId(row.id)
    setReadingDate(row.reading_date)
    setMeterReading(String(row.meter_reading))
    setPreviousReading(Number(row.previous_reading) || 0)
    setRate(String(row.rate_per_unit ?? DEFAULT_RATE))
    setTab('entry')
  }

  function openEdit(row: GebReading) {
    setViewOnly(false)
    setEditId(row.id)
    setReadingDate(row.reading_date)
    setMeterReading(String(row.meter_reading))
    setPreviousReading(Number(row.previous_reading) || 0)
    setRate(String(row.rate_per_unit ?? DEFAULT_RATE))
    setTab('entry')
  }

  function resetForm() {
    setEditId(null)
    setViewOnly(false)
    setMeterReading('')
    if (rows[0]) {
      setPreviousReading(Number(rows[0].meter_reading) || 0)
      setRate(String(rows[0].rate_per_unit ?? DEFAULT_RATE))
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || viewOnly) return
    if (current <= 0) {
      setError('Enter meter reading')
      return
    }
    if (current < previousReading) {
      setError('Current reading cannot be less than previous')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        reading_date: readingDate,
        meter_reading: current,
        previous_reading: previousReading,
        unit_consumed: units,
        rate_per_unit: rateNum,
        amount,
        entered_by: enteredBy,
      }
      if (editId) {
        const row = rows.find((r) => r.id === editId)
        const result = await applyEditDeleteOrQueue({
          isCeo,
          createdAt: row?.created_at || new Date().toISOString(),
          tableName: 'geb_readings',
          recordId: editId,
          action: 'edit',
          requestedBy: enteredBy,
          newData: payload,
          apply: async () => {
            const { error: uErr } = await supabase.from('geb_readings').update(payload).eq('id', editId)
            if (uErr) throw uErr
          },
        })
        setMessage(result === 'applied' ? 'Reading updated' : 'Edit queued for CEO approval')
      } else {
        const { error: iErr } = await supabase.from('geb_readings').insert(payload)
        if (iErr) throw iErr
        setMessage('GEB reading saved')
      }
      resetForm()
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(row: GebReading) {
    if (!profile) return
    if (!confirmDeleteRecord({ label: row.reading_date })) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at,
        tableName: 'geb_readings',
        recordId: row.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          const { error: dErr } = await supabase.from('geb_readings').delete().eq('id', row.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Deleted' : 'Delete queued for CEO approval')
      if (editId === row.id) resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>GEB Electricity</h1>
        <p className="text-muted">Daily meter reading · units & cost</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: 'Entry' },
            { id: 'list', label: 'List' },
            { id: 'graph', label: 'Graph' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
          {editId ? (
            <p className="text-muted2">
              {viewOnly ? 'Viewing reading' : 'Editing reading'} ·{' '}
              <button type="button" className="btn-ghost" onClick={resetForm}>
                {viewOnly ? 'Close' : 'Cancel edit'}
              </button>
            </p>
          ) : null}
          <label className="field">
            <span>Reading date</span>
            <input
              type="date"
              value={readingDate}
              onChange={(e) => setReadingDate(e.target.value)}
              required
              readOnly={viewOnly}
            />
          </label>
          <label className="field">
            <span>Previous reading (auto)</span>
            <input className="num" type="number" value={previousReading} readOnly />
          </label>
          <label className="field">
            <span>Meter reading</span>
            <input
              className="num"
              type="number"
              step="0.01"
              value={meterReading}
              onChange={(e) => setMeterReading(e.target.value)}
              required
              readOnly={viewOnly}
            />
          </label>
          <label className="field">
            <span>Units consumed (auto)</span>
            <input className="num" type="number" value={units} readOnly />
          </label>
          <label className="field">
            <span>Rate per unit</span>
            <input
              className="num"
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              readOnly={viewOnly}
            />
          </label>
          <label className="field">
            <span>Amount (auto)</span>
            <input className="num" type="number" value={amount.toFixed(2)} readOnly />
          </label>
          {!viewOnly ? (
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : editId ? 'Update reading' : 'Save reading'}
            </button>
          ) : null}
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="list">
          {rows.map((row) => (
            <article key={row.id} className="card-row surface row-top">
              <div>
                <strong>{row.reading_date}</strong>
                <div className="text-muted">
                  Meter {row.meter_reading} · Units {row.unit_consumed} · ₹{Number(row.amount).toFixed(2)}
                </div>
                <div className="text-muted2">
                  Prev {row.previous_reading} · Rate {row.rate_per_unit} · {row.entered_by}
                </div>
              </div>
              <RecordActions
                busy={busy}
                onView={() => openView(row)}
                onEdit={() => openEdit(row)}
                onDelete={() => void handleDelete(row)}
              />
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No readings yet</p> : null}
        </div>
      ) : null}

      {tab === 'graph' ? (
        <section className="dash-panel surface">
          <h3>Last 14 readings — daily units</h3>
          {!chartRows.length ? (
            <p className="text-muted">No data</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160, paddingTop: 12 }}>
              {chartRows.map((c) => (
                <div key={c.date} style={{ flex: 1, textAlign: 'center' }}>
                  <div
                    title={`${c.units} units · ₹${c.amount.toFixed(0)}`}
                    style={{
                      height: `${Math.max(4, (c.units / maxUnits) * 120)}px`,
                      background: 'var(--color-primary, #0d7377)',
                      borderRadius: 4,
                      marginBottom: 4,
                    }}
                  />
                  <div className="text-muted2" style={{ fontSize: 10 }}>
                    {c.date}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-muted" style={{ marginTop: 12 }}>
            Total cost (shown): ₹{chartRows.reduce((s, c) => s + c.amount, 0).toFixed(2)}
          </p>
        </section>
      ) : null}
    </div>
  )
}
