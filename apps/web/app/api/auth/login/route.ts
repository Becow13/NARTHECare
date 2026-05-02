/**
 * GET /api/auth/login
 *
 * Initiates the Cognito Hosted UI sign-in. Generates a CSPRNG `state`
 * nonce, persists it in a short-lived httpOnly cookie, then 302s the
 * browser to Cognito. Cognito will round-trip back to
 * `/api/auth/callback` with `?code=…&state=…`.
 *
 * Dev bypass: when `DEV_AUTH_BYPASS=true` AND not production, we skip
 * Cognito entirely and seed the dev caregiver session in place — local
 * dev does not need real Cognito creds. The bypass is gated by
 * `lib/auth/dev-bypass.ts` so production can never reach this branch.
 *
 * PHI / token safety:
 *   - The state value is opaque (not user-derived).
 *   - No PHI fields are ever included in the URL we redirect to.
 *   - We do NOT log the redirect URL — Hosted UI URLs include the
 *     client_id which is not strictly PHI but is not useful in logs.
 */

import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "node:crypto"
import { sessionService, cognitoService } from "@/services"
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { AUTH_ERROR_CODES } from "@/lib/auth/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest) {
  if (
    isDevAuthBypassEnabled({
      flag: process.env.DEV_AUTH_BYPASS,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    try {
      await sessionService.createDevBypassSession()
    } catch (e) {
      console.error("[API auth/login] dev bypass failed", _safeMessage(e))
      return _redirectToError(AUTH_ERROR_CODES.serverError)
    }
    return NextResponse.redirect(_appUrl("/dashboard"))
  }

  let state: string
  let hostedUiUrl: string
  try {
    state = _generateState()
    hostedUiUrl = cognitoService.buildHostedUiUrl(state)
  } catch (e) {
    console.error("[API auth/login] config error", _safeMessage(e))
    return _redirectToError(AUTH_ERROR_CODES.serverError)
  }

  sessionService.setOAuthStateCookie(state)
  return NextResponse.redirect(hostedUiUrl)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _generateState(): string {
  return randomBytes(32).toString("base64url")
}

function _appUrl(path: string): URL {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000"
  return new URL(path, base)
}

function _redirectToError(code: string): NextResponse {
  const url = _appUrl("/auth/error")
  url.searchParams.set("code", code)
  return NextResponse.redirect(url)
}

function _safeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
}
