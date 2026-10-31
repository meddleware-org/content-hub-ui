<script setup lang="ts">
// The targets: whether each is enabled, a sandbox, and sends for real (turning that on is asked about first, by the view).
import { UiButton, UiCheckField, UiDataTable, UiPanel } from '@meddleware/ui'
import type { PlatformTarget } from '../api/types.js'

defineProps<{ targets: PlatformTarget[]; busy: boolean }>()
defineEmits<{ patch: [target: PlatformTarget, body: Record<string, unknown>, say: string]; live: [target: PlatformTarget, on: boolean]; add: [] }>()
</script>

<template>
  <UiPanel title="Targets" :level="3">
    <UiDataTable caption="Targets" empty="No targets yet." :rows="targets.length">
      <template #head>
        <th scope="col">Target</th>
        <th scope="col">Credential (a variable name)</th>
        <th scope="col">Enabled</th>
        <th scope="col">Sandbox</th>
        <th scope="col">Sends for real</th>
      </template>
      <tr v-for="t in targets" :key="t.id">
        <th scope="row">{{ t.name }}<br /><span class="muted">{{ t.platform_code }}<template v-if="t.external_ref"> · {{ t.external_ref }}</template></span></th>
        <td>{{ t.secret_ref ?? '—' }}</td>
        <td><UiCheckField :label="`${t.name} is enabled`" :model-value="t.enabled" :disabled="busy" @update:model-value="$emit('patch', t, { enabled: $event }, `${t.name} ${$event ? 'enabled' : 'disabled'}.`)" /></td>
        <td><UiCheckField :label="`${t.name} is a sandbox`" :model-value="t.is_sandbox" :disabled="busy" @update:model-value="$emit('patch', t, { is_sandbox: $event }, `${t.name} ${$event ? 'marked' : 'no longer marked'} as a sandbox.`)" /></td>
        <td><UiCheckField :label="`${t.name} sends for real`" :model-value="t.live" :disabled="busy" @update:model-value="$emit('live', t, $event)" /></td>
      </tr>
    </UiDataTable>
    <UiButton variant="secondary" @click="$emit('add')">Add a target</UiButton>
  </UiPanel>
</template>

<style scoped>
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
