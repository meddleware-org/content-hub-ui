<script setup lang="ts">
// The public roadmap as one audience gets it: the document the public process returns, not a guess made here, with the exact JSON.
import { UiBadge, UiCodeBlock, UiEmptyState, UiNotice, UiPanel } from '@meddleware/ui'
import { formatDateTime } from '@meddleware/web-utils'
import type { PublicRoadmap } from '../api/types.js'
import { useConsole } from '../console.js'
import { statusLabel, statusTone } from '../lib/status.js'

defineProps<{ audience: 'human' | 'bot'; preview: PublicRoadmap | null }>()
const c = useConsole()
</script>

<template>
  <UiNotice>
    This is the public document for {{ audience === 'human' ? 'people (/public/v1/roadmap)' : 'bots (/public/v1/roadmap-bot)' }}, produced by the same code the public site uses. Internal names, descriptions and dates never appear in it.
  </UiNotice>
  <UiPanel v-if="preview" title="What visitors get" :level="3">
    <UiEmptyState v-if="!preview.phases.length">Nothing is public for this audience yet.</UiEmptyState>
    <section v-for="p in preview.phases" :key="p.id">
      <h4>{{ p.name }}</h4>
      <p v-if="p.description">{{ p.description }}</p>
      <p v-if="p.window_start || p.window_end" class="muted">{{ formatDateTime(p.window_start, c.zone.value) }} – {{ formatDateTime(p.window_end, c.zone.value) }}</p>
      <ul>
        <li v-for="i in p.items" :key="i.id">
          <strong>{{ i.title }}</strong> <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
          <template v-if="i.due_at"> · due {{ formatDateTime(i.due_at, c.zone.value) }}</template>
          <span v-if="i.description" class="sub">{{ i.description }}</span>
        </li>
      </ul>
    </section>
    <details>
      <summary>The exact JSON document</summary>
      <UiCodeBlock label="The public roadmap document" :code="JSON.stringify(preview, null, 2)" wrap />
    </details>
  </UiPanel>
</template>

<style scoped>
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.sub {
  display: block;
}
</style>
