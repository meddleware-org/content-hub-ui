<script setup lang="ts">
// The composer: write a post once, pick targets, see per platform how it renders and how much of it fits, then queue it. The counts and bands are PREVIEWS from
// @meddleware/content-hub-client (the same arithmetic as the server, pinned by the golden vectors); the server re-checks everything when the post is queued and its answer is final.
// An unsent draft is kept in this browser (lib/drafts.ts) so an expired session costs no work. Related: components/ComposerEditor.vue, PreviewPanel.vue, SegmentBar.vue.
// Vue's reactivity and lifecycle.
import { computed, onMounted, reactive, ref, watch } from 'vue'
// The shared badge, button, empty state, notice and panel, and the cursor pager.
import { UiBadge, UiButton, UiEmptyState, UiNotice, UiPanel, usePager } from '@meddleware/ui'
// Dates in the chosen zone, and dollars from micro-USD.
import { formatDateTime, formatUsd } from '@meddleware/web-utils'
// The API error (which may carry per-target problems) and the words for a failure.
import { ApiError, describeError } from '../api/errors.js'
// The request and response shapes.
import type { EnqueueTarget, Instance, Post, PostDetail, TargetProblem } from '../api/types.js'
// The writing side.
import ComposerEditor from '../components/ComposerEditor.vue'
// The saved posts.
import PostsList from '../components/PostsList.vue'
// One target's preview.
import PreviewPanel from '../components/PreviewPanel.vue'
// Where each limit falls in the text.
import SegmentBar from '../components/SegmentBar.vue'
// A target and its platform.
import type { TargetChoice } from '../components/TargetPicker.vue'
// The console context.
import { useConsole } from '../console.js'
// The preview arithmetic (the same as the server's, pinned by golden vectors).
import { bands, normalise, preview, truncateWithLink, type Override } from '../lib/composer.js'
// Unsent drafts, kept in this browser.
import { clearDraft, isBlank, loadDraft, saveDraft } from '../lib/drafts.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// The composer can ask the console to open Publishing.
const emit = defineEmits<{ navigate: [section: string] }>()
// The console context.
const c = useConsole()

// The shared title.
const title = ref('')
// The shared text.
const body = ref('')
// The ids of the selected targets.
const selected = ref<number[]>([])
// A different title or text for one target, by target id.
const overrides = reactive<Record<string, Override>>({})
// The link a shortened text ends with, by target id.
const linkFor = reactive<Record<string, string>>({})
// When to send; null means as soon as the worker picks it up.
const scheduledAt = ref<string | null>(null)
// The saved post this work belongs to, once it has been saved.
const postId = ref<number | null>(null)
// Its revision.
const revision = ref<number | null>(null)
// The post's instances, when an old post was opened.
const existing = ref<Instance[]>([])

// True while a request is in flight.
const busy = ref(false)
// A failure or a refusal, in words.
const error = ref<string | null>(null)
// The targets the server refused, and why.
const problems = ref<TargetProblem[]>([])
// A confirmation.
const info = ref<string | null>(null)
// The instances the last queue made.
const queued = ref<Instance[]>([])
// When a restored draft was saved, so the notice can say.
const restoredAt = ref<string | null>(null)

// Load the reference data, restore an unsent draft if there is one, and load the saved posts.
onMounted(async () => {
  try {
    await c.loadReference()
  } catch (e) {
    error.value = describeError(e)
  }
  // A draft saved by this browser, if any (it was validated when read).
  const d = loadDraft()
  // Only a draft with something in it is restored.
  if (d && !isBlank(d)) {
    title.value = d.title
    body.value = d.body
    selected.value = d.targets
    Object.assign(overrides, d.overrides)
    postId.value = d.postId
    restoredAt.value = d.savedAt
  }
  void posts.reset()
})

// ── the unsent draft survives an expired session or a reload ────────────────────────────────────────────────
watch(
  [title, body, selected, () => JSON.stringify(overrides), postId],
  () => {
    const d = {
      title: title.value,
      body: body.value,
      targets: selected.value,
      overrides: { ...overrides },
      postId: postId.value,
      savedAt: new Date().toISOString(),
    }
    if (isBlank(d)) clearDraft()
    else saveDraft(d)
  },
  { deep: true },
)

// ── targets and their previews ──────────────────────────────────────────────────────────────────────────────
// The targets that can be chosen: enabled, on an enabled platform that can post.
const choices = computed<TargetChoice[]>(() => {
  // The reference data, once loaded.
  const ref_ = c.reference.value
  if (!ref_) return []
  // Platforms by id.
  const defs = new Map(ref_.definitions.map((d) => [d.id, d]))
  return ref_.targets
    .map((t) => ({ target: t, def: defs.get(t.platform_definition_id) }))
    .filter((x): x is TargetChoice => x.def !== undefined && x.target.enabled && x.def.enabled && x.def.posting_mode !== 'none')
})

// A preview for each selected target, using its own text when it has an override.
const previews = computed(() =>
  choices.value
    .filter((x) => selected.value.includes(x.target.id))
    .map((x) => preview(x.target, x.def, title.value, body.value, overrides[String(x.target.id)])),
)

// How the shared text falls against the targets that use it.
const shared = computed(() => bands(previews.value, normalise(body.value)))
// The names of the targets that use the shared text, for the bar.
const sharedNames = computed(() =>
  Object.fromEntries(previews.value.filter((p) => !p.overridden && p.limits).map((p) => [String(p.target.id), `${p.target.name} (${p.def.name})`])),
)
// The estimated cost across the selected targets.
const totalCost = computed(() => previews.value.reduce((n, p) => n + p.costMicros, 0))
// The targets the text is too long for.
const overflowing = computed(() => previews.value.filter((p) => !p.fits))
// Queueing needs a title, at least one target, no overflow, a live session and no request in flight.
const canQueue = computed(
  () => !busy.value && title.value.trim() !== '' && previews.value.length > 0 && overflowing.value.length === 0 && !c.expired.value,
)

/** Set one field of a target's override; an empty override is removed. */
function setOverride(id: number, field: 'title' | 'body', value: string) {
  // Keys are strings.
  const key = String(id)
  // The override with the new value.
  const next = { ...(overrides[key] ?? {}), [field]: value }
  // Empty fields are dropped.
  if (next.title === '' || next.title === undefined) delete next.title
  if (next.body === '' || next.body === undefined) delete next.body
  // Nothing left: remove the override.
  if (!next.title && !next.body) delete overrides[key]
  else overrides[key] = next
}

// The link for a target, or empty.
const linkOf = (id: number): string => linkFor[String(id)] ?? ''
/** Remember the link a shortened text ends with, for a target. */
function setLink(id: number, value: string) {
  linkFor[String(id)] = value
}

/** Go back to the shared text for a target. */
function clearOverride(id: number) {
  delete overrides[String(id)]
}

/** Cut this platform's text so `…` and a link fit; the result becomes its override (and is counted like any text). */
function truncate(id: number) {
  // The target's preview.
  const p = previews.value.find((x) => x.target.id === id)
  // The link typed for it.
  const url = (linkFor[String(id)] ?? '').trim()
  // A target with no limits has nothing to shorten for.
  if (!p?.limits) return
  // The link must be an https address.
  if (!/^https:\/\/\S+$/.test(url)) {
    error.value = 'Give an https link to end the shortened text with.'
    return
  }
  // Cut the text so an ellipsis and the link fit.
  const cut = truncateWithLink(normalise(p.overridden ? p.body : body.value), url, p.markup, p.limits)
  // Even the link alone does not fit.
  if (cut === null) {
    error.value = 'Even the link alone does not fit this platform.'
    return
  }
  error.value = null
  // The cut text becomes this target's override.
  setOverride(id, 'body', cut)
}

/** Show a failure in words and keep the per-target problems the server listed. */
function describe(e: unknown) {
  // Keep the per-target problems the server listed.
  problems.value = e instanceof ApiError ? e.problems : []
  error.value = describeError(e)
}

/** Create or update the post on the server with the given status. */
async function savePost(status: 'draft' | 'ready'): Promise<Post> {
  // The post as the API takes it.
  const payload = { title: title.value.trim(), body_markdown: normalise(body.value), status }
  // Create the post the first time; later saves update it.
  const post =
    postId.value === null ? await c.http.post<Post>('/posts', payload) : await c.http.patch<Post>(`/posts/${postId.value}`, payload)
  // Remember it, so the next save updates.
  postId.value = post.id
  revision.value = post.revision
  return post
}

/** Save the post as a draft. */
async function saveDraftOnServer() {
  busy.value = true
  error.value = null
  problems.value = []
  info.value = null
  try {
    // Save the post as a draft.
    const p = await savePost('draft')
    info.value = `Saved as draft (post #${p.id}, revision ${p.revision}).`
    void posts.reload()
  } catch (e) {
    describe(e)
  } finally {
    busy.value = false
  }
}

/** Save the post as ready and queue it for the selected targets. */
async function queue() {
  busy.value = true
  error.value = null
  problems.value = []
  info.value = null
  queued.value = []
  try {
    // Save the post as ready: queueing needs a saved revision.
    const p = await savePost('ready')
    // One entry per target, with an override only where one is set.
    const targets: EnqueueTarget[] = previews.value.map((pv) => {
      const o = overrides[String(pv.target.id)]
      return {
        target_id: pv.target.id,
        ...(o?.title?.trim() ? { override_title: o.title } : {}),
        ...(o?.body ? { override_body: normalise(o.body) } : {}),
      }
    })
    // Queue the post; the server re-checks every limit and cost, and its answer is final.
    queued.value = await c.http.post<Instance[]>(`/posts/${p.id}/enqueue`, {
      targets,
      ...(scheduledAt.value ? { scheduled_at: scheduledAt.value } : {}),
    })
    info.value = `Queued ${queued.value.length} instance${queued.value.length === 1 ? '' : 's'} of post #${p.id}.`
    clearDraft()
    void posts.reload()
  } catch (e) {
    describe(e)
  } finally {
    busy.value = false
  }
}

/** Start a new post: clear every field and the saved draft. */
function fresh() {
  title.value = ''
  body.value = ''
  selected.value = []
  for (const k of Object.keys(overrides)) delete overrides[k]
  postId.value = null
  revision.value = null
  existing.value = []
  queued.value = []
  scheduledAt.value = null
  error.value = null
  info.value = null
  problems.value = []
  restoredAt.value = null
  clearDraft()
}

// ── resuming a saved post ───────────────────────────────────────────────────────────────────────────────────
// The saved posts, newest first.
const posts = usePager<Post>((cursor) => c.http.get('/posts', { cursor, limit: 10 }), describeError)

/** Open a saved post and its instances for editing. */
async function open(id: number) {
  busy.value = true
  error.value = null
  try {
    const d = await c.http.get<PostDetail>(`/posts/${id}`)
    fresh()
    title.value = d.post.title
    body.value = d.post.body_markdown
    postId.value = d.post.id
    revision.value = d.post.revision
    existing.value = d.instances
    selected.value = d.instances.filter((i) => i.status !== 'cancelled').map((i) => i.platform_target_id)
    info.value = `Opened post #${d.post.id} (revision ${d.post.revision}).`
  } catch (e) {
    describe(e)
  } finally {
    busy.value = false
  }
}

// A target's name, or its number when it was removed.
const targetName = (id: number) => c.reference.value?.targets.find((t) => t.id === id)?.name ?? `target #${id}`
// The reason the server refused a target, if it did.
const problemFor = (id: number) => problems.value.find((p) => p.target_id === id)?.problem
</script>

<template>
  <!-- The composer: notices, the editor and the previews side by side, the instances and the saved posts. -->
  <div class="composer">
    <!-- A failure or a refusal, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />
    <!-- A confirmation. -->
    <UiNotice v-if="info" type="ok" :message="info" />
    <!-- Tells the person an unsent draft was restored, and lets them discard it. -->
    <UiNotice v-if="restoredAt && !postId && !info">
      Restored your unsent draft from {{ formatDateTime(restoredAt, c.zone.value) }}.
      <UiButton variant="ghost" @click="fresh">Discard it</UiButton>
    </UiNotice>

    <!-- The editor and the previews, side by side where there is room. -->
    <div class="composer-grid">
      <!-- The writing side; it edits the values here and asks for the three actions. -->
      <ComposerEditor
        v-model:title="title"
        v-model:body="body"
        v-model:selected="selected"
        v-model:scheduled-at="scheduledAt"
        :choices="choices"
        :busy="busy"
        :can-queue="canQueue"
        :count="previews.length"
        :overflowing="overflowing.map((p) => p.target.name)"
        @save-draft="saveDraftOnServer"
        @queue="queue"
        @fresh="fresh"
      />

      <!-- The fit and the previews, as a labelled region. -->
      <section class="preview" aria-labelledby="composer-fit">
        <!-- The region's heading. -->
        <h3 id="composer-fit">How it fits</h3>
        <!-- A reminder that the server counts again. -->
        <p class="muted">Previews: the server counts again when you queue.</p>

        <!-- With targets chosen: the bar, the cost and one panel each. -->
        <template v-if="previews.length">
          <!-- Where each target's limit falls in the shared text. -->
          <SegmentBar :bands="shared.bands" :length="shared.length" :names="sharedNames" />
          <!-- The cost estimate, with a pointer to the caps. -->
          <p v-if="totalCost > 0" class="cost">
            Estimated cost: <strong>{{ formatUsd(totalCost) }}</strong> (an estimate; paid platforms are capped and reserved when queued — see Budgets).
          </p>
          <!-- One panel per selected target. -->
          <PreviewPanel
            v-for="p in previews"
            :key="p.target.id"
            :preview="p"
            :problem="problemFor(p.target.id)"
            :override="overrides[String(p.target.id)]"
            :link="linkOf(p.target.id)"
            @override="(field, value) => setOverride(p.target.id, field, value)"
            @link="setLink(p.target.id, $event)"
            @shorten="truncate(p.target.id)"
            @clear="clearOverride(p.target.id)"
          />
        </template>
        <!-- No target is chosen. -->
        <UiEmptyState v-else>Pick at least one target to see how the text fits.</UiEmptyState>
      </section>
    </div>

    <!-- The instances of this post, old and just queued. -->
    <UiPanel v-if="existing.length || queued.length" title="Instances of this post" :level="3">
      <ul>
        <li v-for="i in [...existing, ...queued.filter((q) => !existing.some((e) => e.id === q.id))]" :key="i.id">
          #{{ i.id }} · {{ targetName(i.platform_target_id) }} · <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
          <template v-if="i.last_error"> — {{ i.last_error }}</template>
        </li>
      </ul>
      <!-- Go to Publishing. -->
      <UiButton variant="secondary" @click="emit('navigate', 'instances')">Open Publishing</UiButton>
    </UiPanel>

    <!-- The saved posts, to open one again. -->
    <PostsList :posts="posts" :busy="busy" @open="open" />
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* As many columns as fit, each at least 20rem. */
.composer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--space-md);
}

/* De-emphasised text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

/* A little space around the cost line. */
.cost {
  margin: var(--space-xs) 0;
}
</style>
