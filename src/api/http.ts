// The only place the console talks to the network: same-origin `/api/v1`, no credentials of its own (the access
// gateway holds the session in a cookie the browser sends), the CSRF header on every state-changing request, and one
// definition of "the session ended".

import { ADMIN_PREFIX, CSRF_HEADER } from '@meddleware/content-hub-client'
import { ApiError, SessionExpiredError } from './errors.js'
import type { TargetProblem } from './types.js'

export type Query = Record<string, string | number | boolean | null | undefined>

export interface HttpOptions {
  /** Injected for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** Called once when the session is found to have ended. */
  onSessionExpired?: () => void
}

export interface Http {
  get<T>(path: string, query?: Query): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  put<T>(path: string, body?: unknown): Promise<T>
  patch<T>(path: string, body?: unknown): Promise<T>
  del(path: string): Promise<void>
}

function url(path: string, query?: Query): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  return `${ADMIN_PREFIX}${path}${s ? `?${s}` : ''}`
}

export function createHttp(opts: HttpOptions = {}): Http {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  let expired = false
  const expire = (): never => {
    if (!expired) {
      expired = true
      opts.onSessionExpired?.()
    }
    throw new SessionExpiredError()
  }

  async function call<T>(method: string, path: string, query?: Query, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (method !== 'GET') headers[CSRF_HEADER] = '1'
    if (body !== undefined) headers['content-type'] = 'application/json'
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
    } catch {
      throw new ApiError(0, null, 'network')
    }
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) return expire()
    if (res.status === 401) return expire()
    const type = res.headers.get('content-type') ?? ''
    if (res.status === 204) return undefined as T
    if (res.ok && !type.includes('json')) return expire() // an HTML page where JSON belongs: the sign-in page
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      payload = null
    }
    if (res.ok) return payload as T
    const p = (payload && typeof payload === 'object' ? payload : {}) as { error?: unknown; message?: unknown; problems?: unknown }
    const problems = Array.isArray(p.problems) ? (p.problems as TargetProblem[]) : []
    throw new ApiError(res.status, typeof p.error === 'string' ? p.error : null, typeof p.message === 'string' ? p.message : '', problems)
  }

  return {
    get: (path, query) => call('GET', path, query),
    post: (path, body) => call('POST', path, undefined, body ?? {}),
    put: (path, body) => call('PUT', path, undefined, body ?? {}),
    patch: (path, body) => call('PATCH', path, undefined, body ?? {}),
    del: (path) => call('DELETE', path),
  }
}
