<script setup lang="ts">
// Tasks: a filtered, paginated list, and for one task its dependencies, platforms, links, and ONLY the status changes the server offers right now (the state machine plus
// unfinished dependencies). The server decides every move. Related: ContentHubView.vue (hosts it), `@meddleware/content-hub-client` (the shared state machine).
// Vue's reactivity and lifecycle.
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
// The shared vocabularies and the state machine's transitions.
import { TASK_STATUS_VALUES, TASK_TRANSITIONS, TASK_TYPE_VALUES } from '@meddleware/content-hub-client'
// The shared badge, button, fields, table, empty state, notice, pager and panel, and the cursor pager.
import { UiBadge, UiButton, UiCheckField, UiDataTable, UiEmptyState, UiNotice, UiPager, UiPanel, UiSelectField, UiTextField, usePager } from '@meddleware/ui'
// Dates in the chosen zone, words for a value, and the link check.
import { formatDateTime, humanize, safeHref } from '@meddleware/web-utils'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The response shapes.
import type { Task, TaskDetail } from '../api/types.js'
// The console context.
import { useConsole } from '../console.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// The console context.
const c = useConsole()
// A failed request, in words.
const error = ref<string | null>(null)
// A confirmation.
const notice = ref<string | null>(null)
// The list's filters.
const filter = reactive({ status: '', type: '', gated: '', reviewDue: false })
// The task list, twenty at a time, filtered; a change of filter starts again from the first page.
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
// The open task, with its dependencies, platforms, links and the moves the server allows.
const detail = ref<TaskDetail | null>(null)
// The detail panel, so focus can move to it when a task opens.
const detailPanel = ref<InstanceType<typeof UiPanel> | null>(null)
// Why a task is being blocked.
const blockedReason = ref('')
// True while the reason is being asked for.
const askBlocked = ref(false)
// The new-link form.
const link = reactive({ kind: 'external', post: '', instance: '', url: '', label: '' })
// True while a change is in flight.
const busy = ref(false)

// Load the first page, and the reference data for target names (a failure there is not fatal).
onMounted(() => {
  void tasks.reset()
  void c.loadReference().catch(() => undefined)
})

/** Open a task and move the keyboard to its panel. */
async function open(id: number) {
  error.value = null
  notice.value = null
  // Start without the reason box.
  askBlocked.value = false
  try {
    // The task with its details.
    detail.value = await c.http.get<TaskDetail>(`/tasks/${id}`)
    // Opening a task moves the keyboard to it (it is below the list, out of sight for a screen reader and a keyboard).
    // Wait for the panel to exist.
    await nextTick()
    ;(detailPanel.value?.$el as HTMLElement | undefined)?.focus()
  } catch (e) {
    error.value = describeError(e)
  }
}

/** Ask the server to move the open task to a new status. */
async function move(to: string) {
  // No task open.
  if (!detail.value) return
  // Blocking needs a reason: ask for it first.
  if (to === 'blocked' && !askBlocked.value) {
    askBlocked.value = true
    return
  }
  busy.value = true
  error.value = null
  try {
    // The server decides whether the move is allowed; the answer is the task as it now is.
    detail.value = await c.http.post<TaskDetail>(`/tasks/${detail.value.task.id}/transition`, {
      to,
      ...(to === 'blocked' ? { blocked_reason: blockedReason.value.trim() } : {}),
    })
    askBlocked.value = false
    blockedReason.value = ''
    notice.value = `Moved to ${humanize(to)}.`
    // Refresh the list so its row shows the new status.
    void tasks.reload()
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

/** Attach a link of the chosen kind to the open task. */
async function addLink() {
  if (!detail.value) return
  // The request body for the kind of link.
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
    // Clear the form.
    Object.assign(link, { post: '', instance: '', url: '', label: '' })
    // Reload the task so the link appears.
    await open(detail.value.task.id)
    notice.value = 'Link added.'
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

/** Remove one link from the open task. */
async function detach(linkId: number) {
  if (!detail.value) return
  busy.value = true
  error.value = null
  try {
    // Delete it on the server.
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
// Moves the state machine has from here that the server is not offering now (usually unfinished dependencies).
const held = computed(() => {
  const d = detail.value
  if (!d) return []
  return TASK_TRANSITIONS.filter(([f, t]) => f === d.task.status && !d.allowed_moves.includes(t)).map(([, t]) => t)
})
// A task's platform as words, with the target's name when there is one.
const platformLabel = (p: { platform_code: string; platform_target_id: number | null }) =>
  p.platform_target_id === null ? p.platform_code : `${p.platform_code} → ${c.reference.value?.targets.find((t) => t.id === p.platform_target_id)?.name ?? `target #${p.platform_target_id}`}`

// A task type as lower-case words.
const taskType = (t: string) => humanize(t).toLowerCase()
// The statuses as options.
const STATUS_OPTIONS = TASK_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
// The task types as options.
const TYPE_OPTIONS = TASK_TYPE_VALUES.map((s) => [s, taskType(s)] as const)
// Whether a task needs the organisation to exist.
const GATED_OPTIONS = [['true', 'Yes'], ['false', 'No']] as const
// The kinds of link a task may have.
const LINK_KINDS = [['external', 'A web page'], ['post', 'A post'], ['platform_instance', 'A publishing instance']] as const
</script>

<template>
  <div class="tasks">
    <!-- A failed request, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />
    <!-- A confirmation. -->
    <UiNotice v-if="notice" type="ok" :message="notice" />

    <!-- The filtered, paged list. -->
    <UiPanel title="Tasks" :level="3">
      <!-- The filters; changing one starts again from the first page. -->
      <div class="filters">
        <UiSelectField id="tk-status" v-model="filter.status" label="Status" :options="STATUS_OPTIONS" placeholder="Any status" @update:model-value="tasks.reset()" />
        <UiSelectField id="tk-type" v-model="filter.type" label="Type" :options="TYPE_OPTIONS" placeholder="Any type" @update:model-value="tasks.reset()" />
        <UiSelectField id="tk-gated" v-model="filter.gated" label="Needs the organisation" :options="GATED_OPTIONS" placeholder="Either" @update:model-value="tasks.reset()" />
        <UiCheckField v-model="filter.reviewDue" label="Review due now" @update:model-value="tasks.reset()" />
      </div>
      <UiNotice v-if="tasks.error.value" type="error" :message="tasks.error.value" />
      <!-- The list. -->
      <UiDataTable caption="Tasks" empty="No tasks match." :rows="tasks.items.value.length">
        <!-- Column headings; the last is the details button, hidden visually. -->
        <template #head>
          <th scope="col">Task</th>
          <th scope="col">Type</th>
          <th scope="col">Status</th>
          <th scope="col">Next review</th>
          <th scope="col"><span class="mw-visually-hidden">Actions</span></th>
        </template>
        <!-- One row per task. -->
        <tr v-for="t in tasks.items.value" :key="t.id">
          <!-- The task's title, a badge when it needs the organisation, and its key. -->
          <th scope="row">
            {{ t.title }}
            <UiBadge v-if="t.entity_gated" tone="warn">needs the organisation</UiBadge>
            <span class="muted sub">{{ t.key }}</span>
          </th>
          <td>{{ taskType(t.task_type) }}</td>
          <!-- The status in words with a tone. -->
          <td><UiBadge :tone="statusTone(t.status)">{{ statusLabel(t.status) }}</UiBadge></td>
          <!-- The next review, in the chosen zone. -->
          <td><time :datetime="t.next_review_at ?? undefined">{{ formatDateTime(t.next_review_at, c.zone.value) }}</time></td>
          <!-- Open the task. -->
          <td><UiButton variant="ghost" @click="open(t.id)">Details</UiButton></td>
        </tr>
      </UiDataTable>
      <!-- Newer and older pages. -->
      <UiPager :index="tasks.index.value" :has-next="tasks.hasNext.value" :loading="tasks.loading.value" label="Task pages" prev-label="Newer" next-label="Older" @prev="tasks.prev()" @next="tasks.next()" />
    </UiPanel>

    <!-- The open task; focusable, so opening it can move the keyboard here. -->
    <UiPanel v-if="detail" ref="detailPanel" tabindex="-1" :title="detail.task.title" :level="3">
      <p>
        <UiBadge :tone="statusTone(detail.task.status)">{{ statusLabel(detail.task.status) }}</UiBadge>
        <UiBadge v-if="detail.task.entity_gated" tone="warn">needs the organisation</UiBadge>
        <span class="muted"> {{ detail.task.key }} · {{ taskType(detail.task.task_type) }}</span>
      </p>
      <p v-if="detail.task.description">{{ detail.task.description }}</p>
      <!-- The reason a blocked task is blocked. -->
      <UiNotice v-if="detail.task.status === 'blocked'" type="error"><strong>Blocked:</strong> {{ detail.task.blocked_reason }}</UiNotice>
      <p class="muted">
        Scheduled {{ formatDateTime(detail.task.scheduled_at, c.zone.value) }} · next review {{ formatDateTime(detail.task.next_review_at, c.zone.value) }}
        <template v-if="detail.task.completed_at"> · completed {{ formatDateTime(detail.task.completed_at, c.zone.value) }}</template>
      </p>

      <!-- Only the moves the server offers now. -->
      <h4>Change status</h4>
      <!-- One button per allowed move. -->
      <div class="moves">
        <UiButton v-for="m in detail.allowed_moves" :key="m" variant="secondary" :disabled="busy || c.expired.value" @click="move(m)">Move to {{ humanize(m) }}</UiButton>
        <span v-if="!detail.allowed_moves.length" class="muted">No status change is possible from {{ humanize(detail.task.status) }}.</span>
      </div>
      <!-- The moves that exist but are not offered, and why. -->
      <p v-if="held.length" class="muted">Not offered right now: {{ held.join(', ') }} (unfinished dependencies or the rules).</p>
      <!-- Asks why the task is blocked before blocking it. -->
      <div v-if="askBlocked" class="reason">
        <UiTextField id="tk-reason" v-model="blockedReason" label="Why is it blocked?" hint="Required; shown to everyone who opens the task." :maxlength="1000" />
        <UiButton variant="primary" :disabled="busy || blockedReason.trim() === ''" @click="move('blocked')">Block the task</UiButton>
        <UiButton variant="ghost" @click="askBlocked = false">Cancel</UiButton>
      </div>

      <!-- The tasks this one waits for. -->
      <h4>Depends on</h4>
      <UiEmptyState v-if="!detail.depends_on.length">Nothing.</UiEmptyState>
      <ul v-else><li v-for="d in detail.depends_on" :key="d">task #{{ d }}</li></ul>

      <!-- The platforms the task is about. -->
      <h4>Platforms</h4>
      <UiEmptyState v-if="!detail.platforms.length">None.</UiEmptyState>
      <ul v-else><li v-for="p in detail.platforms" :key="p.id">{{ platformLabel(p) }}</li></ul>

      <!-- What the task points to. -->
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

      <!-- Add one. -->
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
/* A column with the shared gap. */
.tasks {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The filters, moves and reason box wrap and align at the bottom. */
.filters,
.moves,
.reason {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* De-emphasised text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

/* Secondary text sits on its own line. */
.sub {
  display: block;
}
</style>
