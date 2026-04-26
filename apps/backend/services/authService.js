import { CognitoJwtVerifier } from "aws-jwt-verify"
import { buildCognitoIssuer, extractIdentity } from "../lib/cognito-auth.js"
import { DEV_MOCK_USER } from "../lib/dev-auth.js"
import { IdentityEmailConflictError } from "../lib/identity-errors.js"
import { isUsersEmailUniqueViolation } from "../lib/pg-errors.js"
import {
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
  extractRequestContext,
} from "../lib/audit.js"
import {
  upsertUserByCognitoSub,
  updateLastLoginAt,
  ensureUserSchema,
  fetchUserIdentityKeysByEmail,
  repointCognitoSubForVerifiedEmailMerge,
} from "./dao/userDao.js"
import { logAction } from "./auditService.js"

/**
 * Build a Cognito JWT verifier configured for this deployment.
 *
 * Returns an object with a single `verify(token)` method that resolves with
 * the verified claims or throws on any failure (bad signature, expired,
 * wrong issuer, wrong audience, wrong token_use). The underlying verifier
 * caches JWKS across calls so steady-state requests do not round-trip to
 * Cognito. Exported as a factory so tests can swap in a fake verifier by
 * constructing their own object with the same shape.
 *
 * `tokenUse` defaults to `id` because the iOS client persists the ID token
 * (it is the only one that carries `email` / `email_verified` / `name`,
 * which the `/api/me` upsert needs to populate the `users` row). Switch to
 * `access` for service-to-service callers that send the access token.
 */
export function createCognitoVerifier({ region, userPoolId, clientId, tokenUse }) {
  const issuer = buildCognitoIssuer(region, userPoolId)
  if (!clientId) {
    throw new Error("COGNITO_CLIENT_ID is required")
  }
  const verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: tokenUse ?? "id",
    clientId,
  })
  return {
    issuer,
    async verify(token) {
      return verifier.verify(token)
    },
  }
}

/**
 * Upsert an internal `users` row from a verified Cognito claim set and
 * return the canonical internal identity.
 *
 * This is the single boundary between the external Cognito identity and the
 * internal `users.id` UUID — every downstream table references the internal
 * id so Cognito details never leak beyond this function.
 *
 * `email` is intentionally allowed to be null: access tokens do not carry
 * it, and the `users` table now permits NULL emails. Route handlers that
 * require an email (e.g. `/api/me`, which is the source of truth for
 * caregiver profile data) should reject the request themselves so the
 * 401 surfaces with a clear message instead of a NOT NULL violation.
 *
 * `last_login_at` is intentionally NOT touched here — the middleware runs
 * on every authenticated request, and stamping it here would erase the
 * "last actual sign-in" signal. `/api/me` calls `recordLogin` directly.
 *
 * When `options.req` is present and a verified-email merge of Cognito
 * identities occurs (same email, new `sub`), an audit row is written with
 * request-derived IP and User-Agent. Omit `req` in tests that only need the
 * DB row without audit side effects.
 *
 * @param {import("pg").Pool} pool
 * @param {Record<string, unknown>} claims Verified Cognito JWT payload
 * @param {{ req?: import("express").Request }} [options]
 */
export async function findOrCreateUserFromCognitoClaims(pool, claims, options) {
  const identity = extractIdentity(claims)
  try {
    return await upsertUserByCognitoSub(pool, identity)
  } catch (e) {
    if (!isUsersEmailUniqueViolation(e) || !identity.email) throw e
    const keys = await fetchUserIdentityKeysByEmail(pool, identity.email)
    if (keys.length !== 1) throw e
    const existing = keys[0]
    if (existing.cognito_sub === identity.cognitoSub) {
      return await upsertUserByCognitoSub(pool, identity)
    }
    if (!identity.emailVerified) {
      throw new IdentityEmailConflictError()
    }
    const merged = await repointCognitoSubForVerifiedEmailMerge(pool, {
      userId: existing.id,
      previousCognitoSub: existing.cognito_sub,
      nextCognitoSub: identity.cognitoSub,
      emailVerified: identity.emailVerified,
      displayName: identity.displayName ?? null,
    })
    if (!merged) throw e
    const req = options?.req
    if (req) {
      const { ipAddress, userAgent } = extractRequestContext(req)
      await logAction(pool, {
        actorUserId: merged.id,
        action: AUDIT_ACTIONS.mergeCognitoIdentity,
        resourceType: AUDIT_RESOURCE_TYPES.user,
        resourceId: merged.id,
        metadata: { reason: "verified_email_duplicate_cognito_sub" },
        ipAddress,
        userAgent,
      })
    }
    return merged
  }
}

/**
 * Stamp `last_login_at = NOW()` on the user and return the refreshed row.
 *
 * Called from the `/api/me` route after the middleware has already
 * upserted the user, so the column reflects "last completed Cognito
 * sign-in" rather than "last authenticated request". Returns `null` if
 * the user id no longer exists (e.g. it was deleted between requests),
 * which the caller can map to a 401.
 */
export async function recordLogin(pool, userId) {
  return updateLastLoginAt(pool, userId)
}

/**
 * Idempotently upsert the dev-bypass user row and return its canonical
 * internal identity.
 *
 * Called from the server bootstrap only when `DEV_AUTH_BYPASS` is active
 * (see `lib/dev-auth.js`). The upsert keys on the stable `dev-bypass`
 * `cognito_sub` sentinel so every boot reuses the same `users.id`,
 * which keeps existing `care_team_members` / `audit_logs` FKs pointing
 * at the same row across restarts.
 *
 * TODO(cognito): remove this once `DEV_AUTH_BYPASS` is retired — real
 * users should only ever land in the `users` table via
 * `findOrCreateUserFromCognitoClaims`.
 */
export async function ensureDevUser(pool) {
  return upsertUserByCognitoSub(pool, {
    cognitoSub: DEV_MOCK_USER.cognitoSub,
    email: DEV_MOCK_USER.email,
    emailVerified: DEV_MOCK_USER.emailVerified,
    displayName: DEV_MOCK_USER.displayName,
  })
}

/**
 * Run the idempotent schema migration for the `users` table.
 * Called once at server boot — re-exported from the service layer so the
 * bootstrap code has a single import surface per feature.
 */
export async function ensureSchema(pool) {
  return ensureUserSchema(pool)
}
