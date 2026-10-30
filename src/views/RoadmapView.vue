<script setup lang="ts">
// Phases and items with their INTERNAL wording (never published) and PUBLIC wording side by side, and a preview of the
// public roadmap as each audience gets it. The preview is the public document itself (the same query the public
// process runs), not a guess made here.
import { computed, onMounted, reactive, ref } from 'vue'
import { ITEM_STATUS_VALUES, ITEM_TYPE_VALUES } from '@meddleware/content-hub-client'
import { UiButton, UiDataTable, UiDialog, UiNotice, UiPanel } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { Item, ItemDetail, Phase, PublicRoadmap } from '../api/types.js'
import CheckField from '../components/CheckField.vue'
import ErrorNotice from '../components/ErrorNotice.vue'
import ModeSwitch from '../components/ModeSwitch.vue'
import PagerNav from '../components/PagerNav.vue'
import SelectField from '../components/SelectField.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TableScroll from '../components/TableScroll.vue'
import TextField from '../components/TextField.vue'
import ZonedInput from '../components/ZonedInput.vue'
import { useConsole } from '../console.js'
import { usePager } from '../lib/pager.js'
import { formatDateTime } from '../lib/time.js'

const c = useConsole()
const view = ref<'internal' | 'human' | 'bot'>('internal')
const error = ref<string | null>(null)
const saved = ref<string | null>(null)

// ── data ────────────────────────────────────────────────────────────────────────────────────────────────────
const phases = ref<Phase[]>([])
const filter = reactive({ phase: '', status: '', type: '' })
const items = usePager<Item>((cursor) =>
  c.http.get('/items', { cursor, limit: 20, phase_id: filter.phase, status: filter.status, item_type: filter.type }),
)
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

const pf = reactive({
  key: '', sort_order: '1', internal_name: '', internal_description: '', public_name: '', public_description: '',
  window_start: null as string | null, window_end: null as string | null, visible_human: false, visible_bot: false,
})
const itf = reactive({
  phase_id: '', key: '', item_type: 'other', internal_title: '', internal_description: '', public_title: '', public_description: '',
  visible_human: false, visible_bot: false, status: 'planned',
  planned_at: null as string | null, due_at: null as string | null, public_due_at: null as string | null,
})

function editPhase(p: Phase | null) {
  editing.value = { kind: 'phase', id: p?.id ?? null }
  Object.assign(pf, p
    ? { key: p.key, sort_order: String(p.sort_order), internal_name: p.internal_name, internal_description: p.internal_description, public_name: p.public_name, public_description: p.public_description, window_start: p.window_start, window_end: p.window_end, visible_human: p.visible_human, visible_bot: p.visible_bot }
    : { key: '', sort_order: String((phases.value.at(-1)?.sort_order ?? 0) + 1), internal_name: '', internal_description: '', public_name: '', public_description: '', window_start: null, window_end: null, visible_human: false, visible_bot: false })
  formError.value = null
  dialogOpen.value = true
}
function editItem(i: Item | null) {
  editing.value = { kind: 'item', id: i?.id ?? null }
  Object.assign(itf, i
    ? { phase_id: String(i.phase_id), key: i.key, item_type: i.item_type, internal_title: i.internal_title, internal_description: i.internal_description, public_title: i.public_title ?? '', public_description: i.public_description ?? '', visible_human: i.visible_human, visible_bot: i.visible_bot, status: i.status, planned_at: i.planned_at, due_at: i.due_at, public_due_at: i.public_due_at }
    : { phase_id: filter.phase || String(phases.value[0]?.id ?? ''), key: '', item_type: 'other', internal_title: '', internal_description: '', public_title: '', public_description: '', visible_human: false, visible_bot: false, status: 'planned', planned_at: null, due_at: null, public_due_at: null })
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
      const body = {
        key: pf.key.trim(), sort_order: Number(pf.sort_order), internal_name: pf.internal_name, internal_description: pf.internal_description,
        public_name: pf.public_name, public_description: pf.public_description, window_start: pf.window_start, window_end: pf.window_end,
        visible_human: pf.visible_human, visible_bot: pf.visible_bot,
      }
      if (e.id === null) await c.http.post('/phases', body)
      else await c.http.patch(`/phases/${e.id}`, body)
      await loadPhases()
    } else {
      const body = {
        phase_id: Number(itf.phase_id), key: itf.key.trim(), item_type: itf.item_type, internal_title: itf.internal_title,
        internal_description: itf.internal_description, public_title: itf.public_title.trim() || null,
        public_description: itf.public_description.trim() || null, visible_human: itf.visible_human, visible_bot: itf.visible_bot,
        status: itf.status, planned_at: itf.planned_at, due_at: itf.due_at, public_due_at: itf.public_due_at,
      }
      if (e.id === null) await c.http.post('/items', body)
      else await c.http.patch(`/items/${e.id}`, body)
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
    <ErrorNotice :message="error" />
    <UiNotice v-if="saved" type="ok">{{ saved }}</UiNotice>
    <ModeSwitch
      :model-value="view"
      label="Roadmap view"
      :options="[
        { id: 'internal', label: 'Internal (everything)' },
        { id: 'human', label: 'Public: people' },
        { id: 'bot', label: 'Public: bots' },
      ]"
      @update:model-value="setView"
    />

    <!-- The public documents, exactly as the public process returns them. -->
    <template v-if="view !== 'internal'">
      <UiNotice>
        This is the public document for {{ view === 'human' ? 'people (/public/v1/roadmap)' : 'bots (/public/v1/roadmap-bot)' }}, produced by the same code the public site uses. Internal names, descriptions and dates never appear in it.
      </UiNotice>
      <UiPanel v-if="preview" title="What visitors get" :level="3">
        <p v-if="!preview.phases.length" class="muted">Nothing is public for this audience yet.</p>
        <section v-for="p in preview.phases" :key="p.id" class="pub-phase">
          <h4>{{ p.name }}</h4>
          <p v-if="p.description">{{ p.description }}</p>
          <p v-if="p.window_start || p.window_end" class="muted">{{ formatDateTime(p.window_start, c.zone.value) }} – {{ formatDateTime(p.window_end, c.zone.value) }}</p>
          <ul>
            <li v-for="i in p.items" :key="i.id">
              <strong>{{ i.title }}</strong> <StatusBadge :status="i.status" />
              <template v-if="i.due_at"> · due {{ formatDateTime(i.due_at, c.zone.value) }}</template>
              <br />{{ i.description }}
            </li>
          </ul>
        </section>
        <details>
          <summary>The exact JSON document</summary>
          <pre class="json">{{ JSON.stringify(preview, null, 2) }}</pre>
        </details>
      </UiPanel>
    </template>

    <template v-else>
      <UiPanel title="Phases" :level="3">
        <div class="phases">
          <article v-for="p in phases" :key="p.id" class="phase">
            <h4>{{ p.sort_order }}. {{ p.internal_name }}</h4>
            <p class="muted">Public name: <strong>{{ p.public_name }}</strong> · shown to {{ audiences(p) }}</p>
            <UiButton variant="ghost" @click="editPhase(p)">Edit phase</UiButton>
          </article>
          <p v-if="!phases.length" class="muted">No phases yet.</p>
        </div>
        <UiButton variant="secondary" @click="editPhase(null)">New phase</UiButton>
      </UiPanel>

      <UiPanel title="Items" :level="3">
        <div class="filters">
          <SelectField id="rm-phase" v-model="filter.phase" label="Phase" :options="phaseOptions" placeholder="All phases" @update:model-value="items.reset()" />
          <SelectField id="rm-status" v-model="filter.status" label="Status" :options="ITEM_STATUS_VALUES.map((s) => [s, s.replace('_', ' ')] as const)" placeholder="Any status" @update:model-value="items.reset()" />
          <SelectField id="rm-type" v-model="filter.type" label="Type" :options="ITEM_TYPE_VALUES.map((s) => [s, s.replace('_', ' ')] as const)" placeholder="Any type" @update:model-value="items.reset()" />
          <UiButton variant="secondary" @click="editItem(null)">New item</UiButton>
        </div>
        <ErrorNotice :message="items.error.value" />
        <TableScroll label="Roadmap items">
        <UiDataTable empty="No items match.">
          <template #head>
            <tr>
              <th scope="col">Internal title</th>
              <th scope="col">Public title</th>
              <th scope="col">Shown to</th>
              <th scope="col">Status</th>
              <th scope="col"><span class="sr-only">Actions</span></th>
            </tr>
          </template>
          <tr v-for="i in items.items.value" :key="i.id">
            <th scope="row">{{ i.internal_title }}<br /><span class="muted">{{ phaseName(i.phase_id) }} · {{ i.item_type.replace('_', ' ') }}</span></th>
            <td>{{ i.public_title ?? '—' }}</td>
            <td>{{ audiences(i) }}</td>
            <td><StatusBadge :status="i.status" /></td>
            <td><UiButton variant="ghost" @click="openItem(i.id)">Details</UiButton></td>
          </tr>
        </UiDataTable>
        </TableScroll>
        <PagerNav :index="items.index.value" :has-next="items.hasNext.value" :loading="items.loading.value" label="Item pages" @prev="items.prev()" @next="items.next()" />
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
        <ul v-if="detail.tasks.length" class="plain">
          <li v-for="t in detail.tasks" :key="t.id">{{ t.title }} <StatusBadge :status="t.status" /></li>
        </ul>
        <p v-else class="muted">No tasks.</p>
        <h4>Posts</h4>
        <ul v-if="detail.posts.length" class="plain">
          <li v-for="p in detail.posts" :key="p.id">{{ p.title }} <StatusBadge :status="p.status" /></li>
        </ul>
        <p v-else class="muted">No posts.</p>
      </UiPanel>
    </template>

    <UiDialog v-model:open="dialogOpen" :title="editing?.kind === 'phase' ? (editing.id === null ? 'New phase' : 'Edit phase') : editing?.id === null ? 'New item' : 'Edit item'" width="min(40rem, 94vw)">
      <ErrorNotice :message="formError" />
      <template v-if="editing?.kind === 'phase'">
        <TextField id="pf-key" v-model="pf.key" label="Key" hint="Lower-case letters, digits and hyphens." />
        <TextField id="pf-order" v-model="pf.sort_order" label="Position" inputmode="numeric" />
        <TextField id="pf-iname" v-model="pf.internal_name" label="Internal name (never published)" />
        <TextField id="pf-idesc" v-model="pf.internal_description" label="Internal description (never published)" :rows="3" />
        <TextField id="pf-pname" v-model="pf.public_name" label="Public name" />
        <TextField id="pf-pdesc" v-model="pf.public_description" label="Public description" :rows="3" />
        <ZonedInput id="pf-start" v-model="pf.window_start" label="Window starts" />
        <ZonedInput id="pf-end" v-model="pf.window_end" label="Window ends" />
        <CheckField v-model="pf.visible_human" label="Show to people" />
        <CheckField v-model="pf.visible_bot" label="Show to bots" />
      </template>
      <template v-else-if="editing?.kind === 'item'">
        <SelectField id="if-phase" v-model="itf.phase_id" label="Phase" :options="phaseOptions" />
        <TextField id="if-key" v-model="itf.key" label="Key" hint="Lower-case letters, digits and hyphens." />
        <SelectField id="if-type" v-model="itf.item_type" label="Type" :options="ITEM_TYPE_VALUES.map((s) => [s, s.replace('_', ' ')] as const)" />
        <SelectField id="if-status" v-model="itf.status" label="Status" :options="ITEM_STATUS_VALUES.map((s) => [s, s.replace('_', ' ')] as const)" />
        <TextField id="if-ititle" v-model="itf.internal_title" label="Internal title (never published)" />
        <TextField id="if-idesc" v-model="itf.internal_description" label="Internal description (never published)" :rows="3" />
        <TextField id="if-ptitle" v-model="itf.public_title" label="Public title" hint="Required before the item can be shown to anyone." />
        <TextField id="if-pdesc" v-model="itf.public_description" label="Public description" :rows="3" />
        <CheckField v-model="itf.visible_human" label="Show to people" />
        <CheckField v-model="itf.visible_bot" label="Show to bots" />
        <ZonedInput id="if-planned" v-model="itf.planned_at" label="Planned (internal)" />
        <ZonedInput id="if-due" v-model="itf.due_at" label="Due (internal)" />
        <ZonedInput id="if-pdue" v-model="itf.public_due_at" label="Public date" hint="Optional; shown to visitors when set." />
      </template>
      <template #actions="{ close }">
        <UiButton variant="ghost" @click="close()">Cancel</UiButton>
        <UiButton variant="primary" :disabled="saving || c.expired.value" @click="save">Save</UiButton>
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
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
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
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: var(--space-md);
}

.json {
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
