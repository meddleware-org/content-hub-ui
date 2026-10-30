<script setup lang="ts">
// A small choice between views: native radio buttons in a labelled group, text in the body colour, the chosen one
// marked by a filled background AND a leading tick (so the choice is not carried by colour alone).
defineProps<{ options: ReadonlyArray<{ id: string; label: string }>; modelValue: string; label: string }>()
defineEmits<{ 'update:modelValue': [id: string] }>()
</script>

<template>
  <fieldset class="mode">
    <legend class="sr-only">{{ label }}</legend>
    <label v-for="o in options" :key="o.id" class="mode-item" :class="{ 'mode-on': o.id === modelValue }">
      <input class="sr-only" type="radio" :name="label" :value="o.id" :checked="o.id === modelValue" @change="$emit('update:modelValue', o.id)" />
      <span v-if="o.id === modelValue" aria-hidden="true">✓ </span>{{ o.label }}
    </label>
  </fieldset>
</template>

<style scoped>
.mode {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  width: fit-content;
  max-width: 100%;
}

.mode-item {
  padding: var(--space-2xs) var(--space-sm);
  color: var(--text);
  background: var(--surface);
  cursor: pointer;
}

.mode-item + .mode-item {
  border-left: 1px solid var(--border);
}

.mode-on {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.mode-item:focus-within {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
