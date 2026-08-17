import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import type { PartyMaster } from '../lib/database.types'
import { applyOrQueue } from '../lib/mutate'
import { supabase } from '../lib/supabase'

export function PartyMasterScreen() {
  const { isCeo, profile } = useAuth()
  const [parties, setParties] = useState<PartyMaster[]>([])
  const [bulkText, setBulkText] = useState('')
  const [singleName, setSingleName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('party_master')
      .select('*')
      .order('party_name')
    if (err) throw err
    setParties((data as PartyMaster[]) ?? [])
  }, [])

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message))
  }, [load])

  const bulkLines = useMemo(
    () =>
      bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    [bulkText],
  )

  const existingLower = useMemo(
    () => new Set(parties.map((p) => p.party_name.trim().toLowerCase())),
    [parties],
  )

  const bulkNewCount = useMemo(() => {
    const seen = new Set<string>()
    let n = 0
    for (const line of bulkLines) {
      const key = line.toLowerCase()
      if (existingLower.has(key) || seen.has(key)) continue
      seen.add(key)
      n += 1
    }
    return n
  }, [bulkLines, existingLower])

  async function addSingle() {
    if (!profile) return
    const name = singleName.trim()
    if (!name) return
    if (existingLower.has(name.toLowerCase())) {
      setError('Party already exists')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'party_master',
        action: 'insert',
        recordId: null,
        payload: { party_name: name },
        apply: async () => {
          const { error: insErr } = await supabase.from('party_master').insert({ party_name: name })
          if (insErr) throw insErr
        },
      })
      setMessage(result === 'applied' ? 'Party added' : 'Sent to approval queue')
      setSingleName('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setBusy(false)
    }
  }

  async function addBulk() {
    if (!profile || !bulkNewCount) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const seen = new Set<string>()
      const toInsert: string[] = []
      for (const line of bulkLines) {
        const key = line.toLowerCase()
        if (existingLower.has(key) || seen.has(key)) continue
        seen.add(key)
        toInsert.push(line)
      }
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'party_master',
        action: 'insert',
        recordId: null,
        payload: { parties: toInsert },
        apply: async () => {
          const { error: insErr } = await supabase
            .from('party_master')
            .insert(toInsert.map((party_name) => ({ party_name })))
          if (insErr) throw insErr
        },
      })
      setMessage(
        result === 'applied'
          ? `Added ${toInsert.length} parties`
          : 'Sent to approval queue',
      )
      setBulkText('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk add failed')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(row: PartyMaster) {
    if (!profile) return
    const name = editName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'party_master',
        action: 'update',
        recordId: row.id,
        payload: { party_name: name },
        apply: async () => {
          const { error: uErr } = await supabase
            .from('party_master')
            .update({ party_name: name })
            .eq('id', row.id)
          if (uErr) throw uErr
        },
      })
      setMessage(result === 'applied' ? 'Updated' : 'Sent to approval queue')
      setEditId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeParty(row: PartyMaster) {
    if (!profile) return
    if (!window.confirm(`Delete ${row.party_name}?`)) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const result = await applyOrQueue({
        isCeo,
        userId: profile.id,
        tableName: 'party_master',
        action: 'delete',
        recordId: row.id,
        payload: { id: row.id },
        apply: async () => {
          const { error: dErr } = await supabase.from('party_master').delete().eq('id', row.id)
          if (dErr) throw dErr
        },
      })
      setMessage(result === 'applied' ? 'Deleted' : 'Sent to approval queue')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Party Master</h1>
        <p className="text-muted">Bulk paste names — feeds Order Book autocomplete</p>
      </header>

      <section className="form-stack surface card-row">
        <label className="field">
          <span className="text-muted">Ek line mein ek party naam likho ya paste karo</span>
          <textarea
            className="party-bulk-textarea"
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={'Party A\nParty B\nParty C'}
          />
        </label>
        <button
          type="button"
          className="primary-save"
          disabled={busy || bulkNewCount === 0}
          onClick={() => void addBulk()}
        >
          Sabko Ek Saath Add Karo ({bulkNewCount})
        </button>
        {bulkLines.length > 0 && bulkNewCount < bulkLines.length ? (
          <p className="text-muted2">
            {bulkLines.length - bulkNewCount} duplicate / blank lines will be skipped
          </p>
        ) : null}
      </section>

      <section className="form-stack" style={{ marginTop: '1rem' }}>
        <h2 className="section-title">+ Add Single Party</h2>
        <div className="add-role-row">
          <input
            value={singleName}
            onChange={(e) => setSingleName(e.target.value)}
            placeholder="Party name"
            aria-label="Single party name"
          />
          <button type="button" disabled={busy || !singleName.trim()} onClick={() => void addSingle()}>
            Add
          </button>
        </div>
      </section>

      <h2 className="section-title">Existing parties ({parties.length})</h2>
      <div className="list">
        {parties.map((p) => (
          <article key={p.id} className="card-row surface row-top">
            {editId === p.id ? (
              <div className="add-role-row" style={{ flex: 1 }}>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                <button type="button" disabled={busy} onClick={() => void saveEdit(p)}>
                  Save
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditId(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <strong>{p.party_name}</strong>
                <div className="icon-actions">
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    disabled={busy}
                    onClick={() => {
                      setEditId(p.id)
                      setEditName(p.party_name)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-ghost icon-btn"
                    disabled={busy}
                    onClick={() => void removeParty(p)}
                  >
                    Del
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
        {!parties.length ? <p className="text-muted">No parties yet</p> : null}
      </div>

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}
