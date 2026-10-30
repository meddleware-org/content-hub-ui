// The built console in Chromium against the mocked admin API. What these prove that the component tests cannot:
// the real browser's fetch semantics (a redirect to the sign-in page is an opaque redirect), a reload with the
// session back, drafts surviving it, the production CSP, and the whole flows end to end.
import { expect, test, type Page } from '@playwright/test'
import { FakeApi } from '../tests/support/fake-api.js'

/** Wire a page to a fake API; refuse anything that leaves localhost; collect page errors and CSP violations. */
async function open(page: Page, api = new FakeApi(), mode: 'html' | 'redirect' = 'redirect') {
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

const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true })
const LONG = 'word '.repeat(80) // 400 characters

test('every section opens without a page error, under the production CSP', async ({ page }) => {
  const { problems } = await open(page)
  for (const name of ['Dashboard', 'Roadmap', 'Tasks', 'Composer', 'Publishing', 'Schedule', 'Budgets']) {
    await tab(page, name).click()
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
  }
  expect(problems).toEqual([])
})

test('a session that ends mid-compose keeps the draft, and signing in again restores it', async ({ page }) => {
  const { api, problems } = await open(page)
  await tab(page, 'Composer').click()
  await page.getByLabel('Title', { exact: true }).fill('Launch day')
  await page.getByLabel('Text', { exact: true }).fill('Something I do not want to lose')
  await page.getByRole('checkbox', { name: /^mastodon test/ }).check()

  api.expire() // the access gateway now redirects every request to its sign-in page
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Your session has expired.', { exact: false }).first()).toBeVisible()

  api.expired = false // the person signs in again; the page reloads at top level
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Sign in again' }).click()])
  await expect(page.getByText('Signed in as op@example.org')).toBeVisible()
  await expect(page.getByText('Your session has expired.')).toHaveCount(0)
  await tab(page, 'Composer').click()
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Launch day')
  await expect(page.getByLabel('Text', { exact: true })).toHaveValue('Something I do not want to lose')
  await expect(page.getByText('Restored your unsent draft')).toBeVisible()
  expect(problems).toEqual([])
})

test('composing across three platforms: overflow is shown in words, blocks queueing, and a shortened text queues', async ({ page }) => {
  const { api, problems } = await open(page)
  await tab(page, 'Composer').click()
  await page.getByLabel('Title', { exact: true }).fill('Launch')
  await page.getByLabel('Text', { exact: true }).fill(LONG)
  for (const t of ['mastodon test', 'bluesky test', 'brand on X']) await page.getByRole('checkbox', { name: new RegExp(`^${t}`) }).check()

  await expect(page.getByText('400 / 500 characters — close to the limit')).toBeVisible()
  await expect(page.getByText('400 / 300 characters — over by 100')).toBeVisible()
  await expect(page.getByText('400 / 280 weighted characters — over by 120')).toBeVisible()
  await expect(page.getByRole('img', { name: /characters 1 to 280: within every limit \(3\)/ })).toBeVisible()
  await expect(page.getByText('✓ within every limit · ◐ within some · ✗ over every limit')).toBeVisible()
  const queue = page.getByRole('button', { name: /^Queue for 3 targets$/ })
  await expect(queue).toBeDisabled()

  // Drop X, shorten Bluesky with a link.
  await page.getByRole('checkbox', { name: /^brand on X/ }).uncheck()
  const bsky = page.locator('.target-panel', { hasText: 'bluesky test' })
  await bsky.locator('summary', { hasText: 'Write something different' }).click()
  await bsky.getByLabel('Link to end a shortened text with').fill('https://example.org/launch')
  await bsky.getByRole('button', { name: 'Shorten with link' }).click()
  await expect(bsky.getByText('(in use)')).toBeVisible()
  await expect(bsky.getByText(/over by/)).toHaveCount(0)

  await page.getByRole('button', { name: /^Queue for 2 targets$/ }).click()
  await expect(page.getByText('Queued 2 instances')).toBeVisible()
  const enqueue = api.calls.filter((c) => /enqueue$/.test(c.path)).at(-1)!
  const targets = (enqueue.body as { targets: Array<{ target_id: number; override_body?: string }> }).targets
  expect(targets.find((t) => t.target_id === 3)?.override_body).toMatch(/… https:\/\/example\.org\/launch$/)
  expect(api.instances.filter((i) => i.status === 'queued')).toHaveLength(2)
  expect(problems).toEqual([])
})

test('a manual post is marked posted with where it went', async ({ page }) => {
  const { api, problems } = await open(page)
  await tab(page, 'Publishing').click()
  await page.getByRole('row', { name: /r\/example/ }).getByRole('button', { name: 'Open' }).click()
  await expect(page.getByRole('link', { name: /compose page/ })).toBeVisible()
  const mark = page.getByRole('button', { name: 'Mark as posted' })
  await expect(mark).toBeDisabled()
  await page.getByLabel('Where it was posted (link or id)').fill('https://www.reddit.com/r/example/comments/abc')
  await mark.click()
  await expect(page.getByText('Instance #1 is now posted')).toBeVisible()
  expect(api.instances.find((i) => i.id === 1)).toMatchObject({ status: 'posted', url_or_external_id: 'https://www.reddit.com/r/example/comments/abc' })
  expect(problems).toEqual([])
})

test('an uncertain send is resolved by a person, never retried automatically', async ({ page }) => {
  const { api, problems } = await open(page)
  await tab(page, 'Publishing').click()
  await page.getByRole('row', { name: /mastodon test/ }).getByRole('button', { name: 'Open' }).click()
  await expect(page.getByText('may or may not have gone out')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
  await page.getByRole('button', { name: 'It did not go out' }).click()
  await expect(page.getByText('Instance #2 is now failed')).toBeVisible()
  expect(api.instances.find((i) => i.id === 2)?.status).toBe('failed')
  // Only now is a retry on offer.
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  expect(problems).toEqual([])
})

test('the public roadmap preview is the document the public site serves', async ({ page }) => {
  const { problems } = await open(page)
  await tab(page, 'Roadmap').click()
  await page.getByText('Public: people', { exact: false }).click()
  await expect(page.getByText('What visitors get')).toBeVisible()
  await page.getByText('The exact JSON document').click()
  const json = await page.locator('pre.json').innerText()
  expect(json).toContain('"name"')
  expect(json).not.toContain('internal')
  expect(problems).toEqual([])
})

test('a hostile post is shown as text', async ({ page }) => {
  const { problems } = await open(page)
  await tab(page, 'Composer').click()
  await page.getByLabel('Title', { exact: true }).fill('x')
  await page.getByLabel('Text', { exact: true }).fill('<img src=x onerror="window.pwned=1"> [go](javascript:window.pwned=2) **ok**')
  await page.getByRole('checkbox', { name: /^mastodon test/ }).check()
  await expect(page.locator('.rendered-text strong')).toHaveText('ok')
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined()
  await expect(page.locator('.rendered-text img')).toHaveCount(0)
  await expect(page.locator('.rendered-text a[href^="javascript:"]')).toHaveCount(0)
  expect(problems).toEqual([])
})

test('every section fits a phone: no horizontal scroll of the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  const { problems } = await open(page)
  for (const name of ['Dashboard', 'Roadmap', 'Tasks', 'Composer', 'Publishing', 'Schedule', 'Budgets']) {
    await tab(page, name).click()
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${name} overflows by ${overflow}px`).toBeLessThanOrEqual(0)
  }
  // The busiest layouts: three targets in the composer and an open publishing detail.
  await tab(page, 'Composer').click()
  await page.getByLabel('Text', { exact: true }).fill(LONG)
  for (const t of ['mastodon test', 'bluesky test', 'brand on X']) await page.getByRole('checkbox', { name: new RegExp(`^${t}`) }).check()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await tab(page, 'Publishing').click()
  await page.getByRole('row', { name: /mastodon test/ }).getByRole('button', { name: 'Open' }).click()
  await expect(page.getByText('may or may not have gone out')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  expect(problems).toEqual([])
})
