<script setup lang="ts">
// The fields of a roadmap item: internal and public wording, status, dates and who may see it. Related: lib/roadmap-form.ts (the data),
// views/RoadmapView.vue (the dialog that holds it).
// The shared vocabularies of item types and statuses.
import { ITEM_STATUS_VALUES, ITEM_TYPE_VALUES } from '@meddleware/content-hub-client'
// The shared fields.
import { UiCheckField, UiDateTimeField, UiSelectField, UiTextField } from '@meddleware/ui'
// Turns a value into words (`in_progress` becomes `in progress`).
import { humanize } from '@meddleware/web-utils'
// The console context, for the display time zone.
import { useConsole } from '../console.js'
// The form's shape.
import type { ItemFields } from '../lib/roadmap-form.js'

// The form, edited in place by the parent's dialog.
const form = defineModel<ItemFields>({ required: true })
// The phases to choose from, as value and label.
defineProps<{ phaseOptions: ReadonlyArray<readonly [string, string]> }>()
// The context (the zone for the date fields).
const c = useConsole()

// The item types as options.
const TYPE_OPTIONS = ITEM_TYPE_VALUES.map((s) => [s, humanize(s)] as const)
// The item statuses as options.
const STATUS_OPTIONS = ITEM_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
</script>

<template>
  <!-- The phase the item belongs to. -->
  <UiSelectField id="if-phase" v-model="form.phase_id" label="Phase" :options="phaseOptions" />
  <!-- The stable key. -->
  <UiTextField id="if-key" v-model="form.key" label="Key" hint="Lower-case letters, digits and hyphens." />
  <!-- What kind of item it is. -->
  <UiSelectField id="if-type" v-model="form.item_type" label="Type" :options="TYPE_OPTIONS" />
  <!-- Where it stands. -->
  <UiSelectField id="if-status" v-model="form.status" label="Status" :options="STATUS_OPTIONS" />
  <!-- The team's title; never published. -->
  <UiTextField id="if-ititle" v-model="form.internal_title" label="Internal title (never published)" />
  <!-- The team's description; never published. -->
  <UiTextField id="if-idesc" v-model="form.internal_description" label="Internal description (never published)" :rows="3" />
  <!-- The title the public sees; an item with none stays off the public roadmap. -->
  <UiTextField id="if-ptitle" v-model="form.public_title" label="Public title" hint="Required before the item can be shown to anyone." />
  <!-- The description the public sees. -->
  <UiTextField id="if-pdesc" v-model="form.public_description" label="Public description" :rows="3" />
  <!-- Whether people see it. -->
  <UiCheckField v-model="form.visible_human" label="Show to people" />
  <!-- Whether it is in the machine-readable roadmap. -->
  <UiCheckField v-model="form.visible_bot" label="Show to bots" />
  <!-- When it is planned for (internal). -->
  <UiDateTimeField id="if-planned" v-model="form.planned_at" :zone="c.zone.value" label="Planned (internal)" />
  <!-- The internal due date. -->
  <UiDateTimeField id="if-due" v-model="form.due_at" :zone="c.zone.value" label="Due (internal)" />
  <!-- The date the public sees, if any. -->
  <UiDateTimeField id="if-pdue" v-model="form.public_due_at" :zone="c.zone.value" label="Public date" hint="Optional; shown to visitors when set." />
</template>
