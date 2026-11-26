// The only place the console talks to the network: same-origin `/api/v1`, no credentials of its own (the access
// gateway holds the session in a cookie the browser sends), the CSRF header on every state-changing request, and one
// definition of "the session ended".

// The admin API's path prefix and the CSRF header name, shared with the service so they cannot drift.
import { ADMIN_PREFIX, CSRF_HEADER } from '@meddleware/content-hub-client'
// The two errors this module throws.
import { ApiError, SessionExpiredError } from './errors.js'
// The shape of a per-target problem in an error answer.
import type { TargetProblem } from './types.js'

/** Query parameters; a value that is undefined, null or empty is left out. */
export type Query = Record<string, string | number | boolean | null | undefined>

/** What a test or an embedding can inject. */
export interface HttpOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Called once when the session is found to have ended. */
  onSessionExpired?: () => void
}

/** The five calls the console makes. Every path is relative to the admin prefix. */
export interface Http {
  get<T>(path: string, query?: Query): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  put<T>(path: string, body?: unknown): Promise<T>
  patch<T>(path: string, body?: unknown): Promise<T>
  del(path: string): Promise<void>
}

/** The full request address for a path and its query: same-origin, under the admin prefix. */
function url(path: string, query?: Query): string {
  // Build the query string from the given values.
  const qs = new URLSearchParams()
  // Leave out values that are not set, so an empty filter is not sent.
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  // The encoded query, empty when there is none.
  const s = qs.toString()
  // The admin prefix, the path and the query: always same-origin.
  return `${ADMIN_PREFIX}${path}${s ? `?${s}` : ''}`
}

/** Make the HTTP wrapper: same-origin, no credentials of its own, the CSRF header on writes, and one meaning for "the session ended". */
export function createHttp(opts: HttpOptions = {}): Http {
  // The fetch to use: the injected one in tests, otherwise the global.
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  // True once the session is known to have ended, so the callback runs only once.
  let expired = false
  /** The one place the end of the session is decided: record it once, tell the console, and throw. */
  const expire = (): never => {
    if (!expired) {
      // Remember it.
      expired = true
      // Tell the console so it can show its banner.
      opts.onSessionExpired?.()
    }
    // Every caller sees the same error.
    throw new SessionExpiredError()
  }

  /** Make one request and return its JSON answer, or throw an `ApiError` (`SessionExpiredError` when the session ended). */
  async function call<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
    // Ask for JSON.
    const headers: Record<string, string> = { accept: 'application/json' }
    // Every state-changing request carries the CSRF header; the service refuses one without it.
    if (method !== 'GET') headers[CSRF_HEADER] = '1'
    // A body is always JSON.
    if (body !== undefined) headers['content-type'] = 'application/json'
    // The answer.
    let res: Response
    try {
      // `manual`: a redirect to the sign-in page must not be followed (it would fail cross-origin); it means the
      // session ended.
      res = await doFetch(url(path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        redirect: 'manual',
        cache: 'no-store',
      })
    // No answer at all (offline, refused, DNS): status 0 so the words say the server could not be reached.
    } catch {
      throw new ApiError(0, null, 'network')
    }
    // A redirect means the gateway wants a sign-in: the session ended.
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return expire()
    // The API itself says the session ended.
    if (res.status === 401) return expire()
    // The content type tells JSON from the gateway's HTML sign-in page.
    const type = res.headers.get('content-type') ?? ''
    // No content: nothing to parse.
    if (res.status === 204) return undefined as T
    // A success that is not JSON is the sign-in page.
    if (res.ok && !type.includes('json')) return expire() // an HTML page where JSON belongs: the sign-in page
    // The parsed body, or null when it is not JSON.
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    // A success: the body is the answer.
    if (res.ok) return payload as T
    // An error body: the service's `error` code, `message` and `problems`, each read defensively because the body is untrusted.
    const p = (payload && typeof payload === 'object' ? payload : {}) as { error?: unknown; message?: unknown; problems?: unknown }
    // Only an array counts as a list of problems.
    const problems = Array.isArray(p.problems) ? (p.problems as TargetProblem[]) : []
    // The status, the stable code, the message and the problems.
    throw new ApiError(res.status, typeof p.error === 'string' ? p.error : null, typeof p.message === 'string' ? p.message : '', problems)
  }

  // The five verbs; a write without a body sends an empty object, because the API expects JSON.
  return {
    get: (path, query) => call('GET', path, query),
    post: (path, body) => call('POST', path, undefined, body ?? {}),
    put: (path, body) => call('PUT', path, undefined, body ?? {}),
    patch: (path, body) => call('PATCH', path, undefined, body ?? {}),
    del: (path) => call('DELETE', path),
  }
}
