<script setup lang="ts">
// The saved posts, newest first, to open one again.
import { UiButton, UiEmptyState, UiNotice, UiPager, UiPanel, type Pager } from '@meddleware/ui'
import type { Post } from '../api/types.js'
import { statusLabel } from '../lib/status.js'

defineProps<{ posts: Pager<Post>; busy: boolean }>()
defineEmits<{ open: [id: number] }>()
</script>

<template>
  <UiPanel title="Your posts" :level="3">
    <UiNotice v-if="posts.error.value" type="error" :message="posts.error.value" />
    <ul v-if="posts.items.value.length" class="posts">
      <li v-for="p in posts.items.value" :key="p.id">
        <span>
          <strong>{{ p.title }}</strong>
          <span class="muted"> — {{ statusLabel(p.status) }}, revision {{ p.revision }}</span>
        </span>
        <UiButton variant="ghost" :disabled="busy" @click="$emit('open', p.id)">Open</UiButton>
      </li>
    </ul>
    <UiEmptyState v-else-if="!posts.loading.value">No posts yet.</UiEmptyState>
    <UiPager :index="posts.index.value" :has-next="posts.hasNext.value" :loading="posts.loading.value" label="Posts pages" prev-label="Newer" next-label="Older" @prev="posts.prev()" @next="posts.next()" />
  </UiPanel>
</template>

<style scoped>
.posts li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-3xs) 0;
  border-bottom: 1px solid var(--border);
}

.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
