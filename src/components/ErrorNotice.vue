<script setup lang="ts">
import { UiNotice } from '@meddleware/ui'

defineProps<{ message: string | null | undefined }>()
</script>

<template>
  <UiNotice v-if="message" type="error">{{ message }}</UiNotice>
</template>
