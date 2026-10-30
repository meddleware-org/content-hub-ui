# Security Policy

## Scope

The `@meddleware/content-hub-ui` source, package and image. Out of scope: the access gateway in front of the admin
host, the content hub service (its own policy) and the cluster.

## Security model

1. The console is served only on the admin host, behind an access gateway (Cloudflare Access) that holds the
   session. The console holds no credential and makes no cross-origin request (`connect-src 'self'`).
2. The admin API authorises every request itself (identity, role, CSRF header); the console's checks are previews.
3. Untrusted text (post bodies, titles, platform replies) is rendered as text, never as markup: there is no `v-html`;
   the rendered preview is built from parsed tokens as DOM elements and links only pass `safeHref`.
4. Every state-changing request carries the CSRF header; the console reads no token and stores nothing secret. Unsent
   composer drafts (plain text the operator typed) are kept in the browser's `localStorage`, validated on read.
5. Nothing the console shows is a decision: limits, caps, state changes and permissions are the server's.
6. The image is static-server, nonroot, read-only; the CSP forbids inline scripts and framing
   (`frame-ancestors 'none'`).

## Supported versions

The latest release. Pre-0.2 versions receive fixes only in the next release.

## Reporting a vulnerability

Please **do not** open a public issue. Email **<security@meddleware.co.uk>** with a description, reproduction
steps, and the version or commit. Acknowledgement within **3 business days**; a plan within **14 days** for confirmed
issues.

## Disclosure

Coordinated: a fix is released first, then described in the CHANGELOG and the audit
(`docs/audit/content-hub-ui-audit.md`).
