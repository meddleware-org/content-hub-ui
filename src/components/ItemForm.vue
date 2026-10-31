<script setup lang="ts">
// The fields of a roadmap item: internal and public wording, status, dates and who may see it.
import { ITEM_STATUS_VALUES, ITEM_TYPE_VALUES } from '@meddleware/content-hub-client'
import { UiCheckField, UiDateTimeField, UiSelectField, UiTextField } from '@meddleware/ui'
import { humanize } from '@meddleware/web-utils'
import { useConsole } from '../console.js'
import type { ItemFields } from '../lib/roadmap-form.js'

const form = defineModel<ItemFields>({ required: true })
defineProps<{ phaseOptions: ReadonlyArray<readonly [string, string]> }>()
const c = useConsole()

const TYPE_OPTIONS = ITEM_TYPE_VALUES.map((s) => [s, humanize(s)] as const)
const STATUS_OPTIONS = ITEM_STATUS_VALUES.map((s) => [s, humanize(s)] as const)
</script>

<template>
  <UiSelectField id="if-phase" v-model="form.phase_id" label="Phase" :options="phaseOptions" />
  <UiTextField id="if-key" v-model="form.key" label="Key" hint="Lower-case letters, digits and hyphens." />
  <UiSelectField id="if-type" v-model="form.item_type" label="Type" :options="TYPE_OPTIONS" />
  <UiSelectField id="if-status" v-model="form.status" label="Status" :options="STATUS_OPTIONS" />
  <UiTextField id="if-ititle" v-model="form.internal_title" label="Internal title (never published)" />
  <UiTextField id="if-idesc" v-model="form.internal_description" label="Internal description (never published)" :rows="3" />
  <UiTextField id="if-ptitle" v-model="form.public_title" label="Public title" hint="Required before the item can be shown to anyone." />
  <UiTextField id="if-pdesc" v-model="form.public_description" label="Public description" :rows="3" />
  <UiCheckField v-model="form.visible_human" label="Show to people" />
  <UiCheckField v-model="form.visible_bot" label="Show to bots" />
  <UiDateTimeField id="if-planned" v-model="form.planned_at" :zone="c.zone.value" label="Planned (internal)" />
  <UiDateTimeField id="if-due" v-model="form.due_at" :zone="c.zone.value" label="Due (internal)" />
  <UiDateTimeField id="if-pdue" v-model="form.public_due_at" :zone="c.zone.value" label="Public date" hint="Optional; shown to visitors when set." />
</template>
