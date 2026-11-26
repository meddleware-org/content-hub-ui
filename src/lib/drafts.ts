// Unsent composer drafts, kept in this browser (localStorage) so an expired session costs no work. A draft is
// non-secret text the operator typed. Storage can be unavailable (private window, blocked, full), and anything
// found there is untrusted (another tab, an older version, tampering): reads validate the shape and drop what does
// not fit; nothing here throws.

// `isObj` and `str` validate untrusted JSON; `safeStorage` is storage that falls back safely when it is blocked.
import { isObj, safeStorage, str } from '@meddleware/web-utils'

/** An unsent composer draft: the shared text, the selected targets and per-target overrides. */
export interface Draft {
  title: string
  body: string
  /** Selected target ids. */
  targets: number[]
  overrides: Record<string, { title?: string; body?: string }>
  /** The post this draft belongs to, once it was saved on the server. */
  postId: number | null
  savedAt: string
}

/** The one storage key; written only while the operator edits a draft. */
export const DRAFT_KEY = 'content-hub:composer-draft:v1'
// The longest text kept, so a tampered draft cannot fill the storage.
const MAX_TEXT = 100_000

/** Validate a stored draft: anything that does not fit the shape is dropped (it is untrusted). */
export function parseDraft(raw: string | null): Draft | null {
  // Nothing stored.
  if (!raw) return null
  // The parsed value, untrusted.
  let v: unknown
  try {
    // Parse; a stored value that is not JSON is dropped.
    v = JSON.parse(raw)
  } catch {
    return null
  }
  // It must be an object.
  if (!isObj(v)) return null
  // The title and body must be strings within bounds.
  const title = str(v.title, 300)
  const body = str(v.body, MAX_TEXT)
  // When it was saved.
  const savedAt = str(v.savedAt, 40)
  // Any missing or oversized field discards the whole draft.
  if (title === null || body === null || savedAt === null) return null
  // The selected targets: positive whole numbers, at most fifty.
  const targets = Array.isArray(v.targets) ? v.targets.filter((t): t is number => Number.isSafeInteger(t) && t > 0).slice(0, 50) : []
  // Per-target overrides, validated one by one.
  const overrides: Draft['overrides'] = {}
  if (isObj(v.overrides)) {
    // At most fifty, each keyed by a target id.
    for (const [k, o] of Object.entries(v.overrides).slice(0, 50)) {
      // A key must be a target id and its value an object.
      if (!/^\d{1,18}$/.test(k) || !isObj(o)) continue
      // An override's title and body, each optional but bounded.
      const t = o.title === undefined ? undefined : str(o.title, 300)
      const b = o.body === undefined ? undefined : str(o.body, MAX_TEXT)
      // An override with a bad field is skipped, not the whole draft.
      if (t === null || b === null) continue
      overrides[k] = { ...(t !== undefined ? { title: t } : {}), ...(b !== undefined ? { body: b } : {}) }
    }
  }
  // The server-side post this draft belongs to, if it was saved there.
  const postId = Number.isSafeInteger(v.postId) && (v.postId as number) > 0 ? (v.postId as number) : null
  // The validated draft.
  return { title, body, targets, overrides, postId, savedAt }
}

/** The saved draft, or null; never throws. */
export function loadDraft(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Draft | null {
  try {
    // Read and validate; nothing here throws.
    return parseDraft(storage?.getItem(DRAFT_KEY) ?? null)
  } catch {
    return null
  }
}

/** Save a draft; returns false when storage is unavailable or full. */
export function saveDraft(d: Draft, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    // Write the draft; the operator typed it, so this is their action.
    storage?.setItem(DRAFT_KEY, JSON.stringify(d))
    // False when there was no storage to write to.
    return storage !== null
  } catch {
    return false
  }
}

/** Remove the saved draft. */
export function clearDraft(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    // Forget the draft (it was sent or discarded).
    storage?.removeItem(DRAFT_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Whether a draft holds anything worth keeping. */
export const isBlank = (d: Pick<Draft, 'title' | 'body'>): boolean => d.title.trim() === '' && d.body.trim() === ''
