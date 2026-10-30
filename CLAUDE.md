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
- `src/lib/` — pure code: `composer.ts` (per-target previews, bands, shorten-with-link), `time.ts` (wall time ↔ UTC),
  `money.ts`, `drafts.ts` (unsent drafts), `budgets.ts`, `calendar.ts`, `pager.ts`.
- `src/views/` — one view per section; `src/components/` — shared pieces. Native controls get explicit attribute
  bindings (the fleet lint rules), so forms use `TextField`, `SelectField`, `CheckField` and `ZonedInput`.

## More invariants

- **No optimistic updates.** The console never shows a state the server has not confirmed; a failed write leaves the
  screen as it was and says why.
- **Statuses and states are words first.** Colour never carries meaning alone: `StatusBadge` keeps the body text colour
  with a symbol and a border; the segmentation bar adds fill patterns and a sentence per band; meters print their state.
- **Wide tables scroll inside `TableScroll`**, never widen the page; a positioned container keeps visually hidden
  cells from escaping it.
- **Links are bound through `safeHref`**; internal paths through `safePath`.
- `@meddleware/ui`'s `UiBadge` and `UiSegmentedControl` fail axe contrast in the light themes (0.1.34); the console
  uses its own `StatusBadge` and `ModeSwitch` until the library is fixed (audit F7).

## Tests

`npm test` (vitest + @vue/test-utils): libraries, the HTTP layer, every section through `ContentHubView` against
`tests/support/fake-api.ts`, design tokens, the CSP inline-script check. `npm run test:e2e` (Playwright, the built app,
production CSP, a mocked API): flows, phone width and axe. `scripts/smoke.sh` probes the built image (user, headers,
CSP, assets, licences). `npm run check:dist` fails if test support reaches `dist`.
