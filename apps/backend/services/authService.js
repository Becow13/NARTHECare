import { CognitoJwtVerifier } from "aws-jwt-verify"
import { buildCognitoIssuer, extractIdentity } from "../lib/cognito-auth.js"
import { DEV_MOCK_USER } from "../lib/dev-auth.js"
import { upsertUserByCognitoSub, ensureUserSchema } from "./dao/userDao.js"

/**
 * Build a Cognito JWT verifier configured for this deployment.
 *
 * Returns an object with a single `verify(token)` method that resolves with
 * the verified claims or throws on any failure (bad signature, expired,
 * wrong issuer, wrong audience, wrong token_use). The underlying verifier
 * caches JWKS across calls so steady-state requests do not round-trip to
 * Cognito. Exported as a factory so tests can swap in a fake verifier by
 * constructing their own object with the same shape.
 */
export function createCognitoVerifier({ region, userPoolId, clientId, tokenUse }) {
  const issuer = buildCognitoIssuer(region, userPoolId)
  if (!clientId) {
    throw new Error("COGNITO_CLIENT_ID is required")
  }
  const verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: tokenUse ?? "access",
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
 * return the canonical internal identity (`id`, `cognito_sub`, `email`,
 * `name`).
 *
 * This is the single boundary between the external Cognito identity and the
 * internal `users.id` UUID — every downstream table references the internal
 * id so Cognito details never leak beyond this function.
 */
export async function findOrCreateUserFromCognitoClaims(pool, claims) {
  const { cognitoSub, email, name } = extractIdentity(claims)
  if (!email) {
    // Email is required by the DB schema. Access tokens do not carry email,
    // so this surfaces as a clear 401 upstream rather than a Postgres
    // NOT NULL violation.
    throw new Error("Cognito claims missing `email` — is the app using an ID token?")
  }
  return upsertUserByCognitoSub(pool, { cognitoSub, email, name })
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
    name: DEV_MOCK_USER.name,
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
