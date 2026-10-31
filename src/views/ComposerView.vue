<script setup lang="ts">
// The composer: write a post once, pick targets, see per platform how it renders and how much of it fits, then
// queue it. The counts and bands are PREVIEWS from @meddleware/content-hub-client (the same arithmetic as the server,
// pinned by the golden vectors); the server re-checks everything when the post is queued, and its answer is final.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { UiBadge, UiButton, UiEmptyState, UiNotice, UiPanel, usePager } from '@meddleware/ui'
import { formatDateTime, formatUsd } from '@meddleware/web-utils'
import { ApiError, describeError } from '../api/errors.js'
import type { EnqueueTarget, Instance, Post, PostDetail, TargetProblem } from '../api/types.js'
import ComposerEditor from '../components/ComposerEditor.vue'
import PostsList from '../components/PostsList.vue'
import PreviewPanel from '../components/PreviewPanel.vue'
import SegmentBar from '../components/SegmentBar.vue'
import type { TargetChoice } from '../components/TargetPicker.vue'
import { useConsole } from '../console.js'
import { bands, normalise, preview, truncateWithLink, type Override } from '../lib/composer.js'
import { clearDraft, isBlank, loadDraft, saveDraft } from '../lib/drafts.js'
import { statusLabel, statusTone } from '../lib/status.js'

const emit = defineEmits<{ navigate: [section: string] }>()
const c = useConsole()

const title = ref('')
const body = ref('')
const selected = ref<number[]>([])
const overrides = reactive<Record<string, Override>>({})
const linkFor = reactive<Record<string, string>>({})
const scheduledAt = ref<string | null>(null)
const postId = ref<number | null>(null)
const revision = ref<number | null>(null)
const existing = ref<Instance[]>([])

const busy = ref(false)
const error = ref<string | null>(null)
const problems = ref<TargetProblem[]>([])
const info = ref<string | null>(null)
const queued = ref<Instance[]>([])
const restoredAt = ref<string | null>(null)

onMounted(async () => {
  try {
    await c.loadReference()
  } catch (e) {
    error.value = describeError(e)
  }
  const d = loadDraft()
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
const choices = computed<TargetChoice[]>(() => {
  const ref_ = c.reference.value
  if (!ref_) return []
  const defs = new Map(ref_.definitions.map((d) => [d.id, d]))
  return ref_.targets
    .map((t) => ({ target: t, def: defs.get(t.platform_definition_id) }))
    .filter((x): x is TargetChoice => x.def !== undefined && x.target.enabled && x.def.enabled && x.def.posting_mode !== 'none')
})

const previews = computed(() =>
  choices.value
    .filter((x) => selected.value.includes(x.target.id))
    .map((x) => preview(x.target, x.def, title.value, body.value, overrides[String(x.target.id)])),
)

const shared = computed(() => bands(previews.value, normalise(body.value)))
const sharedNames = computed(() =>
  Object.fromEntries(previews.value.filter((p) => !p.overridden && p.limits).map((p) => [String(p.target.id), `${p.target.name} (${p.def.name})`])),
)
const totalCost = computed(() => previews.value.reduce((n, p) => n + p.costMicros, 0))
const overflowing = computed(() => previews.value.filter((p) => !p.fits))
const canQueue = computed(
  () => !busy.value && title.value.trim() !== '' && previews.value.length > 0 && overflowing.value.length === 0 && !c.expired.value,
)

function setOverride(id: number, field: 'title' | 'body', value: string) {
  const key = String(id)
  const next = { ...(overrides[key] ?? {}), [field]: value }
  if (next.title === '' || next.title === undefined) delete next.title
  if (next.body === '' || next.body === undefined) delete next.body
  if (!next.title && !next.body) delete overrides[key]
  else overrides[key] = next
}

const linkOf = (id: number): string => linkFor[String(id)] ?? ''
function setLink(id: number, value: string) {
  linkFor[String(id)] = value
}

function clearOverride(id: number) {
  delete overrides[String(id)]
}

/** Cut this platform's text so `…` and a link fit; the result becomes its override (and is counted like any text). */
function truncate(id: number) {
  const p = previews.value.find((x) => x.target.id === id)
  const url = (linkFor[String(id)] ?? '').trim()
  if (!p?.limits) return
  if (!/^https:\/\/\S+$/.test(url)) {
    error.value = 'Give an https link to end the shortened text with.'
    return
  }
  const cut = truncateWithLink(normalise(p.overridden ? p.body : body.value), url, p.markup, p.limits)
  if (cut === null) {
    error.value = 'Even the link alone does not fit this platform.'
    return
  }
  error.value = null
  setOverride(id, 'body', cut)
}

// ── saving and queueing ─────────────────────────────────────────────────────────────────────────────────────
function describe(e: unknown) {
  problems.value = e instanceof ApiError ? e.problems : []
  error.value = describeError(e)
}

async function savePost(status: 'draft' | 'ready'): Promise<Post> {
  const payload = { title: title.value.trim(), body_markdown: normalise(body.value), status }
  const post =
    postId.value === null ? await c.http.post<Post>('/posts', payload) : await c.http.patch<Post>(`/posts/${postId.value}`, payload)
  postId.value = post.id
  revision.value = post.revision
  return post
}

async function saveDraftOnServer() {
  busy.value = true
  error.value = null
  problems.value = []
  info.value = null
  try {
    const p = await savePost('draft')
    info.value = `Saved as draft (post #${p.id}, revision ${p.revision}).`
    void posts.reload()
  } catch (e) {
    describe(e)
  } finally {
    busy.value = false
  }
}

async function queue() {
  busy.value = true
  error.value = null
  problems.value = []
  info.value = null
  queued.value = []
  try {
    const p = await savePost('ready')
    const targets: EnqueueTarget[] = previews.value.map((pv) => {
      const o = overrides[String(pv.target.id)]
      return {
        target_id: pv.target.id,
        ...(o?.title?.trim() ? { override_title: o.title } : {}),
        ...(o?.body ? { override_body: normalise(o.body) } : {}),
      }
    })
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
const posts = usePager<Post>((cursor) => c.http.get('/posts', { cursor, limit: 10 }), describeError)

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

const targetName = (id: number) => c.reference.value?.targets.find((t) => t.id === id)?.name ?? `target #${id}`
const problemFor = (id: number) => problems.value.find((p) => p.target_id === id)?.problem
</script>

<template>
  <div class="composer">
    <UiNotice v-if="error" type="error" :message="error" />
    <UiNotice v-if="info" type="ok" :message="info" />
    <UiNotice v-if="restoredAt && !postId && !info">
      Restored your unsent draft from {{ formatDateTime(restoredAt, c.zone.value) }}.
      <UiButton variant="ghost" @click="fresh">Discard it</UiButton>
    </UiNotice>

    <div class="composer-grid">
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

      <section class="preview" aria-labelledby="composer-fit">
        <h3 id="composer-fit">How it fits</h3>
        <p class="muted">Previews: the server counts again when you queue.</p>

        <template v-if="previews.length">
          <SegmentBar :bands="shared.bands" :length="shared.length" :names="sharedNames" />
          <p v-if="totalCost > 0" class="cost">
            Estimated cost: <strong>{{ formatUsd(totalCost) }}</strong> (an estimate; paid platforms are capped and reserved when queued — see Budgets).
          </p>
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
        <UiEmptyState v-else>Pick at least one target to see how the text fits.</UiEmptyState>
      </section>
    </div>

    <UiPanel v-if="existing.length || queued.length" title="Instances of this post" :level="3">
      <ul>
        <li v-for="i in [...existing, ...queued.filter((q) => !existing.some((e) => e.id === q.id))]" :key="i.id">
          #{{ i.id }} · {{ targetName(i.platform_target_id) }} · <UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge>
          <template v-if="i.last_error"> — {{ i.last_error }}</template>
        </li>
      </ul>
      <UiButton variant="secondary" @click="emit('navigate', 'instances')">Open Publishing</UiButton>
    </UiPanel>

    <PostsList :posts="posts" :busy="busy" @open="open" />
  </div>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.composer-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--space-md);
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.cost {
  margin: var(--space-xs) 0;
}
</style>
