<script setup lang="ts">
// A wide table scrolls inside its own region instead of widening the page. The region is focusable so keyboard users
// can scroll it, and named so a screen reader says what it holds.
defineProps<{ label: string }>()
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-noninteractive-tabindex -- a named, scrollable region must be focusable -->
  <section class="table-scroll" :aria-label="label" tabindex="0">
    <slot />
  </section>
</template>

<style scoped>
.table-scroll {
  /* Positioned, so visually hidden (absolutely placed) cells are clipped here and cannot widen the page. */
  position: relative;
  max-width: 100%;
  overflow-x: auto;
}

.table-scroll:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
