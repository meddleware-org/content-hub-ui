<script setup lang="ts">
// Publishing: every post on every target with its status, attempts and the exact payload, the moves a person may
// make (mark a manual post done, retry, resolve an uncertain send, cancel), the stop switch, and the targets
// (including turning real sending on, which asks first). The server decides every move; the buttons shown are the
// ones it offers.
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { UiButton, UiCheckField, UiDialog, UiNotice, UiSelectField, UiTextField, usePager } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { Instance, InstanceDetail, Post, PlatformTarget } from '../api/types.js'
import InstanceDetailPanel from '../components/InstanceDetail.vue'
import InstancesTable, { type InstanceFilter } from '../components/InstancesTable.vue'
import SendingSwitch from '../components/SendingSwitch.vue'
import TargetsTable from '../components/TargetsTable.vue'
import { useConsole } from '../console.js'

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
const filter = ref<InstanceFilter>({ status: '', target: '' })
const instances = usePager<Instance>(
  (cursor) => c.http.get('/instances', { cursor, limit: 20, status: filter.value.status, platform_target_id: filter.value.target }),
  describeError,
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

// ── one instance ────────────────────────────────────────────────────────────────────────────────────────────
const detail = ref<InstanceDetail | null>(null)
const detailPanel = ref<{ $el: HTMLElement } | null>(null)

async function open(id: number) {
  error.value = null
  try {
    detail.value = await c.http.get<InstanceDetail>(`/instances/${id}`)
    // Opening an instance moves the keyboard to it (it is below the list).
    await nextTick()
    detailPanel.value?.$el.focus()
  } catch (e) {
    error.value = describeError(e)
  }
}

async function move(to: string, postedUrl: string) {
  if (!detail.value) return
  const id = detail.value.instance.id
  busy.value = true
  error.value = null
  notice.value = null
  try {
    detail.value = await c.http.post<InstanceDetail>(`/instances/${id}/transition`, {
      to,
      ...(to === 'posted' ? { url_or_external_id: postedUrl } : {}),
    })
    notice.value = `Instance #${id} is now ${detail.value.instance.status.replace(/_/g, ' ')}.`
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
    <UiNotice v-if="error" type="error" :message="error" />
    <UiNotice v-if="notice" type="ok" :message="notice" />

    <SendingSwitch :paused="paused" :busy="busy" :expired="c.expired.value" @set="setPaused" />

    <InstancesTable
      v-model:filter="filter"
      :instances="instances"
      :titles="titles"
      :target-options="targetOptions"
      :target-name="targetName"
      @refresh="refresh"
      @open="open"
      @prev="instances.prev().then(fillTitles)"
      @next="instances.next().then(fillTitles)"
    />

    <InstanceDetailPanel
      v-if="detail"
      ref="detailPanel"
      tabindex="-1"
      :detail="detail"
      :title="titles[detail.instance.post_id] ?? 'post'"
      :target="targetName(detail.instance.platform_target_id)"
      :manual="isManual(detail.instance)"
      :busy="busy"
      @move="move"
      @external="setExternal"
    />

    <TargetsTable :targets="c.reference.value?.targets ?? []" :busy="busy" @patch="patchTarget" @live="toggleLive" @add="newTarget" />

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
      <UiNotice v-if="tError" type="error" :message="tError" />
      <UiSelectField id="tg-platform" v-model="tform.platform" label="Platform" :options="platformOptions" placeholder="Choose a platform" />
      <UiTextField id="tg-name" v-model="tform.name" label="Name" :maxlength="200" />
      <UiTextField id="tg-ref" v-model="tform.external_ref" label="Where (handle, channel, instance address, site)" hint="For example @channelname for Telegram, the instance's https address for Mastodon, a subreddit name for Reddit." />
      <UiTextField id="tg-secret" v-model="tform.secret_ref" label="Credential variable name" hint="The NAME of the environment variable that holds the credential, starting with PLATFORM_. Never paste the credential itself." />
      <UiTextField id="tg-config" v-model="tform.config" label="Settings (optional JSON)" :rows="3" hint="For example {&quot;mode&quot;: &quot;embed&quot;} for a Discord embed." />
      <UiCheckField v-model="tform.is_sandbox" label="This is a sandbox (a private place for testing)" />
      <UiCheckField v-model="tform.enabled" label="Enabled" />
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
</style>
