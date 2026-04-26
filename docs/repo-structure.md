# Repo structure

This document is the single source of truth for the monorepo layout
and the rules that govern where code lives. If it disagrees with the
actual tree, the tree wins and this doc should be updated in the same
PR.

## Top level

```
NARTHECare/
├─ apps/                Deployable applications
│  ├─ backend/            Node/Express API (Aptible)
│  ├─ ios/                Swift/SwiftUI client
│  └─ web/                Next.js caregiver UI
├─ shared/              Cross-platform assets (no per-app source)
│  ├─ contracts/          JSON Schema source of truth
│  └─ models/             JS / TS mirrors consumed by apps/{backend,web}
├─ docs/                Long-form docs (deploy, structure, contracts)
├─ Dockerfile          Aptible git-deploy entry point
├─ .dockerignore
├─ .gitignore
├─ .github/workflows/  CI / deploy workflows
└─ README.md
```

### Why root is workspace-only

The repo root is reserved for **workspace-level** files only:

- `README.md` — repo-level landing page.
- `Dockerfile` — Aptible's auto-detected entry point (see below).
- `.dockerignore`, `.gitignore` — workspace-wide ignores.
- `.github/workflows/` — CI config.
- `apps/`, `shared/`, `docs/` — actual source.

There is intentionally **no root `package.json`**, `server.js`, or
source tree anymore. All backend code is under
[`apps/backend/`](../apps/backend/README.md).

## Deployment entry points

| Target  | Who triggers   | Build context | Dockerfile                               |
| ------- | -------------- | ------------- | ---------------------------------------- |
| Aptible | GitHub Actions | repo root     | `./Dockerfile` (thin wrapper)            |
| Local   | developer      | repo root     | `apps/backend/Dockerfile` (canonical)    |

Both Dockerfiles must stay in sync until the Aptible app config is
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
