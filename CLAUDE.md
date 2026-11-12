# CLAUDE.md — content-hub-ui

The content hub's admin console. See [README.md](README.md) and the service's
[ARCHITECTURE.md](https://github.com/meddleware-org/content-hub-service/blob/main/docs/ARCHITECTURE.md).

## Invariants

- **Display and input only.** The server decides every transition, limit, cap and permission; the console previews
  (counts, segmentation, allowed moves) with `@meddleware/content-hub-client`, which the server's golden vectors keep
  in step. A preview is never treated as the answer.
- **Same origin, no credentials.** Requests go to `/api/v1` on the console's own host with `credentials:
  'same-origin'`; no token is read, stored or sent by this code. A `401` (or an access redirect) means the session
  expired: keep unsaved drafts locally (non-secret, tamper-tolerant) and reload at top level.
- **CSRF.** Every state-changing request sends the client's `CSRF_HEADER`.
- **Untrusted text is text.** Post bodies, titles and platform responses are rendered as text or through a sanitising
  renderer, never with `v-html` on an untrusted string.
- **No operator data** (host names, channels, wording) in the repository; the brand name is a build argument.
- Fleet UI rules: semantic markup, no inline styles, design-token colours only (`tests/design-tokens-used.test.ts`),
  html-validate and the a11y lint gate, no test hooks in the production build.

## Where things are

- `src/api/` — `http.ts` is the only code that touches the network (same-origin `/api/v1`, CSRF on writes, one
  definition of "the session ended"); `errors.ts` maps failures to sentences for people; `types.ts` mirrors the
  service's DTOs.
- `src/console.ts` — the shared context (HTTP, who is signed in, expiry, time zone, platform and target reference data).
- `src/lib/` — pure code: `composer.ts` (per-target previews, bands, shorten-with-link), `drafts.ts` (unsent drafts),
  `budgets.ts` (caps, levels, the audit trail in words), `status.ts` (a status as words and a badge tone),
  `roadmap-form.ts` (the phase and item forms as data and request bodies). Time zones, money, the calendar and storage
  are `@meddleware/web-utils`; the pager, forms, tables, badges, meters and notices are `@meddleware/ui`: this repo
  keeps none of them.
- `src/views/` — one view per section (loaded when first opened); the three big ones are split into
  `src/components/` pieces: the roadmap (`PhaseForm`, `ItemForm`, `PublicPreview`), the composer (`ComposerEditor`,
  `TargetPicker`, `PreviewPanel`, `PostsList`) and publishing (`SendingSwitch`, `InstancesTable`, `InstanceDetail`,
  `TargetsTable`). A view owns the data and the requests; a piece takes props and emits.

- `src/main.ts` (standalone bootstrap: styles, `App.vue`), `src/App.vue` (the shell: header, `ContentHubView`, footer),
  `src/ContentHubView.vue` (the console and the library export, with `src/index.ts`), `src/sections.ts` (the sections in
  navigation order). `public/` holds `robots.txt` (disallow all) and `llms.txt` (no icons: see Shell); `lighthouserc.cjs` is Lighthouse CI.
- `tests/` (unit and component tests; `tests/support/fake-api.ts` is test support only) and `e2e/` (`open.ts` wires the
  fake API into the browser tests, `a11y.spec.ts` is the shared sweep, `screens.spec.ts` the screenshots).

## Shell

`App.vue` keeps its own header and footer (`UiAppShell` + `AppHeader` + `AppFooter`) instead of `AppToolShell` from
`@meddleware/ui`. The shell can now leave out its documentation and developer links (`:docs-url="false"`, `:dev-url="false"`)
and its hidden heading, but it always limits the page to the tool width (`UiAppShell contained`: `--mw-tool-content-max`, 45rem),
and this console is a full-width admin console (wide tables, the composer's per-platform previews, the tab bar). The header
shows `<BrandMark />` before the brand text (`VITE_BRAND_NAME`, default "Content hub"); the footer links documentation only when
a deployment gives `VITE_DOCS_URL`, and never a developer link. Switch to `AppToolShell` when it can drop `contained` (FU-0095).

`meddlewareApp({ name })` (the brand name, read from `VITE_BRAND_NAME` at build time) also emits the brand icon set (favicon,
apple-touch-icon, 192/512 icons, `site.webmanifest`) and injects the links, so the app keeps no `public/favicon.*` and no icon
`<link>` (`mw-sync --check` fails on the former); `index.html` keeps its `noindex` meta. `tests/dist.test.ts` runs after a build
(CI sets `REQUIRE_DIST=1`; a plain `npm test` before any build skips it): the icon set once per page, noindex, no font file or
font host, no third-party load, and no origin named beyond Meddleware sites and library strings. No third-party fonts, scripts,
styles, images or analytics, ever; the only calls are to the console's own `/api/v1`.

## More invariants

- **No optimistic updates.** The console never shows a state the server has not confirmed; a failed write leaves the
  screen as it was and says why.
- **Statuses and states are words first.** Colour never carries meaning alone: a `UiBadge` keeps the body text colour
  with a symbol and a border (`lib/status.ts` chooses the tone); the segmentation bar adds fill patterns and a sentence
  per band; meters (`UiMeter`) print their state.
- **Wide tables scroll inside `UiDataTable`'s own box**, never widen the page (it is a focusable, named region when it
  scrolls). A table's `head` slot holds only `<th>` cells: never a `<tr>` (a row inside the header's row collapses every
  header into the first column; `tests/content-hub-view.test.ts` still checks every table).
- **Links are bound through `safeHref`**; internal paths through `safePath` (both from web-utils).

## Looking at it

`npm run shots` (Playwright, the built app, mocked API) writes a PNG per section, viewport (phone, tablet, desktop; every colour mode ×
season at desktop) to `test-results/shots/`: open them and look. Assertions and axe cannot see misaligned columns, clipped content or a
layout that only works on a wide screen; screenshots found two real defects here (a `<tr>` passed into the library table's
`head` slot, which already wraps one, nested a row in a row and collapsed every header into the first column; and wide tables on
a phone showing only their first column with no sign of more). Nothing is compared to a baseline.

## Tests

`npm test` (vitest + @vue/test-utils, the real `@meddleware/ui`): libraries, the HTTP layer, every section through
`ContentHubView` against `tests/support/fake-api.ts`, design tokens, the CSP inline-script check. `npm run test:e2e`
(Playwright, the built app, production CSP, a mocked API): flows and phone width (`e2e/console.spec.ts`), and the shared
accessibility sweep (`e2e/a11y.spec.ts`, from `@meddleware/frontend-config/a11y`): every section's busiest state at WCAG 2.2
AA and AAA (gating) in every colour mode × season, then reflow at 320 px, 200% text, forced colours, reduced motion and the
keyboard. `E2E_BROWSERS=all` runs five browsers (CI does). `npm run lhci`: Lighthouse. `scripts/smoke.sh` probes the built image (user, headers,
CSP, assets, licences). `npm run check:dist` fails if test support reaches `dist`.

## Commands

```bash
npm ci && npm run type-check && npm run lint && npm test && npm run build && npx mw-audit-gate && npm run check:csp && npm run check:dist && npm run check:licenses
npx mw-sync --check                                    # the shared files (postcss, stylelint, .dockerignore, dependabot, allowlist, Dockerfile CSP)
npx playwright install chromium && npm run test:e2e    # E2E_BROWSERS=all for five browsers
npm run lhci
docker build -t content-hub-ui:ci . && bash scripts/smoke.sh content-hub-ui:ci
```

`check:csp`, `check:licenses`, the audit gate and `mw-sync` come from `@meddleware/frontend-config` (`mw-check-csp-inline`,
`mw-third-party-licenses`, `mw-audit-gate`, `mw-sync`; the profile is `console`, set in package.json `"meddleware"`). `check:dist`
and `scripts/smoke.sh` are this app's own.
