// Time zones. Everything is stored and exchanged in UTC; the console shows and edits wall-clock time in the zone the
// operator chose (default: the browser's). `datetime-local` inputs carry a wall time with no zone, so conversion in
// both directions goes through the chosen zone with Intl only (no library).

const cache = new Map<string, Intl.DateTimeFormat>()

function parts(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    cache.set(tz, f)
  }
  return f
}

/** Whether the browser knows this IANA zone. */
export function isZone(tz: string): boolean {
  try {
    parts(tz)
    return true
  } catch {
    return false
  }
}

export const browserZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The zone's offset from UTC at an instant, in minutes (positive east of Greenwich). */
export function offsetMinutes(ms: number, tz: string): number {
  const p = Object.fromEntries(parts(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

/** `YYYY-MM-DDTHH:mm` (a `datetime-local` value) for an instant, as a wall time in the zone. */
export function toLocalInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const p = Object.fromEntries(parts(tz).formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/**
 * The UTC instant (ISO 8601) of a wall time in a zone, or `null` when the input is empty or invalid. A wall time that
 * does not exist (the hour skipped at a spring-forward) moves forward by the gap; an ambiguous one (the repeated
 * hour in autumn) takes the first occurrence.
 */
export function fromLocalInput(value: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number]
  const wall = Date.UTC(y, mo - 1, d, h, mi)
  if (Number.isNaN(wall) || new Date(wall).getUTCMonth() !== mo - 1) return null
  const day = 24 * 3600 * 1000
  const before = offsetMinutes(wall - day, tz)
  const after = offsetMinutes(wall + day, tz)
  // Instants whose wall time in the zone is exactly this one: one normally, two in the repeated hour, none in a gap.
  const valid = [...new Set([before, after])].map((o) => wall - o * 60000).filter((t) => wall - t === offsetMinutes(t, tz) * 60000)
  const at = valid.length > 0 ? Math.min(...valid) : wall - before * 60000
  return new Date(at).toISOString()
}

/** A readable date and time in the zone, with the zone's name (`29 Oct 2026, 14:05 BST`). */
export function formatDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—'
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).format(new Date(ms))
}

/** The calendar day of an instant in the zone, as `YYYY-MM-DD`. */
export function dayKey(iso: string, tz: string): string {
  return toLocalInput(iso, tz).slice(0, 10)
}
