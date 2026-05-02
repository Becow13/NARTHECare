/**
 * Session cookie shape + iron-session config.
 *
 * The web app stores the entire post-Cognito identity in ONE sealed
 * httpOnly cookie. iron-session handles encryption + signing with a
 * server-only password (`SESSION_COOKIE_SECRET`); the browser never
 * sees the contents and JavaScript on the page cannot read it.
 *
 * What we deliberately store and why:
 *
 *   - `user`              — the minimal subset of verified Cognito claims
 *                           the UI needs (display name in the sidebar,
 *                           email on `/settings`). NEVER contains tokens.
 *   - `refreshToken`      — used server-side (only) to mint a fresh ID
 *                           token when `apiClient` needs to call the
 *                           backend. Never sent to the browser.
 *   - `idTokenExpiresAt`  — epoch seconds (Cognito's `exp` from the LAST
 *                           minted ID token) so apiClient can decide
 *                           whether to use a cached token or refresh.
 *
 * What we deliberately DO NOT store:
 *
 *   - Cognito ID token. Cognito ID tokens (~2 KB) plus the refresh
 *     token (~1 KB) plus iron-session encryption overhead push the
 *     sealed cookie past the 4 KB browser limit, and iron-session v8
 *     does not auto-chunk. Instead, `services/apiClient.ts` mints a
 *     fresh ID token from the refresh token on demand and caches it
 *     in module-scope memory keyed by `cognitoSub` for the token's
 *     lifetime. The trade-off: a cold server pays one extra Cognito
 *     refresh per process. The win: cookie stays under 2 KB sealed.
 *   - Cognito access token. We forward the ID token to our backend; no
 *     other audience needs the access token.
 *   - Email when not present in the claim set (access tokens and some
 *     pool configs omit it). The shape below allows null.
 *   - Anything PHI (vitals, names of care recipients, AI text).
 */

import type { SessionOptions } from "iron-session"

// ─── Constants ────────────────────────────────────────────────────────────────

/** Cookie name. Prefix `__nc_` so dev tools group all NARTHECare cookies. */
export const SESSION_COOKIE_NAME = "__nc_session" as const

/** Cookie name for the temporary OAuth `state` round-trip. */
export const OAUTH_STATE_COOKIE_NAME = "__nc_oauth_state" as const

/**
 * Minimum length for `SESSION_COOKIE_SECRET`. iron-session derives the
 * encryption + signing keys from this value, so a short password
 * weakens both. 32 chars matches the iron-session minimum and the
 * reference project's session secret length.
 */
export const SESSION_COOKIE_SECRET_MIN_LENGTH = 32

/** Eight hours mirrors the Cognito ID-token max lifetime we expect to mint. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The minimal verified Cognito identity exposed to UI components.
 *
 * Mirrors `apps/backend/lib/cognito-auth.js#extractIdentity` so a future
 * `/api/me` proxy (Phase 3) can map a server-fetched user row onto the
 * same shape and the sidebar / settings page do not need to branch.
 */
export interface SessionUser {
  cognitoSub: string
  email: string | null
  emailVerified: boolean
  displayName: string | null
}

/**
 * The full sealed cookie payload — only ever touched server-side.
 *
 * `__keep__` is a defensive sentinel so iron-session always considers
 * the cookie "non-empty" once seeded, even if every other field were
 * cleared. Without it `getIronSession` returns `{}` (which the auth
 * checks would treat as "no session") for a still-sealed but
 * empty-on-paper payload — a subtle race we have hit on rotation.
 */
export interface SessionData {
  __keep__?: true
  user?: SessionUser
  refreshToken?: string
  /** Epoch seconds — `exp` from the LAST minted ID token. */
  idTokenExpiresAt?: number
}

// ─── Config builder ──────────────────────────────────────────────────────────

/**
 * Build the iron-session config object from the runtime env.
 *
 * Pure: takes env-shaped input and returns a config; no `process.env`
 * access here. Throws on a too-short / missing password so a
 * misconfigured deploy crashes at the first request rather than
 * silently signing cookies with an empty key.
 *
 * `cookieOptions.secure` is always true in production. We do NOT toggle
 * `sameSite: "lax"` to `"strict"` because Cognito Hosted UI redirects
 * back from a different host (`<prefix>.auth.<region>.amazoncognito.com`)
 * and `strict` would drop the cookie on that final navigation.
 */
export function buildSessionOptions(input: {
  password: string | undefined
  nodeEnv: string | undefined
}): SessionOptions {
  const password = input.password ?? ""
  if (password.length < SESSION_COOKIE_SECRET_MIN_LENGTH) {
    throw new Error(
      `SESSION_COOKIE_SECRET must be at least ${SESSION_COOKIE_SECRET_MIN_LENGTH} characters`,
    )
  }
  const isProd = input.nodeEnv === "production"
  return {
    cookieName: SESSION_COOKIE_NAME,
    password,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Type guard so `getSession()` callers can branch on "session has a
 * verified user" vs "freshly-issued empty cookie" without poking at
 * iron-session internals.
 */
export function hasSessionUser(
  session: SessionData,
): session is SessionData & { user: SessionUser } {
  return Boolean(session.user && session.user.cognitoSub)
}
