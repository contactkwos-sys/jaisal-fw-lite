import { useCallback, useEffect, useMemo, useState } from 'react'
import { MACHINES } from '../../lib/database.types'
import { todayISO } from '../../lib/mutate'
import { printReport } from '../../lib/printDocs'
import { supabase } from '../../lib/supabase'

const REPORTS = [
  'Order-wise Production',
  'Program-wise Production',
  'Machine-wise Production',
  'Shift-wise Production',
  'Operator-wise Production',
  'Party-wise Production',
  'Marka-wise Production',
  'Design-wise Production',
  'Folding Report',
  'Damage Report',
  'Lot-wise Report',
  'Dispatch Report',
  'Challan Report',
  'Gate Pass Report',
  'Invoice Report',
  'Pending Production',
  'Pending Checking',
  'Pending Dispatch',
] as const

type Row = (string | number)[]

export function PdReports() {
  const [report, setReport] = useState<(typeof REPORTS)[number]>('Machine-wise Production')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [party, setParty] = useState('')
  const [machine, setMachine] = useState('')
  const [program, setProgram] = useState('')
  const [marka, setMarka] = useState('')
  const [design, setDesign] = useState('')
  const [shift, setShift] = useState('')
  const [search, setSearch] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(q)))
  }, [rows, search])

  const run = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      let h: string[] = []
      let r: Row[] = []

      if (
        report.includes('Production') &&
        !report.startsWith('Pending') &&
        !report.includes('Order') &&
        !report.includes('Program') &&
        !report.includes('Party') &&
        !report.includes('Marka') &&
        !report.includes('Design')
      ) {
        let q = supabase
          .from('production_entries')
          .select('entry_date, shift, machine_no, operator_name, total_meter, program_id')
          .gte('entry_date', from)
          .lte('entry_date', to)
        if (machine) q = q.eq('machine_no', machine)
        if (shift) q = q.eq('shift', shift)
        const { data, error: err } = await q.order('entry_date', { ascending: false }).limit(500)
        if (err) throw err
        h = ['Date', 'Shift', 'Machine', 'Operator', 'Meter', 'Program']
        r = (data ?? []).map((e) => [
          e.entry_date,
          e.shift,
          e.machine_no,
          e.operator_name || '—',
          Number(e.total_meter || 0),
          e.program_id?.slice(0, 8) || '—',
        ])
        if (report === 'Operator-wise Production') {
          const map = new Map<string, number>()
          for (const row of r) map.set(String(row[3]), (map.get(String(row[3])) || 0) + Number(row[4]))
          h = ['Operator', 'Total Meter']
          r = [...map.entries()].map(([op, m]) => [op, m])
        }
        if (report === 'Shift-wise Production') {
          const map = new Map<string, number>()
          for (const row of r) map.set(String(row[1]), (map.get(String(row[1])) || 0) + Number(row[4]))
          h = ['Shift', 'Total Meter']
          r = [...map.entries()].map(([s, m]) => [s, m])
        }
        if (report === 'Machine-wise Production') {
          const map = new Map<string, number>()
          for (const row of r) map.set(String(row[2]), (map.get(String(row[2])) || 0) + Number(row[4]))
          h = ['Machine', 'Total Meter']
          r = [...map.entries()].map(([m, v]) => [m, v])
        }
      } else if (report === 'Program-wise Production' || report === 'Order-wise Production') {
        const { data: progs } = await supabase
          .from('programs')
          .select('program_no, party_name, marka, design_no, machine_no, total_meter, dispatched_meter, status, created_at')
          .limit(300)
        h = ['Program', 'Party', 'Marka', 'Design', 'Machine', 'Meter', 'Dispatched', 'Status']
        r = (progs ?? []).map((p) => [
          p.program_no || '—',
          p.party_name || '—',
          p.marka || '—',
          p.design_no || '—',
          p.machine_no || '—',
          Number(p.total_meter || 0),
          Number(p.dispatched_meter || 0),
          p.status,
        ])
        if (party) r = r.filter((row) => String(row[1]).toLowerCase().includes(party.toLowerCase()))
        if (marka) r = r.filter((row) => String(row[2]).toLowerCase().includes(marka.toLowerCase()))
        if (design) r = r.filter((row) => String(row[3]).toLowerCase().includes(design.toLowerCase()))
        if (machine) r = r.filter((row) => String(row[4]) === machine)
        if (program) r = r.filter((row) => String(row[0]).toLowerCase().includes(program.toLowerCase()))
      } else if (report === 'Party-wise Production' || report === 'Marka-wise Production' || report === 'Design-wise Production') {
        const { data: progs } = await supabase.from('programs').select('party_name, marka, design_no, total_meter, dispatched_meter')
        const keyIdx = report.startsWith('Party') ? 'party_name' : report.startsWith('Marka') ? 'marka' : 'design_no'
        const map = new Map<string, { meter: number; dispatched: number }>()
        for (const p of progs ?? []) {
          const k = String((p as Record<string, unknown>)[keyIdx] || '—')
          const cur = map.get(k) || { meter: 0, dispatched: 0 }
          cur.meter += Number(p.total_meter || 0)
          cur.dispatched += Number(p.dispatched_meter || 0)
          map.set(k, cur)
        }
        h = [report.split('-')[0], 'Programmed', 'Dispatched']
        r = [...map.entries()].map(([k, v]) => [k, v.meter, v.dispatched])
      } else if (report === 'Folding Report' || report === 'Lot-wise Report') {
        const { data } = await supabase
          .from('checking_lots')
          .select('lot_no, marka, meter_in, damage_meter, final_meter, checker_name, entry_date, status')
          .gte('entry_date', from)
          .lte('entry_date', to)
          .limit(300)
        h = ['Lot', 'Marka', 'Meter In', 'Damage', 'Final', 'Checker', 'Date', 'Status']
        r = (data ?? []).map((l) => [
          l.lot_no,
          l.marka || '—',
          Number(l.meter_in || 0),
          Number(l.damage_meter || 0),
          Number(l.final_meter || 0),
          l.checker_name || '—',
          l.entry_date,
          l.status,
        ])
        if (marka) r = r.filter((row) => String(row[1]).toLowerCase().includes(marka.toLowerCase()))
      } else if (report === 'Damage Report') {
        const { data } = await supabase
          .from('lot_damages')
          .select('damage_type, damage_operator, damage_meter, remarks, created_at, lot_id')
          .limit(300)
        h = ['Type', 'Operator', 'Meter', 'Remarks', 'Date']
        r = (data ?? []).map((d) => [
          d.damage_type,
          d.damage_operator || '—',
          Number(d.damage_meter || 0),
          d.remarks || '—',
          String(d.created_at).slice(0, 10),
        ])
      } else if (report === 'Dispatch Report' || report === 'Challan Report') {
        const { data } = await supabase
          .from('challans')
          .select('challan_no, party, marka, design_no, meter, status, created_at')
          .limit(300)
        h = ['Challan', 'Party', 'Marka', 'Design', 'Meter', 'Status', 'Date']
        r = (data ?? []).map((c) => [
          c.challan_no,
          c.party,
          c.marka || '—',
          c.design_no || '—',
          Number(c.meter || 0),
          c.status || '—',
          String(c.created_at).slice(0, 10),
        ])
        if (party) r = r.filter((row) => String(row[1]).toLowerCase().includes(party.toLowerCase()))
      } else if (report === 'Gate Pass Report') {
        const { data } = await supabase
          .from('gatepass')
          .select('gatepass_no, party, marka, total_meter, vehicle_no, driver_name, date')
          .limit(300)
        h = ['Gate Pass', 'Party', 'Marka', 'Meter', 'Vehicle', 'Driver', 'Date']
        r = (data ?? []).map((g) => [
          g.gatepass_no || '—',
          g.party || '—',
          g.marka || '—',
          Number(g.total_meter || 0),
          g.vehicle_no || '—',
          g.driver_name || '—',
          g.date,
        ])
      } else if (report === 'Invoice Report') {
        const { data } = await supabase
          .from('gst_invoices')
          .select('invoice_no, invoice_date, party, marka, quantity, grand_total')
          .limit(300)
        h = ['Invoice', 'Date', 'Party', 'Marka', 'Qty', 'Grand Total']
        r = (data ?? []).map((i) => [
          i.invoice_no,
          i.invoice_date,
          i.party,
          i.marka || '—',
          Number(i.quantity || 0),
          Number(i.grand_total || 0),
        ])
      } else if (report === 'Pending Checking' || report === 'Pending Dispatch' || report === 'Pending Production') {
        if (report === 'Pending Dispatch') {
          const { data } = await supabase
            .from('checking_lots')
            .select('lot_no, marka, final_meter, status')
            .is('challan_id', null)
          h = ['Lot', 'Marka', 'Final Meter', 'Status']
          r = (data ?? []).map((l) => [l.lot_no, l.marka || '—', Number(l.final_meter || 0), l.status])
        } else {
          const { data } = await supabase
            .from('programs')
            .select('program_no, party_name, machine_no, total_meter, status')
            .not('status', 'in', '("completed","Cancelled")')
          h = ['Program', 'Party', 'Machine', 'Meter', 'Status']
          r = (data ?? []).map((p) => [
            p.program_no || '—',
            p.party_name || '—',
            p.machine_no || '—',
            Number(p.total_meter || 0),
            p.status,
          ])
        }
      }

      setHeaders(h)
      setRows(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Report failed')
    } finally {
      setBusy(false)
    }
  }, [report, from, to, party, machine, program, marka, design, shift])

  useEffect(() => {
    void run()
  }, [run])

  function exportCsv() {
    const lines = [headers.join(','), ...filtered.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.replace(/\s+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="pd-sub">
      <header className="pd-sub-header">
        <h1>Reports</h1>
        <p className="pd-lead">Program &amp; Dispatch — filter, print, PDF, Excel.</p>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="pd-form-grid pd-report-filters">
        <label className="field">
          <span className="text-muted">Report</span>
          <select value={report} onChange={(e) => setReport(e.target.value as (typeof REPORTS)[number])}>
            {REPORTS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Date From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Date To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Party</span>
          <input value={party} onChange={(e) => setParty(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Machine</span>
          <select value={machine} onChange={(e) => setMachine(e.target.value)}>
            <option value="">All</option>
            {MACHINES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Program</span>
          <input value={program} onChange={(e) => setProgram(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Marka</span>
          <input value={marka} onChange={(e) => setMarka(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Design</span>
          <input value={design} onChange={(e) => setDesign(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Shift</span>
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">All</option>
            <option>Day</option>
            <option>Night</option>
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter rows…" />
        </label>
      </div>

      <div className="pd-action-row">
        <button type="button" className="primary-save" disabled={busy} onClick={() => void run()}>
          Filter
        </button>
        <button type="button" className="pd-qa pd-qa-blue" onClick={() => printReport(report, headers, filtered)}>
          Print / PDF
        </button>
        <button type="button" className="pd-qa pd-qa-teal" onClick={exportCsv}>
          Excel (CSV)
        </button>
      </div>

      <div className="pd-table-wrap">
        <table className="pd-table">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i}>
                {row.map((c, j) => (
                  <td key={j} className={typeof c === 'number' ? 'num' : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {!filtered.length ? (
              <tr>
                <td colSpan={Math.max(headers.length, 1)} className="text-muted">
                  No rows
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
