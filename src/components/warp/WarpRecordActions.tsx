/**
 * Touch-friendly View / Edit action buttons for Warp Yarn tables.
 */
type Props = {
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
  canEdit?: boolean
  canDelete?: boolean
  viewLabel?: string
  editLabel?: string
  deleteLabel?: string
  busy?: boolean
}

export function WarpRecordActions({
  onView,
  onEdit,
  onDelete,
  canEdit = true,
  canDelete = false,
  viewLabel = 'View',
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  busy = false,
}: Props) {
  return (
    <div className="wym-record-actions">
      {onView ? (
        <button type="button" className="btn-ghost btn-sm wym-action-btn" disabled={busy} onClick={onView}>
          {viewLabel}
        </button>
      ) : null}
      {onEdit && canEdit ? (
        <button type="button" className="btn-warp btn-sm wym-action-btn" disabled={busy} onClick={onEdit}>
          {editLabel}
        </button>
      ) : null}
      {onDelete && canDelete ? (
        <button type="button" className="btn-ghost btn-sm wym-action-btn text-danger" disabled={busy} onClick={onDelete}>
          {deleteLabel}
        </button>
      ) : null}
    </div>
  )
}
