<script setup lang="ts">
// Publishing: every post on every target with its status, attempts and the exact payload, the moves a person may make (mark a manual post done, retry, resolve an uncertain send,
// cancel), the stop switch, and the targets (including turning real sending on, which asks first). The server decides every move; the buttons shown are the ones it offers.
// Related: components/InstancesTable.vue, InstanceDetail.vue, SendingSwitch.vue, TargetsTable.vue.
// Vue's reactivity and lifecycle.
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
// The shared button, checkbox, dialog, notice and fields, and the cursor pager.
import { UiButton, UiCheckField, UiDialog, UiNotice, UiSelectField, UiTextField, usePager } from '@meddleware/ui'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The response shapes.
import type { Instance, InstanceDetail, Post, PlatformTarget } from '../api/types.js'
// One instance's detail.
import InstanceDetailPanel from '../components/InstanceDetail.vue'
// The instances list and its filter type.
import InstancesTable, { type InstanceFilter } from '../components/InstancesTable.vue'
// The stop switch.
import SendingSwitch from '../components/SendingSwitch.vue'
// The targets table.
import TargetsTable from '../components/TargetsTable.vue'
// The console context.
import { useConsole } from '../console.js'

// The console context.
const c = useConsole()
// A failed request, in words.
const error = ref<string | null>(null)
// A confirmation.
const notice = ref<string | null>(null)
// True while a change is in flight.
const busy = ref(false)

// ── the stop switch ─────────────────────────────────────────────────────────────────────────────────────────
// The stop switch's state; null until the server has answered.
const paused = ref<boolean | null>(null)
/** Read the stop switch. */
async function loadPaused() {
  try {
    // The server holds the switch.
    paused.value = (await c.http.get<{ paused: boolean }>('/publishing')).paused
  } catch (e) {
    error.value = describeError(e)
  }
}
/** Stop or resume sending. */
async function setPaused(v: boolean) {
  busy.value = true
  error.value = null
  try {
    // The answer is the switch as it now is.
    paused.value = (await c.http.put<{ paused: boolean }>('/publishing', { paused: v })).paused
    notice.value = v ? 'Sending is stopped. In-flight sends finish; nothing new is claimed.' : 'Sending resumed.'
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

// ── instances ───────────────────────────────────────────────────────────────────────────────────────────────
// The list's state and target filters.
const filter = ref<InstanceFilter>({ status: '', target: '' })
// The instances, twenty at a time, filtered.
const instances = usePager<Instance>(
  (cursor) => c.http.get('/instances', { cursor, limit: 20, status: filter.value.status, platform_target_id: filter.value.target }),
  describeError,
)
// Post titles by id, filled in as the list loads.
const titles = reactive<Record<number, string>>({})
/** Look up the title of every post on the page that is not known yet. */
async function fillTitles() {
  // The posts not looked up yet.
  const missing = [...new Set(instances.items.value.map((i) => i.post_id))].filter((id) => !(id in titles))
  await Promise.all(
    missing.map(async (id) => {
      try {
        // The post's title.
        titles[id] = (await c.http.get<{ post: Post }>(`/posts/${id}`)).post.title
      } catch {
        // A post that cannot be read is shown by number.
        titles[id] = `post #${id}`
      }
    }),
  )
}
/** Reload the list (from the first page when `first`), then the titles. */
async function refresh(first = false) {
  await (first ? instances.reset() : instances.reload())
  await fillTitles()
}
// Load the switch, the reference data and the first page.
onMounted(() => {
  void loadPaused()
  void c.loadReference().catch((e) => (error.value = describeError(e)))
  void refresh(true)
})

// A target by id.
const targetOf = (id: number) => c.reference.value?.targets.find((t) => t.id === id)
// A target's name with its platform, or its number when it was removed.
const targetName = (id: number) => {
  const t = targetOf(id)
  return t ? `${t.name} (${t.platform_code})` : `target #${id}`
}
// The targets as filter options.
const targetOptions = computed(() => (c.reference.value?.targets ?? []).map((t) => [String(t.id), `${t.name} (${t.platform_code})`] as const))
// True when the instance's platform is posted by hand.
const isManual = (i: Instance) => {
  const t = targetOf(i.platform_target_id)
  return c.reference.value?.definitions.find((d) => d.id === t?.platform_definition_id)?.posting_mode === 'manual'
}

// ── one instance ────────────────────────────────────────────────────────────────────────────────────────────
// The open instance.
const detail = ref<InstanceDetail | null>(null)
// The detail panel, so focus can move to it when an instance opens.
const detailPanel = ref<{ $el: HTMLElement } | null>(null)

/** Open an instance and move the keyboard to its panel. */
async function open(id: number) {
  error.value = null
  try {
    detail.value = await c.http.get<InstanceDetail>(`/instances/${id}`)
    // Opening an instance moves the keyboard to it (it is below the list).
    // Wait for the panel to exist.
    await nextTick()
    detailPanel.value?.$el.focus()
  } catch (e) {
    error.value = describeError(e)
  }
}

/** Ask the server to move the open instance to a new state. */
async function move(to: string, postedUrl: string) {
  if (!detail.value) return
  // The instance being changed.
  const id = detail.value.instance.id
  busy.value = true
  error.value = null
  notice.value = null
  try {
    // The answer is the instance as it now is.
    detail.value = await c.http.post<InstanceDetail>(`/instances/${id}/transition`, {
      to,
      ...(to === 'posted' ? { url_or_external_id: postedUrl } : {}),
    })
    notice.value = `Instance #${id} is now ${detail.value.instance.status.replace(/_/g, ' ')}.`
    // Update the list's row.
    await refresh()
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

/** Record the other side's progress for a manual platform. */
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
// Whether the add-target dialog is open.
const targetDialog = ref(false)
// The target being asked about going live.
const liveAsk = ref<PlatformTarget | null>(null)
// Whether the confirmation is open.
const liveOpen = ref(false)
// The add-target form.
const tform = reactive({ platform: '', name: '', external_ref: '', secret_ref: '', config: '', is_sandbox: false, enabled: true })
// An error in the add-target dialog.
const tError = ref<string | null>(null)

// The platforms a target can be made for.
const platformOptions = computed(() =>
  (c.reference.value?.definitions ?? []).filter((d) => d.posting_mode !== 'none').map((d) => [String(d.id), `${d.name} (${d.posting_mode})`] as const),
)

/** Change a target, reload the reference data and show `say`. */
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
/** Turning real sending on asks first; turning it off does not. */
function toggleLive(t: PlatformTarget, on: boolean) {
  if (on) {
    liveAsk.value = t
    liveOpen.value = true
  } else void patchTarget(t, { live: false }, `${t.name} no longer sends for real; its posts become dry runs.`)
}
/** The person confirmed: turn real sending on. */
async function confirmLive() {
  const t = liveAsk.value
  liveOpen.value = false
  if (t) await patchTarget(t, { live: true }, `${t.name} is live. It sends for real only while the worker runs with real sending on${t.is_sandbox ? '' : ' and in production'}.`)
}

/** Open the add-target dialog with an empty form. */
function newTarget() {
  Object.assign(tform, { platform: '', name: '', external_ref: '', secret_ref: '', config: '', is_sandbox: false, enabled: true })
  tError.value = null
  targetDialog.value = true
}
/** Validate the settings and create the target. */
async function createTarget() {
  // The optional settings, parsed from JSON.
  let config: Record<string, unknown> | undefined
  if (tform.config.trim()) {
    try {
      // Settings must be a JSON object.
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
    // Create it; empty optional fields are left out.
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
  <!-- Publishing: the switch, the instances, one instance's detail, the targets and two dialogs. -->
  <div class="publishing">
    <!-- A failed request, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />
    <!-- A confirmation. -->
    <UiNotice v-if="notice" type="ok" :message="notice" />

    <!-- The stop switch. -->
    <SendingSwitch :paused="paused" :busy="busy" :expired="c.expired.value" @set="setPaused" />

    <!-- The instances list; paging also fills in titles. -->
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

    <!-- The open instance, focusable so opening it can move the keyboard here. -->
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

    <!-- The targets. -->
    <TargetsTable :targets="c.reference.value?.targets ?? []" :busy="busy" @patch="patchTarget" @live="toggleLive" @add="newTarget" />

    <!-- Confirms turning real sending on, and says to try a private channel first. -->
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

    <!-- The add-target form. -->
    <UiDialog v-model:open="targetDialog" title="Add a target" width="min(36rem, 94vw)">
      <UiNotice v-if="tError" type="error" :message="tError" />
      <!-- The platform. -->
      <UiSelectField id="tg-platform" v-model="tform.platform" label="Platform" :options="platformOptions" placeholder="Choose a platform" />
      <!-- The target's name. -->
      <UiTextField id="tg-name" v-model="tform.name" label="Name" :maxlength="200" />
      <!-- Where it posts to (a handle, a channel, an instance address). -->
      <UiTextField id="tg-ref" v-model="tform.external_ref" label="Where (handle, channel, instance address, site)" hint="For example @channelname for Telegram, the instance's https address for Mastodon, a subreddit name for Reddit." />
      <!-- The NAME of the variable that holds the credential, never the credential. -->
      <UiTextField id="tg-secret" v-model="tform.secret_ref" label="Credential variable name" hint="The NAME of the environment variable that holds the credential, starting with PLATFORM_. Never paste the credential itself." />
      <!-- Optional settings as JSON. -->
      <UiTextField id="tg-config" v-model="tform.config" label="Settings (optional JSON)" :rows="3" hint="For example {&quot;mode&quot;: &quot;embed&quot;} for a Discord embed." />
      <!-- Marks a private place for testing. -->
      <UiCheckField v-model="tform.is_sandbox" label="This is a sandbox (a private place for testing)" />
      <!-- Whether it is enabled. -->
      <UiCheckField v-model="tform.enabled" label="Enabled" />
      <template #actions="{ close }">
        <UiButton variant="ghost" @click="close()">Cancel</UiButton>
        <UiButton variant="primary" :disabled="busy || !tform.platform || tform.name.trim() === ''" @click="createTarget">Add target</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.publishing {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
</style>
