<script setup lang="ts">
// Publishing: every post on every target with its status, attempts and the exact payload, the moves a person may
// make (mark a manual post done, retry, resolve an uncertain send, cancel), the stop switch, and the targets
// (including turning real sending on, which asks first). The server decides every move; the buttons shown are the
// ones it offers.
import { computed, onMounted, reactive, ref } from 'vue'
import { EXTERNAL_STATUS_VALUES, INSTANCE_STATUS_VALUES } from '@meddleware/content-hub-client'
import { UiButton, UiDataTable, UiDialog, UiNotice, UiPanel, safeHref } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { Instance, InstanceDetail, Post, PlatformTarget } from '../api/types.js'
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
const busy = ref(false)

// ── the stop switch ─────────────────────────────────────────────────────────────────────────────────────────
const paused = ref<boolean | null>(null)
async function loadPaused() {
  try {
    paused.value = (await c.http.get<{ paused: boolean }>('/publishing')).paused
  } catch (e) {
    error.value = describeError(e)
  }
}
async function setPaused(v: boolean) {
  busy.value = true
  error.value = null
  try {
    paused.value = (await c.http.put<{ paused: boolean }>('/publishing', { paused: v })).paused
    notice.value = v ? 'Sending is stopped. In-flight sends finish; nothing new is claimed.' : 'Sending resumed.'
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

// ── instances ───────────────────────────────────────────────────────────────────────────────────────────────
const filter = reactive({ status: '', target: '' })
const instances = usePager<Instance>((cursor) =>
  c.http.get('/instances', { cursor, limit: 20, status: filter.status, platform_target_id: filter.target }),
)
const titles = reactive<Record<number, string>>({})
async function fillTitles() {
  const missing = [...new Set(instances.items.value.map((i) => i.post_id))].filter((id) => !(id in titles))
  await Promise.all(
    missing.map(async (id) => {
      try {
        titles[id] = (await c.http.get<{ post: Post }>(`/posts/${id}`)).post.title
      } catch {
        titles[id] = `post #${id}`
      }
    }),
  )
}
async function refresh(first = false) {
  await (first ? instances.reset() : instances.reload())
  await fillTitles()
}
onMounted(() => {
  void loadPaused()
  void c.loadReference().catch((e) => (error.value = describeError(e)))
  void refresh(true)
})

const targetOf = (id: number) => c.reference.value?.targets.find((t) => t.id === id)
const targetName = (id: number) => {
  const t = targetOf(id)
  return t ? `${t.name} (${t.platform_code})` : `target #${id}`
}
const targetOptions = computed(() => (c.reference.value?.targets ?? []).map((t) => [String(t.id), `${t.name} (${t.platform_code})`] as const))
const isManual = (i: Instance) => {
  const t = targetOf(i.platform_target_id)
  return c.reference.value?.definitions.find((d) => d.id === t?.platform_definition_id)?.posting_mode === 'manual'
}
const resultUrl = (i: Instance) => (i.url_or_external_id && /^https:\/\//.test(i.url_or_external_id) ? i.url_or_external_id : undefined)

// ── one instance ────────────────────────────────────────────────────────────────────────────────────────────
const detail = ref<InstanceDetail | null>(null)
const postedUrl = ref('')
const copied = ref<string | null>(null)

async function open(id: number) {
  error.value = null
  copied.value = null
  try {
    detail.value = await c.http.get<InstanceDetail>(`/instances/${id}`)
    postedUrl.value = ''
  } catch (e) {
    error.value = describeError(e)
  }
}

const MOVE_LABEL: Record<string, string> = {
  'planned>queued': 'Queue now',
  'planned>manual_required': 'Hand to a person',
  'planned>cancelled': 'Cancel',
  'queued>planned': 'Take back from the queue',
  'queued>cancelled': 'Cancel',
  'failed>queued': 'Retry',
  'failed>manual_required': 'Post it by hand instead',
  'failed>cancelled': 'Cancel',
  'unknown>posted': 'It did go out — record where',
  'unknown>failed': 'It did not go out',
  'manual_required>posted': 'Mark as posted',
  'manual_required>planned': 'Back to planned',
  'manual_required>cancelled': 'Cancel',
  'cancelled>planned': 'Reopen',
}
const moveLabel = (from: string, to: string) => MOVE_LABEL[`${from}>${to}`] ?? `Move to ${to}`

async function move(to: string) {
  if (!detail.value) return
  const id = detail.value.instance.id
  busy.value = true
  error.value = null
  notice.value = null
  try {
    detail.value = await c.http.post<InstanceDetail>(`/instances/${id}/transition`, {
      to,
      ...(to === 'posted' ? { url_or_external_id: postedUrl.value.trim() } : {}),
    })
    notice.value = `Instance #${id} is now ${detail.value.instance.status.replace('_', ' ')}.`
    postedUrl.value = ''
    await refresh()
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function setExternal(v: string) {
  if (!detail.value) return
  busy.value = true
  error.value = null
  try {
    detail.value = await c.http.post<InstanceDetail>(`/instances/${detail.value.instance.id}/transition`, { external_status: v === '' ? null : v })
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = `${what} copied.`
  } catch {
    copied.value = `Could not copy automatically: select the ${what.toLowerCase()} above and copy it.`
  }
}

// ── targets ─────────────────────────────────────────────────────────────────────────────────────────────────
const targetDialog = ref(false)
const liveAsk = ref<PlatformTarget | null>(null)
const liveOpen = ref(false)
const tform = reactive({ platform: '', name: '', external_ref: '', secret_ref: '', config: '', is_sandbox: false, enabled: true })
const tError = ref<string | null>(null)

const platformOptions = computed(() =>
  (c.reference.value?.definitions ?? []).filter((d) => d.posting_mode !== 'none').map((d) => [String(d.id), `${d.name} (${d.posting_mode})`] as const),
)

async function patchTarget(t: PlatformTarget, body: Record<string, unknown>, say: string) {
  busy.value = true
  error.value = null
  notice.value = null
  try {
    await c.http.patch(`/targets/${t.id}`, body)
    await c.loadReference(true)
    notice.value = say
  } catch (e) {
    error.value = describeError(e)
    await c.loadReference(true).catch(() => undefined)
  } finally {
    busy.value = false
  }
}
function toggleLive(t: PlatformTarget, on: boolean) {
  if (on) {
    liveAsk.value = t
    liveOpen.value = true
  } else void patchTarget(t, { live: false }, `${t.name} no longer sends for real; its posts become dry runs.`)
}
async function confirmLive() {
  const t = liveAsk.value
  liveOpen.value = false
  if (t) await patchTarget(t, { live: true }, `${t.name} is live. It sends for real only while the worker runs with real sending on${t.is_sandbox ? '' : ' and in production'}.`)
}

function newTarget() {
  Object.assign(tform, { platform: '', name: '', external_ref: '', secret_ref: '', config: '', is_sandbox: false, enabled: true })
  tError.value = null
  targetDialog.value = true
}
async function createTarget() {
  let config: Record<string, unknown> | undefined
  if (tform.config.trim()) {
    try {
      const v: unknown = JSON.parse(tform.config)
      if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not an object')
      config = v as Record<string, unknown>
    } catch {
      tError.value = 'Settings must be a JSON object, for example {"mode": "embed"}.'
      return
    }
  }
  busy.value = true
  tError.value = null
  try {
    await c.http.post('/targets', {
      platform_definition_id: Number(tform.platform),
      name: tform.name.trim(),
      ...(tform.external_ref.trim() ? { external_ref: tform.external_ref.trim() } : {}),
      ...(tform.secret_ref.trim() ? { secret_ref: tform.secret_ref.trim() } : {}),
      ...(config ? { config } : {}),
      is_sandbox: tform.is_sandbox,
      enabled: tform.enabled,
    })
    await c.loadReference(true)
    targetDialog.value = false
    notice.value = 'Target added. It starts as a dry run until you turn real sending on.'
  } catch (e) {
    tError.value = describeError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="publishing">
    <ErrorNotice :message="error" />
    <UiNotice v-if="notice" type="ok">{{ notice }}</UiNotice>

    <UiPanel title="Sending" :level="3">
      <p v-if="paused === null" class="muted">Reading the switch…</p>
      <template v-else>
        <p>
          <strong>{{ paused ? 'Stopped' : 'Running' }}.</strong>
          <template v-if="paused"> The worker claims nothing new; sends already in progress finish.</template>
          <template v-else> The worker sends queued posts. Targets that are not live, or a worker without real sending, record dry runs instead.</template>
        </p>
        <UiButton :variant="paused ? 'primary' : 'danger'" :disabled="busy || c.expired.value" @click="setPaused(!paused)">{{ paused ? 'Resume sending' : 'Stop all sending' }}</UiButton>
      </template>
    </UiPanel>

    <UiPanel title="Posts on targets" :level="3">
      <div class="filters">
        <SelectField id="pb-status" v-model="filter.status" label="State" :options="INSTANCE_STATUS_VALUES.map((s) => [s, s.replace('_', ' ')] as const)" placeholder="Any state" @update:model-value="refresh(true)" />
        <SelectField id="pb-target" v-model="filter.target" label="Target" :options="targetOptions" placeholder="Any target" @update:model-value="refresh(true)" />
        <UiButton variant="secondary" @click="refresh()">Refresh</UiButton>
      </div>
      <ErrorNotice :message="instances.error.value" />
      <TableScroll label="Posts on targets">
      <UiDataTable empty="No posts on targets yet.">
        <template #head>
          <tr>
            <th scope="col">Post</th>
            <th scope="col">Target</th>
            <th scope="col">State</th>
            <th scope="col">Scheduled ({{ c.zone.value }})</th>
            <th scope="col">Result</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </template>
        <tr v-for="i in instances.items.value" :key="i.id">
          <th scope="row">{{ titles[i.post_id] ?? `post #${i.post_id}` }}<br /><span class="muted">instance #{{ i.id }}</span></th>
          <td>{{ targetName(i.platform_target_id) }}</td>
          <td><StatusBadge :status="i.status" /><template v-if="i.attempt_count"> <span class="muted">{{ i.attempt_count }} attempt{{ i.attempt_count === 1 ? '' : 's' }}</span></template></td>
          <td>{{ formatDateTime(i.next_attempt_at ?? i.scheduled_at, c.zone.value) }}</td>
          <td>
            <a v-if="safeHref(resultUrl(i))" :href="safeHref(resultUrl(i))" target="_blank" rel="noopener noreferrer">{{ i.url_or_external_id }}</a>
            <template v-else-if="i.url_or_external_id">{{ i.url_or_external_id }}</template>
            <span v-if="i.last_error" class="muted">{{ i.last_error }}</span>
          </td>
          <td><UiButton variant="ghost" @click="open(i.id)">Open</UiButton></td>
        </tr>
      </UiDataTable>
      </TableScroll>
      <PagerNav :index="instances.index.value" :has-next="instances.hasNext.value" :loading="instances.loading.value" label="Publishing pages" @prev="instances.prev().then(fillTitles)" @next="instances.next().then(fillTitles)" />
    </UiPanel>

    <UiPanel v-if="detail" :title="`Instance #${detail.instance.id}: ${titles[detail.instance.post_id] ?? 'post'} on ${targetName(detail.instance.platform_target_id)}`" :level="3">
      <p>
        <StatusBadge :status="detail.instance.status" />
        <span class="muted"> revision {{ detail.instance.post_revision ?? '—' }} · {{ detail.instance.attempt_count }} attempt(s)</span>
      </p>
      <p v-if="detail.instance.last_error" class="muted">{{ detail.instance.last_error }}</p>
      <p v-if="detail.instance.url_or_external_id">
        Result:
        <a v-if="safeHref(resultUrl(detail.instance))" :href="safeHref(resultUrl(detail.instance))" target="_blank" rel="noopener noreferrer">{{ detail.instance.url_or_external_id }}</a>
        <template v-else>{{ detail.instance.url_or_external_id }}</template>
      </p>

      <UiNotice v-if="detail.instance.status === 'unknown'" type="error">
        <strong>This send may or may not have gone out.</strong> It is never retried automatically. Check the platform yourself, then say what you found.
      </UiNotice>

      <h4>What happens next</h4>
      <TextField
        v-if="detail.operator_moves.includes('posted')"
        id="pb-url"
        v-model="postedUrl"
        label="Where it was posted (link or id)"
        hint="Required to mark it posted."
        :maxlength="2000"
      />
      <div class="moves">
        <UiButton
          v-for="m in detail.operator_moves"
          :key="m"
          :variant="m === 'cancelled' ? 'danger' : m === 'posted' ? 'primary' : 'secondary'"
          :disabled="busy || c.expired.value || (m === 'posted' && postedUrl.trim() === '')"
          @click="move(m)"
        >
          {{ moveLabel(detail.instance.status, m) }}
        </UiButton>
        <span v-if="!detail.operator_moves.length" class="muted">Nothing to do: {{ detail.instance.status === 'posted' ? 'it is posted' : 'the worker is handling it' }}.</span>
      </div>

      <template v-if="isManual(detail.instance)">
        <h4>Post by hand</h4>
        <p v-if="detail.intent_url"><a :href="safeHref(detail.intent_url)" target="_blank" rel="noopener noreferrer">Open the platform's compose page with this text filled in</a></p>
        <UiButton v-if="detail.instance.payload_body" variant="secondary" @click="copy(detail.instance.payload_body!, 'Text')">Copy the text</UiButton>
        <span v-if="copied" class="muted" role="status"> {{ copied }}</span>
        <SelectField
          id="pb-ext"
          :model-value="detail.instance.external_status ?? ''"
          label="The other side's progress (directories, partners)"
          :options="EXTERNAL_STATUS_VALUES.map((s) => [s, s.replace('_', ' ')] as const)"
          placeholder="Not tracked"
          @update:model-value="setExternal"
        />
      </template>

      <h4>The text that is sent</h4>
      <p v-if="detail.instance.payload_title" class="muted">Title: {{ detail.instance.payload_title }}</p>
      <pre class="payload">{{ detail.instance.payload_body ?? 'No payload yet.' }}</pre>
      <p v-if="detail.instance.payload_sha256" class="muted">SHA-256 {{ detail.instance.payload_sha256 }}</p>

      <h4>Attempts</h4>
      <TableScroll label="Delivery attempts">
      <UiDataTable empty="No attempts yet.">
        <template #head>
          <tr>
            <th scope="col">Started ({{ c.zone.value }})</th>
            <th scope="col">Outcome</th>
            <th scope="col">HTTP</th>
            <th scope="col">What the platform said</th>
          </tr>
        </template>
        <tr v-for="a in detail.attempts" :key="a.id">
          <td>{{ formatDateTime(a.started_at, c.zone.value) }}</td>
          <td>{{ a.dry_run ? 'dry run' : (a.outcome ?? 'in flight').replace('_', ' ') }}</td>
          <td>{{ a.http_status ?? '—' }}</td>
          <td>
            <span v-if="a.response_excerpt">{{ a.response_excerpt }}</span>
            <details v-if="a.request_redacted">
              <summary>The request (credentials hidden)</summary>
              <pre class="payload">{{ JSON.stringify(a.request_redacted, null, 2) }}</pre>
            </details>
          </td>
        </tr>
      </UiDataTable>
      </TableScroll>
    </UiPanel>

    <UiPanel title="Targets" :level="3">
      <TableScroll label="Targets">
      <UiDataTable empty="No targets yet.">
        <template #head>
          <tr>
            <th scope="col">Target</th>
            <th scope="col">Credential (a variable name)</th>
            <th scope="col">Enabled</th>
            <th scope="col">Sandbox</th>
            <th scope="col">Sends for real</th>
          </tr>
        </template>
        <tr v-for="t in c.reference.value?.targets ?? []" :key="t.id">
          <th scope="row">{{ t.name }}<br /><span class="muted">{{ t.platform_code }}<template v-if="t.external_ref"> · {{ t.external_ref }}</template></span></th>
          <td>{{ t.secret_ref ?? '—' }}</td>
          <td><CheckField :label="`${t.name} is enabled`" :model-value="t.enabled" :disabled="busy" @update:model-value="patchTarget(t, { enabled: $event }, `${t.name} ${$event ? 'enabled' : 'disabled'}.`)" /></td>
          <td><CheckField :label="`${t.name} is a sandbox`" :model-value="t.is_sandbox" :disabled="busy" @update:model-value="patchTarget(t, { is_sandbox: $event }, `${t.name} ${$event ? 'marked' : 'no longer marked'} as a sandbox.`)" /></td>
          <td><CheckField :label="`${t.name} sends for real`" :model-value="t.live" :disabled="busy" @update:model-value="toggleLive(t, $event)" /></td>
        </tr>
      </UiDataTable>
      </TableScroll>
      <UiButton variant="secondary" @click="newTarget">Add a target</UiButton>
    </UiPanel>

    <UiDialog v-model:open="liveOpen" title="Turn on real sending?" width="min(34rem, 94vw)">
      <p>
        <strong>{{ liveAsk?.name }}</strong> ({{ liveAsk?.platform_code }}) will post for real, publicly, once the worker runs with real sending on.
        The first real post on a platform should go to a private channel you own, before any public one.
      </p>
      <template #actions="{ close }">
        <UiButton variant="ghost" @click="close()">Keep it a dry run</UiButton>
        <UiButton variant="danger" @click="confirmLive">Turn on real sending</UiButton>
      </template>
    </UiDialog>

    <UiDialog v-model:open="targetDialog" title="Add a target" width="min(36rem, 94vw)">
      <ErrorNotice :message="tError" />
      <SelectField id="tg-platform" v-model="tform.platform" label="Platform" :options="platformOptions" placeholder="Choose a platform" />
      <TextField id="tg-name" v-model="tform.name" label="Name" :maxlength="200" />
      <TextField id="tg-ref" v-model="tform.external_ref" label="Where (handle, channel, instance address, site)" hint="For example @channelname for Telegram, the instance's https address for Mastodon, a subreddit name for Reddit." />
      <TextField id="tg-secret" v-model="tform.secret_ref" label="Credential variable name" hint="The NAME of the environment variable that holds the credential, starting with PLATFORM_. Never paste the credential itself." />
      <TextField id="tg-config" v-model="tform.config" label="Settings (optional JSON)" :rows="3" hint="For example {&quot;mode&quot;: &quot;embed&quot;} for a Discord embed." />
      <CheckField v-model="tform.is_sandbox" label="This is a sandbox (a private place for testing)" />
      <CheckField v-model="tform.enabled" label="Enabled" />
      <template #actions="{ close }">
        <UiButton variant="ghost" @click="close()">Cancel</UiButton>
        <UiButton variant="primary" :disabled="busy || !tform.platform || tform.name.trim() === ''" @click="createTarget">Add target</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.publishing {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.filters,
.moves {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.payload {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
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
