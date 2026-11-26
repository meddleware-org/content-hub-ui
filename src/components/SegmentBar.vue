<script setup lang="ts">
// Where each selected platform's limit falls in the text. Three cues carry the meaning so colour is never the only one: the segment's fill pattern, a symbol and the
// sentence beneath the bar. Related: lib/composer.ts (`bands`), views/ComposerView.vue (hosts it).
// Vue's `computed`, and `useId` for ids that stay unique across several bars.
import { computed, useId } from 'vue'
// A stretch of the text and the targets whose limits it fits.
import type { Band } from '@meddleware/content-hub-client'

// The bands, the text's length in code points and the names of the targets the bands were computed for.
const props = defineProps<{
  bands: Band[]
  /** Length of the text in code points. */
  length: number
  /** Selected target id (as a string) → display name, for the targets the bands were computed for. */
  names: Record<string, string>
}>()

// A unique prefix for this bar's SVG pattern ids.
const uid = useId()
// How many targets the bands were computed for.
const total = computed(() => Object.keys(props.names).length)

/** One drawn segment of the bar and the words that describe it. */
interface Segment {
  key: number
  start: number
  end: number
  x: number
  width: number
  tier: 'all' | 'some' | 'none'
  symbol: string
  text: string
}

// Turn each band into a segment: which targets it fits, a tier (all, some or none), its position, a symbol and a sentence.
const segments = computed<Segment[]>(() =>
  props.bands.map((b, i) => {
    // Names of the targets the band fits.
    const fitting = b.fits.map((id) => props.names[id]).filter(Boolean) as string[]
    // Names of the targets it is over.
    const over = Object.entries(props.names).filter(([id]) => !b.fits.includes(id)).map(([, n]) => n)
    // All when nothing is over (or there are no targets), none when nothing fits, otherwise some.
    const tier = total.value === 0 || over.length === 0 ? 'all' : fitting.length === 0 ? 'none' : 'some'
    // The sentence for the band.
    const text =
      total.value === 0
        ? 'no limit to check'
        : tier === 'all'
          ? `within every limit (${total.value})`
          : tier === 'none'
            ? `over every limit (${total.value})`
            : `within ${fitting.join(', ')}; over ${over.join(', ')}`
    return {
      key: i,
      start: b.start + 1,
      end: b.end,
      // Position and width as a share of the text, in a 0–100 box.
      x: props.length > 0 ? (b.start / props.length) * 100 : 0,
      width: props.length > 0 ? ((b.end - b.start) / props.length) * 100 : 100,
      tier,
      // A symbol, so the tier is never carried by colour alone.
      symbol: tier === 'all' ? '✓' : tier === 'some' ? '◐' : '✗',
      text,
    }
  }),
)

// The whole bar as one sentence, for the SVG's accessible name.
const summary = computed(() => segments.value.map((s) => `characters ${s.start} to ${s.end}: ${s.text}`).join('. '))
</script>

<template>
  <figure v-if="segments.length" class="segment-bar">
    <!-- The bar; the sentence is its accessible name and the caption repeats it as a list. -->
    <svg class="bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" :aria-label="summary" focusable="false">
      <!-- Hatch patterns for the amber and red tiers, so they differ without colour. -->
      <defs>
        <pattern :id="`${uid}-some`" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect class="pat-bg" width="3" height="3" />
          <rect class="pat-warn" width="1.5" height="3" />
        </pattern>
        <pattern :id="`${uid}-none`" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect class="pat-bg" width="2" height="2" />
          <rect class="pat-bad" width="1.2" height="2" />
        </pattern>
      </defs>
      <rect
        v-for="s in segments"
        :key="s.key"
        :x="s.x"
        y="0"
        :width="s.width"
        height="8"
        :class="`seg seg-${s.tier}`"
        :fill="s.tier === 'some' ? `url(#${uid}-some)` : s.tier === 'none' ? `url(#${uid}-none)` : undefined"
      />
    </svg>
    <!-- The caption lists each band in words. -->
    <figcaption>
      <!-- One list item per band. -->
      <ol class="bands" role="list">
        <li v-for="s in segments" :key="s.key" :class="`band-${s.tier}`">
          <!-- The symbol is decoration; the words carry the meaning. -->
          <span aria-hidden="true">{{ s.symbol }}</span>
          Characters {{ s.start }}–{{ s.end }}: {{ s.text }}
        </li>
      </ol>
      <!-- What the symbols mean. -->
      <p class="legend">✓ within every limit · ◐ within some · ✗ over every limit (counted in each platform's own unit)</p>
    </figcaption>
  </figure>
</template>

<style scoped>
/* No default figure margin. */
.segment-bar {
  margin: 0;
}

/* The bar fills the width, 1.5rem high, with a border. */
.bar {
  display: block;
  width: 100%;
  height: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

/* A segment within every limit is solid green. */
.seg-all {
  fill: var(--ok);
}

/* The pattern's background. */
.pat-bg {
  fill: var(--surface);
}

/* The amber stripe. */
.pat-warn {
  fill: var(--warning);
}

/* The red stripe. */
.pat-bad {
  fill: var(--danger);
}

/* The band list has no bullets or padding. */
.bands {
  list-style: none;
  margin: var(--space-xs) 0 0;
  padding: 0;
  font-size: var(--font-size-sm);
}

/* The legend is small and muted. */
.legend {
  margin: var(--space-2xs) 0 0;
  color: var(--muted);
  font-size: var(--font-size-xs);
}
</style>
