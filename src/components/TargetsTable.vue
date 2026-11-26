<script setup lang="ts">
// The targets table: whether each is enabled, a sandbox, and sends for real (turning that on is asked about first, by the view).
// Related: views/PublishingView.vue (owns the requests and the confirmation).
// The shared button, checkbox, table and panel.
import { UiButton, UiCheckField, UiDataTable, UiPanel } from '@meddleware/ui'
// The target's shape.
import type { PlatformTarget } from '../api/types.js'

// The targets and whether a change is in flight.
defineProps<{ targets: PlatformTarget[]; busy: boolean }>()
// The view makes every change: `patch` for enabled and sandbox, `live` for going live (which it asks about first), `add` for a new target.
defineEmits<{ patch: [target: PlatformTarget, body: Record<string, unknown>, say: string]; live: [target: PlatformTarget, on: boolean]; add: [] }>()
</script>

<template>
  <UiPanel title="Targets" :level="3">
    <!-- The table, with its caption for assistive technology. -->
    <UiDataTable caption="Targets" empty="No targets yet." :rows="targets.length">
      <!-- The column headings. -->
      <template #head>
        <th scope="col">Target</th>
        <th scope="col">Credential (a variable name)</th>
        <th scope="col">Enabled</th>
        <th scope="col">Sandbox</th>
        <th scope="col">Sends for real</th>
      </template>
      <!-- One row per target. -->
      <tr v-for="t in targets" :key="t.id">
        <!-- The target's name, with its platform and outside reference beneath. -->
        <th scope="row">{{ t.name }}<span class="muted sub">{{ t.platform_code }}<template v-if="t.external_ref"> · {{ t.external_ref }}</template></span></th>
        <!-- The name of the variable that holds the credential, never the credential itself. -->
        <td>{{ t.secret_ref ?? '—' }}</td>
        <!-- Enable or disable the target. -->
        <td><UiCheckField :label="`${t.name} is enabled`" :model-value="t.enabled" :disabled="busy" @update:model-value="$emit('patch', t, { enabled: $event }, `${t.name} ${$event ? 'enabled' : 'disabled'}.`)" /></td>
        <!-- Mark it as a sandbox or not. -->
        <td><UiCheckField :label="`${t.name} is a sandbox`" :model-value="t.is_sandbox" :disabled="busy" @update:model-value="$emit('patch', t, { is_sandbox: $event }, `${t.name} ${$event ? 'marked' : 'no longer marked'} as a sandbox.`)" /></td>
        <!-- Allow real sends; the view confirms before turning it on. -->
        <td><UiCheckField :label="`${t.name} sends for real`" :model-value="t.live" :disabled="busy" @update:model-value="$emit('live', t, $event)" /></td>
      </tr>
    </UiDataTable>
    <!-- Ask the view to open the new-target dialog. -->
    <UiButton variant="secondary" @click="$emit('add')">Add a target</UiButton>
  </UiPanel>
</template>

<style scoped>
/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}

/* The platform and reference sit on their own line. */
.sub {
  display: block;
}
</style>
