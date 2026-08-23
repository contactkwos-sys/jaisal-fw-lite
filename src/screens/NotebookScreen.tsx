/**
 * Digital Factory Notebook — MY NOTEBOOK screen
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageLightbox } from '../components/ImageLightbox'
import { useAuth } from '../lib/auth'
import {
  NOTEBOOK_CATEGORIES,
  NOTE_PRIORITIES,
  NOTE_STATUSES,
  PURCHASE_PHOTO_CATEGORIES,
  addNoteAttachments,
  deleteAttachment,
  deleteNote,
  formatNoteDate,
  formatNoteTime,
  loadAttachmentsForNotes,
  loadLatestNotes,
  loadNoteById,
  loadNotes,
  loadPurchaseOptions,
  loadPurchasePhotos,
  loadStaffOptions,
  loadTodayStats,
  machineLabel,
  machineOptions,
  priorityClass,
  rotateAttachment,
  saveNote,
  savePurchasePhoto,
  statusClass,
  tablesReady,
  updateNoteStatus,
  type FactoryNote,
  type FactoryNoteAttachment,
  type NoteFilters,
  type PurchaseType,
} from '../lib/factoryNotebook'
import { applyOrQueue } from '../lib/mutate'
import type { NavTarget } from '../lib/nav'

type View = 'list' | 'add' | 'edit' | 'detail' | 'quick' | 'purchase-photo'
type NoteMode = 'typed' | 'photo'

type Props = {
  initialSub?: string
  initialMachine?: string
  initialDinRef?: string
  onNavigate?: (t: NavTarget) => void
}

type PhotoDraft = {
  file: File
  preview: string
  source: 'camera' | 'gallery'
  rotation: number
}

const QUICK_FILTERS = [
  { id: 'all', label: 'All Notes' },
  { id: 'my', label: 'My Notes' },
  { id: 'machine', label: 'Machine-wise' },
  { id: 'general', label: 'General' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'high', label: 'High Priority' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
] as const

function normalizeView(sub?: string): View {
  if (sub === 'quick') return 'quick'
  if (sub === 'purchase-photo') return 'purchase-photo'
  if (sub === 'add') return 'add'
  return 'list'
}

export function NotebookScreen({ initialSub, initialMachine, initialDinRef }: Props) {
  const { isCeo, profile } = useAuth()
  const userName = profile?.full_name || profile?.roles?.role_name || 'User'
  const userId = profile?.id

  const [view, setView] = useState<View>(normalizeView(initialSub))
  const [migrationHint, setMigrationHint] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [notes, setNotes] = useState<FactoryNote[]>([])
  const [attachments, setAttachments] = useState<Record<string, FactoryNoteAttachment[]>>({})
  const [staff, setStaff] = useState<Array<{ id: string; name: string }>>([])
  const [purchases, setPurchases] = useState<Array<{ id: string; type: PurchaseType; label: string }>>([])

  const [quickFilter, setQuickFilter] = useState<string>('all')
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    machine: initialMachine || '',
    priority: '',
    assignedTo: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<FactoryNote | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('General')
  const [machineId, setMachineId] = useState(initialMachine || '')
  const [priority, setPriority] = useState('Medium')
  const [assignedTo, setAssignedTo] = useState('')
  const [remarks, setRemarks] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('Open')
  const [reminderDate, setReminderDate] = useState('')
  const [reminderTime, setReminderTime] = useState('')
  const [dinRef, setDinRef] = useState(initialDinRef || '')
  const [noteMode, setNoteMode] = useState<NoteMode>('typed')
  const [photoDrafts, setPhotoDrafts] = useState<PhotoDraft[]>([])
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0)
  const [existingAttachments, setExistingAttachments] = useState<FactoryNoteAttachment[]>([])

  // Purchase photo state
  const [ppFile, setPpFile] = useState<File | null>(null)
  const [ppPreview, setPpPreview] = useState<string | null>(null)
  const [ppPurchaseType, setPpPurchaseType] = useState<PurchaseType>('general')
  const [ppPurchaseId, setPpPurchaseId] = useState('')
  const [ppCategory, setPpCategory] = useState('Bill Photo')

  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const ppCameraRef = useRef<HTMLInputElement>(null)

  const noteFilters = useMemo((): NoteFilters => {
    const f: NoteFilters = {
      search: filters.search,
      category: filters.category || undefined,
      machine: filters.machine || undefined,
      priority: filters.priority || undefined,
      assignedTo: filters.assignedTo || undefined,
      status: filters.status || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      userName,
      isCeo,
    }
    if (quickFilter === 'my') f.myNotes = true
    if (quickFilter === 'machine') f.machineOnly = true
    if (quickFilter === 'general') f.generalOnly = true
    if (quickFilter === 'maintenance') f.category = 'Maintenance'
    if (quickFilter === 'high') f.highPriority = true
    if (quickFilter === 'pending') f.pending = true
    if (quickFilter === 'completed') f.completed = true
    return f
  }, [filters, quickFilter, userName, isCeo])

  const reload = useCallback(async () => {
    const ready = await tablesReady()
    setMigrationHint(!ready)
    if (!ready) return
    const [rows, st, po] = await Promise.all([
      loadNotes(noteFilters),
      loadStaffOptions(),
      loadPurchaseOptions(),
    ])
    setNotes(rows)
    setStaff(st)
    setPurchases(po)
    const att = await loadAttachmentsForNotes(rows.map((n) => n.id))
    setAttachments(att)
  }, [noteFilters])

  useEffect(() => {
    void reload()
  }, [reload])

  function resetForm() {
    setTitle('')
    setCategory('General')
    setMachineId(initialMachine || '')
    setPriority('Medium')
    setAssignedTo('')
    setRemarks('')
    setDescription('')
    setStatus('Open')
    setReminderDate('')
    setReminderTime('')
    setDinRef(initialDinRef || '')
    setNoteMode('typed')
    setPhotoDrafts([])
    setSelectedPhotoIdx(0)
    setExistingAttachments([])
    setSelectedId(null)
    setDetail(null)
  }

  function openAdd(mode?: View) {
    resetForm()
    setView(mode || 'add')
  }

  async function openDetail(id: string) {
    setBusy(true)
    try {
      const note = await loadNoteById(id)
      if (!note) throw new Error('Note not found')
      setDetail(note)
      setSelectedId(id)
      setView('detail')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }

  async function openEdit(id: string) {
    setBusy(true)
    try {
      const note = await loadNoteById(id)
      if (!note) throw new Error('Note not found')
      setSelectedId(id)
      setTitle(note.title)
      setCategory(note.category)
      setMachineId(note.machine_id || '')
      setPriority(note.priority)
      setAssignedTo(note.assigned_to || '')
      setRemarks(note.remarks || '')
      setDescription(note.description || '')
      setStatus(note.status)
      setReminderDate(note.reminder_date || '')
      setReminderTime(note.reminder_time?.slice(0, 5) || '')
      setDinRef(note.din_ref || '')
      setNoteMode(note.note_type === 'photo' ? 'photo' : 'typed')
      setExistingAttachments(note.attachments || [])
      setPhotoDrafts([])
      setView('edit')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setBusy(false)
    }
  }

  function handlePhotoFiles(files: FileList | null, source: 'camera' | 'gallery') {
    if (!files?.length) return
    const next = [...photoDrafts]
    for (const file of Array.from(files)) {
      next.push({ file, preview: URL.createObjectURL(file), source, rotation: 0 })
    }
    setPhotoDrafts(next)
    setSelectedPhotoIdx(next.length - 1)
    setNoteMode('photo')
  }

  function removePhotoDraft(idx: number) {
    const next = photoDrafts.filter((_, i) => i !== idx)
    setPhotoDrafts(next)
    setSelectedPhotoIdx(Math.max(0, Math.min(selectedPhotoIdx, next.length - 1)))
  }

  function rotateDraft(idx: number) {
    setPhotoDrafts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, rotation: (p.rotation + 90) % 360 } : p)),
    )
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Title / Work is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const noteType = noteMode === 'photo' || photoDrafts.length ? (description ? 'mixed' : 'photo') : 'typed'
      const payload = {
        title,
        description: noteMode === 'typed' ? description : description || null,
        category,
        machine_id: machineId || null,
        priority,
        assigned_to: assignedTo,
        status,
        remarks,
        reminder_date: reminderDate || undefined,
        reminder_time: reminderTime || undefined,
        din_ref: dinRef || undefined,
        note_type: noteType,
      }

      let saved: FactoryNote
      await applyOrQueue({
        isCeo,
        userId: userId || '',
        tableName: 'factory_notes',
        action: selectedId ? 'update' : 'insert',
        recordId: selectedId,
        payload: { ...payload, id: selectedId },
        apply: async () => {
          saved = await saveNote(payload, { id: userId, name: userName }, selectedId)
          if (photoDrafts.length) {
            await addNoteAttachments(
              saved.id,
              photoDrafts.map((p) => ({
                file: p.file,
                source: p.source,
                rotation_deg: p.rotation,
              })),
              userName,
              machineId || null,
              category,
            )
          }
        },
      })

      setMessage(selectedId ? 'Note updated' : 'Note saved')
      resetForm()
      setView('list')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleQuickSave() {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await applyOrQueue({
        isCeo,
        userId: userId || '',
        tableName: 'factory_notes',
        action: 'insert',
        recordId: null,
        payload: { title, machine_id: machineId },
        apply: async () => {
          const saved = await saveNote(
            {
              title,
              category: 'Machine',
              machine_id: machineId || null,
              priority: 'High',
              remarks,
              note_type: photoDrafts.length ? 'photo' : 'typed',
            },
            { id: userId, name: userName },
          )
          if (photoDrafts.length) {
            await addNoteAttachments(
              saved.id,
              photoDrafts.map((p) => ({ file: p.file, source: p.source, rotation_deg: p.rotation })),
              userName,
              machineId || null,
            )
          }
        },
      })
      setMessage('Quick note saved')
      resetForm()
      setView('list')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handlePurchasePhotoSave() {
    if (!ppFile || !ppPurchaseId) {
      setError('Select a purchase and attach a photo')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await applyOrQueue({
        isCeo,
        userId: userId || '',
        tableName: 'purchase_related_photos',
        action: 'insert',
        recordId: null,
        payload: { purchase_id: ppPurchaseId, purchase_type: ppPurchaseType },
        apply: async () => {
          await savePurchasePhoto(
            {
              purchase_type: ppPurchaseType,
              purchase_id: ppPurchaseId,
              file: ppFile,
              photo_category: ppCategory,
              source: 'camera',
            },
            userName,
          )
        },
      })
      setMessage('Purchase photo saved')
      setPpFile(null)
      setPpPreview(null)
      setView('list')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this note?')) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo,
        userId: userId || '',
        tableName: 'factory_notes',
        action: 'delete',
        recordId: id,
        payload: { id },
        apply: async () => {
          await deleteNote(id, userName)
        },
      })
      setMessage('Note deleted')
      if (selectedId === id) {
        resetForm()
        setView('list')
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!selectedId) return
    setBusy(true)
    try {
      await applyOrQueue({
        isCeo,
        userId: userId || '',
        tableName: 'factory_notes',
        action: 'update',
        recordId: selectedId,
        payload: { status: newStatus },
        apply: async () => {
          await updateNoteStatus(selectedId, newStatus, userName)
        },
      })
      setMessage('Status updated')
      await openDetail(selectedId)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status update failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleRotateExisting(att: FactoryNoteAttachment) {
    const next = ((att.rotation_deg || 0) + 90) % 360
    await rotateAttachment(att.id, next)
    if (detail) await openDetail(detail.id)
    await reload()
  }

  async function handleDeleteAttachment(attId: string) {
    if (!window.confirm('Remove this photo?')) return
    await deleteAttachment(attId)
    if (detail) await openDetail(detail.id)
    await reload()
  }

  const selectedDraft = photoDrafts[selectedPhotoIdx]

  function renderList() {
    return (
      <>
        <div className="nb-hero">
          <div>
            <h2>MY NOTEBOOK</h2>
            <p className="nb-subtitle text-muted">Digital Factory Notebook</p>
          </div>
          <div className="nb-actions">
            <button type="button" className="nb-btn-quick" onClick={() => openAdd('quick')}>
              + Quick Note
            </button>
            <button type="button" className="nb-btn-purchase" onClick={() => setView('purchase-photo')}>
              + Purchase Photo
            </button>
            <button type="button" className="nb-btn-primary" onClick={() => openAdd('add')}>
              + Add New Note
            </button>
          </div>
        </div>

        <div className="nb-filters">
          <div className="nb-search-row nb-field">
            <input
              type="search"
              placeholder="Search notes..."
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            />
          </div>
          <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
            <option value="">Category</option>
            {NOTEBOOK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select value={filters.machine} onChange={(e) => setFilters((f) => ({ ...f, machine: e.target.value }))}>
            <option value="">Machine</option>
            {machineOptions().map((m) => (
              <option key={m.value || 'all'} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
            <option value="">Priority</option>
            {NOTE_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={filters.assignedTo} onChange={(e) => setFilters((f) => ({ ...f, assignedTo: e.target.value }))}>
            <option value="">Assigned To</option>
            {staff.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Status</option>
            {NOTE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
          <div className="nb-filter-actions">
            <button type="button" className="nb-btn-primary" onClick={() => void reload()}>Search</button>
            <button
              type="button"
              className="nb-btn-secondary"
              onClick={() => {
                setFilters({ search: '', category: '', machine: '', priority: '', assignedTo: '', status: '', dateFrom: '', dateTo: '' })
                setQuickFilter('all')
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>

        <div className="nb-chip-row">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.id}
              type="button"
              className={quickFilter === qf.id ? 'nb-chip active' : 'nb-chip'}
              onClick={() => setQuickFilter(qf.id)}
            >
              {qf.label}
            </button>
          ))}
        </div>

        <div className="nb-table-wrap">
          <table className="nb-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Title / Work</th>
                <th>Category</th>
                <th>Machine</th>
                <th>Priority</th>
                <th>Assigned To</th>
                <th>Photo</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => {
                const thumbs = attachments[n.id] || []
                return (
                  <tr key={n.id}>
                    <td>{formatNoteDate(n.created_at)}</td>
                    <td><strong>{n.title}</strong></td>
                    <td>{n.category}</td>
                    <td>{machineLabel(n.machine_id)}</td>
                    <td className={priorityClass(n.priority)}>
                      <span className="nb-priority-dot" />{n.priority}
                    </td>
                    <td>{n.assigned_to || '—'}</td>
                    <td>
                      {thumbs[0] ? (
                        <img src={thumbs[0].file_url} alt="" className="nb-thumb" onClick={() => void openDetail(n.id)} />
                      ) : '—'}
                    </td>
                    <td><span className={`nb-status-pill ${statusClass(n.status)}`}>{n.status}</span></td>
                    <td>
                      <button type="button" className="nb-icon-btn" onClick={() => void openDetail(n.id)}>View</button>
                      <button type="button" className="nb-icon-btn" onClick={() => void openEdit(n.id)}>Edit</button>
                      <button type="button" className="nb-icon-btn danger" onClick={() => void handleDelete(n.id)}>Delete</button>
                    </td>
                  </tr>
                )
              })}
              {notes.length === 0 ? (
                <tr><td colSpan={9} className="text-muted">No notes found</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="nb-cards">
          {notes.map((n) => {
            const thumbs = attachments[n.id] || []
            return (
              <article key={n.id} className="nb-card">
                <div className="nb-card-head">
                  <div>
                    <h3 className="nb-card-title">{n.title}</h3>
                    <p className="nb-card-meta">
                      {formatNoteDate(n.created_at)} · {n.category} · {machineLabel(n.machine_id)}
                    </p>
                    <p className={`nb-card-meta ${priorityClass(n.priority)}`}>
                      <span className="nb-priority-dot" />{n.priority}
                      {' · '}
                      <span className={`nb-status-pill ${statusClass(n.status)}`}>{n.status}</span>
                    </p>
                  </div>
                  {thumbs[0] ? <img src={thumbs[0].file_url} alt="" className="nb-thumb" /> : null}
                </div>
                <div className="nb-card-actions">
                  <button type="button" className="nb-btn-secondary" onClick={() => void openDetail(n.id)}>View</button>
                  <button type="button" className="nb-btn-secondary" onClick={() => void openEdit(n.id)}>Edit</button>
                </div>
              </article>
            )
          })}
        </div>
      </>
    )
  }

  function renderNoteForm(isQuick = false) {
    return (
      <div className="nb-form">
        <div className="nb-hero">
          <h2>{isQuick ? 'Quick Note' : view === 'edit' ? 'Edit Note' : 'Add New Note'}</h2>
          <button type="button" className="nb-btn-secondary" onClick={() => { resetForm(); setView('list') }}>← Back</button>
        </div>

        <div className="nb-form-grid">
          <div className="nb-field">
            <label>Title / Work</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="WD 40" />
          </div>

          {!isQuick ? (
            <>
              <div className="nb-field">
                <label>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {NOTEBOOK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="nb-field">
                <label>Machine</label>
                <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                  {machineOptions().map((m) => (
                    <option key={m.value || 'all'} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="nb-field">
                <label>Priority</label>
                <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {NOTE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="nb-field">
                <label>Assigned To (optional)</label>
                <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">—</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="nb-field">
                <label>Remarks</label>
                <input value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div className="nb-field">
                <label>DIN No. (optional)</label>
                <input value={dinRef} onChange={(e) => setDinRef(e.target.value)} placeholder="JFG1558" />
              </div>
              <div className="nb-field">
                <label>Reminder Date (optional)</label>
                <input type="date" value={reminderDate} onChange={(e) => setReminderDate(e.target.value)} />
              </div>
              <div className="nb-field">
                <label>Reminder Time (optional)</label>
                <input type="time" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="nb-field">
              <label>Machine</label>
              <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                {machineOptions().filter((m) => m.value).map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {!isQuick ? (
            <>
              <div className="nb-type-tabs">
                <button
                  type="button"
                  className={noteMode === 'typed' ? 'nb-type-tab active' : 'nb-type-tab'}
                  onClick={() => setNoteMode('typed')}
                >
                  Type Note
                </button>
                <button
                  type="button"
                  className={noteMode === 'photo' ? 'nb-type-tab active' : 'nb-type-tab'}
                  onClick={() => setNoteMode('photo')}
                >
                  Handwritten / Photo
                </button>
              </div>

              {noteMode === 'typed' ? (
                <div className="nb-field">
                  <label>Note / Description</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
                </div>
              ) : null}
            </>
          ) : (
            <div className="nb-field">
              <label>Remark (optional)</label>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Oil leakage" />
            </div>
          )}

          {(noteMode === 'photo' || isQuick || photoDrafts.length > 0) ? (
            <div className="nb-photo-zone">
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handlePhotoFiles(e.target.files, 'camera')} />
              <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => handlePhotoFiles(e.target.files, 'gallery')} />
              {selectedDraft ? (
                <img
                  src={selectedDraft.preview}
                  alt="Preview"
                  className="nb-photo-preview"
                  style={{ transform: `rotate(${selectedDraft.rotation}deg)` }}
                />
              ) : existingAttachments[0] ? (
                <img
                  src={existingAttachments[0].file_url}
                  alt="Existing"
                  className="nb-photo-preview"
                  style={{ transform: `rotate(${existingAttachments[0].rotation_deg || 0}deg)` }}
                />
              ) : (
                <p className="text-muted">Take or choose a photo of your handwritten notebook page</p>
              )}
              <div className="nb-photo-tools">
                <button type="button" className="nb-btn-primary" onClick={() => cameraRef.current?.click()}>Take Photo</button>
                <button type="button" className="nb-btn-secondary" onClick={() => galleryRef.current?.click()}>Choose Photo</button>
                {selectedDraft ? (
                  <>
                    <button type="button" className="nb-btn-secondary" onClick={() => rotateDraft(selectedPhotoIdx)}>Rotate</button>
                    <button type="button" className="nb-btn-secondary" onClick={() => removePhotoDraft(selectedPhotoIdx)}>Remove</button>
                  </>
                ) : null}
              </div>
              {photoDrafts.length > 1 ? (
                <div className="nb-photo-thumbs">
                  {photoDrafts.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      className={i === selectedPhotoIdx ? 'nb-photo-thumb-wrap selected' : 'nb-photo-thumb-wrap'}
                      onClick={() => setSelectedPhotoIdx(i)}
                    >
                      <img src={p.preview} alt="" style={{ transform: `rotate(${p.rotation}deg)` }} />
                    </button>
                  ))}
                </div>
              ) : null}
              {existingAttachments.length > 0 && view === 'edit' ? (
                <div className="nb-photo-thumbs">
                  {existingAttachments.map((att) => (
                    <div key={att.id} className="nb-photo-thumb-wrap">
                      <img src={att.file_url} alt="" style={{ transform: `rotate(${att.rotation_deg || 0}deg)` }} />
                      <div className="nb-photo-tools">
                        <button type="button" className="nb-icon-btn" onClick={() => void handleRotateExisting(att)}>↻</button>
                        <button type="button" className="nb-icon-btn danger" onClick={() => void handleDeleteAttachment(att.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="nb-form-actions">
          <button type="button" className="nb-btn-secondary" onClick={() => { resetForm(); setView('list') }}>Cancel</button>
          <button
            type="button"
            className="nb-btn-primary"
            disabled={busy}
            onClick={() => void (isQuick ? handleQuickSave() : handleSave())}
          >
            Save Note
          </button>
        </div>
      </div>
    )
  }

  function renderDetail() {
    if (!detail) return null
    const thumbs = detail.attachments || []
    return (
      <div>
        <div className="nb-hero">
          <h2>{detail.title}</h2>
          <div className="nb-actions">
            <button type="button" className="nb-btn-secondary" onClick={() => { resetForm(); setView('list') }}>← Back</button>
            <button type="button" className="nb-btn-secondary" onClick={() => void openEdit(detail.id)}>Edit</button>
            <button type="button" className="nb-btn-secondary danger" onClick={() => void handleDelete(detail.id)}>Delete</button>
          </div>
        </div>

        <div className="nb-detail">
          <div className="nb-detail-meta">
            <dl>
              <dt>Category</dt><dd>{detail.category}</dd>
              <dt>Machine</dt><dd>{machineLabel(detail.machine_id)}</dd>
              <dt>Priority</dt>
              <dd className={priorityClass(detail.priority)}><span className="nb-priority-dot" />{detail.priority}</dd>
              <dt>Assigned To</dt><dd>{detail.assigned_to || '—'}</dd>
              <dt>Status</dt>
              <dd>
                <select value={detail.status} onChange={(e) => void handleStatusChange(e.target.value)}>
                  {NOTE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </dd>
              <dt>Remarks</dt><dd>{detail.remarks || '—'}</dd>
              <dt>Created By</dt><dd>{detail.created_by || '—'}</dd>
              <dt>Created Date</dt><dd>{formatNoteDate(detail.created_at)}</dd>
              <dt>Created Time</dt><dd>{formatNoteTime(detail.created_at)}</dd>
              {detail.din_ref ? (<><dt>DIN Ref</dt><dd>{detail.din_ref}</dd></>) : null}
              {detail.reminder_date ? (
                <><dt>Reminder</dt><dd>{detail.reminder_date} {detail.reminder_time?.slice(0, 5) || ''}</dd></>
              ) : null}
            </dl>
          </div>

          <div>
            {detail.description ? (
              <div className="nb-detail-photo" style={{ marginBottom: 12 }}>
                <h3 className="section-title">Typed Note</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</p>
              </div>
            ) : null}
            {thumbs.length > 0 ? (
              <div className="nb-detail-photo">
                <h3 className="section-title">Handwritten Note / Photo</h3>
                {thumbs.map((att) => (
                  <div key={att.id} style={{ marginBottom: 16 }}>
                    <ImageLightbox
                      src={att.file_url}
                      alt={detail.title}
                      thumbClassName="nb-photo-preview"
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  function renderPurchasePhoto() {
    return (
      <div className="nb-form">
        <div className="nb-hero">
          <div>
            <h2>Purchase Photo</h2>
            <p className="nb-subtitle text-muted">Keep purchase photos separate from general notebook notes</p>
          </div>
          <button type="button" className="nb-btn-secondary" onClick={() => setView('list')}>← Back</button>
        </div>

        <div className="nb-form-grid">
          <div className="nb-photo-zone">
            <input
              ref={ppCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setPpFile(f)
                  setPpPreview(URL.createObjectURL(f))
                }
              }}
            />
            {ppPreview ? (
              <img src={ppPreview} alt="Purchase" className="nb-photo-preview" />
            ) : (
              <p className="text-muted">Take a photo of bill, material, packing, etc.</p>
            )}
            <div className="nb-photo-tools">
              <button type="button" className="nb-btn-primary" onClick={() => ppCameraRef.current?.click()}>Take Photo</button>
            </div>
          </div>

          <div className="nb-field">
            <label>Photo Category</label>
            <select value={ppCategory} onChange={(e) => setPpCategory(e.target.value)}>
              {PURCHASE_PHOTO_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="nb-field">
            <label>Select Purchase Entry</label>
            <select
              value={`${ppPurchaseType}:${ppPurchaseId}`}
              onChange={(e) => {
                const [type, id] = e.target.value.split(':')
                setPpPurchaseType(type as PurchaseType)
                setPpPurchaseId(id)
              }}
            >
              <option value=":">— Select purchase —</option>
              {purchases.map((p) => (
                <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="nb-form-actions">
          <button type="button" className="nb-btn-secondary" onClick={() => setView('list')}>Cancel</button>
          <button type="button" className="nb-btn-primary" disabled={busy} onClick={() => void handlePurchasePhotoSave()}>
            Save Purchase Photo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen notebook-screen">
      {migrationHint ? (
        <div className="nb-migration-hint">
          <strong>Database setup required.</strong> Run <code>public/migration-factory-notebook.sql</code> in Supabase SQL editor.
        </div>
      ) : null}

      {view === 'list' ? renderList() : null}
      {view === 'add' || view === 'edit' ? renderNoteForm() : null}
      {view === 'quick' ? renderNoteForm(true) : null}
      {view === 'detail' ? renderDetail() : null}
      {view === 'purchase-photo' ? renderPurchasePhoto() : null}

      {error ? <p className="form-error text-danger">{error}</p> : null}
      {message ? <p className="form-ok text-sage">{message}</p> : null}
    </div>
  )
}

/** Embedded machine notes list for Machine Master */
export function MachineNotesPanel({ machineId }: { machineId: string }) {
  const [notes, setNotes] = useState<FactoryNote[]>([])
  const [attachments, setAttachments] = useState<Record<string, FactoryNoteAttachment[]>>({})
  const [ready, setReady] = useState(true)

  useEffect(() => {
    void (async () => {
      const ok = await tablesReady()
      setReady(ok)
      if (!ok) return
      const rows = await loadNotes({ machine: machineId })
      setNotes(rows)
      setAttachments(await loadAttachmentsForNotes(rows.map((n) => n.id)))
    })()
  }, [machineId])

  if (!ready) {
    return <p className="text-muted">Run notebook migration to enable machine notes.</p>
  }

  return (
    <div className="nb-machine-notes">
      <h3 className="section-title">Notes — {machineLabel(machineId)}</h3>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Note</th>
            <th>Photo</th>
            <th>Created By</th>
            <th>Assigned To</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {notes.map((n) => (
            <tr key={n.id}>
              <td>{formatNoteDate(n.created_at)}</td>
              <td><strong>{n.title}</strong>{n.remarks ? <div className="text-muted">{n.remarks}</div> : null}</td>
              <td>
                {attachments[n.id]?.[0] ? (
                  <ImageLightbox src={attachments[n.id][0].file_url} alt="" thumbClassName="nb-thumb" />
                ) : '—'}
              </td>
              <td>{n.created_by || '—'}</td>
              <td>{n.assigned_to || '—'}</td>
              <td className={priorityClass(n.priority)}>{n.priority}</td>
              <td><span className={`nb-status-pill ${statusClass(n.status)}`}>{n.status}</span></td>
            </tr>
          ))}
          {notes.length === 0 ? (
            <tr><td colSpan={7} className="text-muted">No notes for this machine</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

/** CEO Dashboard widget */
export function NotebookDashboardWidget({ onNavigate }: { onNavigate: (t: NavTarget) => void }) {
  const [stats, setStats] = useState({ total: 0, highPriority: 0, pending: 0, completed: 0 })
  const [latest, setLatest] = useState<FactoryNote[]>([])
  const [ready, setReady] = useState(true)

  useEffect(() => {
    void (async () => {
      const ok = await tablesReady()
      setReady(ok)
      if (!ok) return
      setStats(await loadTodayStats())
      setLatest(await loadLatestNotes(5))
    })()
  }, [])

  if (!ready) return null

  return (
    <section className="nb-dash-widget dash-panel">
      <h3>Today&apos;s Notebook</h3>
      <div className="nb-dash-stats">
        <div className="nb-dash-stat"><span>Total Notes</span><strong>{stats.total}</strong></div>
        <div className="nb-dash-stat"><span>High Priority</span><strong>{stats.highPriority}</strong></div>
        <div className="nb-dash-stat"><span>Pending</span><strong>{stats.pending}</strong></div>
        <div className="nb-dash-stat"><span>Completed</span><strong>{stats.completed}</strong></div>
      </div>
      <button
        type="button"
        className="nb-btn-primary"
        onClick={() => onNavigate({ screen: 'notebook', module: 'utilities' })}
      >
        View All Notes
      </button>
      {latest.length > 0 ? (
        <div className="nb-dash-latest">
          <h4 className="section-title" style={{ marginTop: 14 }}>Latest Notes</h4>
          {latest.map((n) => (
            <div key={n.id} className="nb-dash-latest-item">
              <span><strong>{n.title}</strong> · {machineLabel(n.machine_id)}</span>
              <span className={`nb-status-pill ${statusClass(n.status)}`}>{n.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

/** Purchase related photos panel */
export function PurchasePhotosPanel({
  purchaseType,
  purchaseId,
}: {
  purchaseType: PurchaseType
  purchaseId: string
}) {
  const [photos, setPhotos] = useState<Array<{ id: string; file_url: string; photo_category: string }>>([])

  useEffect(() => {
    void (async () => {
      const rows = await loadPurchasePhotos(purchaseType, purchaseId)
      setPhotos(rows)
    })()
  }, [purchaseType, purchaseId])

  if (!photos.length) return null

  return (
    <div className="nb-purchase-photos">
      <h4>Related Photos</h4>
      <div className="nb-purchase-photo-grid">
        {photos.map((p) => (
          <ImageLightbox key={p.id} src={p.file_url} alt={p.photo_category} thumbClassName="nb-thumb" />
        ))}
      </div>
    </div>
  )
}
