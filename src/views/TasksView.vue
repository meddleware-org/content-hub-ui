<script setup lang="ts">
// Tasks: a filtered, paginated list, and for one task its dependencies, platforms, links, and ONLY the status changes
// the server offers right now (the state machine plus unfinished dependencies). The server decides every move.
import { computed, onMounted, reactive, ref } from 'vue'
import { TASK_STATUS_VALUES, TASK_TRANSITIONS, TASK_TYPE_VALUES } from '@meddleware/content-hub-client'
import { UiButton, UiDataTable, UiNotice, UiPanel, safeHref } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { Task, TaskDetail } from '../api/types.js'
import CheckField from '../components/CheckField.vue'
import ErrorNotice from '../components/ErrorNotice.vue'
import PagerNav from '../components/PagerNav.vue'
import SelectField from '../components/SelectField.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TableScroll from '../components/TableScroll.vue'
import TextField from '../components/TextField.vue'
import { useConsole } from '../console.js'
import { usePager } from '../lib/pager.js'
import { formatDateTime } from '../lib/time.js'

const c = useConsole()
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const filter = reactive({ status: '', type: '', gated: '', reviewDue: false })
const tasks = usePager<Task>((cursor) =>
  c.http.get('/tasks', {
    cursor,
    limit: 20,
    status: filter.status,
    task_type: filter.type,
    entity_gated: filter.gated,
    review_due: filter.reviewDue ? true : undefined,
  }),
)
const detail = ref<TaskDetail | null>(null)
const blockedReason = ref('')
const askBlocked = ref(false)
const link = reactive({ kind: 'external', post: '', instance: '', url: '', label: '' })
const busy = ref(false)

onMounted(() => {
  void tasks.reset()
  void c.loadReference().catch(() => undefined)
})

async function open(id: number) {
  error.value = null
  notice.value = null
  askBlocked.value = false
  try {
    detail.value = await c.http.get<TaskDetail>(`/tasks/${id}`)
  } catch (e) {
    error.value = describeError(e)
  }
}

async function move(to: string) {
  if (!detail.value) return
  if (to === 'blocked' && !askBlocked.value) {
    askBlocked.value = true
    return
  }
  busy.value = true
  error.value = null
  try {
    detail.value = await c.http.post<TaskDetail>(`/tasks/${detail.value.task.id}/transition`, {
      to,
      ...(to === 'blocked' ? { blocked_reason: blockedReason.value.trim() } : {}),
    })
    askBlocked.value = false
    blockedReason.value = ''
    notice.value = `Moved to ${to.replace('_', ' ')}.`
    void tasks.reload()
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function addLink() {
  if (!detail.value) return
  const body =
    link.kind === 'post'
      ? { link_kind: 'post', post_id: Number(link.post) }
      : link.kind === 'platform_instance'
        ? { link_kind: 'platform_instance', platform_instance_id: Number(link.instance) }
        : { link_kind: 'external', url: link.url.trim(), label: link.label.trim() }
  busy.value = true
  error.value = null
  try {
    await c.http.post(`/tasks/${detail.value.task.id}/links`, body)
    Object.assign(link, { post: '', instance: '', url: '', label: '' })
    await open(detail.value.task.id)
    notice.value = 'Link added.'
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function detach(linkId: number) {
  if (!detail.value) return
  busy.value = true
  error.value = null
  try {
    await c.http.del(`/tasks/${detail.value.task.id}/links/${linkId}`)
    await open(detail.value.task.id)
    notice.value = 'Link removed.'
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

/** Moves the state machine has from here that the server is not offering now (dependencies, usually). */
const held = computed(() => {
  const d = detail.value
  if (!d) return []
  return TASK_TRANSITIONS.filter(([f, t]) => f === d.task.status && !d.allowed_moves.includes(t)).map(([, t]) => t)
})
const platformLabel = (p: { platform_code: string; platform_target_id: number | null }) =>
  p.platform_target_id === null ? p.platform_code : `${p.platform_code} → ${c.reference.value?.targets.find((t) => t.id === p.platform_target_id)?.name ?? `target #${p.platform_target_id}`}`
</script>

<template>
  <div class="tasks">
    <ErrorNotice :message="error" />
    <UiNotice v-if="notice" type="ok">{{ notice }}</UiNotice>

    <UiPanel title="Tasks" :level="3">
      <div class="filters">
        <SelectField id="tk-status" v-model="filter.status" label="Status" :options="TASK_STATUS_VALUES.map((s) => [s, s.replace('_', ' ')] as const)" placeholder="Any status" @update:model-value="tasks.reset()" />
        <SelectField id="tk-type" v-model="filter.type" label="Type" :options="TASK_TYPE_VALUES.map((s) => [s, s.replace(/_/g, ' ').toLowerCase()] as const)" placeholder="Any type" @update:model-value="tasks.reset()" />
        <SelectField id="tk-gated" v-model="filter.gated" label="Needs the organisation" :options="[['true', 'Yes'], ['false', 'No']]" placeholder="Either" @update:model-value="tasks.reset()" />
        <CheckField v-model="filter.reviewDue" label="Review due now" @update:model-value="tasks.reset()" />
      </div>
      <ErrorNotice :message="tasks.error.value" />
      <TableScroll label="Tasks">
      <UiDataTable empty="No tasks match.">
        <template #head>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col">Next review</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </template>
        <tr v-for="t in tasks.items.value" :key="t.id">
          <th scope="row">
            {{ t.title }}
            <StatusBadge v-if="t.entity_gated" label="needs the organisation" tone="wait" />
            <br /><span class="muted">{{ t.key }}</span>
          </th>
          <td>{{ t.task_type.replace(/_/g, ' ').toLowerCase() }}</td>
          <td><StatusBadge :status="t.status" /></td>
          <td>{{ formatDateTime(t.next_review_at, c.zone.value) }}</td>
          <td><UiButton variant="ghost" @click="open(t.id)">Details</UiButton></td>
        </tr>
      </UiDataTable>
      </TableScroll>
      <PagerNav :index="tasks.index.value" :has-next="tasks.hasNext.value" :loading="tasks.loading.value" label="Task pages" @prev="tasks.prev()" @next="tasks.next()" />
    </UiPanel>

    <UiPanel v-if="detail" :title="detail.task.title" :level="3">
      <p>
        <StatusBadge :status="detail.task.status" />
        <StatusBadge v-if="detail.task.entity_gated" label="needs the organisation" tone="wait" />
        <span class="muted"> {{ detail.task.key }} · {{ detail.task.task_type.replace(/_/g, ' ').toLowerCase() }}</span>
      </p>
      <p v-if="detail.task.description">{{ detail.task.description }}</p>
      <UiNotice v-if="detail.task.status === 'blocked'" type="error"><strong>Blocked:</strong> {{ detail.task.blocked_reason }}</UiNotice>
      <p class="muted">
        Scheduled {{ formatDateTime(detail.task.scheduled_at, c.zone.value) }} · next review {{ formatDateTime(detail.task.next_review_at, c.zone.value) }}
        <template v-if="detail.task.completed_at"> · completed {{ formatDateTime(detail.task.completed_at, c.zone.value) }}</template>
      </p>

      <h4>Change status</h4>
      <div class="moves">
        <UiButton v-for="m in detail.allowed_moves" :key="m" variant="secondary" :disabled="busy || c.expired.value" @click="move(m)">Move to {{ m.replace('_', ' ') }}</UiButton>
        <span v-if="!detail.allowed_moves.length" class="muted">No status change is possible from {{ detail.task.status.replace('_', ' ') }}.</span>
      </div>
      <p v-if="held.length" class="muted">Not offered right now: {{ held.join(', ') }} (unfinished dependencies or the rules).</p>
      <div v-if="askBlocked" class="reason">
        <TextField id="tk-reason" v-model="blockedReason" label="Why is it blocked?" hint="Required; shown to everyone who opens the task." :maxlength="1000" />
        <UiButton variant="primary" :disabled="busy || blockedReason.trim() === ''" @click="move('blocked')">Block the task</UiButton>
        <UiButton variant="ghost" @click="askBlocked = false">Cancel</UiButton>
      </div>

      <h4>Depends on</h4>
      <p v-if="!detail.depends_on.length" class="muted">Nothing.</p>
      <ul v-else class="plain"><li v-for="d in detail.depends_on" :key="d">task #{{ d }}</li></ul>

      <h4>Platforms</h4>
      <p v-if="!detail.platforms.length" class="muted">None.</p>
      <ul v-else class="plain"><li v-for="p in detail.platforms" :key="p.id">{{ platformLabel(p) }}</li></ul>

      <h4>Links</h4>
      <ul v-if="detail.links.length" class="plain">
        <li v-for="l in detail.links" :key="l.id">
          <template v-if="l.link_kind === 'external'"><a :href="safeHref(l.url)" rel="noopener noreferrer" target="_blank">{{ l.label || l.url }}</a></template>
          <template v-else-if="l.link_kind === 'post'">post #{{ l.post_id }}</template>
          <template v-else>publishing instance #{{ l.platform_instance_id }}</template>
          <UiButton variant="ghost" :disabled="busy || c.expired.value" @click="detach(l.id)">Detach</UiButton>
        </li>
      </ul>
      <p v-else class="muted">No links.</p>

      <h5>Attach a link</h5>
      <SelectField id="lk-kind" v-model="link.kind" label="Kind" :options="[['external', 'A web page'], ['post', 'A post'], ['platform_instance', 'A publishing instance']]" />
      <TextField v-if="link.kind === 'post'" id="lk-post" v-model="link.post" label="Post number" inputmode="numeric" />
      <TextField v-else-if="link.kind === 'platform_instance'" id="lk-inst" v-model="link.instance" label="Instance number" inputmode="numeric" />
      <template v-else>
        <TextField id="lk-url" v-model="link.url" type="url" label="Address (https)" />
        <TextField id="lk-label" v-model="link.label" label="Label" :maxlength="200" />
      </template>
      <UiButton variant="secondary" :disabled="busy || c.expired.value" @click="addLink">Attach</UiButton>
    </UiPanel>
  </div>
</template>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.filters,
.moves,
.reason {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.plain {
  list-style: none;
  padding: 0;
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
