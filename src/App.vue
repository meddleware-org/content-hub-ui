<script setup lang="ts">
// Standalone shell of the admin console. The console itself is ContentHubView.vue (also exported).
import { AppHeader, AppFooter, ColorModeControl, useColorMode } from '@meddleware/ui'
import ContentHubView from './ContentHubView.vue'

const { mode, set } = useColorMode('dark')
const BRAND = import.meta.env.VITE_BRAND_NAME || 'Content hub'
const DOCS_URL = import.meta.env.VITE_DOCS_URL || undefined
</script>

<template>
  <div class="app">
    <AppHeader variant="dark">
      <template #brand>
        <h1 class="brand-title">{{ BRAND }}</h1>
      </template>
      <template #actions>
        <ColorModeControl :model-value="mode" @update:model-value="set" />
      </template>
    </AppHeader>

    <main class="app-main">
      <ContentHubView />
    </main>

    <AppFooter :docs-url="DOCS_URL" />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
}

.brand-title {
  font: inherit;
  margin: 0;
}
</style>
