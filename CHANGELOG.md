# Changelog

## 0.0.8 — 2026-11-07

### Changed

- Table row headers (roadmap items, tasks, posts on targets, targets) and the public-roadmap preview no longer use `<br>` for layout: the second line (phase and type, task key, instance number, platform, item description) is a block element under the title.
- The "service temporarily unavailable" message no longer names the internals behind it (the database or the role check).
- Takes `@meddleware/ui` ^0.1.40, `@meddleware/web-utils` ^0.0.4 and `@meddleware/frontend-config` ^0.0.7.
- The audit gate, third-party licence notices and inline-script CSP check are the shared `mw-audit-gate`, `mw-third-party-licenses` and `mw-check-csp-inline`; their local copies (and the test of the last) are removed. The build and test configuration use `meddlewareApp`, `vueTestConfig` and the shared tsconfig base; `mw-sync --check` runs in CI. No change to the built console beyond the markup above.
- `AGENTS.md` is a pointer to `CLAUDE.md`, which now holds the layout and commands; `README.md` no longer says the client is unpublished.

## 0.0.7 — 2026-11-06

### Changed

- Image base `static-server` 0.1.12 and the dev tools of the Dependabot groups merged on 2026-11-06.
- `ComposerEditor` takes the console's `zone` and `expired` refs by destructuring, so the template type-checks the same under every `vue-tsc` (3.3.14 mistypes `c.zone.value` there).

## 0.0.6 — 2026-11-06

### Changed

- Takes `@meddleware/ui` ^0.1.39 (the tab list items use `role="none"`) and the Dependabot merges of 2026-11-06: image bases `static-server` 0.1.12 and a refreshed `node` build image, and newer dev tools.

## 0.0.5 — 2026-11-05

### Changed

- Dependency alignment: `@meddleware/ui` ^0.1.38 (form-field edge contrast, sticky-offset and focus-not-obscured fixes), `@meddleware/design-tokens` ^0.1.13, `@meddleware/web-utils` ^0.0.2 and `@meddleware/frontend-config` ^0.0.2.

## 0.0.4 — 2026-10-31

- Shared fields, tables and meters from ui, split views

## 0.0.3 — 2026-10-30

- Dependency updates (minor and patch groups) and workflow action bumps. No source change.

## 0.0.2 — 2026-10-30

- Fix: every data table passed its own `<tr>` into the library table's `head` slot (which already wraps one): a row nested in a
  row collapsed the header into the first column, so headers did not line up with their data (and on a phone only the first
  column showed). The six slots now pass bare header cells; a unit test fails on a row inside a row or a row whose cell count
  differs from the header's.
- Wide tables show a one-line "swipe sideways" hint on narrow screens and soft edge shadows where more lies beyond.
- `npm run shots`: screenshots of every section at phone and desktop width in both themes, for looking at the console.

## 0.0.1 — released 2026-10-30

- The console: dashboard, roadmap (internal and public wording, editing, the public documents for people and bots),
  tasks (only the allowed moves, links, blocked reasons), composer (per-platform fit, segmentation bar, per-platform
  text, shorten with link, cost estimate, queue), publishing (instances, attempts, manual posting, resolving uncertain
  sends, the stop switch, targets with a confirmation before real sending), schedule (list and calendar, time zone),
  budgets (caps, usage, audit trail).
- Session handling: a banner and "Sign in again" when the session ends; unsent composer drafts kept in the browser;
  the CSRF header on every write; mapped error messages; no optimistic updates.
- Tests: libraries, HTTP layer, components against a fake admin API, Chromium tests of the built app under the
  production CSP (flows, phone width, axe in every theme and season), and a dist check that no test support ships.
- Admin console shell: header, section navigation (dashboard, roadmap, tasks, composer, publishing, schedule, budgets), footer.
- `ContentHubView` exported for embedding.
- Image on static-server with a same-origin CSP (`connect-src 'self'`, `frame-ancestors 'none'`), `robots.txt` disallowing everything.
