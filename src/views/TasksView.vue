<script setup lang="ts">
// Tasks: a filtered, paginated list, and for one task its dependencies, platforms, links, and ONLY the status changes
// the server offers right now (the state machine plus unfinished dependencies). The server decides every move.
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { TASK_STATUS_VALUES, TASK_TRANSITIONS, TASK_TYPE_VALUES } from '@meddleware/content-hub-client'
import { UiBadge, UiButton, UiCheckField, UiDataTable, UiEmptyState, UiNotice, UiPager, UiPanel, UiSelectField, UiTextField, usePager } from '@meddleware/ui'
import { formatDateTime, humanize, safeHref } from '@meddleware/web-utils'
import { describeError } from '../api/errors.js'
import type { Task, TaskDetail } from '../api/types.js'
import { useConsole } from '../console.js'
import { statusLabel, statusTone } from '../lib/status.js'

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
  describeError,
)
const detail = ref<TaskDetail | null>(null)
const detailPanel = ref<InstanceType<typeof UiPanel> | null>(null)
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
    // Opening a task moves the keyboard to it (it is below the list, out of sight for a screen reader and a keyboard).
    await nextTick()
    ;(detailPanel.value?.$el as HTMLElement | undefined)?.focus()
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
    notice.value = `Moved to ${humanize(to)}.`
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

const taskType = (t: string) => humanize(t).toLowerCase()
const STATUS_OPTIONS = TASK_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
const TYPE_OPTIONS = TASK_TYPE_VALUES.map((s) => [s, taskType(s)] as const)
const GATED_OPTIONS = [['true', 'Yes'], ['false', 'No']] as const
const LINK_KINDS = [['external', 'A web page'], ['post', 'A post'], ['platform_instance', 'A publishing instance']] as const
</script>

<template>
  <div class="tasks">
    <UiNotice v-if="error" type="error" :message="error" />
    <UiNotice v-if="notice" type="ok" :message="notice" />

    <UiPanel title="Tasks" :level="3">
      <div class="filters">
        <UiSelectField id="tk-status" v-model="filter.status" label="Status" :options="STATUS_OPTIONS" placeholder="Any status" @update:model-value="tasks.reset()" />
        <UiSelectField id="tk-type" v-model="filter.type" label="Type" :options="TYPE_OPTIONS" placeholder="Any type" @update:model-value="tasks.reset()" />
        <UiSelectField id="tk-gated" v-model="filter.gated" label="Needs the organisation" :options="GATED_OPTIONS" placeholder="Either" @update:model-value="tasks.reset()" />
        <UiCheckField v-model="filter.reviewDue" label="Review due now" @update:model-value="tasks.reset()" />
      </div>
      <UiNotice v-if="tasks.error.value" type="error" :message="tasks.error.value" />
      <UiDataTable caption="Tasks" empty="No tasks match." :rows="tasks.items.value.length">
        <template #head>
          <th scope="col">Task</th>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Next review</th>
          <th scope="col"><span class="mw-visually-hidden">Actions</span></th>
        </template>
        <tr v-for="t in tasks.items.value" :key="t.id">
          <th scope="row">
            {{ t.title }}
            <UiBadge v-if="t.entity_gated" tone="warn">needs the organisation</UiBadge>
            <span class="muted sub">{{ t.key }}</span>
          </th>
          <td>{{ taskType(t.task_type) }}</td>
          <td><UiBadge :tone="statusTone(t.status)">{{ statusLabel(t.status) }}</UiBadge></td>
          <td><time :datetime="t.next_review_at ?? undefined">{{ formatDateTime(t.next_review_at, c.zone.value) }}</time></td>
          <td><UiButton variant="ghost" @click="open(t.id)">Details</UiButton></td>
        </tr>
      </UiDataTable>
      <UiPager :index="tasks.index.value" :has-next="tasks.hasNext.value" :loading="tasks.loading.value" label="Task pages" prev-label="Newer" next-label="Older" @prev="tasks.prev()" @next="tasks.next()" />
    </UiPanel>

    <UiPanel v-if="detail" ref="detailPanel" tabindex="-1" :title="detail.task.title" :level="3">
      <p>
        <UiBadge :tone="statusTone(detail.task.status)">{{ statusLabel(detail.task.status) }}</UiBadge>
        <UiBadge v-if="detail.task.entity_gated" tone="warn">needs the organisation</UiBadge>
        <span class="muted"> {{ detail.task.key }} · {{ taskType(detail.task.task_type) }}</span>
      </p>
      <p v-if="detail.task.description">{{ detail.task.description }}</p>
      <UiNotice v-if="detail.task.status === 'blocked'" type="error"><strong>Blocked:</strong> {{ detail.task.blocked_reason }}</UiNotice>
      <p class="muted">
        Scheduled {{ formatDateTime(detail.task.scheduled_at, c.zone.value) }} · next review {{ formatDateTime(detail.task.next_review_at, c.zone.value) }}
        <template v-if="detail.task.completed_at"> · completed {{ formatDateTime(detail.task.completed_at, c.zone.value) }}</template>
      </p>

      <h4>Change status</h4>
      <div class="moves">
        <UiButton v-for="m in detail.allowed_moves" :key="m" variant="secondary" :disabled="busy || c.expired.value" @click="move(m)">Move to {{ humanize(m) }}</UiButton>
        <span v-if="!detail.allowed_moves.length" class="muted">No status change is possible from {{ humanize(detail.task.status) }}.</span>
      </div>
      <p v-if="held.length" class="muted">Not offered right now: {{ held.join(', ') }} (unfinished dependencies or the rules).</p>
      <div v-if="askBlocked" class="reason">
        <UiTextField id="tk-reason" v-model="blockedReason" label="Why is it blocked?" hint="Required; shown to everyone who opens the task." :maxlength="1000" />
        <UiButton variant="primary" :disabled="busy || blockedReason.trim() === ''" @click="move('blocked')">Block the task</UiButton>
        <UiButton variant="ghost" @click="askBlocked = false">Cancel</UiButton>
      </div>

      <h4>Depends on</h4>
      <UiEmptyState v-if="!detail.depends_on.length">Nothing.</UiEmptyState>
      <ul v-else><li v-for="d in detail.depends_on" :key="d">task #{{ d }}</li></ul>

      <h4>Platforms</h4>
      <UiEmptyState v-if="!detail.platforms.length">None.</UiEmptyState>
      <ul v-else><li v-for="p in detail.platforms" :key="p.id">{{ platformLabel(p) }}</li></ul>

      <h4>Links</h4>
      <ul v-if="detail.links.length">
        <li v-for="l in detail.links" :key="l.id">
          <template v-if="l.link_kind === 'external'"><a :href="safeHref(l.url)" rel="noopener noreferrer" target="_blank">{{ l.label || l.url }}</a></template>
          <template v-else-if="l.link_kind === 'post'">post #{{ l.post_id }}</template>
          <template v-else>publishing instance #{{ l.platform_instance_id }}</template>
          <UiButton variant="ghost" size="sm" :disabled="busy || c.expired.value" @click="detach(l.id)">Detach</UiButton>
        </li>
      </ul>
      <UiEmptyState v-else>No links.</UiEmptyState>

      <h5>Attach a link</h5>
      <UiSelectField id="lk-kind" v-model="link.kind" label="Kind" :options="LINK_KINDS" />
      <UiTextField v-if="link.kind === 'post'" id="lk-post" v-model="link.post" label="Post number" inputmode="numeric" />
      <UiTextField v-else-if="link.kind === 'platform_instance'" id="lk-inst" v-model="link.instance" label="Instance number" inputmode="numeric" />
      <template v-else>
        <UiTextField id="lk-url" v-model="link.url" type="url" label="Address (https)" />
        <UiTextField id="lk-label" v-model="link.label" label="Label" :maxlength="200" />
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

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.sub {
  display: block;
}
</style>
