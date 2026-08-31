/**
 * Shared View / Edit / Delete actions for ERP record lists.
 * Desktop: inline buttons. Mobile/narrow: ⋮ menu.
 * Respect canView / canEdit / canDelete from the caller (role system).
 */
import { useEffect, useId, useRef, useState } from 'react'

export type RecordActionsProps = {
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
  canView?: boolean
  canEdit?: boolean
  canDelete?: boolean
  viewLabel?: string
  editLabel?: string
  deleteLabel?: string
  busy?: boolean
  /** Extra compact class names for the wrapper */
  className?: string
}

export function RecordActions({
  onView,
  onEdit,
  onDelete,
  canView = true,
  canEdit = true,
  canDelete = true,
  viewLabel = 'View',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  busy = false,
  className = '',
}: RecordActionsProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const showView = Boolean(onView) && canView
  const showEdit = Boolean(onEdit) && canEdit
  const showDelete = Boolean(onDelete) && canDelete
  const count = Number(showView) + Number(showEdit) + Number(showDelete)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!count) return null

  return (
    <div className={`record-actions ${className}`.trim()} ref={wrapRef}>
      <div className="record-actions-inline" role="group" aria-label="Record actions">
        {showView ? (
          <button type="button" className="record-action-btn" disabled={busy} onClick={onView}>
            {viewLabel}
          </button>
        ) : null}
        {showEdit ? (
          <button type="button" className="record-action-btn" disabled={busy} onClick={onEdit}>
            {editLabel}
          </button>
        ) : null}
        {showDelete ? (
          <button
            type="button"
            className="record-action-btn record-action-danger"
            disabled={busy}
            onClick={onDelete}
          >
            {deleteLabel}
          </button>
        ) : null}
      </div>

      <div className="record-actions-menu">
        <button
          type="button"
          className="record-action-more"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          title="Actions"
        >
          ⋮
        </button>
        {open ? (
          <div id={menuId} className="record-actions-dropdown" role="menu">
            {showView ? (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onView?.()
                }}
              >
                {viewLabel}
              </button>
            ) : null}
            {showEdit ? (
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onEdit?.()
                }}
              >
                {editLabel}
              </button>
            ) : null}
            {showDelete ? (
              <button
                type="button"
                role="menuitem"
                className="record-action-danger"
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onDelete?.()
                }}
              >
                {deleteLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
