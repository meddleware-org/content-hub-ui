<script setup lang="ts">
// The admin console. Rendered standalone by App.vue and exported for embedding. It talks only to the same-origin admin
// API; the session is held by the access gateway in front of it, never by this code. When a request finds the
// session ended, a banner offers to sign in again; unsent composer drafts live in this browser and survive it.
import { computed, onMounted, ref, type Component } from 'vue'
import { AppTabNav, UiTabPanel, safePath, type AppTab } from '@meddleware/ui'
import SelectField from './components/SelectField.vue'
import SessionBanner from './components/SessionBanner.vue'
import { SIGN_OUT_PATH, createConsole, provideConsole, type ConsoleOptions } from './console.js'
import { describeError } from './api/errors.js'
import type { Me } from './api/types.js'
import { SECTIONS } from './sections.js'
import BudgetsView from './views/BudgetsView.vue'
import ComposerView from './views/ComposerView.vue'
import DashboardView from './views/DashboardView.vue'
import PublishingView from './views/PublishingView.vue'
import RoadmapView from './views/RoadmapView.vue'
import ScheduleView from './views/ScheduleView.vue'
import TasksView from './views/TasksView.vue'
import { browserZone } from './lib/time.js'

// `fetch` and `reload` exist so hosts and tests can substitute them; the defaults are the browser's.
const props = defineProps<Partial<ConsoleOptions>>()
const c = createConsole({ fetch: props.fetch, reload: props.reload })
provideConsole(c)

const VIEWS: Record<string, Component> = {
  dashboard: DashboardView,
  roadmap: RoadmapView,
  tasks: TasksView,
  composer: ComposerView,
  instances: PublishingView,
  schedule: ScheduleView,
  budgets: BudgetsView,
}

const TABS: AppTab[] = SECTIONS.map((s) => ({ id: s.id, label: s.label }))
const activeTab = ref<string>(SECTIONS[0]?.id ?? 'dashboard')
const active = computed(() => SECTIONS.find((s) => s.id === activeTab.value) ?? SECTIONS[0]!)
const loadError = ref<string | null>(null)

onMounted(async () => {
  try {
    c.me.value = await c.http.get<Me>('/me')
  } catch (e) {
    loadError.value = describeError(e)
  }
})

const zoneOptions = computed<Array<readonly [string, string]>>(() => {
  let all: string[] = []
  try {
    all = Intl.supportedValuesOf('timeZone')
  } catch {
    all = ['Europe/London', 'America/New_York', 'Asia/Tokyo']
  }
  return [...new Set(['UTC', browserZone(), c.zone.value, ...all])].map((z) => [z, z] as const)
})
</script>

<template>
  <div class="content-hub-view">
    <SessionBanner />
    <p v-if="loadError && !c.expired.value" class="load-error" role="alert">{{ loadError }}</p>

    <div class="who">
      <p class="who-name">
        <template v-if="c.me.value">Signed in as <strong>{{ c.me.value.display_name }}</strong></template>
        <template v-else>Checking who you are…</template>
        <template v-if="safePath(SIGN_OUT_PATH)"> · <a :href="safePath(SIGN_OUT_PATH)">Sign out</a></template>
      </p>
      <SelectField id="console-zone" :model-value="c.zone.value" label="Show times in" :options="zoneOptions" @update:model-value="c.setZone($event)" />
    </div>

    <AppTabNav v-model="activeTab" :tabs="TABS" id-prefix="content-hub" variant="raised" aria-label="Content hub sections" />
    <UiTabPanel id-prefix="content-hub" :tab="activeTab" class="content-hub-panel">
      <h2 class="section-title">{{ active.label }}</h2>
      <p class="section-summary">{{ active.summary }}</p>
      <KeepAlive include="ComposerView">
        <component :is="VIEWS[activeTab]" :key="activeTab" @navigate="activeTab = $event" />
      </KeepAlive>
    </UiTabPanel>
  </div>
</template>

<style scoped>
.content-hub-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
}

.who {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: end;
  justify-content: space-between;
}

.who-name {
  margin: 0;
}

.load-error {
  color: var(--danger);
}

.section-title {
  margin: 0 0 var(--space-xs);
}

.section-summary {
  color: var(--muted);
  margin: 0 0 var(--space-sm);
}
</style>
