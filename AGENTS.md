# AGENTS.md — content-hub-ui

## Layout

```text
src/main.ts            standalone bootstrap (styles, App)
src/App.vue            shell: header, ContentHubView, footer
src/ContentHubView.vue the console (exported): session banner, who/zone row, section tabs
src/console.ts         shared context (HTTP, session, zone, reference data)
src/sections.ts        the console's sections, in navigation order
src/api/               http.ts (the only network code), errors.ts, types.ts
src/lib/               composer, drafts, budgets, status, roadmap-form (pure; time, money, calendar, storage are web-utils)
src/views/             Dashboard, Roadmap, Tasks, Composer, Publishing, Schedule, Budgets
src/components/        the pieces of the roadmap, composer and publishing views; SegmentBar, RenderedText, SessionBanner
src/index.ts           library entry: ContentHubView
tests/, e2e/           unit and component tests; browser tests (e2e/open.ts wires the fake API; a11y.spec.ts is the shared sweep); tests/support/fake-api.ts (test only)
lighthouserc.cjs       Lighthouse CI
public/                favicon, robots.txt (disallow all), llms.txt
```

## Commands

```bash
npm ci && npm run type-check && npm run lint && npm test && npm run build && npm run check:csp && npm run check:dist && npm run check:licenses
npx playwright install chromium && npm run test:e2e   # E2E_BROWSERS=all for five browsers
npm run lhci
docker build -t content-hub-ui:ci . && bash scripts/smoke.sh content-hub-ui:ci
```

Read [CLAUDE.md](CLAUDE.md) first: the console never holds credentials and never decides what the server decides.
