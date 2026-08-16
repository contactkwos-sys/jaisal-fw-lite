import { useCallback, useEffect, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES, type RepairingTracker } from '../lib/database.types'
import { applyOrQueue, nextDocNo, todayISO, uploadFactoryPhoto } from '../lib/mutate'
import { printSummary, rowsToHtml, shareWhatsApp } from '../lib/share'
import { supabase } from '../lib/supabase'

type Sub = 'request' | 'repair'
type Props = { initialSub?: Sub; filter?: string }

export function MaintenanceScreen({ initialSub = 'request' }: Props) {
  const { isCeo, profile } = useAuth()
  const [sub, setSub] = useState<Sub>(initialSub)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [priority, setPriority] = useState('Med')
  const [problem, setProblem] = useState('')
  const [itemNeeded, setItemNeeded] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [cost, setCost] = useState('0')

  const [itemName, setItemName] = useState('')
  const [forWhat, setForWhat] = useState<'Machine' | 'Utility'>('Machine')
  const [vendor, setVendor] = useState('')
  const [dateOut, setDateOut] = useState(todayISO())
  const [gatepassNo, setGatepassNo] = useState('')
  const [trackers, setTrackers] = useState<RepairingTracker[]>([])

  const loadTrackers = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('repairing_tracker')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40)
    if (err) throw err
    setTrackers((data as RepairingTracker[]) ?? [])
    const next = nextDocNo(
      'GP-',
      (data ?? []).map((r) => r.gatepass_no),
    )
    setGatepassNo(next)
  }, [])

  useEffect(() => {
    void loadTrackers().catch((e: Error) => setError(e.message))
  }, [loadTrackers])

  useEffect(() => {
    if (initialSub) setSub(initialSub)
  }, [initialSub])

  function requestText() {
    return `Maintenance Request\nMachine ${machine} · Priority ${priority}\nProblem: ${problem}\nItem: ${itemNeeded}\nAssigned: ${assignedTo}`
  }

  async function saveRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      let photo_url: string | null = null
      if (photo) photo_url = await uploadFactoryPhoto(photo, 'maintenance')
      const payload = {
        machine_no: machine,
        priority,
        problem: problem || null,
        item_needed: itemNeeded || null,
        photo_url,
        assigned_to: assignedTo || null,
        status: 'open',
        cost: Number(cost) || 0,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'maintenance_requests',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('maintenance_requests').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Request saved' : 'Sent to approval queue')
      setProblem('')
      setItemNeeded('')
      setPhoto(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveRepairOut(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        item_name: itemName.trim(),
        for_what: forWhat,
        vendor: vendor.trim() || null,
        gatepass_no: gatepassNo,
        date_out: dateOut,
        date_in: null,
        status: 'out',
        cost: 0,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'repairing_tracker',
        action: 'insert',
        recordId: null,
        payload,
        apply: async () => {
          const { error: iErr } = await supabase.from('repairing_tracker').insert(payload)
          if (iErr) throw iErr
        },
      })
      setMessage(result === 'applied' ? 'Repair OUT saved' : 'Sent to approval queue')
      setItemName('')
      setVendor('')
      await loadTrackers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function markReturned(row: RepairingTracker) {
    if (!profile) return
    const dateIn = window.prompt('Date In (YYYY-MM-DD)', todayISO())
    if (!dateIn) return
    setBusy(true)
    setError(null)
    try {
      const payload = { date_in: dateIn, status: 'returned' }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'repairing_tracker',
        action: 'update',
        recordId: row.id,
        payload,
        apply: async () => {
          const { error: uErr } = await supabase
            .from('repairing_tracker')
            .update(payload)
            .eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      setMessage(result === 'applied' ? 'Marked returned' : 'Sent to approval queue')
      await loadTrackers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Maintenance</h1>
        <SubTabs
          value={sub}
          onChange={(id) => setSub(id as Sub)}
          options={[
            { id: 'request', label: 'New Request' },
            { id: 'repair', label: 'Repair Out/In' },
          ]}
        />
      </header>

      {sub === 'request' ? (
        <form className="form-stack" onSubmit={(e) => void saveRequest(e)}>
          <label className="field">
            <span className="text-muted">Machine</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option>High</option>
              <option>Med</option>
              <option>Low</option>
            </select>
          </label>
          <label className="field">
            <span className="text-muted">Problem</span>
            <input value={problem} onChange={(e) => setProblem(e.target.value)} required />
          </label>
          <label className="field">
            <span className="text-muted">Item Chahiye</span>
            <input value={itemNeeded} onChange={(e) => setItemNeeded(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Photo</span>
            <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          </label>
          <label className="field">
            <span className="text-muted">Assigned To</span>
            <input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} />
          </label>
          <label className="field">
            <span className="text-muted">Cost (₹) — Phase 8</span>
            <input className="num" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </label>
          <ShareActions
            onWhatsApp={() => shareWhatsApp(requestText())}
            onPrint={() =>
              printSummary(
                'Maintenance Request',
                rowsToHtml([
                  ['Machine', machine],
                  ['Priority', priority],
                  ['Problem', problem],
                  ['Item', itemNeeded],
                  ['Assigned', assignedTo],
                ]),
              )
            }
          />
          <button type="submit" className="primary-save" disabled={busy}>Save Request</button>
        </form>
      ) : null}

      {sub === 'repair' ? (
        <>
          <form className="form-stack" onSubmit={(e) => void saveRepairOut(e)}>
            <label className="field">
              <span className="text-muted">Item</span>
              <input value={itemName} onChange={(e) => setItemName(e.target.value)} required />
            </label>
            <label className="field">
              <span className="text-muted">Kis Liye</span>
              <select value={forWhat} onChange={(e) => setForWhat(e.target.value as 'Machine' | 'Utility')}>
                <option value="Machine">Machine</option>
                <option value="Utility">Utility</option>
              </select>
            </label>
            <label className="field">
              <span className="text-muted">Kisko Gaya</span>
              <input value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Date Out</span>
              <input type="date" value={dateOut} onChange={(e) => setDateOut(e.target.value)} />
            </label>
            <label className="field">
              <span className="text-muted">Gatepass No</span>
              <input value={gatepassNo} onChange={(e) => setGatepassNo(e.target.value)} required />
            </label>
            <ShareActions
              onWhatsApp={() =>
                shareWhatsApp(
                  `Repair OUT ${gatepassNo}\nItem ${itemName}\nFor ${forWhat}\nVendor ${vendor}\nOut ${dateOut}`,
                )
              }
              onPrint={() =>
                printSummary(
                  `Gatepass ${gatepassNo}`,
                  rowsToHtml([
                    ['Item', itemName],
                    ['For', forWhat],
                    ['Vendor', vendor],
                    ['Date Out', dateOut],
                    ['Date In', ''],
                  ]),
                )
              }
            />
            <button type="submit" className="primary-save" disabled={busy}>Save OUT</button>
          </form>

          <h2 className="section-title">Tracker</h2>
          <div className="list">
            {trackers.map((t) => (
              <article key={t.id} className="card-row surface row-top">
                <div>
                  <strong>{t.item_name}</strong>
                  <div className="text-muted">
                    {t.gatepass_no} · {t.for_what} · {t.vendor ?? '—'} · {t.status}
                  </div>
                  <div className="text-muted2">
                    Out {t.date_out} · In {t.date_in ?? '—'}
                  </div>
                </div>
                {t.status === 'out' ? (
                  <button type="button" className="btn-ghost" disabled={busy} onClick={() => void markReturned(t)}>
                    Date In
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
