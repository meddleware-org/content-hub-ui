// Screenshots for LOOKING at the console (see @meddleware/frontend-config/shots). Run: npm run shots. One state per section, served by the
// in-memory FakeApi, so layout, spacing, overflow and wording problems no assertion catches can be seen.
import { defineShots, type State } from '@meddleware/frontend-config/shots'
import { SECTIONS, open, tab } from './open.js'

const states: Record<string, State> = Object.fromEntries(
  SECTIONS.map((section) => [
    section.toLowerCase(),
    (async (page) => {
      await open(page)
      await tab(page, section).click()
      await page.getByRole('heading', { level: 2, name: section }).waitFor()
      await page.waitForLoadState('networkidle')
    }) satisfies State,
  ]),
)

defineShots(states)
