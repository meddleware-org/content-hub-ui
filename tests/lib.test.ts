import { describe, expect, it } from 'vitest'
import type { Budgets, PlatformDefinition, PlatformTarget, SpendCap } from '../src/api/types.js'
import { describeChange, level, percent, rows } from '../src/lib/budgets.js'
import { bands, costOf, normalise, preview, truncateWithLink, usage } from '../src/lib/composer.js'
import { DRAFT_KEY, clearDraft, isBlank, loadDraft, parseDraft, saveDraft } from '../src/lib/drafts.js'
import { itemBody, itemFields, newItem, newPhase, phaseBody, phaseFields } from '../src/lib/roadmap-form.js'
import { statusLabel, statusTone } from '../src/lib/status.js'
import { FakeApi } from './support/fake-api.js'

describe('budget levels', () => {
  it('levels follow the service: 50, 80 and 100 percent', () => {
    expect([level(0, 100), level(49, 100), level(50, 100), level(79, 100), level(80, 100), level(100, 100), level(150, 100)]).toEqual([0, 0, 50, 50, 80, 100, 100])
    expect(level(1, 0)).toBe(100)
    expect(level(0, 0)).toBe(0)
    expect(percent(1, 3)).toBe(33)
  })
})

describe('unsent drafts', () => {
  const good = { title: 'T', body: 'B', targets: [1, 2], overrides: { '2': { body: 'short' } }, postId: 7, savedAt: '2026-10-29T12:00:00Z' }

  it('round-trips through storage', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    expect(saveDraft(good, storage)).toBe(true)
    expect(loadDraft(storage)).toEqual(good)
    clearDraft(storage)
    expect(loadDraft(storage)).toBeNull()
  })

  it('distrusts what it finds', () => {
    expect(parseDraft(null)).toBeNull()
    for (const bad of ['{', '[]', '"x"', JSON.stringify({ ...good, title: 5 }), JSON.stringify({ ...good, body: 'x'.repeat(100_001) }), JSON.stringify({ title: 'T' })]) {
      expect(parseDraft(bad), bad.slice(0, 30)).toBeNull()
    }
    const tampered = parseDraft(JSON.stringify({ ...good, targets: [1, -2, 'x', 3.5, 4], overrides: { '2': { body: 'ok', title: 9 }, evil: { body: 'x' }, '3': 'no' }, postId: 'x' }))
    expect(tampered?.targets).toEqual([1, 4])
    expect(tampered?.overrides).toEqual({})
    expect(tampered?.postId).toBeNull()
  })

  it('never throws when storage is unavailable', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('full') }, removeItem: () => { throw new Error('blocked') } }
    expect(loadDraft(broken)).toBeNull()
    expect(saveDraft(good, broken)).toBe(false)
    expect(() => clearDraft(broken)).not.toThrow()
    expect(saveDraft(good, null)).toBe(false)
    expect(DRAFT_KEY).toContain('draft')
    expect(isBlank({ title: ' ', body: '' })).toBe(true)
  })
})

// ── spend caps ──────────────────────────────────────────────────────────────────────────────────────────────
function budgets(over: Partial<Budgets> = {}): Budgets {
  return { ceilings: { total_monthly_usd_micros: 5_000_000, per_platform_monthly_usd_micros: 2_000_000 }, caps: [], usage: [], ...over }
}
const cap = (c: Partial<SpendCap>): SpendCap => ({ id: 1, scope: 'platform', platform_definition_id: 4, platform_target_id: null, monthly_limit_usd_micros: 1_000_000, daily_post_limit: null, updated_by: 'op', updated_at: '', ...c })

describe('budget rows and the audit trail', () => {
  const api = new FakeApi()
  const defs = api.definitions as PlatformDefinition[]
  const targets = api.targets as PlatformTarget[]

  it('shows the cap that applies: the runtime row, else the ceiling', () => {
    const r = rows(budgets({ caps: [cap({ monthly_limit_usd_micros: 500_000 })], usage: [{ platform_definition_id: 4, used_usd_micros: 400_000 }] }), defs, targets)
    expect(r[0]!.label).toBe('All platforms together')
    expect(r[0]!.cap).toBe(5_000_000)
    expect(r[0]!.used).toBe(400_000)
    const x = r.find((row) => row.platformId === 4)!
    expect([x.cap, x.used, x.level]).toEqual([500_000, 400_000, 80])
    const mastodon = r.find((row) => row.platformId === 2)!
    expect([mastodon.cap, mastodon.row]).toEqual([2_000_000, null]) // per-platform ceiling, no row
  })

  it('never lets a stored cap look larger than the ceiling', () => {
    const r = rows(budgets({ caps: [cap({ monthly_limit_usd_micros: 9_000_000 })] }), defs, targets)
    expect(r.find((row) => row.platformId === 4)!.cap).toBe(2_000_000)
  })

  it('describes changes as sentences', () => {
    const name = (c: SpendCap) => (c.scope === 'total' ? 'All' : `platform ${c.platform_definition_id}`)
    expect(describeChange([], [cap({})], name)).toEqual(['platform 4: set to $1.00 a month, no daily limit'])
    expect(describeChange([cap({})], [cap({ monthly_limit_usd_micros: 250_000, daily_post_limit: 3 })], name)).toEqual([
      'platform 4: $1.00 → $0.25 a month, no daily limit → 3 posts a day',
    ])
    expect(describeChange([cap({})], [], name)).toEqual(['platform 4: removed'])
    expect(describeChange([cap({})], [cap({})], name)).toEqual([])
    expect(describeChange('garbage', null, name)).toEqual([])
  })
})

// ── the composer's arithmetic ───────────────────────────────────────────────────────────────────────────────
describe('composer previews', () => {
  const api = new FakeApi()
  const byCode = (code: string) => {
    const d = api.definitions.find((x) => x.code === code)!
    return { d, t: api.targets.find((x) => x.platform_definition_id === d.id)! }
  }

  it('counts each platform in its own unit and says whether it fits', () => {
    const { d, t } = byCode('BLUESKY')
    const ok = preview(t, d, 'T', 'a'.repeat(300))
    expect([ok.fits, ok.check!.counted, ok.check!.limit]).toEqual([true, 300, 300])
    const over = preview(t, d, 'T', 'a'.repeat(301))
    expect(over.fits).toBe(false)
    expect(usage(over)).toEqual({ used: 301, limit: 300, unit: 'characters' })
    // Bluesky also caps 3000 bytes: 280 woman-technologist sequences are 280 graphemes (under 300) but 3080 bytes.
    const heavy = preview(t, d, 'T', '👩‍💻'.repeat(280))
    expect([heavy.check!.counted, heavy.check!.bytes, heavy.fits]).toEqual([280, 3080, false])
    expect(preview(t, d, 'T', '😀'.repeat(250)).fits).toBe(true)
  })

  it('weights links on X and applies the instance limits cached on a Mastodon target', () => {
    const x = byCode('X')
    expect(preview(x.t, x.d, 'T', 'see https://example.org/a/very/long/path?with=query').check!.counted).toBe(4 + 23)
    const m = byCode('MASTODON')
    const limited = { ...m.t, config: { instance_limits: { max_characters: 20, characters_reserved_per_url: 30 } } }
    const p = preview(limited, m.d, 'T', 'see https://example.org/x')
    expect([p.check!.counted, p.check!.limit, p.fits]).toEqual([34, 20, false])
  })

  it('estimates cost, with the price of a link where the platform has one', () => {
    const x = byCode('X')
    expect(preview(x.t, x.d, 'T', 'no link').costMicros).toBe(15_000)
    expect(preview(x.t, x.d, 'T', 'a link https://example.org').costMicros).toBe(200_000)
    expect(preview(byCode('MASTODON').t, byCode('MASTODON').d, 'T', 'free').costMicros).toBe(0)
    expect(costOf({ per_post_usd_micros: -5 }, false)).toBe(0)
    expect(costOf({}, true)).toBe(0)
  })

  it('uses an override instead of the shared text, with line endings normalised', () => {
    const { d, t } = byCode('BLUESKY')
    const p = preview(t, d, 'Shared', 'a'.repeat(400), { body: 'short\r\ntext', title: 'Own title' })
    expect([p.overridden, p.body, p.title, p.fits]).toEqual([true, 'short\ntext', 'Own title', true])
    expect(normalise('a\r\nb\rc')).toBe('a\nb\nc')
  })

  it('segments the shared text across the targets that use it', () => {
    const b = byCode('BLUESKY')
    const x = byCode('X')
    const previews = [preview(b.t, b.d, 'T', 'a'.repeat(500)), preview(x.t, x.d, 'T', 'a'.repeat(500))]
    const seg = bands(previews, 'a'.repeat(500))
    expect(seg.length).toBe(500)
    expect(seg.bands.map((s) => [s.start, s.end, s.fits.length])).toEqual([[0, 280, 2], [280, 300, 1], [300, 500, 0]])
    // An overridden target leaves the shared bar.
    const withOverride = [preview(b.t, b.d, 'T', 'a'.repeat(500), { body: 'own' }), previews[1]!]
    expect(bands(withOverride, 'a'.repeat(500)).bands.map((s) => [s.start, s.end, s.fits.length])).toEqual([[0, 280, 1], [280, 500, 0]])
  })

  it('shortens text with an ellipsis and a link so the result itself fits', () => {
    const { d, t } = byCode('BLUESKY')
    const limits = preview(t, d, 'T', '').limits!
    const text = 'word '.repeat(100)
    const cut = truncateWithLink(text, 'https://example.org/post', 'plain', limits)!
    expect(cut.endsWith('… https://example.org/post')).toBe(true)
    expect(preview(t, d, 'T', cut).fits).toBe(true)
    // It keeps as much as fits: one more word would not.
    expect(preview(t, d, 'T', cut.replace('… https', ' word… https')).fits).toBe(false)
    // A link that cannot fit at all is reported, not forced.
    expect(truncateWithLink('x', 'https://example.org/' + 'a'.repeat(400), 'plain', limits)).toBeNull()
  })

  it('never cuts inside a link', () => {
    const { d, t } = byCode('BLUESKY')
    const limits = { ...preview(t, d, 'T', '').limits!, primary: 60 }
    const cut = truncateWithLink('Read https://example.org/a/long/link/that/is/atomic and more words follow', 'https://x.org/p', 'plain', limits)!
    expect(cut).not.toMatch(/example\.org\/a\/long\/link\/that\/is\/ato[^m]/)
  })
})

describe('status words and tones', () => {
  it('says a status in words, with the tone the badge shows it in', () => {
    expect(statusLabel('in_progress')).toBe('in progress')
    expect(statusLabel('manual_required')).toBe('manual')
    expect(statusLabel('a_b_c')).toBe('a b c')
    expect([statusTone('posted'), statusTone('queued'), statusTone('failed'), statusTone('something-new')]).toEqual(['ok', 'warn', 'danger', 'neutral'])
  })
})

describe('roadmap forms', () => {
  const phase = { id: 1, key: 'p1', sort_order: 2, internal_name: 'Internal', internal_description: 'd', public_name: 'Public', public_description: 'pd', window_start: null, window_end: '2027-01-01T00:00:00Z', visible_human: true, visible_bot: false } as never
  it('fills a form from a stored phase and makes the request body from the form', () => {
    const f = phaseFields(phase)
    expect(f).toMatchObject({ key: 'p1', sort_order: '2', internal_name: 'Internal', window_end: '2027-01-01T00:00:00Z' })
    expect(phaseBody({ ...f, key: '  p1  ', sort_order: '3' })).toMatchObject({ key: 'p1', sort_order: 3, visible_human: true })
    expect(newPhase(5)).toMatchObject({ sort_order: '5', key: '', visible_human: false, visible_bot: false })
  })

  it('sends an empty public title or description as null, never as an empty string', () => {
    const item = { id: 1, phase_id: 4, key: 'i1', item_type: 'other', internal_title: 'T', internal_description: '', public_title: null, public_description: null, visible_human: false, visible_bot: false, status: 'planned', planned_at: null, due_at: null, public_due_at: null } as never
    const f = itemFields(item)
    expect(f).toMatchObject({ phase_id: '4', public_title: '', public_description: '' })
    expect(itemBody(f)).toMatchObject({ phase_id: 4, public_title: null, public_description: null })
    expect(itemBody({ ...f, public_title: ' A title ' }).public_title).toBe('A title')
    expect(newItem('7')).toMatchObject({ phase_id: '7', status: 'planned', item_type: 'other' })
  })
})
