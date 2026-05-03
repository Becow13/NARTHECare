/**
 * Session service — owns every WRITE to the iron-session cookie.
 *
 * Mirrors the layered shape of the reference project's
 * `services/sessionService.ts`: route handlers parse + validate the
 * inbound request, then hand off to a service function whose name
 * states the intent (`createSessionFromTokens`, `clearSession`).
 *
 * `lib/auth/session.ts` owns READS (`getSession`, `getSessionUser`).
 * Splitting reads from writes keeps Server Components — which can call
 * read helpers freely but cannot write cookies — from accidentally
 * importing a write path.
 */

import "server-only"

import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import {
  buildSessionOptions,
  OAUTH_STATE_COOKIE_NAME,
  type SessionData,
} from "@/lib/auth/session-cookie"
import type { CognitoTokenSet } from "./cognitoService"
import { DEV_MOCK_USER } from "@/lib/auth/dev-bypass"

// ─── Constants ────────────────────────────────────────────────────────────────

/** OAuth `state` cookie lifetime — 10 minutes is plenty for a Hosted UI round-trip. */
const STATE_COOKIE_TTL_SECONDS = 60 * 10

/**
 * If the ID token expires within this window the apiClient transparently
 * refreshes before sending the request. 60 seconds covers normal clock
 * skew without forcing a refresh on every call.
 */
export const REFRESH_LEEWAY_SECONDS = 60

// ─── Public surface — session writes ────────────────────────────────────────

/**
 * Seed the session cookie from a freshly-verified Cognito token set.
 *
 * Called from `/api/auth/callback` after `cognitoService.exchangeCodeForTokens`
 * succeeds. Overwrites any existing session: a successful sign-in is
 * always treated as a new session boundary, even if a stale cookie
 * survived from a previous account.
 *
 * The ID token is intentionally NOT stored in the cookie — see the
 * size comment in `lib/auth/session-cookie.ts`. `apiClient` mints a
 * fresh ID token from the refresh token on demand.
 */
export async function createSessionFromTokens(tokens: CognitoTokenSet): Promise<void> {
  const session = await _openSession()
  session.__keep__ = true
  session.user = {
    cognitoSub: tokens.identity.cognitoSub,
    email: tokens.identity.email,
    emailVerified: tokens.identity.emailVerified,
    displayName: tokens.identity.displayName,
  }
  session.refreshToken = tokens.refreshToken ?? undefined
  session.idTokenExpiresAt = tokens.idTokenExpiresAt
  await session.save()
}

/**
 * Persist a rotated refresh token / new ID-token expiry after a silent
 * refresh.
 *
 * Called from `services/apiClient.ts` after `cognitoService.refreshTokens`
 * returns. Does NOT change `user` — the verified identity must stay
 * stable across refreshes — and does NOT store the ID token (see the
 * size comment in `lib/auth/session-cookie.ts`).
 */
export async function rotateSessionTokens(input: {
  idTokenExpiresAt: number
  refreshToken: string | null
}): Promise<void> {
  const session = await _openSession()
  if (!session.user) {
    throw new Error("Cannot rotate tokens on an unauthenticated session")
  }
  session.idTokenExpiresAt = input.idTokenExpiresAt
  if (input.refreshToken) {
    session.refreshToken = input.refreshToken
  }
  await session.save()
}

/**
 * Align `session.user.displayName` with the canonical `users.display_name`
 * row after `PATCH /api/me` succeeds.
 *
 * `createSessionFromTokens` seeds `displayName` from Cognito claims, but
 * the caregiver-editable name lives in PostgreSQL and can diverge. The
 * app shell (`app/(app)/layout.tsx`) reads only the sealed cookie, so
 * without this write the sidebar would stay on the stale Cognito value
 * until the next full sign-in.
 */
export async function updateSessionUserDisplayName(
  displayName: string | null,
): Promise<void> {
  const session = await _openSession()
  if (!session.user) {
    throw new Error("Cannot update session user on an unauthenticated session")
  }
  session.user.displayName = displayName
  await session.save()
}

/**
 * Destroy the session cookie.
 *
 * Called from `/api/auth/logout` BEFORE redirecting to Cognito's
 * `/logout` so even if the Cognito-side logout fails (network error,
 * tampered config) the local cookie is still gone — the worst case is
 * a stale Cognito session, not a stale local session.
 */
export async function clearSession(): Promise<void> {
  const session = await _openSession()
  session.destroy()
}

/**
 * Seed a session for the dev-bypass user.
 *
 * Called from `/api/auth/login` ONLY when `isDevAuthBypassEnabled`
 * returns true. Writes a session that is shape-identical to a real
 * sign-in (same `SessionUser` fields populated) but stores no tokens —
 * the apiClient short-circuits the bearer header in dev-bypass mode.
 *
 * TODO(cognito): delete when DEV_AUTH_BYPASS retires.
 */
export async function createDevBypassSession(): Promise<void> {
  const session = await _openSession()
  session.__keep__ = true
  session.user = { ...DEV_MOCK_USER }
  session.refreshToken = undefined
  session.idTokenExpiresAt = undefined
  await session.save()
}

// ─── Public surface — OAuth state cookie ────────────────────────────────────

/**
 * Persist the OAuth `state` nonce in a short-lived httpOnly cookie so
 * `/api/auth/callback` can verify the round-trip and reject CSRF.
 */
export function setOAuthStateCookie(state: string): void {
  cookies().set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_COOKIE_TTL_SECONDS,
  })
}

/**
 * Read and clear the OAuth `state` cookie in one step.
 *
 * Returning the value AND clearing it inside one call ensures the state
 * cannot be replayed against a second callback — even if the second
 * callback request races the first.
 */
export function consumeOAuthStateCookie(): string | null {
  const jar = cookies()
  const value = jar.get(OAUTH_STATE_COOKIE_NAME)?.value ?? null
  if (value !== null) jar.delete(OAUTH_STATE_COOKIE_NAME)
  return value
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function _openSession() {
  const options = buildSessionOptions({
    password: process.env.SESSION_COOKIE_SECRET,
    nodeEnv: process.env.NODE_ENV,
  })
  return getIronSession<SessionData>(cookies(), options)
}
