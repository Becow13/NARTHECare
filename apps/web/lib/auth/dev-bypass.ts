/**
 * Development-only auth bypass helpers for the web app.
 *
 * Mirror of `apps/backend/lib/dev-auth.js` — same env var name, same
 * production safety guarantee — so a single `DEV_AUTH_BYPASS=true` flag
 * toggles the entire stack into "no Cognito required" mode for local
 * dev. Production builds fail closed: the resolver returns `false`
 * whenever `NODE_ENV === "production"` regardless of the flag value, and
 * the boot-time assert below crashes the server if a deploy explicitly
 * opts in.
 *
 * The mock identity lives here (not in `mock-data.ts`) because it is the
 * caregiver running the app, not a piece of fixture content. It is used
 * by `services/sessionService.ts` to seed an httpOnly cookie identical
 * in shape to a real signed-in session, which means every downstream
 * page renders against the exact same `getSession()` surface in dev and
 * prod.
 *
 * TODO(cognito): delete this module once every environment has real
 * Cognito creds and the middleware's bypass branch is removed.
 */

import type { SessionUser } from "./session-cookie"

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Canonical identity attached to dev-bypass sessions.
 *
 * `cognitoSub` is a sentinel (not a real Cognito sub) and is identical to
 * the backend's `DEV_MOCK_USER.cognitoSub` so the upserted `users` row in
 * Postgres lines up: the web app and the backend both authenticate the
 * dev caregiver as the same internal user id, and `care_team_members` /
 * `audit_logs` FKs stay stable across restarts.
 */
export const DEV_MOCK_USER: SessionUser = Object.freeze({
  cognitoSub: "dev-bypass",
  email: "dev@narthecare.local",
  emailVerified: true,
  displayName: "Dev Caregiver",
})

// ─── Flag resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the effective dev-bypass state from env-shaped inputs.
 *
 * Both inputs are passed in explicitly (not read from `process.env`) so
 * tests can toggle the behaviour without mutating the real environment.
 * Returns `false` unconditionally when `nodeEnv === "production"` —
 * production must always fail closed.
 */
export function isDevAuthBypassEnabled(input: {
  flag: string | undefined
  nodeEnv: string | undefined
}): boolean {
  if (input.nodeEnv === "production") return false
  return String(input.flag ?? "").toLowerCase() === "true"
}

/**
 * Fail the boot if the operator explicitly opted into the bypass while
 * deploying to production.
 *
 * `isDevAuthBypassEnabled` already silently downgrades the flag in
 * production, but we still throw here so a misconfigured deploy
 * surfaces as a crash-loop in logs instead of a silent "why is my
 * DEV_AUTH_BYPASS being ignored?" debugging session — and so a future
 * refactor of the request-time check cannot accidentally re-enable it.
 */
export function assertDevAuthBypassAllowed(input: {
  flag: string | undefined
  nodeEnv: string | undefined
}): void {
  if (
    input.nodeEnv === "production" &&
    String(input.flag ?? "").toLowerCase() === "true"
  ) {
    throw new Error(
      "DEV_AUTH_BYPASS=true is not allowed when NODE_ENV=production. " +
        "Unset the flag or deploy with a non-production NODE_ENV.",
    )
  }
}
