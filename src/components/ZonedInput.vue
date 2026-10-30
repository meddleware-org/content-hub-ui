<script setup lang="ts">
// A date-and-time field that shows and edits wall-clock time in the chosen zone and exchanges UTC instants.
import { computed } from 'vue'
import { UiFormField } from '@meddleware/ui'
import { useConsole } from '../console.js'
import { fromLocalInput, toLocalInput } from '../lib/time.js'

const props = defineProps<{ id: string; label: string; modelValue: string | null; hint?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const c = useConsole()

const local = computed(() => toLocalInput(props.modelValue, c.zone.value))
function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v === '' ? null : fromLocalInput(v, c.zone.value))
}
</script>

<template>
  <UiFormField :id="id" :label="`${label} (${c.zone.value})`" :hint="hint">
    <template #default="{ attrs }">
      <input
        :id="attrs.id"
        :aria-invalid="attrs['aria-invalid']"
        :aria-describedby="attrs['aria-describedby']"
        type="datetime-local"
        :value="local"
        @input="onInput"
      />
    </template>
  </UiFormField>
</template>
