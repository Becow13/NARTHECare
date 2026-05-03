# Repo structure

This document is the single source of truth for the monorepo layout
and the rules that govern where code lives. If it disagrees with the
actual tree, the tree wins and this doc should be updated in the same
PR.

## Platform roles (web-first MVP)

| App | Role | Deployment |
| --- | --- | --- |
| `apps/backend/` | Shared API (Express / Node) | Aptible — `aptible.yml` |
| `apps/web/` | **Primary MVP** — Next.js caregiver dashboard | Separate deploy (Phase 5) |
| `apps/ios/` | HealthKit sync companion only — no new UI screens during web MVP | Xcode / TestFlight |

See [`docs/web-mvp-plan.md`](web-mvp-plan.md) for the full phase plan and
rationale.

## Top level

```
NARTHECare/
├─ apps/                Deployable applications
│  ├─ backend/            Node/Express API (Aptible) — primary backend
│  ├─ ios/                Swift/SwiftUI — HealthKit ingest companion
│  └─ web/                Next.js caregiver dashboard — PRIMARY MVP
├─ shared/              Cross-platform assets (no per-app source)
│  ├─ contracts/          JSON Schema source of truth
│  └─ models/             JS / TS mirrors consumed by apps/{backend,web}
├─ docs/                Long-form docs (deploy, structure, contracts, plan)
├─ Dockerfile          Aptible git-deploy entry point (backend only)
├─ .dockerignore
├─ .gitignore
├─ .github/workflows/  CI / deploy workflows
└─ README.md
```

### Why root is workspace-only

The repo root is reserved for **workspace-level** files only:

- `README.md` — repo-level landing page.
- `Dockerfile` — Aptible's auto-detected entry point for the **backend** (see below).
- `.dockerignore`, `.gitignore` — workspace-wide ignores.
- `.github/workflows/` — CI config.
- `apps/`, `shared/`, `docs/` — actual source.

There is intentionally **no root `package.json`**, `server.js`, or
source tree. Backend code is under [`apps/backend/`](../apps/backend/README.md);
web code is under [`apps/web/`](../apps/web/README.md). Each app carries its
own `package.json` and is independently deployable.

### iOS scope boundary

`apps/ios/` is a **HealthKit sync companion only** during the web MVP phase.
Its sole production-facing function is submitting HealthKit observations to
`POST /healthkit/sync`, which writes them into the canonical
`health_observations` table. Do not add new caregiver-facing UI screens to
iOS until the web MVP has shipped. This rule is enforced in
`.cursor/rules/ios-style.mdc`.

## Deployment entry points

| Target | Who triggers | Build context | Dockerfile | Notes |
| --- | --- | --- | --- | --- |
| Aptible (backend) | GitHub Actions (`aptible.yml`) | repo root | `./Dockerfile` | `apps/web/` excluded via `.dockerignore` |
| Local backend | developer | repo root | `apps/backend/Dockerfile` | Canonical copy |
| Web (Phase 5) | GitHub Actions (`web.yml`) | `apps/web/` | `apps/web/Dockerfile` | Added in Phase 5 |

Both backend Dockerfiles must stay in sync until the Aptible app config is
repointed at `apps/backend/Dockerfile` directly. See
[`docs/deploy.md`](deploy.md).

## Cross-workspace imports

Today the backend imports `shared/models/CareRecipientProfile.js`
(the JS mirror of `shared/contracts/careRecipientProfile.schema.json`).
That reach-outside-the-package is intentional — the contract mirrors
MUST be shared so backend / web / iOS never drift. The Docker images
stage `shared/models/` alongside `apps/backend/` so the relative
import resolves at runtime.

Adding more cross-workspace dependencies:

1. Put the shared code in `shared/<name>/`. Pure, side-effect-free.
2. Add the corresponding `COPY shared/<name> ./shared/<name>` to
   both Dockerfiles (root + `apps/backend/`).
3. Update this doc and `.dockerignore`.

Do NOT introduce `apps/*/` → `apps/*/` imports. Apps are deployables
and must stay independent.

## Tests

Backend tests live under `apps/backend/`:

- `apps/backend/lib/__tests__/*.test.js` — unit tests (node:test).
- `apps/backend/test/*.integration.test.js` — integration tests
  (node:test), using an in-process fake `pg.Pool`.

Both are run by `npm run build` (which is `npm test` + `node --check`)
from `apps/backend/`, and that script is what CI calls.

## Conventions enforced by Cursor rules

- [`.cursor/rules/healthcare.mdc`](../.cursor/rules/healthcare.mdc) —
  PHI handling, no-log rules, MFA-ready design, SMART on FHIR, AI
  safety constraints. Applies to every file.
- [`.cursor/rules/reference-pattern.mdc`](../.cursor/rules/reference-pattern.mdc) —
  layered architecture (route → service → DAO; pure helpers in `lib/`),
  ESM-only, double-quoted strings, JSDoc for every export.
- [`.cursor/rules/backend-style.mdc`](../.cursor/rules/backend-style.mdc) —
  concrete route / service / DAO patterns.
- [`.cursor/rules/ios-style.mdc`](../.cursor/rules/ios-style.mdc) —
  iOS/Swift conventions.

When in doubt, prefer the stricter rule.
