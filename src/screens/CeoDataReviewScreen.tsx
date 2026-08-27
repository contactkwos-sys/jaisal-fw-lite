/**
 * CEO Data Review — Yarn possible duplicates + Salary rate comparison.
 * READ-ONLY decisions: records CEO choice locally; never merges or deletes data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

type YarnRow = {
  id: string
  colour_no: string | null
  colour_name: string | null
  quality: string | null
  supplier: string | null
  yarn_specification: string | null
  lot_number: string | null
  stock_kg: number | null
  updated_at: string | null
}

type YarnGroup = {
  key: string
  colour: string
  quality: string
  supplier: string
  spec: string
  rows: YarnRow[]
}

type RateRow = {
  id: string
  source: 'salary_rates' | 'payroll_rates'
  label: string
  department: string
  rate: number
  payType: string
  effectiveFrom: string
  usedBy: string
}

type Decision = 'KEEP SEPARATE' | 'MERGE' | 'MERGE AS LOTS' | 'NOT A DUPLICATE' | 'PROPOSED MERGE' | 'KEEP' | ''

const STORAGE_KEY = 'jaisal_fw_ceo_data_review_v1'

function norm(s: string | null | undefined) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

function loadDecisions(): Record<string, Decision> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Record<string, Decision>
  } catch {
    return {}
  }
}

function saveDecisions(d: Record<string, Decision>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d))
}

export function CeoDataReviewScreen() {
  const { isCeo } = useAuth()
  const [tab, setTab] = useState<'yarn' | 'payroll' | 'archive'>('yarn')
  const [yarns, setYarns] = useState<YarnRow[]>([])
  const [rates, setRates] = useState<RateRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Record<string, Decision>>(loadDecisions)
  const [confirm, setConfirm] = useState<{ key: string; action: Decision; summary: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const [{ data: yarnData, error: yErr }, { data: salary, error: sErr }, { data: payroll, error: pErr }, { data: workers }] =
      await Promise.all([
        supabase
          .from('weft_yarn_stock')
          .select('id, colour_no, colour_name, quality, supplier, yarn_specification, lot_number, stock_kg, updated_at')
          .limit(2000),
        supabase.from('salary_rates').select('id, worker_id, daily_rate, monthly_rate, pay_type, status, effective_from').limit(2000),
        supabase.from('payroll_rates').select('id, role_id, rate_per_day').limit(500),
        supabase.from('workers').select('id, full_name, department, role_id, employee_code').limit(2000),
      ])
    if (yErr) throw yErr
    setYarns((yarnData ?? []) as YarnRow[])

    const workerMap = new Map((workers ?? []).map((w: any) => [w.id, w]))
    const roleWorkers = new Map<string, string[]>()
    for (const w of workers ?? []) {
      if (!w.role_id) continue
      const list = roleWorkers.get(w.role_id) || []
      list.push(w.full_name || w.employee_code || w.id)
      roleWorkers.set(w.role_id, list)
    }

    const rows: RateRow[] = []
    if (!sErr) {
      for (const r of salary ?? []) {
        const w = workerMap.get(r.worker_id)
        const rate = Number(r.daily_rate) || Number(r.monthly_rate) || 0
        rows.push({
          id: r.id,
          source: 'salary_rates',
          label: w?.full_name || 'Worker',
          department: w?.department || '—',
          rate,
          payType: r.pay_type || '—',
          effectiveFrom: r.effective_from || '—',
          usedBy: 'HR Salary / Daily Costing (main)',
        })
      }
    }
    if (!pErr) {
      for (const r of payroll ?? []) {
        const names = roleWorkers.get(r.role_id) || []
        rows.push({
          id: r.id,
          source: 'payroll_rates',
          label: `Role rate (${String(r.role_id || '').slice(0, 8)}…)`,
          department: '—',
          rate: Number(r.rate_per_day) || 0,
          payType: 'daily',
          effectiveFrom: '—',
          usedBy: names.length ? `Fallback · ${names.slice(0, 3).join(', ')}` : 'Admin Old Rates / Daily Costing fallback',
        })
      }
    }
    setRates(rows)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const yarnGroups = useMemo(() => {
    const map = new Map<string, YarnRow[]>()
    for (const y of yarns) {
      const key = [norm(y.supplier), norm(y.colour_no), norm(y.quality), norm(y.yarn_specification)].join('|')
      if (!norm(y.colour_no)) continue
      const list = map.get(key) || []
      list.push(y)
      map.set(key, list)
    }
    const groups: YarnGroup[] = []
    for (const [key, rows] of map) {
      if (rows.length < 2) continue
      groups.push({
        key,
        colour: rows[0].colour_no || '—',
        quality: rows[0].quality || '—',
        supplier: rows[0].supplier || '—',
        spec: rows[0].yarn_specification || '—',
        rows,
      })
    }
    return groups
  }, [yarns])

  function decide(key: string, action: Decision, summary: string) {
    if (!isCeo) {
      setError('Only CEO can record review decisions')
      return
    }
    setConfirm({ key, action, summary })
  }

  function applyDecision() {
    if (!confirm) return
    const next = { ...decisions, [confirm.key]: confirm.action }
    setDecisions(next)
    saveDecisions(next)
    setMessage(`Saved decision: ${confirm.action}. No stock or rate data was changed.`)
    setConfirm(null)
  }

  return (
    <div className="screen ceo-data-review">
      <header className="screen-header">
        <h1>CEO Data Review</h1>
        <p className="text-muted">
          Review possible duplicates and old rate records. Recording a decision does <strong>not</strong> merge or
          delete anything. CEO approval is required before any future change.
        </p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as 'yarn' | 'payroll' | 'archive')}
          options={[
            { id: 'yarn', label: 'Yarn Possible Duplicates' },
            { id: 'payroll', label: 'Salary Rate Comparison' },
            { id: 'archive', label: 'Historical Empty Stores' },
          ]}
        />
      </header>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}

      {tab === 'yarn' ? (
        <section className="surface otp-section">
          <h2 className="section-title">Yarn Possible Duplicates</h2>
          <p className="text-muted">
            Same supplier + colour + quality + specification. Different qualities (e.g. LICHI vs NSY) are not listed.
            Special cases like 5192 / 29 must be reviewed carefully — do not merge only because names look similar.
          </p>
          {!yarnGroups.length ? <p className="text-sage">No same-spec yarn pairs found</p> : null}
          {yarnGroups.map((g) => {
            const main = g.rows[0]
            const dup = g.rows[1]
            const decision = decisions[`yarn:${g.key}`] || ''
            return (
              <article key={g.key} className="card-row surface" style={{ display: 'block', marginBottom: 12 }}>
                <div className="row-top">
                  <div>
                    <strong>
                      Colour {g.colour} · {g.quality} · {g.supplier}
                    </strong>
                    <div className="text-muted">{g.spec}</div>
                  </div>
                  {decision ? <span className="status-chip badge-gold">{decision}</span> : null}
                </div>
                <div className="dash-table-wrap">
                  <table className="dash-table data-table">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Lot</th>
                        <th className="num">Stock kg</th>
                        <th>Last update</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, idx) => (
                        <tr key={r.id}>
                          <td>{idx === 0 ? 'Main Record' : 'Possible Duplicate'}</td>
                          <td>{r.lot_number || '—'}</td>
                          <td className="num">{Number(r.stock_kg || 0).toFixed(2)}</td>
                          <td>{r.updated_at ? String(r.updated_at).slice(0, 10) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-muted">
                  Main stock {Number(main.stock_kg || 0).toFixed(2)} kg · Other stock{' '}
                  {Number(dup?.stock_kg || 0).toFixed(2)} kg · Recommended: KEEP SEPARATE until CEO confirms same
                  lot / same physical yarn
                </p>
                <div className="share-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {(['KEEP SEPARATE', 'MERGE AS LOTS', 'MERGE', 'NOT A DUPLICATE'] as Decision[]).map((a) => (
                    <button
                      key={a}
                      type="button"
                      className={decision === a ? 'primary-save' : 'btn-warp'}
                      disabled={!isCeo}
                      onClick={() =>
                        decide(
                          `yarn:${g.key}`,
                          a,
                          `Yarn colour ${g.colour} / ${g.quality}: mark as ${a}. Zero stock rows will be changed now.`,
                        )
                      }
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </section>
      ) : null}

      {tab === 'payroll' ? (
        <section className="surface otp-section">
          <h2 className="section-title">Salary Rate Comparison</h2>
          <p className="text-muted">
            Main source: <strong>Salary Rate Master</strong> (HR). Old source: Admin role rates. No merge is executed
            here — only review / proposed action.
          </p>
          <div className="dash-table-wrap">
            <table className="dash-table data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Name / Designation</th>
                  <th>Department</th>
                  <th className="num">Rate</th>
                  <th>Type</th>
                  <th>Effective</th>
                  <th>Used by</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => {
                  const key = `rate:${r.source}:${r.id}`
                  const decision = decisions[key] || (r.source === 'salary_rates' ? 'KEEP' : '')
                  return (
                    <tr key={key}>
                      <td>{r.source === 'salary_rates' ? 'Main (HR)' : 'Old (Admin)'}</td>
                      <td>{r.label}</td>
                      <td>{r.department}</td>
                      <td className="num">{r.rate.toFixed(2)}</td>
                      <td>{r.payType}</td>
                      <td>{r.effectiveFrom}</td>
                      <td>{r.usedBy}</td>
                      <td>
                        {r.source === 'payroll_rates' ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={!isCeo}
                            onClick={() =>
                              decide(
                                key,
                                'PROPOSED MERGE',
                                `Mark old payroll rate ${r.id.slice(0, 8)} as PROPOSED MERGE. No rates will be deleted now.`,
                              )
                            }
                          >
                            {decision || 'Mark Proposed Merge'}
                          </button>
                        ) : (
                          <span className="text-sage">{decision || 'Main'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'archive' ? (
        <section className="surface otp-section">
          <h2 className="section-title">Historical Empty Stores (Ready for Approval)</h2>
          <p className="text-muted">
            These old unused stores were verified empty. Moving them to Historical Records requires a separate
            CEO-approved change. Nothing is renamed from this screen.
          </p>
          <ul className="list">
            <li className="card-row surface">Old Design Warp store → Historical Records name ends with _archive (0 rows)</li>
            <li className="card-row surface">Old Design Weft store → Historical Records name ends with _archive (0 rows)</li>
            <li className="card-row surface">Old Beam Pipe In store → Historical Records name ends with _archive (0 rows)</li>
          </ul>
          <p className="text-muted">
            Audit fields when approved later: WHO · WHEN · WHY · OLD NAME · NEW NAME. Nothing will be deleted.
          </p>
          <button
            type="button"
            className="btn-warp"
            disabled={!isCeo}
            onClick={() =>
              decide(
                'archive:empty-trio',
                'PROPOSED MERGE',
                'Record CEO intent to archive empty historical tables in a future approved change. No rename runs now.',
              )
            }
          >
            Record Intent to Archive Later
          </button>
          {decisions['archive:empty-trio'] ? (
            <p className="text-sage">Intent recorded: {decisions['archive:empty-trio']}</p>
          ) : null}
        </section>
      ) : null}

      {confirm ? (
        <div className="adjust-panel surface" role="dialog" aria-modal="true">
          <h3 className="section-title">Confirm review decision</h3>
          <p>
            <strong>What will change:</strong> CEO review note only (saved on this device).
          </p>
          <p>
            <strong>How many records:</strong> 0 data rows changed.
          </p>
          <p>
            <strong>Why:</strong> {confirm.summary}
          </p>
          <p className="text-muted">No merge, delete, or archive will run.</p>
          <div className="share-actions">
            <button type="button" className="primary-save" onClick={applyDecision}>
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
