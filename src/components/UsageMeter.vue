<script setup lang="ts">
// A native <meter> with its numbers and state in words next to it.
import { computed } from 'vue'

const props = defineProps<{
  label: string
  used: number
  limit: number | null
  unit?: string
  /** Format the numbers (default: as integers). */
  format?: (n: number) => string
}>()

const fmt = (n: number) => (props.format ? props.format(n) : String(n))
const over = computed(() => props.limit !== null && props.used > props.limit)
const summary = computed(() => {
  const amount = `${fmt(props.used)}${props.limit !== null ? ` / ${fmt(props.limit)}` : ''}${props.unit ? ` ${props.unit}` : ''}`
  return `${amount} — ${state.value}`
})
const state = computed(() => {
  if (props.limit === null) return 'no limit'
  if (over.value) return `over by ${fmt(props.used - props.limit)}`
  return props.limit > 0 && props.used / props.limit >= 0.8 ? 'close to the limit' : 'within the limit'
})
</script>

<template>
  <div class="usage">
    <span class="usage-label">{{ label }}</span>
    <meter
      v-if="limit !== null"
      class="usage-meter"
      :value="Math.min(used, limit)"
      min="0"
      :max="Math.max(limit, 1)"
      :high="Math.max(limit, 1) * 0.8"
      :optimum="0"
      :aria-label="`${label}: ${fmt(used)} of ${fmt(limit)}`"
    >
      {{ fmt(used) }} of {{ fmt(limit) }}
    </meter>
    <span class="usage-text" :class="{ 'usage-over': over }">{{ summary }}</span>
  </div>
</template>

<style scoped>
.usage {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}

.usage-label {
  font-weight: 600;
}

.usage-meter {
  width: 10rem;
}

.usage-text {
  font-size: var(--font-size-sm);
  color: var(--muted);
}

.usage-over {
  color: var(--danger);
  font-weight: 600;
}
</style>
