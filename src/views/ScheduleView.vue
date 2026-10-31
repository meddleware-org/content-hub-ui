<script setup lang="ts">
// What is scheduled to send and which reviews are due, as a list or a month calendar. Times are stored in UTC and
// shown in the zone chosen at the top of the console. The server returns the next 1 to 90 days.
import { computed, onMounted, ref } from 'vue'
import { UiBadge, UiButton, UiDataTable, UiEmptyState, UiLiveStatus, UiNotice, UiPanel, UiSegmentedControl, UiSelectField } from '@meddleware/ui'
import { MONTHS, WEEKDAYS, dayKey, formatClock, formatDateTime, monthGrid, shiftMonth } from '@meddleware/web-utils'
import { describeError } from '../api/errors.js'
import type { Schedule } from '../api/types.js'
import { useConsole } from '../console.js'
import { statusLabel, statusTone } from '../lib/status.js'

const c = useConsole()
const data = ref<Schedule | null>(null)
const error = ref<string | null>(null)
const mode = ref<'list' | 'calendar'>('list')
const days = ref('30')
const now = new Date()
const cursor = ref({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })

async function load() {
  error.value = null
  try {
    const [s] = await Promise.all([c.http.get<Schedule>('/schedule', { days: Number(days.value) }), c.loadReference()])
    data.value = s
  } catch (e) {
    error.value = describeError(e)
  }
}
onMounted(load)

const targetName = (id: number) => c.reference.value?.targets.find((t) => t.id === id)?.name ?? `target #${id}`
const sendAt = (i: { next_attempt_at: string | null; scheduled_at: string | null }) => i.next_attempt_at ?? i.scheduled_at

interface Entry {
  at: string
  kind: 'send' | 'review'
  label: string
  status?: string
}
const entries = computed<Entry[]>(() => {
  const d = data.value
  if (!d) return []
  const sends = d.instances.flatMap((i): Entry[] => {
    const at = sendAt(i)
    return at ? [{ at, kind: 'send', label: `Send to ${targetName(i.platform_target_id)} (instance #${i.id})`, status: i.status }] : []
  })
  const reviews = d.reviews_due.flatMap((t): Entry[] => (t.next_review_at ? [{ at: t.next_review_at, kind: 'review', label: `Review: ${t.title}` }] : []))
  return [...sends, ...reviews].sort((a, b) => a.at.localeCompare(b.at))
})
// Every entry placed in its day once (in the chosen zone), not once per cell.
const byDay = computed(() => {
  const m = new Map<string, Entry[]>()
  for (const e of entries.value) {
    const k = dayKey(e.at, c.zone.value)
    const day = m.get(k)
    if (day) day.push(e)
    else m.set(k, [e])
  }
  return m
})
const grid = computed(() => monthGrid(cursor.value.year, cursor.value.month))
const title = computed(() => `${MONTHS[cursor.value.month - 1]} ${cursor.value.year}`)
const move = (by: number) => (cursor.value = shiftMonth(cursor.value.year, cursor.value.month, by))
const MODES = [
  { id: 'list', label: 'List' },
  { id: 'calendar', label: 'Calendar' },
]
const LOOK_AHEAD = [['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['90', '90 days']] as const
</script>

<template>
  <div class="schedule">
    <UiNotice v-if="error" type="error" :message="error" />
    <div class="controls">
      <UiSegmentedControl v-model="mode" :options="MODES" label="Schedule view" />
      <UiSelectField id="sched-days" v-model="days" label="Look ahead" :options="LOOK_AHEAD" @update:model-value="load" />
      <UiButton variant="secondary" @click="load">Refresh</UiButton>
    </div>

    <UiPanel v-if="mode === 'list'" title="Coming up" :level="3">
      <UiDataTable caption="Scheduled sends and reviews" :rows="entries.length" :empty="`Nothing is scheduled in the next ${days} days.`">
        <template #head>
          <th scope="col">When ({{ c.zone.value }})</th>
          <th scope="col">What</th>
          <th scope="col">State</th>
        </template>
        <tr v-for="e in entries" :key="`${e.kind}-${e.at}-${e.label}`">
          <td><time :datetime="e.at">{{ formatDateTime(e.at, c.zone.value) }}</time></td>
          <td>{{ e.label }}</td>
          <td><UiBadge v-if="e.status" :tone="statusTone(e.status)">{{ statusLabel(e.status) }}</UiBadge><template v-else>review due</template></td>
        </tr>
      </UiDataTable>
    </UiPanel>

    <UiPanel v-else :title="title" :level="3">
      <p class="month-nav">
        <UiButton variant="ghost" @click="move(-1)">Earlier month</UiButton>
        <UiButton variant="ghost" @click="move(1)">Later month</UiButton>
      </p>
      <!-- The month is announced when it changes. -->
      <UiLiveStatus label="Month shown" :message="title" />
      <UiEmptyState>Only the next {{ days }} days are loaded; other days are empty.</UiEmptyState>
      <UiDataTable class="cal" :caption="`${title}, times in ${c.zone.value}`">
        <template #head>
          <th v-for="w in WEEKDAYS" :key="w" scope="col"><abbr :title="w">{{ w.slice(0, 3) }}</abbr></th>
        </template>
        <tr v-for="week in grid" :key="week[0]!.day">
          <td v-for="cell in week" :key="cell.day" :class="{ out: !cell.inMonth }">
            <span class="date">{{ cell.date }}</span>
            <ul v-if="byDay.get(cell.day)" class="day">
              <li v-for="e in byDay.get(cell.day)" :key="`${e.at}-${e.label}`">
                <strong>{{ formatClock(e.at, c.zone.value) }}</strong> {{ e.label }}
              </li>
            </ul>
          </td>
        </tr>
      </UiDataTable>
    </UiPanel>
  </div>
</template>

<style scoped>
.schedule {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.month-nav {
  display: flex;
  gap: var(--space-xs);
  margin: 0;
}

.cal :deep(td) {
  height: 6rem;
  width: 14%;
  border: 1px solid var(--border);
  vertical-align: top;
}

.cal :deep(td.out) {
  background: var(--surface);
  color: var(--muted);
}

.date {
  font-weight: var(--font-weight-bold);
}

.day {
  margin: var(--space-3xs) 0 0;
  font-size: var(--font-size-xs);
}
</style>
