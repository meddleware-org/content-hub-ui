<script setup lang="ts">
// A checkbox with its label wrapped around it.
defineProps<{ label: string; modelValue: boolean; disabled?: boolean; hint?: string }>()
defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label class="check">
    <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span>{{ label }}<span v-if="hint" class="hint"> — {{ hint }}</span></span>
  </label>
</template>

<style scoped>
.check {
  display: flex;
  gap: var(--space-xs);
  align-items: baseline;
}

.hint {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
