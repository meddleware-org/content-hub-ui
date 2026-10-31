<script setup lang="ts">
// The stop switch: whether the worker is sending, and the one button that changes it. The server holds the switch.
import { UiButton, UiEmptyState, UiPanel } from '@meddleware/ui'

defineProps<{ paused: boolean | null; busy: boolean; expired: boolean }>()
defineEmits<{ set: [paused: boolean] }>()
</script>

<template>
  <UiPanel title="Sending" :level="3">
    <UiEmptyState v-if="paused === null">Reading the switch…</UiEmptyState>
    <template v-else>
      <p>
        <strong>{{ paused ? 'Stopped' : 'Running' }}.</strong>
        <template v-if="paused"> The worker claims nothing new; sends already in progress finish.</template>
        <template v-else> The worker sends queued posts. Targets that are not live, or a worker without real sending, record dry runs instead.</template>
      </p>
      <UiButton :variant="paused ? 'primary' : 'danger'" :disabled="busy || expired" @click="$emit('set', !paused)">{{ paused ? 'Resume sending' : 'Stop all sending' }}</UiButton>
    </template>
  </UiPanel>
</template>
