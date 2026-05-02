/**
 * Server-side session accessors.
 *
 * Mirrors the reference project's `lib/auth.ts` (`getAuthUser`) — a
 * single source of truth for "is the request authenticated?" used by
 * Server Components, route handlers, and middleware-friendly utilities
 * alike.
 *
 * Marked `import "server-only"` so any accidental import from a Client
 * Component fails the Next.js build. The session cookie holds the
 * Cognito ID token + refresh token; reaching for it from the browser
 * would defeat the whole httpOnly design.
 *
 * Outside callers should use `getSession()` (read) and the explicit
 * mutators in `services/sessionService.ts` (write). Do not write to the
 * raw iron-session object from a Server Component — Next.js forbids
 * cookie writes from Server Components and we want a single audited
 * write path.
 */

import "server-only"

import { cookies } from "next/headers"
import { getIronSession } from "iron-session"
import {
  buildSessionOptions,
  hasSessionUser,
  type SessionData,
  type SessionUser,
} from "./session-cookie"

// ─── Public read API ─────────────────────────────────────────────────────────

/**
 * Resolve the active session for the current request.
 *
 * Returns `{ user: null }` when the cookie is missing, expired, or
 * post-tamper-detection iron-session refused to deserialize it. Callers
 * SHOULD treat this exactly the same as "not signed in" — never branch
 * on the underlying error.
 *
 * Read-only. Do NOT mutate the returned `session` object directly:
 * iron-session writes back when you call `session.save()`, but Next.js
 * forbids cookie writes from Server Components. Use
 * `services/sessionService.ts` for mutations.
 */
export async function getSession(): Promise<{
  user: SessionUser | null
  /** Raw payload for the apiClient — never expose to UI components. */
  raw: SessionData
}> {
  const session = await _readSession()
  if (!hasSessionUser(session)) {
    return { user: null, raw: session }
  }
  return { user: session.user, raw: session }
}

/**
 * Convenience wrapper for Server Components / sidebar that only need
 * the user identity. Returns `null` when not signed in so JSX can do
 * `user?.displayName ?? "Caregiver"` without first destructuring.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { user } = await getSession()
  return user
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function _readSession(): Promise<SessionData> {
  // Defer env reads to call time so unit tests can override `process.env`
  // without re-importing the module.
  const options = buildSessionOptions({
    password: process.env.SESSION_COOKIE_SECRET,
    nodeEnv: process.env.NODE_ENV,
  })
  return getIronSession<SessionData>(cookies(), options)
}
