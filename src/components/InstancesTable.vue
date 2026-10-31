<script setup lang="ts">
// Every post on every target with its state, attempts and result, filtered by state and target.
import { INSTANCE_STATUS_VALUES } from '@meddleware/content-hub-client'
import { UiBadge, UiButton, UiDataTable, UiNotice, UiPager, UiPanel, UiSelectField, type Pager } from '@meddleware/ui'
import { formatDateTime, humanize, safeHref } from '@meddleware/web-utils'
import type { Instance } from '../api/types.js'
import { useConsole } from '../console.js'
import { statusLabel, statusTone } from '../lib/status.js'

export interface InstanceFilter {
  status: string
  target: string
}

const filter = defineModel<InstanceFilter>('filter', { required: true })
defineProps<{
  instances: Pager<Instance>
  /** Post titles by id, filled in as the list loads. */
  titles: Record<number, string>
  targetOptions: ReadonlyArray<readonly [string, string]>
  targetName: (id: number) => string
}>()
defineEmits<{ refresh: [first: boolean]; open: [id: number]; prev: []; next: [] }>()
const c = useConsole()

const STATE_OPTIONS = INSTANCE_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
/** A result that is a web address becomes a link (checked by safeHref in the template); anything else is text. */
const resultUrl = (i: Instance) => (i.url_or_external_id && /^https:\/\//.test(i.url_or_external_id) ? i.url_or_external_id : undefined)
</script>

<template>
  <UiPanel title="Posts on targets" :level="3">
    <div class="filters">
      <UiSelectField id="pb-status" v-model="filter.status" label="State" :options="STATE_OPTIONS" placeholder="Any state" @update:model-value="$emit('refresh', true)" />
      <UiSelectField id="pb-target" v-model="filter.target" label="Target" :options="targetOptions" placeholder="Any target" @update:model-value="$emit('refresh', true)" />
      <UiButton variant="secondary" @click="$emit('refresh', false)">Refresh</UiButton>
    </div>
    <UiNotice v-if="instances.error.value" type="error" :message="instances.error.value" />
    <UiDataTable caption="Posts on targets" empty="No posts on targets yet." :rows="instances.items.value.length">
      <template #head>
        <th scope="col">Post</th>
        <th scope="col">Target</th>
        <th scope="col">State</th>
        <th scope="col">Scheduled ({{ c.zone.value }})</th>
        <th scope="col">Result</th>
        <th scope="col"><span class="mw-visually-hidden">Actions</span></th>
      </template>
      <tr v-for="i in instances.items.value" :key="i.id">
        <th scope="row">{{ titles[i.post_id] ?? `post #${i.post_id}` }}<br /><span class="muted">instance #{{ i.id }}</span></th>
        <td>{{ targetName(i.platform_target_id) }}</td>
        <td>
          <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
          <template v-if="i.attempt_count"> <span class="muted">{{ i.attempt_count }} attempt{{ i.attempt_count === 1 ? '' : 's' }}</span></template>
        </td>
        <td><time :datetime="i.next_attempt_at ?? i.scheduled_at ?? undefined">{{ formatDateTime(i.next_attempt_at ?? i.scheduled_at, c.zone.value) }}</time></td>
        <td>
          <a v-if="safeHref(resultUrl(i))" :href="safeHref(resultUrl(i))" target="_blank" rel="noopener noreferrer">{{ i.url_or_external_id }}</a>
          <template v-else-if="i.url_or_external_id">{{ i.url_or_external_id }}</template>
          <span v-if="i.last_error" class="muted">{{ i.last_error }}</span>
        </td>
        <td><UiButton variant="ghost" @click="$emit('open', i.id)">Open</UiButton></td>
      </tr>
    </UiDataTable>
    <UiPager :index="instances.index.value" :has-next="instances.hasNext.value" :loading="instances.loading.value" label="Publishing pages" prev-label="Newer" next-label="Older" @prev="$emit('prev')" @next="$emit('next')" />
  </UiPanel>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
