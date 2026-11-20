# Open standards and interoperability: content-hub-ui

The operator console for the content hub (private to the operator).

This page lists what the project speaks today, what is planned, what was considered and does not apply, where someone else can extend it, and what proves each claim. The platform-wide list is [Standards we use](https://meddleware.dev/platform/standards). A row appears there in the same change that turns a standard on.

## Spoken today

- Content Security Policy (W3C), sent as a header
- HTTP Strict Transport Security (RFC 6797)
- Web App Manifest (W3C)
- Robots Exclusion Protocol (RFC 9309) at /robots.txt
- llms.txt (a community convention, not a formal standard)
- WCAG 2.2 level AA with AAA contrast (W3C), tested on every change
- No cookie and no browser storage before an action, tested on every change
- RFC 3339 timestamps

## Planned

- Sign-in through the platform's OpenID Connect provider, with a session held by the console's backend
- Atom and WebSub for the owned feed; feed autodiscovery on the sites

## Considered, not applicable

- Sitemap, Open Graph, security.txt: an operator console behind sign-in, not a public page

## Extension points

- Publishers are targets in content-hub-service (Discord, Telegram, Bluesky, Mastodon, the owned feed)

## What proves it

- e2e/a11y.spec.ts
- the real-API console run

_Maintained centrally with the platform's interoperability map; changes go through it so every repository says the same thing._
