import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { applyOrQueue, todayISO } from '../../lib/mutate'
import { DAMAGE_TYPES, nextLotNo } from '../../lib/programDispatch'
import { supabase } from '../../lib/supabase'
import { handleUserError } from '../../lib/userError'
import type { PdSub } from '../../screens/ProgramDispatchScreen'

type ProgramOpt = {
  id: string
  program_no: string
  marka: string
  label: string
  design: string
  party: string
  colour: string
  pending: boolean
}

type DamageDraft = {
  key: string
  damage_type: string
  damage_operator: string
  damage_meter: string
  remarks: string
}

type CheckAction = 'Pass' | 'Hold' | 'Reject'

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
  const [checkAction, setCheckAction] = useState<CheckAction>('Pass')
  const [showRemarks, setShowRemarks] = useState(false)
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
  const selectedProg = programs.find((p) => p.id === programId)

  const load = useCallback(async () => {
    const [{ data: progs }, { data: entries }, { data: lotsAll }, lot] = await Promise.all([
      supabase
        .from('programs')
        .select('id, program_no, marka, design_no, party_name, colour, status, produced_meter, total_meter')
        .not('status', 'eq', 'Cancelled')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('production_entries').select('program_id, total_meter').limit(2000),
      supabase.from('checking_lots').select('program_id, final_meter, status').limit(2000),
      nextLotNo(),
    ])
    setLotNo(lot)

    const producedBy = new Map<string, number>()
    for (const e of entries ?? []) {
      if (!e.program_id) continue
      producedBy.set(e.program_id, (producedBy.get(e.program_id) || 0) + Number(e.total_meter || 0))
    }
    const checkedBy = new Map<string, number>()
    for (const l of lotsAll ?? []) {
      if (!l.program_id) continue
      const st = String(l.status || '')
      if (/hold|reject/i.test(st)) continue
      checkedBy.set(l.program_id, (checkedBy.get(l.program_id) || 0) + Number(l.final_meter || 0))
    }

    const opts: ProgramOpt[] = (progs ?? []).map((p) => {
      const produced = producedBy.get(p.id) || Number(p.produced_meter || 0)
      const checked = checkedBy.get(p.id) || 0
      const pending = produced > checked + 0.01
      return {
        id: p.id,
        program_no: p.program_no || p.id.slice(0, 8),
        marka: p.marka || '',
        design: p.design_no || '—',
        party: p.party_name || '—',
        colour: p.colour || '—',
        pending,
        label: `${pending ? '● ' : ''}${p.program_no || 'PRG'} · ${p.party_name || '—'} · ${p.design_no || '—'}`,
      }
    })
    opts.sort((a, b) => Number(b.pending) - Number(a.pending))
    setPrograms(opts)
    if (!programId) {
      const firstPending = opts.find((o) => o.pending) || opts[0]
      if (firstPending) {
        setProgramId(firstPending.id)
        setMarka(firstPending.marka)
      }
    }

    const { data: lots } = await supabase
      .from('checking_lots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setRecent((lots as Array<Record<string, unknown>>) ?? [])
  }, [programId])

  useEffect(() => {
    void load().catch((e: Error) => setError(handleUserError('PD.folding.load', e, 'Could not load checking list.')))
  }, [load])

  useEffect(() => {
    const p = programs.find((x) => x.id === programId)
    if (p) setMarka(p.marka)
  }, [programId, programs])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!programId) {
      setError('Please select Order / Program')
      return
    }
    const mIn = Number(meterIn) || 0
    if (mIn <= 0) {
      setError('Please enter Quantity greater than 0')
      return
    }
    if ((checkAction === 'Hold' || checkAction === 'Reject') && !remarks.trim()) {
      setError('Please add remarks for Hold or Reject')
      setShowRemarks(true)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const checked = Number(checkedMeter) || mIn
      const dmg = damageTotal
      const final = Math.max(0, mIn - dmg)
      const prog = programs.find((p) => p.id === programId)
      const lot = lotNo
      const status =
        checkAction === 'Pass' ? 'Checked' : checkAction === 'Hold' ? 'Hold' : 'Rejected'

      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'checking_lots',
        action: 'insert',
        recordId: null,
        payload: { lot_no: lot, program_id: programId, meter_in: mIn, final_meter: final, status },
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
              status,
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
      setMessage(
        result === 'applied'
          ? `Checking Saved · ${checkAction} · Lot ${lot} · ${final} m`
          : 'Sent for approval',
      )
      setMeterIn('')
      setCheckedMeter('')
      setDamages([emptyDamage()])
      setRemarks('')
      setCheckAction('Pass')
      setShowRemarks(false)
      await load()
    } catch (err) {
      setError(handleUserError('PD.folding.save', err, 'Could not save checking. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Checking</h1>
        <p className="pd-lead">Pending production listed first · Pass / Hold / Reject</p>
        <button type="button" className="btn-sm" onClick={() => onGo('challan')}>
          Go to Dispatch
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <form className="form-stack pd-form" onSubmit={(e) => void save(e)}>
        <div className="pd-form-grid">
          <label className="field">
            <span className="text-muted">Order / Program</span>
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} required>
              <option value="">Select pending…</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Customer</span>
            <input value={selectedProg?.party || ''} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Design / Colour</span>
            <input value={`${selectedProg?.design || '—'} · ${selectedProg?.colour || '—'}`} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Lot No.</span>
            <input value={lotNo} readOnly />
          </label>
          <label className="field">
            <span className="text-muted">Quantity (Meter In)</span>
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
            <span className="text-muted">Marka</span>
            <input value={marka} onChange={(e) => setMarka(e.target.value)} />
          </label>
        </div>

        <div className="pd-check-actions" role="group" aria-label="Checking result">
          {(['Pass', 'Hold', 'Reject'] as CheckAction[]).map((a) => (
            <button
              key={a}
              type="button"
              className={checkAction === a ? 'primary-save' : 'btn-warp'}
              onClick={() => {
                setCheckAction(a)
                if (a !== 'Pass') setShowRemarks(true)
              }}
            >
              {a}
            </button>
          ))}
        </div>

        {showRemarks || checkAction !== 'Pass' ? (
          <label className="field">
            <span className="text-muted">Remarks {checkAction !== 'Pass' ? '(required)' : ''}</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setShowRemarks(true)}>
            Add remarks
          </button>
        )}

        <details className="otp-more-details">
          <summary>More Details</summary>
          <div className="pd-form-grid" style={{ marginTop: 12 }}>
            <label className="field">
              <span className="text-muted">Checked Meter</span>
              <input type="number" step="0.1" value={checkedMeter} onChange={(e) => setCheckedMeter(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Checker</span>
              <input value={checker} onChange={(e) => setChecker(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Shift</span>
              <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Damage Total</span>
              <input value={damageTotal.toFixed(1)} readOnly />
            </label>
            <label className="field">
              <span className="text-muted">Final Meter</span>
              <input value={finalMeter.toFixed(1)} readOnly />
            </label>
          </div>
          {damages.map((d) => (
            <div key={d.key} className="pd-form-grid" style={{ marginTop: 8 }}>
              <label className="field">
                <span className="text-muted">Damage Type</span>
                <select
                  value={d.damage_type}
                  onChange={(e) =>
                    setDamages((prev) => prev.map((x) => (x.key === d.key ? { ...x, damage_type: e.target.value } : x)))
                  }
                >
                  {DAMAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="text-muted">Damage Meter</span>
                <input
                  type="number"
                  step="0.1"
                  value={d.damage_meter}
                  onChange={(e) =>
                    setDamages((prev) => prev.map((x) => (x.key === d.key ? { ...x, damage_meter: e.target.value } : x)))
                  }
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            className="btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => setDamages((prev) => [...prev, emptyDamage()])}
          >
            + Damage line
          </button>
        </details>

        <div className="otp-sticky-actions">
          <button type="button" className="btn-ghost" onClick={() => onGo('entry')}>
            Back
          </button>
          <button type="submit" className="primary-save" disabled={busy}>
            Save Checking
          </button>
        </div>
      </form>

      <section className="pd-panel" style={{ marginTop: 16 }}>
        <h2>Recent Lots</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Status</th>
                <th className="num">Final m</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={String(r.id)}>
                  <td>{String(r.lot_no || '—')}</td>
                  <td>{String(r.status || '—')}</td>
                  <td className="num">{Number(r.final_meter || 0).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
