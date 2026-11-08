<script setup lang="ts">
// Phases and items with their INTERNAL wording (never published) and PUBLIC wording side by side, and a preview of the
// public roadmap as each audience gets it. The preview is the public document itself (the same query the public
// process runs), not a guess made here.
import { computed, onMounted, reactive, ref } from 'vue'
import { ITEM_STATUS_VALUES, ITEM_TYPE_VALUES } from '@meddleware/content-hub-client'
import { UiBadge, UiButton, UiDataTable, UiDialog, UiEmptyState, UiNotice, UiPager, UiPanel, UiSegmentedControl, UiSelectField, usePager } from '@meddleware/ui'
import { formatDateTime, humanize } from '@meddleware/web-utils'
import { describeError } from '../api/errors.js'
import type { Item, ItemDetail, Phase, PublicRoadmap } from '../api/types.js'
import ItemForm from '../components/ItemForm.vue'
import PhaseForm from '../components/PhaseForm.vue'
import PublicPreview from '../components/PublicPreview.vue'
import { useConsole } from '../console.js'
import { itemBody, itemFields, newItem, newPhase, phaseBody, phaseFields, type ItemFields, type PhaseFields } from '../lib/roadmap-form.js'
import { statusLabel, statusTone } from '../lib/status.js'

const c = useConsole()
const view = ref<'internal' | 'human' | 'bot'>('internal')
const error = ref<string | null>(null)
const saved = ref<string | null>(null)
const VIEWS = [
  { id: 'internal', label: 'Internal (everything)' },
  { id: 'human', label: 'Public: people' },
  { id: 'bot', label: 'Public: bots' },
]
const STATUS_OPTIONS = ITEM_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
const TYPE_OPTIONS = ITEM_TYPE_VALUES.map((s) => [s, humanize(s)] as const)

// ── data ────────────────────────────────────────────────────────────────────────────────────────────────────
const phases = ref<Phase[]>([])
const filter = reactive({ phase: '', status: '', type: '' })
const items = usePager<Item>((cursor) => c.http.get('/items', { cursor, limit: 20, phase_id: filter.phase, status: filter.status, item_type: filter.type }), describeError)
const detail = ref<ItemDetail | null>(null)
const preview = ref<PublicRoadmap | null>(null)

async function loadPhases() {
  try {
    phases.value = await c.http.get<Phase[]>('/phases')
  } catch (e) {
    error.value = describeError(e)
  }
}
async function openItem(id: number) {
  error.value = null
  try {
    detail.value = await c.http.get<ItemDetail>(`/items/${id}`)
  } catch (e) {
    error.value = describeError(e)
  }
}
async function loadPreview(audience: 'human' | 'bot') {
  error.value = null
  preview.value = null
  try {
    preview.value = await c.http.get<PublicRoadmap>('/preview/roadmap', { audience })
  } catch (e) {
    error.value = describeError(e)
  }
}
function setView(v: string) {
  view.value = v as typeof view.value
  if (v === 'human' || v === 'bot') void loadPreview(v)
}
onMounted(() => {
  void loadPhases()
  void items.reset()
})

const phaseName = (id: number) => phases.value.find((p) => p.id === id)?.internal_name ?? `phase #${id}`
const phaseOptions = computed(() => phases.value.map((p) => [String(p.id), p.internal_name] as const))
const audiences = (x: { visible_human: boolean; visible_bot: boolean }) =>
  [x.visible_human ? 'people' : '', x.visible_bot ? 'bots' : ''].filter(Boolean).join(' and ') || 'nobody (internal only)'

// ── editing ─────────────────────────────────────────────────────────────────────────────────────────────────
type Editing = { kind: 'phase'; id: number | null } | { kind: 'item'; id: number | null } | null
const editing = ref<Editing>(null)
const dialogOpen = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)
const pf = ref<PhaseFields>(newPhase(1))
const itf = ref<ItemFields>(newItem(''))

const dialogTitle = computed(() => {
  const e = editing.value
  if (!e) return ''
  return `${e.id === null ? 'New' : 'Edit'} ${e.kind}`
})

function editPhase(p: Phase | null) {
  editing.value = { kind: 'phase', id: p?.id ?? null }
  pf.value = p ? phaseFields(p) : newPhase((phases.value.at(-1)?.sort_order ?? 0) + 1)
  formError.value = null
  dialogOpen.value = true
}
function editItem(i: Item | null) {
  editing.value = { kind: 'item', id: i?.id ?? null }
  itf.value = i ? itemFields(i) : newItem(filter.phase || String(phases.value[0]?.id ?? ''))
  formError.value = null
  dialogOpen.value = true
}

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
    <UiNotice v-if="error" type="error" :message="error" />
    <UiNotice v-if="saved" type="ok" :message="saved" />
    <UiSegmentedControl :model-value="view" :options="VIEWS" label="Roadmap view" layout="wrap" @update:model-value="setView" />

    <PublicPreview v-if="view !== 'internal'" :audience="view" :preview="preview" />

    <template v-else>
      <UiPanel title="Phases" :level="3">
        <div class="phases">
          <article v-for="p in phases" :key="p.id" class="phase">
            <h4>{{ p.sort_order }}. {{ p.internal_name }}</h4>
            <p class="muted">Public name: <strong>{{ p.public_name }}</strong> · shown to {{ audiences(p) }}</p>
            <UiButton variant="ghost" @click="editPhase(p)">Edit phase</UiButton>
          </article>
        </div>
        <UiEmptyState v-if="!phases.length">No phases yet.</UiEmptyState>
        <UiButton variant="secondary" @click="editPhase(null)">New phase</UiButton>
      </UiPanel>

      <UiPanel title="Items" :level="3">
        <div class="filters">
          <UiSelectField id="rm-phase" v-model="filter.phase" label="Phase" :options="phaseOptions" placeholder="All phases" @update:model-value="items.reset()" />
          <UiSelectField id="rm-status" v-model="filter.status" label="Status" :options="STATUS_OPTIONS" placeholder="Any status" @update:model-value="items.reset()" />
          <UiSelectField id="rm-type" v-model="filter.type" label="Type" :options="TYPE_OPTIONS" placeholder="Any type" @update:model-value="items.reset()" />
          <UiButton variant="secondary" @click="editItem(null)">New item</UiButton>
        </div>
        <UiNotice v-if="items.error.value" type="error" :message="items.error.value" />
        <UiDataTable caption="Roadmap items" empty="No items match." :rows="items.items.value.length">
          <template #head>
            <th scope="col">Internal title</th>
            <th scope="col">Public title</th>
            <th scope="col">Shown to</th>
            <th scope="col">Status</th>
            <th scope="col"><span class="mw-visually-hidden">Actions</span></th>
          </template>
          <tr v-for="i in items.items.value" :key="i.id">
            <th scope="row">{{ i.internal_title }}<span class="muted sub">{{ phaseName(i.phase_id) }} · {{ humanize(i.item_type) }}</span></th>
            <td>{{ i.public_title ?? '—' }}</td>
            <td>{{ audiences(i) }}</td>
            <td><UiBadge :tone="statusTone(i.status)">{{ statusLabel(i.status) }}</UiBadge></td>
            <td><UiButton variant="ghost" @click="openItem(i.id)">Details</UiButton></td>
          </tr>
        </UiDataTable>
        <UiPager :index="items.index.value" :has-next="items.hasNext.value" :loading="items.loading.value" label="Item pages" prev-label="Newer" next-label="Older" @prev="items.prev()" @next="items.next()" />
      </UiPanel>

      <UiPanel v-if="detail" :title="`Item: ${detail.item.internal_title}`" :level="3">
        <div class="two">
          <section aria-labelledby="rm-int">
            <h4 id="rm-int">Internal — never published</h4>
            <p><strong>{{ detail.item.internal_title }}</strong></p>
            <p>{{ detail.item.internal_description || 'No internal description.' }}</p>
            <p class="muted">Planned {{ formatDateTime(detail.item.planned_at, c.zone.value) }} · due {{ formatDateTime(detail.item.due_at, c.zone.value) }}</p>
          </section>
          <section aria-labelledby="rm-pub">
            <h4 id="rm-pub">Public wording — what visitors can see</h4>
            <p><strong>{{ detail.item.public_title ?? 'Not public (no public title)' }}</strong></p>
            <p>{{ detail.item.public_description ?? '' }}</p>
            <p class="muted">Shown to {{ audiences(detail.item) }} · public date {{ formatDateTime(detail.item.public_due_at, c.zone.value) }}</p>
          </section>
        </div>
        <UiButton variant="secondary" @click="editItem(detail.item)">Edit item</UiButton>
        <h4>Tasks</h4>
        <ul v-if="detail.tasks.length">
          <li v-for="t in detail.tasks" :key="t.id">{{ t.title }} <UiBadge :tone="statusTone(t.status)">{{ statusLabel(t.status) }}</UiBadge></li>
        </ul>
        <UiEmptyState v-else>No tasks.</UiEmptyState>
        <h4>Posts</h4>
        <ul v-if="detail.posts.length">
          <li v-for="p in detail.posts" :key="p.id">{{ p.title }} <UiBadge :tone="statusTone(p.status)">{{ statusLabel(p.status) }}</UiBadge></li>
        </ul>
        <UiEmptyState v-else>No posts.</UiEmptyState>
      </UiPanel>
    </template>

    <UiDialog v-model:open="dialogOpen" :title="dialogTitle" width="min(40rem, 94vw)">
      <UiNotice v-if="formError" type="error" :message="formError" />
      <PhaseForm v-if="editing?.kind === 'phase'" v-model="pf" />
      <ItemForm v-else-if="editing?.kind === 'item'" v-model="itf" :phase-options="phaseOptions" />
      <template #actions="{ close }">
        <UiButton variant="ghost" @click="close()">Cancel</UiButton>
        <UiButton variant="primary" :busy="saving" :disabled="c.expired.value" @click="save">Save</UiButton>
      </template>
    </UiDialog>
  </div>
</template>

<style scoped>
.roadmap {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.phases {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--space-sm);
  margin-bottom: var(--space-xs);
}

.phase {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);
}

.two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
  gap: var(--space-md);
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.sub {
  display: block;
}
</style>
