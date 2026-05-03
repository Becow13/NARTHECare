/**
 * GET /api/auth/callback
 *
 * Cognito Hosted UI redirects here with `?code=…&state=…` after the
 * user signs in. We:
 *
 *   1. Verify `state` matches the temp cookie set by `/api/auth/login`.
 *   2. Exchange the code for an ID token + refresh token at Cognito's
 *      `/oauth2/token` endpoint.
 *   3. Verify the ID token signature / issuer / audience / expiry via
 *      `aws-jwt-verify` (same library the backend uses).
 *   4. Persist the verified identity + tokens in the sealed session
 *      cookie.
 *   5. Redirect to `/dashboard`.
 *
 * Any failure redirects to `/auth/error?code=…` with a SAFE error code
 * (see `lib/auth/errors.ts`). We never echo Cognito's raw error
 * message to the user — those messages can include client_ids and
 * issuer URLs that should not show up in browser history.
 */

import { NextResponse, type NextRequest } from "next/server"
import { sessionService, cognitoService } from "@/services"
import {
  CognitoTokenError,
  CognitoVerificationError,
} from "@/services/cognitoService"
import { AUTH_ERROR_CODES } from "@/lib/auth/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const hostedUiError = params.get("error")
  if (hostedUiError) {
    // Cognito surfaces user-cancelled or consent failures here.
    // We log only the error code (no `error_description` body — that
    // can include URL fragments).
    console.error("[API auth/callback] hosted UI returned error", hostedUiError.slice(0, 64))
    return _redirectToError(AUTH_ERROR_CODES.hostedUiError)
  }

  const code = params.get("code")
  const state = params.get("state")
  if (!code) return _redirectToError(AUTH_ERROR_CODES.missingCode)

  const expectedState = sessionService.consumeOAuthStateCookie()
  if (!state || !expectedState || state !== expectedState) {
    console.error("[API auth/callback] state mismatch")
    return _redirectToError(AUTH_ERROR_CODES.invalidState)
  }

  try {
    const tokens = await cognitoService.exchangeCodeForTokens(code)
    await sessionService.createSessionFromTokens(tokens)
  } catch (e) {
    if (e instanceof CognitoVerificationError) {
      return _redirectToError(AUTH_ERROR_CODES.invalidIdToken)
    }
    if (e instanceof CognitoTokenError) {
      return _redirectToError(AUTH_ERROR_CODES.tokenExchangeFailed)
    }
    console.error("[API auth/callback]", _safeMessage(e))
    return _redirectToError(AUTH_ERROR_CODES.serverError)
  }

  return NextResponse.redirect(_appUrl("/dashboard"))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _appUrl(path: string): URL {
  const base = process.env.NARTHECARE_WEB_BASE_URL ?? "http://localhost:3100"
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
