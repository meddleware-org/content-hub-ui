import { defineConfig, devices } from '@playwright/test'

// Browser tests of the BUILT console against a mocked admin API (tests/support/fake-api.ts behind `page.route`):
// `npm run test:e2e` builds, serves dist with `vite preview` under the production CSP, and drives Chromium. Every
// request that leaves localhost is refused, so the run needs no network. CI installs Chromium first.
const PORT = 4291

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 900 } },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
