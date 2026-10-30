<script setup lang="ts">
// A labelled select. `options` are [value, label]; an empty value is the "any" / "none" choice when `placeholder` is
// given.
import { UiFormField, UiSelect } from '@meddleware/ui'

defineProps<{
  id: string
  label: string
  modelValue: string
  options: ReadonlyArray<readonly [string, string]>
  placeholder?: string
  hint?: string
  disabled?: boolean
}>()
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <UiFormField :id="id" :label="label" :hint="hint">
    <template #default="{ attrs }">
      <UiSelect v-bind="attrs" :model-value="modelValue" :disabled="disabled" @update:model-value="$emit('update:modelValue', $event ?? '')">
        <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
        <option v-for="[value, text] in options" :key="value" :value="value">{{ text }}</option>
      </UiSelect>
    </template>
  </UiFormField>
</template>
