# Changelog

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
