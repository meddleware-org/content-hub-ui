<script setup lang="ts">
// Which targets a post goes to: the enabled targets of platforms that can post, with how each one sends (by hand, a sandbox, a dry run).
// Related: views/ComposerView.vue (hosts it), lib/composer.ts (what is checked for each).
// The shared checkbox and empty state.
import { UiCheckField, UiEmptyState } from '@meddleware/ui'
// The platform and target shapes.
import type { PlatformDefinition, PlatformTarget } from '../api/types.js'

/** A target the post may go to, with its platform. */
export interface TargetChoice {
  target: PlatformTarget
  def: PlatformDefinition
}

// The selected target ids.
const selected = defineModel<number[]>({ required: true })
// The targets to offer, each with its platform.
defineProps<{ choices: TargetChoice[] }>()

// Add or remove an id; a set keeps it free of duplicates.
/** Select or deselect a target. */
function toggle(id: number, on: boolean) {
  selected.value = on ? [...new Set([...selected.value, id])] : selected.value.filter((x) => x !== id)
}
</script>

<template>
  <!-- A native fieldset groups the choices; its legend names the group. -->
  <fieldset class="targets">
    <!-- The group's name for assistive technology. -->
    <legend>Publish to</legend>
    <!-- Nothing to choose from yet. -->
    <UiEmptyState v-if="!choices.length">No enabled targets yet. Add one under Publishing.</UiEmptyState>
    <!-- One checkbox per target. -->
    <UiCheckField v-for="x in choices" :key="x.target.id" class="target-choice" :model-value="selected.includes(x.target.id)" @update:model-value="toggle(x.target.id, $event)">
      <!-- The label says which platform it is and how it sends: by hand, a sandbox or a dry run. -->
      <template #label>
        {{ x.target.name }} <span class="muted">— {{ x.def.name }}<template v-if="x.def.posting_mode === 'manual'"> · posted by hand</template><template v-if="x.target.is_sandbox"> · sandbox</template><template v-if="!x.target.live && x.def.posting_mode !== 'manual'"> · dry run only</template></span>
      </template>
    </UiCheckField>
  </fieldset>
</template>

<style scoped>
/* A bordered box with the shared radius and padding. */
.targets {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs) var(--space-sm);
}

/* The platform and how it sends are de-emphasised. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
