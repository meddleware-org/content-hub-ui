<script setup lang="ts">
// Every post on every target with its state, attempts and result, filtered by state and target. Related: views/PublishingView.vue (owns the requests),
// InstanceDetail.vue (one instance).
// The shared vocabulary of instance states.
import { INSTANCE_STATUS_VALUES } from '@meddleware/content-hub-client'
// The shared badge, button, table, notice, pager, panel and select, and the pager's type.
import { UiBadge, UiButton, UiDataTable, UiNotice, UiPager, UiPanel, UiSelectField, type Pager } from '@meddleware/ui'
// Date formatting in the chosen zone, words for a value, and the link check.
import { formatDateTime, humanize, safeHref } from '@meddleware/web-utils'
// The instance's shape.
import type { Instance } from '../api/types.js'
// The console context, for the zone.
import { useConsole } from '../console.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

/** The filters on the publishing list: a state and a target, each empty for "any". */
export interface InstanceFilter {
  status: string
  target: string
}

// The state and target filters, owned by the view.
const filter = defineModel<InstanceFilter>('filter', { required: true })
// The pager over the instances, the post titles found so far, the target choices and a way to name a target.
defineProps<{
  instances: Pager<Instance>
  /** Post titles by id, filled in as the list loads. */
  titles: Record<number, string>
  targetOptions: ReadonlyArray<readonly [string, string]>
  targetName: (id: number) => string
}>()
// The view reloads and pages; this only asks.
defineEmits<{ refresh: [first: boolean]; open: [id: number]; prev: []; next: [] }>()
// The console context.
const c = useConsole()

// The states as options.
const STATE_OPTIONS = INSTANCE_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
/** A result that is a web address becomes a link (checked by safeHref in the template); anything else is text. */
const resultUrl = (i: Instance) => (i.url_or_external_id && /^https:\/\//.test(i.url_or_external_id) ? i.url_or_external_id : undefined)
</script>

<template>
  <!-- The panel. -->
  <UiPanel title="Posts on targets" :level="3">
    <!-- The two filters and a refresh button. -->
    <div class="filters">
      <!-- Filter by state; a change reloads from the first page. -->
      <UiSelectField id="pb-status" v-model="filter.status" label="State" :options="STATE_OPTIONS" placeholder="Any state" @update:model-value="$emit('refresh', true)" />
      <!-- Filter by target; a change reloads from the first page. -->
      <UiSelectField id="pb-target" v-model="filter.target" label="Target" :options="targetOptions" placeholder="Any target" @update:model-value="$emit('refresh', true)" />
      <!-- Reload the current page. -->
      <UiButton variant="secondary" @click="$emit('refresh', false)">Refresh</UiButton>
    </div>
    <!-- A failed read, in words. -->
    <UiNotice v-if="instances.error.value" type="error" :message="instances.error.value" />
    <!-- The table. -->
    <UiDataTable caption="Posts on targets" empty="No posts on targets yet." :rows="instances.items.value.length">
      <!-- The column headings; the last one is for the open button and is hidden visually. -->
      <template #head>
        <th scope="col">Post</th>
        <th scope="col">Target</th>
        <th scope="col">State</th>
        <th scope="col">Scheduled ({{ c.zone.value }})</th>
        <th scope="col">Result</th>
        <th scope="col"><span class="mw-visually-hidden">Actions</span></th>
      </template>
      <!-- One row per instance. -->
      <tr v-for="i in instances.items.value" :key="i.id">
        <!-- The post's title (or its number while the title loads) with the instance number beneath. -->
        <th scope="row">{{ titles[i.post_id] ?? `post #${i.post_id}` }}<span class="muted sub">instance #{{ i.id }}</span></th>
        <!-- The target's name. -->
        <td>{{ targetName(i.platform_target_id) }}</td>
        <td>
          <!-- The state in words, with a tone; the attempt count beside it. -->
          <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
          <template v-if="i.attempt_count"> <span class="muted">{{ i.attempt_count }} attempt{{ i.attempt_count === 1 ? '' : 's' }}</span></template>
        </td>
        <!-- When it is next due (a retry, else the schedule), in the chosen zone. -->
        <td><time :datetime="i.next_attempt_at ?? i.scheduled_at ?? undefined">{{ formatDateTime(i.next_attempt_at ?? i.scheduled_at, c.zone.value) }}</time></td>
        <td>
          <!-- The result as a link when it is a safe https address, otherwise as text, and the last error beneath. -->
          <a v-if="safeHref(resultUrl(i))" :href="safeHref(resultUrl(i))" target="_blank" rel="noopener noreferrer">{{ i.url_or_external_id }}</a>
          <template v-else-if="i.url_or_external_id">{{ i.url_or_external_id }}</template>
          <span v-if="i.last_error" class="muted">{{ i.last_error }}</span>
        </td>
        <!-- Open the instance. -->
        <td><UiButton variant="ghost" @click="$emit('open', i.id)">Open</UiButton></td>
      </tr>
    </UiDataTable>
    <!-- Newer and older pages. -->
    <UiPager :index="instances.index.value" :has-next="instances.hasNext.value" :loading="instances.loading.value" label="Publishing pages" prev-label="Newer" next-label="Older" @prev="$emit('prev')" @next="$emit('next')" />
  </UiPanel>
</template>

<style scoped>
/* The filters wrap and align at the bottom. */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

/* Secondary text sits on its own line. */
.sub {
  display: block;
}
</style>
