/**
 * Cognito auth parsing helpers.
 *
 * Keep this file free of I/O — it is imported by the Express middleware,
 * future background jobs, and unit tests, so it must be safe to import from
 * any context without side effects. The actual JWT signature verification
 * lives in `services/authService.js` (wraps `aws-jwt-verify`).
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Regex that matches the `Bearer <token>` header produced by the iOS client. */
const BEARER_PATTERN = /^Bearer\s+(.+)$/i

// ─── Token extraction ────────────────────────────────────────────────────────

/**
 * Pull the raw JWT out of an `Authorization: Bearer <token>` header.
 *
 * Returns `null` for missing or malformed headers so the caller can emit a
 * single 401 response instead of branching on several error shapes. We do not
 * attempt to parse the token here — the verifier owns all cryptographic
 * validation.
 */
export function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null
  const match = authorizationHeader.match(BEARER_PATTERN)
  if (!match) return null
  const token = match[1].trim()
  return token.length > 0 ? token : null
}

// ─── Issuer derivation ────────────────────────────────────────────────────────

/**
 * Build the expected Cognito issuer URL for a region + user-pool pair.
 *
 * The Cognito verifier uses this URL both as the JWKS host and as the `iss`
 * claim check, so we derive it in one place to guarantee both values stay in
 * sync. Throws on missing input so boot fails loudly rather than silently
 * accepting any issuer.
 */
export function buildCognitoIssuer(region, userPoolId) {
  if (!region || typeof region !== "string") {
    throw new Error("COGNITO_REGION is required")
  }
  if (!userPoolId || typeof userPoolId !== "string") {
    throw new Error("COGNITO_USER_POOL_ID is required")
  }
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
}

// ─── Claim extraction ────────────────────────────────────────────────────────

/**
 * Pull the minimal identity fields out of a verified Cognito claim set.
 *
 * `aws-jwt-verify` already enforced issuer / audience / signature before
 * this runs, so the only remaining work is to shape the claims into the
 * canonical fields the rest of the app uses. `sub` is required; the rest
 * are optional because ID tokens and access tokens expose different
 * subsets:
 *
 *   - ID tokens carry `email`, `email_verified`, `name`, `given_name`,
 *     `family_name`, and `cognito:username`.
 *   - Access tokens carry `username` / `cognito:username` only.
 *
 * `emailVerified` is normalised to a strict boolean — Cognito sometimes
 * serializes it as the string `"true"` / `"false"` depending on token
 * type, and we need a real boolean to land in the DB column. The
 * display-name fallback ladder mirrors what caregivers will see in the
 * iOS app: a configured `name` first, then `given_name + family_name`,
 * then the Cognito username as a last resort.
 */
export function extractIdentity(claims) {
  if (!claims || typeof claims !== "object") {
    throw new Error("Invalid Cognito claims")
  }
  const sub = claims.sub
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("Cognito claims missing `sub`")
  }
  const email = typeof claims.email === "string" ? claims.email : null
  const emailVerified = _coerceBoolean(claims.email_verified)
  const displayName = _pickDisplayName(claims)
  return { cognitoSub: sub, email, emailVerified, displayName }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _coerceBoolean(value) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function _pickDisplayName(claims) {
  const candidates = [
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

/** Cognito assigns UUID-v4 strings as internal usernames for email sign-up.
 *  Reject those so they are never stored as a caregiver's display name. */
function _isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function _joinNameParts(given, family) {
  const left = typeof given === "string" ? given.trim() : ""
  const right = typeof family === "string" ? family.trim() : ""
  const joined = `${left} ${right}`.trim()
  return joined.length > 0 ? joined : null
}
