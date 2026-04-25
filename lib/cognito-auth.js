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
 * `aws-jwt-verify` already enforced issuer / audience / signature before this
 * runs, so the only remaining work is to shape the claims into the canonical
 * fields the rest of the app uses. `sub` is required; everything else is
 * optional because ID tokens and access tokens expose different subsets.
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
  const name =
    typeof claims.name === "string" && claims.name.length > 0
      ? claims.name
      : typeof claims["cognito:username"] === "string"
        ? claims["cognito:username"]
        : null
  return { cognitoSub: sub, email, name }
}
