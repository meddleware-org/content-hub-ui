<script setup lang="ts">
// The saved posts, newest first, so one can be opened again. Related: views/ComposerView.vue (hosts it), the shared pager (`@meddleware/ui`).
// The shared button, empty state, notice, pager and panel, and the pager's type.
import { UiButton, UiEmptyState, UiNotice, UiPager, UiPanel, type Pager } from '@meddleware/ui'
// The post's shape.
import type { Post } from '../api/types.js'
// A status as words.
import { statusLabel } from '../lib/status.js'

// The pager over the saved posts, and whether something is in flight.
defineProps<{ posts: Pager<Post>; busy: boolean }>()
// Ask the view to open a post in the editor.
defineEmits<{ open: [id: number] }>()
</script>

<template>
  <UiPanel title="Your posts" :level="3">
    <!-- A failed read, in words. -->
    <UiNotice v-if="posts.error.value" type="error" :message="posts.error.value" />
    <!-- The posts, newest first. -->
    <ul v-if="posts.items.value.length" class="posts">
      <!-- One post: its title, status and revision. -->
      <li v-for="p in posts.items.value" :key="p.id">
        <span>
          <strong>{{ p.title }}</strong>
          <span class="muted"> — {{ statusLabel(p.status) }}, revision {{ p.revision }}</span>
        </span>
        <!-- Open it again. -->
        <UiButton variant="ghost" :disabled="busy" @click="$emit('open', p.id)">Open</UiButton>
      </li>
    </ul>
    <!-- Nothing saved yet. -->
    <UiEmptyState v-else-if="!posts.loading.value">No posts yet.</UiEmptyState>
    <!-- Newer and older pages. -->
    <UiPager :index="posts.index.value" :has-next="posts.hasNext.value" :loading="posts.loading.value" label="Posts pages" prev-label="Newer" next-label="Older" @prev="posts.prev()" @next="posts.next()" />
  </UiPanel>
</template>

<style scoped>
/* A row: the text at the start, the button at the end, with a rule below. */
.posts li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-xs);
  align-items: center;
  padding: var(--space-3xs) 0;
  border-bottom: 1px solid var(--border);
}

/* De-emphasised secondary text. */
.muted {
  color: var(--muted);
  font-size: var(--font-size-sm);
}
</style>
