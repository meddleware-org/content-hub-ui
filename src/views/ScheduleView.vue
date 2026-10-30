<script setup lang="ts">
// What is scheduled to send and which reviews are due, as a list or a month calendar. Times are stored in UTC and
// shown in the zone chosen at the top of the console. The server returns the next 1 to 90 days.
import { computed, onMounted, ref } from 'vue'
import { UiButton, UiPanel } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { Schedule } from '../api/types.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModeSwitch from '../components/ModeSwitch.vue'
import SelectField from '../components/SelectField.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TableScroll from '../components/TableScroll.vue'
import { useConsole } from '../console.js'
import { MONTHS, WEEKDAYS, monthGrid, shiftMonth } from '../lib/calendar.js'
import { dayKey, formatDateTime } from '../lib/time.js'

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
const byDay = computed(() => {
  const m = new Map<string, Entry[]>()
  for (const e of entries.value) {
    const k = dayKey(e.at, c.zone.value)
    m.set(k, [...(m.get(k) ?? []), e])
  }
  return m
})
const grid = computed(() => monthGrid(cursor.value.year, cursor.value.month))
const title = computed(() => `${MONTHS[cursor.value.month - 1]} ${cursor.value.year}`)
const move = (by: number) => (cursor.value = shiftMonth(cursor.value.year, cursor.value.month, by))
const clock = (iso: string) => formatDateTime(iso, c.zone.value).split(', ').slice(-1)[0]
const zones = computed<Array<readonly [string, string]>>(() => {
  const set = new Set(['UTC', 'Europe/London', c.zone.value])
  return [...set].map((z) => [z, z] as const)
})
</script>

<template>
  <div class="schedule">
    <ErrorNotice :message="error" />
    <div class="controls">
      <ModeSwitch
        v-model="mode"
        label="Schedule view"
        :options="[
          { id: 'list', label: 'List' },
          { id: 'calendar', label: 'Calendar' },
        ]"
      />
      <SelectField id="sched-days" v-model="days" label="Look ahead" :options="[['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['90', '90 days']]" @update:model-value="load" />
      <SelectField id="sched-zone" :model-value="c.zone.value" label="Time zone" :options="zones" @update:model-value="c.setZone($event)" />
      <UiButton variant="secondary" @click="load">Refresh</UiButton>
    </div>

    <UiPanel v-if="mode === 'list'" title="Coming up" :level="3">
      <TableScroll v-if="entries.length" label="Scheduled sends and reviews">
      <table class="list">
        <caption class="sr-only">Scheduled sends and reviews</caption>
        <thead>
          <tr>
            <th scope="col">When ({{ c.zone.value }})</th>
            <th scope="col">What</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, n) in entries" :key="n">
            <td>{{ formatDateTime(e.at, c.zone.value) }}</td>
            <td>{{ e.label }}</td>
            <td><StatusBadge v-if="e.status" :status="e.status" /><template v-else>review due</template></td>
          </tr>
        </tbody>
      </table>
      </TableScroll>
      <p v-else class="muted">Nothing is scheduled in the next {{ days }} days.</p>
    </UiPanel>

    <UiPanel v-else :title="title" :level="3">
      <div class="month-nav">
        <UiButton variant="ghost" @click="move(-1)">Earlier month</UiButton>
        <UiButton variant="ghost" @click="move(1)">Later month</UiButton>
      </div>
      <p class="muted">Only the next {{ days }} days are loaded; other days are empty.</p>
      <TableScroll label="Calendar month">
      <table class="cal">
        <caption class="sr-only">{{ title }}, times in {{ c.zone.value }}</caption>
        <thead>
          <tr>
            <th v-for="w in WEEKDAYS" :key="w" scope="col"><abbr :title="w">{{ w.slice(0, 3) }}</abbr></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, wi) in grid" :key="wi">
            <td v-for="cell in week" :key="cell.day" :class="{ out: !cell.inMonth }">
              <span class="date">{{ cell.date }}</span>
              <ul v-if="byDay.get(cell.day)" class="day">
                <li v-for="(e, n) in byDay.get(cell.day)" :key="n">
                  <strong>{{ clock(e.at) }}</strong> {{ e.label }}
                </li>
              </ul>
            </td>
          </tr>
        </tbody>
      </table>
      </TableScroll>
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
}

.list,
.cal {
  width: 100%;
  border-collapse: collapse;
}

.list th,
.list td,
.cal th,
.cal td {
  border: 1px solid var(--border);
  padding: var(--space-3xs) var(--space-xs);
  text-align: left;
  vertical-align: top;
}

.cal td {
  height: 6rem;
  width: 14%;
}

.out {
  background: var(--surface);
  color: var(--muted);
}

.date {
  font-weight: 700;
}

.day {
  list-style: none;
  padding: 0;
  margin: var(--space-3xs) 0 0;
  font-size: var(--font-size-xs);
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
