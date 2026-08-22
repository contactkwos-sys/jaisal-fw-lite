/**
 * Security Inventory — gate-level material entry for Security role.
 * Syncs into existing Warp / Weft / Purchase / Maintenance modules.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import { MACHINES } from '../lib/database.types'
import {
  daysPending,
  emptySiFilters,
  filterEntries,
  formatQty,
  loadDashboardBundle,
  pendingRepairStatus,
  printSecurityReport,
  saveGeneralInward,
  saveMaintInward,
  saveMaintOutward,
  saveMaintReturn,
  saveWarpInward,
  saveWarpOutward,
  saveWeftInward,
  SI_ENTRY_TYPES,
  SI_SHIFTS,
  SI_TYPE_LABEL,
  statusBadgeClass,
  type InventoryItemMaster,
  type SecurityInventoryDocument,
  type SecurityInventoryEntry,
  type SiFilters,
  type YarnLine,
  todayISO,
  nowTimeHHMM,
  voidSecurityEntry,
  uploadSiPhotos,
} from '../lib/securityInventory'
import { supabase } from '../lib/supabase'
import type { NavTarget } from '../lib/nav'

export type SiSub =
  | 'dashboard'
  | 'warp'
  | 'weft'
  | 'maint-in'
  | 'maint-out'
  | 'general'
  | 'others'
  | 'pending'
  | 'documents'
  | 'reports'

type Props = {
  initialSub?: SiSub
  onSubChange?: (sub: SiSub) => void
  onNavigate?: (t: NavTarget) => void
}

const TABS: { id: SiSub; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'warp', label: 'Warp Inward / Outward' },
  { id: 'weft', label: 'Weft Inward' },
  { id: 'maint-in', label: 'Maintenance Inward' },
  { id: 'maint-out', label: 'Maintenance Outward' },
  { id: 'general', label: 'General Items' },
  { id: 'others', label: 'Others' },
  { id: 'pending', label: 'Pending Entries' },
  { id: 'documents', label: 'Recent Documents' },
  { id: 'reports', label: 'Reports' },
]

function emptyYarnLine(): YarnLine {
  return {
    yarn_name: '',
    colour: '',
    colour_no: '',
    quality: '',
    denier: '',
    quantity_kg: 0,
    rate: 0,
    gst_pct: 5,
    amount: 0,
  }
}

export function SecurityInventoryScreen({ initialSub = 'dashboard', onSubChange }: Props) {
  const { profile, roleName } = useAuth()
  const [sub, setSub] = useState<SiSub>(initialSub)
  const [date, setDate] = useState(todayISO())
  const [shift, setShift] = useState<string>(SI_SHIFTS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [entries, setEntries] = useState<SecurityInventoryEntry[]>([])
  const [docs, setDocs] = useState<SecurityInventoryDocument[]>([])
  const [items, setItems] = useState<InventoryItemMaster[]>([])
  const [kpis, setKpis] = useState({
    totalSku: 0,
    totalInward: 0,
    totalOutward: 0,
    currentStock: 0,
    pendingOutward: 0,
    pendingInward: 0,
  })
  const [stockAlerts, setStockAlerts] = useState<
    Array<{ name: string; qty: number; unit: string; level: string }>
  >([])
  const [filters, setFilters] = useState<SiFilters>(emptySiFilters())
  const [parties, setParties] = useState<string[]>([])
  const [pipes, setPipes] = useState<Array<{ id: string; pipe_no: string; yarn_quality: string | null }>>([])

  const userName = profile?.full_name || roleName || 'Security'
  const actor = useMemo(
    () => ({ userId: profile?.id || 'unknown', userName, shift }),
    [profile?.id, userName, shift],
  )

  useEffect(() => {
    setSub(initialSub)
  }, [initialSub])

  function go(next: SiSub) {
    setSub(next)
    onSubChange?.(next)
    setError(null)
    setMessage(null)
  }

  const reload = useCallback(async () => {
    try {
      const bundle = await loadDashboardBundle()
      setEntries(bundle.entries)
      setDocs(bundle.docs)
      setItems(bundle.items)
      setKpis(bundle.kpis)
      setStockAlerts(bundle.stockAlerts)
      if (bundle.errors.entries && /relation|does not exist/i.test(bundle.errors.entries)) {
        setError('Security Inventory tables not found. Apply migration 20260821140000_security_inventory.sql')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    void reload()
    void supabase
      .from('party_master')
      .select('party_name')
      .order('party_name')
      .then(({ data }) => {
        setParties([...(new Set((data || []).map((p: { party_name: string }) => p.party_name).filter(Boolean)))])
      })
    void supabase
      .from('warp_pipes')
      .select('id, pipe_no, yarn_quality')
      .in('status', ['EMPTY', 'FILLED_GODOWN', 'ISSUED'])
      .order('pipe_no')
      .then(({ data }) => setPipes((data as typeof pipes) || []))
  }, [reload])

  async function withSave(fn: () => Promise<unknown>, okMsg: string) {
    if (!profile) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await fn()
      setMessage(okMsg)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => filterEntries(entries, filters), [entries, filters])

  return (
    <div className="si-screen">
      <header className="si-header">
        <div className="si-header-main">
          <h1>Security Inventory Management</h1>
          <p className="text-muted">
            All inward/outward entries by security user. Linked with Warp Yarn Management automatically.
          </p>
        </div>
        <div className="si-header-controls">
          <label className="si-ctrl">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="si-ctrl">
            <span>Shift</span>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {SI_SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="si-role-badge" title={userName}>
            {roleName || 'Security'}
          </div>
        </div>
      </header>

      <div className="si-tabs-wrap">
        <SubTabs
          value={sub}
          onChange={(id) => go(id as SiSub)}
          options={TABS.map((t) => ({ id: t.id, label: t.label }))}
        />
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {sub === 'dashboard' ? (
        <DashboardView
          kpis={kpis}
          entries={entries}
          stockAlerts={stockAlerts}
          docs={docs}
          onQuick={go}
          onNavigateWarp={() => go('warp')}
        />
      ) : null}

      {sub === 'warp' ? (
        <WarpPanel
          date={date}
          shift={shift}
          busy={busy}
          parties={parties}
          pipes={pipes}
          entries={entries.filter((e) => e.entry_type === 'warp_inward' || e.entry_type === 'warp_outward')}
          onSaveIn={(payload) =>
            withSave(() => saveWarpInward({ ...payload, entry_date: payload.entry_date || date, shift }, actor), `Saved ${payload.challan_no || 'Warp Inward'} → Warp Yarn Management`)
          }
          onSaveOut={(payload) =>
            withSave(() => saveWarpOutward({ ...payload, entry_date: payload.entry_date || date, shift }, actor), `Saved Warp Outward → Sent To ${payload.party_name}`)
          }
        />
      ) : null}

      {sub === 'weft' ? (
        <WeftPanel
          date={date}
          shift={shift}
          busy={busy}
          parties={parties}
          entries={entries.filter((e) => e.entry_type === 'weft_inward')}
          onSave={(payload) =>
            withSave(() => saveWeftInward({ ...payload, entry_date: payload.entry_date || date, shift }, actor), 'Weft Inward saved · Yarn stock updated')
          }
        />
      ) : null}

      {sub === 'maint-in' ? (
        <MaintInPanel
          date={date}
          shift={shift}
          busy={busy}
          parties={parties}
          items={items.filter((i) => i.category === 'maintenance')}
          entries={entries.filter((e) => e.entry_type === 'maint_inward')}
          onSave={(payload) =>
            withSave(() => saveMaintInward({ ...payload, entry_date: payload.entry_date || date, shift }, actor), 'Maintenance Inward saved · Store stock updated')
          }
        />
      ) : null}

      {sub === 'maint-out' ? (
        <MaintOutPanel
          date={date}
          shift={shift}
          busy={busy}
          parties={parties}
          items={items.filter((i) => i.category === 'maintenance')}
          entries={entries.filter((e) => e.entry_type === 'maint_outward' || e.entry_type === 'maint_return')}
          onSaveOut={(payload) =>
            withSave(() => saveMaintOutward({ ...payload, entry_date: payload.entry_date || date, shift }, actor), 'Maintenance Outward saved · Pending repair updated')
          }
          onSaveReturn={(payload) =>
            withSave(() => saveMaintReturn({ ...payload, entry_date: payload.entry_date || date, shift }, actor), 'Return saved · Pending reduced')
          }
        />
      ) : null}

      {sub === 'general' || sub === 'others' ? (
        <GeneralPanel
          mode={sub === 'others' ? 'other' : 'general'}
          date={date}
          shift={shift}
          busy={busy}
          parties={parties}
          items={items.filter((i) => i.category === (sub === 'others' ? 'other' : 'general') || i.category === 'general')}
          entries={entries.filter((e) => e.entry_type === (sub === 'others' ? 'other' : 'general_inward'))}
          onSave={(payload) =>
            withSave(
              () =>
                saveGeneralInward(
                  { ...payload, entry_date: payload.entry_date || date, shift, category: sub === 'others' ? 'other' : 'general' },
                  actor,
                ),
              sub === 'others' ? 'Other item saved' : 'General inward saved · Item master updated',
            )
          }
        />
      ) : null}

      {sub === 'pending' ? (
        <PendingPanel
          entries={entries}
          onVoid={(id, reason) => withSave(() => voidSecurityEntry(id, reason, actor), 'Entry voided')}
          busy={busy}
        />
      ) : null}

      {sub === 'documents' ? <DocumentsPanel docs={docs} entries={entries} /> : null}

      {sub === 'reports' ? (
        <ReportsPanel
          entries={filtered}
          filters={filters}
          setFilters={setFilters}
          date={date}
          shift={shift}
        />
      ) : null}

      <p className="si-footnote">
        <span className="si-info-ico" aria-hidden="true">
          i
        </span>
        All entries here are automatically linked with Warp Yarn Management and other modules.
      </p>
    </div>
  )
}

/* ===================== Dashboard ===================== */

function DashboardView({
  kpis,
  entries,
  stockAlerts,
  docs,
  onQuick,
}: {
  kpis: {
    totalSku: number
    totalInward: number
    totalOutward: number
    currentStock: number
    pendingOutward: number
    pendingInward: number
  }
  entries: SecurityInventoryEntry[]
  stockAlerts: Array<{ name: string; qty: number; unit: string; level: string }>
  docs: SecurityInventoryDocument[]
  onQuick: (s: SiSub) => void
  onNavigateWarp: () => void
}) {
  const warp = entries.filter((e) => e.entry_type.startsWith('warp_')).slice(0, 6)
  const weft = entries.filter((e) => e.entry_type === 'weft_inward').slice(0, 6)
  const maint = entries.filter((e) => e.entry_type.startsWith('maint_')).slice(0, 6)
  const general = entries.filter((e) => e.entry_type === 'general_inward' || e.entry_type === 'other').slice(0, 6)
  const pending = entries
    .filter((e) =>
      ['pending_outward', 'out_for_repair', 'partially_returned', 'overdue', 'pending_inward', 'document_pending'].includes(
        e.status,
      ),
    )
    .slice(0, 8)

  const actions: { id: SiSub; label: string; tone: string }[] = [
    { id: 'warp', label: 'Warp Inward', tone: 'blue' },
    { id: 'warp', label: 'Warp Outward', tone: 'orange' },
    { id: 'weft', label: 'Weft Inward', tone: 'green' },
    { id: 'maint-in', label: 'Maintenance Inward', tone: 'purple' },
    { id: 'maint-out', label: 'Maintenance Outward', tone: 'red' },
    { id: 'general', label: 'General Item Inward', tone: 'teal' },
    { id: 'others', label: 'Others', tone: 'slate' },
  ]

  return (
    <div className="si-dash">
      <div className="si-quick-row">
        {actions.map((a, i) => (
          <button key={`${a.label}-${i}`} type="button" className={`si-quick si-quick-${a.tone}`} onClick={() => onQuick(a.id)}>
            {a.label}
          </button>
        ))}
        <button type="button" className="si-quick si-quick-ghost" onClick={() => onQuick('documents')}>
          Upload Challan / Invoice
        </button>
        <button type="button" className="si-quick si-quick-ghost" onClick={() => onQuick('reports')}>
          Stock Reports ▾
        </button>
      </div>

      <div className="si-kpi-grid">
        <Kpi label="Total SKU" value={formatQty(kpis.totalSku, 0)} tone="slate" />
        <Kpi label="Total Inward (MT)" value={formatQty(kpis.totalInward)} tone="green" />
        <Kpi label="Total Outward (MT)" value={formatQty(kpis.totalOutward)} tone="red" />
        <Kpi label="Current Stock (MT)" value={formatQty(kpis.currentStock)} tone="blue" />
        <Kpi label="Pending Outward (MT)" value={formatQty(kpis.pendingOutward)} tone="orange" />
        <Kpi label="Pending Inward (MT)" value={formatQty(kpis.pendingInward)} tone="purple" />
      </div>

      <div className="si-dash-tables">
        <MiniTable
          title="Warp Inward / Outward"
          onViewAll={() => onQuick('warp')}
          columns={['Date', 'Challan No.', 'Party / To', 'Qty', 'Status']}
          rows={warp.map((r) => [
            r.entry_date,
            r.challan_no || r.entry_no,
            r.party_name || '—',
            formatQty(r.quantity),
            <span key={r.id} className={statusBadgeClass(r.status)}>
              {r.entry_type === 'warp_outward' ? 'Outward' : 'Completed'}
            </span>,
          ])}
        />
        <MiniTable
          title="Weft Inward"
          onViewAll={() => onQuick('weft')}
          columns={['Date', 'Invoice No.', 'Supplier', 'KG', 'Status']}
          rows={weft.map((r) => [
            r.entry_date,
            r.invoice_no || r.challan_no || r.entry_no,
            r.supplier || r.party_name || '—',
            formatQty(r.quantity),
            <span key={r.id} className={statusBadgeClass(r.status)}>
              Completed
            </span>,
          ])}
        />
        <MiniTable
          title="Maintenance (Material)"
          onViewAll={() => onQuick('maint-out')}
          columns={['Date', 'Challan No.', 'Item Name', 'Qty', 'Status']}
          rows={maint.map((r) => [
            r.entry_date,
            r.challan_no || r.entry_no,
            r.item_name || '—',
            formatQty(r.quantity, 0),
            <span key={r.id} className={statusBadgeClass(r.status)}>
              {r.status.replace(/_/g, ' ')}
            </span>,
          ])}
        />
        <MiniTable
          title="General Items"
          onViewAll={() => onQuick('general')}
          columns={['Date', 'Item Name', 'Unit', 'Qty', 'Status']}
          rows={general.map((r) => [
            r.entry_date,
            r.item_name || '—',
            r.unit || '—',
            formatQty(r.quantity, 0),
            <span key={r.id} className={statusBadgeClass(r.status)}>
              Completed
            </span>,
          ])}
        />
      </div>

      <div className="si-dash-bottom">
        <section className="si-panel">
          <div className="si-panel-head">
            <h3>Pending Outward (Not Confirmed)</h3>
            <button type="button" className="btn-link" onClick={() => onQuick('pending')}>
              View All
            </button>
          </div>
          <div className="si-table-wrap">
            <table className="si-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Ref No.</th>
                  <th>Party / To</th>
                  <th>Meter / KG</th>
                  <th>Date</th>
                  <th>Days Pending</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td>{SI_TYPE_LABEL[r.entry_type as keyof typeof SI_TYPE_LABEL] || r.entry_type}</td>
                    <td>{r.entry_no}</td>
                    <td>{r.party_name || '—'}</td>
                    <td>{formatQty(r.quantity)}</td>
                    <td>{r.entry_date}</td>
                    <td>
                      <span className={daysPending(r.entry_date) >= 2 ? 'si-badge si-badge-danger' : 'si-badge si-badge-pending'}>
                        {daysPending(r.entry_date)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!pending.length ? (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No pending outward
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="si-panel">
          <div className="si-panel-head">
            <h3>Stock Alerts</h3>
          </div>
          <ul className="si-alerts">
            {stockAlerts.slice(0, 8).map((a) => (
              <li key={a.name}>
                <span>{a.name}</span>
                <span className={a.level === 'out' ? 'si-badge si-badge-danger' : 'si-badge si-badge-pending'}>
                  {a.level === 'out' ? 'Out' : 'Low'} · {formatQty(a.qty, 0)} {a.unit}
                </span>
              </li>
            ))}
            {!stockAlerts.length ? <li className="text-muted">No stock alerts</li> : null}
          </ul>
        </section>

        <section className="si-panel">
          <div className="si-panel-head">
            <h3>Recent Uploads</h3>
            <button type="button" className="btn-link" onClick={() => onQuick('documents')}>
              View All
            </button>
          </div>
          <ul className="si-docs-mini">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id}>
                <a href={d.file_url} target="_blank" rel="noreferrer">
                  {d.file_name || d.doc_type}
                </a>
                <span className="text-muted">{d.doc_type}</span>
                <span className="text-muted2">{d.uploaded_by || 'Security'}</span>
              </li>
            ))}
            {!docs.length ? <li className="text-muted">No documents yet</li> : null}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`si-kpi si-kpi-${tone}`}>
      <div className="si-kpi-label">{label}</div>
      <div className="si-kpi-value">{value}</div>
    </div>
  )
}

function MiniTable({
  title,
  columns,
  rows,
  onViewAll,
}: {
  title: string
  columns: string[]
  rows: Array<Array<ReactNode>>
  onViewAll: () => void
}) {
  return (
    <section className="si-panel">
      <div className="si-panel-head">
        <h3>{title}</h3>
        <button type="button" className="btn-link" onClick={onViewAll}>
          View All
        </button>
      </div>
      <div className="si-table-wrap">
        <table className="si-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={columns.length} className="text-muted">
                  No entries
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/* ===================== Photo upload ===================== */

function PhotoField({
  files,
  setFiles,
  label = 'Photo / Challan Upload',
}: {
  files: File[]
  setFiles: (f: File[]) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="si-photo-field">
      <span className="si-label">{label}</span>
      <div className="si-photo-actions">
        <button type="button" className="si-btn-secondary" onClick={() => inputRef.current?.click()}>
          Upload / Camera
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          multiple
          hidden
          onChange={(e) => setFiles([...(files || []), ...Array.from(e.target.files || [])])}
        />
        {files.length ? <span className="text-muted">{files.length} file(s)</span> : null}
      </div>
      {files.length ? (
        <ul className="si-file-list">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name}
              <button type="button" className="btn-link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* ===================== Warp ===================== */

function WarpPanel({
  date,
  shift,
  busy,
  parties,
  pipes,
  entries,
  onSaveIn,
  onSaveOut,
}: {
  date: string
  shift: string
  busy: boolean
  parties: string[]
  pipes: Array<{ id: string; pipe_no: string; yarn_quality: string | null }>
  entries: SecurityInventoryEntry[]
  onSaveIn: (p: Parameters<typeof saveWarpInward>[0]) => void
  onSaveOut: (p: Parameters<typeof saveWarpOutward>[0]) => void
}) {
  const [mode, setMode] = useState<'inward' | 'outward'>('inward')
  const [form, setForm] = useState({
    entry_date: date,
    entry_time: nowTimeHHMM(),
    challan_no: '',
    invoice_no: '',
    party_name: '',
    warp_yarn_name: '',
    quality: '',
    denier: '',
    colour_name: '',
    colour_no: '',
    quantity_kg: '',
    quantity_meter: '',
    bags_cones: '',
    vehicle_no: '',
    person_name: '',
    purpose: '',
    remarks: '',
    pipe_id: '',
  })
  const [files, setFiles] = useState<File[]>([])

  useEffect(() => {
    setForm((f) => ({ ...f, entry_date: date }))
  }, [date])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const photos = files.length ? await uploadSiPhotos(files, 'security-warp') : []
    if (mode === 'inward') {
      onSaveIn({
        entry_date: form.entry_date,
        entry_time: form.entry_time,
        shift,
        challan_no: form.challan_no,
        invoice_no: form.invoice_no,
        party_name: form.party_name,
        warp_yarn_name: form.warp_yarn_name,
        quality: form.quality || form.warp_yarn_name,
        denier: form.denier,
        colour_name: form.colour_name,
        colour_no: form.colour_no,
        quantity_kg: Number(form.quantity_kg) || 0,
        bags_cones: Number(form.bags_cones) || undefined,
        vehicle_no: form.vehicle_no,
        person_name: form.person_name,
        purpose: form.purpose,
        remarks: form.remarks,
        photo_urls: photos,
      })
    } else {
      const pipe = pipes.find((p) => p.id === form.pipe_id)
      onSaveOut({
        entry_date: form.entry_date,
        entry_time: form.entry_time,
        shift,
        challan_no: form.challan_no,
        party_name: form.party_name,
        warp_yarn_name: form.warp_yarn_name || pipe?.yarn_quality || '',
        quality: form.quality || form.warp_yarn_name || pipe?.yarn_quality || '',
        quantity_kg: Number(form.quantity_kg) || 0,
        quantity_meter: Number(form.quantity_meter) || undefined,
        pipe_id: form.pipe_id || undefined,
        pipe_no: pipe?.pipe_no,
        vehicle_no: form.vehicle_no,
        person_name: form.person_name,
        purpose: form.purpose,
        remarks: form.remarks,
        photo_urls: photos,
      })
    }
    setFiles([])
  }

  return (
    <div className="si-form-page">
      <div className="si-mode-toggle">
        <button type="button" className={mode === 'inward' ? 'active' : ''} onClick={() => setMode('inward')}>
          Inward
        </button>
        <button type="button" className={mode === 'outward' ? 'active' : ''} onClick={() => setMode('outward')}>
          Outward
        </button>
      </div>
      <form className="si-form" onSubmit={(e) => void submit(e)}>
        <div className="si-form-grid">
          <Field label="Date">
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
          </Field>
          <Field label="Time">
            <input type="time" value={form.entry_time} onChange={(e) => setForm({ ...form, entry_time: e.target.value })} />
          </Field>
          <Field label="Challan No.">
            <input value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} />
          </Field>
          {mode === 'inward' ? (
            <Field label="Invoice No.">
              <input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
            </Field>
          ) : (
            <Field label="Pipe / Beam (optional)">
              <select value={form.pipe_id} onChange={(e) => setForm({ ...form, pipe_id: e.target.value })}>
                <option value="">Soft outward (KG only)</option>
                {pipes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pipe_no} {p.yarn_quality ? `· ${p.yarn_quality}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={mode === 'inward' ? 'Party / Supplier' : 'Party / Vendor / Warper'}>
            <input
              list="si-parties"
              value={form.party_name}
              onChange={(e) => setForm({ ...form, party_name: e.target.value })}
              required
            />
          </Field>
          <Field label="Warp Yarn Name">
            <input value={form.warp_yarn_name} onChange={(e) => setForm({ ...form, warp_yarn_name: e.target.value })} required={mode === 'inward'} />
          </Field>
          <Field label="Quality">
            <input value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} />
          </Field>
          {mode === 'inward' ? (
            <>
              <Field label="Denier">
                <input value={form.denier} onChange={(e) => setForm({ ...form, denier: e.target.value })} />
              </Field>
              <Field label="Colour">
                <input value={form.colour_name} onChange={(e) => setForm({ ...form, colour_name: e.target.value })} />
              </Field>
              <Field label="Colour Number">
                <input value={form.colour_no} onChange={(e) => setForm({ ...form, colour_no: e.target.value })} />
              </Field>
              <Field label="No. of Bags">
                <input type="number" min={0} value={form.bags_cones} onChange={(e) => setForm({ ...form, bags_cones: e.target.value })} />
              </Field>
            </>
          ) : (
            <Field label="Quantity / Meter">
              <input type="number" min={0} step="any" value={form.quantity_meter} onChange={(e) => setForm({ ...form, quantity_meter: e.target.value })} />
            </Field>
          )}
          <Field label="Quantity KG">
            <input type="number" min={0} step="any" value={form.quantity_kg} onChange={(e) => setForm({ ...form, quantity_kg: e.target.value })} required />
          </Field>
          <Field label="Vehicle / Tempo No.">
            <input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
          </Field>
          <Field label="Driver / Person Name">
            <input value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
          </Field>
          <Field label="Purpose">
            <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </Field>
          <Field label="Remarks" wide>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
        </div>
        <PhotoField files={files} setFiles={setFiles} />
        <datalist id="si-parties">
          {parties.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="si-sticky-save">
          <button type="submit" className="primary-save" disabled={busy}>
            {busy ? 'Saving…' : mode === 'inward' ? 'Save Warp Inward (WI)' : 'Save Warp Outward (WO)'}
          </button>
        </div>
      </form>
      <EntryList entries={entries} />
    </div>
  )
}

function Field({
  label,
  children,
  wide,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={wide ? 'si-field si-field-wide' : 'si-field'}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function EntryList({ entries }: { entries: SecurityInventoryEntry[] }) {
  return (
    <section className="si-panel si-mt">
      <div className="si-panel-head">
        <h3>Recent Security Entries</h3>
      </div>
      <div className="si-cards-mobile">
        {entries.slice(0, 20).map((r) => (
          <article key={r.id} className="si-card-row">
            <div>
              <strong>{r.entry_no}</strong>
              <div className="text-muted">
                {r.entry_date} · {r.party_name || r.supplier || '—'} · {r.item_name || '—'}
              </div>
            </div>
            <div className="si-card-meta">
              <span>{formatQty(r.quantity)} {r.unit}</span>
              <span className={statusBadgeClass(r.status)}>{r.status.replace(/_/g, ' ')}</span>
            </div>
          </article>
        ))}
        {!entries.length ? <p className="text-muted">No entries yet</p> : null}
      </div>
    </section>
  )
}

/* ===================== Weft ===================== */

function WeftPanel({
  date,
  shift,
  busy,
  parties,
  entries,
  onSave,
}: {
  date: string
  shift: string
  busy: boolean
  parties: string[]
  entries: SecurityInventoryEntry[]
  onSave: (p: Parameters<typeof saveWeftInward>[0]) => void
}) {
  const [form, setForm] = useState({
    entry_date: date,
    entry_time: nowTimeHHMM(),
    challan_no: '',
    invoice_no: '',
    supplier: '',
    vehicle_no: '',
    person_name: '',
    remarks: '',
    gst_pct: '5',
  })
  const [lines, setLines] = useState<YarnLine[]>([emptyYarnLine()])
  const [files, setFiles] = useState<File[]>([])
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)

  useEffect(() => {
    setForm((f) => ({ ...f, entry_date: date }))
  }, [date])

  const totals = useMemo(() => {
    const taxable = lines.reduce((s, l) => s + Number(l.quantity_kg || 0) * Number(l.rate || 0), 0)
    const gstPct = Number(form.gst_pct) || 0
    const gst = (taxable * gstPct) / 100
    return { taxable, gst, grand: taxable + gst, qty: lines.reduce((s, l) => s + Number(l.quantity_kg || 0), 0) }
  }, [lines, form.gst_pct])

  async function runOcr(file: File) {
    setOcrBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      const { data, error } = await supabase.functions.invoke('invoice-ocr', {
        body: {
          image_base64: btoa(binary),
          media_type: file.type || 'image/jpeg',
          yarn_type: 'weft',
        },
      })
      if (error) throw new Error(error.message || 'OCR failed')
      if (data?.error) throw new Error(String(data.error))
      setOcrPreview(
        `Supplier: ${data?.supplier_name || '—'} · Item: ${data?.item || '—'} · Qty: ${data?.qty ?? '—'} · Amount: ${data?.amount ?? '—'}`,
      )
      // Confirm-only: prefill but do not overwrite filled fields silently
      setForm((f) => ({
        ...f,
        supplier: f.supplier || String(data?.supplier_name || ''),
      }))
      setLines((prev) => {
        const first = { ...prev[0] }
        if (!first.yarn_name) first.yarn_name = String(data?.item || '')
        if (!first.colour) first.colour = String(data?.item || '')
        if (!first.quantity_kg && data?.qty != null) first.quantity_kg = Number(data.qty) || 0
        if (!first.rate && data?.amount != null && data?.qty) {
          first.rate = Number(data.qty) ? Number(data.amount) / Number(data.qty) : 0
        }
        first.amount = first.quantity_kg * first.rate
        return [first, ...prev.slice(1)]
      })
    } catch (e) {
      setOcrPreview(e instanceof Error ? e.message : 'OCR failed — enter manually')
    } finally {
      setOcrBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const photos = files.length ? await uploadSiPhotos(files, 'security-weft') : []
    onSave({
      entry_date: form.entry_date,
      entry_time: form.entry_time,
      shift,
      challan_no: form.challan_no,
      invoice_no: form.invoice_no,
      supplier: form.supplier,
      vehicle_no: form.vehicle_no,
      person_name: form.person_name,
      remarks: form.remarks,
      photo_urls: photos,
      gst_pct: Number(form.gst_pct) || 0,
      lines: lines.map((l) => ({
        ...l,
        amount: Number(l.quantity_kg || 0) * Number(l.rate || 0),
      })),
    })
    setFiles([])
    setLines([emptyYarnLine()])
  }

  return (
    <div className="si-form-page">
      <form className="si-form" onSubmit={(e) => void submit(e)}>
        <div className="si-form-grid">
          <Field label="Date">
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
          </Field>
          <Field label="Time">
            <input type="time" value={form.entry_time} onChange={(e) => setForm({ ...form, entry_time: e.target.value })} />
          </Field>
          <Field label="Challan No.">
            <input value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} />
          </Field>
          <Field label="Invoice No.">
            <input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
          </Field>
          <Field label="Supplier">
            <input list="si-parties-weft" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
          </Field>
          <Field label="GST %">
            <input type="number" min={0} step="any" value={form.gst_pct} onChange={(e) => setForm({ ...form, gst_pct: e.target.value })} />
          </Field>
          <Field label="Vehicle No.">
            <input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
          </Field>
          <Field label="Driver / Person">
            <input value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
          </Field>
          <Field label="Remarks" wide>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
        </div>

        <div className="si-lines">
          <div className="si-panel-head">
            <h3>Colour-wise Yarn Lines</h3>
            <button
              type="button"
              className="si-btn-secondary"
              onClick={() => setLines([...lines, emptyYarnLine()])}
            >
              + Add Yarn Line
            </button>
          </div>
          <div className="si-table-wrap si-lines-table">
            <table className="si-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Yarn Name</th>
                  <th>Colour</th>
                  <th>Colour No.</th>
                  <th>Quality</th>
                  <th>Denier / Tex</th>
                  <th>Qty KG</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input
                        value={l.yarn_name}
                        onChange={(e) => {
                          const next = [...lines]
                          next[i] = { ...l, yarn_name: e.target.value }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.colour}
                        onChange={(e) => {
                          const next = [...lines]
                          next[i] = { ...l, colour: e.target.value }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.colour_no}
                        onChange={(e) => {
                          const next = [...lines]
                          next[i] = { ...l, colour_no: e.target.value }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.quality}
                        onChange={(e) => {
                          const next = [...lines]
                          next[i] = { ...l, quality: e.target.value }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        value={l.denier}
                        onChange={(e) => {
                          const next = [...lines]
                          next[i] = { ...l, denier: e.target.value }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={l.quantity_kg || ''}
                        onChange={(e) => {
                          const next = [...lines]
                          const quantity_kg = Number(e.target.value) || 0
                          next[i] = { ...l, quantity_kg, amount: quantity_kg * Number(l.rate || 0) }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={l.rate || ''}
                        onChange={(e) => {
                          const next = [...lines]
                          const rate = Number(e.target.value) || 0
                          next[i] = { ...l, rate, amount: Number(l.quantity_kg || 0) * rate }
                          setLines(next)
                        }}
                      />
                    </td>
                    <td>{formatQty(Number(l.quantity_kg || 0) * Number(l.rate || 0), 2)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-link"
                        disabled={lines.length <= 1}
                        onClick={() => setLines(lines.filter((_, j) => j !== i))}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="si-totals">
            <span>Qty: {formatQty(totals.qty)} KG</span>
            <span>Taxable: ₹{formatQty(totals.taxable, 2)}</span>
            <span>GST: ₹{formatQty(totals.gst, 2)}</span>
            <strong>Grand Total: ₹{formatQty(totals.grand, 2)}</strong>
          </div>
        </div>

        <PhotoField files={files} setFiles={setFiles} label="Upload Invoice / Challan / Photo" />
        <div className="si-ocr-row">
          <label className="si-btn-secondary si-file-btn">
            OCR from photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setFiles((prev) => [...prev, f])
                  void runOcr(f)
                }
              }}
            />
          </label>
          {ocrBusy ? <span className="text-muted">Reading…</span> : null}
          {ocrPreview ? <span className="si-ocr-preview">OCR Result → confirm: {ocrPreview}</span> : null}
        </div>

        <datalist id="si-parties-weft">
          {parties.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="si-sticky-save">
          <button type="submit" className="primary-save" disabled={busy}>
            {busy ? 'Saving…' : 'Save Weft Inward (WE)'}
          </button>
        </div>
      </form>
      <EntryList entries={entries} />
    </div>
  )
}

/* ===================== Maintenance In ===================== */

function MaintInPanel({
  date,
  shift,
  busy,
  parties,
  items,
  entries,
  onSave,
}: {
  date: string
  shift: string
  busy: boolean
  parties: string[]
  items: InventoryItemMaster[]
  entries: SecurityInventoryEntry[]
  onSave: (p: Parameters<typeof saveMaintInward>[0]) => void
}) {
  const [form, setForm] = useState({
    entry_date: date,
    challan_no: '',
    invoice_no: '',
    supplier: '',
    item_id: '',
    item_name: '',
    item_code: '',
    quantity: '',
    unit: 'NOS',
    machine_no: '',
    department: '',
    vehicle_no: '',
    person_name: '',
    remarks: '',
    is_other: false,
    other_description: '',
  })
  const [files, setFiles] = useState<File[]>([])
  const [itemSearch, setItemSearch] = useState('')

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase()
    if (!q) return items.slice(0, 40)
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.item_code || '').toLowerCase().includes(q)).slice(0, 40)
  }, [items, itemSearch])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const photos = files.length ? await uploadSiPhotos(files, 'security-maint') : []
    const selected = items.find((i) => i.id === form.item_id)
    onSave({
      entry_date: form.entry_date,
      shift,
      challan_no: form.challan_no,
      invoice_no: form.invoice_no,
      supplier: form.supplier,
      item_name: form.is_other ? form.item_name : selected?.name || form.item_name,
      item_id: form.is_other ? undefined : form.item_id || undefined,
      item_code: form.item_code || selected?.item_code || undefined,
      quantity: Number(form.quantity) || 0,
      unit: form.unit || selected?.unit || 'NOS',
      machine_no: form.machine_no,
      department: form.department,
      vehicle_no: form.vehicle_no,
      person_name: form.person_name,
      remarks: form.remarks,
      photo_urls: photos,
      is_other: form.is_other,
      other_description: form.other_description,
    })
    setFiles([])
  }

  return (
    <div className="si-form-page">
      <form className="si-form" onSubmit={(e) => void submit(e)}>
        <div className="si-form-grid">
          <Field label="Date">
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
          </Field>
          <Field label="Challan No.">
            <input value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} />
          </Field>
          <Field label="Invoice No.">
            <input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
          </Field>
          <Field label="Supplier">
            <input list="si-parties-mi" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
          </Field>
          <Field label="Search Item Master" wide>
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Pick Finder, Bearing 6205…"
              disabled={form.is_other}
            />
          </Field>
          <Field label="Item" wide>
            <select
              value={form.item_id}
              disabled={form.is_other}
              onChange={(e) => {
                const it = items.find((i) => i.id === e.target.value)
                setForm({
                  ...form,
                  item_id: e.target.value,
                  item_name: it?.name || '',
                  item_code: it?.item_code || '',
                  unit: it?.unit || form.unit,
                })
              }}
              required={!form.is_other}
            >
              <option value="">Select from Item Master</option>
              {filteredItems.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.item_code ? `(${i.item_code})` : ''} · stock {formatQty(i.stock_qty || 0, 0)}
                </option>
              ))}
            </select>
          </Field>
          <label className="si-check">
            <input
              type="checkbox"
              checked={form.is_other}
              onChange={(e) => setForm({ ...form, is_other: e.target.checked, item_id: '' })}
            />
            + Add New / OTHERS
          </label>
          {form.is_other ? (
            <>
              <Field label="Other Item Name">
                <input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required />
              </Field>
              <Field label="Other Item Description" wide>
                <input value={form.other_description} onChange={(e) => setForm({ ...form, other_description: e.target.value })} />
              </Field>
            </>
          ) : null}
          <Field label="Item Code">
            <input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })} />
          </Field>
          <Field label="Quantity">
            <input type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>
          <Field label="Unit">
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {['NOS', 'KG', 'LTR', 'MTR', 'SET'].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
          <Field label="Machine">
            <select value={form.machine_no} onChange={(e) => setForm({ ...form, machine_no: e.target.value })}>
              <option value="">—</option>
              {MACHINES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="Department">
            <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </Field>
          <Field label="Vehicle No.">
            <input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
          </Field>
          <Field label="Person">
            <input value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
          </Field>
          <Field label="Remarks" wide>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
        </div>
        <PhotoField files={files} setFiles={setFiles} />
        <datalist id="si-parties-mi">
          {parties.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="si-sticky-save">
          <button type="submit" className="primary-save" disabled={busy}>
            {busy ? 'Saving…' : 'Save Maintenance Inward (MI)'}
          </button>
        </div>
      </form>
      <EntryList entries={entries} />
    </div>
  )
}

/* ===================== Maintenance Out / Return ===================== */

function MaintOutPanel({
  date,
  shift,
  busy,
  parties,
  items,
  entries,
  onSaveOut,
  onSaveReturn,
}: {
  date: string
  shift: string
  busy: boolean
  parties: string[]
  items: InventoryItemMaster[]
  entries: SecurityInventoryEntry[]
  onSaveOut: (p: Parameters<typeof saveMaintOutward>[0]) => void
  onSaveReturn: (p: Parameters<typeof saveMaintReturn>[0]) => void
}) {
  const [mode, setMode] = useState<'out' | 'return'>('out')
  const [form, setForm] = useState({
    entry_date: date,
    challan_no: '',
    item_id: '',
    item_name: '',
    item_code: '',
    quantity: '',
    unit: 'NOS',
    machine_no: '',
    department: '',
    sent_to: '',
    purpose: '',
    repair_type: 'Repairing',
    vehicle_no: '',
    person_name: '',
    expected_return_date: '',
    remarks: '',
    parent_entry_id: '',
    returned_qty: '',
  })
  const [files, setFiles] = useState<File[]>([])

  const openRepairs = entries.filter(
    (e) => e.entry_type === 'maint_outward' && ['out_for_repair', 'partially_returned', 'overdue'].includes(pendingRepairStatus(e)),
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    const photos = files.length ? await uploadSiPhotos(files, 'security-maint-out') : []
    if (mode === 'out') {
      const selected = items.find((i) => i.id === form.item_id)
      onSaveOut({
        entry_date: form.entry_date,
        shift,
        challan_no: form.challan_no,
        item_name: selected?.name || form.item_name,
        item_id: form.item_id || undefined,
        item_code: form.item_code || selected?.item_code || undefined,
        quantity: Number(form.quantity) || 0,
        unit: form.unit,
        machine_no: form.machine_no,
        department: form.department,
        sent_to: form.sent_to,
        purpose: form.purpose,
        repair_type: form.repair_type,
        vehicle_no: form.vehicle_no,
        person_name: form.person_name,
        expected_return_date: form.expected_return_date || undefined,
        remarks: form.remarks,
        photo_urls: photos,
      })
    } else {
      onSaveReturn({
        parent_entry_id: form.parent_entry_id,
        entry_date: form.entry_date,
        shift,
        returned_qty: Number(form.returned_qty) || 0,
        remarks: form.remarks,
        photo_urls: photos,
        person_name: form.person_name,
        vehicle_no: form.vehicle_no,
      })
    }
    setFiles([])
  }

  return (
    <div className="si-form-page">
      <div className="si-mode-toggle">
        <button type="button" className={mode === 'out' ? 'active' : ''} onClick={() => setMode('out')}>
          Outward / Repairing
        </button>
        <button type="button" className={mode === 'return' ? 'active' : ''} onClick={() => setMode('return')}>
          Return
        </button>
      </div>
      <form className="si-form" onSubmit={(e) => void submit(e)}>
        {mode === 'out' ? (
          <div className="si-form-grid">
            <Field label="Date">
              <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
            </Field>
            <Field label="Challan No.">
              <input value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} />
            </Field>
            <Field label="Item" wide>
              <select
                value={form.item_id}
                onChange={(e) => {
                  const it = items.find((i) => i.id === e.target.value)
                  setForm({
                    ...form,
                    item_id: e.target.value,
                    item_name: it?.name || '',
                    item_code: it?.item_code || '',
                    unit: it?.unit || form.unit,
                  })
                }}
                required
              >
                <option value="">Select item</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · stock {formatQty(i.stock_qty || 0, 0)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input type="number" min={0} step="any" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </Field>
            <Field label="Unit">
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </Field>
            <Field label="Machine / Department">
              <select value={form.machine_no} onChange={(e) => setForm({ ...form, machine_no: e.target.value })}>
                <option value="">—</option>
                {MACHINES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Sent To / Vendor">
              <input list="si-parties-mo" value={form.sent_to} onChange={(e) => setForm({ ...form, sent_to: e.target.value })} required />
            </Field>
            <Field label="Purpose">
              <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </Field>
            <Field label="Repair Type">
              <input value={form.repair_type} onChange={(e) => setForm({ ...form, repair_type: e.target.value })} />
            </Field>
            <Field label="Expected Return Date">
              <input type="date" value={form.expected_return_date} onChange={(e) => setForm({ ...form, expected_return_date: e.target.value })} />
            </Field>
            <Field label="Vehicle / Person">
              <input value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
            </Field>
            <Field label="Remarks" wide>
              <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </Field>
          </div>
        ) : (
          <div className="si-form-grid">
            <Field label="Original Outward" wide>
              <select
                value={form.parent_entry_id}
                onChange={(e) => setForm({ ...form, parent_entry_id: e.target.value })}
                required
              >
                <option value="">Select outward transaction</option>
                {openRepairs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.entry_no} · {r.item_name} · Sent {formatQty(r.quantity, 0)} · Returned {formatQty(r.qty_returned, 0)} · Pending{' '}
                    {formatQty(Number(r.quantity) - Number(r.qty_returned), 0)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Return Date">
              <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
            </Field>
            <Field label="Returned Qty">
              <input type="number" min={0} step="any" value={form.returned_qty} onChange={(e) => setForm({ ...form, returned_qty: e.target.value })} required />
            </Field>
            <Field label="Person">
              <input value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
            </Field>
            <Field label="Remarks" wide>
              <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            </Field>
          </div>
        )}
        <PhotoField files={files} setFiles={setFiles} />
        <datalist id="si-parties-mo">
          {parties.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="si-sticky-save">
          <button type="submit" className="primary-save" disabled={busy}>
            {busy ? 'Saving…' : mode === 'out' ? 'Save Outward (MO)' : 'Save Return (MR)'}
          </button>
        </div>
      </form>

      <section className="si-panel si-mt">
        <div className="si-panel-head">
          <h3>Pending Repair Tracking</h3>
        </div>
        <div className="si-table-wrap">
          <table className="si-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty Sent</th>
                <th>Returned</th>
                <th>Pending</th>
                <th>Vendor</th>
                <th>Out Date</th>
                <th>Expected</th>
                <th>Days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {openRepairs.map((r) => {
                const st = pendingRepairStatus(r)
                return (
                  <tr key={r.id} className={st === 'overdue' ? 'si-row-overdue' : undefined}>
                    <td>{r.item_name}</td>
                    <td>{formatQty(r.quantity, 0)}</td>
                    <td>{formatQty(r.qty_returned, 0)}</td>
                    <td>{formatQty(Number(r.quantity) - Number(r.qty_returned), 0)}</td>
                    <td>{r.party_name}</td>
                    <td>{r.entry_date}</td>
                    <td>{r.expected_return_date || '—'}</td>
                    <td>{daysPending(r.entry_date)}</td>
                    <td>
                      <span className={statusBadgeClass(st)}>{st.replace(/_/g, ' ')}</span>
                    </td>
                  </tr>
                )
              })}
              {!openRepairs.length ? (
                <tr>
                  <td colSpan={9} className="text-muted">
                    No pending repairs
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

/* ===================== General / Others ===================== */

function GeneralPanel({
  mode,
  date,
  shift,
  busy,
  parties,
  items,
  entries,
  onSave,
}: {
  mode: 'general' | 'other'
  date: string
  shift: string
  busy: boolean
  parties: string[]
  items: InventoryItemMaster[]
  entries: SecurityInventoryEntry[]
  onSave: (p: Parameters<typeof saveGeneralInward>[0]) => void
}) {
  const [form, setForm] = useState({
    entry_date: date,
    challan_no: '',
    invoice_no: '',
    supplier: '',
    vehicle_no: '',
    person_name: '',
    remarks: '',
    description: '',
    category: '',
  })
  const [lines, setLines] = useState([{ item_name: '', item_id: '', quantity: '', unit: 'NOS', rate: '', gst_pct: '0' }])
  const [files, setFiles] = useState<File[]>([])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const photos = files.length ? await uploadSiPhotos(files, 'security-general') : []
    onSave({
      entry_date: form.entry_date,
      shift,
      challan_no: form.challan_no,
      invoice_no: form.invoice_no,
      supplier: form.supplier,
      vehicle_no: form.vehicle_no,
      person_name: form.person_name,
      remarks: form.remarks,
      description: form.description || form.category,
      photo_urls: photos,
      category: mode,
      lines: lines
        .filter((l) => l.item_name.trim())
        .map((l) => {
          const qty = Number(l.quantity) || 0
          const rate = Number(l.rate) || 0
          const gst = Number(l.gst_pct) || 0
          return {
            item_name: l.item_name,
            item_id: l.item_id || undefined,
            quantity: qty,
            unit: l.unit,
            rate,
            gst_pct: gst,
            amount: qty * rate,
          }
        }),
    })
    setFiles([])
    setLines([{ item_name: '', item_id: '', quantity: '', unit: 'NOS', rate: '', gst_pct: '0' }])
  }

  return (
    <div className="si-form-page">
      <form className="si-form" onSubmit={(e) => void submit(e)}>
        <div className="si-form-grid">
          <Field label="Date">
            <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
          </Field>
          <Field label="Challan No.">
            <input value={form.challan_no} onChange={(e) => setForm({ ...form, challan_no: e.target.value })} />
          </Field>
          <Field label="Invoice No.">
            <input value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
          </Field>
          <Field label="Supplier / Party">
            <input list="si-parties-gi" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} required />
          </Field>
          {mode === 'other' ? (
            <>
              <Field label="Category">
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </Field>
              <Field label="Description" wide>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </>
          ) : null}
          <Field label="Vehicle">
            <input value={form.vehicle_no} onChange={(e) => setForm({ ...form, vehicle_no: e.target.value })} />
          </Field>
          <Field label="Person">
            <input value={form.person_name} onChange={(e) => setForm({ ...form, person_name: e.target.value })} />
          </Field>
          <Field label="Remarks" wide>
            <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </Field>
        </div>

        <div className="si-lines">
          <div className="si-panel-head">
            <h3>Items</h3>
            <button
              type="button"
              className="si-btn-secondary"
              onClick={() => setLines([...lines, { item_name: '', item_id: '', quantity: '', unit: 'NOS', rate: '', gst_pct: '0' }])}
            >
              + Add Item
            </button>
          </div>
          {lines.map((l, i) => (
            <div className="si-form-grid si-line-card" key={i}>
              <Field label="Item" wide>
                {mode === 'general' ? (
                  <select
                    value={l.item_id}
                    onChange={(e) => {
                      const it = items.find((x) => x.id === e.target.value)
                      const next = [...lines]
                      next[i] = {
                        ...l,
                        item_id: e.target.value,
                        item_name: it?.name || '',
                        unit: it?.unit || l.unit,
                      }
                      setLines(next)
                    }}
                  >
                    <option value="">Select standard item</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={l.item_name}
                    onChange={(e) => {
                      const next = [...lines]
                      next[i] = { ...l, item_name: e.target.value }
                      setLines(next)
                    }}
                    required
                  />
                )}
              </Field>
              {mode === 'general' && !l.item_id ? (
                <Field label="Or type new (will standardize)">
                  <input
                    value={l.item_name}
                    onChange={(e) => {
                      const next = [...lines]
                      next[i] = { ...l, item_name: e.target.value }
                      setLines(next)
                    }}
                  />
                </Field>
              ) : null}
              <Field label="Qty">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={l.quantity}
                  onChange={(e) => {
                    const next = [...lines]
                    next[i] = { ...l, quantity: e.target.value }
                    setLines(next)
                  }}
                  required
                />
              </Field>
              <Field label="Unit">
                <input
                  value={l.unit}
                  onChange={(e) => {
                    const next = [...lines]
                    next[i] = { ...l, unit: e.target.value }
                    setLines(next)
                  }}
                />
              </Field>
              <Field label="Rate">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={l.rate}
                  onChange={(e) => {
                    const next = [...lines]
                    next[i] = { ...l, rate: e.target.value }
                    setLines(next)
                  }}
                />
              </Field>
              <Field label="GST %">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={l.gst_pct}
                  onChange={(e) => {
                    const next = [...lines]
                    next[i] = { ...l, gst_pct: e.target.value }
                    setLines(next)
                  }}
                />
              </Field>
              <div className="si-line-actions">
                <button type="button" className="btn-link" disabled={lines.length <= 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        <PhotoField files={files} setFiles={setFiles} />
        <datalist id="si-parties-gi">
          {parties.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="si-sticky-save">
          <button type="submit" className="primary-save" disabled={busy}>
            {busy ? 'Saving…' : mode === 'other' ? 'Save Other (OT)' : 'Save General Inward (GI)'}
          </button>
        </div>
      </form>
      <EntryList entries={entries} />
    </div>
  )
}

/* ===================== Pending / Docs / Reports ===================== */

function PendingPanel({
  entries,
  onVoid,
  busy,
}: {
  entries: SecurityInventoryEntry[]
  onVoid: (id: string, reason: string) => void
  busy: boolean
}) {
  const pending = entries.filter((e) =>
    ['pending_outward', 'out_for_repair', 'partially_returned', 'overdue', 'pending_inward', 'document_pending'].includes(
      e.entry_type === 'maint_outward' ? pendingRepairStatus(e) : e.status,
    ) || ['pending_outward', 'out_for_repair', 'partially_returned', 'overdue', 'pending_inward', 'document_pending'].includes(e.status),
  )

  return (
    <section className="si-panel">
      <div className="si-panel-head">
        <h3>Pending Entries</h3>
      </div>
      <div className="si-table-wrap">
        <table className="si-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Reference No.</th>
              <th>Date</th>
              <th>Party</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Days Pending</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((r) => {
              const st = r.entry_type === 'maint_outward' ? pendingRepairStatus(r) : r.status
              return (
                <tr key={r.id} className={st === 'overdue' ? 'si-row-overdue' : undefined}>
                  <td>{SI_TYPE_LABEL[r.entry_type as keyof typeof SI_TYPE_LABEL] || r.entry_type}</td>
                  <td>{r.entry_no}</td>
                  <td>{r.entry_date}</td>
                  <td>{r.party_name || r.supplier || '—'}</td>
                  <td>{r.item_name || '—'}</td>
                  <td>
                    {formatQty(r.quantity)} {r.unit}
                  </td>
                  <td>{daysPending(r.entry_date)}</td>
                  <td>
                    <span className={statusBadgeClass(st)}>{st.replace(/_/g, ' ')}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      disabled={busy || r.status === 'void'}
                      onClick={() => {
                        const reason = window.prompt('Void reason?')
                        if (reason) onVoid(r.id, reason)
                      }}
                    >
                      Void
                    </button>
                  </td>
                </tr>
              )
            })}
            {!pending.length ? (
              <tr>
                <td colSpan={9} className="text-muted">
                  No pending entries
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DocumentsPanel({
  docs,
  entries,
}: {
  docs: SecurityInventoryDocument[]
  entries: SecurityInventoryEntry[]
}) {
  const entryMap = new Map(entries.map((e) => [e.id, e]))
  return (
    <section className="si-panel">
      <div className="si-panel-head">
        <h3>Recent Documents</h3>
      </div>
      <div className="si-table-wrap">
        <table className="si-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Reference No.</th>
              <th>Type</th>
              <th>Uploaded Date</th>
              <th>Uploaded By</th>
              <th>View</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const ent = d.entry_id ? entryMap.get(d.entry_id) : null
              return (
                <tr key={d.id}>
                  <td>{d.file_name || d.doc_type}</td>
                  <td>{ent?.entry_no || '—'}</td>
                  <td>{ent ? SI_TYPE_LABEL[ent.entry_type as keyof typeof SI_TYPE_LABEL] || d.doc_type : d.doc_type}</td>
                  <td>{new Date(d.created_at).toLocaleString()}</td>
                  <td>{d.uploaded_by || 'Security'}</td>
                  <td>
                    <a href={d.file_url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  </td>
                </tr>
              )
            })}
            {!docs.length ? (
              <tr>
                <td colSpan={6} className="text-muted">
                  No documents
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReportsPanel({
  entries,
  filters,
  setFilters,
  date,
  shift,
}: {
  entries: SecurityInventoryEntry[]
  filters: SiFilters
  setFilters: (f: SiFilters) => void
  date: string
  shift: string
}) {
  const daily = entries.filter((e) => e.entry_date === (filters.dateFrom || date) && e.status !== 'void')

  function printDaily() {
    const groups = SI_ENTRY_TYPES.map((t) => {
      const rows = daily.filter((e) => e.entry_type === t)
      return {
        type: SI_TYPE_LABEL[t],
        count: rows.length,
        qty: rows.reduce((s, r) => s + Number(r.quantity || 0), 0),
      }
    }).filter((g) => g.count > 0)

    printSecurityReport({
      title: 'Security Daily Material Report',
      dateLabel: `Date: ${filters.dateFrom || date} · Shift: ${filters.shift || shift}`,
      columns: ['Type', 'Total Entries', 'Total Quantity'],
      rows: groups.map((g) => [g.type, g.count, formatQty(g.qty)]),
      totals: [
        ['Total Entries', String(daily.length)],
        ['Total Quantity', formatQty(daily.reduce((s, r) => s + Number(r.quantity || 0), 0))],
      ],
    })
  }

  function printFiltered(title: string) {
    printSecurityReport({
      title,
      dateLabel: `${filters.dateFrom || '…'} to ${filters.dateTo || '…'}`,
      columns: ['Entry No', 'Date', 'Type', 'Party', 'Item', 'Qty', 'Status'],
      rows: entries.map((r) => [
        r.entry_no,
        r.entry_date,
        SI_TYPE_LABEL[r.entry_type as keyof typeof SI_TYPE_LABEL] || r.entry_type,
        r.party_name || r.supplier || '—',
        r.item_name || '—',
        `${formatQty(r.quantity)} ${r.unit || ''}`,
        r.status,
      ]),
    })
  }

  return (
    <div className="si-reports">
      <section className="si-panel">
        <div className="si-panel-head">
          <h3>Search & Filter</h3>
        </div>
        <div className="si-filter-grid">
          <input
            type="search"
            placeholder="Search…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          <input placeholder="Party" value={filters.party} onChange={(e) => setFilters({ ...filters, party: e.target.value })} />
          <input placeholder="Item" value={filters.item} onChange={(e) => setFilters({ ...filters, item: e.target.value })} />
          <input placeholder="Challan" value={filters.challan} onChange={(e) => setFilters({ ...filters, challan: e.target.value })} />
          <select value={filters.entryType} onChange={(e) => setFilters({ ...filters, entryType: e.target.value })}>
            <option value="">All types</option>
            {Object.entries(SI_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={filters.shift} onChange={(e) => setFilters({ ...filters, shift: e.target.value })}>
            <option value="">All shifts</option>
            {SI_SHIFTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </section>

      <div className="si-report-actions">
        <button type="button" className="si-btn-secondary" onClick={printDaily}>
          Print Security Daily Report
        </button>
        <button type="button" className="si-btn-secondary" onClick={() => printFiltered('Security Stock / Material Report')}>
          Print Filtered Report (A4)
        </button>
        <button
          type="button"
          className="si-btn-secondary"
          onClick={() =>
            printFiltered(
              filters.entryType
                ? `${SI_TYPE_LABEL[filters.entryType as keyof typeof SI_TYPE_LABEL] || 'Security'} Report`
                : 'Pending Outward Report',
            )
          }
        >
          Print Type Report
        </button>
      </div>

      <EntryList entries={entries} />
    </div>
  )
}
