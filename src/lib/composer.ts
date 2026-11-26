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
// The platform and target shapes.
import type { PlatformDefinition, PlatformTarget } from '../api/types.js'

/** What the operator wrote for one target instead of the shared post. */
/** What the operator wrote for one target instead of the shared post. */
export interface Override {
  title?: string
  body?: string
}

/** How a post would be sent to one target: the text used, the check against its limits, the payload and the cost. */
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
/** The per-post cost of a platform in micro-USD; a post with a link can cost more (X). */
export function costOf(costModel: Record<string, unknown>, hasUrl: boolean): number {
  // A number from the cost model: a positive finite value truncated to an integer, otherwise zero.
  const n = (k: string) => {
    const v = costModel[k]
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.trunc(v) : 0
  }
  // A post with a link can cost more on some platforms; the dearer figure applies.
  return hasUrl ? Math.max(n('per_post_with_url_usd_micros'), n('per_post_usd_micros')) : n('per_post_usd_micros')
}

/** The limits that apply to a target: its platform's, adjusted by the target's own settings. */
export function targetLimits(target: PlatformTarget, def: PlatformDefinition): Limits | null {
  // The platform's own limits, from its counting method and limits.
  const base = limitsFromDefinition({
    counting_method: def.counting_method,
    primary_limit: def.primary_limit,
    secondary_limits: def.secondary_limits,
  })
  // A target may tighten or relax them (a server with its own limit).
  return limitsForTarget(base, def.secondary_limits, target.config)
}

/** The same newline normalisation the server applies. */
export const normalise = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

/** Preview a post for one target: apply an override, count against the limits, render the payload and estimate the cost. The server re-checks everything. */
export function preview(target: PlatformTarget, def: PlatformDefinition, title: string, body: string, o?: Override): TargetPreview {
  // The target's own title if it has one, else the shared one.
  const useTitle = o?.title?.trim() ? o.title : title
  // The target's own body if it has one, else the shared one; newlines are normalised as the server does.
  const useBody = normalise(o?.body !== undefined && o.body !== '' ? o.body : body)
  // The limits that apply to this target.
  const limits = targetLimits(target, def)
  // The markup the platform accepts.
  const markup = def.markup
  // Count and check the text against the limits, when there are any.
  const c = limits ? check(markup, limits, useTitle, useBody) : null
  // The rendered payload: what would be sent.
  const payload = c ? c.payload : renderPayload(markup, useBody)
  // A link in the payload can change the cost.
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

/** Render `body` as the platform would receive it when no limit applies. */
function renderPayload(markup: Markup, body: string): string {
  // Without limits there is nothing to count; the payload is still what the platform would receive.
  // Without limits nothing is counted; a placeholder rule is enough to render.
  const limits: Limits = { rules: { method: 'codepoints' }, primary: null }
  return check(markup, limits, null, body).payload
}

/** The shared text's segmentation across the targets that use it (no override) and have a limit. */
export function bands(previews: TargetPreview[], source: string): { bands: Band[]; length: number } {
  // The targets that share the text (no override) and have a limit.
  const targets = previews
    .filter((p) => !p.overridden && p.limits !== null)
    .map((p) => ({ id: String(p.target.id), markup: p.markup, limits: p.limits! }))
  // The text's length in code points.
  const length = Array.from(source).length
  // No target to segment for: one band over the whole text, or none when it is empty.
  if (targets.length === 0) return { bands: length > 0 ? [{ start: 0, end: length, fits: [] }] : [], length }
  return { bands: segment(source, targets).bands, length }
}

/**
 * The text cut so that `…` and a link still fit the target (itself rendered and counted), or `null` when even the
 * link alone does not fit. Cuts fall on grapheme boundaries and never inside a link.
 */
export function truncateWithLink(source: string, url: string, markup: Markup, limits: Limits): string | null {
  // The text as code points, so a cut never splits a character.
  const cps = Array.from(source)
  // The spans that must never be cut: links and bare addresses.
  const atomic = parse(source)
    .filter((t) => t.token.kind === 'link' || t.token.kind === 'url')
    .map((t) => [t.start, t.end] as const)
  // The positions a cut may fall on.
  const cuts = [0]
  // The position, counted in code points.
  let pos = 0
  // Walk the grapheme clusters, so a cut never falls inside an emoji or an accent.
  for (const g of graphemes(source)) {
    pos += Array.from(g).length
    // A cut is allowed unless it falls inside a link.
    if (!atomic.some(([s, e]) => s < pos && pos < e)) cuts.push(pos)
  }
  // The text cut at `n` code points, an ellipsis and the link.
  const build = (n: number) => `${cps.slice(0, n).join('').trimEnd()}… ${url}`
  // Even the link alone does not fit.
  if (!fits(markup, limits, build(0))) return null
  // A binary search between the shortest and the longest cut.
  let lo = 0
  let hi = cuts.length - 1
  // The whole text already fits with the link: no cut needed.
  if (fits(markup, limits, build(cuts[hi]!))) return build(cuts[hi]!)
  // Narrow in on the longest cut that fits.
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
  // The unit the platform counts in, in words.
  const unit = { x_weighted: 'weighted characters', graphemes: 'characters', utf16: 'UTF-16 units', codepoints: 'code points', bytes: 'bytes' }[
    p.limits!.rules.method
  ]
  return { used: p.check.counted, limit: p.check.limit, unit }
}
