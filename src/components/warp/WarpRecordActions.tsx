/**
 * Warp Yarn tables — thin wrapper around shared RecordActions.
 */
import { RecordActions, type RecordActionsProps } from '../RecordActions'

export function WarpRecordActions(props: RecordActionsProps) {
  return (
    <div className="wym-record-actions">
      <RecordActions {...props} />
    </div>
  )
}
