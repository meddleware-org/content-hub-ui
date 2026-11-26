// The post as a reader would see it, built from the parsed tokens as DOM elements. There is no HTML string anywhere
// in this path (no `v-html`): text goes in as text, links only when their URL passes `safeHref`, so a post, a title
// or a platform reply can never inject markup or a `javascript:` link into the console.

// Vue's render-function helpers: nodes are built as elements, never from an HTML string.
import { defineComponent, h, type VNode, type VNodeChild } from 'vue'
// The parser that turns the post into tokens (the same one the service's golden vectors check).
import { parse } from '@meddleware/content-hub-client'
// Accepts only addresses that are safe to link (no `javascript:`).
import { safeHref } from '@meddleware/ui'

/** A link element when `url` is safe; otherwise just the label, as text. */
function anchor(url: string, label: string): VNodeChild {
  const href = safeHref(url)
  return href ? h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label) : label
}

/** Render a post's Markdown subset as paragraph elements built from the parsed tokens (no HTML string anywhere). */
export function renderTokens(source: string): VNode[] {
  // The paragraphs built so far; the last is the one being filled.
  const paragraphs: VNodeChild[][] = [[]]
  // Open emphasis spans: their tag and the children collected so far.
  const open: Array<{ tag: 'strong' | 'em'; children: VNodeChild[] }> = []
  // Add a child to the innermost open emphasis span, or else to the current paragraph.
  const into = (c: VNodeChild) => (open.length ? open[open.length - 1]!.children : paragraphs[paragraphs.length - 1]!).push(c)
  // Walk the tokens in order.
  for (const { token: t } of parse(source)) {
    switch (t.kind) {
      // Plain text goes in as text, never as markup.
      case 'text':
        into(t.text)
        break
      // An emphasis span opens: collect its children until it closes.
      case 'strongOpen':
      case 'emphOpen':
        open.push({ tag: t.kind === 'strongOpen' ? 'strong' : 'em', children: [] })
        break
      // The span closes: wrap what was collected.
      case 'strongClose':
      case 'emphClose': {
        // The innermost open span, if there is one (a stray close is ignored).
        const o = open.pop()
        if (o) into(h(o.tag, o.children))
        break
      }
      // Inline code.
      case 'code':
        into(h('code', t.text))
        break
      // A link with its own text; it is a link only if its address is safe.
      case 'link':
        into(anchor(t.url, t.text))
        break
      // A bare address, shown as its own text.
      case 'url':
        into(anchor(t.url, t.url))
        break
      // A line break inside a paragraph.
      case 'lineBreak':
        into(h('br'))
        break
      // A bullet marker, drawn as a character.
      case 'bullet':
        into('• ')
        break
      // A paragraph ends: close any open span first, so the markup nests correctly.
      case 'paragraphBreak':
        // At the end, close any span left open.
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
  // One <p> per non-empty paragraph.
  return paragraphs.filter((p) => p.length > 0).map((p) => h('p', p))
}

/** The component: a `div` of the rendered paragraphs for `source`. */
export default defineComponent({
  name: 'RenderedText',
  props: { source: { type: String, required: true } },
  setup(props) {
    return () => h('div', { class: 'rendered-text' }, renderTokens(props.source))
  },
})
