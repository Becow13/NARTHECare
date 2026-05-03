/**
 * Shared job-runtime helper for Phase 4B background entry points.
 *
 * Every nightly job (`recompute-baselines`, `evaluate-alerts`,
 * `generate-daily-summaries`) needs the same boot sequence: load env,
 * gate on production-auth-readiness flags, build a `pg.Pool`, run a
 * single function, log a tagged summary, exit with the right status
 * code. Centralizing it here keeps each entry point a couple of
 * lines and forbids divergent boot semantics between jobs.
 *
 * The runner intentionally:
 *   - logs only `[jobs <name>]` framing + a count envelope (never PHI),
 *   - drains the pool before exiting so `aptible cron` reports a
 *     deterministic process exit,
 *   - exits non-zero if the work function throws OR if any
 *     per-recipient `errors[]` entry surfaces (so cron alerting fires
 *     instead of silently masking a partial sweep).
 */
import "dotenv/config"
import pg from "pg"
import {
  assertDevAuthBypassAllowed,
  assertProductionAuthReady,
} from "../lib/dev-auth.js"

const { Pool } = pg

/**
 * Build the same `pg.Pool` shape `server.js` does — the deploy already
 * has the right `DATABASE_URL` / `PGSSLMODE` semantics for both Aptible
 * and local-tunnel dev. Duplicated here (rather than imported from
 * `server.js`) on purpose so importing this module never side-effects
 * the API server's `main()`.
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
 * Boot, run `work(pool)`, drain the pool, exit.
 *
 * `work` returns whatever envelope the underlying service produces —
 * the runner reads only the optional `errors[]` field to decide the
 * exit code. The whole envelope is JSON-stringified into the log so
 * ops dashboards can grep the count surface without leaking PHI.
 */
export async function runJob(name, work) {
  // Production safety gates run at module load in `server.js`; we
  // mirror them here so a misconfigured cron host fails loudly
  // instead of attempting to write to the prod DB without the right
  // auth posture.
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
    domain: process.env.COGNITO_DOMAIN,
  })

  const pool = createPool()
  const startedAt = Date.now()
  console.log(`[jobs ${name}] starting`)

  let envelope = null
  let failed = false
  try {
    envelope = await work(pool)
  } catch (err) {
    failed = true
    console.error(`[jobs ${name}] fatal`, {
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    try {
      await pool.end()
    } catch (drainErr) {
      console.error(`[jobs ${name}] pool drain failed`, {
        message:
          drainErr instanceof Error ? drainErr.message : String(drainErr),
      })
    }
  }

  const elapsedMs = Date.now() - startedAt
  if (failed) {
    console.log(`[jobs ${name}] exited (failed) elapsed_ms=${elapsedMs}`)
    process.exit(1)
  }

  // The work envelopes (per service) carry only counts + recipient
  // ids + generic error messages — safe to log verbatim.
  console.log(`[jobs ${name}] done elapsed_ms=${elapsedMs}`, envelope ?? {})
  if (Array.isArray(envelope?.errors) && envelope.errors.length > 0) {
    process.exit(2)
  }
  process.exit(0)
}
