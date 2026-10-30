<script setup lang="ts">
// Monthly spend caps per platform, usage against them, and the audit trail of changes. The instance ceilings (the
// deployment's configuration) bound every cap; the server refuses a cap above them and is the only enforcer.
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { UiButton, UiDataTable, UiNotice, UiPanel } from '@meddleware/ui'
import { describeError } from '../api/errors.js'
import type { AuditEntry, Budgets, SpendCap } from '../api/types.js'
import ErrorNotice from '../components/ErrorNotice.vue'
import PagerNav from '../components/PagerNav.vue'
import SelectField from '../components/SelectField.vue'
import TableScroll from '../components/TableScroll.vue'
import TextField from '../components/TextField.vue'
import UsageMeter from '../components/UsageMeter.vue'
import { useConsole } from '../console.js'
import { LEVEL_TEXT, describeChange, rows as buildRows } from '../lib/budgets.js'
import { formatUsd, parseUsd } from '../lib/money.js'
import { formatDateTime } from '../lib/time.js'
import { usePager } from '../lib/pager.js'

const c = useConsole()
const budgets = ref<Budgets | null>(null)
const error = ref<string | null>(null)
const saved = ref<string | null>(null)
const saving = ref(false)
const edits = reactive<Record<string, { limit: string; daily: string; error: string | null }>>({})
const addTarget = ref('')
const addLimit = ref('')

const table = computed(() => (budgets.value && c.reference.value ? buildRows(budgets.value, c.reference.value.definitions, c.reference.value.targets) : []))

function seedEdits() {
  for (const k of Object.keys(edits)) delete edits[k]
  for (const r of table.value) {
    edits[r.key] = { limit: r.row ? formatUsd(r.row.monthly_limit_usd_micros).replace('$', '') : '', daily: r.row?.daily_post_limit?.toString() ?? '', error: null }
  }
}

async function load() {
  error.value = null
  try {
    await c.loadReference()
    budgets.value = await c.http.get<Budgets>('/budgets')
    seedEdits()
  } catch (e) {
    error.value = describeError(e)
  }
}

const audit = usePager<AuditEntry>((cursor) => c.http.get('/audit', { entity_type: 'budgets', cursor, limit: 10 }))
onMounted(() => {
  void load()
  void audit.reset()
})
watch(table, () => {
  if (Object.keys(edits).length === 0) seedEdits()
})

const ceilingText = computed(() =>
  budgets.value ? `Instance ceilings: ${formatUsd(budgets.value.ceilings.total_monthly_usd_micros)} in total, ${formatUsd(budgets.value.ceilings.per_platform_monthly_usd_micros)} per platform, a month.` : '',
)

const targetChoices = computed<Array<readonly [string, string]>>(() =>
  (c.reference.value?.targets ?? [])
    .filter((t) => !budgets.value?.caps.some((x) => x.scope === 'target' && x.platform_target_id === t.id))
    .map((t) => [String(t.id), `${t.name} (${t.platform_code})`] as const),
)

/** The most a cap of this scope may be (the instance ceiling). */
function ceilingFor(scope: SpendCap['scope']): number {
  const c0 = budgets.value?.ceilings
  if (!c0) return 0
  return scope === 'total' ? c0.total_monthly_usd_micros : Math.min(c0.per_platform_monthly_usd_micros, c0.total_monthly_usd_micros)
}

/** The cap inputs that differ from what is stored, as the PUT body's entries. */
function pending() {
  const out: Array<{ scope: SpendCap['scope']; platform_definition_id?: number; platform_target_id?: number; monthly_limit_usd_micros: number; daily_post_limit: number | null }> = []
  let ok = true
  for (const r of table.value) {
    const e = edits[r.key]
    if (!e) continue
    e.error = null
    const unchanged = (e.limit === '' && !r.row) || (r.row && parseUsd(e.limit) === r.row.monthly_limit_usd_micros && (e.daily === '' ? null : Number(e.daily)) === r.row.daily_post_limit)
    if (unchanged) continue
    if (e.limit === '') {
      e.error = 'Give a monthly limit in dollars (0 allowed).'
      ok = false
      continue
    }
    const micros = parseUsd(e.limit)
    const daily = e.daily === '' ? null : Number(e.daily)
    if (micros === null) {
      e.error = 'Enter dollars with at most six decimals, for example 25 or 0.015.'
      ok = false
    } else if (daily !== null && (!Number.isInteger(daily) || daily <= 0)) {
      e.error = 'The daily post limit is a whole number above zero, or empty.'
      ok = false
    } else if (micros > ceilingFor(r.scope)) {
      e.error = `Above the instance ceiling of ${formatUsd(ceilingFor(r.scope))}. Raise the ceiling in the deployment's configuration first.`
      ok = false
    } else {
      out.push({
        scope: r.scope,
        ...(r.platformId !== null ? { platform_definition_id: r.platformId } : {}),
        ...(r.targetId !== null ? { platform_target_id: r.targetId } : {}),
        monthly_limit_usd_micros: micros,
        daily_post_limit: daily,
      })
    }
  }
  return ok ? out : null
}

async function save() {
  const caps = pending()
  saved.value = null
  if (caps === null) return
  if (caps.length === 0) {
    saved.value = 'Nothing to save: no cap was changed.'
    return
  }
  saving.value = true
  error.value = null
  try {
    budgets.value = await c.http.put<Budgets>('/budgets', { caps })
    seedEdits()
    saved.value = `Saved ${caps.length} cap${caps.length === 1 ? '' : 's'}.`
    void audit.reset()
  } catch (e) {
    error.value = describeError(e)
  } finally {
    saving.value = false
  }
}

async function addTargetCap() {
  const t = c.reference.value?.targets.find((x) => String(x.id) === addTarget.value)
  const micros = parseUsd(addLimit.value)
  if (!t || micros === null) {
    error.value = 'Choose a target and give its monthly limit in dollars.'
    return
  }
  saving.value = true
  error.value = null
  try {
    budgets.value = await c.http.put<Budgets>('/budgets', { caps: [{ scope: 'target', platform_target_id: t.id, monthly_limit_usd_micros: micros }] })
    seedEdits()
    addTarget.value = ''
    addLimit.value = ''
    saved.value = `Capped ${t.name}.`
    void audit.reset()
  } catch (e) {
    error.value = describeError(e)
  } finally {
    saving.value = false
  }
}

function capName(cap: SpendCap): string {
  if (cap.scope === 'total') return 'All platforms'
  if (cap.scope === 'platform') return c.reference.value?.definitions.find((d) => d.id === cap.platform_definition_id)?.name ?? `platform #${cap.platform_definition_id}`
  return c.reference.value?.targets.find((t) => t.id === cap.platform_target_id)?.name ?? `target #${cap.platform_target_id}`
}
const changes = (a: AuditEntry) => describeChange(a.before, a.after, capName)
</script>

<template>
  <div class="budgets">
    <ErrorNotice :message="error" />
    <UiNotice v-if="saved" type="ok">{{ saved }}</UiNotice>
    <UiNotice>
      Nothing is spent without a cap, and every cap starts at zero. {{ ceilingText }} A cap cannot exceed the ceiling; to raise a ceiling, change the deployment's configuration.
      Paid posts reserve their cost when queued; at the cap the post is handed to a person instead.
    </UiNotice>

    <UiPanel title="Caps and usage this month" :level="3">
      <TableScroll label="Caps and usage">
      <UiDataTable empty="Loading…">
        <template #head>
          <tr>
            <th scope="col">Scope</th>
            <th scope="col">Used</th>
            <th scope="col">Monthly cap (USD)</th>
            <th scope="col">Posts a day</th>
          </tr>
        </template>
        <tr v-for="r in table" :key="r.key">
          <th scope="row">{{ r.label }}</th>
          <td>
            <UsageMeter :label="r.label" :used="r.used" :limit="r.cap" :format="formatUsd" />
            <p class="level">{{ LEVEL_TEXT[r.level] }}</p>
          </td>
          <td>
            <TextField
              v-if="edits[r.key]"
              :id="`cap-${r.key.replace(/:/g, '-')}`"
              :label="`Monthly cap for ${r.label}`"
              :model-value="edits[r.key]!.limit"
              inputmode="decimal"
              :placeholder="r.row ? '' : `none set (${formatUsd(r.cap)} applies)`"
              :error="edits[r.key]!.error"
              @update:model-value="edits[r.key]!.limit = $event"
            />
          </td>
          <td>
            <TextField
              v-if="edits[r.key]"
              :id="`daily-${r.key.replace(/:/g, '-')}`"
              :label="`Posts a day for ${r.label}`"
              :model-value="edits[r.key]!.daily"
              inputmode="numeric"
              placeholder="no limit"
              @update:model-value="edits[r.key]!.daily = $event"
            />
          </td>
        </tr>
      </UiDataTable>
      </TableScroll>
      <div class="actions">
        <UiButton variant="primary" :disabled="saving || c.expired.value" @click="save">Save changed caps</UiButton>
        <UiButton variant="ghost" :disabled="saving" @click="load">Discard edits and reload</UiButton>
      </div>
    </UiPanel>

    <UiPanel title="Cap one target" :level="3">
      <SelectField id="cap-target" v-model="addTarget" label="Target" :options="targetChoices" placeholder="Choose a target" />
      <TextField id="cap-target-limit" v-model="addLimit" label="Monthly limit (USD)" inputmode="decimal" />
      <UiButton variant="secondary" :disabled="saving || !addTarget" @click="addTargetCap">Add cap</UiButton>
    </UiPanel>

    <UiPanel title="Changes to caps" :level="3">
      <ErrorNotice :message="audit.error.value" />
      <ul class="trail">
        <li v-for="a in audit.items.value" :key="a.id">
          <strong>{{ formatDateTime(a.at, c.zone.value) }}</strong> by {{ a.actor_subject }}
          <ul>
            <li v-for="line in changes(a)" :key="line">{{ line }}</li>
            <li v-if="!changes(a).length" class="muted">no change to any cap</li>
          </ul>
        </li>
        <li v-if="!audit.items.value.length && !audit.loading.value" class="muted">No changes yet.</li>
      </ul>
      <PagerNav :index="audit.index.value" :has-next="audit.hasNext.value" :loading="audit.loading.value" label="Cap changes pages" @prev="audit.prev()" @next="audit.next()" />
    </UiPanel>
  </div>
</template>

<style scoped>
.budgets {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.level {
  margin: var(--space-3xs) 0 0;
  font-size: var(--font-size-sm);
  color: var(--muted);
}

.actions {
  display: flex;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}

.trail {
  list-style: none;
  padding: 0;
}

.muted {
  color: var(--muted);
}
</style>
