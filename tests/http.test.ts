import { describe, expect, it, vi } from 'vitest'
import { ApiError, SessionExpiredError, describeError } from '../src/api/errors.js'
import { createHttp } from '../src/api/http.js'

function reply(status: number, body: unknown, type = 'application/json', extra: Partial<ResponseInit> = {}): Response {
  return new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type }, ...extra })
}

function client(f: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const expired = vi.fn()
  const fetchMock = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return f(url, init)
  }) as unknown as typeof fetch
  return { http: createHttp({ fetch: fetchMock, onSessionExpired: expired }), calls, expired }
}

describe('the HTTP layer', () => {
  it('talks only to /api/v1 on this origin, with the CSRF header on writes and not on reads', async () => {
    const { http, calls } = client(() => reply(200, { ok: true }))
    await http.get('/stats', { a: 1, b: undefined, c: '', d: null, e: 'x y' })
    await http.post('/posts', { title: 't' })
    await http.put('/budgets', {})
    await http.patch('/posts/1', {})
    await http.del('/tasks/1/links/2').catch(() => undefined)
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/stats?a=1&e=x+y', '/api/v1/posts', '/api/v1/budgets', '/api/v1/posts/1', '/api/v1/tasks/1/links/2'])
    for (const { init } of calls) {
      expect(init.credentials).toBe('same-origin')
      expect(init.redirect).toBe('manual')
      const headers = init.headers as Record<string, string>
      const has = Object.keys(headers).some((h) => h.toLowerCase() === 'x-content-hub-request')
      expect(has, `${init.method}`).toBe(init.method !== 'GET')
      expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain('authorization')
    }
  })

  it('treats a 401, a redirect to sign-in and a sign-in page as the session ending, and says so once', async () => {
    for (const make of [
      () => reply(401, { error: 'unauthorized', message: 'x' }),
      () => ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() }) as unknown as Response,
      () => reply(302, '', 'text/html'),
      () => reply(200, '<!doctype html><title>Sign in</title>', 'text/html'),
    ]) {
      const { http, expired } = client(make)
      await expect(http.get('/me')).rejects.toBeInstanceOf(SessionExpiredError)
      await expect(http.get('/me')).rejects.toBeInstanceOf(SessionExpiredError)
      expect(expired).toHaveBeenCalledTimes(1)
    }
  })

  it('maps the service error body, including the targets enqueue refused', async () => {
    const { http } = client(() =>
      reply(422, { error: 'invalid', message: 'some targets were refused', problems: [{ target_id: 3, problem: 'BLUESKY does not fit' }] }),
    )
    const e = await http.post('/posts/1/enqueue', {}).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect((e as ApiError).status).toBe(422)
    expect((e as ApiError).code).toBe('invalid')
    expect((e as ApiError).problems).toEqual([{ target_id: 3, problem: 'BLUESKY does not fit' }])
  })

  it('reports an unreachable server as status 0, and a 204 as nothing', async () => {
    const down = client(() => {
      throw new TypeError('Failed to fetch')
    })
    expect(await down.http.get('/me').catch((x: unknown) => x)).toMatchObject({ status: 0 })
    const none = client(() => reply(204, null))
    expect(await none.http.del('/tasks/1/links/2')).toBeUndefined()
  })

  it('writes messages for people, without leaking internals', () => {
    expect(describeError(new SessionExpiredError())).toContain('Sign in again')
    expect(describeError(new ApiError(0, null, 'network'))).toContain('could not be reached')
    expect(describeError(new ApiError(403, 'forbidden', 'secret detail'))).not.toContain('secret detail')
    expect(describeError(new ApiError(404, 'not_found', 'x'))).toContain('no longer exists')
    expect(describeError(new ApiError(409, 'conflict', 'target 3 already has a live instance of this post'))).toContain('already has a live instance')
    expect(describeError(new ApiError(422, 'invalid', 'secret_ref is the NAME of an environment variable'))).toContain('secret_ref')
    expect(describeError(new ApiError(503, 'unavailable', 'keto'))).toContain('temporarily unavailable')
    expect(describeError(new ApiError(500, 'internal', 'stack trace here'))).not.toContain('stack trace')
    expect(describeError(new Error('boom'))).not.toContain('boom')
  })
})
