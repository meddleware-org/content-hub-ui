<script setup lang="ts">
// Which targets a post goes to: the enabled targets of platforms that can post, with how each one sends (by hand, a sandbox, a dry run).
import { UiCheckField, UiEmptyState } from '@meddleware/ui'
import type { PlatformDefinition, PlatformTarget } from '../api/types.js'

export interface TargetChoice {
  target: PlatformTarget
  def: PlatformDefinition
}

const selected = defineModel<number[]>({ required: true })
defineProps<{ choices: TargetChoice[] }>()

function toggle(id: number, on: boolean) {
  selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter((x) => x !== id)
}
</script>

<template>
  <fieldset class="targets">
    <legend>Publish to</legend>
    <UiEmptyState v-if="!choices.length">No enabled targets yet. Add one under Publishing.</UiEmptyState>
    <UiCheckField v-for="x in choices" :key="x.target.id" class="target-choice" :model-value="selected.includes(x.target.id)" @update:model-value="toggle(x.target.id, $event)">
      <template #label>
        {{ x.target.name }} <span class="muted">— {{ x.def.name }}<template v-if="x.def.posting_mode === 'manual'"> · posted by hand</template><template v-if="x.target.is_sandbox"> · sandbox</template><template v-if="!x.target.live && x.def.posting_mode !== 'manual'"> · dry run only</template></span>
      </template>
    </UiCheckField>
  </fieldset>
</template>

<style scoped>
.targets {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-sm);
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
