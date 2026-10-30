<script setup lang="ts">
import { UiButton } from '@meddleware/ui'

defineProps<{ index: number; hasNext: boolean; loading?: boolean; label?: string }>()
defineEmits<{ prev: []; next: [] }>()
</script>

<template>
  <nav class="pager" :aria-label="label ?? 'Pages'">
    <UiButton variant="ghost" :disabled="index === 0 || loading" @click="$emit('prev')">Newer</UiButton>
    <span class="pager-page" aria-live="polite">Page {{ index + 1 }}<template v-if="loading"> (loading…)</template></span>
    <UiButton variant="ghost" :disabled="!hasNext || loading" @click="$emit('next')">Older</UiButton>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
  justify-content: flex-end;
  margin-top: var(--space-xs);
}

.pager-page {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
