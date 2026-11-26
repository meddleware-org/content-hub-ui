<script setup lang="ts">
// The standalone shell of the admin console: the shared tool shell, not contained (the console is full width), around ContentHubView.vue. The shell's own
// (visually hidden) heading is the page's one h1. Related: src/main.ts mounts it; src/index.ts exports the view for embedding.
// The shared tool shell: header, colour mode and footer.
import { AppToolShell } from '@meddleware/ui'
// The console itself.
import ContentHubView from './ContentHubView.vue'

// The name in the header; `VITE_BRAND_NAME` overrides the default.
const BRAND = import.meta.env.VITE_BRAND_NAME || 'Content hub'
// An optional documentation link for the footer; false hides it.
const DOCS_URL = import.meta.env.VITE_DOCS_URL || false
</script>

<template>
  <AppToolShell :title="BRAND" slug="content-hub" :docs-url="DOCS_URL" :dev-url="false" :contained="false">
    <!-- The console. -->
    <ContentHubView />
  </AppToolShell>
</template>
