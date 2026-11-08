import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { vueTestConfig } from '@meddleware/frontend-config/vitest'

// Unit and component tests: the libraries, the HTTP layer, every section through ContentHubView against the fake admin API, and the design-token
// check. jsdom hosts the Vue reactivity and the mounts; the real-browser gate lives in e2e/ (Playwright).
export default defineConfig(vueTestConfig({ plugins: [vue()], test: { setupFiles: ['tests/support/setup.ts'] } }))
