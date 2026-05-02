/**
 * Cognito Hosted-UI configuration helpers (pure, no I/O).
 *
 * Mirrors `apps/backend/lib/cognito-auth.js` so the issuer / region / user
 * pool are derived in one place across the stack — both apps therefore
 * agree on which Cognito identity is canonical and the backend's JWT
 * verifier can validate exactly the tokens the web app exchanged for.
 *
 * The web app talks to two Cognito surfaces:
 *
 *   1. Hosted UI  (`https://<COGNITO_DOMAIN>/oauth2/authorize`)
 *      — browser-redirect login.
 *   2. Token endpoint (`https://<COGNITO_DOMAIN>/oauth2/token`)
 *      — server-to-server code exchange + refresh.
 *
 * Both URLs are derived from `COGNITO_DOMAIN`, so the rest of the app can
 * hand off to `buildAuthorizeUrl` / `buildTokenEndpoint` without learning
 * the URL shape. Throws on any missing input so a misconfigured deploy
 * crashes at the first auth call instead of silently sending requests to
 * an empty host.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** OAuth scopes Cognito returns for every login. `openid` is mandatory for an
 *  ID token; `email` + `profile` populate the sidebar / settings without a
 *  second user-info call. */
const DEFAULT_SCOPES = "openid email profile" as const

/** Cognito Hosted-UI uses standard Authorization Code flow over GET. */
const AUTHORIZE_PATH = "/oauth2/authorize" as const
const TOKEN_PATH = "/oauth2/token" as const
const LOGOUT_PATH = "/logout" as const

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of the env-derived Cognito config we hand to the service layer.
 *
 * `clientSecret` is intentionally optional — public Cognito App Clients
 * have no secret and the token endpoint is called without a Basic auth
 * header. Confidential clients (recommended for server-side flows) set
 * the secret; we then send `Authorization: Basic base64(clientId:secret)`.
 */
export interface CognitoConfig {
  region: string
  userPoolId: string
  clientId: string
  clientSecret: string | null
  domain: string
  scopes: string
  appBaseUrl: string
  /** Resolved at construction so `aws-jwt-verify` and the Hosted UI agree. */
  issuer: string
  /** Final OAuth `redirect_uri` registered on the Cognito App Client. */
  redirectUri: string
  /** Final post-logout `logout_uri` registered on the Cognito App Client. */
  postLogoutRedirectUri: string
}

// ─── Issuer + redirect derivation ────────────────────────────────────────────

/**
 * Build the canonical Cognito issuer URL for a region + pool.
 *
 * Mirrors `apps/backend/lib/cognito-auth.js#buildCognitoIssuer` so both
 * apps' verifiers compare the `iss` claim against the same string.
 */
export function buildCognitoIssuer(region: string, userPoolId: string): string {
  if (!region) throw new Error("COGNITO_REGION is required")
  if (!userPoolId) throw new Error("COGNITO_USER_POOL_ID is required")
  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
}

/**
 * Compose the OAuth redirect URI from the app's base URL.
 *
 * Centralised so the value sent in `/api/auth/login` matches the value
 * sent in `/api/auth/callback` exactly — Cognito rejects the token
 * exchange if the `redirect_uri` on the second call does not match the
 * `redirect_uri` on the first call byte-for-byte.
 */
export function buildRedirectUri(appBaseUrl: string): string {
  return `${_trimTrailingSlash(appBaseUrl)}/api/auth/callback`
}

/**
 * Compose the post-logout redirect URI sent to Cognito's `/logout` endpoint.
 *
 * Cognito only accepts URIs registered on the App Client's "Sign-out URLs"
 * list, so this value MUST be added there for production sign-out to work.
 */
export function buildPostLogoutRedirectUri(appBaseUrl: string): string {
  return `${_trimTrailingSlash(appBaseUrl)}/auth/sign-in`
}

// ─── Env loader ───────────────────────────────────────────────────────────────

/**
 * Read the Cognito config from a record-like env source, validate it, and
 * resolve all derived URLs in one pass.
 *
 * Pass `process.env` in real callers, or a fixture object in tests — the
 * function is pure (no `process.env` access) so it can be exercised
 * without env-mutation hacks. Throws with a precise message naming the
 * missing variable so misconfigured deploys surface in boot logs rather
 * than as a generic 500 on the first sign-in attempt.
 */
export function loadCognitoConfig(
  env: Record<string, string | undefined>,
): CognitoConfig {
  const missing: string[] = []
  const region = env.COGNITO_REGION?.trim() ?? ""
  const userPoolId = env.COGNITO_USER_POOL_ID?.trim() ?? ""
  const clientId = env.COGNITO_CLIENT_ID?.trim() ?? ""
  const domain = env.COGNITO_DOMAIN?.trim() ?? ""
  const appBaseUrl = env.APP_BASE_URL?.trim() ?? ""

  if (!region) missing.push("COGNITO_REGION")
  if (!userPoolId) missing.push("COGNITO_USER_POOL_ID")
  if (!clientId) missing.push("COGNITO_CLIENT_ID")
  if (!domain) missing.push("COGNITO_DOMAIN")
  if (!appBaseUrl) missing.push("APP_BASE_URL")
  if (missing.length > 0) {
    throw new Error(
      `Cognito configuration missing: ${missing.join(", ")}`,
    )
  }

  const clientSecretRaw = env.COGNITO_CLIENT_SECRET?.trim() ?? ""
  const scopesRaw = env.COGNITO_SCOPES?.trim()
  return {
    region,
    userPoolId,
    clientId,
    clientSecret: clientSecretRaw.length > 0 ? clientSecretRaw : null,
    domain: _normaliseDomain(domain),
    scopes: scopesRaw && scopesRaw.length > 0 ? scopesRaw : DEFAULT_SCOPES,
    appBaseUrl: _trimTrailingSlash(appBaseUrl),
    issuer: buildCognitoIssuer(region, userPoolId),
    redirectUri: buildRedirectUri(appBaseUrl),
    postLogoutRedirectUri: buildPostLogoutRedirectUri(appBaseUrl),
  }
}

// ─── URL builders (Hosted UI) ────────────────────────────────────────────────

/**
 * Build the Cognito Hosted UI `/oauth2/authorize` URL the browser is
 * redirected to from `/api/auth/login`.
 *
 * The caller MUST generate `state` with a CSPRNG and persist it in a
 * temporary cookie so `/api/auth/callback` can verify the round-trip.
 * Cognito echoes `state` back unchanged.
 */
export function buildAuthorizeUrl(
  config: CognitoConfig,
  params: { state: string },
): string {
  const url = new URL(`https://${config.domain}${AUTHORIZE_PATH}`)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", config.scopes)
  url.searchParams.set("redirect_uri", config.redirectUri)
  url.searchParams.set("state", params.state)
  return url.toString()
}

/**
 * The Cognito token endpoint — POST target for code exchange and refresh.
 *
 * Returned as a string (not a `URL`) because `fetch` accepts either and
 * `URL` instances have caused subtle bugs when callers append a body.
 */
export function buildTokenEndpoint(config: CognitoConfig): string {
  return `https://${config.domain}${TOKEN_PATH}`
}

/**
 * Build the Cognito Hosted UI `/logout` URL the browser is redirected to
 * after `/api/auth/logout` clears the local cookie.
 *
 * `logout_uri` MUST be on the App Client's "Sign-out URLs" allow-list or
 * Cognito returns 400. We compute it with `buildPostLogoutRedirectUri`
 * so the registered value and the runtime value cannot drift.
 */
export function buildLogoutUrl(config: CognitoConfig): string {
  const url = new URL(`https://${config.domain}${LOGOUT_PATH}`)
  url.searchParams.set("client_id", config.clientId)
  url.searchParams.set("logout_uri", config.postLogoutRedirectUri)
  return url.toString()
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _normaliseDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
}

function _trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "")
}
