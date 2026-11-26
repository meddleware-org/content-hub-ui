<script setup lang="ts">
// The fields of a roadmap phase: its internal wording (never published), its public wording, its window and who may see it. Related: lib/roadmap-form.ts (the data),
// views/RoadmapView.vue (the dialog that holds it).
// The shared fields.
import { UiCheckField, UiDateTimeField, UiTextField } from '@meddleware/ui'
// The console context, for the display time zone.
import { useConsole } from '../console.js'
// The form's shape.
import type { PhaseFields } from '../lib/roadmap-form.js'

// The form, edited in place by the parent's dialog.
const form = defineModel<PhaseFields>({ required: true })
// The context (the zone for the date fields).
const c = useConsole()
</script>

<template>
  <!-- The stable key. -->
  <UiTextField id="pf-key" v-model="form.key" label="Key" hint="Lower-case letters, digits and hyphens." />
  <!-- The position among phases. -->
  <UiTextField id="pf-order" v-model="form.sort_order" label="Position" inputmode="numeric" />
  <!-- The team's name for the phase; never published. -->
  <UiTextField id="pf-iname" v-model="form.internal_name" label="Internal name (never published)" />
  <!-- The team's description; never published. -->
  <UiTextField id="pf-idesc" v-model="form.internal_description" label="Internal description (never published)" :rows="3" />
  <!-- The name the public roadmap shows. -->
  <UiTextField id="pf-pname" v-model="form.public_name" label="Public name" />
  <!-- The description the public roadmap shows. -->
  <UiTextField id="pf-pdesc" v-model="form.public_description" label="Public description" :rows="3" />
  <!-- When the phase begins, in the chosen zone. -->
  <UiDateTimeField id="pf-start" v-model="form.window_start" :zone="c.zone.value" label="Window starts" />
  <!-- When the phase ends. -->
  <UiDateTimeField id="pf-end" v-model="form.window_end" :zone="c.zone.value" label="Window ends" />
  <!-- Whether people see it on the public roadmap page. -->
  <UiCheckField v-model="form.visible_human" label="Show to people" />
  <!-- Whether it is in the machine-readable roadmap. -->
  <UiCheckField v-model="form.visible_bot" label="Show to bots" />
</template>
