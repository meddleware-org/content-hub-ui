<script setup lang="ts">
// The writing side of the composer: title, text, targets, when to send, and the actions. It owns no state of its own; ComposerView.vue passes the values in and
// does the saving and queueing. Related: TargetPicker.vue, lib/composer.ts (the limits).
// The shared button, date field, live status and text field.
import { UiButton, UiDateTimeField, UiLiveStatus, UiTextField } from '@meddleware/ui'
// The console context, for the zone and the session state.
import { useConsole } from '../console.js'
// The target checkboxes and their choice type.
import TargetPicker, { type TargetChoice } from './TargetPicker.vue'

// Four two-way values the composer view owns: the title, the text, the selected targets and the send time.
const title = defineModel<string>('title', { required: true })
const body = defineModel<string>('body', { required: true })
const selected = defineModel<number[]>('selected', { required: true })
const scheduledAt = defineModel<string | null>('scheduledAt', { required: true })
// What the view tells the editor: the targets on offer, whether a change is in flight, whether queueing is allowed, how many targets are selected and which are over their limit.
defineProps<{
  choices: TargetChoice[]
  busy: boolean
  canQueue: boolean
  /** How many targets are selected (the queue button says so). */
  count: number
  /** The names of the targets the text is too long for. */
  overflowing: string[]
}>()
// The editor only asks; the view saves, queues or starts a new post.
defineEmits<{ saveDraft: []; queue: []; fresh: [] }>()
// The console's refs, destructured so the template unwraps them (vue-tsc 3.3.14 mistypes `c.zone.value` on a context object here).
const { zone, expired } = useConsole()
</script>

<template>
  <section class="editor" aria-labelledby="composer-write">
    <!-- The region's heading. -->
    <h3 id="composer-write">Write</h3>
    <!-- The title, up to 300 characters. -->
    <UiTextField id="post-title" v-model="title" label="Title" hint="Used by platforms that have titles; also names the post here." :maxlength="300" />
    <UiTextField
      id="post-body"
      v-model="body"
      label="Text"
      :rows="10"
      hint="Canonical format: paragraphs, **bold**, *emphasis*, `code`, [links](https://example.org), lists. One text, rendered for each platform."
    />
    <!-- Which targets the post goes to. -->
    <TargetPicker v-model="selected" :choices="choices" />
    <!-- When to send, in the chosen zone; empty means as soon as the worker picks it up. -->
    <UiDateTimeField id="post-when" v-model="scheduledAt" :zone="zone" label="Send at" hint="Leave empty to send as soon as the worker picks it up." />

    <!-- The three actions. -->
    <p class="actions">
      <!-- Save a draft on the server; needs a title and a live session. -->
      <UiButton variant="secondary" :disabled="busy || title.trim() === '' || expired" @click="$emit('saveDraft')">Save draft</UiButton>
      <!-- Queue the post for the selected targets; the label says how many. -->
      <UiButton variant="primary" :disabled="!canQueue" @click="$emit('queue')">Queue for {{ count }} target{{ count === 1 ? '' : 's' }}</UiButton>
      <!-- Start a new post. -->
      <UiButton variant="ghost" @click="$emit('fresh')">New post</UiButton>
    </p>
    <!-- Tells assistive technology which targets the text is too long for, as the text changes. -->
    <UiLiveStatus label="Length check" :message="overflowing.length ? `Too long for ${overflowing.join(', ')}: shorten the text, or write a shorter version for that platform.` : ''" />
  </section>
</template>

<style scoped>
/* The actions wrap on a narrow screen. */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}
</style>
