/** Map raw Supabase / network errors to user-friendly messages. Log technical detail internally. */

const TECHNICAL_PATTERNS: Array<{ re: RegExp; message: string }> = [
  {
    re: /could not find the table ['"]?public\.dins['"]?/i,
    message:
      'Design intake is not fully set up yet. Please run the latest database migration (Design to Order) or contact your administrator.',
  },
  {
    re: /relation ["']?dins["']? does not exist/i,
    message:
      'Design intake is not fully set up yet. Please run the latest database migration (Design to Order) or contact your administrator.',
  },
  {
    re: /column order_book_items\.created_at does not exist/i,
    message:
      'Order data needs a database update. Please run the latest migration or contact your administrator.',
  },
  {
    re: /schema cache/i,
    message: 'The database schema is updating. Please wait a moment and try again.',
  },
  {
    re: /column .* does not exist/i,
    message: 'A required database column is missing. Please run the latest migration or contact your administrator.',
  },
  {
    re: /relation .* does not exist/i,
    message: 'A required database table is missing. Please run the latest migration or contact your administrator.',
  },
  {
    re: /JWT expired|invalid JWT/i,
    message: 'Your session has expired. Please sign in again.',
  },
  {
    re: /Failed to fetch|NetworkError|network/i,
    message: 'Unable to reach the server. Check your internet connection and try again.',
  },
  {
    re: /Failed to send a request to the Edge Function|Edge Function.*not found|NOT_FOUND/i,
    message:
      'Gmail service is temporarily unavailable. You can still manage approved senders below; try connecting Gmail again in a few minutes.',
  },
  {
    re: /could not find the table ['"]?public\.gmail_approved_senders['"]?/i,
    message:
      'Gmail sender setup is not complete. Please run the Gmail design intake migration or contact your administrator.',
  },
  {
    re: /duplicate key|idx_gmail_senders_email_lower/i,
    message: 'This sender email is already in the approved list.',
  },
]

export function logTechnicalError(context: string, error: unknown): void {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)
  console.error(`[${context}]`, detail, error)
}

export function toUserError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : typeof error === 'string'
          ? error
          : ''

  if (!raw || raw === '[object Object]') return fallback

  for (const { re, message } of TECHNICAL_PATTERNS) {
    if (re.test(raw)) return message
  }

  if (/permission denied|row-level security/i.test(raw)) {
    return 'You do not have permission to perform this action.'
  }

  // Avoid exposing long SQL / PostgREST payloads
  if (raw.length > 120 || /PGRST|postgres|syntax error/i.test(raw)) {
    return fallback
  }

  return raw
}

export function handleUserError(context: string, error: unknown, fallback?: string): string {
  logTechnicalError(context, error)
  return toUserError(error, fallback)
}
