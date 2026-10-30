import type { TargetProblem } from './types.js'

/** What the API (or the network) said went wrong. */
export class ApiError extends Error {
  /** HTTP status, or 0 when no answer arrived. */
  readonly status: number
  /** The service's stable code (`invalid`, `conflict`, …) when it sent one. */
  readonly code: string | null
  readonly problems: TargetProblem[]

  constructor(status: number, code: string | null, message: string, problems: TargetProblem[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.problems = problems
  }
}

/** The session ended: the API answered 401, or the access gateway redirected or returned its sign-in page. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, 'unauthorized', 'Your session has expired.')
    this.name = 'SessionExpiredError'
  }
}

/**
 * A message for a person. The server's own message is shown for the statuses where it explains something the person
 * can act on (a refused value, a conflict); everything else gets a fixed sentence so no internals leak into the page.
 */
export function describeError(e: unknown): string {
  if (e instanceof SessionExpiredError) return 'Your session has expired. Sign in again; unsaved drafts are kept on this device.'
  if (!(e instanceof ApiError)) return 'Something went wrong in the console. Reload the page and try again.'
  switch (e.status) {
    case 0:
      return 'The server could not be reached. Check your connection and try again.'
    case 400:
      return 'The request was not understood. Reload the page; if it persists, report it.'
    case 403:
      return 'The server refused this request: you may not have the admin role, or the page is out of date (reload it).'
    case 404:
      return 'That item no longer exists. It may have been removed; reload the list.'
    case 409:
      return e.message || 'That conflicts with the current state. Reload and check.'
    case 413:
      return 'That is too large to send.'
    case 422:
      return e.message || 'The server refused a value. Check the fields.'
    case 503:
      return 'The service is temporarily unavailable (the database or the role check). Try again in a moment; nothing was changed.'
    default:
      return e.status >= 500 ? 'The server had an internal problem. Try again; if it persists, report it.' : e.message || `Unexpected answer (${e.status}).`
  }
}
