# ── build stage ───────────────────────────────────────────────────────────────
# Standalone build — the Docker context is this repo root. @meddleware/* dependencies resolve
# from npm (@meddleware/ui, @meddleware/design-tokens and @meddleware/content-hub-client).
#
# VITE_* build args (baked into the static bundle at build time):
#   VITE_BRAND_NAME  — the name in the header (default "Content hub")
#   VITE_DOCS_URL    — optional documentation link
# The admin API is same-origin (/api/v1), so connect-src is 'self' only; no third-party origin is ever contacted.
ARG CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"

# The build stage runs on the BUILD host's architecture: its output (static files) is architecture-independent,
# so no arm64 step runs under emulation. The final stage only COPYs into the multi-arch static-server image.
FROM --platform=$BUILDPLATFORM node:26-slim@sha256:0d1e33586362bb9e608c4e751e7a9e7edb55c9ac11461ed5666af696cc461dd4 AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .

ARG VITE_BRAND_NAME
ARG VITE_DOCS_URL

ENV VITE_BRAND_NAME=${VITE_BRAND_NAME} \
    VITE_DOCS_URL=${VITE_DOCS_URL}

RUN npm run build && npm run licenses
ARG CSP
# The CSP has no 'unsafe-inline' for scripts: the build fails if dist/ ever carries an inline <script>.
RUN node scripts/check-csp-inline.mjs "${CSP}" dist

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM quay.io/meddleware-org/static-server:0.1.11@sha256:94685b948d5086ccdb5b0b5d3b7caef6f2e3d1e4b9f7f8a311e9f26950da3723
ARG CSP
ENV CONTENT_SECURITY_POLICY="${CSP}"

COPY --from=build /app/dist /app/public
# The lockfile lets SBOM scanners see the npm packages the bundle was built from (the bundle itself carries no
# package metadata). It sits outside the served directory; THIRD_PARTY_LICENSES is served with the site.
COPY --from=build /app/package-lock.json /usr/share/doc/content-hub-ui/package-lock.json

ENV SERVE_DIR=/app/public \
    SPA_FALLBACK=true \
    CACHE_IMMUTABLE_PREFIX=/assets/

# The base image already runs as nobody; say so here too so the Dockerfile is self-describing.
USER 65534:65534

EXPOSE 8080
