// The console's shared context: the HTTP wrapper, who is signed in, whether the session ended, the display time
// zone, and the platform/target reference data most sections need. Provided once by ContentHubView; every section
// reads it with `useConsole()`.

import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { createHttp, type Http } from './api/http.js'
import type { Me, Page, PlatformDefinition, PlatformTarget } from './api/types.js'
import { safeStorage } from './lib/drafts.js'
import { browserZone, isZone } from './lib/time.js'

export interface Reference {
  definitions: PlatformDefinition[]
  targets: PlatformTarget[]
}

export interface ConsoleOptions {
  /** Injected for tests and embedding; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** What "sign in again" does; defaults to reloading the page at top level so the access gateway re-authenticates. */
  reload?: () => void
}

export interface ConsoleContext {
  http: Http
  me: Ref<Me | null>
  /** True once any request found the session ended. */
  expired: Ref<boolean>
  /** The IANA zone times are shown and edited in. */
  zone: Ref<string>
  setZone: (tz: string) => void
  reload: () => void
  reference: Ref<Reference | null>
  loadReference: (force?: boolean) => Promise<Reference>
}

const KEY: InjectionKey<ConsoleContext> = Symbol('content-hub-console')
const ZONE_KEY = 'content-hub:zone:v1'

/** The access gateway's sign-out path on this host (it clears the session cookie and returns to sign-in). */
export const SIGN_OUT_PATH = '/cdn-cgi/access/logout'

function topLevelReload(): void {
  try {
    if (window.top && window.top !== window) window.top.location.reload()
    else window.location.reload()
  } catch {
    window.location.reload()
  }
}

function initialZone(): string {
  try {
    const saved = safeStorage()?.getItem(ZONE_KEY)
    if (saved && isZone(saved)) return saved
  } catch {
    /* fall through to the browser's zone */
  }
  return browserZone()
}

export function createConsole(opts: ConsoleOptions = {}): ConsoleContext {
  const expired = ref(false)
  const me = ref<Me | null>(null)
  const zone = ref(initialZone())
  const reference = ref<Reference | null>(null)
  const http = createHttp({ fetch: opts.fetch, onSessionExpired: () => (expired.value = true) })
  let pending: Promise<Reference> | null = null

  async function loadReference(force = false): Promise<Reference> {
    if (reference.value && !force) return reference.value
    pending ??= Promise.all([http.get<PlatformDefinition[]>('/platforms'), http.get<PlatformTarget[]>('/targets')])
      .then(([definitions, targets]) => (reference.value = { definitions, targets }))
      .finally(() => (pending = null))
    return pending
  }

  return {
    http,
    me,
    expired,
    zone,
    setZone(tz) {
      if (!isZone(tz)) return
      zone.value = tz
      try {
        safeStorage()?.setItem(ZONE_KEY, tz)
      } catch {
        /* the choice just is not remembered */
      }
    },
    reload: opts.reload ?? topLevelReload,
    reference,
    loadReference,
  }
}

export function provideConsole(c: ConsoleContext): void {
  provide(KEY, c)
}

export function useConsole(): ConsoleContext {
  const c = inject(KEY)
  if (!c) throw new Error('useConsole() outside ContentHubView')
  return c
}

/** Fetch every page of a small list (reference data), newest first, up to a safety bound. */
export async function allPages<T>(load: (cursor: string | null) => Promise<Page<T>>, maxPages = 20): Promise<T[]> {
  const out: T[] = []
  let cursor: string | null = null
  for (let i = 0; i < maxPages; i++) {
    const p: Page<T> = await load(cursor)
    out.push(...p.items)
    if (!p.next_cursor) break
    cursor = p.next_cursor
  }
  return out
}
