# syntax=docker/dockerfile:1
#
# ─────────────────────────────────────────────────────────────────────────────
# Root Dockerfile — the Aptible deploy entry point.
#
# Aptible's `type: git` deploy (see `.github/workflows/aptible.yml`)
# auto-detects a Dockerfile at the repo root and builds it with the
# repo root as the build context. The canonical backend source lives
# under `apps/backend/`, but a few cross-workspace imports reach into
# `shared/models/` (JS mirror of `shared/contracts/`), so the build
# MUST run from the repo root — we cannot move this file down.
#
# This file is kept in lockstep with `apps/backend/Dockerfile`. When /
# if the Aptible app config is repointed at that file, this root
# Dockerfile can be deleted — but do so only after verifying the
# Aptible-side config change on a non-prod environment.
#
# Healthcare-grade invariants enforced by this image:
#   - NODE_ENV=production is baked in so `lib/dev-auth.js` fails closed
#     on DEV_AUTH_BYPASS=true and requires COGNITO_* at boot.
#   - No secrets are baked in; DATABASE_URL, COGNITO_* etc. come from
#     Aptible's runtime env injection.
#   - No test code, schema bootstrap, docs, iOS, or web source enters
#     the image (see `.dockerignore` + the selective COPY below).
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

# Install backend dependencies (production only) in apps/backend so the
# runtime module resolver finds them next to server.js.
COPY apps/backend/package.json apps/backend/package-lock.json ./apps/backend/
RUN cd apps/backend && npm ci --omit=dev

# Backend source.
COPY apps/backend/app.js apps/backend/server.js ./apps/backend/
COPY apps/backend/lib ./apps/backend/lib
COPY apps/backend/services ./apps/backend/services
COPY apps/backend/integrations ./apps/backend/integrations

# Cross-workspace contract mirror consumed by the backend. When this
# grows beyond CareRecipientProfile, add more COPYs here rather than
# pulling the whole `shared/` tree — keeps the image minimal.
COPY shared/models ./shared/models

ENV NODE_ENV=production
EXPOSE 3000

# Run the server from apps/backend so:
#   - `import "dotenv/config"` looks for .env in apps/backend (there is
#     none in the image — Aptible injects env at runtime — so dotenv is
#     a silent no-op),
#   - relative imports like `../../../shared/models/...` resolve,
#   - process.cwd() matches the local-dev layout (`cd apps/backend`).
WORKDIR /app/apps/backend
CMD ["node", "server.js"]
