<script setup lang="ts">
// Standalone shell of the admin console. The console itself is ContentHubView.vue (also exported).
import { AppFooter, AppHeader, BrandMark, ColorModeControl, CopyrightLine, UiAppShell, useColorMode } from '@meddleware/ui'
import ContentHubView from './ContentHubView.vue'

const { mode, set } = useColorMode('dark')
const BRAND = import.meta.env.VITE_BRAND_NAME || 'Content hub'
const DOCS_URL = import.meta.env.VITE_DOCS_URL || undefined
</script>

<template>
  <UiAppShell>
    <template #header>
      <AppHeader variant="dark">
        <template #brand><BrandMark /> {{ BRAND }}</template>
        <template #actions>
          <ColorModeControl :model-value="mode" @update:model-value="set" />
        </template>
      </AppHeader>
    </template>

    <h1 class="mw-visually-hidden">{{ BRAND }}</h1>
    <ContentHubView />

    <template #footer>
      <AppFooter :docs-url="DOCS_URL">
        <CopyrightLine symbol-variant="kopimi" organisation-name="Meddleware" rights-statement="jam" />
      </AppFooter>
    </template>
  </UiAppShell>
</template>
