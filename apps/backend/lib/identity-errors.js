/**
 * Authentication / identity errors surfaced to HTTP clients.
 *
 * Keep messages generic so a caller cannot probe which emails exist in the
 * system. Detailed context belongs in audit logs or sanitized server logs.
 */

/**
 * Thrown when the verified Cognito `sub` cannot be created because the email
 * is already bound to another `cognito_sub` and the token does not assert a
 * verified email, so automatic identity merge is refused.
 */
export class IdentityEmailConflictError extends Error {
  constructor() {
    super(
      "This email is already linked to an account. Use your original sign-in or contact support.",
    )
    this.name = "IdentityEmailConflictError"
  }
}
