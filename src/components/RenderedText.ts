// The post as a reader would see it, built from the parsed tokens as DOM elements. There is no HTML string anywhere
// in this path (no `v-html`): text goes in as text, links only when their URL passes `safeHref`, so a post, a title
// or a platform reply can never inject markup or a `javascript:` link into the console.

import { defineComponent, h, type VNode, type VNodeChild } from 'vue'
import { parse } from '@meddleware/content-hub-client'
import { safeHref } from '@meddleware/ui'

function anchor(url: string, label: string): VNodeChild {
  const href = safeHref(url)
  return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label) : label
}

export function renderTokens(source: string): VNode[] {
  const paragraphs: VNodeChild[][] = [[]]
  // Open emphasis spans: their tag and the children collected so far.
  const open: Array<{ tag: 'strong' | 'em'; children: VNodeChild[] }> = []
  const into = (c: VNodeChild) => (open.length ? open[open.length - 1]!.children : paragraphs[paragraphs.length - 1]!).push(c)
  for (const { token: t } of parse(source)) {
    switch (t.kind) {
      case 'text':
        into(t.text)
        break
      case 'strongOpen':
      case 'emphOpen':
        open.push({ tag: t.kind === 'strongOpen' ? 'strong' : 'em', children: [] })
        break
      case 'strongClose':
      case 'emphClose': {
        const o = open.pop()
        if (o) into(h(o.tag, o.children))
        break
      }
      case 'code':
        into(h('code', t.text))
        break
      case 'link':
        into(anchor(t.url, t.text))
        break
      case 'url':
        into(anchor(t.url, t.url))
        break
      case 'lineBreak':
        into(h('br'))
        break
      case 'bullet':
        into('• ')
        break
      case 'paragraphBreak':
        while (open.length) {
          const o = open.pop()!
          into(h(o.tag, o.children))
        }
        paragraphs.push([])
        break
    }
  }
  while (open.length) {
    const o = open.pop()!
    into(h(o.tag, o.children))
  }
  return paragraphs.filter((p) => p.length > 0).map((p) => h('p', p))
}

export default defineComponent({
  name: 'RenderedText',
  props: { source: { type: String, required: true } },
  setup(props) {
    return () => h('div', { class: 'rendered-text' }, renderTokens(props.source))
  },
})
