/**
 * Auth error mapping — translates internal failure modes into safe,
 * caregiver-friendly strings for the `/auth/error` page.
 *
 * Mirror of `apps/backend/lib/identity-errors.js` and the reference
 * project's `lib/auth-errors.ts`. The frontend NEVER renders a raw
 * Cognito or backend error message: those may include token fragments,
 * issuer URLs, or internal stack traces that are PHI- or
 * security-sensitive. Every user-visible auth message comes from this
 * module.
 *
 * Keep this file pure (no I/O, no React) so it is safe to import from
 * route handlers, server components, and unit tests alike.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Stable codes the auth routes append as `?error=<code>` when redirecting
 * to `/auth/sign-in` or `/auth/error`. Stable strings (not enums) so they
 * survive a server restart and stay searchable in browser history.
 */
export const AUTH_ERROR_CODES = Object.freeze({
  /** OAuth `state` parameter missing or did not match the temp cookie. */
  invalidState: "invalid_state",
  /** OAuth `code` parameter missing from Cognito's redirect. */
  missingCode: "missing_code",
  /** Cognito returned a non-2xx from `/oauth2/token`. */
  tokenExchangeFailed: "token_exchange_failed",
  /** ID token failed signature, issuer, audience, or expiry verification. */
  invalidIdToken: "invalid_id_token",
  /** Cognito returned `error=` on the redirect — user denied consent etc. */
  hostedUiError: "hosted_ui_error",
  /** Catch-all for unexpected failures — logged server-side, generic in UI. */
  serverError: "server_error",
} as const)

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]

// ─── Public mapping ─────────────────────────────────────────────────────────

/**
 * Map an `AuthErrorCode` to the message rendered to the caregiver.
 *
 * Wording is intentionally generic: it does not name Cognito, does not
 * leak whether the failure was on Cognito's side or ours, and never
 * suggests the caregiver re-enter credentials in a non-Cognito form.
 * Anything we cannot map (e.g. a tampered `?error=` query) falls through
 * to the generic message.
 */
export function authErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case AUTH_ERROR_CODES.invalidState:
    case AUTH_ERROR_CODES.missingCode:
      return "Sign-in could not be completed. Please try signing in again."
    case AUTH_ERROR_CODES.tokenExchangeFailed:
    case AUTH_ERROR_CODES.invalidIdToken:
      return "We could not verify your sign-in. Please try again."
    case AUTH_ERROR_CODES.hostedUiError:
      return "Sign-in was cancelled. Please try again to continue."
    case AUTH_ERROR_CODES.serverError:
    default:
      return "Something went wrong while signing you in. Please try again."
  }
}

/**
 * Narrow guard for code values coming off `searchParams.error`.
 *
 * Use in `/auth/sign-in` and `/auth/error` so a tampered URL cannot
 * coerce the page into rendering an unmapped code.
 */
export function isKnownAuthErrorCode(value: unknown): value is AuthErrorCode {
  if (typeof value !== "string") return false
  return Object.values(AUTH_ERROR_CODES).includes(value as AuthErrorCode)
}
