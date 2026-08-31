import { useCallback, useEffect, useState } from 'react'
import { RecordActions } from '../components/RecordActions'
import { ShareActions } from '../components/ShareActions'
import { SubTabs } from '../components/SubTabs'
import { useAuth } from '../lib/auth'
import type { GatePassRecord, MaintenanceMaterial } from '../lib/database.types'
import { todayISO } from '../lib/mutate'
import { applyEditDeleteOrQueue } from '../lib/pendingApprovals'
import { confirmDeleteRecord } from '../lib/recordCrud'
import { printSummary, rowsToHtml, shareWhatsApp, shareWhatsAppBusiness } from '../lib/share'
import { supabase } from '../lib/supabase'

type TabId = 'out' | 'in' | 'list'

type RowWithGp = MaintenanceMaterial & { gate_pass?: GatePassRecord | null }

async function nextGpNumber(): Promise<string> {
  const { data } = await supabase
    .from('gate_pass')
    .select('gp_number')
    .order('generated_at', { ascending: false })
    .limit(50)
  let max = 0
  for (const row of data ?? []) {
    const m = String(row.gp_number || '').match(/(\d+)\s*$/)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `GP-M${String(max + 1).padStart(4, '0')}`
}

export function MaintenanceMaterialScreen() {
  const { profile, isCeo } = useAuth()
  const [tab, setTab] = useState<TabId>('out')
  const [rows, setRows] = useState<RowWithGp[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lastGp, setLastGp] = useState<GatePassRecord | null>(null)

  const [material, setMaterial] = useState('')
  const [purpose, setPurpose] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [entryDate, setEntryDate] = useState(todayISO())
  const [editId, setEditId] = useState<string | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const enteredBy = profile?.full_name || profile?.roles?.role_name || 'Unknown'

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('maintenance_material')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80)
    if (err) throw err
    const materials = (data as MaintenanceMaterial[]) ?? []
    const ids = materials.map((m) => m.id)
    let gpMap = new Map<string, GatePassRecord>()
    if (ids.length) {
      const { data: gps } = await supabase
        .from('gate_pass')
        .select('*')
        .eq('ref_type', 'maintenance')
        .in('ref_id', ids)
      for (const g of (gps as GatePassRecord[]) ?? []) {
        if (g.ref_id) gpMap.set(g.ref_id, g)
      }
    }
    setRows(materials.map((m) => ({ ...m, gate_pass: gpMap.get(m.id) ?? null })))
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  function gpText(gp: GatePassRecord, mat: MaintenanceMaterial) {
    return `Gate Pass ${gp.gp_number}\nMaterial: ${mat.material_name}\nPurpose: ${mat.purpose || '—'}\nSent to: ${mat.sent_to || '—'}\nDate: ${mat.entry_date}\nBy: ${mat.entered_by}`
  }

  async function save(direction: 'out' | 'in', e: React.FormEvent) {
    e.preventDefault()
    if (!profile || viewOnly) return
    setBusy(true)
    setError(null)
    setMessage(null)
    setLastGp(null)
    try {
      const payload = {
        direction,
        material_name: material.trim(),
        purpose: purpose.trim() || null,
        sent_to: sentTo.trim() || null,
        entry_date: entryDate,
        entered_by: enteredBy,
      }
      if (editId) {
        const row = rows.find((r) => r.id === editId)
        const result = await applyEditDeleteOrQueue({
          isCeo,
          createdAt: row?.created_at || new Date().toISOString(),
          tableName: 'maintenance_material',
          recordId: editId,
          action: 'edit',
          requestedBy: enteredBy,
          newData: payload,
          apply: async () => {
            const { error: uErr } = await supabase.from('maintenance_material').update(payload).eq('id', editId)
            if (uErr) throw uErr
          },
        })
        setMessage(result === 'applied' ? 'Material updated' : 'Edit queued for CEO approval')
        resetForm()
        await load()
        setTab('list')
        return
      }
      const { data, error: iErr } = await supabase
        .from('maintenance_material')
        .insert(payload)
        .select('*')
        .single()
      if (iErr) throw iErr
      const row = data as MaintenanceMaterial

      if (direction === 'out') {
        const gp_number = await nextGpNumber()
        const { data: gp, error: gErr } = await supabase
          .from('gate_pass')
          .insert({
            ref_type: 'maintenance',
            ref_id: row.id,
            gp_number,
          })
          .select('*')
          .single()
        if (gErr) throw gErr
        setLastGp(gp as GatePassRecord)
        setMessage(`Material OUT saved · Gate Pass ${gp_number}`)
      } else {
        setMessage('Material IN saved')
      }

      setMaterial('')
      setPurpose('')
      setSentTo('')
      await load()
      if (direction === 'out') setTab('list')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function openView(row: RowWithGp) {
    setEditId(row.id)
    setViewOnly(true)
    setMaterial(row.material_name)
    setPurpose(row.purpose || '')
    setSentTo(row.sent_to || '')
    setEntryDate(row.entry_date)
    setTab(row.direction === 'out' ? 'out' : 'in')
  }

  function openEdit(row: RowWithGp) {
    setEditId(row.id)
    setViewOnly(false)
    setMaterial(row.material_name)
    setPurpose(row.purpose || '')
    setSentTo(row.sent_to || '')
    setEntryDate(row.entry_date)
    setTab(row.direction === 'out' ? 'out' : 'in')
  }

  function resetForm() {
    setEditId(null)
    setViewOnly(false)
    setMaterial('')
    setPurpose('')
    setSentTo('')
    setEntryDate(todayISO())
  }

  async function handleDelete(row: RowWithGp) {
    if (!profile) return
    if (!confirmDeleteRecord({ label: row.material_name, linked: Boolean(row.gate_pass) })) return
    setBusy(true)
    try {
      const result = await applyEditDeleteOrQueue({
        isCeo,
        createdAt: row.created_at,
        tableName: 'maintenance_material',
        recordId: row.id,
        action: 'delete',
        requestedBy: enteredBy,
        apply: async () => {
          await supabase.from('gate_pass').delete().eq('ref_type', 'maintenance').eq('ref_id', row.id)
          const { error: dErr } = await supabase.from('maintenance_material').delete().eq('id', row.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Deleted' : 'Delete queued for CEO approval')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function formFor(direction: 'out' | 'in') {
    return (
      <form className="form-stack" onSubmit={(e) => void save(direction, e)}>
        {editId ? (
          <p className="text-muted2">
            {viewOnly ? 'Viewing entry' : 'Editing entry'} ·{' '}
            <button type="button" className="btn-ghost" onClick={resetForm}>
              {viewOnly ? 'Close' : 'Cancel edit'}
            </button>
          </p>
        ) : null}
        <label className="field">
          <span>Date</span>
          <input type="date" value={entryDate} readOnly={viewOnly} onChange={(e) => setEntryDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>Material name</span>
          <input value={material} readOnly={viewOnly} onChange={(e) => setMaterial(e.target.value)} required />
        </label>
        <label className="field">
          <span>Purpose</span>
          <input value={purpose} readOnly={viewOnly} onChange={(e) => setPurpose(e.target.value)} />
        </label>
        <label className="field">
          <span>{direction === 'out' ? 'Sent to' : 'Received from / location'}</span>
          <input value={sentTo} readOnly={viewOnly} onChange={(e) => setSentTo(e.target.value)} />
        </label>
        {!viewOnly ? (
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editId ? 'Update' : direction === 'out' ? 'Save OUT + Gate Pass' : 'Save IN'}
          </button>
        ) : null}
      </form>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Maintenance Material</h1>
        <p className="text-muted">Out/In tracking with auto Gate Pass on OUT</p>
        <SubTabs
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          options={[
            { id: 'out', label: 'Material Out' },
            { id: 'in', label: 'Material In' },
            { id: 'list', label: 'List' },
          ]}
        />
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="form-ok">{message}</p> : null}

      {lastGp ? (
        <section className="dash-panel surface">
          <h3>Gate Pass {lastGp.gp_number}</h3>
          <ShareActions
            onWhatsApp={() => {
              const mat = rows.find((r) => r.id === lastGp.ref_id)
              if (mat) shareWhatsApp(gpText(lastGp, mat))
              else shareWhatsApp(`Gate Pass ${lastGp.gp_number}`)
            }}
            onWhatsAppBusiness={() => {
              const mat = rows.find((r) => r.id === lastGp.ref_id)
              if (mat) shareWhatsAppBusiness(gpText(lastGp, mat))
              else shareWhatsAppBusiness(`Gate Pass ${lastGp.gp_number}`)
            }}
            onPrint={() => {
              const mat = rows.find((r) => r.id === lastGp.ref_id)
              printSummary(
                `Gate Pass ${lastGp.gp_number}`,
                rowsToHtml([
                  ['GP No', lastGp.gp_number],
                  ['Material', mat?.material_name],
                  ['Purpose', mat?.purpose],
                  ['Sent to', mat?.sent_to],
                  ['Date', mat?.entry_date],
                  ['By', mat?.entered_by],
                ]),
              )
            }}
          />
        </section>
      ) : null}

      {tab === 'out' ? formFor('out') : null}
      {tab === 'in' ? formFor('in') : null}

      {tab === 'list' ? (
        <div className="list">
          {rows.map((row) => (
            <article key={row.id} className="card-row surface row-top">
              <div>
                <strong>
                  {row.direction.toUpperCase()} · {row.material_name}
                </strong>
                <div className="text-muted">
                  {row.purpose || '—'} · {row.sent_to || '—'} · {row.entry_date}
                </div>
                {row.gate_pass ? (
                  <div className="text-muted2">
                    Gate Pass {row.gate_pass.gp_number}
                    <ShareActions
                      onWhatsApp={() => shareWhatsApp(gpText(row.gate_pass!, row))}
                      onWhatsAppBusiness={() => shareWhatsAppBusiness(gpText(row.gate_pass!, row))}
                      onPrint={() =>
                        printSummary(
                          `Gate Pass ${row.gate_pass!.gp_number}`,
                          rowsToHtml([
                            ['GP No', row.gate_pass!.gp_number],
                            ['Material', row.material_name],
                            ['Purpose', row.purpose],
                            ['Sent to', row.sent_to],
                            ['Date', row.entry_date],
                          ]),
                        )
                      }
                    />
                  </div>
                ) : null}
              </div>
              <RecordActions
                busy={busy}
                onView={() => openView(row)}
                onEdit={() => openEdit(row)}
                onDelete={() => void handleDelete(row)}
              />
            </article>
          ))}
          {!rows.length ? <p className="text-muted">No material entries yet</p> : null}
        </div>
      ) : null}
    </div>
  )
}
