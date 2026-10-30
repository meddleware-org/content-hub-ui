<script setup lang="ts">
// A status or tag as words, a symbol and a border. The text keeps the body text colour (so it always meets contrast
// in every theme and season); colour only reinforces the border and the symbol.
import { computed } from 'vue'

const props = defineProps<{ status?: string; label?: string; tone?: 'good' | 'bad' | 'wait' | 'neutral' }>()

const LABELS: Record<string, string> = { manual_required: 'manual', in_progress: 'in progress' }
const TONE: Record<string, 'good' | 'bad' | 'wait'> = {
  posted: 'good', done: 'good', ready: 'good', published: 'good', approved: 'good',
  queued: 'wait', sending: 'wait', in_progress: 'wait', unknown: 'wait', manual_required: 'wait',
  failed: 'bad', blocked: 'bad', cancelled: 'bad', rejected: 'bad',
}
const SYMBOL = { good: '✓', bad: '✗', wait: '◐', neutral: '•' } as const

const tone = computed(() => props.tone ?? (props.status ? (TONE[props.status] ?? 'neutral') : 'neutral'))
const text = computed(() => props.label ?? (props.status ? (LABELS[props.status] ?? props.status.replace(/_/g, ' ')) : ''))
</script>

<template>
  <span class="badge" :class="`badge-${tone}`"><span class="badge-symbol" aria-hidden="true">{{ SYMBOL[tone] }}</span>{{ text }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  gap: var(--space-3xs);
  align-items: baseline;
  padding: 0 var(--space-xs);
  border: 1px solid var(--tone, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--tone, var(--border)) 12%, var(--bg));
  color: var(--text);
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.badge-good {
  --tone: var(--ok);
}

.badge-bad {
  --tone: var(--danger);
}

.badge-wait {
  --tone: var(--warning);
}
</style>
