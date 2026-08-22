import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES, type ProgramBookEntry } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { printSummary, rowsToHtml } from '../lib/share'
import { supabase } from '../lib/supabase'

type TabId = 'entry' | 'list'

export function ProgramBookScreen() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<TabId>('entry')
  const [rows, setRows] = useState<ProgramBookEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [programNumber, setProgramNumber] = useState('')
  const [linkedMachine, setLinkedMachine] = useState<string>(MACHINES[0])
  const [matchingCard, setMatchingCard] = useState('')
  const [jobCardRef, setJobCardRef] = useState('')
  const [note, setNote] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('program_book')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150)
    if (err) throw err
    setRows((data as ProgramBookEntry[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.program_number.toLowerCase().includes(q) ||
        (r.linked_machine || '').toLowerCase().includes(q) ||
        (r.job_card_ref || '').toLowerCase().includes(q) ||
        (r.matching_card_ref || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: iErr } = await supabase.from('program_book').insert({
        program_number: programNumber.trim(),
        linked_machine: linkedMachine || null,
        matching_card_ref: matchingCard.trim() || null,
        print_status: 'pending',
        job_card_ref: jobCardRef.trim() || null,
        note: note.trim() || null,
        entry_date: entryDate,
        entered_by: enteredBy,
      })
      if (iErr) throw iErr
      setMessage('Program saved')
      setProgramNumber('')
      setMatchingCard('')
      setJobCardRef('')
      setNote('')
      setTab('list')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function selectAndPrint(row: ProgramBookEntry) {
    setBusy(true)
    setError(null)
    try {
      const { error: uErr } = await supabase
        .from('program_book')
        .update({ print_status: 'printed' })
        .eq('id', row.id)
      if (uErr) throw uErr
      printSummary(
        `Program ${row.program_number}`,
        rowsToHtml([
          ['Program No', row.program_number],
          ['Machine', row.linked_machine],
          ['Matching card', row.matching_card_ref],
          ['Job card ref', row.job_card_ref],
          ['Print status', 'printed'],
          ['Note', row.note],
          ['Date', row.entry_date],
        ]),
      )
      setMessage(`Selected & printed ${row.program_number}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Program Book</h1>
        <p className="text-muted">Program Supervisor · link machine · search by number</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'entry', label: 'New Program' },
            { id: 'list', label: 'Book / Search' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {tab === 'entry' ? (
        <form className="form-stack" onSubmit={(e) => void handleSave(e)}>
          <label className="field">
            <span>Program number</span>
            <input value={programNumber} onChange={(e) => setProgramNumber(e.target.value)} required />
          </label>
          <label className="field">
            <span>Linked machine</span>
            <select value={linkedMachine} onChange={(e) => setLinkedMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Matching card ref</span>
            <input value={matchingCard} onChange={(e) => setMatchingCard(e.target.value)} />
          </label>
          <label className="field">
            <span>Job card ref</span>
            <input value={jobCardRef} onChange={(e) => setJobCardRef(e.target.value)} />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </label>
          <label className="field">
            <span>Entry date</span>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save program'}
          </button>
        </form>
      ) : null}

      {tab === 'list' ? (
        <div className="form-stack">
          <label className="field">
            <span>Search by program no. / machine / refs</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. PB-12" />
          </label>
          <div className="list">
            {filtered.map((r) => (
              <article key={r.id} className="card-row surface row-top">
                <div>
                  <strong>
                    #{r.program_number} · {r.linked_machine || '—'} · {r.print_status}
                  </strong>
                  <div className="text-muted">
                    Matching {r.matching_card_ref || '—'} · Job {r.job_card_ref || '—'}
                  </div>
                  <div className="text-muted2">
                    {r.entry_date} · {r.note || '—'}
                  </div>
                </div>
                <ShareActions
                  onPrint={() => void selectAndPrint(r)}
                  extra={
                    <button type="button" disabled={busy} onClick={() => void selectAndPrint(r)}>
                      Select & Print
                    </button>
                  }
                />
              </article>
            ))}
            {!filtered.length ? <p className="text-muted">No programs found</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
