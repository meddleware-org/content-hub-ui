<script setup lang="ts">
// What is scheduled to send and which reviews are due, as a list or a month calendar. Times are stored in UTC and shown in the zone chosen at the top of the console.
// The server returns the next 1 to 90 days. Related: ContentHubView.vue (hosts it), the calendar helpers in `@meddleware/web-utils`.
// Vue's reactivity and lifecycle.
import { computed, onMounted, ref } from 'vue'
// The shared badge, button, table, empty state, live status, notice, panel, segmented control and select.
import { UiBadge, UiButton, UiDataTable, UiEmptyState, UiLiveStatus, UiNotice, UiPanel, UiSegmentedControl, UiSelectField } from '@meddleware/ui'
// Calendar helpers: month and weekday names, the day a time falls on in a zone, the clock time, the month grid and month arithmetic.
import { MONTHS, WEEKDAYS, dayKey, formatClock, formatDateTime, monthGrid, shiftMonth } from '@meddleware/web-utils'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The response shape.
import type { Schedule } from '../api/types.js'
// The console context.
import { useConsole } from '../console.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// The console context.
const c = useConsole()
// What the server returned.
const data = ref<Schedule | null>(null)
// A failed read, in words.
const error = ref<string | null>(null)
// List or calendar.
const mode = ref<'list' | 'calendar'>('list')
// How many days ahead to read (a string, for the select).
const days = ref('30')
// Today, to start the calendar on the current month.
const now = new Date()
// The month the calendar shows.
const cursor = ref({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })

/** Read the schedule for the chosen look-ahead and the reference data for target names. */
async function load() {
  error.value = null
  try {
    // Read the schedule and the reference data (for target names) together.
    const [s] = await Promise.all([c.http.get<Schedule>('/schedule', { days: Number(days.value) }), c.loadReference()])
    data.value = s
  } catch (e) {
    error.value = describeError(e)
  }
}
// Read when the schedule opens.
onMounted(load)

// A target's name, or its number when it was removed.
const targetName = (id: number) => c.reference.value?.targets.find((t) => t.id === id)?.name ?? `target #${id}`
// When an instance is next due: its retry time if it has one, else its schedule.
const sendAt = (i: { next_attempt_at: string | null; scheduled_at: string | null }) => i.next_attempt_at ?? i.scheduled_at

/** One thing on the schedule: a send or a review, with its time and words. */
interface Entry {
  at: string
  kind: 'send' | 'review'
  label: string
  status?: string
}
// Sends and reviews as one list, sorted by time.
const entries = computed<Entry[]>(() => {
  const d = data.value
  if (!d) return []
  // Each instance with a time becomes a send.
  const sends = d.instances.flatMap((i): Entry[] => {
    const at = sendAt(i)
    return at ? [{ at, kind: 'send', label: `Send to ${targetName(i.platform_target_id)} (instance #${i.id})`, status: i.status }] : []
  })
  // Each task with a review time becomes a review.
  const reviews = d.reviews_due.flatMap((t): Entry[] => (t.next_review_at ? [{ at: t.next_review_at, kind: 'review', label: `Review: ${t.title}` }] : []))
  return [...sends, ...reviews].sort((a, b) => a.at.localeCompare(b.at))
})
// Every entry placed in its day once (in the chosen zone), not once per cell.
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
// The month's weeks.
const grid = computed(() => monthGrid(cursor.value.year, cursor.value.month))
// The month's name, shown as the panel title and announced.
const title = computed(() => `${MONTHS[cursor.value.month - 1]} ${cursor.value.year}`)
// Step the calendar by months.
const move = (by: number) => (cursor.value = shiftMonth(cursor.value.year, cursor.value.month, by))
// The two views.
const MODES = [
  { id: 'list', label: 'List' },
  { id: 'calendar', label: 'Calendar' },
]
// The look-ahead choices; the server accepts one to ninety days.
const LOOK_AHEAD = [['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['90', '90 days']] as const
</script>

<template>
  <div class="schedule">
    <!-- A failed read, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />
    <!-- List or calendar, how far to look, and a refresh. -->
    <div class="controls">
      <!-- Switch between the list and the calendar. -->
      <UiSegmentedControl v-model="mode" :options="MODES" label="Schedule view" />
      <!-- How far ahead to read; a change reloads. -->
      <UiSelectField id="sched-days" v-model="days" label="Look ahead" :options="LOOK_AHEAD" @update:model-value="load" />
      <UiButton variant="secondary" @click="load">Refresh</UiButton>
    </div>

    <!-- The list view. -->
    <UiPanel v-if="mode === 'list'" title="Coming up" :level="3">
      <!-- Sends and reviews in time order. -->
      <UiDataTable caption="Scheduled sends and reviews" :rows="entries.length" :empty="`Nothing is scheduled in the next ${days} days.`">
        <!-- Column headings; the time column names the zone. -->
        <template #head>
          <th scope="col">When ({{ c.zone.value }})</th>
          <th scope="col">What</th>
          <th scope="col">State</th>
        </template>
        <!-- One row per entry. -->
        <tr v-for="e in entries" :key="`${e.kind}-${e.at}-${e.label}`">
          <!-- The time, in the chosen zone, with the machine-readable value. -->
          <td><time :datetime="e.at">{{ formatDateTime(e.at, c.zone.value) }}</time></td>
          <td>{{ e.label }}</td>
          <!-- A send's state as a badge; a review says it is due. -->
          <td><UiBadge v-if="e.status" :tone="statusTone(e.status)">{{ statusLabel(e.status) }}</UiBadge><template v-else>review due</template></td>
        </tr>
      </UiDataTable>
    </UiPanel>

    <!-- The calendar view. -->
    <UiPanel v-else :title="title" :level="3">
      <!-- Earlier and later month. -->
      <p class="month-nav">
        <UiButton variant="ghost" @click="move(-1)">Earlier month</UiButton>
        <UiButton variant="ghost" @click="move(1)">Later month</UiButton>
      </p>
      <!-- The month is announced when it changes. -->
      <UiLiveStatus label="Month shown" :message="title" />
      <!-- Says that only the loaded days have entries. -->
      <UiEmptyState>Only the next {{ days }} days are loaded; other days are empty.</UiEmptyState>
      <!-- The month as a table, so it reads as one in assistive technology. -->
      <UiDataTable class="cal" :caption="`${title}, times in ${c.zone.value}`">
        <template #head>
          <!-- Weekday headings, abbreviated with the full name in the title. -->
          <th v-for="w in WEEKDAYS" :key="w" scope="col"><abbr :title="w">{{ w.slice(0, 3) }}</abbr></th>
        </template>
        <!-- One row per week. -->
        <tr v-for="week in grid" :key="week[0]!.day">
          <!-- One cell per day; days outside the month are dimmed. -->
          <td v-for="cell in week" :key="cell.day" :class="{ out: !cell.inMonth }">
            <span class="date">{{ cell.date }}</span>
            <!-- The day's entries, each with its clock time. -->
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
/* A column with the shared gap. */
.schedule {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The controls wrap and align at the bottom. */
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* The two month buttons on one row. */
.month-nav {
  display: flex;
  gap: var(--space-xs);
  margin: 0;
}

/* Calendar cells have a fixed height, a seventh of the width and a border. */
.cal :deep(td) {
  height: 6rem;
  width: 14%;
  border: 1px solid var(--border);
  vertical-align: top;
}

/* Days outside the month are dimmed. */
.cal :deep(td.out) {
  background: var(--surface);
  color: var(--muted);
}

/* The day number is bold. */
.date {
  font-weight: var(--font-weight-bold);
}

/* The day's entries are small. */
.day {
  margin: var(--space-3xs) 0 0;
  font-size: var(--font-size-xs);
}
</style>
