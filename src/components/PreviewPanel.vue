<script setup lang="ts">
// One target's preview: how much of the text fits (meters that say so in words), how it renders, exactly what would be sent, and a different text for this platform.
// These are previews; the server counts again when the post is queued. Related: lib/composer.ts (the arithmetic), views/ComposerView.vue (owns the state).
// Vue's `computed`.
import { computed } from 'vue'
// The shared button, code block, meter, notice, panel and field.
import { UiButton, UiCodeBlock, UiMeter, UiNotice, UiPanel, UiTextField } from '@meddleware/ui'
// Formats micro-USD as a dollar amount.
import { formatUsd } from '@meddleware/web-utils'
// The usage figure, and the override and preview shapes.
import { usage, type Override, type TargetPreview } from '../lib/composer.js'
// The post as a reader would see it.
import RenderedText from './RenderedText.js'

// The preview for one target, what the server refused for it, the override in use and the link a shortened text ends with.
const props = defineProps<{
  preview: TargetPreview
  /** What the server refused for this target, if it did. */
  problem?: string
  override?: Override
  /** The link a shortened text ends with (typed here, kept by the composer). */
  link: string
}>()
// The composer owns the state: an edit, a new link, "shorten" or "clear" is asked for here and done there.
const emit = defineEmits<{ override: [field: 'title' | 'body', value: string]; link: [value: string]; shorten: []; clear: [] }>()

// The target's id, to make unique field ids.
const id = computed(() => props.preview.target.id)
// The text meter is worked out once per preview, not once per use in the template.
// The text meter, worked out once per preview rather than once per use in the template.
const text = computed(() => usage(props.preview))
// The check of the text against the limits.
const check = computed(() => props.preview.check)
</script>

<template>
  <UiPanel class="target-panel" :title="`${preview.target.name} — ${preview.def.name}`" :level="4">
    <!-- What the server refused for this target, in its own words. -->
    <UiNotice v-if="problem" type="error" :message="problem" />
    <!-- How much of the text limit is used (a meter that says so in words). -->
    <UiMeter v-if="text" label="Text" :used="text.used" :limit="text.limit" :unit="text.unit" />
    <!-- How much of the title limit is used, where the platform has one. -->
    <UiMeter v-if="check && check.titleLimit !== null && check.titleCounted !== null" label="Title" :used="check.titleCounted" :limit="check.titleLimit" />
    <!-- How many bytes are used, where the platform has a byte limit. -->
    <UiMeter v-if="check && check.byteLimit !== null" label="Bytes" :used="check.bytes" :limit="check.byteLimit" />
    <!-- A platform posted by hand: say where the text appears after queueing. -->
    <p v-if="preview.def.posting_mode === 'manual'" class="muted">Posted by hand: after queueing, an intent link and the text to copy appear under Publishing.</p>
    <!-- The cost estimate, with a note when a link raises it. -->
    <p v-if="preview.costMicros > 0" class="muted">Cost estimate: {{ formatUsd(preview.costMicros) }}<template v-if="preview.hasUrl"> (includes the price of a post with a link)</template>.</p>

    <!-- The text as it would read. -->
    <h5>As readers see it</h5>
    <!-- Rendered from tokens, never from an HTML string. -->
    <RenderedText :source="preview.body" />
    <details>
      <!-- The exact payload, folded away. -->
      <summary>Exactly what would be sent ({{ preview.markup.replace('_', ' ') }})</summary>
      <UiCodeBlock label="The payload that would be sent" :code="preview.payload" wrap />
    </details>

    <!-- A different text for this platform only. -->
    <details class="override">
      <summary>Write something different for this platform<template v-if="preview.overridden"> (in use)</template></summary>
      <!-- The title for this platform. -->
      <UiTextField :id="`ov-title-${id}`" label="Title for this platform" :model-value="override?.title ?? ''" :maxlength="300" @update:model-value="emit('override', 'title', $event)" />
      <!-- The text for this platform. -->
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
      <!-- Shorten the text with a link, or go back to the shared text. -->
      <p class="actions">
        <UiButton variant="secondary" :disabled="preview.fits || !preview.limits" @click="emit('shorten')">Shorten with link</UiButton>
        <UiButton variant="ghost" :disabled="!preview.overridden" @click="emit('clear')">Use the shared text</UiButton>
      </p>
    </details>
  </UiPanel>
</template>

<style scoped>
/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

/* The actions wrap on a narrow screen. */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
