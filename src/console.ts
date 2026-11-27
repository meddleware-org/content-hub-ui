// The console's shared context: the HTTP wrapper, who is signed in, whether the session ended, the display time
// zone, and the platform/target reference data most sections need. Provided once by ContentHubView; every section
// reads it with `useConsole()`.

// Vue's reactivity and dependency injection: the console is provided once and every section injects it.
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
// The HTTP wrapper and its type.
import { createHttp, type Http } from './api/http.js'
// The shapes this module handles.
import type { Me, Page, PlatformDefinition, PlatformTarget } from './api/types.js'
// The browser's time zone, a zone-name check, and storage that falls back safely when it is blocked.
import { browserZone, isZone, safePath, safeStorage } from '@meddleware/web-utils'
// The custom header every state-changing request carries.
import { CSRF_HEADER } from '@meddleware/content-hub-client'

/** The reference data most sections need. */
export interface Reference {
  definitions: PlatformDefinition[]
  targets: PlatformTarget[]
}

/** What a test or an embedding can inject. */
export interface ConsoleOptions {
  /** Injected for tests and embedding; defaults to the global `fetch`. */
  fetch?: typeof fetch
  /** What "sign in again" does; defaults to opening the sign-in the service named (the platform's identity provider), else reloading the page at top level so the access gateway re-authenticates. */
  reload?: () => void
  /** Where the browser goes after sign-out (the provider's logout address); defaults to navigating the top window. */
  navigate?: (url: string) => void
}

/** Everything a section may use: HTTP, the signed-in person, the end-of-session flag, the display zone and the reference data. */
export interface ConsoleContext {
  http: Http
  me: Ref<Me | null>
  /** True once any request found the session ended. */
  expired: Ref<boolean>
  /** Where a new sign-in starts (an /auth/ path), once a request has learnt it from the service. */
  signInPath: Ref<string | null>
  /** End the session of an `oidc` sign-in and send the browser to the provider's logout; `signOutError` says why it did not work. */
  signOut: () => Promise<void>
  /** A sentence about a failed sign-out, or null. */
  signOutError: Ref<string | null>
  /** The IANA zone times are shown and edited in. */
  zone: Ref<string>
  setZone: (tz: string) => void
  reload: () => void
  reference: Ref<Reference | null>
  loadReference: (force?: boolean) => Promise<Reference>
}

// The injection key for the console context.
const KEY: InjectionKey<ConsoleContext> = Symbol('content-hub-console')
// The one storage key: the display time zone, written only when the person chooses one.
const ZONE_KEY = 'content-hub:zone:v1'

/** The access gateway's sign-out path on this host (it clears the session cookie and returns to sign-in). */
export const SIGN_OUT_PATH = '/cdn-cgi/access/logout'

/** Open an address in the top window (the console may run inside a frame); a cross-origin parent is refused, so this window is used then. */
function topLevelNavigate(url: string): void {
  try {
    // Embedded in a frame: move the frame's parent.
    if (window.top && window.top !== window) window.top.location.assign(url)
    else window.location.assign(url)
  // A cross-origin parent refuses access: move this window instead.
  } catch {
    window.location.assign(url)
  }
}

/** "Sign in again" at the access gateway: reload the top window so it re-authenticates (the console may run inside a frame). */
function topLevelReload(): void {
  try {
    // Embedded in a frame: reload the frame's parent.
    if (window.top && window.top !== window) window.top.location.reload()
    else window.location.reload()
  // A cross-origin parent refuses access: reload this window instead.
  } catch {
    window.location.reload()
  }
}

/** The zone to start with: the saved choice if it is a real zone, otherwise the browser's own. */
function initialZone(): string {
  try {
    // A saved choice, if storage works.
    const saved = safeStorage()?.getItem(ZONE_KEY)
    if (saved && isZone(saved)) return saved
  } catch {
    /* fall through to the browser's zone */
  }
  // No usable saved choice: use the browser's zone.
  return browserZone()
}

/** Create the console context: HTTP wired to the end-of-session flag, the signed-in person, the display zone and the cached reference data. */
export function createConsole(opts: ConsoleOptions = {}): ConsoleContext {
  // True once any request found the session ended.
  const expired = ref(false)
  // Who is signed in; set by the view once it has asked.
  const me = ref<Me | null>(null)
  // The display zone.
  const zone = ref(initialZone())
  // The platform and target lists most sections need.
  const reference = ref<Reference | null>(null)
  // Where a sign-in starts, when the service said so with its 401.
  const signInPath = ref<string | null>(null)
  // A failed sign-out, in words.
  const signOutError = ref<string | null>(null)
  // The HTTP wrapper; its end-of-session callback sets the flag the banner reads and remembers where to sign in again.
  const http = createHttp({
    fetch: opts.fetch,
    onSessionExpired: (signIn) => {
      expired.value = true
      if (signIn) signInPath.value = signIn
    },
  })
  // Where the browser goes next (replaceable in tests).
  const navigate = opts.navigate ?? topLevelNavigate
  // The reference load in flight, so concurrent callers share one.
  let pending: Promise<Reference> | null = null

  /** The reference data: cached, shared while loading, and refetched when forced. */
  async function loadReference(force = false): Promise<Reference> {
    // Already loaded and not forced: reuse it.
    if (reference.value && !force) return reference.value
    // Start a load only when none is in flight; read definitions and targets together.
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
    // Change the display zone and remember the choice.
    setZone(tz) {
      // Ignore a value that is not a real zone.
      if (!isZone(tz)) return
      // Show times in the new zone at once.
      zone.value = tz
      try {
        // Remember it on this device (a person's own choice; nothing is stored before they make one).
        safeStorage()?.setItem(ZONE_KEY, tz)
      } catch {
        /* the choice just is not remembered */
      }
    },
    signInPath,
    signOutError,
    // End the session at the console (the CSRF header and same-origin cookie), then open the provider's logout address the answer names.
    async signOut() {
      signOutError.value = null
      try {
        // The same-origin sign-out route of the service (not under the admin prefix).
        const res = await (opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a)))('/auth/logout', {
          method: 'POST',
          headers: { accept: 'application/json', [CSRF_HEADER]: '1' },
          credentials: 'same-origin',
          cache: 'no-store',
        })
        // The answer names where to go; only an https address or a same-site path is followed.
        const next = ((await res.json().catch(() => null)) as { redirect?: unknown } | null)?.redirect
        if (!res.ok || typeof next !== 'string' || !(next.startsWith('https://') || safePath(next))) throw new Error('sign-out refused')
        navigate(next)
      } catch {
        signOutError.value = 'Could not sign out. Try again, or close this window.'
      }
    },
    // What "sign in again" does: open the sign-in the service named, else (the access gateway) reload the page.
    reload: opts.reload ?? (() => (signInPath.value ? navigate(signInPath.value) : topLevelReload())),
    reference,
    loadReference,
  }
}

/** Provide the context to every section below the view. */
export function provideConsole(c: ConsoleContext): void {
  provide(KEY, c)
}

/** The console context; throws when used outside the view. */
export function useConsole(): ConsoleContext {
  // The context, if a view provided one.
  const c = inject(KEY)
  // Using a section outside the view is a programming error, so fail loudly.
  if (!c) throw new Error('useConsole() outside ContentHubView')
  return c
}

/** Fetch every page of a small list (reference data), newest first, up to a safety bound. */
export async function allPages<T>(load: (cursor: string | null) => Promise<Page<T>>, maxPages = 20): Promise<T[]> {
  // The rows collected across pages.
  const out: T[] = []
  // The cursor of the next page (null for the first).
  let cursor: string | null = null
  // Bounded, so a misbehaving cursor cannot loop forever.
  for (let i = 0; i < maxPages; i++) {
    // One page.
    const p: Page<T> = await load(cursor)
    out.push(...p.items)
    // The last page.
    if (!p.next_cursor) break
    cursor = p.next_cursor
  }
  return out
}
