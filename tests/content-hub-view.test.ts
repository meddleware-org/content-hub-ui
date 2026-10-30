import { afterEach, describe, expect, it } from 'vitest'
import { SECTIONS } from '../src/sections.js'
import { mountConsole, openTab, type Harness } from './support/mount.js'

let h: Harness | null = null
afterEach(() => {
  h?.w.unmount()
  h = null
})

describe('ContentHubView', () => {
  it('offers every section as a tab and shows the first', async () => {
    h = await mountConsole()
    expect(h.w.findAll('[role="tab"]').map((t) => t.text())).toEqual(SECTIONS.map((s) => s.label))
    expect(h.w.find('h2').text()).toBe(SECTIONS[0]!.label)
  })

  it('switches the visible section with the tab', async () => {
    h = await mountConsole()
    await openTab(h, 'Budgets')
    expect(h.w.find('h2').text()).toBe('Budgets')
    expect(h.w.findAll('h2')).toHaveLength(1)
  })

  it('renders section text as text, never as markup', async () => {
    h = await mountConsole()
    expect(h.w.html()).not.toContain('v-html')
    expect(h.w.find('p.section-summary').element.innerHTML).toBe(SECTIONS[0]!.summary)
  })

  it('builds every table soundly: no row inside a row, and every row has one cell per header', async () => {
    // A `<tr>` passed into the library table's `head` slot (which already wraps one) nests a row in a row: the header then
    // collapses into the first column and nothing lines up. No other test sees it, only a screenshot did.
    h = await mountConsole()
    let tables = 0
    for (const section of SECTIONS) {
      await openTab(h, section.label)
      for (const table of Array.from(h.w.element.querySelectorAll('table'))) {
        tables++
        expect(table.querySelectorAll('tr tr'), `${section.label}: a row inside a row`).toHaveLength(0)
        const headers = table.querySelectorAll('thead th').length
        expect(headers, `${section.label}: a table without headers`).toBeGreaterThan(0)
        for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
          expect(row.children.length, `${section.label}: cells in a row`).toBe(headers)
        }
      }
    }
    expect(tables).toBeGreaterThanOrEqual(4)
  })

  it('talks only to the same-origin admin API', async () => {
    h = await mountConsole()
    await openTab(h, 'Publishing')
    // The fake receives paths relative to /api/v1; the HTTP layer test pins the prefix and the headers.
    expect(h.api.calls.length).toBeGreaterThan(3)
    expect(h.api.calls.every((c) => c.path.startsWith('/'))).toBe(true)
  })
})
