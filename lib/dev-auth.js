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
