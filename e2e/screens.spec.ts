// Screenshots for LOOKING at the console (not assertions): `npm run shots` writes PNGs to test-results/screens/, one per
// section, viewport and theme, so layout, spacing, overflow and wording problems no assertion catches can be seen. Excluded
// from `npm run test:e2e`; nothing is compared against a baseline (baselines drift across machines and fonts).
import { test, type Page } from '@playwright/test'
import { FakeApi } from '../tests/support/fake-api.js'

const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } } as const
const THEMES = ['light', 'dark'] as const
const SECTIONS = ['Dashboard', 'Roadmap', 'Tasks', 'Composer', 'Publishing', 'Schedule', 'Budgets'] as const

async function wire(page: Page, api: FakeApi) {
  await page.route(/^https?:\/\/(?!(localhost|127\.0\.0\.1)[:/])/, (route) => route.abort())
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const u = new URL(req.url())
    const r = api.respond(req.method(), u.pathname + u.search, await req.allHeaders(), req.postData() ?? undefined)
    await route.fulfill({ status: r.status, contentType: 'application/json', body: r.status === 204 ? '' : JSON.stringify(r.json ?? null) })
  })
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    for (const section of SECTIONS) {
      test(`${section} · ${vpName} · ${theme}`, async ({ page }) => {
        await page.setViewportSize(viewport)
        await page.emulateMedia({ colorScheme: theme })
        await wire(page, new FakeApi())
        await page.goto('/')
        await page.getByText('Signed in as').waitFor()
        await page.getByRole('button', { name: theme === 'dark' ? /dark/i : /light/i }).first().click()
        await page.getByRole('tab', { name: section, exact: true }).click()
        await page.getByRole('heading', { level: 2, name: section }).waitFor()
        await page.waitForLoadState('networkidle')
        await page.screenshot({ path: `test-results/screens/${section.toLowerCase()}.${vpName}.${theme}.png`, fullPage: true })
      })
    }
  }
}
