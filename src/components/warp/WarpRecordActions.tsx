/**
 * Touch-friendly View / Edit action buttons for Warp Yarn tables.
 */
type Props = {
  onView?: () => void
  onEdit?: () => void
  canEdit?: boolean
  viewLabel?: string
  editLabel?: string
  busy?: boolean
}

export function WarpRecordActions({
  onView,
  onEdit,
  canEdit = true,
  viewLabel = 'View',
  editLabel = 'Edit',
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
    </div>
  )
}
