# Deploying to Aptible

## Canonical layout

The backend source lives in [`apps/backend/`](../apps/backend/). CI
installs, tests, and lints from that directory; the Docker image
staged into Aptible is built from the **repo root** as the build
context.

### Which Dockerfile does Aptible use?

Aptible's `type: git` deploy (see `.github/workflows/aptible.yml`)
auto-detects `./Dockerfile` at the repo root. That's the one that
ships today. It is a thin wrapper that:

1. `COPY`s `apps/backend/package.json` + `apps/backend/package-lock.json`
   into `/app/apps/backend/`.
2. Runs `npm ci --omit=dev` inside that directory.
3. `COPY`s the backend source (`app.js`, `server.js`, `lib/`,
   `services/`, `integrations/`).
4. `COPY`s `shared/models/` into `/app/shared/models/` because the
   backend cross-workspace-imports the JS mirror of the
   `shared/contracts/` schema.
5. Sets `WORKDIR /app/apps/backend` and runs `CMD ["node", "server.js"]`.

`apps/backend/Dockerfile` is a near-identical **canonical** copy for
local use and for the eventual Aptible-side repoint. Build it from the
repo root so `shared/models/` is in scope:

```bash
docker build -f apps/backend/Dockerfile -t narthecare-backend .
```

Both Dockerfiles must be kept in sync until the Aptible app config is
repointed at `apps/backend/Dockerfile`, at which point the root file
can be deleted.

## Build + deploy path

1. CI (`.github/workflows/aptible.yml`)
   - Checks out the repo.
   - `actions/setup-node@v4` with `cache-dependency-path: apps/backend/package-lock.json`.
   - `npm ci` from `working-directory: apps/backend`.
   - `npm run build` from `working-directory: apps/backend`
     (`npm test` + `node --check server.js`).
2. `aptible/aptible-deploy-action@v4` (type: `git`, app: `narthecare`,
   environment: `narthecare`) pushes the repo to Aptible's Git
   endpoint. Aptible reads the root `Dockerfile`, builds the image
   from the repo root, and runs `CMD ["node", "server.js"]`.

The Aptible-side config (app name, environment, endpoint, attached
database) is unchanged from the pre-monorepo layout. Credentials are
supplied via the existing `APTIBLE_USERNAME` / `APTIBLE_PASSWORD`
GitHub Actions secrets.

## Required runtime environment

Aptible injects the following — none are baked into the image:

- `DATABASE_URL` — PostgreSQL connection URL (set automatically when a
  database is attached to the app).
- `PORT` — HTTP port the container binds to. The app listens on
  `process.env.PORT` on `0.0.0.0`.
- `NODE_ENV=production` — baked by the Dockerfile; also re-set by
  Aptible. Required so `lib/dev-auth.js` rejects `DEV_AUTH_BYPASS=true`
  at boot.
- `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` — must
  all be present in production; the server **fails boot** if any is
  missing (see `assertProductionAuthReady` in `apps/backend/lib/dev-auth.js`).

Optional:

- `PGSSLMODE=disable` — local dev only. Do **not** set on Aptible.
- `COGNITO_TOKEN_USE` — `"access"` (default) or `"id"`.

Secrets are never logged. See `apps/backend/README.md` for the
healthcare-grade logging, audit, and sanitization rules.

## Runtime health

`GET /health` returns `{"status":"ok"}`. It is:

- unauthenticated (Aptible and any future load balancer have no
  Cognito tokens);
- DB-free (a transient Postgres blip must not pull the whole app out
  of rotation — readiness/DB health will live on a separate `/ready`
  once liveness and readiness are split);
- silent in logs (probes hit it every few seconds).

Point the Aptible endpoint's health check at `/health`.

## Aptible-side setup (high level)

1. Create an Aptible account and install the
   [Aptible CLI](https://deploy-docs.aptible.com/docs/cli) if you have
   not already.
2. Create the `narthecare` app in the `narthecare` environment (or
   whatever names your environment uses; mirror them in
   `.github/workflows/aptible.yml`).
3. Provision a PostgreSQL database in the same environment and attach
   it so Aptible injects `DATABASE_URL`.
4. Configure the COGNITO_* vars on the app.
5. Create an HTTPS endpoint pointing at the app's service port and
   configure the health check path as `/health`.
6. Trigger a deploy via `git push origin main` (CI runs automatically)
   or the `workflow_dispatch` button on the GitHub Actions page.

For the latest Aptible UI and CLI commands, see the official docs:
<https://deploy-docs.aptible.com/>.

## Local run

```bash
cd apps/backend
cp .env.example .env       # then fill in DATABASE_URL, NODE_ENV, etc.
npm install
npm start                  # plain: node server.js
# or:
npm run dev                # opens aptible db:tunnel + node --watch server.js
```

## Test with curl

Replace `https://your-app.on-aptible.com` with your deployed app URL:

```bash
curl -sS "https://your-app.on-aptible.com/health"
# → {"status":"ok"}
```

With a valid Cognito access token:

```bash
curl -sS "https://your-app.on-aptible.com/care-recipients/<uuid>/profile" \
  -H "Authorization: Bearer <token>"
```
