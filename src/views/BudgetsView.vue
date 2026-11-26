<script setup lang="ts">
// Monthly spend caps per platform, usage against them, and the audit trail of changes. The instance ceilings (the deployment's configuration) bound every cap;
// the server refuses a cap above them and is the only enforcer. Related: lib/budgets.ts (the rows and the audit sentences), ContentHubView.vue (hosts it).
// Vue's reactivity and lifecycle.
import { computed, onMounted, reactive, ref, watch } from 'vue'
// The shared button, table, empty state, meter, notice, pager, panel and fields, and the cursor pager.
import { UiButton, UiDataTable, UiEmptyState, UiMeter, UiNotice, UiPager, UiPanel, UiSelectField, UiTextField, usePager } from '@meddleware/ui'
// Dates in the chosen zone, dollars from micro-USD, and parsing a typed dollar amount.
import { formatDateTime, formatUsd, parseUsd } from '@meddleware/web-utils'
// The words for a failed request.
import { describeError } from '../api/errors.js'
// The response shapes.
import type { AuditEntry, Budgets, SpendCap } from '../api/types.js'
// The console context.
import { useConsole } from '../console.js'
// The alert-level words, the audit sentences and the budget rows.
import { LEVEL_TEXT, describeChange, rows as buildRows } from '../lib/budgets.js'

// The console context.
const c = useConsole()
// The caps, ceilings and usage as the server last reported them.
const budgets = ref<Budgets | null>(null)
// A failed request, in words.
const error = ref<string | null>(null)
// A confirmation after a save.
const saved = ref<string | null>(null)
// True while a save is in flight.
const saving = ref(false)
// The inputs for each row, keyed by the row's scope and ids.
const edits = reactive<Record<string, { limit: string; daily: string; error: string | null }>>({})
// The target chosen for a new target cap.
const addTarget = ref('')
// Its monthly limit, as typed.
const addLimit = ref('')

// The rows of the table, once the budgets and the reference data are both loaded.
const table = computed(() => (budgets.value && c.reference.value ? buildRows(budgets.value, c.reference.value.definitions, c.reference.value.targets) : []))

/** Reset every row's inputs to what the server last reported. */
function seedEdits() {
  // Drop every old input.
  for (const k of Object.keys(edits)) delete edits[k]
  // One entry per row: the stored limit without its dollar sign, the daily limit, and no error.
  for (const r of table.value) {
    edits[r.key] = { limit: r.row ? formatUsd(r.row.monthly_limit_usd_micros).replace('$', '') : '', daily: r.row?.daily_post_limit?.toString() ?? '', error: null }
  }
}

/** Read the reference data and the budgets, then fill the inputs. */
async function load() {
  error.value = null
  try {
    // The reference data names the platforms and targets.
    await c.loadReference()
    // The caps and usage.
    budgets.value = await c.http.get<Budgets>('/budgets')
    seedEdits()
  } catch (e) {
    error.value = describeError(e)
  }
}

// The audit trail of budget changes, ten at a time.
const audit = usePager<AuditEntry>((cursor) => c.http.get('/audit', { entity_type: 'budgets', cursor, limit: 10 }), describeError)
// Load the budgets and the first page of the trail.
onMounted(() => {
  void load()
  // The change appears in the trail.
  void audit.reset()
})
// When the rows first arrive, fill the inputs (but never overwrite what the person is typing).
watch(table, () => {
  if (Object.keys(edits).length === 0) seedEdits()
})

// The fixed ceilings, in words.
const ceilingText = computed(() =>
  budgets.value ? `Instance ceilings: ${formatUsd(budgets.value.ceilings.total_monthly_usd_micros)} in total, ${formatUsd(budgets.value.ceilings.per_platform_monthly_usd_micros)} per platform, a month.` : '',
)

// The targets that have no cap yet, as options.
const targetChoices = computed<Array<readonly [string, string]>>(() =>
  (c.reference.value?.targets ?? [])
    .filter((t) => !budgets.value?.caps.some((x) => x.scope === 'target' && x.platform_target_id === t.id))
    .map((t) => [String(t.id), `${t.name} (${t.platform_code})`] as const),
)

/** The most a cap of this scope may be (the instance ceiling). */
function ceilingFor(scope: SpendCap['scope']): number {
  // The ceilings, if loaded.
  const c0 = budgets.value?.ceilings
  if (!c0) return 0
  // The total's ceiling, or the platform ceiling capped by the total.
  return scope === 'total' ? c0.total_monthly_usd_micros : Math.min(c0.per_platform_monthly_usd_micros, c0.total_monthly_usd_micros)
}

/** The cap inputs that differ from what is stored, as the PUT body's entries. */
function pending() {
  // The caps to send: only the rows whose inputs differ from what is stored.
  const out: Array<{ scope: SpendCap['scope']; platform_definition_id?: number; platform_target_id?: number; monthly_limit_usd_micros: number; daily_post_limit: number | null }> = []
  // False once any input is invalid; then nothing is sent.
  let ok = true
  for (const r of table.value) {
    // This row's inputs.
    const e = edits[r.key]
    if (!e) continue
    // Clear the row's old error.
    e.error = null
    // A row with no stored cap and no input, or whose inputs equal the stored values, is unchanged.
    const unchanged = (e.limit === '' && !r.row) || (r.row && parseUsd(e.limit) === r.row.monthly_limit_usd_micros && (e.daily === '' ? null : Number(e.daily)) === r.row.daily_post_limit)
    // Leave an unchanged row out.
    if (unchanged) continue
    // A changed row must have a monthly limit (zero is allowed).
    if (e.limit === '') {
      e.error = 'Give a monthly limit in dollars (0 allowed).'
      ok = false
      continue
    }
    // The limit in micro-USD, or null when it is not a valid amount.
    const micros = parseUsd(e.limit)
    // The daily post limit, or none.
    const daily = e.daily === '' ? null : Number(e.daily)
    // At most six decimals.
    if (micros === null) {
      e.error = 'Enter dollars with at most six decimals, for example 25 or 0.015.'
      ok = false
    // A whole number above zero, or empty.
    } else if (daily !== null && (!Number.isInteger(daily) || daily <= 0)) {
      e.error = 'The daily post limit is a whole number above zero, or empty.'
      ok = false
    // Never above the instance ceiling; the server refuses it too.
    } else if (micros > ceilingFor(r.scope)) {
      e.error = `Above the instance ceiling of ${formatUsd(ceilingFor(r.scope))}. Raise the ceiling in the deployment's configuration first.`
      ok = false
    } else {
      // A valid change, with the platform or target ids only where they apply.
      out.push({
        scope: r.scope,
        ...(r.platformId !== null ? { platform_definition_id: r.platformId } : {}),
        ...(r.targetId !== null ? { platform_target_id: r.targetId } : {}),
        monthly_limit_usd_micros: micros,
        daily_post_limit: daily,
      })
    }
  }
  // Null means "fix the errors first".
  return ok ? out : null
}

/** Send the changed caps, or say there is nothing to send. */
async function save() {
  // What changed, or null when an input is invalid.
  const caps = pending()
  saved.value = null
  // The errors are shown beside the inputs.
  if (caps === null) return
  // Nothing changed: say so.
  if (caps.length === 0) {
    saved.value = 'Nothing to save: no cap was changed.'
    return
  }
  saving.value = true
  error.value = null
  try {
    // One request for all changed caps; the answer is the new state.
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

/** Add a cap for the chosen target. */
async function addTargetCap() {
  // The chosen target.
  const t = c.reference.value?.targets.find((x) => String(x.id) === addTarget.value)
  // Its limit in micro-USD.
  const micros = parseUsd(addLimit.value)
  // Both are required.
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

/** A cap's subject as words, for the audit sentences. */
function capName(cap: SpendCap): string {
  // The total has a fixed name.
  if (cap.scope === 'total') return 'All platforms'
  // A platform cap names its platform, or its number when it was removed.
  if (cap.scope === 'platform') return c.reference.value?.definitions.find((d) => d.id === cap.platform_definition_id)?.name ?? `platform #${cap.platform_definition_id}`
  return c.reference.value?.targets.find((t) => t.id === cap.platform_target_id)?.name ?? `target #${cap.platform_target_id}`
}
// The audit entry as sentences.
const changes = (a: AuditEntry) => describeChange(a.before, a.after, capName)
</script>

<template>
  <div class="budgets">
    <!-- A failed request, in words. -->
    <UiNotice v-if="error" type="error" :message="error" />
    <!-- A confirmation. -->
    <UiNotice v-if="saved" type="ok" :message="saved" />
    <UiNotice>
      Nothing is spent without a cap, and every cap starts at zero. {{ ceilingText }} A cap cannot exceed the ceiling; to raise a ceiling, change the deployment's configuration.
      Paid posts reserve their cost when queued; at the cap the post is handed to a person instead.
    </UiNotice>

    <!-- The caps table. -->
    <UiPanel title="Caps and usage this month" :level="3">
      <!-- The table; its empty text reads "Loading…" while the rows are not ready. -->
      <UiDataTable caption="Caps and usage" empty="Loading…" :rows="table.length">
        <!-- Column headings. -->
        <template #head>
          <th scope="col">Scope</th>
          <th scope="col">Used</th>
          <th scope="col">Monthly cap (USD)</th>
          <th scope="col">Posts a day</th>
        </template>
        <!-- One row per cap scope. -->
        <tr v-for="r in table" :key="r.key">
          <!-- What the row covers. -->
          <th scope="row">{{ r.label }}</th>
          <td>
            <!-- Usage against the cap, with the level in words beneath (never colour alone). -->
            <UiMeter :label="r.label" :used="r.used" :limit="r.cap" :format="formatUsd" />
            <p class="level">{{ LEVEL_TEXT[r.level] }}</p>
          </td>
          <td>
            <UiTextField
              v-if="edits[r.key]"
              v-model="edits[r.key]!.limit"
              :id="`cap-${r.key.replace(/:/g, '-')}`"
              :label="`Monthly cap for ${r.label}`"
              inputmode="decimal"
              :placeholder="r.row ? '' : `none set (${formatUsd(r.cap)} applies)`"
              :error="edits[r.key]!.error"
            />
          </td>
          <td>
            <UiTextField
              v-if="edits[r.key]"
              v-model="edits[r.key]!.daily"
              :id="`daily-${r.key.replace(/:/g, '-')}`"
              :label="`Posts a day for ${r.label}`"
              inputmode="numeric"
              placeholder="no limit"
            />
          </td>
        </tr>
      </UiDataTable>
      <!-- Save the changed caps, or throw the edits away. -->
      <p class="actions">
        <UiButton variant="primary" :busy="saving" :disabled="c.expired.value" @click="save">Save changed caps</UiButton>
        <UiButton variant="ghost" :disabled="saving" @click="load">Discard edits and reload</UiButton>
      </p>
    </UiPanel>

    <!-- Add a cap for one target. -->
    <UiPanel title="Cap one target" :level="3">
      <!-- The target to cap. -->
      <UiSelectField id="cap-target" v-model="addTarget" label="Target" :options="targetChoices" placeholder="Choose a target" />
      <!-- Its monthly limit. -->
      <UiTextField id="cap-target-limit" v-model="addLimit" label="Monthly limit (USD)" inputmode="decimal" />
      <UiButton variant="secondary" :disabled="saving || !addTarget" @click="addTargetCap">Add cap</UiButton>
    </UiPanel>

    <!-- The audit trail. -->
    <UiPanel title="Changes to caps" :level="3">
      <!-- A failed read of the trail. -->
      <UiNotice v-if="audit.error.value" type="error" :message="audit.error.value" />
      <!-- Each entry: when, who, and the sentences for what changed. -->
      <ul v-if="audit.items.value.length" class="trail">
        <li v-for="a in audit.items.value" :key="a.id">
          <strong><time :datetime="a.at">{{ formatDateTime(a.at, c.zone.value) }}</time></strong> by {{ a.actor_subject }}
          <ul>
            <li v-for="line in changes(a)" :key="line">{{ line }}</li>
            <li v-if="!changes(a).length" class="muted">no change to any cap</li>
          </ul>
        </li>
      </ul>
      <!-- No changes yet. -->
      <UiEmptyState v-else-if="!audit.loading.value">No changes yet.</UiEmptyState>
      <!-- Newer and older pages of the trail. -->
      <UiPager :index="audit.index.value" :has-next="audit.hasNext.value" :loading="audit.loading.value" label="Cap changes pages" prev-label="Newer" next-label="Older" @prev="audit.prev()" @next="audit.next()" />
    </UiPanel>
  </div>
</template>

<style scoped>
/* A column with the shared gap. */
.budgets {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* The level words are small and muted. */
.level {
  margin: var(--space-3xs) 0 0;
  font-size: var(--font-size-sm);
  color: var(--muted);
}

/* The two buttons on one row. */
.actions {
  display: flex;
  gap: var(--space-xs);
  margin: var(--space-sm) 0 0;
}

/* De-emphasised text. */
.muted {
  color: var(--muted);
}
</style>
