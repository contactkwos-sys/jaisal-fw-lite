import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { allocateLotNumber, peekNextLotNumber, resolvePartyForJobCard } from '../lib/checking'
import type { CheckingEntry, JobCard } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { supabase } from '../lib/supabase'

type TabId = 'entry' | 'list'

type JobOpt = JobCard & { party_hint?: string | null }

export function CheckingScreen() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [jobs, setJobs] = useState<JobOpt[]>([])
  const [rows, setRows] = useState<CheckingEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [jobCardId, setJobCardId] = useState('')
  const [partyName, setPartyName] = useState('')
  const [dno, setDno] = useState('')
  const [colour, setColour] = useState('')
  const [machineNo, setMachineNo] = useState('')
  const [programMeter, setProgramMeter] = useState('')
  const [okMeters, setOkMeters] = useState('')
  const [damageMeters, setDamageMeters] = useState('0')
  const [freshMeters, setFreshMeters] = useState('0')
  const [damageReason, setDamageReason] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [nextLot, setNextLot] = useState(1)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'
  const totalMeters =
    (Number(okMeters) || 0) + (Number(damageMeters) || 0) + (Number(freshMeters) || 0)

  const loadJobs = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('job_cards')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80)
    if (err) throw err
    setJobs((data as JobOpt[]) ?? [])
  }, [])

  const loadRows = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('checking_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)
    if (err) throw err
    setRows((data as CheckingEntry[]) ?? [])
  }, [])

  const refreshLot = useCallback(async () => {
    setNextLot(await peekNextLotNumber())
  }, [])

  useEffect(() => {
    void loadJobs().catch((e: Error) => setError(e.message))
    void refreshLot().catch((e: Error) => setError(e.message))
  }, [loadJobs, refreshLot])

  useEffect(() => {
    if (tab === 'list') void loadRows().catch((e: Error) => setError(e.message))
  }, [tab, loadRows])

  const selectedJob = useMemo(() => jobs.find((j) => j.id === jobCardId) ?? null, [jobs, jobCardId])

  async function onSelectJob(id: string) {
    setJobCardId(id)
    const job = jobs.find((j) => j.id === id)
    if (!job) return
    setDno(job.dno || '')
    setColour(job.colour || '')
    setMachineNo(job.machine_no || '')
    setProgramMeter(job.total_meter != null ? String(job.total_meter) : '')
    setOkMeters(job.total_meter != null ? String(job.total_meter) : '')
    try {
      const party = await resolvePartyForJobCard(id)
      setPartyName(party || '')
    } catch {
      setPartyName('')
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile || !jobCardId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const lot = await allocateLotNumber()
      const payload = {
        job_card_id: jobCardId,
        ok_meters: Number(okMeters) || 0,
        damage_meters: Number(damageMeters) || 0,
        fresh_meters: Number(freshMeters) || 0,
        total_meters: totalMeters,
        damage_reason: damageReason.trim() || null,
        lot_number: lot,
        entry_date: entryDate,
        entered_by: enteredBy,
        status: 'ready_for_dispatch',
        party_name: partyName.trim() || null,
        dno: dno.trim() || null,
        colour: colour.trim() || null,
        machine_no: machineNo.trim() || null,
        program_meter: Number(programMeter) || null,
      }
      const { error: iErr } = await supabase.from('checking_entries').insert(payload)
      if (iErr) throw iErr
      setMessage(`Checking saved · Lot ${lot} · Ready for Dispatch`)
      setJobCardId('')
      setPartyName('')
      setDno('')
      setColour('')
      setMachineNo('')
      setProgramMeter('')
      setOkMeters('')
      setDamageMeters('0')
      setFreshMeters('0')
      setDamageReason('')
      await refreshLot()
      setTab('list')
      await loadRows()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Checking & Dispatch</h1>
        <p className="text-muted">Select job card → check meters → Ready for Dispatch</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: 'Checking Entry' },
            { id: 'list', label: 'List' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
          <label className="field">
            <span>Job card</span>
            <select value={jobCardId} onChange={(e) => void onSelectJob(e.target.value)} required>
              <option value="">Select job card</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_card_no || j.id.slice(0, 8)} · {j.dno} · {j.machine_no || '—'} ·{' '}
                  {j.total_meter ?? '—'}m
                </option>
              ))}
            </select>
          </label>

          {selectedJob ? (
            <>
              <label className="field">
                <span>Party (auto, editable)</span>
                <input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
              </label>
              <label className="field">
                <span>Dno</span>
                <input value={dno} onChange={(e) => setDno(e.target.value)} />
              </label>
              <label className="field">
                <span>Colour</span>
                <input value={colour} onChange={(e) => setColour(e.target.value)} />
              </label>
              <label className="field">
                <span>Machine</span>
                <input value={machineNo} onChange={(e) => setMachineNo(e.target.value)} />
              </label>
              <label className="field">
                <span>Program meter</span>
                <input
                  className="num"
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  value={programMeter}
                  onChange={(e) => setProgramMeter(e.target.value)}
                />
              </label>
            </>
          ) : null}

          <label className="field">
            <span>OK meters</span>
            <input
              className="num"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={okMeters}
              onChange={(e) => setOkMeters(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Damage meters</span>
            <input
              className="num"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={damageMeters}
              onChange={(e) => setDamageMeters(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Fresh meters</span>
            <input
              className="num"
              inputMode="decimal"
              type="number"
              step="0.01"
              value={freshMeters}
              onChange={(e) => setFreshMeters(e.target.value)}
            />
          </label>
          <p className="text-muted2">
            Total (auto): <strong className="num">{totalMeters.toFixed(2)}</strong> · Next lot:{' '}
            <strong>{nextLot}</strong>
          </p>
          <label className="field">
            <span>Damage reason</span>
            <input value={damageReason} onChange={(e) => setDamageReason(e.target.value)} />
          </label>
          <label className="field">
            <span>Entry date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy || !jobCardId}>
            {busy ? 'Saving…' : 'Complete checking → Ready for Dispatch'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="list">
          {rows.map((r) => (
            <article key={r.id} className="card-row surface">
              <div>
                <strong>
                  Lot {r.lot_number} · {r.status.replaceAll('_', ' ').toUpperCase()}
                </strong>
                <div className="text-muted">
                  {r.party_name || '—'} · {r.dno || '—'} · {r.colour || '—'} · {r.machine_no || '—'}
                </div>
                <div className="text-muted2">
                  OK {r.ok_meters} · Dmg {r.damage_meters} · Fresh {r.fresh_meters} · Total{' '}
                  {r.total_meters} · {r.entry_date}
                </div>
              </div>
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No checking entries yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
