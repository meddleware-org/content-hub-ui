<script setup lang="ts">
// The fields of a phase: its internal wording (never published), its public wording, its window and who may see it.
import { UiCheckField, UiDateTimeField, UiTextField } from '@meddleware/ui'
import { useConsole } from '../console.js'
import type { PhaseFields } from '../lib/roadmap-form.js'

const form = defineModel<PhaseFields>({ required: true })
const c = useConsole()
</script>

<template>
  <UiTextField id="pf-key" v-model="form.key" label="Key" hint="Lower-case letters, digits and hyphens." />
  <UiTextField id="pf-order" v-model="form.sort_order" label="Position" inputmode="numeric" />
  <UiTextField id="pf-iname" v-model="form.internal_name" label="Internal name (never published)" />
  <UiTextField id="pf-idesc" v-model="form.internal_description" label="Internal description (never published)" :rows="3" />
  <UiTextField id="pf-pname" v-model="form.public_name" label="Public name" />
  <UiTextField id="pf-pdesc" v-model="form.public_description" label="Public description" :rows="3" />
  <UiDateTimeField id="pf-start" v-model="form.window_start" :zone="c.zone.value" label="Window starts" />
  <UiDateTimeField id="pf-end" v-model="form.window_end" :zone="c.zone.value" label="Window ends" />
  <UiCheckField v-model="form.visible_human" label="Show to people" />
  <UiCheckField v-model="form.visible_bot" label="Show to bots" />
</template>
