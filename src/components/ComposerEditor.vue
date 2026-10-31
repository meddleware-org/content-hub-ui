<script setup lang="ts">
// The writing side of the composer: title, text, targets, when to send, and the actions.
import { UiButton, UiDateTimeField, UiLiveStatus, UiTextField } from '@meddleware/ui'
import { useConsole } from '../console.js'
import TargetPicker, { type TargetChoice } from './TargetPicker.vue'

const title = defineModel<string>('title', { required: true })
const body = defineModel<string>('body', { required: true })
const selected = defineModel<number[]>('selected', { required: true })
const scheduledAt = defineModel<string | null>('scheduledAt', { required: true })
defineProps<{
  choices: TargetChoice[]
  busy: boolean
  canQueue: boolean
  /** How many targets are selected (the queue button says so). */
  count: number
  /** The names of the targets the text is too long for. */
  overflowing: string[]
}>()
defineEmits<{ saveDraft: []; queue: []; fresh: [] }>()
const c = useConsole()
</script>

<template>
  <section class="editor" aria-labelledby="composer-write">
    <h3 id="composer-write">Write</h3>
    <UiTextField id="post-title" v-model="title" label="Title" hint="Used by platforms that have titles; also names the post here." :maxlength="300" />
    <UiTextField
      id="post-body"
      v-model="body"
      label="Text"
      :rows="10"
      hint="Canonical format: paragraphs, **bold**, *emphasis*, `code`, [links](https://example.org), lists. One text, rendered for each platform."
    />
    <TargetPicker v-model="selected" :choices="choices" />
    <UiDateTimeField id="post-when" v-model="scheduledAt" :zone="c.zone.value" label="Send at" hint="Leave empty to send as soon as the worker picks it up." />

    <p class="actions">
      <UiButton variant="secondary" :disabled="busy || title.trim() === '' || c.expired.value" @click="$emit('saveDraft')">Save draft</UiButton>
      <UiButton variant="primary" :disabled="!canQueue" @click="$emit('queue')">Queue for {{ count }} target{{ count === 1 ? '' : 's' }}</UiButton>
      <UiButton variant="ghost" @click="$emit('fresh')">New post</UiButton>
    </p>
    <UiLiveStatus label="Length check" :message="overflowing.length ? `Too long for ${overflowing.join(', ')}: shorten the text, or write a shorter version for that platform.` : ''" />
  </section>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
