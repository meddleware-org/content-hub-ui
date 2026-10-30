// Spend is stored in micro-US-dollars (1 USD = 1 000 000). Conversion is done on the decimal string, never through
// floating point, so $0.015 is exactly 15 000.

/** `15000` → `$0.015`; trailing zeros are dropped but at least two decimals are kept. */
export function formatUsd(micros: number): string {
  const sign = micros < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(micros))
  const whole = Math.floor(abs / 1_000_000)
  let frac = String(abs % 1_000_000).padStart(6, '0').replace(/0+$/, '')
  if (frac.length < 2) frac = frac.padEnd(2, '0')
  return `${sign}$${whole.toLocaleString('en-GB')}.${frac}`
}

/** `"0.015"` → `15000`; `null` when the text is not a non-negative amount with at most six decimals. */
export function parseUsd(text: string): number | null {
  const m = /^\s*\$?(\d{1,9})(?:\.(\d{1,6}))?\s*$/.exec(text)
  if (!m) return null
  const micros = Number(m[1]) * 1_000_000 + Number((m[2] ?? '').padEnd(6, '0'))
  return Number.isSafeInteger(micros) ? micros : null
}

/** The share of a cap used, as a whole percent (a cap of 0 with any use is 100). */
export function percent(used: number, cap: number): number {
  if (used <= 0) return 0
  if (cap <= 0) return 100
  return Math.min(100, Math.floor((used * 100) / cap))
}

/** The alert level the service reports at: 0, 50, 80 or 100. */
export function level(used: number, cap: number): 0 | 50 | 80 | 100 {
  const p = percent(used, cap)
  return p >= 100 ? 100 : p >= 80 ? 80 : p >= 50 ? 50 : 0
}
