// The composer's arithmetic: how a post renders on each selected target, whether it fits, what it would cost, and
// where each platform's limit falls in the text. All of it uses @meddleware/content-hub-client, which the service's
// golden vectors keep identical to the server's Rust implementation. These are PREVIEWS: enqueue re-checks everything
// on the server, and the server's answer is the one that counts.

import {
  check,
  fits,
  graphemes,
  limitsForTarget,
  limitsFromDefinition,
  parse,
  segment,
  type Band,
  type Check,
  type Limits,
  type Markup,
  type PostingMode,
} from '@meddleware/content-hub-client'
import type { PlatformDefinition, PlatformTarget } from '../api/types.js'

/** What the operator wrote for one target instead of the shared post. */
export interface Override {
  title?: string
  body?: string
}

export interface TargetPreview {
  target: PlatformTarget
  def: PlatformDefinition
  markup: Markup
  mode: PostingMode
  /** The limits that apply to this target (null: the platform has none to check). */
  limits: Limits | null
  /** Title and body actually used (the override, or the shared post). */
  title: string
  body: string
  overridden: boolean
  /** The check of that text (null without limits). */
  check: Check | null
  /** The rendered payload (what would be sent). */
  payload: string
  fits: boolean
  hasUrl: boolean
  /** Estimated cost in micro-USD (0 for free platforms). */
  costMicros: number
}

/** The per-post cost of a platform in micro-USD; a post with a link can cost more (X). */
export function costOf(costModel: Record<string, unknown>, hasUrl: boolean): number {
  const n = (k: string) => {
    const v = costModel[k]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0
  }
  return hasUrl ? Math.max(n('per_post_with_url_usd_micros'), n('per_post_usd_micros')) : n('per_post_usd_micros')
}

export function targetLimits(target: PlatformTarget, def: PlatformDefinition): Limits | null {
  const base = limitsFromDefinition({
    counting_method: def.counting_method,
    primary_limit: def.primary_limit,
    secondary_limits: def.secondary_limits,
  })
  return limitsForTarget(base, def.secondary_limits, target.config)
}

/** The same newline normalisation the server applies. */
export const normalise = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

export function preview(target: PlatformTarget, def: PlatformDefinition, title: string, body: string, o?: Override): TargetPreview {
  const useTitle = o?.title?.trim() ? o.title : title
  const useBody = normalise(o?.body !== undefined && o.body !== '' ? o.body : body)
  const limits = targetLimits(target, def)
  const markup = def.markup
  const c = limits ? check(markup, limits, useTitle, useBody) : null
  const payload = c ? c.payload : renderPayload(markup, useBody)
  const hasUrl = /https?:\/\//.test(payload)
  return {
    target,
    def,
    markup,
    mode: def.posting_mode,
    limits,
    title: useTitle,
    body: useBody,
    overridden: Boolean(o && (o.title?.trim() || (o.body !== undefined && o.body !== ''))),
    check: c,
    payload,
    fits: c ? c.fits : true,
    hasUrl,
    costMicros: costOf(def.cost_model, hasUrl),
  }
}

function renderPayload(markup: Markup, body: string): string {
  // Without limits there is nothing to count; the payload is still what the platform would receive.
  const limits: Limits = { rules: { method: 'codepoints' }, primary: null }
  return check(markup, limits, null, body).payload
}

/** The shared text's segmentation across the targets that use it (no override) and have a limit. */
export function bands(previews: TargetPreview[], source: string): { bands: Band[]; length: number } {
  const targets = previews
    .filter((p) => !p.overridden && p.limits !== null)
    .map((p) => ({ id: String(p.target.id), markup: p.markup, limits: p.limits! }))
  const length = Array.from(source).length
  if (targets.length === 0) return { bands: length > 0 ? [{ start: 0, end: length, fits: [] }] : [], length }
  return { bands: segment(source, targets).bands, length }
}

/**
 * The text cut so that `…` and a link still fit the target (itself rendered and counted), or `null` when even the
 * link alone does not fit. Cuts fall on grapheme boundaries and never inside a link.
 */
export function truncateWithLink(source: string, url: string, markup: Markup, limits: Limits): string | null {
  const cps = Array.from(source)
  const atomic = parse(source)
    .filter((t) => t.token.kind === 'link' || t.token.kind === 'url')
    .map((t) => [t.start, t.end] as const)
  const cuts = [0]
  let pos = 0
  for (const g of graphemes(source)) {
    pos += Array.from(g).length
    if (!atomic.some(([s, e]) => s < pos && pos < e)) cuts.push(pos)
  }
  const build = (n: number) => `${cps.slice(0, n).join('').trimEnd()}… ${url}`
  if (!fits(markup, limits, build(0))) return null
  let lo = 0
  let hi = cuts.length - 1
  if (fits(markup, limits, build(cuts[hi]!))) return build(cuts[hi]!)
  while (lo + 1 < hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (fits(markup, limits, build(cuts[mid]!))) lo = mid
    else hi = mid
  }
  return build(cuts[lo]!)
}

/** `used / limit` for display, in the platform's own unit. */
export function usage(p: TargetPreview): { used: number; limit: number | null; unit: string } | null {
  if (!p.check) return null
  const unit = { x_weighted: 'weighted characters', graphemes: 'characters', utf16: 'UTF-16 units', codepoints: 'code points', bytes: 'bytes' }[
    p.limits!.rules.method
  ]
  return { used: p.check.counted, limit: p.check.limit, unit }
}
