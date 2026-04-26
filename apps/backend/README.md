# @narthecare/backend

Node ESM + Express API for NARTHECare. **Canonical home of the
backend source** as of the monorepo migration — all server code lives
here, not at the repo root.

## Layout

```
apps/backend/
├─ app.js                # Express factory (routes, middleware)
├─ server.js             # Boot: env gates, DB pool, verifier, listen
├─ package.json          # narthecare-api (private)
├─ package-lock.json
├─ Dockerfile            # Canonical image; build from REPO ROOT
├─ schema.sql            # One-off local bootstrap; not used in prod
├─ .env.example          # Env template
├─ lib/                  # Pure helpers (no I/O)
│  ├─ audit.js
│  ├─ care-recipient-profile.js
│  ├─ care-recipients.js
│  ├─ cognito-auth.js
│  ├─ dev-auth.js        # DEV_AUTH_BYPASS safety gates
│  ├─ health-data.js
│  └─ __tests__/         # Unit tests (node:test)
├─ services/
│  ├─ *Service.js        # Business logic
│  ├─ dao/*Dao.js        # DB only (pg.Pool)
│  ├─ mock/*Mock.js      # Pure mocks until tables exist
│  └─ index.js           # Barrel
├─ integrations/         # External APIs (e.g. Epic/FHIR stub)
├─ scripts/
│  └─ dev.js             # Local: Aptible db:tunnel + node --watch
└─ test/                 # Integration tests (node:test)
```

The reference-style layering is enforced by
`.cursor/rules/reference-pattern.mdc` and
`.cursor/rules/backend-style.mdc`:

> route handler → `services/<feature>Service.js` →
> `services/dao/<feature>Dao.js`. Pure helpers (no I/O) live in `lib/`.

## Local development

```bash
cd apps/backend
cp .env.example .env       # set DATABASE_URL, NODE_ENV=development, etc.
npm install
npm run dev                # aptible db:tunnel + node --watch server.js
# or:
npm start                  # plain: node server.js
npm test                   # node --test on unit + integration suites
npm run build              # npm test && node --check server.js (matches CI)
```

When `DEV_AUTH_BYPASS=true` **and** `NODE_ENV !== "production"`, every
authenticated route auto-attaches a stable dev user. The server logs a
loud warning at boot and the resolver in `lib/dev-auth.js` forces
`false` whenever `NODE_ENV=production` — production can never opt in
by accident. See `lib/dev-auth.js` and the tests in
`lib/__tests__/dev-auth.test.js`.

## Deployment (Aptible)

The Aptible app still deploys via the **root** `Dockerfile` (Aptible's
git deploy auto-detects it). That file is a thin wrapper around this
package that also stages `shared/models/`. The canonical
`apps/backend/Dockerfile` is built with the repo root as the context:

```bash
docker build -f apps/backend/Dockerfile -t narthecare-backend .
```

Both Dockerfiles **must stay in sync** until the Aptible app config is
repointed. See [`docs/deploy.md`](../../docs/deploy.md) for the full
walkthrough.

## HTTP surface

| Method | Path                                       | Auth      | Notes                                                                         |
| ------ | ------------------------------------------ | --------- | ----------------------------------------------------------------------------- |
| GET    | `/health`                                  | none      | Liveness probe. No DB. No logs. No PHI. `{ "status": "ok" }`.                 |
| POST   | `/health-data`                             | none*     | Legacy HealthKit ingest; will move behind Cognito once iOS ships tokens.      |
| GET    | `/me`                                      | Cognito   | Returns the caller's internal identity row.                                   |
| POST   | `/care-recipients`                         | Cognito   | Creates a recipient and attaches the caller as `primary_caregiver`.           |
| GET    | `/care-recipients`                         | Cognito   | Lists recipients the caller is on the team for.                               |
| GET    | `/care-recipients/:id`                     | Cognito   | Returns a single recipient the caller has access to.                          |
| GET    | `/care-recipients/:id/profile`             | Cognito   | Full `CareRecipientProfile` (mock fallback until DAO tables land).            |

\* Behind `DEV_AUTH_BYPASS` or behind the Cognito middleware — see the
TODO at the route definition in `app.js`.

## Healthcare-grade invariants

These are non-negotiable. Every PR that touches the backend must keep
them:

- **No PHI in logs.** Name, contact, emergency contact, health
  background, recent notes, data-source payloads — none of it. Logs
  carry tagged prefixes like `[API care-recipients/:id/profile]` and
  sanitized error messages only.
- **No tokens in logs.** The Cognito middleware logs only
  `e.message` (never the full error) on verifier failures, and never
  echoes `Authorization` headers.
- **Sanitized errors to clients.** Every 4xx/5xx response uses
  `e instanceof Error ? e.message : "<generic>"` — no stack traces, no
  SQL strings.
- **Env-only secrets.** `DATABASE_URL`, `COGNITO_*` never hard-coded.
  `dotenv` loads `.env` locally; Aptible injects at runtime.
- **Audit every mutating / reading action.** `auditService.logAction`
  runs on care-recipient create/list/view and profile view.
  `audit_logs.metadata` carries internal ids and counts only — no PHI.
- **Fail closed at boot.** `assertDevAuthBypassAllowed` and
  `assertProductionAuthReady` in `lib/dev-auth.js` throw before any
  socket opens if the env is misconfigured for production.

## TODOs tracked in code

- **Cognito** — remove `DEV_AUTH_BYPASS` once every environment has
  real `COGNITO_*` values (`lib/dev-auth.js`, `app.js`).
- **PostgreSQL persistence** — drop `getMockCareRecipientProfile` once
  the DAO is wired to real tables
  (`services/careRecipientProfileService.js`).
- **SMART on FHIR** — Epic MyChart integration stub lives in
  `integrations/fhir.js`.
- **Token refresh** — iOS client must refresh Cognito tokens; the
  backend verifier already accepts refreshed tokens transparently.
- **RBAC** — replace the placeholder
  `canAccessCareRecipient(userId, careRecipientId)` in
  `lib/care-recipient-profile.js` with a real
  `care_team_members` query.
- **Readiness vs liveness split** — add a `/ready` endpoint that does
  a shallow `SELECT 1`; keep `/health` DB-free.
