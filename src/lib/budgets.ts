// Spend caps as the console shows them: the cap that applies to a scope, usage against it, and the audit trail's
// before/after lists turned into sentences. The server enforces the caps and the instance ceilings; these helpers
// only explain them.

import type { Budgets, PlatformDefinition, PlatformTarget, SpendCap } from '../api/types.js'
import { formatUsd, level } from './money.js'

export type CapKey = string

export const capKey = (scope: SpendCap['scope'], platformId: number | null, targetId: number | null): CapKey =>
  `${scope}:${platformId ?? ''}:${targetId ?? ''}`

const keyOf = (c: Pick<SpendCap, 'scope' | 'platform_definition_id' | 'platform_target_id'>) =>
  capKey(c.scope, c.platform_definition_id, c.platform_target_id)

export interface Row {
  key: CapKey
  scope: SpendCap['scope']
  label: string
  platformId: number | null
  targetId: number | null
  /** This month's usage (reservations and settlements, minus releases). */
  used: number
  /** The monthly cap that applies (the runtime row, else the instance ceiling), micro-USD. */
  cap: number
  /** The runtime row, if one exists. */
  row: SpendCap | null
  level: 0 | 50 | 80 | 100
}

/** The rows of the budgets table: the total, every platform that is enabled or has spend or a cap, and target caps. */
export function rows(b: Budgets, defs: PlatformDefinition[], targets: PlatformTarget[]): Row[] {
  const byKey = new Map(b.caps.map((c) => [keyOf(c), c]))
  const used = new Map(b.usage.map((u) => [u.platform_definition_id, u.used_usd_micros]))
  const totalUsed = [...used.values()].reduce((n, x) => n + x, 0)
  const totalCeiling = b.ceilings.total_monthly_usd_micros
  const platformCeiling = Math.min(b.ceilings.per_platform_monthly_usd_micros, totalCeiling)
  const out: Row[] = []

  const totalRow = byKey.get(capKey('total', null, null)) ?? null
  const totalCap = Math.min(totalRow?.monthly_limit_usd_micros ?? totalCeiling, totalCeiling)
  out.push({ key: capKey('total', null, null), scope: 'total', label: 'All platforms together', platformId: null, targetId: null, used: totalUsed, cap: totalCap, row: totalRow, level: level(totalUsed, totalCap) })

  for (const d of defs) {
    const r = byKey.get(capKey('platform', d.id, null)) ?? null
    const u = used.get(d.id) ?? 0
    if (!d.enabled && !r && u === 0) continue
    const cap = Math.min(r?.monthly_limit_usd_micros ?? platformCeiling, platformCeiling)
    out.push({ key: capKey('platform', d.id, null), scope: 'platform', label: d.name, platformId: d.id, targetId: null, used: u, cap, row: r, level: level(u, cap) })
  }
  for (const c of b.caps.filter((x) => x.scope === 'target')) {
    const t = targets.find((x) => x.id === c.platform_target_id)
    const u = used.get(t?.platform_definition_id ?? -1) ?? 0
    const cap = Math.min(c.monthly_limit_usd_micros, platformCeiling)
    out.push({ key: keyOf(c), scope: 'target', label: `${t?.name ?? `target #${c.platform_target_id}`} (${t?.platform_code ?? 'unknown platform'}, one target)`, platformId: null, targetId: c.platform_target_id, used: u, cap, row: c, level: level(u, cap) })
  }
  return out
}

/** What a level means, in words (so colour is never the only cue). */
export const LEVEL_TEXT: Record<0 | 50 | 80 | 100, string> = {
  0: 'under half of the cap',
  50: 'half of the cap used',
  80: 'close to the cap (80%)',
  100: 'cap reached: further paid posts are handed to a person',
}

const isCap = (v: unknown): v is SpendCap => typeof v === 'object' && v !== null && 'scope' in v && 'monthly_limit_usd_micros' in v
const asCaps = (v: unknown): SpendCap[] => (Array.isArray(v) ? v.filter(isCap) : [])

/** The changes between two cap lists, as sentences. */
export function describeChange(before: unknown, after: unknown, name: (c: SpendCap) => string): string[] {
  const b = new Map(asCaps(before).map((c) => [keyOf(c), c]))
  const a = new Map(asCaps(after).map((c) => [keyOf(c), c]))
  const lines: string[] = []
  for (const [k, n] of a) {
    const o = b.get(k)
    const daily = (c: SpendCap) => (c.daily_post_limit === null ? 'no daily limit' : `${c.daily_post_limit} posts a day`)
    if (!o) lines.push(`${name(n)}: set to ${formatUsd(n.monthly_limit_usd_micros)} a month, ${daily(n)}`)
    else if (o.monthly_limit_usd_micros !== n.monthly_limit_usd_micros || o.daily_post_limit !== n.daily_post_limit) {
      const parts: string[] = []
      if (o.monthly_limit_usd_micros !== n.monthly_limit_usd_micros) parts.push(`${formatUsd(o.monthly_limit_usd_micros)} → ${formatUsd(n.monthly_limit_usd_micros)} a month`)
      if (o.daily_post_limit !== n.daily_post_limit) parts.push(`${daily(o)} → ${daily(n)}`)
      lines.push(`${name(n)}: ${parts.join(', ')}`)
    }
  }
  for (const [k, o] of b) if (!a.has(k)) lines.push(`${name(o)}: removed`)
  return lines
}
