/**
 * RPC errors arrive as `CODE:human message` (TRD §9). Split on the first colon
 * and map the code to a title the picker can act on; unknown codes fall back to
 * the server's own wording rather than a generic apology.
 */
const TITLES: Record<string, string> = {
  FORBIDDEN: 'Not allowed',
  INVALID: 'Invalid request',
  INVALID_QTY: 'Invalid quantity',
  INVALID_BIN: 'Invalid bin',
  INVALID_STATE: 'Not possible right now',
  NOT_FOUND: 'Not found',
  NO_STOCK: 'No stock here',
  INSUFFICIENT_STOCK: 'Not enough stock',
  EXPIRY_REQUIRED: 'Expiry date required',
  EXPIRED_INWARD: 'Stock already expired',
  INACTIVE_PRODUCT: 'Product is inactive',
  NOT_VERIFIED: 'Scan first',
  IMMUTABLE: 'Cannot be changed',
  STOCK_WRITE_FORBIDDEN: 'Cannot be changed',
  LAST_ADMIN: 'Last admin',
  UNAUTHENTICATED: 'Signed out',
  IMPORT_FAILED: 'Import failed',
  LABEL_FAILED: 'Label generation failed',
  BAD_SIGNATURE: 'Rejected',
  NOT_CONFIGURED: 'Not configured',
}

export type AppError = { code: string; title: string; message: string }

const CODE_PATTERN = /^([A-Z][A-Z0-9_]{2,}):(.*)$/s

export function parseError(error: unknown): AppError {
  const raw = extractMessage(error)
  const match = CODE_PATTERN.exec(raw.trim())
  if (match) {
    const [, code, message] = match
    return {
      code,
      title: TITLES[code] ?? 'Something went wrong',
      message: capitalise(message.trim()),
    }
  }
  if (/JWT expired|Invalid Refresh Token|refresh_token_not_found/i.test(raw)) {
    return { code: 'SESSION_EXPIRED', title: 'Signed out', message: 'Your session expired. Sign in again.' }
  }
  if (/Failed to fetch|NetworkError|ERR_NETWORK/i.test(raw)) {
    return {
      code: 'OFFLINE',
      title: 'No connection',
      message: 'Could not reach the server. Check your connection and try again.',
    }
  }
  if (/row-level security|permission denied/i.test(raw)) {
    return {
      code: 'FORBIDDEN',
      title: 'Not allowed',
      message: 'Your role does not permit this action.',
    }
  }
  return { code: 'UNKNOWN', title: 'Something went wrong', message: capitalise(raw) }
}

function extractMessage(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const e = error as { message?: string; error_description?: string; details?: string }
  return e.message ?? e.error_description ?? e.details ?? 'Unknown error'
}

function capitalise(s: string): string {
  if (!s) return 'Unknown error'
  return s.charAt(0).toUpperCase() + s.slice(1)
}
