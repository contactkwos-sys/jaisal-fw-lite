/**
 * Machine-wise Production — Weft Yarn Issue · Production Entry · Reports
 * Image 1 layout + Image 2 matching/color visual system.
 * Weft KG from existing DIN Costing formula (designWiseCosting.weftWeightKg).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { WeftYarnStock } from '../lib/database.types'
import { fmtQty } from '../lib/designWiseCosting'
import {
  buildMatchingGroups,
  colourHex,
  flattenGroups,
  loadCostingWeftsForDin,
  loadIssuedMap,
  loadProductionReport,
  loadProducedMeter,
  loadProgramOptions,
  loadWeftIssueReport,
  MACHINES,
  matchYarnStock,
  matchingBadge,
  programStatusLabel,
  resolveDinContext,
  saveWeftYarnIssue,
  slipWhatsAppText,
  syntheticMatchingFromWefts,
  totalsFromGroups,
  type IssueDraftLine,
  type MatchingGroup,
  type MatchingYarnLine,
  type ProgramOption,
  type ProductionReportRow,
  type SlipData,
  type WeftIssueReportRow,
} from '../lib/machineWiseProduction'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { maybeCompleteProgramFromProduction } from '../lib/programs'
import { printReport, printWeftYarnIssueSlip } from '../lib/printDocs'
import { shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { supabase } from '../lib/supabase'

type TabId = 'weft' | 'entry' | 'report'
type ReportMode = 'production' | 'weft'

const TABS = [
  { id: 'weft', label: 'Weft Yarn Issue' },
  { id: 'entry', label: 'Production Entry' },
  { id: 'report', label: 'Machine-wise Report' },
]

function ColourDot({ hex, large }: { hex: string; large?: boolean }) {
  return (
    <span
      className={large ? 'mwp-dot mwp-dot-lg' : 'mwp-dot'}
      style={{ background: hex }}
      aria-hidden
    />
  )
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  let cls = 'mwp-pill'
  if (s.includes('fully') || s.includes('completed')) cls += ' mwp-pill-ok'
  else if (s.includes('partial') || s.includes('progress')) cls += ' mwp-pill-warn'
  else if (s.includes('pending')) cls += ' mwp-pill-muted'
  else cls += ' mwp-pill-info'
  return <span className={cls}>{status}</span>
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function MachineWiseProductionScreen({ initialTab }: { initialTab?: string }) {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>(
    initialTab === 'entry' || initialTab === 'report' ? initialTab : 'weft',
  )

  const [programs, setPrograms] = useState<ProgramOption[]>([])
  const [yarns, setYarns] = useState<WeftYarnStock[]>([])
  const [operators, setOperators] = useState<string[]>([])

  const [date, setDate] = useState(todayISO())
  const [shift, setShift] = useState<'Day' | 'Night'>('Day')
  const [machine, setMachine] = useState<string>(MACHINES[0])
  const [programId, setProgramId] = useState('')
  const [dinManual, setDinManual] = useState('')
  const [meterOverride, setMeterOverride] = useState('')
  const [scopeMatching, setScopeMatching] = useState<'all' | 'program'>('program')

  const [groups, setGroups] = useState<MatchingGroup[]>([])
  const [issueQty, setIssueQty] = useState<Record<string, string>>({})
  const [designName, setDesignName] = useState('')
  const [partyName, setPartyName] = useState('')
  const [marka, setMarka] = useState('')
  const [jobCardNo, setJobCardNo] = useState('')
  const [programNo, setProgramNo] = useState('')
  const [dinNumber, setDinNumber] = useState('')
  const [dinId, setDinId] = useState<string | null>(null)
  const [matchingNo, setMatchingNo] = useState<number | null>(null)
  const [programMeter, setProgramMeter] = useState(0)
  const [producedMeter, setProducedMeter] = useState(0)
  const [costingOk, setCostingOk] = useState(false)

  const [issuedBy, setIssuedBy] = useState('Yarn Store')
  const [receivedBy, setReceivedBy] = useState('')
  const [remarks, setRemarks] = useState('')
  const [allowOver, setAllowOver] = useState(false)
  const [lastSlip, setLastSlip] = useState<SlipData | null>(null)

  // Production entry
  const [operator, setOperator] = useState('')
  const [lotNo, setLotNo] = useState('')
  const [startMeter, setStartMeter] = useState('')
  const [endMeter, setEndMeter] = useState('')
  const [prodMeter, setProdMeter] = useState('')
  const [prodRemarks, setProdRemarks] = useState('')

  // Reports
  const [reportMode, setReportMode] = useState<ReportMode>('production')
  const [rf, setRf] = useState({
    dateFrom: todayISO(),
    dateTo: todayISO(),
    machine: '',
    din: '',
    program: '',
    shift: '',
    party: '',
    marka: '',
    matching: '',
  })
  const [prodRows, setProdRows] = useState<ProductionReportRow[]>([])
  const [weftRows, setWeftRows] = useState<WeftIssueReportRow[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const selected = programs.find((p) => p.id === programId)

  const loadMasters = useCallback(async () => {
    const [opts, yarnRes, workers] = await Promise.all([
      loadProgramOptions(),
      supabase.from('weft_yarn_stock').select('*').order('colour_name').limit(500),
      supabase.from('workers').select('full_name').eq('is_active', true),
    ])
    setPrograms(opts)
    setYarns((yarnRes.data as WeftYarnStock[]) ?? [])
    setOperators((workers.data ?? []).map((w) => w.full_name))
  }, [])

  useEffect(() => {
    void loadMasters().catch((e: Error) => setError(e.message))
  }, [loadMasters])

  const effectiveMeter = useMemo(() => {
    const o = Number(meterOverride)
    if (meterOverride.trim() !== '' && Number.isFinite(o) && o > 0) return o
    return programMeter
  }, [meterOverride, programMeter])

  const balanceMeter = Math.max(0, effectiveMeter - producedMeter)
  const progStatus = programStatusLabel(effectiveMeter, producedMeter)
  const totals = totalsFromGroups(groups)

  const loadContext = useCallback(async () => {
    setError(null)
    setMessage(null)
    const din = (dinManual.trim() || selected?.din_number || '').trim()
    if (!din) {
      setError('Select a program or enter a DIN No.')
      return
    }

    const machineNo = machine || selected?.machine_no || MACHINES[0]
    const progId = selected?.id || null
    const meter =
      meterOverride.trim() !== '' && Number(meterOverride) > 0
        ? Number(meterOverride)
        : selected?.program_meter || programMeter || 0

    setBusy(true)
    try {
      const [dinCtx, costing, produced, issuedMap] = await Promise.all([
        resolveDinContext(din),
        loadCostingWeftsForDin(din),
        progId ? loadProducedMeter(progId) : Promise.resolve(0),
        loadIssuedMap(progId, din, machineNo),
      ])

      let matchings = dinCtx?.din_matchings || []
      if (!matchings.length && costing.wefts.length) {
        matchings = syntheticMatchingFromWefts(costing.wefts)
      }
      if (!matchings.length) {
        setGroups([])
        setCostingOk(false)
        setError(
          `No matching structure or DIN Costing weft rows found for ${din}. Complete DIN Intake + DIN Costing first.`,
        )
        return
      }

      const filterNo =
        scopeMatching === 'program' && selected?.matching_no != null ? selected.matching_no : null

      let built = buildMatchingGroups(matchings, costing.wefts, meter || 0, issuedMap, filterNo)
      // If program matching filter yields empty, fall back to all
      if (!built.length) {
        built = buildMatchingGroups(matchings, costing.wefts, meter || 0, issuedMap, null)
      }

      // Attach yarn stock ids
      built = built.map((g) => ({
        ...g,
        lines: g.lines.map((l) => {
          const yarn = matchYarnStock(l.colour_name, yarns)
          return { ...l, yarn_stock_id: yarn?.id ?? null }
        }),
      }))

      setGroups(built)
      setCostingOk(costing.wefts.length > 0)
      setDinNumber(din)
      setDinId(dinCtx?.id || null)
      setDesignName(selected?.design_name || dinCtx?.design_name || '')
      setPartyName(selected?.party_name || dinCtx?.party_name || '')
      setMarka(selected?.marka || '')
      setJobCardNo(selected?.job_card_no || '')
      setProgramNo(selected?.program_no || '')
      setMatchingNo(selected?.matching_no ?? null)
      setProgramMeter(selected?.program_meter || meter)
      setProducedMeter(produced)
      if (selected?.machine_no) setMachine(selected.machine_no)

      const qty: Record<string, string> = {}
      for (const l of flattenGroups(built)) {
        qty[l.key] = l.balance_kg > 0 ? fmtQty(l.balance_kg) : ''
      }
      setIssueQty(qty)

      if (!costing.wefts.length) {
        setMessage(`Loaded matchings for ${din}, but no DIN Costing weft params — KG may be 0.`)
      } else {
        setMessage(`Loaded ${built.length} matching(s) · weft KG from DIN Costing`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }, [dinManual, selected, machine, meterOverride, programMeter, scopeMatching, yarns])

  useEffect(() => {
    if (!selected) return
    setMachine(selected.machine_no)
    setDinManual(selected.din_number)
    setProgramMeter(selected.program_meter)
    setDesignName(selected.design_name)
    setPartyName(selected.party_name)
    setMarka(selected.marka)
    setJobCardNo(selected.job_card_no)
    setProgramNo(selected.program_no)
    setMatchingNo(selected.matching_no)
    setMeterOverride('')
  }, [selected])

  function fillBalanceAll() {
    const qty: Record<string, string> = {}
    for (const l of flattenGroups(groups)) {
      qty[l.key] = l.balance_kg > 0 ? fmtQty(l.balance_kg) : '0'
    }
    setIssueQty(qty)
  }

  function buildDraftLines(): IssueDraftLine[] {
    return flattenGroups(groups).map((l) => ({
      matching_no: l.matching_no,
      matching_id: l.matching_id,
      colour_name: l.colour_name,
      role_label: l.role_label,
      is_main_ground: l.is_main_ground,
      colour_hex: l.colour_hex,
      required_kg: l.required_kg,
      issue_kg: Number(issueQty[l.key] || 0) || 0,
      denier: l.denier,
      pic: l.pic,
      width: l.width,
      costing_weft_id: l.costing_weft_id,
      yarn_stock_id: l.yarn_stock_id,
      sr_no: l.sr_no,
    }))
  }

  function groupsForSlip(lines: IssueDraftLine[]): MatchingGroup[] {
    const byNo = new Map<number, MatchingGroup>()
    for (const g of groups) {
      byNo.set(g.matching_no, {
        ...g,
        lines: g.lines.map((l) => {
          const draft = lines.find((d) => d.matching_no === l.matching_no && d.colour_name === l.colour_name && d.role_label === l.role_label)
          const issued = draft?.issue_kg ?? 0
          return {
            ...l,
            issued_kg: issued,
            balance_kg: Math.max(0, l.required_kg - (l.issued_kg + issued)),
          }
        }),
        total_issued_kg: 0,
        total_balance_kg: 0,
      })
    }
    return [...byNo.values()].map((g) => ({
      ...g,
      total_issued_kg: g.lines.reduce((s, l) => s + l.issued_kg, 0),
      total_balance_kg: g.lines.reduce((s, l) => s + l.balance_kg, 0),
    }))
  }

  async function doIssue() {
    if (!dinNumber) {
      setError('Load a DIN / Program first')
      return
    }
    if (!isCeo && !allowOver) {
      /* operators cannot toggle over-issue; allowOver stays false unless CEO */
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const lines = buildDraftLines()
      const result = await saveWeftYarnIssue({
        issue_date: date,
        shift,
        machine_no: machine,
        program_id: programId || null,
        program_no: programNo,
        job_card_no: jobCardNo,
        din_number: dinNumber,
        din_id: dinId,
        design_name: designName,
        party_name: partyName,
        marka,
        matching_no: matchingNo,
        program_meter: effectiveMeter,
        issued_by: issuedBy,
        received_by: receivedBy,
        remarks,
        allow_over_issue: isCeo && allowOver,
        lines,
        created_by: profile?.id || null,
        created_by_name: profile?.full_name || null,
      })

      const slipGroups = groupsForSlip(lines)
      const slip: SlipData = {
        issue_no: result.issue_no,
        issue_date: date,
        machine_no: machine,
        din_number: dinNumber,
        design_name: designName,
        program_no: programNo,
        job_card_no: jobCardNo,
        party_name: partyName,
        marka,
        program_meter: effectiveMeter,
        shift,
        issued_by: issuedBy,
        received_by: receivedBy,
        groups: slipGroups,
        total_required_kg: totals.required,
        total_issued_kg: lines.reduce((s, l) => s + l.issue_kg, 0),
      }
      setLastSlip(slip)
      setMessage(`Weft Yarn Issue ${result.issue_no} saved · stock updated`)
      await loadContext()
      await loadMasters()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Issue failed')
    } finally {
      setBusy(false)
    }
  }

  function printSlip(slip: SlipData) {
    printWeftYarnIssueSlip({
      issueNo: slip.issue_no,
      date: slip.issue_date,
      machineNo: slip.machine_no,
      dinNumber: slip.din_number,
      design: slip.design_name,
      programNo: slip.program_no,
      jobCardNo: slip.job_card_no,
      party: slip.party_name,
      marka: slip.marka,
      programMeter: slip.program_meter,
      shift: slip.shift,
      issuedBy: slip.issued_by,
      receivedBy: slip.received_by,
      groups: slip.groups.map((g) => ({
        badge: g.badge,
        total_required_kg: g.total_required_kg,
        lines: g.lines.map((l) => ({
          colour_name: l.colour_name,
          colour_hex: l.colour_hex,
          role_label: l.role_label,
          is_main_ground: l.is_main_ground,
          required_kg: l.required_kg,
          issued_kg: l.issued_kg,
        })),
      })),
      totalRequiredKg: slip.total_required_kg,
      totalIssuedKg: slip.total_issued_kg,
    })
  }

  // Auto-calc produced from start/end
  useEffect(() => {
    const s = Number(startMeter)
    const e = Number(endMeter)
    if (startMeter.trim() !== '' && endMeter.trim() !== '' && Number.isFinite(s) && Number.isFinite(e)) {
      setProdMeter(String(Math.max(0, e - s)))
    }
  }, [startMeter, endMeter])

  async function saveProduction(e: React.FormEvent) {
    e.preventDefault()
    if (!programId) {
      setError('Select a program first')
      return
    }
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const meters = Number(prodMeter) || 0
      const payload = {
        machine_no: machine,
        entry_date: date,
        shift,
        operator_name: operator.trim() || null,
        working_hour: 12,
        total_meter: meters,
        program_id: programId,
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'production_entries',
        action: 'insert',
        recordId: null,
        payload: { ...payload, lot_no: lotNo || null, remarks: prodRemarks || null },
        apply: async () => {
          const { error: iErr } = await supabase.from('production_entries').insert(payload)
          if (iErr) throw iErr
          await maybeCompleteProgramFromProduction(programId)
          await supabase
            .from('programs')
            .update({ status: 'Running' })
            .eq('id', programId)
            .in('status', ['pending', 'Programmed', 'Pending'])
        },
      })
      setMessage(result === 'applied' ? 'Production entry saved' : 'Sent to approval queue')
      setProdMeter('')
      setStartMeter('')
      setEndMeter('')
      setLotNo('')
      setProdRemarks('')
      const produced = await loadProducedMeter(programId)
      setProducedMeter(produced)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function runReport() {
    setBusy(true)
    setError(null)
    try {
      if (reportMode === 'production') {
        setProdRows(
          await loadProductionReport({
            dateFrom: rf.dateFrom,
            dateTo: rf.dateTo,
            machine: rf.machine || undefined,
            din: rf.din || undefined,
            program: rf.program || undefined,
            shift: rf.shift || undefined,
            party: rf.party || undefined,
            marka: rf.marka || undefined,
          }),
        )
      } else {
        setWeftRows(
          await loadWeftIssueReport({
            dateFrom: rf.dateFrom,
            dateTo: rf.dateTo,
            machine: rf.machine || undefined,
            din: rf.din || undefined,
            program: rf.program || undefined,
            matching: rf.matching || undefined,
            party: rf.party || undefined,
            marka: rf.marka || undefined,
          }),
        )
      }
      setMessage('Report loaded')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report failed')
    } finally {
      setBusy(false)
    }
  }

  const colourIcons = useMemo(() => {
    const seen = new Map<string, MatchingYarnLine>()
    for (const l of flattenGroups(groups)) {
      const k = l.colour_name.toLowerCase()
      if (!seen.has(k)) seen.set(k, l)
    }
    return [...seen.values()]
  }, [groups])

  return (
    <div className="mwp-screen">
      <header className="mwp-header">
        <div>
          <p className="mwp-eyebrow">JAISAL FW · Fashionweave Industries</p>
          <h1>Machine-wise Production</h1>
          <p className="mwp-lead">Weft Yarn Issue • Production Entry • Machine-wise Report</p>
        </div>
        <button type="button" className="btn-warp" onClick={() => void loadContext()} disabled={busy}>
          Load Program
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="mwp-card mwp-filters">
        <div className="mwp-filter-grid">
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            <span>Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
            </select>
          </label>
          <label>
            <span>Machine</span>
            <select value={machine} onChange={(e) => setMachine(e.target.value)}>
              {MACHINES.map((m) => (
                <option key={m} value={m}>
                  {m} – Rapier {m.replace('M', '')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Program</span>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
            >
              <option value="">— Select program —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>DIN No.</span>
            <input
              value={dinManual}
              onChange={(e) => setDinManual(e.target.value)}
              placeholder="JFG-15-98"
            />
          </label>
          <label>
            <span>Design</span>
            <input value={designName} readOnly />
          </label>
          <label>
            <span>Job Card No.</span>
            <input value={jobCardNo} readOnly />
          </label>
          <label>
            <span>Program Meter</span>
            <input
              className="num"
              value={meterOverride !== '' ? meterOverride : String(programMeter || '')}
              onChange={(e) => setMeterOverride(e.target.value)}
              placeholder="500"
            />
          </label>
          <label>
            <span>Matching scope</span>
            <select
              value={scopeMatching}
              onChange={(e) => setScopeMatching(e.target.value as 'all' | 'program')}
            >
              <option value="program">Program matching</option>
              <option value="all">All DIN matchings</option>
            </select>
          </label>
        </div>
        <div className="mwp-filter-actions">
          <button type="button" className="btn-warp" onClick={() => void loadContext()} disabled={busy}>
            View
          </button>
        </div>
      </section>

      {dinNumber ? (
        <section className="mwp-info-bar">
          <span className="mwp-din-badge">DIN: {dinNumber}</span>
          <span>
            <em>Design</em> {designName || '—'}
          </span>
          <span>
            <em>Party</em> {partyName || '—'}
          </span>
          <span>
            <em>Marka</em> {marka || '—'}
          </span>
          <span>
            <em>Program</em> {programNo || '—'}
          </span>
          <span>
            <em>Job Card</em> {jobCardNo || '—'}
          </span>
          <span>
            <em>Program Meter</em> <strong className="num">{fmtQty(effectiveMeter)} Mtr</strong>
          </span>
          <div className="mwp-weft-icons" title="Weft colours">
            {colourIcons.map((c) => (
              <span key={c.key} className="mwp-weft-icon" title={`${c.colour_name} · ${c.status}`}>
                <ColourDot hex={c.colour_hex} large />
                <small>{c.status === 'Fully Issued' ? '✓' : c.status === 'Partially Issued' ? '½' : '·'}</small>
              </span>
            ))}
          </div>
          <StatusPill status={progStatus} />
          {!costingOk ? <span className="mwp-pill mwp-pill-warn">No costing params</span> : null}
        </section>
      ) : null}

      <SubTabs options={TABS} value={tab} onChange={(id) => setTab(id as TabId)} />

      {tab === 'weft' ? (
        <div className="mwp-layout">
          <div className="mwp-main">
            <section className="mwp-card">
              <div className="mwp-card-head">
                <h2>Weft Yarn Issue (As per Program)</h2>
                <div className="mwp-kpis-inline">
                  <span>
                    Required <strong className="num">{fmtQty(totals.required)}</strong> KG
                  </span>
                  <span>
                    Issued <strong className="num">{fmtQty(totals.issued)}</strong> KG
                  </span>
                  <span>
                    Balance <strong className="num mwp-bal">{fmtQty(totals.balance)}</strong> KG
                  </span>
                  <span>
                    Matchings <strong>{totals.matchings}</strong>
                  </span>
                </div>
              </div>

              {groups.length === 0 ? (
                <p className="text-muted">Load a DIN + Program to see matching-wise weft calculation.</p>
              ) : (
                groups.map((g) => (
                  <div key={g.matching_no} className="mwp-matching-block">
                    <div className="mwp-matching-head">
                      <span className="mwp-matching-badge">{g.badge}</span>
                      <span className="text-muted">{g.colour_label}</span>
                    </div>
                    <div className="table-wrap">
                      <table className="dash-table mwp-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Yarn / Color</th>
                            <th>Role</th>
                            <th>Required KG</th>
                            <th>Issued KG</th>
                            <th>Balance KG</th>
                            <th>Status</th>
                            <th>Issue now</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.lines.map((l, idx) => (
                            <tr
                              key={l.key}
                              className={l.is_main_ground ? 'mwp-row-main' : undefined}
                            >
                              <td>{idx + 1}</td>
                              <td>
                                <span className="mwp-colour-cell">
                                  <ColourDot hex={l.colour_hex} />
                                  <strong>{l.colour_name}</strong>
                                </span>
                              </td>
                              <td>
                                {l.is_main_ground ? (
                                  <span className="mwp-role-main">MAIN GROUND</span>
                                ) : (
                                  l.role_label
                                )}
                              </td>
                              <td className="num">{fmtQty(l.required_kg)}</td>
                              <td className="num">{fmtQty(l.issued_kg)}</td>
                              <td className="num">{fmtQty(l.balance_kg)}</td>
                              <td>
                                <StatusPill status={l.status} />
                              </td>
                              <td>
                                <input
                                  className="num mwp-issue-input"
                                  inputMode="decimal"
                                  value={issueQty[l.key] ?? ''}
                                  onChange={(e) =>
                                    setIssueQty((prev) => ({ ...prev, [l.key]: e.target.value }))
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                          <tr className="mwp-total-row">
                            <td colSpan={3}>
                              <strong>TOTAL {g.badge}</strong>
                            </td>
                            <td className="num">
                              <strong>{fmtQty(g.total_required_kg)}</strong>
                            </td>
                            <td className="num">
                              <strong>{fmtQty(g.total_issued_kg)}</strong>
                            </td>
                            <td className="num">
                              <strong>{fmtQty(g.total_balance_kg)}</strong>
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>

          <aside className="mwp-side">
            <section className="mwp-card">
              <h2>Machine-wise Weft Yarn Issue</h2>
              <div className="form-stack">
                <label>
                  <span>Machine</span>
                  <select value={machine} onChange={(e) => setMachine(e.target.value)}>
                    {MACHINES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Received By (Operator)</span>
                  <input
                    list="mwp-operators"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    placeholder="Machine / Operator"
                  />
                  <datalist id="mwp-operators">
                    {operators.map((o) => (
                      <option key={o} value={o} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>Issued By</span>
                  <input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
                </label>
                <label>
                  <span>Remarks</span>
                  <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </label>
                {isCeo ? (
                  <label className="mwp-check">
                    <input
                      type="checkbox"
                      checked={allowOver}
                      onChange={(e) => setAllowOver(e.target.checked)}
                    />
                    Allow over-issue (authorised)
                  </label>
                ) : null}
                <button type="button" className="btn-ghost" onClick={fillBalanceAll}>
                  Fill balance KG
                </button>
                <button
                  type="button"
                  className="mwp-btn-save"
                  disabled={busy || !groups.length}
                  onClick={() => void doIssue()}
                >
                  Save and Print Slip
                </button>
                <button
                  type="button"
                  className="btn-warp"
                  disabled={!lastSlip}
                  onClick={() => lastSlip && printSlip(lastSlip)}
                >
                  Print Weft Yarn Issue
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={!lastSlip}
                  onClick={() => lastSlip && printSlip(lastSlip)}
                >
                  A4 Print
                </button>
                <ShareActions
                  disabled={!lastSlip}
                  onWhatsApp={() => lastSlip && shareWhatsApp(slipWhatsAppText(lastSlip))}
                  onWhatsAppBusiness={() =>
                    lastSlip && shareWhatsAppBusiness(slipWhatsAppText(lastSlip))
                  }
                />
              </div>
            </section>

            <section className="mwp-card mwp-job-status">
              <h2>Job Status</h2>
              <ul>
                <li>
                  <span>Total Program Meter</span>
                  <strong className="num mwp-c-blue">{fmtQty(effectiveMeter)} Mtr</strong>
                </li>
                <li>
                  <span>Produced Meter</span>
                  <strong className="num mwp-c-green">{fmtQty(producedMeter)} Mtr</strong>
                </li>
                <li>
                  <span>Balance Meter</span>
                  <strong className="num">{fmtQty(balanceMeter)} Mtr</strong>
                </li>
                <li>
                  <span>Balance Weft KG</span>
                  <strong className="num mwp-c-red">{fmtQty(totals.balance)} KG</strong>
                </li>
                <li>
                  <span>Status</span>
                  <StatusPill status={progStatus} />
                </li>
              </ul>
            </section>
          </aside>
        </div>
      ) : null}

      {tab === 'entry' ? (
        <section className="mwp-card">
          <header className="mwp-card-head">
            <h2>Production Entry</h2>
            <p className="text-muted">Same program — no duplicate DIN / machine entry</p>
          </header>
          <div className="mwp-carry">
            <span className="mwp-din-badge">DIN: {dinNumber || '—'}</span>
            <span>Machine {machine}</span>
            <span>Program {programNo || '—'}</span>
            <span>Design {designName || '—'}</span>
            <span>Party {partyName || '—'}</span>
            <span>Marka {marka || '—'}</span>
            <span>
              {matchingNo != null ? matchingBadge(matchingNo) : selected?.colour || '—'}
            </span>
            <span>
              Program {fmtQty(effectiveMeter)} Mtr · Produced {fmtQty(producedMeter)} · Balance{' '}
              {fmtQty(balanceMeter)}
            </span>
            <StatusPill status={progStatus} />
          </div>
          <form className="form-stack mwp-entry-form" onSubmit={(e) => void saveProduction(e)}>
            <div className="mwp-filter-grid">
              <label>
                <span>Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label>
                <span>Shift</span>
                <select value={shift} onChange={(e) => setShift(e.target.value as 'Day' | 'Night')}>
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>
              </label>
              <label>
                <span>Operator</span>
                <input
                  list="mwp-operators"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>Lot No.</span>
                <input value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
              </label>
              <label>
                <span>Start Meter</span>
                <input
                  className="num"
                  value={startMeter}
                  onChange={(e) => setStartMeter(e.target.value)}
                />
              </label>
              <label>
                <span>End Meter</span>
                <input className="num" value={endMeter} onChange={(e) => setEndMeter(e.target.value)} />
              </label>
              <label>
                <span>Produced Meter</span>
                <input
                  className="num"
                  value={prodMeter}
                  onChange={(e) => setProdMeter(e.target.value)}
                  required
                />
              </label>
              <label>
                <span>Remarks</span>
                <input value={prodRemarks} onChange={(e) => setProdRemarks(e.target.value)} />
              </label>
            </div>
            <button type="submit" className="btn-warp" disabled={busy || !programId}>
              Save Production
            </button>
          </form>
        </section>
      ) : null}

      {tab === 'report' ? (
        <section className="mwp-card">
          <div className="mwp-card-head">
            <h2>
              {reportMode === 'production'
                ? 'Machine-wise Production Report'
                : 'Machine-wise Weft Yarn Issue Report'}
            </h2>
            <div className="mwp-report-toggle">
              <button
                type="button"
                className={reportMode === 'production' ? 'btn-warp' : 'btn-ghost'}
                onClick={() => setReportMode('production')}
              >
                Production
              </button>
              <button
                type="button"
                className={reportMode === 'weft' ? 'btn-warp' : 'btn-ghost'}
                onClick={() => setReportMode('weft')}
              >
                Weft Yarn Issue
              </button>
            </div>
          </div>

          <div className="mwp-filter-grid">
            <label>
              <span>Date From</span>
              <input
                type="date"
                value={rf.dateFrom}
                onChange={(e) => setRf((p) => ({ ...p, dateFrom: e.target.value }))}
              />
            </label>
            <label>
              <span>Date To</span>
              <input
                type="date"
                value={rf.dateTo}
                onChange={(e) => setRf((p) => ({ ...p, dateTo: e.target.value }))}
              />
            </label>
            <label>
              <span>Machine</span>
              <select
                value={rf.machine}
                onChange={(e) => setRf((p) => ({ ...p, machine: e.target.value }))}
              >
                <option value="">All</option>
                {MACHINES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>DIN</span>
              <input value={rf.din} onChange={(e) => setRf((p) => ({ ...p, din: e.target.value }))} />
            </label>
            <label>
              <span>Program</span>
              <input
                value={rf.program}
                onChange={(e) => setRf((p) => ({ ...p, program: e.target.value }))}
              />
            </label>
            <label>
              <span>Shift</span>
              <select
                value={rf.shift}
                onChange={(e) => setRf((p) => ({ ...p, shift: e.target.value }))}
              >
                <option value="">All</option>
                <option value="Day">Day</option>
                <option value="Night">Night</option>
              </select>
            </label>
            <label>
              <span>Party</span>
              <input
                value={rf.party}
                onChange={(e) => setRf((p) => ({ ...p, party: e.target.value }))}
              />
            </label>
            <label>
              <span>Marka</span>
              <input
                value={rf.marka}
                onChange={(e) => setRf((p) => ({ ...p, marka: e.target.value }))}
              />
            </label>
            {reportMode === 'weft' ? (
              <label>
                <span>Matching</span>
                <input
                  value={rf.matching}
                  onChange={(e) => setRf((p) => ({ ...p, matching: e.target.value }))}
                  placeholder="1"
                />
              </label>
            ) : null}
          </div>

          <div className="share-actions mwp-report-actions">
            <button type="button" className="btn-warp" disabled={busy} onClick={() => void runReport()}>
              View Report
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (reportMode === 'production') {
                  printReport(
                    'Machine-wise Production Report',
                    [
                      'Date',
                      'Machine',
                      'DIN',
                      'Design',
                      'Program',
                      'Job Card',
                      'Party',
                      'Marka',
                      'Matching',
                      'Shift',
                      'Operator',
                      'Program Mtr',
                      'Produced',
                      'Balance',
                      'Weft KG',
                      'Status',
                    ],
                    prodRows.map((r) => [
                      r.entry_date,
                      r.machine_no,
                      r.din_number,
                      r.design,
                      r.program_no,
                      r.job_card_no,
                      r.party_name,
                      r.marka,
                      r.matching,
                      r.shift,
                      r.operator_name,
                      r.program_meter,
                      r.produced_meter,
                      r.balance,
                      r.weft_kg_issued,
                      r.status,
                    ]),
                  )
                } else {
                  printReport(
                    'Machine-wise Weft Yarn Issue Report',
                    [
                      'Date',
                      'Machine',
                      'DIN',
                      'Program',
                      'Matching',
                      'Color',
                      'Role',
                      'Required',
                      'Issued',
                      'Balance',
                      'Issued By',
                      'Received By',
                    ],
                    weftRows.map((r) => [
                      r.issue_date,
                      r.machine_no,
                      r.din_number,
                      r.program_no,
                      r.matching_no,
                      r.colour_name,
                      r.role_label,
                      r.required_kg,
                      r.issued_kg,
                      r.balance_kg,
                      r.issued_by,
                      r.received_by,
                    ]),
                  )
                }
              }}
            >
              Print / A4 Print
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                if (reportMode === 'production') {
                  downloadCsv(
                    'machine-wise-production.csv',
                    toCsv(
                      [
                        'Date',
                        'Machine',
                        'DIN',
                        'Design',
                        'Program',
                        'Job Card',
                        'Party',
                        'Marka',
                        'Matching',
                        'Shift',
                        'Operator',
                        'Program Meter',
                        'Produced',
                        'Balance',
                        'Weft KG Issued',
                        'Status',
                      ],
                      prodRows.map((r) => [
                        r.entry_date,
                        r.machine_no,
                        r.din_number,
                        r.design,
                        r.program_no,
                        r.job_card_no,
                        r.party_name,
                        r.marka,
                        r.matching,
                        r.shift,
                        r.operator_name,
                        r.program_meter,
                        r.produced_meter,
                        r.balance,
                        r.weft_kg_issued,
                        r.status,
                      ]),
                    ),
                  )
                } else {
                  downloadCsv(
                    'machine-wise-weft-issue.csv',
                    toCsv(
                      [
                        'Date',
                        'Machine',
                        'DIN',
                        'Program',
                        'Matching',
                        'Color',
                        'Role',
                        'Required KG',
                        'Issued KG',
                        'Balance KG',
                        'Issued By',
                        'Received By',
                      ],
                      weftRows.map((r) => [
                        r.issue_date,
                        r.machine_no,
                        r.din_number,
                        r.program_no,
                        r.matching_no,
                        r.colour_name,
                        r.role_label,
                        r.required_kg,
                        r.issued_kg,
                        r.balance_kg,
                        r.issued_by,
                        r.received_by,
                      ]),
                    ),
                  )
                }
              }}
            >
              Excel
            </button>
            {reportMode === 'weft' ? (
              <ShareActions
                onWhatsApp={() => {
                  const text = [
                    '*Machine-wise Weft Yarn Issue Report*',
                    ...weftRows.slice(0, 40).map(
                      (r) =>
                        `${r.issue_date} ${r.machine_no} ${r.din_number} M${r.matching_no} ${r.colour_name} ${r.issued_kg}KG`,
                    ),
                  ].join('\n')
                  shareWhatsApp(text)
                }}
                onWhatsAppBusiness={() => {
                  const text = [
                    '*Machine-wise Weft Yarn Issue Report*',
                    ...weftRows.slice(0, 40).map(
                      (r) =>
                        `${r.issue_date} ${r.machine_no} ${r.din_number} M${r.matching_no} ${r.colour_name} ${r.issued_kg}KG`,
                    ),
                  ].join('\n')
                  shareWhatsAppBusiness(text)
                }}
              />
            ) : null}
          </div>

          <div className="table-wrap">
            {reportMode === 'production' ? (
              <table className="dash-table mwp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Machine</th>
                    <th>DIN</th>
                    <th>Design</th>
                    <th>Program</th>
                    <th>Job Card</th>
                    <th>Party</th>
                    <th>Marka</th>
                    <th>Matching</th>
                    <th>Shift</th>
                    <th>Operator</th>
                    <th>Program Mtr</th>
                    <th>Produced</th>
                    <th>Balance</th>
                    <th>Weft KG</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {prodRows.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="text-muted">
                        View Report to load rows
                      </td>
                    </tr>
                  ) : (
                    prodRows.map((r, i) => (
                      <tr key={`${r.entry_date}-${r.machine_no}-${i}`}>
                        <td>{r.entry_date}</td>
                        <td>{r.machine_no}</td>
                        <td>{r.din_number}</td>
                        <td>{r.design}</td>
                        <td>{r.program_no}</td>
                        <td>{r.job_card_no}</td>
                        <td>{r.party_name}</td>
                        <td>{r.marka}</td>
                        <td>{r.matching}</td>
                        <td>{r.shift}</td>
                        <td>{r.operator_name}</td>
                        <td className="num">{fmtQty(r.program_meter)}</td>
                        <td className="num">{fmtQty(r.produced_meter)}</td>
                        <td className="num">{fmtQty(r.balance)}</td>
                        <td className="num">{fmtQty(r.weft_kg_issued)}</td>
                        <td>
                          <StatusPill status={r.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="dash-table mwp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Machine</th>
                    <th>DIN</th>
                    <th>Program</th>
                    <th>Matching</th>
                    <th>Color / Item</th>
                    <th>Role</th>
                    <th>Required KG</th>
                    <th>Issued KG</th>
                    <th>Balance KG</th>
                    <th>Issued By</th>
                    <th>Received By</th>
                  </tr>
                </thead>
                <tbody>
                  {weftRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-muted">
                        View Report to load rows
                      </td>
                    </tr>
                  ) : (
                    weftRows.map((r, i) => (
                      <tr key={`${r.issue_no}-${i}`}>
                        <td>{r.issue_date}</td>
                        <td>{r.machine_no}</td>
                        <td>{r.din_number}</td>
                        <td>{r.program_no}</td>
                        <td>{matchingBadge(r.matching_no)}</td>
                        <td>
                          <span className="mwp-colour-cell">
                            <ColourDot hex={colourHex(r.colour_name)} />
                            {r.colour_name}
                          </span>
                        </td>
                        <td>{r.role_label}</td>
                        <td className="num">{fmtQty(r.required_kg)}</td>
                        <td className="num">{fmtQty(r.issued_kg)}</td>
                        <td className="num">{fmtQty(r.balance_kg)}</td>
                        <td>{r.issued_by}</td>
                        <td>{r.received_by}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
