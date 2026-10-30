// Keyset pagination for the API's lists. The server returns a page and an opaque cursor for the next one (newest
// first); this keeps the cursors already seen so Previous works, and drops answers that arrive out of order.

import { ref } from 'vue'
import { describeError } from '../api/errors.js'
import type { Page } from '../api/types.js'

export function usePager<T>(load: (cursor: string | null) => Promise<Page<T>>) {
  const items = ref<T[]>([]) as { value: T[] }
  const loading = ref(false)
  const error = ref<string | null>(null)
  const index = ref(0)
  const hasNext = ref(false)
  let cursors: Array<string | null> = [null]
  let nextCursor: string | null = null
  let ticket = 0

  async function at(i: number): Promise<void> {
    const mine = ++ticket
    loading.value = true
    try {
      const p = await load(cursors[i] ?? null)
      if (mine !== ticket) return
      items.value = p.items
      nextCursor = p.next_cursor ?? null
      hasNext.value = nextCursor !== null
      if (nextCursor) cursors[i + 1] = nextCursor
      index.value = i
      error.value = null
    } catch (e) {
      if (mine === ticket) error.value = describeError(e)
    } finally {
      if (mine === ticket) loading.value = false
    }
  }

  return {
    items,
    loading,
    error,
    index,
    hasNext,
    /** Start again from the newest page (after a filter changes). */
    reset(): Promise<void> {
      cursors = [null]
      return at(0)
    },
    /** Fetch the current page again. */
    reload: () => at(index.value),
    next: () => (hasNext.value ? at(index.value + 1) : Promise.resolve()),
    prev: () => (index.value > 0 ? at(index.value - 1) : Promise.resolve()),
  }
}
