<script setup lang="ts">
// The overview: counts by state, what is scheduled next, reviews due, and spend against the caps. Read-only; every
// number comes from the server.
import { computed, onMounted, ref } from 'vue'
import { INSTANCE_STATUS_VALUES, ITEM_STATUS_VALUES, POST_STATUS_VALUES, TASK_STATUS_VALUES } from '@meddleware/content-hub-client'
import { UiButton, UiPanel, UiStatGrid, UiStatRow } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { Budgets, CountBy, Schedule, Stats } from '../api/types.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import StatusBadge from '../components/StatusBadge.vue'
import UsageMeter from '../components/UsageMeter.vue'
import { useConsole } from '../console.js'
import { LEVEL_TEXT, rows } from '../lib/budgets.js'
import { formatUsd } from '../lib/money.js'
import { formatDateTime } from '../lib/time.js'

const emit = defineEmits<{ navigate: [section: string] }>()
const c = useConsole()
const stats = ref<Stats | null>(null)
const schedule = ref<Schedule | null>(null)
const budgets = ref<Budgets | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

async function load() {
  loading.value = true
  error.value = null
  try {
    const [s, sch, b] = await Promise.all([
      c.http.get<Stats>('/stats'),
      c.http.get<Schedule>('/schedule', { days: 14 }),
      c.http.get<Budgets>('/budgets'),
      c.loadReference(),
    ])
    stats.value = s
    schedule.value = sch
    budgets.value = b
  } catch (e) {
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

/** Every known value with its count (zero when absent), then any value the server sent that this build does not know. */
function counts(by: CountBy[] | undefined, known: readonly string[]): Array<[string, number]> {
  const m = new Map((by ?? []).map((x) => [x.key, x.count]))
  const out: Array<[string, number]> = known.map((k) => [k, m.get(k) ?? 0])
  for (const [k, n] of m) if (!known.includes(k)) out.push([k, n])
  return out
}

const groups = computed(() => [
  { title: 'Tasks by status', rows: counts(stats.value?.tasks_by_status, TASK_STATUS_VALUES) },
  { title: 'Roadmap items by status', rows: counts(stats.value?.items_by_status, ITEM_STATUS_VALUES) },
  { title: 'Posts by status', rows: counts(stats.value?.posts_by_status, POST_STATUS_VALUES) },
  { title: 'Posts by phase', rows: (stats.value?.posts_by_phase ?? []).map((x): [string, number] => [x.key, x.count]) },
  { title: 'Publishing instances by state', rows: counts(stats.value?.instances_by_status, INSTANCE_STATUS_VALUES) },
])

const spend = computed(() =>
  budgets.value && c.reference.value
    ? rows(budgets.value, c.reference.value.definitions, c.reference.value.targets).filter((r) => r.row !== null || r.used > 0)
    : [],
)
const targetName = (id: number) => c.reference.value?.targets.find((t) => t.id === id)?.name ?? `target #${id}`
</script>

<template>
  <div class="dashboard">
    <div class="bar">
      <p class="muted">Counts are read from the server when this page opens.</p>
      <UiButton variant="secondary" :disabled="loading" @click="load">Refresh</UiButton>
    </div>
    <ErrorNotice :message="error" />

    <div class="grid">
      <UiPanel v-for="g in groups" :key="g.title" :title="g.title" :level="3">
        <UiStatGrid v-if="g.rows.length">
          <UiStatRow v-for="[k, n] in g.rows" :key="k" :label="k.replace(/_/g, ' ')">{{ n }}</UiStatRow>
        </UiStatGrid>
        <p v-else class="muted">None yet.</p>
      </UiPanel>
    </div>

    <UiPanel title="Next 14 days" :level="3">
      <h4 class="sub">Scheduled to send</h4>
      <ul v-if="schedule?.instances.length" class="plain">
        <li v-for="i in schedule.instances.slice(0, 8)" :key="i.id">
          {{ formatDateTime(i.next_attempt_at ?? i.scheduled_at, c.zone.value) }} · {{ targetName(i.platform_target_id) }} · <StatusBadge :status="i.status" />
        </li>
      </ul>
      <p v-else class="muted">Nothing is scheduled.</p>
      <h4 class="sub">Reviews due ({{ stats?.reviews_due ?? 0 }} now)</h4>
      <ul v-if="schedule?.reviews_due.length" class="plain">
        <li v-for="t in schedule.reviews_due.slice(0, 8)" :key="t.id">{{ formatDateTime(t.next_review_at, c.zone.value) }} · {{ t.title }}</li>
      </ul>
      <p v-else class="muted">No reviews are due.</p>
      <UiButton variant="ghost" @click="emit('navigate', 'schedule')">Open the schedule</UiButton>
    </UiPanel>

    <UiPanel title="Spend against caps this month" :level="3">
      <ul v-if="spend.length" class="plain">
        <li v-for="r in spend" :key="r.key">
          <UsageMeter :label="r.label" :used="r.used" :limit="r.cap" :format="formatUsd" />
          <span class="muted"> {{ LEVEL_TEXT[r.level] }}</span>
        </li>
      </ul>
      <p v-else class="muted">No money has been spent or reserved this month, and every paid path is capped at zero until you raise it.</p>
      <UiButton variant="ghost" @click="emit('navigate', 'budgets')">Open budgets</UiButton>
    </UiPanel>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--space-sm);
}

.sub {
  margin: var(--space-xs) 0 var(--space-3xs);
}

.plain {
  list-style: none;
  padding: 0;
  margin: 0;
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
