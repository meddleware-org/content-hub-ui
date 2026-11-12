# Security Audit — `content-hub-ui`

**Classification:** Internal security review
**Project:** repos/content-hub-ui (the content hub admin console; exports ContentHubView)
**Project type:** Vue app + UI library
**Template:**

- AUDIT_TEMPLATE.md (2026-11-01)
- AUDIT_TEMPLATE_TS.md (2026-11-01)
- AUDIT_TEMPLATE_VUE.md (2026-11-01)
- AUDIT_TEMPLATE_IMG.md (2026-10-08)
- AUDIT_TEMPLATE_A11Y.md (2026-11-01)

**Package manager / lockfile:** npm 11, package-lock.json committed
**Module format:** ESM
**Publish model:** ships TS/Vue source (npm) and an image
**Runtime targets:** browser
**Peer dependencies:** none
**Build tool:** vite 8, @vitejs/plugin-vue 6, vue 3.5
**Hosting:** static-server 0.1.11 image
**Embedding hosts:** none yet (a host console may embed ContentHubView)
**VITE_* inventory:** VITE_BRAND_NAME, VITE_DOCS_URL
**Images:** quay.io/meddleware-org/content-hub-ui (0.0.2)
**Base images:** node:26-slim@sha256:0d1e3358… (build, $BUILDPLATFORM) · static-server:0.1.11@sha256:94685b94… (runtime)
**Runtime user:** 65534   **Runtime FS:** read-only
**Deployed by:** the instance's `post-bootstrap/content-hub/` (C9)
**Build args:** VITE_BRAND_NAME, VITE_DOCS_URL — not secret
**Deployment status:** *(Latest, 2026-11-07 last batch: `0.0.7` is released (CI green, signed) and deployed; pinned `sha256:0a090280…1163` by consensus, the running pods' image digest equals it. It carries the `ComposerEditor` template fix for vue-tsc 3.3.14 (the console refs destructured) and the merged Dependabot groups.)* *(Latest, 2026-11-06 follow-up wave: `0.0.6` is released (CI green, signed) and deployed; pinned `sha256:8e5e793b…785a` by consensus, the running pods' image digest equals it. It takes `@meddleware/ui` 0.1.39 where the app uses it and the Dependabot merges of 2026-11-06 (image bases, dev tools).)* *(Current, 2026-11-05: `0.0.5` is released (npm and image, CI green, signed) and deployed; `config/images.yaml` pins `sha256:9f95e151…237f` by consensus (quay.io and Docker Hub agree, cosign valid) and the running pod's image digest equals it; the public host answers 200 and the rendered footer links to `https://meddleware.co.uk/legal/`. The text below is the earlier history, kept as written.)* live on testnet (R2, 2026-10-30); 0.0.2 released, pinned by consensus (cosign valid) and deployed 2026-10-30
**Review date:** 2026-10-29; 0.0.2 re-verified 2026-10-30 against screenshots at phone, tablet and desktop widths (nested table-header rows, the phone filter layout and the table scroll cue fixed; deployed); 0.0.3 released 2026-10-30 (Dependency updates (minor and patch groups) and workflow action bumps); 0.0.4 released 2026-10-31 (Shared fields, tables and meters from ui, split views); frontend-wave delta review 2026-11-01 (real review of the 2026-10-19 → 2026-11-01 changes; see the delta section) · 2026-11-07 (mainnet-readiness sweep) · 2026-11-08 (brand mark) · 2026-11-12 (AppToolShell)
**Reviewer:** Internal review
**Severity ceiling:** Medium — the admin console of an operator; it holds no credential (Access does) and the server authorises every action
**Status:** C7 — all seven sections implemented against the admin API; 100 vitest tests; 16 Chromium tests (flows, phone width, axe in every theme and season); lint (stylelint, eslint + a11y, html-validate), type-check, build, CSP and dist checks green; the runtime image (built from this `dist`) passes `scripts/smoke.sh`. The client is published and the image builds from the registry (F8 RESOLVED; released and deployed as 0.0.5)

---

## Executive summary

The operator's console: a thin display-and-input layer over the admin API. Everything that decides (limits, caps, state
changes, permissions) is the server's; the console previews with the shared client library and shows what the server
refused. The properties that matter for an admin tool that can post publicly are the session, CSRF and rendering
handling, which are pinned by tests below. Nothing is published.

**2026-11-01 update.** The console was rebuilt on the shared components and its money, time and pager helpers moved to web-utils. The review found one robustness defect — a malformed audit record could blank the Budgets view (F10, fixed in web-utils) — and confirmed that caps are parsed exactly and decided by the server (F11) and that the console passes the shared sweep (F12).

## Threat model / trust boundaries

| Actor | Holds / proves | Can do | Bounded by |
| --- | --- | --- | --- |
| Dependency authors | code in the lockfile | run at build and in the bundle | lockfile, audit gate, licence check |
| CI and the registries | the published artefact | serve it | OIDC publishing, provenance, digest pins |
| The content hub service | the API responses | data shown or used | server-side enforcement; the client mirrors only |

## Severity scale

Critical / High / Medium / Low / Info / Positive (unchanged across the corpus).

## Scope

The repository at 0.0.1 (sources, tests, workflows, Dockerfile, scripts/smoke.sh). Environment: Node 24, npm 11, podman 4.9.3.

## Findings

### F1 — Positive: same-origin only, no framing
**Severity:** Positive
**Where:** `Dockerfile` CSP (`connect-src 'self'`, `frame-ancestors 'none'`)
**Issue:** —
**Impact:** no third-party origin can receive admin data
**Remediation / evidence:** `scripts/smoke.sh` header checks; `npm run check:csp`

### F2 — Positive: section text renders as text
**Severity:** Positive
**Where:** `src/ContentHubView.vue`
**Issue:** —
**Impact:** no markup injection
**Remediation / evidence:** `tests/content-hub-view.test.ts`

### F3 — Positive: not indexable
**Severity:** Positive
**Where:** `public/robots.txt` (disallow all), `index.html` noindex
**Issue:** —
**Impact:** the admin host is not listed by crawlers
**Remediation / evidence:** `dist/robots.txt` in the build; smoke test

### F4 — The console sections are implemented
**Severity:** Positive (was Info, DEFERRED)   **Disposition:** RESOLVED (2026-10-29, C7)
**Where:** `src/views/*`, `src/api/*`, `src/console.ts`
**Issue:** —
**Impact:** Dashboard, roadmap, tasks, composer, publishing, schedule and budgets work against the admin API.
**Remediation / evidence:** `tests/console.test.ts` (every section), `e2e/console.spec.ts` (flows in a browser).

### F5 — Positive: the session ending, and CSRF
**Severity:** Positive
**Where:** `src/api/http.ts`, `src/components/SessionBanner.vue`
**Issue:** —
**Impact:** A 401, a redirect to the sign-in page (an opaque redirect, as a browser reports it) or a sign-in page where
JSON belongs all mean "the session ended": one banner, "Sign in again" reloads at top level, writes are not attempted
meanwhile, and unsent composer drafts survive. Every non-GET request carries the CSRF header; nothing else is sent
(no `Authorization`, no token), the requests are same-origin with `credentials: 'same-origin'`.
**Remediation / evidence:** `tests/http.test.ts` (four ways to expire, once-only callback, header on writes only),
`tests/console.test.ts` (`expectCsrfEverywhere` after every test), `e2e/console.spec.ts` (a real 302 → draft restored
after the reload).

### F6 — Positive: untrusted text is never markup
**Severity:** Positive
**Where:** `src/components/RenderedText.ts`, every `{{ }}` of post, title and platform-reply text
**Issue:** —
**Impact:** The rendered preview is built from parsed tokens as DOM elements; links pass `safeHref` (a `javascript:`
link is dropped to text); the exact payload, attempts and responses are interpolated text. There is no `v-html`.
**Remediation / evidence:** `tests/console.test.ts` (hostile post), `e2e/console.spec.ts` (no `window.pwned`, no `img`,
no `javascript:` link), ESLint `vue/no-restricted-syntax` URL-sink rule.

### F7 — `@meddleware/ui` 0.1.34 fails colour contrast in the light themes
**Severity:** Low   **Disposition:** WORKED AROUND here; the fix belongs in `@meddleware/ui`
**Where:** `UiBadge` (`active` 4.19:1, `pending` 4.26:1 at 11px) and `UiSegmentedControl` (unselected option 3.5:1)
**Issue:** axe `color-contrast` (WCAG 2.2 AA needs 4.5:1) in every light season; the dark themes pass.
**Impact:** Found by this console's axe gate. The console uses its own `StatusBadge` (body text colour, a symbol and a
border) and `ModeSwitch` (native radios, a tick on the chosen one) so it ships accessible now.
**Remediation / evidence:** `e2e/accessibility.spec.ts` (16 runs: both themes × four seasons, every section). Follow-up:
fix the two components (and the tint maths) in `ui`, then the local copies can be dropped.

### F8 — The console depends on a client that is not published
**Severity:** Low   **Disposition:** RESOLVED (2026-10-30: the client's first publication; re-confirmed 2026-11-06)
**Where:** `package.json` (`@meddleware/content-hub-client` 0.0.1), `package-lock.json`, `Dockerfile` (`npm ci`)
**Issue:** The client's first publication is part of R2; until then `npm ci` cannot resolve it, so CI and the full image
build cannot pass.
**Impact:** None while undeployed. Local checks install the client from a packed tarball.
**Remediation / evidence:** R2 order: publish the client, regenerate the lockfile here, then CI and the image.
**Closed:** `@meddleware/content-hub-client` 0.0.1 was published to npm from CI with provenance on 2026-10-30 and this package's lockfile resolves it from the registry; `npm ci` works in CI and in the image build (every release since, the latest being 0.0.5 on 2026-11-05).

### F9 — Unsent drafts are kept in the browser
**Severity:** Info   **Disposition:** ACCEPTED
**Where:** `src/lib/drafts.ts`
**Issue:** A composer draft (plain text the operator typed, selected targets, per-platform text) is stored in
`localStorage` so an expired session or a reload loses nothing.
**Impact:** Anyone with the operator's browser profile can read an unsent draft; no credential or token is ever stored
(the console has none). Reads validate the shape and size and drop anything else (another tab, an old version,
tampering); a storage that is blocked, full or absent degrades to no draft without an error.
**Remediation / evidence:** `tests/lib.test.ts` (tampered values, unavailable storage). The draft is cleared when the
post is queued or discarded.

### Frontend wave delta review (2026-11-01) — 0.0.3 to 0.0.4 reviewed · 0.0.5 released and deployed 2026-11-05

Scope: the changes since the last substantive entry (2026-10-30, 0.0.2, which fixed the table-header rows from screenshots): 0.0.4 — the console rebuilt from `@meddleware/ui` fields, tables, meters, badges and pager (its own `TextField`, `SelectField`, `StatusBadge`, `TableScroll`, `UsageMeter`, `ZonedInput` deleted), the views split into smaller components (`PostsList`, `PreviewPanel`, `TargetPicker`, `TargetsTable`, `SendingSwitch`…), and `lib/money.ts`, `time.ts`, `calendar.ts` and `pager.ts` replaced by `@meddleware/web-utils` — the exact micro-USD parse and format, time zones, the month grid. About 1 000 lines added and 1 500 removed across 40 source files; the five-browser sweep. The release tool's "re-verified" marks for these releases recorded no review; this section is the review. Read: `lib/budgets.ts` (caps, usage, the audit trail's before/after rendering), `BudgetsView.vue` (the cap form and what it validates), `DashboardView.vue`, `ComposerView.vue` and the time-zone handling it uses, the web-utils helpers it now calls (`parseUsd`, `formatUsd`, `formatDateTime`, `monthGrid`), the Dockerfile and CSP, the workflows and the tests. Ran (with the locally packed `ui` 0.1.38, `design-tokens` 0.1.13, `web-utils` 0.0.2, `frontend-config` 0.0.2): the audit gate (0 not allowlisted; the two `extract-zip` advisories are allowlisted until 2027-01-31), `vue-tsc`, lint (stylelint, eslint, html-validate), `vitest` (6 files, 100 tests), the production build and `check:csp` and `check:dist`, `npm pack --dry-run` (43 files, 154 KiB: `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `CHANGELOG.md`; no test, e2e or audit file), and the browser suite on Chromium, Firefox, WebKit, a Pixel 7 and an iPhone 14 with the CI font (DejaVu Sans through fontconfig): **715 passed in 21.1 minutes**.

### F10 — A cap value that is not a number threw while rendering the audit trail
**Severity:** Low   **Disposition:** RESOLVED
**Where:** `src/lib/budgets.ts::describeChange` → `@meddleware/web-utils` `formatUsd`
**Issue:** `describeChange` turns the audit trail's before/after cap lists (JSON of type `unknown`) into sentences. Its type guard `isCap` checks that the keys exist, not that `monthly_limit_usd_micros` is a number; `formatUsd` then ran `BigInt(Math.trunc(value))`, which throws for `undefined` or `NaN`, inside a render.
**Impact:** one audit record with a missing or older-shaped field (the operator's own server wrote it) would have blanked the Budgets view instead of showing a line. No money is wrongly shown: nothing is shown. The caps themselves are enforced by the server, and this view only explains them.
**Remediation / evidence:** fixed at the source: `formatUsd` shows `—` for a value that is not a finite number (web-utils 0.0.2, its F8, with a test), the same way `formatBytes` and `formatDateTime` already behave. This repository's `budgets` tests keep their cases; the console now renders such a record.

### F11 — Positive: caps are parsed exactly, checked against the instance ceiling in the form, and still decided by the server
**Severity:** Positive
**Where:** `src/views/BudgetsView.vue`, `src/lib/budgets.ts`
**Evidence:** `BudgetsView` parses a typed cap with `parseUsd` (digits only, at most six decimals, at most nine whole digits, refused otherwise; the result is a safe integer of micro-USD — no floating point), compares it with the instance ceiling it read ("Above the instance ceiling of …"), and sends the integer; the header of `lib/budgets.ts` states the rule that the server enforces the caps and the ceilings and these helpers only explain them. `percent`/`level` treat a cap of 0 with any use as 100. A cap at its limit is shown in words as well as colour (`LEVEL_TEXT`, so colour is never the only cue, WCAG 1.4.1).

### F12 — Positive: the shared sweep covers every screen and passes on five browsers with the CI font
**Severity:** Positive
**Where:** e2e/a11y.spec.ts (`defineA11ySuite`, AAA `gate`)
**Evidence:** the console's sections and their states (dashboard, roadmap item, the public preview, tasks, composer, publishing, schedule, budgets and their empty and error states, the sweep lists them in `e2e/a11y.spec.ts`) each at AA and AAA (gating) in all ten theme × season looks, at 320 px, 200% text, in forced colours, under reduced motion and by keyboard, on five browser projects: 715 tests passed with the CI font. The API is answered by the specs through `page.route` (no credential reaches the page: Access holds it).

### Delta notes (A11Y lens, `AUDIT_TEMPLATE_A11Y.md`)
- **Support promise:** the shared browserslist (`@meddleware/frontend-config/browserslist-config`); build target through `viteTarget()`; compat lints on.
- **Accessibility gates:** the shared sweep (axe AA and AAA `gate`; 320 px reflow; 200% text; forced colours; reduced motion; keyboard incl. focus not obscured), Lighthouse CI on the production build, `check:csp` and `check:dist`, five browser projects in CI.
- **Known exceptions:** none disabled; the 44 px enhanced target size, link purpose, reading order and screen-reader announcements are reviewed from screenshots (`npm run shots`), not automated.
- **Supply chain:** `.github/audit-gate.mjs` with two dated `extract-zip` allowlist entries (dev-only, via `@lhci/cli`, expiry 2027-01-31, D104; OPERATOR_TASKS.md) and the `basic-ftp`/`tmp`/`zod` overrides; Dependabot (npm, Actions, Docker); `@meddleware/frontend-config` is a dev dependency (its audit F5).

## Section A — Invariant verification matrix

| # | Invariant (plain statement) | Enforced / asserted at (`file:fn`) | Proven by (test / code-assert / cross-project) | Status |
| --- | --- | --- | --- | --- |
| I1 | same-origin only, no framing | `Dockerfile` CSP (`connect-src 'self'`, `frame-ancestors 'none'`) | `scripts/smoke.sh` header checks | HOLDS |
| I2 | untrusted text renders as text, links only through `safeHref` | `RenderedText.ts`, templates | hostile-post tests (component and browser) | HOLDS |
| I3 | not indexable | `public/robots.txt` (disallow all), `index.html` noindex | `dist/robots.txt`; `check:dist` | HOLDS |
| I4 | every write carries the CSRF header; nothing else identifies the operator | `api/http.ts` | `http.test.ts`; `expectCsrfEverywhere` | HOLDS |
| I5 | the session ending is detected in every form and costs no draft | `api/http.ts`, `drafts.ts` | `http.test.ts`; session tests; browser redirect test | HOLDS |
| I6 | the console shows no state the server has not confirmed (no optimistic updates) | all views | review; failed-write tests leave the screen unchanged | HOLDS |
| I7 | previews equal the server's arithmetic | `lib/composer.ts` on the client package | golden vectors incl. `limits` (client and service) | HOLDS |
| I8 | no test support in the shipped build | `scripts/check-dist.mjs` | CI step | HOLDS |
| I9 | statuses and states are words first; no WCAG 2.2 AA violation in any theme or season | `StatusBadge`, `SegmentBar`, `UsageMeter` | `e2e/accessibility.spec.ts` | HOLDS |
| I10 | the page never scrolls sideways at phone width | `TableScroll`, wrapping layouts | `e2e/console.spec.ts` (375 px, every section) | HOLDS |

## Section B — Supply-chain, publish-authority & capability matrix

### B.1 Dependency & CVE risk

| Dependency | Pinned version / rev / object ID | Liveness dependency? | CVE / audit status | Notes |
| --- | --- | --- | --- | --- |
| npm dev and runtime dependencies | `package-lock.json` (regenerated at R2 against the published client, F8) | build only (runtime: vue, @meddleware/ui, design-tokens, content-hub-client) | `npm audit`: 0 vulnerabilities (2026-10-29) | the client has no runtime dependencies |
| `@playwright/test`, `@axe-core/playwright` | dev only (`~1.64.1`, `^4.14.0`) | tests only | clean | never reach `dist` (`check:dist`) |

### B.2 Publish authority, capabilities & secret custody

| Authority / capability / secret | Where minted / held | Custody | Gates | Immutability / rotation plan |
| --- | --- | --- | --- | --- |
| npm publish | CI on `v*` tags | GitHub OIDC (trusted publishing / keyless cosign) | releases | trusted publisher configured at R2 |

Actions pinned by SHA, `permissions: contents: read` by default, release gate = CI (`verify`), Dependabot present —
all hold (copied from the fleet workflows).

## Section C — Test-coverage & hermetic/live split

### C.1 Coverage grade

| Dimension | Assessment |
| --- | --- |
| Happy-path coverage | every section through `ContentHubView`; the flows in a browser |
| Error-path / abort-code / failure-mode coverage | server refusals (422/409/403/503) mapped to sentences; the session ending four ways; unavailable storage; a refused enqueue; a stop at a cap |
| Boundary / edge-case coverage | clock changes (spring forward, repeated hour), money without floats, byte and grapheme caps, links never cut, tampered drafts |
| Security-relevant coverage | CSRF on every write, hostile text, `dist` free of test support, CSP violations fail the browser tests |

100 vitest tests (libraries and HTTP layer 25, sections through the console 26, design-token and CSP checks 49); 16 Chromium tests (7 flows
and phone width, 8 axe runs); stylelint, eslint + a11y, html-validate, type-check, build, `check:csp`, `check:dist`,
`check:licenses` green; the runtime image built from this `dist` passes `scripts/smoke.sh` with podman.

### C.2 Hermetic vs. live paths

| Path | Hermetic unit test? | Deferred to (localnet / testnet / running committee / live relay)? | Tracking |
| --- | --- | --- | --- |
| Against the live service | no (a fake admin API stands in; the service's contract job proves the routes) | C9 local end-to-end, then R2 (done 2026-10-30) | F8 (RESOLVED) |
| Access sign-in redirect on the real gateway | simulated (a 302 to another origin) | R2 | — |
| Clipboard copy in a browser permission-denied state | falls back to a message | — | — |

## Section D — Deployment-readiness gates

### pre-localnet
- [x] builds; lint, type-check and tests green — 2026-10-29 (100 unit, 16 browser)
- [x] accessibility: axe over every section, both themes, four seasons — F7
- [x] no test support in `dist`
- [x] no secrets in source

### pre-testnet
- [x] `SECURITY.md` present
- [x] `@meddleware/content-hub-client` published, lockfile regenerated, CI and image green — F8 (2026-10-30, R2)
- [x] image signed and pinned; npm package published with provenance — 2026-10-30, R2
- [x] the built console against the REAL admin API (the deployment's local end-to-end run: every section, the run's data,
  a draft stored; production CSP, no page error) — 2026-10-29, C9
- [x] deployment prepared: its own Deployment (non-root, read-only root, no token), only nginx-ingress may reach it, no
  egress; served on `hub.` behind Access with `X-Robots-Tag: noindex` — 2026-10-29, C9
- [x] deployed behind the Access application (`hub.` redirects to sign-in; `/api` without a session redirects too) — 2026-10-30, R2
- [x] signed in as the operator: one-time PIN, security-key MFA, the console loading ("Signed in as admin@meddleware.co.uk"), sign-out and the re-prompt checked live by the maintainer; a second address is refused — 2026-10-30

### pre-mainnet
- [ ] external review (ADR-0009 gate G4: not a launch gate; covered by redeploy and the audit pass)

## Cross-project themes

- **Supply chain & release integrity** — lockfile committed; actions pinned; audit gate in CI.
- **Wire-format coupling & conformance vectors** — `@meddleware/content-hub-client/vectors.json` (the client is its home;
  the service checks its copy).
- **On-chain-truth boundary** — the server decides; this project previews or displays.
- **Deployment readiness** — Section D.
- **Chain-access layering** — no Move package consumed.

## Normative requirements

- MUST keep the invariants of Section A (each HOLDS with its test).
- MUST NOT hold credentials, render untrusted text as markup, or contact a third-party origin.

## Implementation suggestions

- None beyond the deferred steps.

## Open questions

- **OQ1** Should a successful queue open Publishing automatically? Today it offers a button; the composer keeps its
  result visible.

## Risks

- npm supply chain (mitigated by the lockfile and audit gate).

## Re-verification log

- 2026-10-25 — first pass of the C4 scaffold.
- 2026-10-29 — C7: the console (F4 RESOLVED); F5, F6 Positive; F7 found by the new axe gate and worked around; F8, F9
  recorded; invariants I2–I10. 100 unit and 16 browser tests; runtime image smoke ok.
- 2026-10-29 — C9: deployment prepared in the operator's workspace; the console passed against the real admin API in the local end-to-end dry run.
- 2026-10-30 — R2: released (v0.0.1), image signed and deployed behind Access on `hub.`; the npm package is published.
- 2026-10-30 — live sign-in verified by the maintainer (PIN + security key); `hub.` admits only `admin@meddleware.co.uk` (own Access policy).
- 2026-11-01 — frontend-wave delta review of 0.0.3 to 0.0.4. Read the budget and caps code, the composer's time handling, the web-utils helpers it now uses, the build configuration, the Dockerfile and CSP, the workflows and the tests; ran the gates and the five-browser suite with the CI font (715 passed in 21.1 minutes). Fixed F10 (a non-numeric cap in an audit record threw while rendering: `formatUsd` now shows a dash, in web-utils 0.0.2); F11–F12 recorded as Positive. The release tool's bare "re-verified" marks were reworded to "released". `**Template:**` dates reconciled to the 2026-11-01 registry (TS/VUE changes add rows; the VUE colour row moved to A11Y, applied in full here) with no disposition change.
- 2026-11-07 — mainnet-readiness sweep (0.0.8). **Wording and audience (D117):** this console is for the maintainer only, so "operator" (the API's `operator_moves`, the drafts note) and developer terms stay; checked for what is not allowed even there and found none on a page: no build variable name in any message or label (`VITE_BRAND_NAME` and `VITE_DOCS_URL` appear only in `App.vue`, `env.d.ts`, the Dockerfile and the README; the target form's "Credential variable name" is the name of the field the API stores, not a build variable), "Meddleware" is the only spelling (footer and `package.json`), no "coming soon", no statement that a network is live, no `public/CNAME`, `_headers` or `_redirects`. One sentence changed: the 503 message "The service is temporarily unavailable (the database or the role check). Try again in a moment; nothing was changed." named internals in a function whose own comment says none leak; it is now "The service is temporarily unavailable. Try again in a moment; nothing was changed." (test: no dependency name, "database" or `VITE_` in it). `index.html` is accurate (title from the brand build argument's default, `noindex`). **Semantics:** `<br>` used for layout in five places is gone: the second line under a row header is a `<span class="muted sub">` block (roadmap items: phase and type; tasks: key; posts on targets: instance number; targets: platform and where) and the public-roadmap preview's item description is a block `<span class="sub">` instead of a break after the badge; every table keeps `th scope="row"` and its `scope="col"` headers, headings were already in order (h2 section, h3 panel, h4/h5 below), no `<b>`, inline style or click handler on a non-interactive element. **Shell decision:** `App.vue` keeps its own `UiAppShell` + `AppHeader` + `AppFooter` instead of `AppToolShell`, because that shell always renders a documentation and a developer link that default to the Sui tool pages (`…/blockchain/sui/<slug>/`, `meddleware.dev/sui/<slug>/`), which do not exist for the content hub, and cannot omit them; the console links documentation only when a deployment sets `VITE_DOCS_URL`. There is no wallet or network badge to put in `actions`. Recorded as FU-0079 (a `ui` change). **Shared tooling:** `@meddleware/frontend-config` 0.0.7 (`mw-audit-gate`, `mw-third-party-licenses`, `mw-check-csp-inline`, `mw-sync`; `.github/audit-gate.mjs`, `scripts/third-party-licenses.mjs`, `scripts/check-csp-inline.mjs` and `tests/check-csp-inline.test.ts` deleted; `"meddleware": { kind: app, csp: console, lhci: true }`, the allowlist equals the lhci template), `meddlewareApp` (wallet false; the dev `/api` proxy and the preview CSP header kept in `config`), `vueTestConfig` (the dialog-shim setup file kept) and the `vue-app` tsconfig base (the compiler options were identical); `@meddleware/ui` 0.1.40, `@meddleware/web-utils` 0.0.4; `@meddleware/content-hub-client` stays at its latest, 0.0.1; `mw-sync --check` added to CI. App-specific and kept: `scripts/check-dist.mjs` (the fake API, test hooks and runners are not in `dist`, `noindex` is present: the shared `check-prod-bundle` looks for the mock-wallet hooks, which this app never has) and `scripts/smoke.sh` (the image probe). `AGENTS.md` (layout and commands, checked against the tree) merged into `CLAUDE.md` and reduced to the pointer; the README's stale lines (the client "not published yet", the accessibility spec name) were corrected. **Verified:** `vue-tsc` clean; stylelint, eslint and html-validate clean without disabled rules; 5 test files, 95 tests (the 6 tests of the removed script went with it; new: no `<br>` in any section or in either public preview and every row header has `scope="row"`, and the 503 sentence); `vite build`, `check:csp`, `check:dist` (43 files), `check:licenses` (29 production packages), `mw-audit-gate` (0 not allowlisted; with `@lhci/cli` 0.16 the two `extract-zip` entries no longer match an advisory, so the gate warns that they can go: the allowlist is not edited here, FU-0060), `mw-sync --check` ok, Lighthouse CI passed (exit 0; the SEO warning is the intended `noindex`); five-browser Playwright suite with the CI font, 715 passed in 31.2 minutes (the same 715 as 0.0.5). Findings F1–F12 unchanged.
- 2026-11-08 — brand mark and de-enshittification (0.0.9). **Brand:** the header shows the company mark (`BrandMark`, the Kopimi "K", `@meddleware/ui` 0.1.42) before the brand text. **Shell decision:** `App.vue` keeps its own `UiAppShell` + `AppHeader` + `AppFooter` instead of `AppToolShell`: the shell can now omit its links and its hidden heading (FU-0079's ask), but it always passes `contained` to `UiAppShell`, which caps the page at the tool width (`--mw-tool-content-max`, 45rem), and this console is a full-width admin console (wide tables, per-platform composer previews, tabs); the footer still links documentation only when `VITE_DOCS_URL` is set and never a developer link. Recorded as FU-0095 (a `contained` option in `ui`, then the switch). **Icons:** `public/favicon.svg` and the `<link rel="icon">` in `index.html` are deleted; `meddlewareApp({ name })` (`@meddleware/frontend-config` 0.0.8; the name is `VITE_BRAND_NAME`, default "Content hub") emits `favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `site.webmanifest` and injects the links; `index.html` keeps `noindex`, and `scripts/check-dist.mjs` (test support absent, noindex present; it never asserted the favicon) and `scripts/smoke.sh` are unchanged. **De-enshittification:** grepped `src`, `index.html`, `public`, `README.md`, the Dockerfile and `.env.example` for font hosts, `@fontsource`, CDNs, gravatar, analytics, gtag and plausible: nothing real (`/cdn-cgi/access/logout` is the Cloudflare Access sign-out path on the console's own host; the only other origin in the bundle is `example.org`, a sample link in the composer's format hint, never fetched). The console calls only its own `/api/v1`. `DO_NOT_TRACK: "1"` is in the `env:` of all three workflows. `@meddleware/web-utils` ^0.0.4. **Verified:** `vue-tsc`, stylelint, eslint and html-validate clean; unit tests (new: the mark in the header, no icon of its own, noindex, and `tests/dist.test.ts` over the built `dist/` with `REQUIRE_DIST=1`: icon set and manifest name, one icon, apple-touch-icon and manifest link in `index.html`, noindex, no font file or font host, no third-party script/style/image/`url()` load, no origin beyond Meddleware sites and library strings; added to CI after the build); `vite build` emits the icon set; `check:dist`, `check:csp`, `check:licenses`, `mw-audit-gate`, `mw-sync --check` ok; Unit tests 106 passed in 7 files; Lighthouse CI and the five-browser Playwright suite with the CI font, 715 passed, none failed (assertions pass; the SEO score warning is the noindex page, as before). No finding changed status.
- 2026-11-12 — shell switched to `AppToolShell` (0.0.10, FU-0095). `@meddleware/ui` ^0.1.43 added a `contained` prop (default true) to `AppToolShell`; `App.vue` is now `<AppToolShell :title="BRAND" slug="content-hub" :docs-url="DOCS_URL" :dev-url="false" :contained="false">` around `ContentHubView`, replacing the hand-written `UiAppShell` + `AppHeader` + `AppFooter` of the 2026-11-08 decision. **Unchanged:** the header (mark beside the brand name from `VITE_BRAND_NAME`, default "Content hub"; colour-mode control), the footer (copyright; documentation link only when `VITE_DOCS_URL` is set, `false` otherwise; never a developer link), the full width (`contained` false, so `main` has no `mw-shell__main--contained` class), exactly one `h1` (the page has none of its own, so the shell's visually hidden heading, the brand name, stays on), `noindex`, the brand icon set and the Access sign-out link. **Tests:** `tests/app.test.ts` gains a check that `main` is not contained and that no developer link renders; the rest of the suite is unchanged. **Verified:** `vue-tsc`, stylelint, eslint and html-validate clean (no rule disabled); unit tests 107 passed in 7 files with `REQUIRE_DIST=1` (including `tests/dist.test.ts`); `vite build`, `check:dist`, `check:csp`, `check:licenses`, `mw-audit-gate` (0 high/critical, 0 not allowlisted; two allowlist entries no longer match an advisory, noted for a later tidy) and `mw-sync --check` ok; five-browser Playwright suite with the CI font, 715 passed, none failed (flows, phone width, axe in every theme and season). No finding changed status.
