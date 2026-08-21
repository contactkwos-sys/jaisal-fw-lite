import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { applyOrQueue, todayISO } from '../../lib/mutate'
import { DAMAGE_TYPES, nextLotNo } from '../../lib/programDispatch'
import { supabase } from '../../lib/supabase'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type ProgramOpt = {
  id: string
  program_no: string
  marka: string
  label: string
  design: string
}

type DamageDraft = {
  key: string
  damage_type: string
  damage_operator: string
  damage_meter: string
  remarks: string
}

type Props = { onGo: (s: PdSub) => void }

function emptyDamage(): DamageDraft {
  return {
    key: crypto.randomUUID(),
    damage_type: 'Stain',
    damage_operator: '',
    damage_meter: '',
    remarks: '',
  }
}

export function PdFolding({ onGo }: Props) {
  const { isCeo, profile } = useAuth()
  const [programs, setPrograms] = useState<ProgramOpt[]>([])
  const [programId, setProgramId] = useState('')
  const [marka, setMarka] = useState('')
  const [lotNo, setLotNo] = useState('LOT-0001')
  const [meterIn, setMeterIn] = useState('')
  const [checkedMeter, setCheckedMeter] = useState('')
  const [checker, setChecker] = useState('')
  const [date, setDate] = useState(todayISO())
  const [shift, setShift] = useState<'Day' | 'Night'>('Day')
  const [remarks, setRemarks] = useState('')
  const [damages, setDamages] = useState<DamageDraft[]>([emptyDamage()])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [recent, setRecent] = useState<Array<Record<string, unknown>>>([])

  const damageTotal = useMemo(
    () => damages.reduce((s, d) => s + (Number(d.damage_meter) || 0), 0),
    [damages],
  )
  const finalMeter = Math.max(0, (Number(meterIn) || 0) - damageTotal)

  const load = useCallback(async () => {
    const [{ data: progs }, lot] = await Promise.all([
      supabase
        .from('programs')
        .select('id, program_no, marka, design_no, party_name, status')
        .not('status', 'eq', 'Cancelled')
        .order('created_at', { ascending: false })
        .limit(100),
      nextLotNo(),
    ])
    setLotNo(lot)
    const opts: ProgramOpt[] = (progs ?? []).map((p) => ({
      id: p.id,
      program_no: p.program_no || p.id.slice(0, 8),
      marka: p.marka || '',
      design: p.design_no || '—',
      label: `${p.program_no || 'PRG'} · ${p.party_name || '—'} · ${p.marka || '—'}`,
    }))
    setPrograms(opts)
    if (!programId && opts[0]) {
      setProgramId(opts[0].id)
      setMarka(opts[0].marka)
    }

    const { data: lots } = await supabase
      .from('checking_lots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setRecent((lots as Array<Record<string, unknown>>) ?? [])
  }, [programId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    const p = programs.find((x) => x.id === programId)
    if (p) setMarka(p.marka)
  }, [programId, programs])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !programId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const mIn = Number(meterIn) || 0
      const checked = Number(checkedMeter) || mIn
      const dmg = damageTotal
      const final = Math.max(0, mIn - dmg)
      const prog = programs.find((p) => p.id === programId)
      const lot = lotNo

      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'checking_lots',
        action: 'insert',
        recordId: null,
        payload: { lot_no: lot, program_id: programId, meter_in: mIn, final_meter: final },
        apply: async () => {
          const { data, error: lErr } = await supabase
            .from('checking_lots')
            .insert({
              lot_no: lot,
              program_id: programId,
              marka: marka || prog?.marka || null,
              meter_in: mIn,
              checked_meter: checked,
              damage_meter: dmg,
              final_meter: final,
              checker_name: checker.trim() || null,
              entry_date: date,
              shift,
              remarks: remarks.trim() || null,
              status: 'Checked',
            })
            .select('id')
            .single()
          if (lErr) throw lErr

          const dmgRows = damages
            .filter((d) => Number(d.damage_meter) > 0)
            .map((d) => ({
              lot_id: data.id,
              damage_type: d.damage_type,
              damage_operator: d.damage_operator.trim() || null,
              damage_meter: Number(d.damage_meter) || 0,
              remarks: d.remarks.trim() || null,
            }))
          if (dmgRows.length) {
            const { error: dErr } = await supabase.from('lot_damages').insert(dmgRows)
            if (dErr) throw dErr
          }

          // Mirror into folding_entries for legacy reports
          await supabase.from('folding_entries').insert({
            dno: prog?.design || lot,
            meter_folded: final,
            rolls: 1,
            program_id: programId,
            lot_no: lot,
            marka: marka || null,
            meter_in: mIn,
            damage_meter: dmg,
            final_meter: final,
            checker_name: checker.trim() || null,
            shift,
            remarks: remarks.trim() || null,
          })
        },
      })
      setMessage(result === 'applied' ? `Lot ${lot} checked · Final ${final} m` : 'Sent to approval queue')
      setMeterIn('')
      setCheckedMeter('')
      setDamages([emptyDamage()])
      setRemarks('')
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
        <h1>Folding &amp; Checking</h1>
        <p className="pd-lead">Auto lot numbers · damage entry · final meter = meter in − damage.</p>
        <button type="button" className="btn-sm" onClick={() => onGo('challan')}>
          Go to Challan
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form className="form-stack pd-form" onSubmit={(e) => void save(e)}>
        <div className="pd-form-grid">
          <label className="field">
            <span className="text-muted">Program No.</span>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} required>
              <option value="">Select</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Marka</span>
            <input value={marka} onChange={(e) => setMarka(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Lot No.</span>
            <input value={lotNo} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Meter In</span>
            <input
              type="number"
              step="0.1"
              value={meterIn}
              onChange={(e) => {
                setMeterIn(e.target.value)
                if (!checkedMeter) setCheckedMeter(e.target.value)
              }}
              required
            />
          </label>
          <label className="field">
            <span className="text-muted">Checked Meter</span>
            <input type="number" step="0.1" value={checkedMeter} onChange={(e) => setCheckedMeter(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Damage Meter (auto)</span>
            <input value={damageTotal} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Final Meter (auto)</span>
            <input value={finalMeter} readOnly className="pd-final-meter" />
          </label>
          <label className="field">
            <span className="text-muted">Checker Name</span>
            <input value={checker} onChange={(e) => setChecker(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
              <option>Day</option>
              <option>Night</option>
            </select>
          </label>
          <label className="field pd-span-2">
            <span className="text-muted">Remarks</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        </div>

        <h2 className="section-title">Damage Entry</h2>
        {damages.map((d, idx) => (
          <div key={d.key} className="pd-damage-row">
            <label className="field">
              <span className="text-muted">Damage Type</span>
              <select
                value={d.damage_type}
                onChange={(e) => {
                  const next = [...damages]
                  next[idx] = { ...d, damage_type: e.target.value }
                  setDamages(next)
                }}
              >
                {DAMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Damage Operator</span>
              <input
                value={d.damage_operator}
                onChange={(e) => {
                  const next = [...damages]
                  next[idx] = { ...d, damage_operator: e.target.value }
                  setDamages(next)
                }}
              />
            </label>
            <label className="field">
              <span className="text-muted">Damage Meter</span>
              <input
                type="number"
                step="0.1"
                value={d.damage_meter}
                onChange={(e) => {
                  const next = [...damages]
                  next[idx] = { ...d, damage_meter: e.target.value }
                  setDamages(next)
                }}
              />
            </label>
            <label className="field">
              <span className="text-muted">Remarks</span>
              <input
                value={d.remarks}
                onChange={(e) => {
                  const next = [...damages]
                  next[idx] = { ...d, remarks: e.target.value }
                  setDamages(next)
                }}
              />
            </label>
          </div>
        ))}
        <button type="button" className="btn-sm" onClick={() => setDamages([...damages, emptyDamage()])}>
          + Add Damage
        </button>

        <button type="submit" className="primary-save" disabled={busy}>
          Save Checking · Create Lot
        </button>
      </form>

      <section className="pd-panel">
        <header className="pd-panel-h">
          <h2>Recent Lots</h2>
        </header>
        <div className="pd-table-wrap">
          <table className="pd-table">
            <thead>
              <tr>
                <th>Lot No.</th>
                <th>Marka</th>
                <th>Meter In</th>
                <th>Damage</th>
                <th>Final</th>
                <th>Checker</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={String(r.id)}>
                  <td className="num">{String(r.lot_no)}</td>
                  <td>{String(r.marka || '—')}</td>
                  <td className="num">{Number(r.meter_in || 0)}</td>
                  <td className="num">{Number(r.damage_meter || 0)}</td>
                  <td className="num">{Number(r.final_meter || 0)}</td>
                  <td>{String(r.checker_name || '—')}</td>
                  <td>
                    <span className="pd-pill ok">{String(r.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
