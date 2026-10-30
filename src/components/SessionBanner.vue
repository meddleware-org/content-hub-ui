<script setup lang="ts">
import { UiButton, UiNotice } from '@meddleware/ui'
import { useConsole } from '../console.js'

const c = useConsole()
</script>

<template>
  <UiNotice v-if="c.expired.value" type="error" class="session-banner">
    <strong>Your session has expired.</strong>
    Nothing you were doing is lost: composer drafts stay on this device. Sign in again to continue.
    <UiButton variant="primary" @click="c.reload()">Sign in again</UiButton>
  </UiNotice>
</template>

<style scoped>
.session-banner {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}
</style>
