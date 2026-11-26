<script setup lang="ts">
// The public roadmap as one audience gets it: the document the public process returns (not a guess made here), with the exact JSON.
// Related: views/RoadmapView.vue (hosts it).
// The shared badge, code block, empty state, notice and panel.
import { UiBadge, UiCodeBlock, UiEmptyState, UiNotice, UiPanel } from '@meddleware/ui'
// Date formatting in the chosen zone.
import { formatDateTime } from '@meddleware/web-utils'
// The public document's shape.
import type { PublicRoadmap } from '../api/types.js'
// The console context, for the zone.
import { useConsole } from '../console.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// Which audience's document this is, and the document (null while it loads).
defineProps<{ audience: 'human' | 'bot'; preview: PublicRoadmap | null }>()
// The console context.
const c = useConsole()
</script>

<template>
  <UiNotice>
    This is the public document for {{ audience === 'human' ? 'people (/public/v1/roadmap)' : 'bots (/public/v1/roadmap-bot)' }}, produced by the same code the public site uses. Internal names, descriptions and dates never appear in it.
  </UiNotice>
  <!-- What visitors get. -->
  <UiPanel v-if="preview" title="What visitors get" :level="3">
    <!-- Nothing is public for this audience yet. -->
    <UiEmptyState v-if="!preview.phases.length">Nothing is public for this audience yet.</UiEmptyState>
    <!-- One section per phase. -->
    <section v-for="p in preview.phases" :key="p.id">
      <!-- The phase's public name. -->
      <h4>{{ p.name }}</h4>
      <!-- Its public description. -->
      <p v-if="p.description">{{ p.description }}</p>
      <!-- Its window, in the chosen zone. -->
      <p v-if="p.window_start || p.window_end" class="muted">{{ formatDateTime(p.window_start, c.zone.value) }} – {{ formatDateTime(p.window_end, c.zone.value) }}</p>
      <!-- Its items. -->
      <ul>
        <!-- One item: title, status, due date and description. -->
        <li v-for="i in p.items" :key="i.id">
          <strong>{{ i.title }}</strong> <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
          <template v-if="i.due_at"> · due {{ formatDateTime(i.due_at, c.zone.value) }}</template>
          <span v-if="i.description" class="sub">{{ i.description }}</span>
        </li>
      </ul>
    </section>
    <!-- The exact JSON document, folded away. -->
    <details>
      <summary>The exact JSON document</summary>
      <UiCodeBlock label="The public roadmap document" :code="JSON.stringify(preview, null, 2)" wrap />
    </details>
  </UiPanel>
</template>

<style scoped>
/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

/* The description sits on its own line. */
.sub {
  display: block;
}
</style>
