// An in-memory stand-in for the admin API, for component tests and the browser tests. It answers the routes the
// console uses with realistic shapes, and enforces what the real server enforces that the console must get right:
// the CSRF header on state-changing requests, the instance and task state machines (from the client package), the
// per-target limits (the same arithmetic the golden vectors pin) and the session ending (`expire()`).
//
// It is test support only: nothing under src/ imports it, and `scripts/check-dist.mjs` fails the build if it (or a
// test hook) ever reaches dist.

import {
  CSRF_HEADER,
  TASK_STATUS_VALUES,
  check,
  limitsForTarget,
  limitsFromDefinition,
  operatorMoves,
  taskMoveAllowed,
} from '@meddleware/content-hub-client'
import type {
  AuditEntry,
  Attempt,
  Budgets,
  Instance,
  Item,
  Me,
  Phase,
  PlatformDefinition,
  PlatformTarget,
  Post,
  SpendCap,
  Task,
  TaskLink,
} from '../../src/api/types.js'

export interface Call {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  csrf: boolean
}

export interface FakeReply {
  status: number
  /** JSON body (omitted for 204). */
  json?: unknown
  /** Set to answer with an HTML page instead (the access gateway's sign-in). */
  html?: string
}

// Request bodies are whatever the console sent; the fake reads them loosely, as a server would parse JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = Record<string, any>

const NOW = '2026-10-29T12:00:00Z'
const uc = (d: Record<string, unknown>) => d

function def(id: number, code: string, name: string, over: Record<string, unknown>): PlatformDefinition {
  return {
    id, code, name, category: 'social', posting_mode: 'api', counting_method: null, primary_limit: null,
    secondary_limits: {}, markup: 'plain', supports_media: false, base_url: null, url_templates: {}, cost_model: {},
    enabled: true, notes: '', ...over,
  } as PlatformDefinition
}

function target(id: number, d: PlatformDefinition, name: string, over: Record<string, unknown> = {}): PlatformTarget {
  return {
    id, platform_definition_id: d.id, platform_code: d.code, name, external_ref: null, config: {}, secret_ref: null,
    is_sandbox: false, enabled: true, live: false, ...over,
  } as PlatformTarget
}

export class FakeApi {
  me: Me = { subject: 'operator-1', display_name: 'op@example.org' }
  expired = false
  calls: Call[] = []
  paused = false
  nextId = 100

  definitions: PlatformDefinition[]
  targets: PlatformTarget[]
  phases: Phase[]
  items: Item[]
  tasks: Task[]
  taskLinks = new Map<number, TaskLink[]>()
  posts: Post[]
  instances: Instance[]
  attempts = new Map<number, Attempt[]>()
  caps: SpendCap[] = []
  audit: AuditEntry[] = []
  ceilings = { total_monthly_usd_micros: 5_000_000, per_platform_monthly_usd_micros: 2_000_000 }

  constructor() {
    const feed = def(1, 'OWNED_FEED', 'Owned feed', { category: 'owned_channel', posting_mode: 'feed', markup: 'markdown' })
    const masto = def(2, 'MASTODON', 'Mastodon', {
      counting_method: 'graphemes', primary_limit: 500, secondary_limits: { url_weight: 23, mention_local_part: 1 },
    })
    const bsky = def(3, 'BLUESKY', 'Bluesky', { counting_method: 'graphemes', primary_limit: 300, secondary_limits: { bytes: 3000 } })
    const x = def(4, 'X', 'X', {
      counting_method: 'x_weighted', primary_limit: 280, secondary_limits: { url_weight: 23 },
      cost_model: { per_post_usd_micros: 15000, per_post_with_url_usd_micros: 200000 }, enabled: true,
    })
    const reddit = def(5, 'REDDIT', 'Reddit', {
      category: 'forum', posting_mode: 'manual', counting_method: 'codepoints', primary_limit: 40000,
      markup: 'markdown', url_templates: { intent: 'https://www.reddit.com/r/{subreddit}/submit?title={title}&url={url}' },
    })
    const tg = def(6, 'TELEGRAM_BROADCAST', 'Telegram channel', { counting_method: 'utf16', primary_limit: 4096, markup: 'telegram_html' })
    this.definitions = [feed, masto, bsky, x, reddit, tg]
    this.targets = [
      target(1, feed, 'main feed', { live: true }),
      target(2, masto, 'mastodon test', { external_ref: 'https://mastodon.example', secret_ref: 'PLATFORM_MASTODON_TEST', is_sandbox: true }),
      target(3, bsky, 'bluesky test', { external_ref: 'test.example', secret_ref: 'PLATFORM_BLUESKY_TEST' }),
      target(4, x, 'brand on X', { secret_ref: 'PLATFORM_X_BRAND' }),
      target(5, reddit, 'r/example', { external_ref: 'example' }),
      target(6, tg, 'telegram test', { external_ref: '@example_test', secret_ref: 'PLATFORM_TG_TEST' }),
    ]
    const ph = (id: number, over: Record<string, unknown>) =>
      ({ id, key: `phase-${id}`, public_id: `ph-${id}`, sort_order: id, internal_name: `Phase ${id} internal`, internal_description: 'secret plan', public_name: `Phase ${id}`, public_description: 'public text', window_start: null, window_end: null, visible_human: true, visible_bot: false, ...over }) as Phase
    this.phases = [ph(1, {}), ph(2, { visible_human: false })]
    const it = (id: number, phase: number, over: Record<string, unknown>) =>
      ({ id, phase_id: phase, key: `item-${id}`, public_id: `it-${id}`, item_type: 'content', internal_title: `Item ${id} internal`, internal_description: 'internal only', public_title: `Item ${id}`, public_description: 'public words', visible_human: true, visible_bot: false, status: 'planned', planned_at: null, due_at: null, public_due_at: null, updated_at: NOW, ...over }) as Item
    this.items = [it(1, 1, {}), it(2, 1, { status: 'in_progress' }), it(3, 2, { public_title: null, public_description: null, visible_human: false })]
    const tk = (id: number, over: Record<string, unknown>) =>
      ({ id, roadmap_item_id: 1, key: `task-${id}`, task_type: 'SOCIAL_POST', title: `Task ${id}`, description: '', status: 'planned', blocked_reason: null, scheduled_at: null, completed_at: null, review_interval_days: null, next_review_at: null, assignee_subject: null, entity_gated: false, updated_at: NOW, ...over }) as Task
    this.tasks = [tk(1, {}), tk(2, { status: 'ready', entity_gated: true, title: 'Open the Mastodon account' }), tk(3, { status: 'blocked', blocked_reason: 'waiting for the domain' })]
    this.posts = [
      { id: 1, public_id: 'p-1', title: 'Launch notes', body_markdown: 'We shipped v1.', status: 'ready', tags: [], categories: [], roadmap_item_id: 1, task_id: null, revision: 1, created_by: 'op', updated_at: NOW },
    ]
    const inst = (id: number, targetId: number, status: Instance['status'], over: Record<string, unknown> = {}) =>
      ({ id, post_id: 1, platform_target_id: targetId, override_title: null, override_body: null, status, external_status: null, url_or_external_id: null, scheduled_at: '2026-10-30T09:00:00Z', posted_at: null, sending_started_at: null, attempt_count: 0, next_attempt_at: null, last_error: null, cost_estimate_usd_micros: 0, post_revision: 1, payload_title: 'Launch notes', payload_body: 'We shipped v1.', payload_sha256: 'a'.repeat(64), created_at: NOW, updated_at: NOW, ...over }) as Instance
    this.instances = [
      inst(1, 5, 'manual_required'),
      inst(2, 2, 'unknown', { attempt_count: 1, last_error: 'no answer before the timeout, after the request was sent' }),
      inst(3, 1, 'posted', { url_or_external_id: 'https://feeds.example/p/1', posted_at: NOW }),
    ]
    this.attempts.set(2, [
      { id: 1, started_at: NOW, finished_at: NOW, outcome: 'unknown', http_status: null, response_excerpt: null, request_redacted: { url: 'https://mastodon.example/api/v1/statuses' }, dry_run: false, rendered_payload_sha256: 'a'.repeat(64) },
    ])
  }

  expire(): void {
    this.expired = true
  }

  // ── plumbing ────────────────────────────────────────────────────────────────────────────────────────────
  /** A `fetch` for component tests. */
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost')
    const headers = Object.fromEntries(new Headers(init?.headers).entries())
    const r = this.respond((init?.method ?? 'GET').toUpperCase(), url.pathname + url.search, headers, init?.body as string | undefined)
    if (r.html !== undefined) return new Response(r.html, { status: r.status, headers: { 'content-type': 'text/html' } })
    return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? null), { status: r.status, headers: { 'content-type': 'application/json' } })
  }

  respond(method: string, pathAndQuery: string, headers: Record<string, string>, bodyText?: string): FakeReply {
    const url = new URL(pathAndQuery, 'http://localhost')
    const query = Object.fromEntries(url.searchParams.entries())
    const body = bodyText ? (JSON.parse(bodyText) as unknown) : undefined
    const path = url.pathname.replace(/^\/api\/v1/, '')
    const csrf = Object.keys(headers).some((h) => h.toLowerCase() === CSRF_HEADER.toLowerCase())
    this.calls.push({ method, path, query, body, csrf })
    if (this.expired) return { status: 200, html: '<!doctype html><title>Sign in</title>' }
    if (method !== 'GET' && !csrf) return err(403, 'forbidden', 'missing the CSRF header')
    return this.route(method, path, query, body)
  }

  callsTo(method: string, path: string): Call[] {
    return this.calls.filter((c) => c.method === method && c.path === path)
  }

  private id(): number {
    return this.nextId++
  }

  // ── routes ──────────────────────────────────────────────────────────────────────────────────────────────
  private route(method: string, path: string, query: Record<string, string>, body: unknown): FakeReply {
    const b = (body ?? {}) as Body
    const m = (re: RegExp) => re.exec(path)
    let g: RegExpExecArray | null
    if (method === 'GET' && path === '/me') return ok(this.me)
    if (method === 'GET' && path === '/platforms') return ok(this.definitions)
    if (method === 'GET' && path === '/targets') return ok(this.targets)
    if (method === 'POST' && path === '/targets') {
      const d = this.definitions.find((x) => x.id === b.platform_definition_id)
      if (!d) return err(404, 'not_found', 'not found')
      if (b.secret_ref && !/^PLATFORM_[A-Z0-9_]{1,55}$/.test(b.secret_ref)) return err(422, 'invalid', 'secret_ref is the NAME of an environment variable (PLATFORM_…), never the secret itself')
      const t = target(this.id(), d, b.name, { external_ref: b.external_ref ?? null, config: b.config ?? {}, secret_ref: b.secret_ref ?? null, is_sandbox: !!b.is_sandbox, enabled: !!b.enabled })
      this.targets.push(t)
      return ok(t, 201)
    }
    if ((g = m(/^\/targets\/(\d+)$/)) && method === 'PATCH') {
      const t = this.targets.find((x) => x.id === +g![1]!)
      if (!t) return err(404, 'not_found', 'not found')
      Object.assign(t, b)
      return ok(t)
    }
    if (method === 'GET' && path === '/publishing') return ok({ paused: this.paused })
    if (method === 'PUT' && path === '/publishing') {
      this.paused = !!b.paused
      return ok({ paused: this.paused })
    }
    if (method === 'GET' && path === '/stats') return ok(this.stats())
    if (method === 'GET' && path === '/schedule') {
      return ok({ instances: this.instances.filter((i) => i.status === 'queued'), reviews_due: this.tasks.filter((t) => t.next_review_at) })
    }
    if (method === 'GET' && path === '/budgets') return ok(this.budgets())
    if (method === 'PUT' && path === '/budgets') return this.putBudgets(b.caps ?? [])
    if (method === 'GET' && path === '/audit') {
      const rows = this.audit.filter((a) => !query.entity_type || a.entity_type === query.entity_type)
      return ok(page(rows, query))
    }
    if (method === 'GET' && path === '/preview/roadmap') {
      const human = query.audience === 'human'
      if (!human && query.audience !== 'bot') return err(422, 'invalid', 'audience must be human or bot')
      return ok(this.publicRoadmap(human))
    }
    if (method === 'GET' && path === '/phases') return ok(this.phases)
    if (method === 'POST' && path === '/phases') {
      const p = { id: this.id(), public_id: 'ph-new', window_start: null, window_end: null, internal_description: '', public_description: '', visible_human: false, visible_bot: false, ...b } as Phase
      this.phases.push(p)
      return ok(p, 201)
    }
    if ((g = m(/^\/phases\/(\d+)$/)) && method === 'PATCH') {
      const p = this.phases.find((x) => x.id === +g![1]!)
      if (!p) return err(404, 'not_found', 'not found')
      Object.assign(p, b)
      return ok(p)
    }
    if (method === 'GET' && path === '/items') {
      let rows = this.items.filter((i) => (!query.phase_id || i.phase_id === +query.phase_id) && (!query.status || i.status === query.status) && (!query.item_type || i.item_type === query.item_type))
      rows = [...rows].sort((a, c) => c.id - a.id)
      return ok(page(rows, query))
    }
    if (method === 'POST' && path === '/items') {
      if ((b.visible_human || b.visible_bot) && !b.public_title) return err(422, 'invalid', 'a visible item needs public wording')
      const i = { id: this.id(), public_id: 'it-new', updated_at: NOW, planned_at: null, due_at: null, public_due_at: null, ...b } as Item
      this.items.push(i)
      return ok(i, 201)
    }
    if ((g = m(/^\/items\/(\d+)$/))) {
      const i = this.items.find((x) => x.id === +g![1]!)
      if (!i) return err(404, 'not_found', 'not found')
      if (method === 'PATCH') {
        const title = 'public_title' in b ? b.public_title : i.public_title // null clears it, as on the server
        if ((b.visible_human ?? i.visible_human) && !title) return err(422, 'invalid', 'a visible item needs public wording')
        Object.assign(i, b)
        return ok(i)
      }
      return ok({ item: i, tasks: this.tasks.filter((t) => t.roadmap_item_id === i.id), posts: this.posts.filter((p) => p.roadmap_item_id === i.id) })
    }
    if (method === 'GET' && path === '/tasks') {
      let rows = this.tasks.filter(
        (t) =>
          (!query.status || t.status === query.status) &&
          (!query.task_type || t.task_type === query.task_type) &&
          (!query.entity_gated || String(t.entity_gated) === query.entity_gated) &&
          (query.review_due !== 'true' || (t.next_review_at && t.next_review_at <= NOW)),
      )
      rows = [...rows].sort((a, c) => c.id - a.id)
      return ok(page(rows, query))
    }
    if ((g = m(/^\/tasks\/(\d+)$/)) && method === 'GET') return this.taskDetail(+g[1]!)
    if ((g = m(/^\/tasks\/(\d+)\/transition$/)) && method === 'POST') {
      const t = this.tasks.find((x) => x.id === +g![1]!)
      if (!t) return err(404, 'not_found', 'not found')
      if (!taskMoveAllowed(t.status, b.to)) return err(409, 'conflict', `a task cannot move from ${t.status} to ${b.to}`)
      if (b.to === 'blocked' && !b.blocked_reason) return err(422, 'invalid', 'blocked needs a reason')
      t.status = b.to
      t.blocked_reason = b.to === 'blocked' ? b.blocked_reason : null
      t.completed_at = b.to === 'done' ? NOW : null
      return this.taskDetail(t.id)
    }
    if ((g = m(/^\/tasks\/(\d+)\/links$/)) && method === 'POST') {
      const l = { id: this.id(), post_id: null, platform_instance_id: null, url: null, label: '', created_at: NOW, ...b } as TaskLink
      this.taskLinks.set(+g[1]!, [...(this.taskLinks.get(+g[1]!) ?? []), l])
      return ok(l, 201)
    }
    if ((g = m(/^\/tasks\/(\d+)\/links\/(\d+)$/)) && method === 'DELETE') {
      this.taskLinks.set(+g[1]!, (this.taskLinks.get(+g[1]!) ?? []).filter((l) => l.id !== +g![2]!))
      return { status: 204 }
    }
    if (method === 'GET' && path === '/posts') return ok(page([...this.posts].sort((a, c) => c.id - a.id), query))
    if (method === 'POST' && path === '/posts') {
      const p = { id: this.id(), public_id: 'p-new', tags: [], categories: [], roadmap_item_id: null, task_id: null, revision: 1, created_by: this.me.subject, updated_at: NOW, status: 'draft', ...b } as Post
      this.posts.push(p)
      return ok(p, 201)
    }
    if ((g = m(/^\/posts\/(\d+)$/))) {
      const p = this.posts.find((x) => x.id === +g![1]!)
      if (!p) return err(404, 'not_found', 'not found')
      if (method === 'PATCH') {
        if (b.body_markdown !== undefined && b.body_markdown !== p.body_markdown) p.revision++
        Object.assign(p, b)
        return ok(p)
      }
      return ok({ post: p, revisions: [], instances: this.instances.filter((i) => i.post_id === p.id) })
    }
    if ((g = m(/^\/posts\/(\d+)\/enqueue$/)) && method === 'POST') return this.enqueue(+g[1]!, b)
    if (method === 'GET' && path === '/instances') {
      const rows = this.instances.filter((i) => (!query.status || i.status === query.status) && (!query.platform_target_id || i.platform_target_id === +query.platform_target_id))
      return ok(page([...rows].sort((a, c) => c.id - a.id), query))
    }
    if ((g = m(/^\/instances\/(\d+)$/)) && method === 'GET') return this.instanceDetail(+g[1]!)
    if ((g = m(/^\/instances\/(\d+)\/transition$/)) && method === 'POST') {
      const i = this.instances.find((x) => x.id === +g![1]!)
      if (!i) return err(404, 'not_found', 'not found')
      if (b.to !== undefined) {
        if (!operatorMoves(i.status).includes(b.to)) return err(409, 'conflict', `an operator cannot move an instance from ${i.status} to ${b.to}`)
        if (b.to === 'posted') {
          if (!b.url_or_external_id) return err(422, 'invalid', 'posted needs url_or_external_id')
          i.url_or_external_id = b.url_or_external_id
          i.posted_at = NOW
        }
        i.status = b.to
      }
      if (b.external_status !== undefined) i.external_status = b.external_status
      return this.instanceDetail(i.id)
    }
    return err(404, 'not_found', `no such route: ${method} ${path}`)
  }

  private taskDetail(id: number): FakeReply {
    const t = this.tasks.find((x) => x.id === id)
    if (!t) return err(404, 'not_found', 'not found')
    return ok({
      task: t, depends_on: [], platforms: [{ id: 1, platform_definition_id: 2, platform_code: 'MASTODON', platform_target_id: null }],
      links: this.taskLinks.get(id) ?? [], allowed_moves: TASK_STATUS_VALUES.filter((to) => taskMoveAllowed(t.status, to)),
    })
  }

  private instanceDetail(id: number): FakeReply {
    const i = this.instances.find((x) => x.id === id)
    if (!i) return err(404, 'not_found', 'not found')
    const t = this.targets.find((x) => x.id === i.platform_target_id)
    const d = this.definitions.find((x) => x.id === t?.platform_definition_id)
    const intent = d?.url_templates.intent
      ? d.url_templates.intent.replace('{subreddit}', t?.external_ref ?? '').replace('{title}', encodeURIComponent(i.payload_title ?? '')).replace('{url}', '')
      : null
    return ok({ instance: i, attempts: this.attempts.get(id) ?? [], intent_url: intent, operator_moves: operatorMoves(i.status) })
  }

  private enqueue(postId: number, b: Body): FakeReply {
    const post = this.posts.find((p) => p.id === postId)
    if (!post) return err(404, 'not_found', 'not found')
    if (post.status !== 'ready') return err(422, 'invalid', 'only a ready post can be enqueued')
    const problems: Array<{ target_id: number; problem: string }> = []
    const made: Instance[] = []
    for (const t of b.targets as Array<Body>) {
      const tg = this.targets.find((x) => x.id === t.target_id)
      const d = this.definitions.find((x) => x.id === tg?.platform_definition_id)
      if (!tg || !d) {
        problems.push({ target_id: t.target_id, problem: 'no such target' })
        continue
      }
      const title = t.override_title ?? post.title
      const text = t.override_body ?? post.body_markdown
      const limits = limitsForTarget(limitsFromDefinition(d), d.secondary_limits, tg.config)
      const c = limits ? check(d.markup, limits, title, text) : null
      if (c && !c.fits) {
        problems.push({ target_id: t.target_id, problem: `${d.code} does not fit: ${c.counted} of ${c.limit ?? 'none'}` })
        continue
      }
      if (this.instances.some((i) => i.post_id === postId && i.platform_target_id === tg.id && i.status !== 'cancelled')) {
        return err(409, 'conflict', `target ${tg.id} already has a live instance of this post`)
      }
      const status = d.posting_mode === 'manual' ? 'manual_required' : 'queued'
      made.push({
        id: this.id(), post_id: postId, platform_target_id: tg.id, override_title: t.override_title ?? null, override_body: t.override_body ?? null,
        status, external_status: null, url_or_external_id: null, scheduled_at: b.scheduled_at ?? NOW, posted_at: null, sending_started_at: null,
        attempt_count: 0, next_attempt_at: null, last_error: null, cost_estimate_usd_micros: 0, post_revision: post.revision,
        payload_title: title, payload_body: c ? c.payload : text, payload_sha256: 'b'.repeat(64), created_at: NOW, updated_at: NOW,
      } as Instance)
    }
    if (problems.length) return err(422, 'invalid', 'some targets were refused; nothing was enqueued', { problems })
    this.instances.push(...made)
    return ok(made, 201)
  }

  private stats() {
    const by = (xs: string[]) => [...new Set(xs)].sort().map((key) => ({ key, count: xs.filter((x) => x === key).length }))
    return {
      tasks_by_status: by(this.tasks.map((t) => t.status)),
      items_by_status: by(this.items.map((i) => i.status)),
      posts_by_status: by(this.posts.map((p) => p.status)),
      instances_by_status: by(this.instances.map((i) => i.status)),
      posts_by_phase: [{ key: 'Phase 1 internal', count: 1 }],
      reviews_due: 0,
    }
  }

  private budgets(): Budgets {
    return { ceilings: this.ceilings, caps: this.caps, usage: [{ platform_definition_id: 4, used_usd_micros: 15000 }] }
  }

  private putBudgets(caps: Array<Body>): FakeReply {
    const before = structuredClone(this.caps)
    for (const c of caps) {
      const ceiling = c.scope === 'total' ? this.ceilings.total_monthly_usd_micros : Math.min(this.ceilings.per_platform_monthly_usd_micros, this.ceilings.total_monthly_usd_micros)
      if (c.monthly_limit_usd_micros > ceiling) return err(422, 'invalid', `${c.scope} cap ${c.monthly_limit_usd_micros} exceeds the instance ceiling ${ceiling}`)
      const i = this.caps.findIndex((x) => x.scope === c.scope && x.platform_definition_id === (c.platform_definition_id ?? null) && x.platform_target_id === (c.platform_target_id ?? null))
      const row = { id: i >= 0 ? this.caps[i]!.id : this.id(), scope: c.scope, platform_definition_id: c.platform_definition_id ?? null, platform_target_id: c.platform_target_id ?? null, monthly_limit_usd_micros: c.monthly_limit_usd_micros, daily_post_limit: c.daily_post_limit ?? null, updated_by: this.me.subject, updated_at: NOW } as SpendCap
      if (i >= 0) this.caps[i] = row
      else this.caps.push(row)
    }
    this.audit.unshift({ id: this.id(), at: NOW, actor_subject: this.me.subject, action: 'budgets.update', entity_type: 'budgets', entity_id: null, before, after: structuredClone(this.caps) })
    return ok(this.budgets())
  }

  private publicRoadmap(human: boolean) {
    const phases = this.phases
      .filter((p) => (human ? p.visible_human : p.visible_bot))
      .map((p) => ({
        id: p.public_id, name: p.public_name, description: p.public_description, window_start: p.window_start, window_end: p.window_end,
        items: this.items
          .filter((i) => i.phase_id === p.id && (human ? i.visible_human : i.visible_bot))
          .map((i) => ({ id: i.public_id, title: i.public_title ?? '', description: i.public_description ?? '', status: i.status, due_at: i.public_due_at, updated_at: i.updated_at })),
      }))
    return { schema_version: 1, updated_at: NOW, phases }
  }
}

const ok = (json: unknown, status = 200): FakeReply => ({ status, json })
const err = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): FakeReply => ({
  status,
  json: uc({ error, message, ...extra }),
})

/** One page of rows by an offset cursor (`c<n>`), newest first as the caller sorted them. */
function page<T>(rows: T[], query: Record<string, string>) {
  const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100)
  const start = query.cursor ? Number(query.cursor.slice(1)) || 0 : 0
  const items = rows.slice(start, start + limit)
  return { items, next_cursor: start + limit < rows.length ? `c${start + limit}` : null }
}

