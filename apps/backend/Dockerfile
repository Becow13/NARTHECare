# syntax=docker/dockerfile:1
#
# ─────────────────────────────────────────────────────────────────────────────
# Canonical backend Dockerfile.
#
# IMPORTANT: build from the REPO ROOT, not from apps/backend/, because
# the backend cross-workspace-imports `shared/models/`:
#
#   docker build -f apps/backend/Dockerfile -t narthecare-backend .
#
# This file is NOT the one Aptible currently uses — Aptible's git
# deploy auto-detects `./Dockerfile` at the repo root. The root
# Dockerfile is a near-identical wrapper so Aptible can keep
# building the image today. Both files must stay in sync until the
# Aptible app config is repointed at this file directly.
#
# Healthcare-grade invariants:
#   - NODE_ENV=production is baked in so `lib/dev-auth.js` rejects
#     DEV_AUTH_BYPASS=true at boot and requires COGNITO_*.
#   - No secrets in the image; all config comes from runtime env.
#   - No test code, schema bootstrap, docs, iOS, or web source shipped.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

COPY apps/backend/package.json apps/backend/package-lock.json ./apps/backend/
RUN cd apps/backend && npm ci --omit=dev

COPY apps/backend/app.js apps/backend/server.js ./apps/backend/
COPY apps/backend/lib ./apps/backend/lib
COPY apps/backend/services ./apps/backend/services
COPY apps/backend/integrations ./apps/backend/integrations

COPY shared/models ./shared/models

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/apps/backend
CMD ["node", "server.js"]
