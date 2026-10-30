<script setup lang="ts">
// Where each selected platform's limit falls in the text. Three cues carry the meaning, so colour is never the only
// one: the segment's fill pattern, a symbol, and the sentence beneath the bar.
import { computed, useId } from 'vue'
import type { Band } from '@meddleware/content-hub-client'

const props = defineProps<{
  bands: Band[]
  /** Length of the text in code points. */
  length: number
  /** Selected target id (as a string) → display name, for the targets the bands were computed for. */
  names: Record<string, string>
}>()

const uid = useId()
const total = computed(() => Object.keys(props.names).length)

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

const segments = computed<Segment[]>(() =>
  props.bands.map((b, i) => {
    const fitting = b.fits.map((id) => props.names[id]).filter(Boolean) as string[]
    const over = Object.entries(props.names).filter(([id]) => !b.fits.includes(id)).map(([, n]) => n)
    const tier = total.value === 0 || over.length === 0 ? 'all' : fitting.length === 0 ? 'none' : 'some'
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
      x: props.length > 0 ? (b.start / props.length) * 100 : 0,
      width: props.length > 0 ? ((b.end - b.start) / props.length) * 100 : 100,
      tier,
      symbol: tier === 'all' ? '✓' : tier === 'some' ? '◐' : '✗',
      text,
    }
  }),
)

const summary = computed(() => segments.value.map((s) => `characters ${s.start} to ${s.end}: ${s.text}`).join('. '))
</script>

<template>
  <figure v-if="segments.length" class="segment-bar">
    <svg class="bar" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" :aria-label="summary" focusable="false">
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
    <figcaption>
      <ol class="bands" role="list">
        <li v-for="s in segments" :key="s.key" :class="`band-${s.tier}`">
          <span aria-hidden="true">{{ s.symbol }}</span>
          Characters {{ s.start }}–{{ s.end }}: {{ s.text }}
        </li>
      </ol>
      <p class="legend">✓ within every limit · ◐ within some · ✗ over every limit (counted in each platform's own unit)</p>
    </figcaption>
  </figure>
</template>

<style scoped>
.segment-bar {
  margin: 0;
}

.bar {
  display: block;
  width: 100%;
  height: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.seg-all {
  fill: var(--ok);
}

.pat-bg {
  fill: var(--surface);
}

.pat-warn {
  fill: var(--warning);
}

.pat-bad {
  fill: var(--danger);
}

.bands {
  list-style: none;
  margin: var(--space-xs) 0 0;
  padding: 0;
  font-size: var(--font-size-sm);
}

.legend {
  margin: var(--space-2xs) 0 0;
  color: var(--muted);
  font-size: var(--font-size-xs);
}
</style>
