// The per-target problems an enqueue can return.
import type { TargetProblem } from './types.js'

/** What the API (or the network) said went wrong. */
export class ApiError extends Error {
  /** HTTP status, or 0 when no answer arrived. */
  readonly status: number
  /** The service's stable code (`invalid`, `conflict`, …) when it sent one. */
  readonly code: string | null
  // The targets the server refused and why (empty unless the request was an enqueue).
  readonly problems: TargetProblem[]

  // Build the error; `problems` is empty unless the answer listed some.
  constructor(status: number, code: string | null, message: string, problems: TargetProblem[] = []) {
    // The message is the server's own text (or a fixed phrase); `describeError` decides what a person reads.
    super(message)
    // A stable name, so a log line or a test can recognise it.
    this.name = 'ApiError'
    // The HTTP status (0 when no answer arrived).
    this.status = status
    // The service's stable code, if any.
    this.code = code
    // Kept for the form to show next to each target.
    this.problems = problems
  }
}

/** The session ended: the API answered 401, or the access gateway redirected or returned its sign-in page. */
export class SessionExpiredError extends ApiError {
  constructor() {
    // A 401 with the stable `unauthorized` code and a fixed message.
    super(401, 'unauthorized', 'Your session has expired.')
    // So `instanceof` and the name both identify it.
    this.name = 'SessionExpiredError'
  }
}

/**
 * A message for a person. The server's own message is shown for the statuses where it explains something the person
 * can act on (a refused value, a conflict); everything else gets a fixed sentence so no internals leak into the page.
 */
export function describeError(e: unknown): string {
  // The session ended: say how to continue and that drafts are safe.
  if (e instanceof SessionExpiredError) return 'Your session has expired. Sign in again; unsaved drafts are kept on this device.'
  // Anything that is not an API error is a fault in the console itself.
  if (!(e instanceof ApiError)) return 'Something went wrong in the console. Reload the page and try again.'
  // A fixed sentence per status.
  switch (e.status) {
    // No answer at all: the network or the server.
    case 0:
      return 'The server could not be reached. Check your connection and try again.'
    case 400:
      return 'The request was not understood. Reload the page; if it persists, report it.'
    // The gateway or the service refused the request.
    case 403:
      return 'The server refused this request: you may not have the admin role, or the page is out of date (reload it).'
    case 404:
      return 'That item no longer exists. It may have been removed; reload the list.'
    // A conflict: the server's own text says what conflicts.
    case 409:
      return e.message || 'That conflicts with the current state. Reload and check.'
    case 413:
      return 'That is too large to send.'
    // A refused value: the server's text names the field.
    case 422:
      return e.message || 'The server refused a value. Check the fields.'
    // Temporarily unavailable: nothing was changed.
    case 503:
      return 'The service is temporarily unavailable. Try again in a moment; nothing was changed.'
    // Other 5xx: an internal problem with no detail; other 4xx: the server's message or the status.
    default:
      return e.status >= 500 ? 'The server had an internal problem. Try again; if it persists, report it.' : e.message || `Unexpected answer (${e.status}).`
  }
}
