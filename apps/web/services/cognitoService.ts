/**
 * Cognito service — owns every outbound call to the Cognito Hosted UI
 * token endpoint and every ID-token verification.
 *
 * Layered between the route handlers (`app/api/auth/*`) and the pure
 * helpers in `lib/auth/cognito-config.ts`. Mirrors the reference
 * project's `services/sessionService.ts` shape: the route handler stays
 * tiny (parse → call service → respond) and every fetch / crypto call
 * lives here.
 *
 * PHI / token safety:
 *   - Token endpoint responses are NEVER logged. Failure logs include
 *     the HTTP status only.
 *   - ID tokens are verified via `aws-jwt-verify` (same library the
 *     backend uses) so we cannot get drift between web sign-in and
 *     backend request validation.
 *   - The verifier is module-scoped because `aws-jwt-verify` caches
 *     JWKS internally; constructing one per request would re-fetch
 *     the JWKS on every call.
 */

import "server-only"

import { CognitoJwtVerifier } from "aws-jwt-verify"
import {
  buildAuthorizeUrl,
  buildLogoutUrl,
  buildTokenEndpoint,
  loadCognitoConfig,
  type CognitoConfig,
} from "@/lib/auth/cognito-config"
import { extractCognitoIdentity, type CognitoIdentity } from "@/lib/auth/cognito-identity"

// ─── Module-scoped state ─────────────────────────────────────────────────────

let _config: CognitoConfig | null = null
let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The portion of a Cognito `/oauth2/token` response we actually use.
 *
 * We deliberately omit `access_token` (we forward the ID token to our
 * backend) and `token_type` (always "Bearer" in practice). Keeping the
 * surface narrow makes it harder to accidentally pipe a token field
 * we did not intend to a downstream caller.
 */
export interface CognitoTokenSet {
  idToken: string
  refreshToken: string | null
  /** Epoch seconds when the ID token expires — taken from the token's `exp`. */
  idTokenExpiresAt: number
  identity: CognitoIdentity
}

/** Raised by `exchangeCodeForTokens` / `refreshTokens` on Cognito errors. */
export class CognitoTokenError extends Error {
  readonly httpStatus: number
  constructor(httpStatus: number, message: string) {
    super(message)
    this.name = "CognitoTokenError"
    this.httpStatus = httpStatus
  }
}

/** Raised by `verifyIdToken` when `aws-jwt-verify` rejects the token. */
export class CognitoVerificationError extends Error {
  constructor(message = "Invalid ID token") {
    super(message)
    this.name = "CognitoVerificationError"
  }
}

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * Build the Hosted UI authorize URL for `/api/auth/login` to redirect to.
 *
 * Wraps `buildAuthorizeUrl` so route handlers do not need to know how
 * the config is loaded — they just hand off the freshly minted state.
 */
export function buildHostedUiUrl(state: string): string {
  return buildAuthorizeUrl(_loadConfig(), { state })
}

/**
 * Build the Hosted UI logout URL for `/api/auth/logout` to redirect to.
 */
export function buildHostedUiLogoutUrl(): string {
  return buildLogoutUrl(_loadConfig())
}

/**
 * Exchange an OAuth `code` for tokens at Cognito's `/oauth2/token`
 * endpoint and verify the returned ID token in one step.
 *
 * Returns the narrow `CognitoTokenSet` used to seed the session cookie.
 * Throws `CognitoTokenError` on a non-2xx token response and
 * `CognitoVerificationError` on a bad ID token. Never logs the token
 * body — only the status code on failure.
 */
export async function exchangeCodeForTokens(code: string): Promise<CognitoTokenSet> {
  const config = _loadConfig()
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
  })
  return _callTokenEndpoint(config, body)
}

/**
 * Mint a fresh ID token from a stored refresh token.
 *
 * Used by `apiClient` when the cached `idTokenExpiresAt` is within the
 * refresh leeway. Cognito does not always rotate the refresh token; the
 * caller MUST keep the previous refresh token if the response omits it.
 */
export async function refreshTokens(refreshToken: string): Promise<CognitoTokenSet> {
  const config = _loadConfig()
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.clientId,
    refresh_token: refreshToken,
  })
  const result = await _callTokenEndpoint(config, body)
  // Refresh-token grants frequently omit the refresh_token in the response.
  // Preserve the caller's existing refresh token in that case.
  if (!result.refreshToken) {
    return { ...result, refreshToken }
  }
  return result
}

/**
 * Verify a Cognito ID token via `aws-jwt-verify` and return the
 * canonical identity claims.
 *
 * Re-uses the verifier cached at module scope so JWKS fetches are
 * amortised across requests. Throws `CognitoVerificationError` on any
 * verification failure — we deliberately drop the underlying message
 * so a probing attacker cannot distinguish between expired, wrong
 * signature, and wrong audience.
 */
export async function verifyIdToken(idToken: string): Promise<{
  identity: CognitoIdentity
  /** Epoch seconds. */
  expiresAt: number
}> {
  const verifier = _loadVerifier()
  let claims: Record<string, unknown>
  try {
    claims = (await verifier.verify(idToken)) as Record<string, unknown>
  } catch (e) {
    console.error("[auth] ID token verification failed", _safeMessage(e))
    throw new CognitoVerificationError()
  }
  const identity = extractCognitoIdentity(claims)
  const expiresAt = typeof claims.exp === "number" ? claims.exp : 0
  if (expiresAt <= 0) {
    throw new CognitoVerificationError("ID token missing exp")
  }
  return { identity, expiresAt }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _loadConfig(): CognitoConfig {
  if (_config) return _config
  _config = loadCognitoConfig(process.env)
  return _config
}

function _loadVerifier(): ReturnType<typeof CognitoJwtVerifier.create> {
  if (_verifier) return _verifier
  const config = _loadConfig()
  _verifier = CognitoJwtVerifier.create({
    userPoolId: config.userPoolId,
    tokenUse: "id",
    clientId: config.clientId,
  })
  return _verifier
}

async function _callTokenEndpoint(
  config: CognitoConfig,
  body: URLSearchParams,
): Promise<CognitoTokenSet> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  }
  if (config.clientSecret) {
    headers.Authorization = `Basic ${_basicAuth(config.clientId, config.clientSecret)}`
  }
  let response: Response
  try {
    response = await fetch(buildTokenEndpoint(config), {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    })
  } catch (e) {
    console.error("[auth] token endpoint network error", _safeMessage(e))
    throw new CognitoTokenError(502, "Cognito token endpoint unreachable")
  }
  if (!response.ok) {
    // Body intentionally NOT logged — Cognito error bodies sometimes echo
    // the request body, which would log the code or refresh token.
    console.error("[auth] token endpoint returned", response.status)
    throw new CognitoTokenError(response.status, "Cognito token exchange failed")
  }
  let payload: { id_token?: string; refresh_token?: string }
  try {
    payload = await response.json()
  } catch (e) {
    console.error("[auth] token endpoint returned non-JSON", _safeMessage(e))
    throw new CognitoTokenError(502, "Invalid Cognito token response")
  }
  if (!payload.id_token || typeof payload.id_token !== "string") {
    throw new CognitoTokenError(502, "Cognito response missing id_token")
  }
  const verified = await verifyIdToken(payload.id_token)
  return {
    idToken: payload.id_token,
    refreshToken:
      typeof payload.refresh_token === "string" && payload.refresh_token.length > 0
        ? payload.refresh_token
        : null,
    idTokenExpiresAt: verified.expiresAt,
    identity: verified.identity,
  }
}

function _basicAuth(clientId: string, clientSecret: string): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
}

function _safeMessage(e: unknown): string {
  // Truncate so a verifier message that accidentally includes a token
  // fragment cannot leak in full. 120 chars covers typical
  // aws-jwt-verify messages without exposing serialized JWTs.
  const raw = e instanceof Error ? e.message : String(e)
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
}
