/**
 * Cognito claim-set parsing.
 *
 * Direct mirror of `apps/backend/lib/cognito-auth.js#extractIdentity`.
 * Pure (no I/O) so it is safe to import from the service layer, the
 * route handlers, and unit tests alike — and so a single set of rules
 * decides what counts as a valid Cognito identity across the stack.
 *
 * `aws-jwt-verify` already enforced issuer / audience / signature
 * before this runs. This module only shapes the claims, normalises
 * the boolean coercion, and chooses a display name fallback.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The minimal verified Cognito identity we hand to `services/sessionService`.
 *
 * Identical to `apps/backend/lib/cognito-auth.js`'s return shape so a
 * future server-side `/api/me` proxy can rely on the same field names
 * across the stack.
 */
export interface CognitoIdentity {
  cognitoSub: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
}

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * Pull the canonical identity fields from a verified claim set.
 *
 * Throws if `sub` is missing — Cognito ID tokens always carry it, so a
 * missing `sub` indicates either a wrong token type was sent through or
 * the verifier was bypassed. Both are bug-class failures, not user
 * failures, so we surface them as exceptions.
 */
export function extractCognitoIdentity(
  claims: Record<string, unknown> | null | undefined,
): CognitoIdentity {
  if (!claims || typeof claims !== "object") {
    throw new Error("Invalid Cognito claims")
  }
  const sub = claims.sub
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Cognito claims missing `sub`")
  }
  return {
    cognitoSub: sub,
    email: typeof claims.email === "string" ? claims.email : null,
    emailVerified: _coerceBoolean(claims.email_verified),
    displayName: _pickDisplayName(claims),
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function _pickDisplayName(claims: Record<string, unknown>): string | null {
  const candidates: Array<unknown> = [
    claims.name,
    _joinNameParts(claims.given_name, claims.family_name),
    claims["cognito:username"],
    claims.username,
  ]
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim().length > 0 &&
      !_isUuidLike(candidate.trim())
    ) {
      return candidate.trim()
    }
  }
  return null
}

/** Cognito uses UUID-v4 strings as internal usernames for email sign-up.
 *  Reject those so caregivers never see a raw UUID as their display name. */
function _isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function _joinNameParts(given: unknown, family: unknown): string | null {
  const left = typeof given === "string" ? given.trim() : ""
  const right = typeof family === "string" ? family.trim() : ""
  const joined = `${left} ${right}`.trim()
  return joined.length > 0 ? joined : null
}
