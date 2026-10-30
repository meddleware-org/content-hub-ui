import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TASK_STATUS_VALUES, taskMoveAllowed } from '@meddleware/content-hub-client'
import { DRAFT_KEY } from '../src/lib/drafts.js'
import { FakeApi } from './support/fake-api.js'
import { button, click, expectCsrfEverywhere, hasButton, mountConsole, openTab, panelText, segment, settle, type Harness } from './support/mount.js'

let h: Harness | null = null
beforeEach(() => localStorage.clear())
afterEach(() => {
  if (h) expectCsrfEverywhere(h.api)
  h?.w.unmount()
  h = null
})

describe('the shell', () => {
  it('shows who is signed in, how to sign out, and every section', async () => {
    h = await mountConsole()
    expect(h.w.text()).toContain('Signed in as op@example.org')
    expect(h.w.find('a[href="/cdn-cgi/access/logout"]').text()).toBe('Sign out')
    expect(h.w.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Dashboard', 'Roadmap', 'Tasks', 'Composer', 'Publishing', 'Schedule', 'Budgets'])
    // Only same-origin API calls were made.
    expect(h.api.calls.every((c) => typeof c.path === 'string')).toBe(true)
  })

  it('offers to sign in again when the session ends, and keeps the page otherwise intact', async () => {
    h = await mountConsole()
    h.api.expire()
    await click(h.w, 'Refresh')
    expect(panelText(h)).toContain('Your session has expired')
    expect(h.reload).not.toHaveBeenCalled()
    await click(h.w, 'Sign in again')
    expect(h.reload).toHaveBeenCalledTimes(1)
    // Writes are not even attempted from the composer once the session is known to be over.
    await openTab(h, 'Composer')
    expect(button(h.w, 'Save draft').attributes('disabled')).toBeDefined()
  })

  it('treats the sign-in page served in place of JSON as the session ending', async () => {
    const api = new FakeApi()
    api.expire()
    h = await mountConsole(api)
    expect(panelText(h)).toContain('Your session has expired')
  })
})

describe('the dashboard', () => {
  it('shows counts from the server and spend against caps', async () => {
    h = await mountConsole()
    const text = h.w.text()
    expect(text).toContain('Tasks by status')
    expect(text).toMatch(/blocked\s*1/)
    expect(text).toMatch(/unknown\s*1/)
    expect(text).toContain('Phase 1 internal')
    expect(text).toContain('Spend against caps this month')
    expect(text).toContain('$0.015')
  })
})

describe('the roadmap', () => {
  it('previews exactly the public document, and keeps internal wording out of it', async () => {
    h = await mountConsole()
    await openTab(h, 'Roadmap')
    expect(panelText(h)).toContain('Item 1 internal')
    await segment(h, 'Public: people')
    const shown = h.w.find('details pre').text()
    const served = h.api.respond('GET', '/api/v1/preview/roadmap?audience=human', {}).json
    expect(JSON.parse(shown)).toEqual(served)
    expect(shown).not.toContain('internal')
    expect(panelText(h)).toContain('Item 1')
    // Phase 2 and item 3 are not visible to people; the bot document is empty here.
    expect(shown).not.toContain('Phase 2')
    await segment(h, 'Public: bots')
    expect(panelText(h)).toContain('Nothing is public for this audience yet.')
  })

  it('edits an item and shows the server\'s refusal when a visible item has no public wording', async () => {
    h = await mountConsole()
    await openTab(h, 'Roadmap')
    await h.w.findAll('tr').find((r) => r.text().includes('Item 1 internal'))!.findAll('button')[0]!.trigger('click')
    await settle()
    await click(h.w, 'Edit item')
    await h.w.find('#if-ptitle').setValue('')
    await click(h.w, 'Save')
    expect(panelText(h)).toContain('a visible item needs public wording')
    await h.w.find('#if-ptitle').setValue('A better title')
    await click(h.w, 'Save')
    const patches = h.api.calls.filter((c) => c.method === 'PATCH' && c.path.startsWith('/items/'))
    expect(patches.at(-1)?.body).toMatchObject({ public_title: 'A better title' })
    expect(panelText(h)).toContain('Item saved.')
  })
})

describe('tasks', () => {
  it('offers only the moves the server allows, and asks for a reason before blocking', async () => {
    h = await mountConsole()
    await openTab(h, 'Tasks')
    expect(panelText(h)).toContain('needs the organisation')
    // Open "Task 1" (planned).
    const row = h.w.findAll('tr').find((r) => r.text().includes('Task 1'))!
    await row.findAll('button').find((b) => b.text() === 'Details')!.trigger('click')
    await settle()
    const offered = h.w.findAll('button').filter((b) => b.text().startsWith('Move to ')).map((b) => b.text().replace('Move to ', '').replace(' ', '_'))
    expect(offered.sort()).toEqual(TASK_STATUS_VALUES.filter((s) => taskMoveAllowed('planned', s)).sort())
    expect(hasButton(h.w, 'Move to done')).toBe(false) // not a planned task's next step
    await click(h.w, 'Move to blocked')
    expect(button(h.w, 'Block the task').attributes('disabled')).toBeDefined()
    await h.w.find('#tk-reason').setValue('waiting for the domain')
    await click(h.w, 'Block the task')
    expect(h.api.callsTo('POST', '/tasks/1/transition').at(-1)?.body).toEqual({ to: 'blocked', blocked_reason: 'waiting for the domain' })
    expect(panelText(h)).toContain('Blocked: waiting for the domain')
  })

  it('attaches and detaches links', async () => {
    h = await mountConsole()
    await openTab(h, 'Tasks')
    await h.w.findAll('button').find((b) => b.text() === 'Details')!.trigger('click')
    await settle()
    await h.w.find('#lk-url').setValue('https://example.org/brief')
    await h.w.find('#lk-label').setValue('The brief')
    await click(h.w, 'Attach')
    expect(h.w.find('a[href="https://example.org/brief"]').text()).toBe('The brief')
    await click(h.w, 'Detach')
    expect(panelText(h)).toContain('No links.')
  })

  it('filters by status and entity gating', async () => {
    h = await mountConsole()
    await openTab(h, 'Tasks')
    await h.w.find('#tk-gated').setValue('true')
    await settle()
    expect(h.api.calls.filter((c) => c.path === '/tasks').at(-1)?.query.entity_gated).toBe('true')
    expect(h.w.findAll('tbody tr')).toHaveLength(1)
    expect(panelText(h)).toContain('Open the Mastodon account')
  })
})

describe('publishing', () => {
  it('marks a manual post as posted only with where it went', async () => {
    h = await mountConsole()
    await openTab(h, 'Publishing')
    await h.w.findAll('tr').find((r) => r.text().includes('r/example'))!.findAll('button')[0]!.trigger('click')
    await settle()
    expect(button(h.w, 'Mark as posted').attributes('disabled')).toBeDefined()
    expect(panelText(h)).toContain('Post by hand')
    expect(h.w.find('a[href^="https://www.reddit.com/r/example/submit"]').exists()).toBe(true)
    await h.w.find('#pb-url').setValue('https://www.reddit.com/r/example/comments/abc')
    await click(h.w, 'Mark as posted')
    expect(h.api.callsTo('POST', '/instances/1/transition').at(-1)?.body).toEqual({ to: 'posted', url_or_external_id: 'https://www.reddit.com/r/example/comments/abc' })
    expect(panelText(h)).toContain('Instance #1 is now posted')
  })

  it('resolves an uncertain send either way and never offers an automatic retry', async () => {
    h = await mountConsole()
    await openTab(h, 'Publishing')
    await h.w.findAll('tr').find((r) => r.text().includes('mastodon test'))!.findAll('button')[0]!.trigger('click')
    await settle()
    expect(panelText(h)).toContain('may or may not have gone out')
    expect(hasButton(h.w, 'Retry')).toBe(false)
    expect(hasButton(h.w, 'It did go out — record where')).toBe(true)
    await click(h.w, 'It did not go out')
    expect(h.api.instances.find((i) => i.id === 2)?.status).toBe('failed')
    // After that, a retry is possible, as the server's table says.
    expect(hasButton(h.w, 'Retry')).toBe(true)
    expect(panelText(h)).toContain('The request (credentials hidden)')
  })

  it('stops and resumes all sending', async () => {
    h = await mountConsole()
    await openTab(h, 'Publishing')
    expect(panelText(h)).toContain('Running.')
    await click(h.w, 'Stop all sending')
    expect(h.api.paused).toBe(true)
    expect(panelText(h)).toContain('Stopped.')
    await click(h.w, 'Resume sending')
    expect(h.api.paused).toBe(false)
  })

  it('asks before a target sends for real, and a refused credential name is explained', async () => {
    h = await mountConsole()
    await openTab(h, 'Publishing')
    const box = h.w.findAll('input[type="checkbox"]').find((i) => i.element.parentElement?.textContent?.includes('mastodon test sends for real'))!
    await box.setValue(true)
    await settle()
    expect(panelText(h)).toContain('Turn on real sending?')
    expect(h.api.targets.find((t) => t.id === 2)?.live).toBe(false)
    await click(h.w, 'Keep it a dry run')
    expect(h.api.targets.find((t) => t.id === 2)?.live).toBe(false)
    await box.setValue(true)
    await settle()
    await click(h.w, 'Turn on real sending')
    expect(h.api.targets.find((t) => t.id === 2)?.live).toBe(true)

    await click(h.w, 'Add a target')
    await h.w.find('#tg-platform').setValue('2')
    await h.w.find('#tg-name').setValue('another')
    await h.w.find('#tg-secret').setValue('hunter2-token')
    await click(h.w, 'Add target')
    expect(panelText(h)).toContain('NAME of an environment variable')
    expect(h.api.targets.some((t) => t.name === 'another')).toBe(false)
  })
})

describe('budgets', () => {
  it('saves a cap, refuses one above the instance ceiling, and lists the change', async () => {
    h = await mountConsole()
    await openTab(h, 'Budgets')
    expect(panelText(h)).toContain('Instance ceilings: $5.00 in total, $2.00 per platform')
    const xCap = h.w.find('#cap-platform-4-')
    await xCap.setValue('9')
    await click(h.w, 'Save changed caps')
    expect(panelText(h)).toContain('Above the instance ceiling of $2.00')
    expect(h.api.callsTo('PUT', '/budgets')).toHaveLength(0)
    await xCap.setValue('0.5')
    await click(h.w, 'Save changed caps')
    expect(h.api.callsTo('PUT', '/budgets').at(-1)?.body).toEqual({
      caps: [{ scope: 'platform', platform_definition_id: 4, monthly_limit_usd_micros: 500_000, daily_post_limit: null }],
    })
    expect(panelText(h)).toContain('Saved 1 cap.')
    expect(panelText(h)).toContain('X: set to $0.50 a month, no daily limit')
    await h.w.find('#cap-platform-4-').setValue('nonsense')
    await click(h.w, 'Save changed caps')
    expect(panelText(h)).toContain('Enter dollars with at most six decimals')
  })
})

describe('the schedule', () => {
  it('lists and draws what is scheduled, in the chosen time zone', async () => {
    const api = new FakeApi()
    api.instances.push({ ...api.instances[0]!, id: 50, status: 'queued', platform_target_id: 2, scheduled_at: new Date().toISOString() })
    h = await mountConsole(api)
    await openTab(h, 'Schedule')
    expect(panelText(h)).toContain('Send to mastodon test (instance #50)')
    await segment(h, 'Calendar')
    expect(h.w.find('table.cal').exists()).toBe(true)
    expect(h.w.find('table.cal').text()).toContain('Send to mastodon test')
    const zone = (h.w.find('#console-zone').element as HTMLSelectElement).value
    expect(h.w.find('table.cal caption').text()).toContain(`times in ${zone}`)
  })
})

describe('the composer', () => {
  const long = 'word '.repeat(80) // 400 characters: over Bluesky (300), under Mastodon (500)

  async function choose(h: Harness, ...names: string[]) {
    for (const n of names) {
      const box = h.w.findAll('.target-choice').find((l) => l.text().startsWith(n))!.find('input')
      await box.setValue(true)
    }
    await settle()
  }

  it('shows per platform how much fits, with words as well as colour, and blocks queueing while over', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await h.w.find('#post-title').setValue('Launch')
    await h.w.find('#post-body').setValue(long)
    await choose(h, 'mastodon test', 'bluesky test', 'brand on X')
    const text = panelText(h)
    expect(text).toContain('400 / 500 characters — close to the limit')
    expect(text).toContain('400 / 300 characters — over by 100')
    expect(text).toContain('400 / 280 weighted characters — over by 120')
    // The bar has a text alternative and a sentence per band, and a legend, so colour is never the only cue.
    expect(h.w.find('svg[role="img"]').attributes('aria-label')).toMatch(/characters 1 to 280: within every limit \(3\)/)
    expect(text).toMatch(/Characters 281–300: within .*Mastodon.*; over/)
    expect(text).toContain('✓ within every limit · ◐ within some · ✗ over every limit')
    expect(button(h.w, 'Queue for 3 targets').attributes('disabled')).toBeDefined()
    expect(text).toContain('Too long for bluesky test, brand on X')
  })

  it('shortens a text with a link, counts the result, and queues each target with its own text', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await h.w.find('#post-title').setValue('Launch')
    await h.w.find('#post-body').setValue(long)
    await choose(h, 'mastodon test', 'bluesky test')
    // Bluesky: shorten with a link.
    const panel = h.w.findAll('.target-panel').find((p) => p.text().includes('bluesky test'))!
    await panel.find('details.override summary').trigger('click')
    await panel.find('input[type="url"]').setValue('https://example.org/launch')
    await button(panel, 'Shorten with link').trigger('click')
    await settle()
    expect(panel.text()).toContain('(in use)')
    expect(button(h.w, 'Queue for 2 targets').attributes('disabled')).toBeUndefined()
    await click(h.w, 'Queue for 2 targets')
    const enqueue = h.api.calls.filter((c) => /^\/posts\/\d+\/enqueue$/.test(c.path)).at(-1)!
    const sent = enqueue.body as { targets: Array<{ target_id: number; override_body?: string }> }
    expect(sent.targets.find((t) => t.target_id === 2)).toEqual({ target_id: 2 }) // Mastodon: the shared text
    const bsky = sent.targets.find((t) => t.target_id === 3)!
    expect(bsky.override_body!.endsWith('… https://example.org/launch')).toBe(true)
    expect(Array.from(bsky.override_body!).length).toBeLessThanOrEqual(300)
    expect(panelText(h)).toContain('Queued 2 instances')
    // The post was saved as ready first, and the unsent draft is gone.
    expect(h.api.posts.at(-1)?.status).toBe('ready')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('explains what the server refused for a target', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await h.w.find('#post-title').setValue('Launch')
    await h.w.find('#post-body').setValue('short')
    await choose(h, 'mastodon test')
    // The server's limit moves under the console's feet (the cached instance limit changed).
    h.api.targets.find((t) => t.id === 2)!.config = { instance_limits: { max_characters: 3, characters_reserved_per_url: 23 } }
    await click(h.w, 'Queue for 1 target')
    expect(panelText(h)).toContain('some targets were refused')
    expect(panelText(h)).toContain('MASTODON does not fit')
  })

  it('keeps an unsent draft through a reload and offers to discard it', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await h.w.find('#post-title').setValue('Half written')
    await h.w.find('#post-body').setValue('Something **bold**')
    await choose(h, 'mastodon test')
    await settle()
    const stored = JSON.parse(localStorage.getItem(DRAFT_KEY)!)
    expect(stored).toMatchObject({ title: 'Half written', body: 'Something **bold**', targets: [2] })
    h.w.unmount()
    h = await mountConsole(h.api)
    await openTab(h, 'Composer')
    expect((h.w.find('#post-title').element as HTMLInputElement).value).toBe('Half written')
    expect(panelText(h)).toContain('Restored your unsent draft')
    await click(h.w, 'Discard it')
    expect((h.w.find('#post-title').element as HTMLInputElement).value).toBe('')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('keeps the draft when the session ends mid-save', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await h.w.find('#post-title').setValue('Important')
    await h.w.find('#post-body').setValue('Do not lose this')
    h.api.expire()
    await click(h.w, 'Save draft')
    expect(panelText(h)).toContain('Your session has expired')
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toMatchObject({ title: 'Important', body: 'Do not lose this' })
  })

  it('renders a hostile post as text, never as markup or a live script link', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await h.w.find('#post-title').setValue('x')
    await h.w.find('#post-body').setValue('<img src=x onerror=alert(1)> [click](javascript:alert(2)) <script>alert(3)</script> **ok**')
    await choose(h, 'mastodon test')
    const rendered = h.w.find('.rendered-text')
    expect(rendered.find('img').exists()).toBe(false)
    expect(rendered.find('script').exists()).toBe(false)
    expect(rendered.findAll('a').every((a) => !/^javascript:/i.test(a.attributes('href') ?? ''))).toBe(true)
    expect(rendered.text()).toContain('<img src=x onerror=alert(1)>')
    expect(rendered.find('strong').text()).toBe('ok')
  })

  it('reopens a saved post with its instances', async () => {
    h = await mountConsole()
    await openTab(h, 'Composer')
    await click(h.w, 'Open')
    expect((h.w.find('#post-title').element as HTMLInputElement).value).toBe('Launch notes')
    expect(panelText(h)).toContain('Instances of this post')
    expect(panelText(h)).toContain('r/example')
  })
})
