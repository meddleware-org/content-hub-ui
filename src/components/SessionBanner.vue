<script setup lang="ts">
// The banner shown when the session has ended: what happened, that composer drafts stay on this device, and a button to sign in again.
// Related: console.ts (the `expired` flag and `reload`), ContentHubView.vue (shows it first).
// The shared notice and button.
import { UiButton, UiNotice } from '@meddleware/ui'
// The console context, which says whether the session ended.
import { useConsole } from '../console.js'

// The context.
const c = useConsole()
</script>

<template>
  <!-- Shown only once a request found the session ended; it is an alert, so it is announced. -->
  <UiNotice v-if="c.expired.value" type="error" class="session-banner">
    <!-- What happened, then what is safe and what to do next. -->
    <strong>Your session has expired.</strong>
    Nothing you were doing is lost: composer drafts stay on this device. Sign in again to continue.
    <!-- Reloads the top window so the access gateway signs the person in again. -->
    <UiButton variant="primary" @click="c.reload()">Sign in again</UiButton>
  </UiNotice>
</template>

<style scoped>
/* The notice lays its text and button out in a wrapping row. */
.session-banner {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}
</style>
