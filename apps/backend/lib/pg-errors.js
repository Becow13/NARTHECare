/**
 * PostgreSQL error-shape helpers for the `pg` driver.
 *
 * Pure predicates over thrown values — safe to import from services, DAOs,
 * and tests without pulling in database connectivity.
 */

/**
 * Return true when `err` is a PostgreSQL `unique_violation` on `users.email`.
 *
 * Used after `INSERT ... ON CONFLICT (cognito_sub)` when a new Cognito `sub`
 * targets an email that already belongs to a different internal row. The
 * constraint name is stable on our schema; `detail` is checked as a fallback
 * for older databases or drivers that omit `constraint`.
 *
 * @param {unknown} err Value caught from `pool.query`
 * @returns {boolean}
 */
export function isUsersEmailUniqueViolation(err) {
  if (!err || typeof err !== "object") return false
  const code = /** @type {{ code?: string }} */ (err).code
  if (code !== "23505") return false
  const constraint = /** @type {{ constraint?: string }} */ (err).constraint
  if (constraint === "users_email_key") return true
  const detail = String(
    /** @type {{ detail?: string }} */ (err).detail ?? "",
  )
  return detail.includes("(email)=") || detail.includes("users_email_key")
}
