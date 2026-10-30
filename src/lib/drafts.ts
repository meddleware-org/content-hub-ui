// Unsent composer drafts, kept in this browser (localStorage) so an expired session costs no work. A draft is
// non-secret text the operator typed. Storage can be unavailable (private window, blocked, full), and anything
// found there is untrusted (another tab, an older version, tampering): reads validate the shape and drop what does
// not fit; nothing here throws.

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

export const DRAFT_KEY = 'content-hub:composer-draft:v1'
const MAX_TEXT = 100_000

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max ? v : null)

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(v)) return null
  const title = str(v.title, 300)
  const body = str(v.body, MAX_TEXT)
  const savedAt = str(v.savedAt, 40)
  if (title === null || body === null || savedAt === null) return null
  const targets = Array.isArray(v.targets) ? v.targets.filter((t): t is number => Number.isSafeInteger(t) && t > 0).slice(0, 50) : []
  const overrides: Draft['overrides'] = {}
  if (isObj(v.overrides)) {
    for (const [k, o] of Object.entries(v.overrides).slice(0, 50)) {
      if (!/^\d{1,18}$/.test(k) || !isObj(o)) continue
      const t = o.title === undefined ? undefined : str(o.title, 300)
      const b = o.body === undefined ? undefined : str(o.body, MAX_TEXT)
      if (t === null || b === null) continue
      overrides[k] = { ...(t !== undefined ? { title: t } : {}), ...(b !== undefined ? { body: b } : {}) }
    }
  }
  const postId = Number.isSafeInteger(v.postId) && (v.postId as number) > 0 ? (v.postId as number) : null
  return { title, body, targets, overrides, postId, savedAt }
}

export function loadDraft(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Draft | null {
  try {
    return parseDraft(storage?.getItem(DRAFT_KEY) ?? null)
  } catch {
    return null
  }
}

export function saveDraft(d: Draft, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify(d))
    return storage !== null
  } catch {
    return false
  }
}

export function clearDraft(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(DRAFT_KEY)
  } catch {
    /* nothing to clear */
  }
}

/** Whether a draft holds anything worth keeping. */
export const isBlank = (d: Pick<Draft, 'title' | 'body'>): boolean => d.title.trim() === '' && d.body.trim() === ''

export function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
