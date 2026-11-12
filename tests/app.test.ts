// The standalone page: the company mark beside the brand name in the header, one heading, the copyright in the footer, and no
// documentation link unless a deployment sets one. The brand's icons are the shared set: the app keeps none of its own.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('../src/ContentHubView.vue', () => ({ default: { template: '<p class="view">view</p>' } }))
const { default: App } = await import('../src/App.vue')

describe('App', () => {
  it('shows the company mark beside the brand name in the header, hidden from assistive technology', () => {
    const header = mount(App).get('header')
    const mark = header.get('svg.mw-brand-mark')
    expect(mark.attributes('aria-hidden')).toBe('true')
    expect(header.text()).toContain('Content hub')
  })

  it('has one page heading, the console and the copyright line, and no documentation link by default', () => {
    const w = mount(App)
    expect(w.findAll('h1').map((h) => h.text())).toEqual(['Content hub'])
    expect(w.find('main .view').exists()).toBe(true)
    expect(w.get('footer').text()).toContain('Meddleware')
    expect(w.find('footer a[href*="docs"]').exists()).toBe(false)
  })
})

describe('the brand', () => {
  it('keeps no icon of its own: the favicon set comes from the shared brand icons', () => {
    expect(existsSync('public/favicon.svg')).toBe(false)
    expect(readdirSync('public').filter((f) => /favicon|apple-touch|icon-/.test(f))).toEqual([])
    expect(readFileSync('index.html', 'utf8')).not.toMatch(/rel="(?:shortcut )?icon"|apple-touch-icon/)
  })

  it('stays out of search engines', () => {
    expect(readFileSync('index.html', 'utf8')).toMatch(/<meta name="robots" content="noindex, nofollow"/)
    expect(readFileSync('public/robots.txt', 'utf8')).toMatch(/Disallow: \//)
  })
})
