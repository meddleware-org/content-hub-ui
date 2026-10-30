<script setup lang="ts">
// A labelled text input (or textarea when `rows` is given) with the explicit attribute binding the fleet's lint rules
// require on native controls.
import { UiFormField } from '@meddleware/ui'

withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue: string
    type?: 'text' | 'url' | 'number' | 'search'
    rows?: number
    hint?: string
    error?: string | null
    maxlength?: number
    placeholder?: string
    required?: boolean
    disabled?: boolean
    inputmode?: 'text' | 'numeric' | 'decimal' | 'url'
  }>(),
  { type: 'text', rows: undefined, hint: undefined, error: null, maxlength: undefined, placeholder: undefined, inputmode: undefined },
)
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <UiFormField :id="id" :label="label" :hint="hint" :error="error">
    <template #default="{ attrs }">
      <textarea
        v-if="rows"
        :id="attrs.id"
        :aria-invalid="attrs['aria-invalid']"
        :aria-describedby="attrs['aria-describedby']"
        :value="modelValue"
        :rows="rows"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      />
      <input
        v-else
        :id="attrs.id"
        :aria-invalid="attrs['aria-invalid']"
        :aria-describedby="attrs['aria-describedby']"
        :type="type"
        :value="modelValue"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :required="required"
        :disabled="disabled"
        :inputmode="inputmode"
        autocomplete="off"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </template>
  </UiFormField>
</template>

<style scoped>
input,
textarea {
  width: 100%;
}
</style>
