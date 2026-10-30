# Security Audit — `content-hub-ui`

**Classification:** Internal security review
**Project:** repos/content-hub-ui (the content hub admin console; exports ContentHubView)
**Project type:** Vue app + UI library
**Template:**

- AUDIT_TEMPLATE.md (2026-10-08)
- AUDIT_TEMPLATE_TS.md (2026-10-08)
- AUDIT_TEMPLATE_VUE.md (2026-10-08)
- AUDIT_TEMPLATE_IMG.md (2026-10-08)

**Package manager / lockfile:** npm 11, package-lock.json committed
**Module format:** ESM
**Publish model:** ships TS/Vue source (npm) and an image
**Runtime targets:** browser
**Peer dependencies:** none
**Build tool:** vite 8, @vitejs/plugin-vue 6, vue 3.5
**Hosting:** static-server 0.1.11 image
**Embedding hosts:** none yet (a host console may embed ContentHubView)
**VITE_* inventory:** VITE_BRAND_NAME, VITE_DOCS_URL
**Images:** quay.io/meddleware-org/content-hub-ui (unpublished)
**Base images:** node:26-slim@sha256:0d1e3358… (build, $BUILDPLATFORM) · static-server:0.1.11@sha256:94685b94… (runtime)
**Runtime user:** 65534   **Runtime FS:** read-only
**Deployed by:** the instance's `post-bootstrap/content-hub/` (C9)
**Build args:** VITE_BRAND_NAME, VITE_DOCS_URL — not secret
**Deployment status:** unpublished (0.0.1 local, Series C C4)
**Review date:** 2026-10-29
**Reviewer:** Internal review
**Severity ceiling:** Medium — the admin console of an operator; it holds no credential (Access does) and the server authorises every action
**Status:** C7 — all seven sections implemented against the admin API; 100 vitest tests; 16 Chromium tests (flows, phone width, axe in every theme and season); lint (stylelint, eslint + a11y, html-validate), type-check, build, CSP and dist checks green; the runtime image (built from this `dist`) passes `scripts/smoke.sh`. The full image build waits for `@meddleware/content-hub-client` to be published (F8)

---

## Executive summary

The operator's console: a thin display-and-input layer over the admin API. Everything that decides (limits, caps, state
changes, permissions) is the server's; the console previews with the shared client library and shows what the server
refused. The properties that matter for an admin tool that can post publicly are the session, CSRF and rendering
handling, which are pinned by tests below. Nothing is published.

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
**Severity:** Low   **Disposition:** DEFERRED
**Where:** `package.json` (`@meddleware/content-hub-client` 0.0.1), `package-lock.json`, `Dockerfile` (`npm ci`)
**Issue:** The client's first publication is part of R2; until then `npm ci` cannot resolve it, so CI and the full image
build cannot pass.
**Impact:** None while undeployed. Local checks install the client from a packed tarball.
**Remediation / evidence:** R2 order: publish the client, regenerate the lockfile here, then CI and the image.

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
| npm dev and runtime dependencies | `package-lock.json` (to be regenerated at R2, F8) | build only (runtime: vue, @meddleware/ui, design-tokens, content-hub-client) | `npm audit`: 0 vulnerabilities (2026-10-29) | the client has no runtime dependencies |
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
| Against the live service | no (a fake admin API stands in; the service's contract job proves the routes) | C9 local end-to-end, then R2 | F8 |
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
- [ ] `@meddleware/content-hub-client` published, lockfile regenerated, CI and image green — F8 (R2)
- [ ] published with provenance — R2
- [x] the built console against the REAL admin API (the deployment's local end-to-end run: every section, the run's data,
  a draft stored; production CSP, no page error) — 2026-10-29, C9
- [x] deployment prepared: its own Deployment (non-root, read-only root, no token), only nginx-ingress may reach it, no
  egress; served on `hub.` behind Access with `X-Robots-Tag: noindex` — 2026-10-29, C9
- [ ] deployed behind the Access application; sign-in, session expiry and logout checked live — R2

### pre-mainnet
- [ ] external review

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
