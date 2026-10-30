# @meddleware/content-hub-ui

The content hub's admin console: dashboard, roadmap, tasks, composer, publishing instances and budgets. A Vue 3
single-page app on `@meddleware/ui`, served by static-server on the admin host, and exported as `ContentHubView`
for embedding. Backend: [content-hub-service](https://github.com/meddleware-org/content-hub-service).

**Status (0.0.2):** all seven sections work against the admin API.

| Section | What it does |
| --- | --- |
| Dashboard | counts by state, what is scheduled, reviews due, spend against caps |
| Roadmap | phases and items with internal and public wording side by side; edit; a preview of the public roadmap for people and for bots, produced by the same code the public site uses |
| Tasks | filtered, paginated list; only the status changes the server offers; blocked reasons; links; "needs the organisation" |
| Composer | write once, pick targets, see per platform how much fits (counts in each platform's own unit, a segmentation bar with words and patterns as well as colour), per-platform text, "shorten with link", cost estimate, queue |
| Publishing | every post on every target with attempts and the exact text sent; mark a manual post posted, copy its text, open its compose link, resolve an uncertain send, retry, cancel; the stop switch; targets (turning real sending on asks first) |
| Schedule | list and month calendar of what will send and which reviews are due, in the time zone you choose |
| Budgets | monthly caps per platform and target (bounded by the deployment's ceilings), usage with 50/80/100 % in words, and the trail of changes |

- **Same origin only.** The console talks to `/api/v1` on its own host; the CSP's `connect-src` is `'self'`.
- **No tokens in the browser.** The access gateway in front of the host (Cloudflare Access) holds the session; the
  console never sees a credential. State-changing requests carry the CSRF header the API requires.
- **Not for search engines.** `robots.txt` disallows everything; the page carries `noindex`.
- **A session that ends costs nothing.** Any request that finds the session over (a 401, a redirect to the sign-in
  page, or a sign-in page where JSON belongs) raises a banner with "Sign in again"; unsent composer drafts live in this
  browser (validated on read, never trusted) and come back after the reload.
- **Previews are previews.** Counts, bands and costs use `@meddleware/content-hub-client`, which the service's golden
  vectors keep identical to the server's Rust code; queueing re-checks everything on the server, and the console shows
  what it refused and why.
- **Times** are stored and sent in UTC and shown in the zone chosen at the top (default: the browser's).

## Build-time configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_BRAND_NAME` | `Content hub` | name in the header |
| `VITE_DOCS_URL` | unset | documentation link in the footer |

## Development

```bash
npm ci
npm run dev            # http://localhost:5173, /api proxied to a local `content-hub admin` on :8080
npm run type-check && npm run lint && npm test && npm run build && npm run check:csp && npm run check:dist
npx playwright install chromium && npm run test:e2e     # the built console in a browser, against a mocked admin API
docker build -t content-hub-ui:dev . && bash scripts/smoke.sh content-hub-ui:dev
```

`@meddleware/content-hub-client` is a dependency that is not published yet. Until it is, install it from a checkout
(`npm run build && npm pack` in `content-hub-client`, then `npm install --no-save <tarball>` here); once it is
published, regenerate `package-lock.json` and the image builds (`npm ci`). The release order is client first.

## Tests

| Kind | Where | What |
| --- | --- | --- |
| Unit | `tests/lib.test.ts` | time zones across clock changes, money without floats, unsent drafts (tamper and unavailable storage), the calendar, cap rows and the audit sentences, the composer's arithmetic |
| Unit | `tests/http.test.ts` | the CSRF header on writes only, same-origin, the session ending in four ways, error mapping |
| Component | `tests/console.test.ts` | every section through `ContentHubView` against a fake admin API that enforces the CSRF header, the state machines and the platform limits |
| Browser | `e2e/console.spec.ts` | the built app in Chromium under the production CSP: session expiry through a real redirect, draft restored after the reload, composing across three platforms, manual posting, resolving an uncertain send, the public preview, a hostile post, phone width |
| Accessibility | `e2e/accessibility.spec.ts` | axe (WCAG 2.2 AA) over every section in light and dark and all four seasons |
| Build | `scripts/check-dist.mjs` | no fake API, test hook or test runner reaches `dist`; `noindex` is present |

The fake admin API (`tests/support/fake-api.ts`) is test support only; nothing under `src/` imports it.

## Licence

0BSD — see [LICENSE](LICENSE).
