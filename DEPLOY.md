# Deploying to Aptible

This service expects a single environment variable for Postgres:

- `**DATABASE_URL**` — full PostgreSQL connection URL (Aptible provides this when you attach a database to the app).

Optional:

- `**PGSSLMODE=disable**` — use only for local development against Postgres without TLS. On Aptible, omit this so SSL is used.

The process listens on `**process.env.PORT**` (Aptible sets `PORT` automatically).

## Steps (high level)

1. **Create an Aptible account** and install the [Aptible CLI](https://deploy-docs.aptible.com/docs/cli) if you have not already.
2. **Create an app** in your Aptible environment (via dashboard or CLI).
3. **Provision a PostgreSQL database** in the same environment and **attach** it to the app so Aptible injects `DATABASE_URL` into the app container.
4. **Deploy from a Git remote** Aptible can access, or push a Docker image Aptible can pull, depending on your workflow.

### Deploy with Dockerfile (typical)

- Ensure the Aptible app is configured to **build from your Dockerfile** (Aptible detects `Dockerfile` in the repo root by default for Docker-based deploys).
- Set the app’s **service command** to the default from the Dockerfile (`node server.js`) unless you override it in Aptible.
- Confirm `**DATABASE_URL`** is present in the app configuration after database attachment.

1. **Create an endpoint** in Aptible (HTTPS) pointing at this app’s service port. Aptible sets `PORT` inside the container; your app must bind to that port (this project does).
2. **Verify** with the curl example below against your app’s HTTPS URL.

For the latest Aptible UI and CLI commands, see the official docs: [https://deploy-docs.aptible.com/](https://deploy-docs.aptible.com/).

## Local run (optional)

```bash
cp .env.example .env
# Edit .env with a local DATABASE_URL

npm install
npm start
```

## Test with curl

Replace `https://your-app.on-aptible.com` with your deployed app URL:

```bash
curl -sS -X POST "https://your-app.on-aptible.com/health-data" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "steps": [{ "value": 5000, "date": "2026-04-19" }],
    "heartRate": [{ "value": 72, "date": "2026-04-19T10:00:00Z" }],
    "sleep": [{ "value": 7.2, "date": "2026-04-18" }]
  }'
```

Expected response: `{"success":true}`