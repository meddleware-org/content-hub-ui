<script setup lang="ts">
// One target's preview: how much of the text fits (meters that say so in words), how it renders, exactly what would be sent, and
// a different text for this platform. These are previews (the server counts again when the post is queued).
import { computed } from 'vue'
import { UiButton, UiCodeBlock, UiMeter, UiNotice, UiPanel, UiTextField } from '@meddleware/ui'
import { formatUsd } from '@meddleware/web-utils'
import { usage, type Override, type TargetPreview } from '../lib/composer.js'
import RenderedText from './RenderedText.js'

const props = defineProps<{
  preview: TargetPreview
  /** What the server refused for this target, if it did. */
  problem?: string
  override?: Override
  /** The link a shortened text ends with (typed here, kept by the composer). */
  link: string
}>()
const emit = defineEmits<{ override: [field: 'title' | 'body', value: string]; link: [value: string]; shorten: []; clear: [] }>()

const id = computed(() => props.preview.target.id)
// The text meter is worked out once per preview, not once per use in the template.
const text = computed(() => usage(props.preview))
const check = computed(() => props.preview.check)
</script>

<template>
  <UiPanel class="target-panel" :title="`${preview.target.name} — ${preview.def.name}`" :level="4">
    <UiNotice v-if="problem" type="error" :message="problem" />
    <UiMeter v-if="text" label="Text" :used="text.used" :limit="text.limit" :unit="text.unit" />
    <UiMeter v-if="check && check.titleLimit !== null && check.titleCounted !== null" label="Title" :used="check.titleCounted" :limit="check.titleLimit" />
    <UiMeter v-if="check && check.byteLimit !== null" label="Bytes" :used="check.bytes" :limit="check.byteLimit" />
    <p v-if="preview.def.posting_mode === 'manual'" class="muted">Posted by hand: after queueing, an intent link and the text to copy appear under Publishing.</p>
    <p v-if="preview.costMicros > 0" class="muted">Cost estimate: {{ formatUsd(preview.costMicros) }}<template v-if="preview.hasUrl"> (includes the price of a post with a link)</template>.</p>

    <h5>As readers see it</h5>
    <RenderedText :source="preview.body" />
    <details>
      <summary>Exactly what would be sent ({{ preview.markup.replace('_', ' ') }})</summary>
      <UiCodeBlock label="The payload that would be sent" :code="preview.payload" wrap />
    </details>

    <details class="override">
      <summary>Write something different for this platform<template v-if="preview.overridden"> (in use)</template></summary>
      <UiTextField :id="`ov-title-${id}`" label="Title for this platform" :model-value="override?.title ?? ''" :maxlength="300" @update:model-value="emit('override', 'title', $event)" />
      <UiTextField :id="`ov-body-${id}`" label="Text for this platform" hint="Replaces the shared text here only." :rows="5" :model-value="override?.body ?? ''" @update:model-value="emit('override', 'body', $event)" />
      <UiTextField
        :id="`ov-link-${id}`"
        :model-value="link"
        type="url"
        label="Link to end a shortened text with"
        placeholder="Paste the post link"
        hint="Shorten with link cuts the text and ends it with an ellipsis and this link, then counts the result."
        @update:model-value="emit('link', $event)"
      />
      <p class="actions">
        <UiButton variant="secondary" :disabled="preview.fits || !preview.limits" @click="emit('shorten')">Shorten with link</UiButton>
        <UiButton variant="ghost" :disabled="!preview.overridden" @click="emit('clear')">Use the shared text</UiButton>
      </p>
    </details>
  </UiPanel>
</template>

<style scoped>
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
