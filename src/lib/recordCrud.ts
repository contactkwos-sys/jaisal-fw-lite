/**
 * Shared CRUD helpers — confirmations + dependency-aware delete messaging.
 * Does not bypass role checks; callers must gate with permissions.
 */

export type DeleteConfirmOptions = {
  /** Short record label shown in the dialog */
  label?: string
  /** True when the record may be referenced by other transactions */
  linked?: boolean
  /** Custom message overrides */
  message?: string
}

/** Browser confirm for delete. Returns true only when user confirms. */
export function confirmDeleteRecord(opts: DeleteConfirmOptions = {}): boolean {
  const name = opts.label?.trim()
  if (opts.message) return window.confirm(opts.message)
  if (opts.linked) {
    return window.confirm(
      name
        ? `"${name}" may be linked to other transactions. Are you sure you want to delete it?`
        : 'This record may be linked to other transactions. Are you sure?',
    )
  }
  return window.confirm(name ? `Delete "${name}"?` : 'Delete this record?')
}

export class LinkedRecordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LinkedRecordError'
  }
}

export function cannotDeleteUsedMessage(entity: string, usedIn: string): string {
  return `Cannot delete: this ${entity} is already used in existing ${usedIn}.`
}
