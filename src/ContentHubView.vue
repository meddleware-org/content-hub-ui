<script setup lang="ts">
// The admin console: its identity row, time-zone choice, section tabs and the open section. Rendered standalone by App.vue and exported from src/index.ts.
// It talks only to the same-origin admin API; the session is held by the access gateway in front of it, never by this code. When a request finds the session ended, a banner
// offers to sign in again, and unsent composer drafts (kept in this browser) survive it. Related: console.ts (the shared context), sections.ts, views/ (one per section).
// Vue's reactivity and lazy components.
import { computed, defineAsyncComponent, onMounted, ref, type Component } from 'vue'
// Tabs, a notice, a select and the tab panel from the shared UI.
import { AppTabNav, UiNotice, UiSelectField, UiTabPanel, type AppTab } from '@meddleware/ui'
// The browser's time zone, and a check that a path is a safe same-site link.
import { browserZone, safePath } from '@meddleware/web-utils'
// The banner shown when the session has ended.
import SessionBanner from './components/SessionBanner.vue'
// The console context and the gateway's sign-out path.
import { SIGN_OUT_PATH, createConsole, provideConsole, type ConsoleOptions } from './console.js'
// The words for a failed request.
import { describeError } from './api/errors.js'
// Who is signed in.
import type { Me } from './api/types.js'
// The sections in order.
import { SECTIONS } from './sections.js'

// `fetch` and `reload` exist so hosts and tests can substitute them; the defaults are the browser's.
// `fetch` and `reload` exist so hosts and tests can substitute them; the defaults are the browser's.
const props = defineProps<Partial<ConsoleOptions>>()
// The console context: HTTP, the signed-in person, the zone and the reference data.
const c = createConsole({ fetch: props.fetch, reload: props.reload, navigate: props.navigate })
// Every section below reads it with `useConsole()`.
provideConsole(c)

// Each section loads when it is first opened.
// Each section's view, loaded the first time it is opened (so the first paint carries only what is shown).
const VIEWS: Record<string, Component> = {
  dashboard: defineAsyncComponent(() => import('./views/DashboardView.vue')),
  roadmap: defineAsyncComponent(() => import('./views/RoadmapView.vue')),
  tasks: defineAsyncComponent(() => import('./views/TasksView.vue')),
  composer: defineAsyncComponent(() => import('./views/ComposerView.vue')),
  instances: defineAsyncComponent(() => import('./views/PublishingView.vue')),
  schedule: defineAsyncComponent(() => import('./views/ScheduleView.vue')),
  budgets: defineAsyncComponent(() => import('./views/BudgetsView.vue')),
}

// The tabs, from the sections.
const TABS: AppTab[] = SECTIONS.map((s) => ({ id: s.id, label: s.label }))
// The open tab; the first section at start.
const activeTab = ref<string>(SECTIONS[0]?.id ?? 'dashboard')
// The open section, for its heading and summary.
const active = computed(() => SECTIONS.find((s) => s.id === activeTab.value) ?? SECTIONS[0]!)
// A failure to learn who is signed in.
const loadError = ref<string | null>(null)

// Ask who is signed in; a failure is shown in words, unless the session ended (the banner says that).
onMounted(async () => {
  try {
    c.me.value = await c.http.get<Me>('/me')
  } catch (e) {
    loadError.value = describeError(e)
  }
})

// The zones the person may pick: UTC, their own, the current one, then every zone the browser knows (a short list where it cannot say).
const zoneOptions = computed<Array<readonly [string, string]>>(() => {
  // The browser's list of zones.
  let all: string[] = []
  try {
    // Ask the browser for every IANA zone.
    all = Intl.supportedValuesOf('timeZone')
  } catch {
    // An older browser: offer a short list.
    all = ['Europe/London', 'America/New_York', 'Asia/Tokyo']
  }
  // No duplicates, as pairs of value and label.
  return [...new Set(['UTC', browserZone(), c.zone.value, ...all])].map((z) => [z, z] as const)
})
</script>

<template>
  <div class="content-hub-view">
    <!-- Shown only once the session has ended. -->
    <SessionBanner />
    <!-- A failed identity read, in words. -->
    <UiNotice v-if="loadError && !c.expired.value" type="error" :message="loadError" />
    <!-- A failed sign-out, in words. -->
    <UiNotice v-if="c.signOutError.value" type="error" :message="c.signOutError.value" />

    <!-- Who is signed in, with sign-out and the time-zone choice. -->
    <div class="who">
      <!-- The signed-in name, a placeholder while it is read, and the sign-out link when the path is safe. -->
      <p class="who-name">
        <template v-if="c.me.value">Signed in as <strong>{{ c.me.value.display_name }}</strong></template>
        <template v-else>Checking who you are…</template>
        <!-- Signed in through the platform's identity provider: signing out ends this session and the provider's, through the console. -->
        <template v-if="c.me.value?.via === 'oidc'"> · <button type="button" class="sign-out" @click="c.signOut()">Sign out</button></template>
        <!-- Otherwise the access gateway signs out, through its own path. -->
        <template v-else-if="safePath(SIGN_OUT_PATH)"> · <a :href="safePath(SIGN_OUT_PATH)">Sign out</a></template>
      </p>
      <!-- The zone times are shown and edited in; the choice is remembered on this device. -->
      <UiSelectField id="console-zone" :model-value="c.zone.value" label="Show times in" :options="zoneOptions" @update:model-value="c.setZone($event)" />
    </div>

    <!-- The section tabs. -->
    <AppTabNav v-model="activeTab" :tabs="TABS" id-prefix="content-hub" variant="raised" aria-label="Content hub sections" />
    <!-- The open section's panel. -->
    <UiTabPanel id-prefix="content-hub" :tab="activeTab" class="content-hub-panel">
      <!-- The section's name. -->
      <h2 class="section-title">{{ active.label }}</h2>
      <!-- One sentence about what the section is for. -->
      <p class="section-summary">{{ active.summary }}</p>
      <!-- The open section's view (it may ask to switch tab); the composer keeps its state when the person changes tab, so a half-written post is not lost. -->
      <KeepAlive include="ComposerView">
          <component :is="VIEWS[activeTab]" :key="activeTab" @navigate="activeTab = $event" />
      </KeepAlive>
    </UiTabPanel>
  </div>
</template>

<style scoped>
/* The console is a column with the shared spacing. */
.content-hub-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
}

/* The identity row wraps on a narrow screen. */
.who {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
  align-items: end;
  justify-content: space-between;
}

/* No default margin. */
.who-name {
  margin: 0;
}

/* Signing out sends a request, so it is a button, drawn like the link it replaces (the accent colour, underlined, the text's own size). */
.sign-out {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: var(--accent);
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

/* A small gap under the title. */
.section-title {
  margin: 0 0 var(--space-xs);
}

/* The summary is de-emphasised. */
.section-summary {
  color: var(--muted);
  margin: 0 0 var(--space-sm);
}
</style>
