import { useCallback, useEffect, useState } from 'react'
import { RecordActions } from '../components/RecordActions'
import { useAuth } from '../lib/auth'
import { applyOrQueue, todayISO } from '../lib/mutate'
import { itemNameKey } from '../lib/securityInventory'
import { confirmDeleteRecord } from '../lib/recordCrud'
import { supabase } from '../lib/supabase'

type ItemRow = {
  id: string
  item_code: string | null
  name: string
  name_key: string
  category: string | null
  unit: string | null
  is_active: boolean | null
  description: string | null
}

type StockRow = {
  item_id: string
  stock_qty: number | null
}

function nameKey(name: string): string {
  return itemNameKey(name)
}

/**
 * Item Master — store / inventory SKUs (D-02).
 * Uses existing inventory_item_master + inventory_item_stock. Not Design Catalog.
 */
export function ItemMasterScreen() {
  const { isCeo, profile } = useAuth()
  const [rows, setRows] = useState<ItemRow[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [itemCode, setItemCode] = useState('')
  const [itemName, setItemName] = useState('')
  const [category, setCategory] = useState('general')
  const [unit, setUnit] = useState('NOS')
  const [description, setDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewOnly, setViewOnly] = useState(false)

  const load = useCallback(async () => {
    const [{ data: items, error: iErr }, { data: stocks }] = await Promise.all([
      supabase
        .from('inventory_item_master')
        .select('id, item_code, name, name_key, category, unit, is_active, description')
        .order('name', { ascending: true }),
      supabase.from('inventory_item_stock').select('item_id, stock_qty'),
    ])
    if (iErr) throw iErr
    setRows((items as ItemRow[]) ?? [])
    const map: Record<string, number> = {}
    for (const s of (stocks as StockRow[]) ?? []) {
      map[s.item_id] = Number(s.stock_qty || 0)
    }
    setStockMap(map)
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  function resetForm() {
    setEditingId(null)
    setViewOnly(false)
    setItemCode('')
    setItemName('')
    setCategory('general')
    setUnit('NOS')
    setDescription('')
  }

  function openEdit(row: ItemRow) {
    setEditingId(row.id)
    setViewOnly(false)
    setItemCode(row.item_code || '')
    setItemName(row.name)
    setCategory(row.category || 'general')
    setUnit(row.unit || 'NOS')
    setDescription(row.description || '')
  }

  function openView(row: ItemRow) {
    setEditingId(row.id)
    setViewOnly(true)
    setItemCode(row.item_code || '')
    setItemName(row.name)
    setCategory(row.category || 'general')
    setUnit(row.unit || 'NOS')
    setDescription(row.description || '')
  }

  async function handleDelete(row: ItemRow) {
    if (!profile) return
    const stock = stockMap[row.id] ?? 0
    if (
      !confirmDeleteRecord({
        label: row.name,
        linked: stock > 0,
        message:
          stock > 0
            ? `"${row.name}" has stock on hand. Deactivate instead of delete?`
            : undefined,
      })
    ) {
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'inventory_item_master',
        action: 'update',
        recordId: row.id,
        payload: { is_active: false },
        apply: async () => {
          const { error: uErr } = await supabase
            .from('inventory_item_master')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      setMessage(
        result === 'applied'
          ? stock > 0
            ? `${row.name} deactivated (stock preserved)`
            : `${row.name} deactivated`
          : 'Sent to approval queue',
      )
      if (editingId === row.id) resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (!itemName.trim()) {
      setError('Item name required')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const payload = {
        item_code: itemCode.trim() || null,
        name: itemName.trim(),
        name_key: nameKey(itemName),
        category: category.trim() || 'general',
        unit: unit.trim() || 'NOS',
        is_active: true,
        description: description.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (editingId) {
        const result = await applyOrQueue({
          isCeo,
          userId: profile.id,
          tableName: 'inventory_item_master',
          action: 'update',
          recordId: editingId,
          payload,
          apply: async () => {
            const { error: uErr } = await supabase
              .from('inventory_item_master')
              .update(payload)
              .eq('id', editingId)
            if (uErr) throw uErr
          },
        })
        setMessage(result === 'applied' ? 'Item updated' : 'Sent to approval queue')
      } else {
        const insertPayload = {
          ...payload,
          created_by: profile.full_name || profile.id,
        }
        const result = await applyOrQueue({
          isCeo,
          userId: profile.id,
          tableName: 'inventory_item_master',
          action: 'insert',
          recordId: null,
          payload: insertPayload,
          apply: async () => {
            const { data, error: iErr } = await supabase
              .from('inventory_item_master')
              .insert(insertPayload)
              .select('id')
              .single()
            if (iErr) throw iErr
            if (data?.id) {
              const { error: sErr } = await supabase.from('inventory_item_stock').upsert(
                {
                  item_id: data.id,
                  stock_qty: 0,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'item_id' },
              )
              if (sErr) throw sErr
            }
          },
        })
        setMessage(result === 'applied' ? 'Item saved' : 'Sent to approval queue')
      }
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Item Master</h1>
        <p className="text-muted">
          Store / inventory items · separate from Design Catalog · {todayISO()}
        </p>
      </header>

      {error ? <p className="text-danger">{error}</p> : null}
      {message ? <p className="text-success">{message}</p> : null}

      <form className="card-form" onSubmit={(e) => void handleSave(e)}>
        <h2 className="section-title">
          {viewOnly ? 'View item' : editingId ? 'Edit item' : 'Add item'}
        </h2>
        <label className="field">
          <span className="text-muted">Item code</span>
          <input value={itemCode} readOnly={viewOnly} onChange={(e) => setItemCode(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Item name</span>
          <input
            value={itemName}
            readOnly={viewOnly}
            onChange={(e) => setItemName(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="text-muted">Category</span>
          <select value={category} disabled={viewOnly} onChange={(e) => setCategory(e.target.value)}>
            <option value="general">general</option>
            <option value="maintenance">maintenance</option>
            <option value="other">other</option>
          </select>
        </label>
        <label className="field">
          <span className="text-muted">Unit</span>
          <input value={unit} readOnly={viewOnly} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <label className="field">
          <span className="text-muted">Description</span>
          <input
            value={description}
            readOnly={viewOnly}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        {!viewOnly ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Update item' : 'Save item'}
            </button>
            {editingId ? (
              <button type="button" className="btn-ghost" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        ) : (
          <button type="button" className="btn-ghost" onClick={resetForm}>
            Close
          </button>
        )}
      </form>

      <section className="card-list">
        <h2 className="section-title">Items ({rows.length})</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Unit</th>
                <th>Stock</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.item_code || '—'}</td>
                  <td>
                    <strong>{r.name}</strong>
                  </td>
                  <td>{r.category || '—'}</td>
                  <td>{r.unit || '—'}</td>
                  <td className="num">{stockMap[r.id] ?? 0}</td>
                  <td>{r.is_active === false ? 'No' : 'Yes'}</td>
                  <td>
                    <RecordActions
                      busy={busy}
                      canView
                      canEdit
                      canDelete
                      onView={() => openView(r)}
                      onEdit={() => openEdit(r)}
                      onDelete={() => void handleDelete(r)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="text-muted">No items yet</p> : null}
        </div>
      </section>
    </div>
  )
}
