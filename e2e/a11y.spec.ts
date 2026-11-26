// The shared accessibility sweep (WCAG 2.2 AA and AAA in every colour mode × season, reflow, text size, forced colours, reduced motion,
// keyboard) over every section of the console with its busiest content showing: the composer with three targets and an overflow, a
// publishing detail with attempts, a task with links, the public preview, the calendar.
import { expect } from '@playwright/test'
import { defineA11ySuite } from '@meddleware/frontend-config/a11y'
import { open, tab } from './open.js'

defineA11ySuite(
  {
    // The overview with its counts.
    dashboard: async (page) => {
      await open(page)
      await expect(page.getByRole('heading', { name: 'Tasks by status' })).toBeVisible()
    },
    // An item's internal and public wording side by side.
    'roadmap item': async (page) => {
      await open(page)
      await tab(page, 'Roadmap').click()
      await page.getByRole('row', { name: /Item 1 internal/ }).getByRole('button', { name: 'Details' }).click()
      await expect(page.getByRole('heading', { name: 'Public wording — what visitors can see' })).toBeVisible()
    },
    // The public document for people.
    'roadmap public preview': async (page) => {
      await open(page)
      await tab(page, 'Roadmap').click()
      await page.getByText('Public: people', { exact: false }).click()
      await expect(page.getByRole('heading', { name: 'What visitors get' })).toBeVisible()
    },
    // A task with its status moves, dependencies and links.
    'task detail': async (page) => {
      await open(page)
      await tab(page, 'Tasks').click()
      await page.getByRole('row', { name: /Task 1/ }).getByRole('button', { name: 'Details' }).click()
      await expect(page.getByRole('heading', { name: 'Change status' })).toBeVisible()
    },
    // The composer with three targets and a text too long for two of them.
    'composer over the limit': async (page) => {
      await open(page)
      await tab(page, 'Composer').click()
      await page.getByLabel('Title', { exact: true }).fill('Launch')
      await page.getByRole('textbox', { name: 'Text', exact: true }).fill('word '.repeat(80))
      for (const t of ['mastodon test', 'bluesky test', 'brand on X']) await page.getByRole('checkbox', { name: new RegExp(`^${t}`) }).check()
      await expect(page.getByText('over by 100').first()).toBeVisible()
    },
    // An uncertain send with its attempts.
    'publishing detail': async (page) => {
      await open(page)
      await tab(page, 'Publishing').click()
      await page.getByRole('row', { name: /mastodon test/ }).getByRole('button', { name: 'Open' }).click()
      await expect(page.getByText('may or may not have gone out')).toBeVisible()
    },
    // The schedule as a list.
    'schedule list': async (page) => {
      await open(page)
      await tab(page, 'Schedule').click()
      await expect(page.getByRole('heading', { level: 3, name: 'Coming up' })).toBeVisible()
    },
    // The schedule as a month calendar.
    'schedule calendar': async (page) => {
      await open(page)
      await tab(page, 'Schedule').click()
      await page.getByText('Calendar', { exact: true }).click()
      await expect(page.locator('div.cal table')).toBeVisible()
    },
    // The caps table and its audit trail.
    budgets: async (page) => {
      await open(page)
      await tab(page, 'Budgets').click()
      await expect(page.getByRole('heading', { name: 'Caps and usage this month' })).toBeVisible()
    },
  },
  { aaa: 'gate' },
)
