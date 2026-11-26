<script setup lang="ts">
// Phases and items with their INTERNAL wording (never published) and PUBLIC wording side by side, and a preview of the public roadmap as each audience gets it. The preview is the
// public document itself (the same query the public process runs), not a guess made here. Related: components/PhaseForm.vue, ItemForm.vue, PublicPreview.vue, lib/roadmap-form.ts.
// Vue's reactivity and lifecycle.
import { computed, onMounted, reactive, ref } from 'vue'
// The shared vocabularies of item statuses and types.
import { ITEM_STATUS_VALUES, ITEM_TYPE_VALUES } from '@meddleware/content-hub-client'
// The shared badge, button, table, dialog, empty state, notice, pager, panel, segmented control and select, and the cursor pager.
import { UiBadge, UiButton, UiDataTable, UiDialog, UiEmptyState, UiNotice, UiPager, UiPanel, UiSegmentedControl, UiSelectField, usePager } from '@meddleware/ui'
// Dates in the chosen zone, and words for a value.
import { formatDateTime, humanize } from '@meddleware/web-utils'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The response shapes.
import type { Item, ItemDetail, Phase, PublicRoadmap } from '../api/types.js'
// The item's form fields.
import ItemForm from '../components/ItemForm.vue'
// The phase's form fields.
import PhaseForm from '../components/PhaseForm.vue'
// The public roadmap as an audience gets it.
import PublicPreview from '../components/PublicPreview.vue'
// The console context.
import { useConsole } from '../console.js'
// The form data and request bodies.
import { itemBody, itemFields, newItem, newPhase, phaseBody, phaseFields, type ItemFields, type PhaseFields } from '../lib/roadmap-form.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// The console context.
const c = useConsole()
// Which view is open: the internal one, or a public one for people or for bots.
const view = ref<'internal' | 'human' | 'bot'>('internal')
// A failed request, in words.
const error = ref<string | null>(null)
// A confirmation.
const saved = ref<string | null>(null)
// The three views.
const VIEWS = [
  { id: 'internal', label: 'Internal (everything)' },
  { id: 'human', label: 'Public: people' },
  { id: 'bot', label: 'Public: bots' },
]
// The item statuses as options.
const STATUS_OPTIONS = ITEM_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
// The item types as options.
const TYPE_OPTIONS = ITEM_TYPE_VALUES.map((s) => [s, humanize(s)] as const)

// ── data ────────────────────────────────────────────────────────────────────────────────────────────────────
// The phases.
const phases = ref<Phase[]>([])
// The items list's filters.
const filter = reactive({ phase: '', status: '', type: '' })
// The items, twenty at a time, filtered.
const items = usePager<Item>((cursor) => c.http.get('/items', { cursor, limit: 20, phase_id: filter.phase, status: filter.status, item_type: filter.type }), describeError)
// The open item, with its tasks and posts.
const detail = ref<ItemDetail | null>(null)
// The public document for the chosen audience.
const preview = ref<PublicRoadmap | null>(null)

/** Read the phases. */
async function loadPhases() {
  try {
    phases.value = await c.http.get<Phase[]>('/phases')
  } catch (e) {
    error.value = describeError(e)
  }
}
/** Open an item with its tasks and posts. */
async function openItem(id: number) {
  error.value = null
  try {
    detail.value = await c.http.get<ItemDetail>(`/items/${id}`)
  } catch (e) {
    error.value = describeError(e)
  }
}
/** Read the public roadmap for an audience. */
async function loadPreview(audience: 'human' | 'bot') {
  error.value = null
  preview.value = null
  try {
    preview.value = await c.http.get<PublicRoadmap>('/preview/roadmap', { audience })
  } catch (e) {
    error.value = describeError(e)
  }
}
/** Switch view; a public view loads its document. */
function setView(v: string) {
  view.value = v as typeof view.value
  if (v === 'human' || v === 'bot') void loadPreview(v)
}
// Load the phases and the first page of items.
onMounted(() => {
  void loadPhases()
  void items.reset()
})

// A phase's internal name, or its number when it is missing.
const phaseName = (id: number) => phases.value.find((p) => p.id === id)?.internal_name ?? `phase #${id}`
// The phases as options.
const phaseOptions = computed(() => phases.value.map((p) => [String(p.id), p.internal_name] as const))
// Who may see something, in words.
const audiences = (x: { visible_human: boolean; visible_bot: boolean }) =>
  [x.visible_human ? 'people' : '', x.visible_bot ? 'bots' : ''].filter(Boolean).join(' and ') || 'nobody (internal only)'

// ── editing ─────────────────────────────────────────────────────────────────────────────────────────────────
/** What the dialog is editing: a phase or an item, and which (a null id means a new one). */
type Editing = { kind: 'phase'; id: number | null } | { kind: 'item'; id: number | null } | null
// What the dialog is editing.
const editing = ref<Editing>(null)
// Whether the dialog is open.
const dialogOpen = ref(false)
// True while a save is in flight.
const saving = ref(false)
// An error inside the dialog.
const formError = ref<string | null>(null)
// The phase form.
const pf = ref<PhaseFields>(newPhase(1))
// The item form.
const itf = ref<ItemFields>(newItem(''))

// The dialog's title: New or Edit, and which kind.
const dialogTitle = computed(() => {
  const e = editing.value
  if (!e) return ''
  return `${e.id === null ? 'New' : 'Edit'} ${e.kind}`
})

/** Open the dialog for a phase (null for a new one, which goes last). */
function editPhase(p: Phase | null) {
  editing.value = { kind: 'phase', id: p?.id ?? null }
  pf.value = p ? phaseFields(p) : newPhase((phases.value.at(-1)?.sort_order ?? 0) + 1)
  formError.value = null
  dialogOpen.value = true
}
/** Open the dialog for an item (null for a new one, which starts in the phase being looked at). */
function editItem(i: Item | null) {
  editing.value = { kind: 'item', id: i?.id ?? null }
  itf.value = i ? itemFields(i) : newItem(filter.phase || String(phases.value[0]?.id ?? ''))
  formError.value = null
  dialogOpen.value = true
}

/** Create or update the phase or item being edited, then refresh what depends on it. */
async function save() {
  const e = editing.value
  if (!e) return
  saving.value = true
  formError.value = null
  try {
    if (e.kind === 'phase') {
      if (e.id === null) await c.http.post('/phases', phaseBody(pf.value))
      else await c.http.patch(`/phases/${e.id}`, phaseBody(pf.value))
      await loadPhases()
    } else {
      if (e.id === null) await c.http.post('/items', itemBody(itf.value))
      else await c.http.patch(`/items/${e.id}`, itemBody(itf.value))
      await items.reload()
      if (detail.value && e.id === detail.value.item.id) await openItem(e.id)
    }
    saved.value = e.kind === 'phase' ? 'Phase saved.' : 'Item saved.'
    dialogOpen.value = false
  } catch (err) {
    formError.value = describeError(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="roadmap">
    <!-- A failed request, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />
    <!-- A confirmation. -->
    <UiNotice v-if="saved" type="ok" :message="saved" />
    <!-- Internal, public for people, public for bots. -->
    <UiSegmentedControl :model-value="view" :options="VIEWS" label="Roadmap view" layout="wrap" @update:model-value="setView" />

    <!-- A public view shows the document itself. -->
    <PublicPreview v-if="view !== 'internal'" :audience="view" :preview="preview" />

    <!-- The internal view. -->
    <template v-else>
      <!-- The phases, with their internal and public names. -->
      <UiPanel title="Phases" :level="3">
        <div class="phases">
          <!-- One card per phase. -->
          <article v-for="p in phases" :key="p.id" class="phase">
            <h4>{{ p.sort_order }}. {{ p.internal_name }}</h4>
            <p class="muted">Public name: <strong>{{ p.public_name }}</strong> · shown to {{ audiences(p) }}</p>
            <UiButton variant="ghost" @click="editPhase(p)">Edit phase</UiButton>
          </article>
        </div>
        <!-- No phases yet. -->
        <UiEmptyState v-if="!phases.length">No phases yet.</UiEmptyState>
        <!-- Start a new phase. -->
        <UiButton variant="secondary" @click="editPhase(null)">New phase</UiButton>
      </UiPanel>

      <!-- The items, filtered and paged. -->
      <UiPanel title="Items" :level="3">
        <!-- The filters, and the new-item button. -->
        <div class="filters">
          <UiSelectField id="rm-phase" v-model="filter.phase" label="Phase" :options="phaseOptions" placeholder="All phases" @update:model-value="items.reset()" />
          <UiSelectField id="rm-status" v-model="filter.status" label="Status" :options="STATUS_OPTIONS" placeholder="Any status" @update:model-value="items.reset()" />
          <UiSelectField id="rm-type" v-model="filter.type" label="Type" :options="TYPE_OPTIONS" placeholder="Any type" @update:model-value="items.reset()" />
          <UiButton variant="secondary" @click="editItem(null)">New item</UiButton>
        </div>
        <UiNotice v-if="items.error.value" type="error" :message="items.error.value" />
        <!-- The items table. -->
        <UiDataTable caption="Roadmap items" empty="No items match." :rows="items.items.value.length">
          <!-- Column headings; the last is the details button, hidden visually. -->
          <template #head>
            <th scope="col">Internal title</th>
            <th scope="col">Public title</th>
            <th scope="col">Shown to</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="mw-visually-hidden">Actions</span></th>
          </template>
          <!-- One row per item. -->
          <tr v-for="i in items.items.value" :key="i.id">
            <!-- The internal title, with its phase and type beneath. -->
            <th scope="row">{{ i.internal_title }}<span class="muted sub">{{ phaseName(i.phase_id) }} · {{ humanize(i.item_type) }}</span></th>
            <!-- The public title, or a dash when there is none. -->
            <td>{{ i.public_title ?? '—' }}</td>
            <!-- Who may see it. -->
            <td>{{ audiences(i) }}</td>
            <!-- The status in words with a tone. -->
            <td><UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge></td>
            <td><UiButton variant="ghost" @click="openItem(i.id)">Details</UiButton></td>
          </tr>
        </UiDataTable>
        <!-- Newer and older pages. -->
        <UiPager :index="items.index.value" :has-next="items.hasNext.value" :loading="items.loading.value" label="Item pages" prev-label="Newer" next-label="Older" @prev="items.prev()" @next="items.next()" />
      </UiPanel>

      <!-- The open item, internal and public wording side by side. -->
      <UiPanel v-if="detail" :title="`Item: ${detail.item.internal_title}`" :level="3">
        <!-- Two columns that stack on a narrow screen. -->
        <div class="two">
          <!-- The internal wording, never published. -->
          <section aria-labelledby="rm-int">
            <h4 id="rm-int">Internal — never published</h4>
            <p><strong>{{ detail.item.internal_title }}</strong></p>
            <p>{{ detail.item.internal_description || 'No internal description.' }}</p>
            <p class="muted">Planned {{ formatDateTime(detail.item.planned_at, c.zone.value) }} · due {{ formatDateTime(detail.item.due_at, c.zone.value) }}</p>
          </section>
          <!-- The public wording, which is what visitors can see. -->
          <section aria-labelledby="rm-pub">
            <h4 id="rm-pub">Public wording — what visitors can see</h4>
            <p><strong>{{ detail.item.public_title ?? 'Not public (no public title)' }}</strong></p>
            <p>{{ detail.item.public_description ?? '' }}</p>
            <p class="muted">Shown to {{ audiences(detail.item) }} · public date {{ formatDateTime(detail.item.public_due_at, c.zone.value) }}</p>
          </section>
        </div>
        <!-- Edit the item. -->
        <UiButton variant="secondary" @click="editItem(detail.item)">Edit item</UiButton>
        <!-- The item's tasks. -->
        <h4>Tasks</h4>
        <ul v-if="detail.tasks.length">
          <li v-for="t in detail.tasks" :key="t.id">{{ t.title }} <UiBadge :tone="statusTone(t.status)">{{ statusLabel(t.status) }}</UiBadge></li>
        </ul>
        <UiEmptyState v-else>No tasks.</UiEmptyState>
        <!-- The item's posts. -->
        <h4>Posts</h4>
        <ul v-if="detail.posts.length">
          <li v-for="p in detail.posts" :key="p.id">{{ p.title }} <UiBadge :tone="statusTone(p.status)">{{ statusLabel(p.status) }}</UiBadge></li>
        </ul>
        <UiEmptyState v-else>No posts.</UiEmptyState>
      </UiPanel>
    </template>

    <!-- The create or edit dialog, for a phase or an item. -->
    <UiDialog v-model:open="dialogOpen" :title="dialogTitle" width="min(40rem, 94vw)">
      <UiNotice v-if="formError" type="error" :message="formError" />
      <!-- The phase's fields. -->
      <PhaseForm v-if="editing?.kind === 'phase'" v-model="pf" />
      <!-- The item's fields. -->
      <ItemForm v-else-if="editing?.kind === 'item'" v-model="itf" :phase-options="phaseOptions" />
      <template #actions="{ close }">
        <UiButton variant="ghost" @click="close()">Cancel</UiButton>
        <UiButton variant="primary" :busy="saving" :disabled="c.expired.value" @click="save">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.roadmap {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The filters wrap and align at the bottom. */
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* As many phase cards as fit, each at least 16rem. */
.phases {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

/* A bordered card. */
.phase {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
}

/* Two columns that stack on a narrow screen. */
.two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--space-md);
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
