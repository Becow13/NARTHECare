/**
 * Edge middleware — gates every route except the public auth surface.
 *
 * The actual session decryption uses Node-only iron-session and
 * therefore lives in `app/(app)/layout.tsx`. The middleware does the
 * cheap pre-check: "is the sealed cookie present at all?". If yes, we
 * let the request through; the layout still decrypts + validates and
 * boots back to `/auth/sign-in` if the cookie is corrupt or expired.
 * If no, we redirect immediately so the user never sees the dashboard
 * shell flicker.
 *
 * What this middleware does NOT do:
 *
 *   - It does NOT decrypt the cookie. iron-session needs Node APIs we
 *     cannot reach from the Edge runtime.
 *   - It does NOT validate the ID token. That happens in the apiClient
 *     before the bearer is sent to the backend, and on the backend
 *     itself.
 *   - It does NOT log the cookie value, the URL with PHI-shaped path
 *     params, or any header. The matcher already keeps Next internals
 *     out of scope; the only thing we ever record is "redirected
 *     unauthenticated request" with no further detail.
 */

import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE_NAME } from "@/lib/auth/session-cookie"

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * URL path prefixes that bypass auth. Keep in sync with the matcher
 * below. We allow:
 *   - `/auth/**`       — sign-in / error pages
 *   - `/api/auth/**`   — login / callback / logout routes
 *
 * Everything else (including future API proxies) is gated.
 */
const PUBLIC_PREFIXES = ["/auth/", "/api/auth/"] as const

// ─── Middleware ──────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (_isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // iron-session chunks large cookies as `__nc_session.0`, `.1`, …; the
  // base name is always present when at least one chunk exists.
  const hasSessionCookie = _hasAnySessionChunk(req)
  if (hasSessionCookie) {
    return NextResponse.next()
  }

  // Preserve the original destination so a future enhancement can deep-link
  // back to it after sign-in. Stored as a search param (NOT a cookie) so
  // there is no risk of stale state if the user navigates away.
  const signInUrl = req.nextUrl.clone()
  signInUrl.pathname = "/auth/sign-in"
  signInUrl.search = ""
  if (pathname !== "/" && pathname !== "/auth/sign-in") {
    signInUrl.searchParams.set("from", pathname)
  }
  return NextResponse.redirect(signInUrl)
}

// ─── Matcher ────────────────────────────────────────────────────────────────

/**
 * Skip the middleware on Next.js internals + static assets so build
 * artifacts and fonts do not pay the cookie-lookup cost. We do NOT
 * exclude `/api/**` wholesale — only `/api/auth/**` is public; future
 * server-side proxies under `/api/**` need the same auth treatment as
 * pages.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|robots.txt|sitemap.xml).*)",
  ],
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _isPublicPath(pathname: string): boolean {
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
  }
  return false
}

function _hasAnySessionChunk(req: NextRequest): boolean {
  if (req.cookies.has(SESSION_COOKIE_NAME)) return true
  // iron-session chunks: `<name>.0`, `<name>.1`, …
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith(`${SESSION_COOKIE_NAME}.`)) return true
  }
  return false
}
