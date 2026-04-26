/**
 * Load `.env` when present so local `npm start` matches Aptible's env names.
 * Does not override variables already set in the process environment.
 */
import "dotenv/config"
import pg from "pg"
import { createApp } from "./app.js"
import {
  healthDataService,
  authService,
  careRecipientService,
  auditService,
} from "./services/index.js"
import {
  DEV_MOCK_USER,
  assertDevAuthBypassAllowed,
  assertProductionAuthReady,
  isDevAuthBypassEnabled,
} from "./lib/dev-auth.js"

const { Pool } = pg

const PORT = Number(process.env.PORT) || 3000

// Production safety gates. These run at module load (before anything
// touches the DB or the Cognito JWKS endpoint) so a misconfigured deploy
// crashes the boot loop immediately instead of accepting any request.
assertDevAuthBypassAllowed({
  flag: process.env.DEV_AUTH_BYPASS,
  nodeEnv: process.env.NODE_ENV,
})
assertProductionAuthReady({
  nodeEnv: process.env.NODE_ENV,
  devBypassFlag: process.env.DEV_AUTH_BYPASS,
  region: process.env.COGNITO_REGION,
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
})

// Resolved once at boot so every downstream decision (verifier creation,
// startup warning, dev-user seeding) agrees on the same answer. The
// resolver in `lib/dev-auth.js` forces `false` for production, so this
// constant is safe to reference unconditionally below.
const DEV_AUTH_BYPASS = isDevAuthBypassEnabled({
  flag: process.env.DEV_AUTH_BYPASS,
  nodeEnv: process.env.NODE_ENV,
})

/**
 * Build the shared pg.Pool from env configuration.
 *
 * Aptible and most managed Postgres providers require TLS but present
 * self-signed intermediates, so we default to `rejectUnauthorized: false`.
 * Set `PGSSLMODE=disable` locally to connect to a plain-text dev database.
 */
function createPool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is required (PostgreSQL connection string).")
  }
  const ssl =
    process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  return new Pool({ connectionString, ssl })
}

/**
 * Build the Cognito verifier from env configuration.
 *
 * When `DEV_AUTH_BYPASS` is active we skip verifier construction entirely
 * so local dev can boot without real COGNITO_* values. In every other
 * case all three env vars are required — we fail boot (rather than at
 * first authenticated request) so a misconfigured deploy cannot silently
 * accept unverified tokens. Optional `COGNITO_TOKEN_USE` switches between
 * `access` (default, for API calls) and `id` (for profile lookups).
 *
 * TODO(cognito): remove the bypass short-circuit once every environment
 * has real COGNITO_* env vars and we can make the verifier mandatory
 * again.
 */
function createVerifier() {
  if (DEV_AUTH_BYPASS) return null
  return authService.createCognitoVerifier({
    region: process.env.COGNITO_REGION,
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    tokenUse: process.env.COGNITO_TOKEN_USE,
  })
}

const pool = createPool()
const cognitoVerifier = createVerifier()

async function main() {
  // Order matters: auth tables must exist before care-team/audit FKs are
  // created. Each ensureSchema is idempotent so reboots are safe.
  await healthDataService.ensureSchema(pool)
  await authService.ensureSchema(pool)
  await careRecipientService.ensureSchema(pool)
  await auditService.ensureSchema(pool)

  // Seed the dev-bypass user AFTER ensureSchema so the `users` table
  // exists. `ensureDevUser` is idempotent (upsert keyed on a stable
  // cognito_sub sentinel) so restarts reuse the same internal id and
  // every existing care-team / audit FK keeps pointing at the same row.
  let devAuthBypass = null
  if (DEV_AUTH_BYPASS) {
    console.warn(
      "[server] WARNING: DEV_AUTH_BYPASS is enabled — every request will " +
        "authenticate as the dev mock user. This must never be set in production.",
    )
    const user = await authService.ensureDevUser(pool)
    devAuthBypass = { user, role: DEV_MOCK_USER.role }
  }

  const app = createApp({ pool, cognitoVerifier, devAuthBypass })

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] listening on ${PORT}`)
  })
}

main().catch((err) => {
  console.error("[server] fatal", err)
  process.exit(1)
})
