// Opens the built console wired to the in-memory FakeApi (page.route), so a run needs no network: every request that leaves localhost is
// refused. Returns the fake and what the page reported (uncaught errors, CSP violations).
import { expect, type Page } from '@playwright/test'
import { FakeApi } from '../tests/support/fake-api.js'

/** Wire a page to a fake API; refuse anything that leaves localhost; collect page errors and CSP violations. */
export async function open(page: Page, api = new FakeApi(), requested: 'html' | 'redirect' = 'redirect') {
  // WebKit's route.fulfill cannot answer with a redirect status, so there an ended session is the sign-in page served in place of the JSON
  // (the console treats both as the session ending; the redirect form is the one Chromium and Firefox exercise).
  const mode = page.context().browser()?.browserType().name() === 'webkit' ? 'html' : requested
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`error: ${e.message}`))
  page.on('console', (m) => {
    if (/content security policy|refused to/i.test(m.text())) problems.push(`csp: ${m.text()}`)
  })
  await page.route(/^https?:\/\/(?!(localhost|127\.0\.0\.1)[:/])/, (route) => route.abort())
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const r = api.respond(req.method(), u.pathname + u.search, await req.allHeaders(), req.postData() ?? undefined)
    if (api.expired && mode === 'redirect') {
      // What the access gateway does to a browser whose session ended: send it to the sign-in page elsewhere.
      return route.fulfill({ status: 302, headers: { location: 'https://team.cloudflareaccess.com/cdn-cgi/access/login/hub' } })
    }
    if (r.html !== undefined) return route.fulfill({ status: r.status, contentType: 'text/html', body: r.html })
    return route.fulfill({ status: r.status, contentType: 'application/json', body: r.status === 204 ? '' : JSON.stringify(r.json ?? null) })
  })
  await page.goto('/')
  await expect(page.getByText('Signed in as op@example.org')).toBeVisible()
  return { api, problems }
}

export const SECTIONS = ['Dashboard', 'Roadmap', 'Tasks', 'Composer', 'Publishing', 'Schedule', 'Budgets'] as const
export const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
