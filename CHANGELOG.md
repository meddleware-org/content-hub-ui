# Changelog

## 0.0.1 — unreleased

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
