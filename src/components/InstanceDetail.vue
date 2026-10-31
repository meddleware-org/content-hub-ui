<script setup lang="ts">
// One instance: its state, the moves a person may make (only the ones the server offers), posting by hand, the exact text that is sent
// and every delivery attempt.
import { ref, watch } from 'vue'
import { EXTERNAL_STATUS_VALUES } from '@meddleware/content-hub-client'
import { UiBadge, UiButton, UiCodeBlock, UiCopyButton, UiDataTable, UiNotice, UiPanel, UiSelectField, UiTextField } from '@meddleware/ui'
import { formatDateTime, humanize, safeHref } from '@meddleware/web-utils'
import type { InstanceDetail } from '../api/types.js'
import { useConsole } from '../console.js'
import { statusLabel, statusTone } from '../lib/status.js'

const props = defineProps<{
  detail: InstanceDetail
  title: string
  target: string
  /** The platform of this target is posted by hand. */
  manual: boolean
  busy: boolean
}>()
const emit = defineEmits<{ move: [to: string, postedUrl: string]; external: [value: string] }>()
const c = useConsole()

const postedUrl = ref('')
// A move (or another instance) clears where it was posted.
watch(() => [props.detail.instance.id, props.detail.instance.status], () => (postedUrl.value = ''))

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
const moveLabel = (from: string, to: string) => MOVE_LABEL[`${from}>${to}`] ?? `Move to ${to}`
const EXTERNAL_OPTIONS = EXTERNAL_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
const resultUrl = (url: string | null) => (url && /^https:\/\//.test(url) ? url : undefined)
</script>

<template>
  <UiPanel :title="`Instance #${detail.instance.id}: ${title} on ${target}`" :level="3">
    <p>
      <UiBadge :tone="statusTone(detail.instance.status)">{{ statusLabel(detail.instance.status) }}</UiBadge>
      <span class="muted"> revision {{ detail.instance.post_revision ?? '—' }} · {{ detail.instance.attempt_count }} attempt(s)</span>
    </p>
    <p v-if="detail.instance.last_error" class="muted">{{ detail.instance.last_error }}</p>
    <p v-if="detail.instance.url_or_external_id">
      Result:
      <a v-if="safeHref(resultUrl(detail.instance.url_or_external_id))" :href="safeHref(resultUrl(detail.instance.url_or_external_id))" target="_blank" rel="noopener noreferrer">{{ detail.instance.url_or_external_id }}</a>
      <template v-else>{{ detail.instance.url_or_external_id }}</template>
    </p>

    <UiNotice v-if="detail.instance.status === 'unknown'" type="error">
      <strong>This send may or may not have gone out.</strong> It is never retried automatically. Check the platform yourself, then say what you found.
    </UiNotice>

    <h4>What happens next</h4>
    <UiTextField
      v-if="detail.operator_moves.includes('posted')"
      id="pb-url"
      v-model="postedUrl"
      label="Where it was posted (link or id)"
      hint="Required to mark it posted."
      :maxlength="2000"
    />
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
      <span v-if="!detail.operator_moves.length" class="muted">Nothing to do: {{ detail.instance.status === 'posted' ? 'it is posted' : 'the worker is handling it' }}.</span>
    </div>

    <template v-if="manual">
      <h4>Post by hand</h4>
      <p v-if="detail.intent_url"><a :href="safeHref(detail.intent_url)" target="_blank" rel="noopener noreferrer">Open the platform's compose page with this text filled in</a></p>
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

    <h4>The text that is sent</h4>
    <p v-if="detail.instance.payload_title" class="muted">Title: {{ detail.instance.payload_title }}</p>
    <UiCodeBlock v-if="detail.instance.payload_body" label="The text that is sent" :code="detail.instance.payload_body" wrap />
    <p v-else class="muted">No payload yet.</p>
    <p v-if="detail.instance.payload_sha256" class="muted">SHA-256 {{ detail.instance.payload_sha256 }}</p>

    <h4>Attempts</h4>
    <UiDataTable caption="Delivery attempts" empty="No attempts yet." :rows="detail.attempts.length">
      <template #head>
        <th scope="col">Started ({{ c.zone.value }})</th>
        <th scope="col">Outcome</th>
        <th scope="col">HTTP</th>
        <th scope="col">What the platform said</th>
      </template>
      <tr v-for="a in detail.attempts" :key="a.id">
        <td><time :datetime="a.started_at">{{ formatDateTime(a.started_at, c.zone.value) }}</time></td>
        <td>{{ a.dry_run ? 'dry run' : humanize(a.outcome ?? 'in flight') }}</td>
        <td>{{ a.http_status ?? '—' }}</td>
        <td>
          <span v-if="a.response_excerpt">{{ a.response_excerpt }}</span>
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
.moves {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: end;
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
