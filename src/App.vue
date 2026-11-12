<script setup lang="ts">
// Standalone shell of the admin console: the shared tool shell, not contained (the console is full width). The console itself
// is ContentHubView.vue (also exported). The shell's own (visually hidden) heading is the page's one h1.
import { AppToolShell } from '@meddleware/ui'
import ContentHubView from './ContentHubView.vue'

const BRAND = import.meta.env.VITE_BRAND_NAME || 'Content hub'
const DOCS_URL = import.meta.env.VITE_DOCS_URL || false
</script>

<template>
  <AppToolShell :title="BRAND" slug="content-hub" :docs-url="DOCS_URL" :dev-url="false" :contained="false">
    <ContentHubView />
  </AppToolShell>
</template>
