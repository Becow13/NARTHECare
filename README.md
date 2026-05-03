# NARTHECare

Caregiver-facing health monitoring and AI-assisted care platform
processing sensitive health data (PHI). Treated as a healthcare
system from day 1 — HIPAA-aligned best practices are enforced in
`.cursor/rules/narthecare-general-healthcare.mdc` and honored by every PR.

## Platform roles

| Platform | Role | Status |
| --- | --- | --- |
| `apps/web/` | **Primary MVP** — full caregiver dashboard (Next.js) | Active |
| `apps/backend/` | Shared API — Aptible deployment | Active |
| `apps/ios/` | **HealthKit sync companion only** — no new UI screens during web MVP | Paused UI |

The web app is the primary product surface. The iOS app ingests HealthKit data
via `POST /healthkit/sync` (canonical `health_observations` table) and will
not receive new caregiver-facing UI until the web MVP ships. See
[`docs/web-mvp-plan.md`](docs/web-mvp-plan.md) for the full phase plan.

## Repository layout

```
NARTHECare/
├─ apps/
│  ├─ backend/          Node / Express API (Aptible deployment target)
│  ├─ ios/              Swift / SwiftUI — HealthKit ingest companion
│  └─ web/              Next.js caregiver dashboard (primary MVP)
├─ shared/
│  ├─ contracts/        JSON Schema source of truth for cross-platform payloads
│  └─ models/           JS / TS mirrors of the contracts consumed by apps
├─ docs/
│  ├─ web-mvp-plan.md   Web-first MVP phase plan (start here)
│  ├─ deploy.md         Aptible deployment guide
│  ├─ repo-structure.md Repo structure + conventions
│  ├─ prototype-analysis.md
│  └─ api-contracts/    Per-payload contract notes
├─ Dockerfile           Aptible git-deploy entry point (wraps apps/backend)
├─ .dockerignore
├─ .github/workflows/   aptible.yml runs CI + deploy
└─ README.md            ← this file
```

See [`docs/repo-structure.md`](docs/repo-structure.md) for the full
rationale and the rules that govern this layout.

## Quick starts

- **Backend** — see [`apps/backend/README.md`](apps/backend/README.md).
  TL;DR: `cd apps/backend && npm install && npm run dev`.
- **Web** — see [`apps/web/README.md`](apps/web/README.md).
  TL;DR: `cd apps/web && npm install && npm run dev`.
- **iOS** — open `apps/ios/NARTHECare.xcodeproj` in Xcode.
  Scope: HealthKit sync only. Do not build new caregiver UI screens.

## Deployment

The backend deploys to Aptible via the GitHub Action at
`.github/workflows/aptible.yml`. Aptible's git-deploy reads the root
`Dockerfile`, which wraps `apps/backend/`. `apps/web/` is excluded from the
Aptible image (see `.dockerignore`). Full walkthrough:
[`docs/deploy.md`](docs/deploy.md).

## Healthcare-grade rules (non-negotiable)

These apply to every file in this repo:

- **No PHI in logs.** No names, contact info, health metrics, or
  recent-notes content in any log line.
- **No tokens in logs.** Cognito tokens, bearer headers, and refresh
  tokens are never echoed.
- **Sanitized errors.** 4xx/5xx responses return short, stable
  messages — no stack traces, no SQL strings.
- **Env-only secrets.** Nothing is hard-coded; `DATABASE_URL`,
  `COGNITO_*` etc. come from Aptible's runtime env.
- **Audit every read/write of PHI.** Internal id + non-PHI metadata
  only. No names or medical data in `audit_logs.metadata`.
- **Fail closed.** Misconfigured production boots crash before the
  listener opens (see `apps/backend/lib/dev-auth.js`).

Full policy in [`.cursor/rules/healthcare.mdc`](.cursor/rules/healthcare.mdc).
