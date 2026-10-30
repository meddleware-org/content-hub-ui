<script setup lang="ts">
// The composer: write a post once, pick targets, see per platform how it renders and how much of it fits, then
// queue it. The counts and bands are PREVIEWS from @meddleware/content-hub-client (the same arithmetic as the server,
// pinned by the golden vectors); the server re-checks everything when the post is queued, and its answer is final.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { UiButton, UiNotice, UiPanel } from '@meddleware/ui'
import { ApiError, describeError } from '../api/errors.js'
import type { EnqueueTarget, Instance, Post, PostDetail, TargetProblem } from '../api/types.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import PagerNav from '../components/PagerNav.vue'
import RenderedText from '../components/RenderedText.js'
import SegmentBar from '../components/SegmentBar.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TextField from '../components/TextField.vue'
import UsageMeter from '../components/UsageMeter.vue'
import ZonedInput from '../components/ZonedInput.vue'
import { useConsole } from '../console.js'
import { bands, normalise, preview, truncateWithLink, usage, type Override } from '../lib/composer.js'
import { clearDraft, isBlank, loadDraft, saveDraft } from '../lib/drafts.js'
import { formatUsd } from '../lib/money.js'
import { usePager } from '../lib/pager.js'

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
const choices = computed(() => {
  const ref_ = c.reference.value
  if (!ref_) return []
  const defs = new Map(ref_.definitions.map((d) => [d.id, d]))
  return ref_.targets
    .map((t) => ({ target: t, def: defs.get(t.platform_definition_id) }))
    .filter((x): x is { target: typeof x.target; def: NonNullable<typeof x.def> } => x.def !== undefined && x.target.enabled && x.def.enabled && x.def.posting_mode !== 'none')
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

function toggle(id: number, on: boolean) {
  selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter((x) => x !== id)
}

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
const posts = usePager<Post>((cursor) => c.http.get('/posts', { cursor, limit: 10 }))

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
    <ErrorNotice :message="error" />
    <UiNotice v-if="info" type="ok">{{ info }}</UiNotice>
    <UiNotice v-if="restoredAt && !postId && !info">
      Restored your unsent draft from {{ new Date(restoredAt).toLocaleString() }}.
      <UiButton variant="ghost" @click="fresh">Discard it</UiButton>
    </UiNotice>

    <div class="composer-grid">
      <section class="editor" aria-labelledby="composer-write">
        <h3 id="composer-write">Write</h3>
        <TextField id="post-title" v-model="title" label="Title" hint="Used by platforms that have titles; also names the post here." :maxlength="300" />
        <TextField
          id="post-body"
          v-model="body"
          label="Text"
          :rows="10"
          hint="Canonical format: paragraphs, **bold**, *emphasis*, `code`, [links](https://example.org), lists. One text, rendered for each platform."
        />

        <fieldset class="targets">
          <legend>Publish to</legend>
          <p v-if="!choices.length" class="muted">No enabled targets yet. Add one under Publishing.</p>
          <label v-for="x in choices" :key="x.target.id" class="target-choice">
            <input type="checkbox" :checked="selected.includes(x.target.id)" @change="toggle(x.target.id, ($event.target as HTMLInputElement).checked)" />
            <span>
              {{ x.target.name }} <span class="muted">— {{ x.def.name }}<template v-if="x.def.posting_mode === 'manual'"> · posted by hand</template><template v-if="x.target.is_sandbox"> · sandbox</template><template v-if="!x.target.live && x.def.posting_mode !== 'manual'"> · dry run only</template></span>
            </span>
          </label>
        </fieldset>

        <ZonedInput id="post-when" v-model="scheduledAt" label="Send at" hint="Leave empty to send as soon as the worker picks it up." />

        <div class="actions">
          <UiButton variant="secondary" :disabled="busy || title.trim() === '' || c.expired.value" @click="saveDraftOnServer">Save draft</UiButton>
          <UiButton variant="primary" :disabled="!canQueue" @click="queue">Queue for {{ previews.length }} target{{ previews.length === 1 ? '' : 's' }}</UiButton>
          <UiButton variant="ghost" @click="fresh">New post</UiButton>
        </div>
        <p v-if="overflowing.length" class="muted" role="status">
          Too long for {{ overflowing.map((p) => p.target.name).join(', ') }}: shorten the text, or write a shorter version for that platform.
        </p>
      </section>

      <section class="preview" aria-labelledby="composer-fit">
        <h3 id="composer-fit">How it fits</h3>
        <p class="muted">Previews: the server counts again when you queue.</p>

        <template v-if="previews.length">
          <SegmentBar :bands="shared.bands" :length="shared.length" :names="sharedNames" />
          <p v-if="totalCost > 0" class="cost">
            Estimated cost: <strong>{{ formatUsd(totalCost) }}</strong> (an estimate; paid platforms are capped and reserved when queued — see Budgets).
          </p>

          <UiPanel v-for="p in previews" :key="p.target.id" :title="`${p.target.name} — ${p.def.name}`" :level="4" class="target-panel">
            <UiNotice v-if="problemFor(p.target.id)" type="error">{{ problemFor(p.target.id) }}</UiNotice>
            <UsageMeter
              v-if="usage(p)"
              label="Text"
              :used="usage(p)!.used"
              :limit="usage(p)!.limit"
              :unit="usage(p)!.unit"
            />
            <UsageMeter
              v-if="p.check && p.check.titleLimit !== null && p.check.titleCounted !== null"
              label="Title"
              :used="p.check.titleCounted"
              :limit="p.check.titleLimit"
            />
            <UsageMeter v-if="p.check && p.check.byteLimit !== null" label="Bytes" :used="p.check.bytes" :limit="p.check.byteLimit" />
            <p v-if="p.def.posting_mode === 'manual'" class="muted">Posted by hand: after queueing, an intent link and the text to copy appear under Publishing.</p>
            <p v-if="p.costMicros > 0" class="muted">Cost estimate: {{ formatUsd(p.costMicros) }}<template v-if="p.hasUrl"> (includes the price of a post with a link)</template>.</p>

            <h5 class="sub">As readers see it</h5>
            <RenderedText :source="p.body" />
            <details>
              <summary>Exactly what would be sent ({{ p.markup.replace('_', ' ') }})</summary>
              <pre class="payload">{{ p.payload }}</pre>
            </details>

            <details class="override">
              <summary>Write something different for this platform<template v-if="p.overridden"> (in use)</template></summary>
              <TextField
                :id="`ov-title-${p.target.id}`"
                label="Title for this platform"
                :model-value="overrides[String(p.target.id)]?.title ?? ''"
                :maxlength="300"
                @update:model-value="setOverride(p.target.id, 'title', $event)"
              />
              <TextField
                :id="`ov-body-${p.target.id}`"
                label="Text for this platform"
                hint="Replaces the shared text here only."
                :rows="5"
                :model-value="overrides[String(p.target.id)]?.body ?? ''"
                @update:model-value="setOverride(p.target.id, 'body', $event)"
              />
              <TextField
                :id="`ov-link-${p.target.id}`"
                :model-value="linkOf(p.target.id)"
                type="url"
                label="Link to end a shortened text with"
                placeholder="Paste the post link"
                hint="Shorten with link cuts the text and ends it with an ellipsis and this link, then counts the result."
                @update:model-value="setLink(p.target.id, $event)"
              />
              <div class="actions">
                <UiButton variant="secondary" :disabled="p.fits || !p.limits" @click="truncate(p.target.id)">Shorten with link</UiButton>
                <UiButton variant="ghost" :disabled="!p.overridden" @click="clearOverride(p.target.id)">Use the shared text</UiButton>
              </div>
            </details>
          </UiPanel>
        </template>
        <p v-else class="muted">Pick at least one target to see how the text fits.</p>
      </section>
    </div>

    <UiPanel v-if="existing.length || queued.length" title="Instances of this post" :level="3">
      <ul class="plain">
        <li v-for="i in [...existing, ...queued.filter((q) => !existing.some((e) => e.id === q.id))]" :key="i.id">
          #{{ i.id }} · {{ targetName(i.platform_target_id) }} · <StatusBadge :status="i.status" />
          <template v-if="i.last_error"> — {{ i.last_error }}</template>
        </li>
      </ul>
      <UiButton variant="secondary" @click="emit('navigate', 'instances')">Open Publishing</UiButton>
    </UiPanel>

    <UiPanel title="Your posts" :level="3">
      <ErrorNotice :message="posts.error.value" />
      <ul class="plain posts">
        <li v-for="p in posts.items.value" :key="p.id">
          <span>
            <strong>{{ p.title }}</strong>
            <span class="muted"> — {{ p.status }}, revision {{ p.revision }}</span>
          </span>
          <UiButton variant="ghost" :disabled="busy" @click="open(p.id)">Open</UiButton>
        </li>
        <li v-if="!posts.items.value.length && !posts.loading.value" class="muted">No posts yet.</li>
      </ul>
      <PagerNav :index="posts.index.value" :has-next="posts.hasNext.value" :loading="posts.loading.value" label="Posts pages" @prev="posts.prev()" @next="posts.next()" />
    </UiPanel>
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
  grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr));
  gap: var(--space-md);
}

.targets {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  margin: var(--space-sm) 0;
  padding: var(--space-xs) var(--space-sm);
}

.target-choice {
  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
  padding: var(--space-3xs) 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin: var(--space-sm) 0;
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.cost {
  margin: var(--space-xs) 0;
}

.sub {
  margin: var(--space-xs) 0 var(--space-3xs);
}

.target-panel {
  margin-top: var(--space-sm);
}

.payload {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
}

.plain {
  list-style: none;
  padding: 0;
  margin: 0;
}

.posts li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-3xs) 0;
  border-bottom: 1px solid var(--border);
}
</style>
