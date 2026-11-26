<script setup lang="ts">
// The overview: counts by state, what is scheduled next, reviews due, and spend against the caps. Read-only; every number comes from the server.
// Related: ContentHubView.vue (hosts it and handles `navigate`), lib/budgets.ts (the spend rows).
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref } from 'vue'
// The shared vocabularies of states, so a state with no rows still shows a zero.
import { INSTANCE_STATUS_VALUES, ITEM_STATUS_VALUES, POST_STATUS_VALUES, TASK_STATUS_VALUES } from '@meddleware/content-hub-client'
// The shared badge, button, empty state, meter, notice, panel and stat rows.
import { UiBadge, UiButton, UiEmptyState, UiMeter, UiNotice, UiPanel, UiStatGrid, UiStatRow } from '@meddleware/ui'
// Date formatting in the chosen zone, dollars from micro-USD, and words for a value.
import { formatDateTime, formatUsd, humanize } from '@meddleware/web-utils'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The response shapes.
import type { Budgets, CountBy, Schedule, Stats } from '../api/types.js'
// The console context.
import { useConsole } from '../console.js'
// The budget rows and the words for each alert level.
import { LEVEL_TEXT, rows } from '../lib/budgets.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// The dashboard can ask the console to open the schedule or the budgets.
const emit = defineEmits<{ navigate: [section: string] }>()
// The console context.
const c = useConsole()
// The counts.
const stats = ref<Stats | null>(null)
// What is scheduled and which reviews are due.
const schedule = ref<Schedule | null>(null)
// The caps and this month's usage.
const budgets = ref<Budgets | null>(null)
// A failed read, in words.
const error = ref<string | null>(null)
// True while a read is in flight.
const loading = ref(false)

/** Read the counts, the schedule and the budgets together, and the reference data for target names. */
async function load() {
  // Start: clear the old error.
  loading.value = true
  error.value = null
  try {
    // Read everything at once; the reference data is loaded for the target names.
    const [s, sch, b] = await Promise.all([
      c.http.get<Stats>('/stats'),
      c.http.get<Schedule>('/schedule', { days: 14 }),
      c.http.get<Budgets>('/budgets'),
      c.loadReference(),
    ])
    // Keep the answers.
    stats.value = s
    schedule.value = sch
    budgets.value = b
  } catch (e) {
    // Say what went wrong, in words.
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
}
// Read when the dashboard opens.
onMounted(load)

/** Every known value with its count (zero when absent), then any value the server sent that this build does not know. */
/** Every known value with its count (zero when absent), then any value the server sent that this build does not know. */
function counts(by: CountBy[] | undefined, known: readonly string[]): Array<[string, number]> {
  // The counts by key.
  const m = new Map((by ?? []).map((x) => [x.key, x.count]))
  // Every known value, zero when the server sent none.
  const out: Array<[string, number]> = known.map((k) => [k, m.get(k) ?? 0])
  // Then any value the server sent that this build does not know, so nothing is hidden.
  for (const [k, n] of m) if (!known.includes(k)) out.push([k, n])
  return out
}

// The five panels of counts.
const groups = computed(() => [
  { title: 'Tasks by status', rows: counts(stats.value?.tasks_by_status, TASK_STATUS_VALUES) },
  { title: 'Roadmap items by status', rows: counts(stats.value?.items_by_status, ITEM_STATUS_VALUES) },
  { title: 'Posts by status', rows: counts(stats.value?.posts_by_status, POST_STATUS_VALUES) },
  { title: 'Posts by phase', rows: (stats.value?.posts_by_phase ?? []).map((x): [string, number] => [x.key, x.count]) },
  { title: 'Publishing instances by state', rows: counts(stats.value?.instances_by_status, INSTANCE_STATUS_VALUES) },
])

// Spend rows that have a cap or any use; none until both the budgets and the reference data are loaded.
const spend = computed(() =>
  budgets.value && c.reference.value
    ? rows(budgets.value, c.reference.value.definitions, c.reference.value.targets).filter((r) => r.row !== null || r.used > 0)
    : [],
)
// A target's name, or its number when it was removed.
const targetName = (id: number) => c.reference.value?.targets.find((t) => t.id === id)?.name ?? `target #${id}`
</script>

<template>
  <div class="dashboard">
    <!-- A note on when the numbers were read, and the refresh button. -->
    <p class="bar">
      <span class="muted">Counts are read from the server when this page opens.</span>
      <UiButton variant="secondary" :disabled="loading" @click="load">Refresh</UiButton>
    </p>
    <!-- A failed read, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />

    <!-- The count panels in a responsive grid. -->
    <div class="grid">
      <!-- One panel per group of counts. -->
      <UiPanel v-for="g in groups" :key="g.title" :title="g.title" :level="3">
        <!-- The counts as label and number rows. -->
        <UiStatGrid v-if="g.rows.length">
          <UiStatRow v-for="[k, n] in g.rows" :key="k" :label="humanize(k)">{{ n }}</UiStatRow>
        </UiStatGrid>
        <!-- No rows. -->
        <UiEmptyState v-else>None yet.</UiEmptyState>
      </UiPanel>
    </div>

    <!-- What is coming up. -->
    <UiPanel title="Next 14 days" :level="3">
      <!-- The next sends. -->
      <h4>Scheduled to send</h4>
      <!-- At most eight, soonest first. -->
      <ul v-if="schedule?.instances.length">
        <li v-for="i in schedule.instances.slice(0, 8)" :key="i.id">
          <time :datetime="i.next_attempt_at ?? i.scheduled_at ?? undefined">{{ formatDateTime(i.next_attempt_at ?? i.scheduled_at, c.zone.value) }}</time> · {{ targetName(i.platform_target_id) }} ·
          <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
        </li>
      </ul>
      <!-- Nothing is scheduled. -->
      <UiEmptyState v-else>Nothing is scheduled.</UiEmptyState>
      <!-- Reviews that are due. -->
      <h4>Reviews due ({{ stats?.reviews_due ?? 0 }} now)</h4>
      <!-- At most eight. -->
      <ul v-if="schedule?.reviews_due.length">
        <li v-for="t in schedule.reviews_due.slice(0, 8)" :key="t.id">
          <time :datetime="t.next_review_at ?? undefined">{{ formatDateTime(t.next_review_at, c.zone.value) }}</time> · {{ t.title }}
        </li>
      </ul>
      <UiEmptyState v-else>No reviews are due.</UiEmptyState>
      <!-- Go to the schedule. -->
      <UiButton variant="ghost" @click="emit('navigate', 'schedule')">Open the schedule</UiButton>
    </UiPanel>

    <!-- Money, against the caps. -->
    <UiPanel title="Spend against caps this month" :level="3">
      <!-- One meter per cap, with the level in words beside it. -->
      <ul v-if="spend.length">
        <li v-for="r in spend" :key="r.key">
          <UiMeter :label="r.label" :used="r.used" :limit="r.cap" :format="formatUsd" />
          <span class="muted"> {{ LEVEL_TEXT[r.level] }}</span>
        </li>
      </ul>
      <!-- Nothing spent: and the empty state says every paid path is capped at zero. -->
      <UiEmptyState v-else>No money has been spent or reserved this month, and every paid path is capped at zero until you raise it.</UiEmptyState>
      <!-- Go to the budgets. -->
      <UiButton variant="ghost" @click="emit('navigate', 'budgets')">Open budgets</UiButton>
    </UiPanel>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The note and the button on one row. */
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
  margin: 0;
}

/* As many columns as fit, each at least 16rem. */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--space-sm);
}

/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
