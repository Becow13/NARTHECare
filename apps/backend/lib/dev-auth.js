/**
 * Development-only auth bypass helpers.
 *
 * Keep this file free of I/O — it is imported by the server bootstrap,
 * the Express middleware, and unit tests, so it must be safe to import
 * from any context without side effects. The actual DB seeding for the
 * dev user lives in `services/authService.js`, and the request-time
 * attachment of `req.user` lives in `app.js`.
 *
 * The bypass only exists so local/dev can hit the API before real
 * Cognito credentials are provisioned. `isDevAuthBypassEnabled` is the
 * single gatekeeper and returns `false` whenever `NODE_ENV` is
 * "production", regardless of the flag value — production deploys can
 * never opt into the bypass by accident.
 *
 * TODO(cognito): delete this module once every environment has real
 * COGNITO_* env vars and the middleware's bypass branch is removed.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Canonical identity attached to requests when the bypass is active.
 *
 * `cognitoSub` is a stable sentinel (not a real Cognito sub) so the
 * existing `users.cognito_sub UNIQUE NOT NULL` upsert keys onto the
 * same internal row on every boot — no duplicate dev users build up
 * across restarts. `role` is only used as a request-level identity
 * hint; per-recipient RBAC still lives in `care_team_members`.
 */
export const DEV_MOCK_USER = Object.freeze({
  cognitoSub: "dev-bypass",
  email: "dev@narthecare.local",
  name: "Dev User",
  role: "caregiver",
})

// ─── Flag resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the effective dev-bypass state from env-shaped inputs.
 *
 * Both inputs are passed in explicitly (rather than read from
 * `process.env`) so tests can toggle the behavior without mutating
 * the real environment. Returns `false` unconditionally when
 * `nodeEnv === "production"` — production must always fail closed.
 */
export function isDevAuthBypassEnabled({ flag, nodeEnv } = {}) {
  if (nodeEnv === "production") return false
  return String(flag ?? "").toLowerCase() === "true"
}

/**
 * Fail the boot if the operator explicitly opted into the bypass while
 * deploying to production.
 *
 * `isDevAuthBypassEnabled` silently downgrades the flag to `false` in
 * production so the request-time middleware is safe even if this check
 * is skipped. We still throw here so a misconfigured deploy surfaces as
 * a crash-loop in logs instead of a silent "why is my DEV_AUTH_BYPASS
 * being ignored?" debugging session — and so a future refactor that
 * relaxes the request-time check cannot accidentally re-enable it.
 */
export function assertDevAuthBypassAllowed({ flag, nodeEnv } = {}) {
  if (
    nodeEnv === "production" &&
    String(flag ?? "").toLowerCase() === "true"
  ) {
    throw new Error(
      "DEV_AUTH_BYPASS=true is not allowed when NODE_ENV=production. " +
        "Unset the flag or deploy with a non-production NODE_ENV.",
    )
  }
}

/**
 * Fail the boot if production is missing the Cognito configuration
 * required to verify tokens.
 *
 * Every production request depends on `cognitoVerifier` being non-null —
 * we fail closed at boot rather than at the first authenticated request
 * so a misconfigured deploy cannot silently accept unverified tokens.
 * The three vars intentionally map to the names in `.env.example`.
 */
export function assertProductionAuthReady({
  nodeEnv,
  devBypassFlag,
  region,
  userPoolId,
  clientId,
} = {}) {
  if (nodeEnv !== "production") return
  if (String(devBypassFlag ?? "").toLowerCase() === "true") return // covered above
  const missing = []
  if (!region) missing.push("COGNITO_REGION")
  if (!userPoolId) missing.push("COGNITO_USER_POOL_ID")
  if (!clientId) missing.push("COGNITO_CLIENT_ID")
  if (missing.length > 0) {
    throw new Error(
      `Cognito configuration missing in production: ${missing.join(", ")}`,
    )
  }
}
