<script setup lang="ts">
// The stop switch: whether the worker is sending, and the one button that changes it. The server holds the switch; this only shows it and asks for a change.
// Related: views/PublishingView.vue (owns the request).
// The shared button, empty state and panel.
import { UiButton, UiEmptyState, UiPanel } from '@meddleware/ui'

// `paused` is null until the server has answered; `busy` and `expired` disable the button.
defineProps<{ paused: boolean | null; busy: boolean; expired: boolean }>()
// The view makes the change: the button only asks for it.
defineEmits<{ set: [paused: boolean] }>()
</script>

<template>
  <!-- The switch's own panel. -->
  <UiPanel title="Sending" :level="3">
    <!-- The server has not answered yet. -->
    <UiEmptyState v-if="paused === null">Reading the switch…</UiEmptyState>
    <!-- Running: what the worker does, and when it only records dry runs. -->
    <template v-else>
      <p>
        <!-- The state first, in words (never colour alone). -->
        <strong>{{ paused ? 'Stopped' : 'Running' }}.</strong>
        <!-- Stopped: what that means. -->
        <template v-if="paused"> The worker claims nothing new; sends already in progress finish.</template>
        <template v-else> The worker sends queued posts. Targets that are not live, or a worker without real sending, record dry runs instead.</template>
      </p>
      <!-- The one control: resume (primary) or stop everything (danger); disabled while a change is in flight or the session ended. -->
      <UiButton :variant="paused ? 'primary' : 'danger'" :disabled="busy || expired" @click="$emit('set', !paused)">{{ paused ? 'Resume sending' : 'Stop all sending' }}</UiButton>
    </template>
  </UiPanel>
</template>
