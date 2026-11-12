import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { meddlewareApp } from '@meddleware/frontend-config/vite'

// The Content-Security-Policy the production image sends (Dockerfile `ARG CSP`). `vite preview` sends the same one,
// so the browser tests run under the real policy and a violation fails them. `upgrade-insecure-requests` is left
// out only because the preview server speaks plain http on localhost.
function imageCsp(): string | undefined {
  try {
    const m = /^ARG CSP="([^"]+)"/m.exec(readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8'))
    return m?.[1]?.replace(/;\s*upgrade-insecure-requests/, '')
  } catch {
    return undefined
  }
}
const csp = imageCsp()

// The admin API is same-origin in production (the ingress routes /api/ on the admin host to the admin
// process); in development it is proxied to a local `content-hub admin`. Dark is the console's default mode.
// The brand name (VITE_BRAND_NAME, a build argument) is also the web manifest's name.
export default defineConfig((env) =>
  meddlewareApp({
    name: loadEnv(env.mode, process.cwd(), 'VITE_').VITE_BRAND_NAME || 'Content hub',
    plugins: [vue()],
    wallet: false,
    config: {
      server: {
        proxy: {
          '/api': { target: 'http://localhost:8080', changeOrigin: true },
        },
      },
      preview: { headers: csp ? { 'Content-Security-Policy': csp } : {} },
    },
  })(env),
)
