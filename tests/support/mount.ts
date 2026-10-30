import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { expect, vi } from 'vitest'
import { nextTick } from 'vue'
import ContentHubView from '../../src/ContentHubView.vue'
import { FakeApi } from './fake-api.js'

/** Let pending promises and renders finish (a few rounds, as one request often triggers the next). */
export async function settle(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await flushPromises()
    await nextTick()
  }
}

export interface Harness {
  w: VueWrapper
  api: FakeApi
  reload: ReturnType<typeof vi.fn>
}

export async function mountConsole(api = new FakeApi()): Promise<Harness> {
  const reload = vi.fn()
  const w = mount(ContentHubView, { props: { fetch: api.fetch as typeof fetch, reload }, attachTo: document.body })
  await settle()
  return { w, api, reload }
}

export async function openTab(h: Harness, label: string): Promise<void> {
  const tab = h.w.findAll('[role="tab"]').find((t) => t.text() === label)
  if (!tab) throw new Error(`no tab ${label}`)
  await tab.trigger('click')
  await settle()
}

/** The first button (or link) with exactly this text inside `root`. */
export function button(root: { findAll: VueWrapper['findAll'] }, text: string) {
  const b = root.findAll('button').find((x) => x.text() === text)
  if (!b) throw new Error(`no button "${text}"`)
  return b
}

export const hasButton = (root: { findAll: VueWrapper['findAll'] }, text: string) => root.findAll('button').some((x) => x.text() === text)

export async function click(root: { findAll: VueWrapper['findAll'] }, text: string): Promise<void> {
  await button(root, text).trigger('click')
  await settle()
}

/** Every state-changing request the console made carried the CSRF header (called at the end of each test). */
export function expectCsrfEverywhere(api: FakeApi): void {
  const writes = api.calls.filter((c) => c.method !== 'GET')
  for (const c of writes) expect(c.csrf, `${c.method} ${c.path}`).toBe(true)
}

/** The text of the section being shown (without the header's time-zone list, which makes failures unreadable). */
export const panelText = (h: Harness): string => h.w.find('.content-hub-panel').text()

/** Choose a radio option of a segmented control by its label. */
export async function segment(h: Harness, label: string): Promise<void> {
  const l = h.w.findAll('label.mode-item').find((x) => x.text().startsWith(label))
  if (!l) throw new Error(`no option "${label}"`)
  await l.find('input').setValue(true)
  await settle()
}
