import { useCallback, useEffect, useMemo, useState } from 'react'
import { SampleJobCardPrint } from '../components/SampleJobCardPrint'
import { DtoStatusPill, ImageLightbox } from '../components/ImageLightbox'
import { useAuth } from '../lib/auth'
import { MACHINES } from '../lib/database.types'
import {
  createDinSampleCard,
  fetchDinById,
  fetchDins,
  fetchDinSampleCards,
  matchingColourLabel,
  type DinSampleCard,
  type DinWithMatchings,
} from '../lib/designToOrder'
import { todayISO } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'
import { printSummary, rowsToHtml, shareNativeOrWhatsApp, shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import type { IssuedCardData } from '../lib/sampleJobCard'

type Props = { onNavigate: (t: NavTarget) => void; initialDinId?: string }

const SHIFTS = ['Day', 'Night']

export function DtoSampleJobScreen({ onNavigate, initialDinId }: Props) {
  const { session, profile } = useAuth()
  const [dins, setDins] = useState<DinWithMatchings[]>([])
  const [dinId, setDinId] = useState(initialDinId || '')
  const [selectedMatchings, setSelectedMatchings] = useState<number[]>([])
  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [jobDate, setJobDate] = useState(todayISO())
  const [shift, setShift] = useState(SHIFTS[0])
  const [operator, setOperator] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [requiredMeter, setRequiredMeter] = useState('1')
  const [remarks, setRemarks] = useState('')
  const [cards, setCards] = useState<DinSampleCard[]>([])
  const [issued, setIssued] = useState<IssuedCardData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = await fetchDins(200)
    setDins(list)
    const pick = initialDinId || list[0]?.id || ''
    setDinId((prev) => prev || pick)
  }, [initialDinId])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  useEffect(() => {
    if (!dinId) return
    void fetchDinSampleCards(dinId)
      .then(setCards)
      .catch((e: Error) => setError(e.message))
  }, [dinId])

  const din = useMemo(() => dins.find((d) => d.id === dinId) || null, [dins, dinId])
  const matchings = useMemo(
    () => din?.din_matchings?.slice().sort((a, b) => a.matching_no - b.matching_no) || [],
    [din],
  )

  useEffect(() => {
    if (matchings.length && !selectedMatchings.length) {
      setSelectedMatchings([matchings[0].matching_no])
    }
  }, [matchings, selectedMatchings.length])

  function toggleMatching(no: number) {
    setSelectedMatchings((prev) => (prev.includes(no) ? prev.filter((x) => x !== no) : [...prev, no]))
  }

  async function issueCard(e: React.FormEvent) {
    e.preventDefault()
    if (!din || !selectedMatchings.length) {
      setError('Select DIN and at least one matching')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const picked = matchings.filter((m) => selectedMatchings.includes(m.matching_no))
      const weftColours = picked.map((m) => matchingColourLabel(m)).join(' | ')
      const card = await createDinSampleCard({
        din_id: din.id,
        din_number: din.din_number,
        matching_nos: selectedMatchings.slice().sort((a, b) => a - b),
        machine_no: machine,
        job_date: jobDate,
        shift,
        operator_name: operator,
        supervisor_name: supervisor,
        warp: din.common_warp || undefined,
        weft_colours: weftColours,
        required_meter: Number(requiredMeter) || 0,
        remarks,
        design_image_url: din.din_image_url,
        created_by: session?.user?.id || null,
      })
      setMessage(`Issued ${card.card_no}`)
      const issuedData: IssuedCardData = {
        id: card.sample_job_card_id || card.id,
        din_number: din.din_number,
        design_image_url: din.din_image_url,
        job_date: jobDate,
        machine_no: machine,
        work_quality: weftColours,
        status: 'pending',
        issued_by: profile?.full_name || '—',
        matchings: picked.map((m) => ({
          matching_no: m.matching_no,
          colours: [
            { colour_name: m.ground_colour || 'Ground', colour_number: 'G' },
            { colour_name: m.weft_1 || '—', colour_number: 'W1' },
            { colour_name: m.weft_2 || '—', colour_number: 'W2' },
            { colour_name: m.weft_3 || '—', colour_number: 'W3' },
          ].filter((c) => c.colour_name && c.colour_name !== '—'),
        })),
      }
      setIssued(issuedData)
      setCards(await fetchDinSampleCards(din.id))
      const refreshed = await fetchDinById(din.id)
      if (refreshed) setDins((prev) => prev.map((d) => (d.id === din.id ? refreshed : d)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Issue failed')
    } finally {
      setBusy(false)
    }
  }

  function shareText(card: DinSampleCard) {
    return [
      `Sample Job Card ${card.card_no}`,
      `DIN: ${din?.din_number || '—'}`,
      `Machine: ${card.machine_no || '—'}`,
      `Date: ${card.job_date}`,
      `Shift: ${card.shift || '—'}`,
      `Matchings: ${(card.matching_nos || []).join(', ')}`,
      `Required: ${card.required_meter ?? '—'} m`,
      din?.din_image_url ? `Design: ${din.din_image_url}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return (
    <div className="screen dto-screen">
      <header className="screen-header no-print">
        <div>
          <h1>Sample Job Card</h1>
          <p className="text-muted">
            Select matching(s) from a DESI and issue a sample job card (Print / WhatsApp).
          </p>
        </div>
        <button
          type="button"
          className="btn-warp"
          onClick={() => onNavigate({ screen: 'sample-job-card', module: 'orders' })}
        >
          Open Sample Job Card (Old / Historical)
        </button>
      </header>

      {error ? <p className="form-error no-print">{error}</p> : null}
      {message ? <p className="form-success no-print">{message}</p> : null}

      <form className="surface dto-panel no-print" onSubmit={(e) => void issueCard(e)}>
        <div className="dto-form-grid">
          <label className="field">
            <span>DESI No.</span>
            <select
              value={dinId}
              onChange={(e) => {
                setDinId(e.target.value)
                setSelectedMatchings([])
              }}
              required
            >
              <option value="">Select DESI…</option>
              {dins.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.din_number} {d.design_name ? `· ${d.design_name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Machine No.</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m.replace('M', 'Machine ')}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Operator</span>
            <input value={operator} onChange={(e) => setOperator(e.target.value)} />
          </label>
          <label className="field">
            <span>Sample Supervisor</span>
            <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} />
          </label>
          <label className="field">
            <span>Required Meter</span>
            <input className="num" type="number" min="0" step="any" value={requiredMeter} onChange={(e) => setRequiredMeter(e.target.value)} />
          </label>
          <label className="field">
            <span>Warp</span>
            <input value={din?.common_warp || ''} readOnly />
          </label>
          <label className="field dto-span-2">
            <span>Remarks</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        </div>

        {din ? (
          <div className="dto-din-preview">
            <ImageLightbox src={din.din_image_url} alt={din.din_number} thumbClassName="dto-thumb-md" />
            <div>
              <strong>{din.din_number}</strong>
              <p className="text-muted">{din.design_name || '—'} · <DtoStatusPill status={din.status} /></p>
            </div>
          </div>
        ) : null}

        <div className="dto-match-select">
          <h3 className="section-title">Select Matching(s)</h3>
          {matchings.length === 0 ? (
            <p className="text-muted">No matchings on this DESI. Add them in DESI Intake first.</p>
          ) : (
            <div className="dto-check-grid">
              {matchings.map((m) => (
                <label key={m.id} className="dto-check">
                  <input
                    type="checkbox"
                    checked={selectedMatchings.includes(m.matching_no)}
                    onChange={() => toggleMatching(m.matching_no)}
                  />
                  <span>
                    #{m.matching_no} · {matchingColourLabel(m)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="dto-form-actions">
          <button type="submit" className="primary-save" disabled={busy}>
            Create Sample Job Card
          </button>
        </div>
      </form>

      {issued ? (
        <div className="no-print dto-share-bar">
          <button type="button" className="btn-warp" onClick={() => window.print()}>
            Print A4
          </button>
          <button type="button" className="btn-warp" onClick={() => shareWhatsApp([`Sample ${issued.din_number}`, issued.work_quality].join('\n'))}>
            WhatsApp
          </button>
          <button type="button" className="btn-warp" onClick={() => shareWhatsAppBusiness([`Sample ${issued.din_number}`, issued.work_quality].join('\n'))}>
            WhatsApp Business
          </button>
          <button
            type="button"
            className="btn-warp"
            onClick={() => void shareNativeOrWhatsApp([`Sample ${issued.din_number}`, issued.work_quality].join('\n'))}
          >
            Share
          </button>
        </div>
      ) : null}

      {issued ? <SampleJobCardPrint card={issued} /> : null}

      <section className="surface dto-panel no-print">
        <h2 className="section-title">Sample Job Cards {din ? `· ${din.din_number}` : ''}</h2>
        {cards.length === 0 ? (
          <p className="text-muted">No sample job cards yet for this DIN.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Card No.</th>
                  <th>Date</th>
                  <th>Machine</th>
                  <th>Matchings</th>
                  <th>Meter</th>
                  <th>Status</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td>{c.card_no}</td>
                    <td>{c.job_date}</td>
                    <td>{c.machine_no}</td>
                    <td>{(c.matching_nos || []).join(', ')}</td>
                    <td className="num">{c.required_meter ?? '—'}</td>
                    <td>
                      <DtoStatusPill status={c.status} />
                    </td>
                    <td className="dto-row-actions">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() =>
                          printSummary(
                            c.card_no,
                            rowsToHtml([
                              ['DIN', din?.din_number],
                              ['Machine', c.machine_no],
                              ['Matchings', (c.matching_nos || []).join(', ')],
                              ['Required m', c.required_meter],
                            ]),
                          )
                        }
                      >
                        Print
                      </button>
                      <button type="button" className="link-btn" onClick={() => shareWhatsApp(shareText(c))}>
                        WA
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
