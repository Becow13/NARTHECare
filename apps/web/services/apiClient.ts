/**
 * Server-side API client — talks to the NARTHECare backend with the
 * caregiver's verified Cognito ID token.
 *
 * Mirrors the reference project's `services/apiClient.ts`, with two
 * NARTHECare-specific constraints:
 *
 *   1. Server-side only. We forward the ID token from the sealed
 *      session cookie; the browser must never see it. Marked
 *      `import "server-only"` so a Client Component import fails the
 *      Next.js build.
 *
 *   2. PHI-safe logging. Bodies (request and response) are NEVER
 *      logged. Failure logs include the HTTP method, the path, and the
 *      status code only — no headers, no payloads, no path params that
 *      might be PHI-shaped.
 *
 * Phase 3 calls these primitives from Route Handlers under `/api/data/**`.
 * Do NOT invoke them from Server Components when the session might need a
 * Cognito silent refresh — `rotateSessionTokens` writes to the sealed cookie,
 * which Next.js only permits inside Route Handlers / Server Actions (never
 * during an RSC render). Browser `fetch("/api/data/…")` reaches handlers that
 * may refresh safely.
 */

import "server-only"

import { getSession } from "@/lib/auth/session"
import { rotateSessionTokens, REFRESH_LEEWAY_SECONDS } from "./sessionService"
import { refreshTokens } from "./cognitoService"

// ─── Constants ────────────────────────────────────────────────────────────────

/** Longest a backend response is allowed to take before we abort. */
const REQUEST_TIMEOUT_MS = 15_000

// ─── Per-process ID-token cache ─────────────────────────────────────────────

/**
 * In-memory cache of the most recent ID token for each Cognito user.
 *
 * The session cookie holds only the refresh token (Cognito ID tokens are
 * too large to fit alongside it in a single sealed cookie — see
 * `lib/auth/session-cookie.ts`). Without this cache every backend call
 * would round-trip to Cognito's `/oauth2/token` first. We cache the
 * minted ID token until it is within `REFRESH_LEEWAY_SECONDS` of expiry,
 * keyed by the verified `cognitoSub` so two users on the same instance
 * cannot collide.
 *
 * Process-local on purpose: the cache survives across requests within
 * one Next.js process, falls back to a refresh on cold starts or
 * additional instances, and never leaves memory. Trade-off accepted.
 */
const _idTokenCache = new Map<string, { idToken: string; expiresAt: number }>()

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Strongly-typed error thrown for any non-2xx backend response.
 *
 * Carries the HTTP status so route handlers can decide whether to map
 * to a user-visible "Unable to complete request" page vs a redirect to
 * `/auth/sign-in` (401). Does NOT carry the response body — backend
 * messages may name the resource and we treat that as PHI-adjacent.
 */
export class ApiClientError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
  }
}

/** Returned when the session cookie is missing the bearer token. */
export class ApiClientUnauthenticatedError extends ApiClientError {
  constructor() {
    super(401, "No authenticated session")
    this.name = "ApiClientUnauthenticatedError"
  }
}

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * GET `<NARTHECARE_API_BASE_URL><path>` and parse the response as JSON.
 *
 * The backend's `requireCognitoUser` middleware reads the ID token off
 * `Authorization: Bearer …`, so we forward whatever ID token is on the
 * caller's session — refreshing first if it is within the leeway. A
 * fresh refresh is written back to the session cookie so the next
 * request reuses it.
 */
export async function getJson<T>(path: string): Promise<T> {
  return _request<T>("GET", path, undefined)
}

/**
 * POST a JSON body and parse the JSON response.
 */
export async function postJson<TResponse, TBody = unknown>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  return _request<TResponse>("POST", path, body)
}

// ─── Internal ────────────────────────────────────────────────────────────────

async function _request<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
): Promise<T> {
  const baseUrl = process.env.NARTHECARE_API_BASE_URL
  if (!baseUrl) {
    throw new Error("NARTHECARE_API_BASE_URL is required for backend calls")
  }
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`
  const idToken = await _resolveIdToken()
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${idToken}`,
  }
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
  } catch (e) {
    // Body-free log — never include `e` directly because the abort error's
    // message can include the URL with PHI-shaped path params.
    console.error("[apiClient] network error", method, path)
    throw new ApiClientError(502, "Backend unreachable")
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401) {
    throw new ApiClientUnauthenticatedError()
  }
  if (!response.ok) {
    console.error("[apiClient] non-2xx", method, path, response.status)
    throw new ApiClientError(response.status, "Backend request failed")
  }
  try {
    return (await response.json()) as T
  } catch (e) {
    console.error("[apiClient] invalid JSON", method, path)
    throw new ApiClientError(502, "Backend returned invalid JSON")
  }
}

/**
 * Resolve a usable ID token for the current session.
 *
 * Reads the verified identity off the session cookie, then either
 * returns the cached ID token (still fresh) or mints a new one via the
 * stored refresh token. The freshly minted token is parked in
 * `_idTokenCache` for the next request. Throws
 * `ApiClientUnauthenticatedError` if the session is missing entirely
 * or carries no refresh token (e.g. dev-bypass sessions, which should
 * never be hitting the real backend).
 */
async function _resolveIdToken(): Promise<string> {
  const { user, raw } = await getSession()
  if (!user || !raw.refreshToken) {
    throw new ApiClientUnauthenticatedError()
  }
  const nowSeconds = Math.floor(Date.now() / 1000)
  const cached = _idTokenCache.get(user.cognitoSub)
  if (cached && cached.expiresAt - nowSeconds > REFRESH_LEEWAY_SECONDS) {
    return cached.idToken
  }
  const refreshed = await refreshTokens(raw.refreshToken)
  _idTokenCache.set(user.cognitoSub, {
    idToken: refreshed.idToken,
    expiresAt: refreshed.idTokenExpiresAt,
  })
  await rotateSessionTokens({
    idTokenExpiresAt: refreshed.idTokenExpiresAt,
    refreshToken: refreshed.refreshToken,
  })
  return refreshed.idToken
}
