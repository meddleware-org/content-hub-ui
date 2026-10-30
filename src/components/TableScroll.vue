<script setup lang="ts">
// A wide table scrolls inside its own region instead of widening the page. The region is focusable so keyboard users
// can scroll it, and named so a screen reader says what it holds. On a narrow screen a one-line hint says it scrolls,
// and soft shadows at the edges show that more lies beyond (the real table keeps its table semantics: no stacking
// into blocks, which some screen readers read as plain text).
defineProps<{ label: string }>()
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-noninteractive-tabindex -- a named, scrollable region must be focusable -->
  <section class="table-scroll" :aria-label="label" tabindex="0">
    <p class="scroll-hint" aria-hidden="true">Swipe sideways to see every column.</p>
    <slot />
  </section>
</template>

<style scoped>
.table-scroll {
  /* Positioned, so visually hidden (absolutely placed) cells are clipped here and cannot widen the page. */
  position: relative;
  max-width: 100%;
  overflow-x: auto;
  /* Edge shadows that appear only where there is more to scroll to: a cover that scrolls with the content hides the
     shadow once the end is reached (the "scroll shadows" technique). */
  background:
    linear-gradient(to right, var(--surface) 30%, transparent) left center / 2rem 100% no-repeat local,
    linear-gradient(to left, var(--surface) 30%, transparent) right center / 2rem 100% no-repeat local,
    linear-gradient(to right, var(--border), transparent) left center / 0.75rem 100% no-repeat scroll,
    linear-gradient(to left, var(--border), transparent) right center / 0.75rem 100% no-repeat scroll;
}

.table-scroll:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.scroll-hint {
  display: none;
  margin: 0;
  padding: var(--space-2xs) var(--space-sm) 0;
  color: var(--muted);
  font-size: 0.75rem;
}

@media (width < 40em) {
  .scroll-hint {
    display: block;
  }
}
</style>
