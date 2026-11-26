<script setup lang="ts">
// One instance (a post on one target): its state, the moves a person may make (only the ones the server offers), posting by hand, the exact text that is sent and
// every delivery attempt. Related: views/PublishingView.vue (owns the requests), lib/status.ts (how a status looks).
// Vue's reactivity.
import { ref, watch } from 'vue'
// The shared vocabulary of the other side's progress.
import { EXTERNAL_STATUS_VALUES } from '@meddleware/content-hub-client'
// The shared badge, buttons, code block, table, notice, panel and fields.
import { UiBadge, UiButton, UiCodeBlock, UiCopyButton, UiDataTable, UiNotice, UiPanel, UiSelectField, UiTextField } from '@meddleware/ui'
// Date formatting in the chosen zone, words for a value, and the link check.
import { formatDateTime, humanize, safeHref } from '@meddleware/web-utils'
// The detail's shape.
import type { InstanceDetail } from '../api/types.js'
// The console context, for the zone and the session state.
import { useConsole } from '../console.js'
// How a status is shown.
import { statusLabel, statusTone } from '../lib/status.js'

// The instance and the names to show; `manual` is true for a platform posted by hand.
const props = defineProps<{
  detail: InstanceDetail
  title: string
  target: string
  /** The platform of this target is posted by hand. */
  manual: boolean
  busy: boolean
}>()
// The view makes every change: `move` to a new state (with where it was posted), `external` for the other side's progress.
const emit = defineEmits<{ move: [to: string, postedUrl: string]; external: [value: string] }>()
// The console context.
const c = useConsole()

// Where the post went, typed for a move to posted.
const postedUrl = ref('')
// A move (or another instance) clears where it was posted.
// A move, or another instance, clears where it was posted.
watch(() => [props.detail.instance.id, props.detail.instance.status], () => (postedUrl.value = ''))

// The words on each move button, by `from>to`; a move with no entry reads "Move to <state>".
const MOVE_LABEL: Record<string, string> = {
  'planned>queued': 'Queue now',
  'planned>manual_required': 'Hand to a person',
  'planned>cancelled': 'Cancel',
  'queued>planned': 'Take back from the queue',
  'queued>cancelled': 'Cancel',
  'failed>queued': 'Retry',
  'failed>manual_required': 'Post it by hand instead',
  'failed>cancelled': 'Cancel',
  'unknown>posted': 'It did go out — record where',
  'unknown>failed': 'It did not go out',
  'manual_required>posted': 'Mark as posted',
  'manual_required>planned': 'Back to planned',
  'manual_required>cancelled': 'Cancel',
  'cancelled>planned': 'Reopen',
}
// The button text for a move.
const moveLabel = (from: string, to: string) => MOVE_LABEL[`${from}>${to}`] ?? `Move to ${to}`
// The other side's progress as options.
const EXTERNAL_OPTIONS = EXTERNAL_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
// A result is a link only when it is an https address; anything else is shown as text.
const resultUrl = (url: string | null) => (url && /^https:\/\//.test(url) ? url : undefined)
</script>

<template>
  <UiPanel :title="`Instance #${detail.instance.id}: ${title} on ${target}`" :level="3">
    <p>
      <!-- The state in words, with a tone as reinforcement. -->
      <UiBadge :tone="statusTone(detail.instance.status)">{{ statusLabel(detail.instance.status) }}</UiBadge>
      <span class="muted"> revision {{ detail.instance.post_revision ?? '—' }} · {{ detail.instance.attempt_count }} attempt(s)</span>
    </p>
    <!-- The last failure, if any. -->
    <p v-if="detail.instance.last_error" class="muted">{{ detail.instance.last_error }}</p>
    <!-- Where it was posted: a link when it is a safe https address. -->
    <p v-if="detail.instance.url_or_external_id">
      Result:
      <a v-if="safeHref(resultUrl(detail.instance.url_or_external_id))" :href="safeHref(resultUrl(detail.instance.url_or_external_id))" target="_blank" rel="noopener noreferrer">{{ detail.instance.url_or_external_id }}</a>
      <template v-else>{{ detail.instance.url_or_external_id }}</template>
    </p>

    <!-- An uncertain send is never retried by itself: say so, and what the person should do. -->
    <UiNotice v-if="detail.instance.status === 'unknown'" type="error">
      <strong>This send may or may not have gone out.</strong> It is never retried automatically. Check the platform yourself, then say what you found.
    </UiNotice>

    <!-- The moves the server offers now, and nothing else. -->
    <h4>What happens next</h4>
    <UiTextField
      v-if="detail.operator_moves.includes('posted')"
      id="pb-url"
      v-model="postedUrl"
      label="Where it was posted (link or id)"
      hint="Required to mark it posted."
      :maxlength="2000"
    />
    <!-- One button per allowed move. -->
    <div class="moves">
      <UiButton
        v-for="m in detail.operator_moves"
        :key="m"
        :variant="m === 'cancelled' ? 'danger' : m === 'posted' ? 'primary' : 'secondary'"
        :disabled="busy || c.expired.value || (m === 'posted' && postedUrl.trim() === '')"
        @click="emit('move', m, postedUrl.trim())"
      >
        {{ moveLabel(detail.instance.status, m) }}
      </UiButton>
      <!-- No move available: say why. -->
      <span v-if="!detail.operator_moves.length" class="muted">Nothing to do: {{ detail.instance.status === 'posted' ? 'it is posted' : 'the worker is handling it' }}.</span>
    </div>

    <!-- Only for a platform posted by hand. -->
    <template v-if="manual">
      <!-- Steps for posting by hand. -->
      <h4>Post by hand</h4>
      <!-- A link to the platform's compose page with the text filled in. -->
      <p v-if="detail.intent_url"><a :href="safeHref(detail.intent_url)" target="_blank" rel="noopener noreferrer">Open the platform's compose page with this text filled in</a></p>
      <!-- A button that copies the text. -->
      <p v-if="detail.instance.payload_body">Copy the text <UiCopyButton :value="detail.instance.payload_body" label="Copy the text" /></p>
      <UiSelectField
        id="pb-ext"
        :model-value="detail.instance.external_status ?? ''"
        label="The other side's progress (directories, partners)"
        :options="EXTERNAL_OPTIONS"
        placeholder="Not tracked"
        @update:model-value="emit('external', $event)"
      />
    </template>

    <!-- The exact payload. -->
    <h4>The text that is sent</h4>
    <!-- The title that is sent, if any. -->
    <p v-if="detail.instance.payload_title" class="muted">Title: {{ detail.instance.payload_title }}</p>
    <!-- The exact body, with a copy-friendly code block. -->
    <UiCodeBlock v-if="detail.instance.payload_body" label="The text that is sent" :code="detail.instance.payload_body" wrap />
    <p v-else class="muted">No payload yet.</p>
    <!-- A hash of the payload, to prove a resend is identical. -->
    <p v-if="detail.instance.payload_sha256" class="muted">SHA-256 {{ detail.instance.payload_sha256 }}</p>

    <!-- Every delivery attempt. -->
    <h4>Attempts</h4>
    <!-- The attempts table. -->
    <UiDataTable caption="Delivery attempts" empty="No attempts yet." :rows="detail.attempts.length">
      <!-- The column headings. -->
      <template #head>
        <th scope="col">Started ({{ c.zone.value }})</th>
        <th scope="col">Outcome</th>
        <th scope="col">HTTP</th>
        <th scope="col">What the platform said</th>
      </template>
      <!-- One row per attempt. -->
      <tr v-for="a in detail.attempts" :key="a.id">
        <!-- When it started, in the chosen zone, with the machine-readable time. -->
        <td><time :datetime="a.started_at">{{ formatDateTime(a.started_at, c.zone.value) }}</time></td>
        <!-- The outcome; a dry run says so. -->
        <td>{{ a.dry_run ? 'dry run' : humanize(a.outcome ?? 'in flight') }}</td>
        <!-- The HTTP status, if there was one. -->
        <td>{{ a.http_status ?? '—' }}</td>
        <td>
          <!-- A short excerpt of what the platform said. -->
          <span v-if="a.response_excerpt">{{ a.response_excerpt }}</span>
          <!-- The request with its credentials removed, folded away. -->
          <details v-if="a.request_redacted">
            <summary>The request (credentials hidden)</summary>
            <UiCodeBlock label="The request, credentials hidden" :code="JSON.stringify(a.request_redacted, null, 2)" wrap />
          </details>
        </td>
      </tr>
    </UiDataTable>
  </UiPanel>
</template>

<style scoped>
/* The move buttons wrap and align at the bottom. */
.moves {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
