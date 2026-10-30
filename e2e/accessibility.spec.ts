// The accessibility gate jsdom cannot be: a real browser computes colours, focus and the accessibility tree. Every
// section of the console, with its busiest content showing (the composer with three targets and an overflow, a
// publishing detail with attempts, a task with links), has no WCAG 2.2 AA violation in every theme and season.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { FakeApi } from '../tests/support/fake-api.js'

const THEMES = ['light', 'dark'] as const
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const

async function wire(page: Page, api: FakeApi) {
  await page.route(/^https?:\/\/(?!(localhost|127\.0\.0\.1)[:/])/, (route) => route.abort())
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const r = api.respond(req.method(), u.pathname + u.search, await req.allHeaders(), req.postData() ?? undefined)
    await route.fulfill({ status: r.status, contentType: 'application/json', body: r.status === 204 ? '' : JSON.stringify(r.json ?? null) })
  })
}

async function violations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze()
  return results.violations.map((v) => ({
    where: label,
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')} — ${n.failureSummary?.split('\n').slice(0, 3).join(' | ')}`),
  }))
}

for (const theme of THEMES) {
  for (const season of SEASONS) {
    test(`every section has no axe violations (${theme} · ${season})`, async ({ page }) => {
      await wire(page, new FakeApi())
      await page.goto('/')
      await expect(page.getByText('Signed in as op@example.org')).toBeVisible()
      await page.evaluate(([t, s]) => {
        document.documentElement.setAttribute('data-theme', t)
        document.documentElement.setAttribute('data-season', s)
      }, [theme, season])
      const found: unknown[] = []
      const open = (name: string) => page.getByRole('tab', { name, exact: true }).click()

      await open('Dashboard')
      await expect(page.getByRole('heading', { name: 'Tasks by status' })).toBeVisible()
      found.push(...(await violations(page, 'dashboard')))

      await open('Roadmap')
      await page.getByRole('row', { name: /Item 1 internal/ }).getByRole('button', { name: 'Details' }).click()
      await expect(page.getByRole('heading', { name: 'Public wording — what visitors can see' })).toBeVisible()
      found.push(...(await violations(page, 'roadmap')))
      await page.getByText('Public: people', { exact: false }).click()
      await expect(page.getByRole('heading', { name: 'What visitors get' })).toBeVisible()
      found.push(...(await violations(page, 'roadmap preview')))

      await open('Tasks')
      await page.getByRole('row', { name: /Task 1/ }).getByRole('button', { name: 'Details' }).click()
      await expect(page.getByRole('heading', { name: 'Change status' })).toBeVisible()
      found.push(...(await violations(page, 'tasks')))

      await open('Composer')
      await page.getByLabel('Title', { exact: true }).fill('Launch')
      await page.getByLabel('Text', { exact: true }).fill('word '.repeat(80))
      for (const t of ['mastodon test', 'bluesky test', 'brand on X']) await page.getByRole('checkbox', { name: new RegExp(`^${t}`) }).check()
      await expect(page.getByText('over by 100').first()).toBeVisible()
      found.push(...(await violations(page, 'composer')))

      await open('Publishing')
      await page.getByRole('row', { name: /mastodon test/ }).getByRole('button', { name: 'Open' }).click()
      await expect(page.getByText('may or may not have gone out')).toBeVisible()
      found.push(...(await violations(page, 'publishing')))

      await open('Schedule')
      await expect(page.getByRole('heading', { level: 3, name: 'Coming up' })).toBeVisible()
      found.push(...(await violations(page, 'schedule list')))
      await page.getByText('Calendar', { exact: true }).click()
      await expect(page.locator('table.cal')).toBeVisible()
      found.push(...(await violations(page, 'schedule calendar')))

      await open('Budgets')
      await expect(page.getByRole('heading', { name: 'Caps and usage this month' })).toBeVisible()
      found.push(...(await violations(page, 'budgets')))

      expect(found, JSON.stringify(found, null, 2)).toEqual([])
    })
  }
}
