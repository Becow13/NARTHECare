/**
 * POST /api/auth/logout
 * GET  /api/auth/logout   (browser fallback for the sidebar link)
 *
 * Clears the local sealed session cookie FIRST, then redirects to
 * Cognito's `/logout` endpoint so the Hosted UI session is also
 * destroyed. Order matters: if Cognito's `/logout` is unreachable, the
 * worst case is a stale Cognito session, not a stale local session.
 *
 * Dev bypass: when `DEV_AUTH_BYPASS=true` we never touched Cognito on
 * sign-in, so on sign-out we just clear the local cookie and redirect
 * straight to `/auth/sign-in`.
 *
 * We accept both GET and POST: GET so a plain `<Link>` in the sidebar
 * works without JS, POST so a future logout-on-action button can use
 * the safer method. Both end up at the same redirect chain.
 */

import { NextResponse, type NextRequest } from "next/server"
import { sessionService, cognitoService } from "@/services"
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  return _handleLogout(req)
}

export async function POST(req: NextRequest) {
  return _handleLogout(req)
}

async function _handleLogout(_req: NextRequest): Promise<NextResponse> {
  try {
    await sessionService.clearSession()
  } catch (e) {
    console.error("[API auth/logout] clear failed", _safeMessage(e))
  }
  if (
    isDevAuthBypassEnabled({
      flag: process.env.DEV_AUTH_BYPASS,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return NextResponse.redirect(_appUrl("/auth/sign-in"))
  }
  let cognitoLogoutUrl: string
  try {
    cognitoLogoutUrl = cognitoService.buildHostedUiLogoutUrl()
  } catch (e) {
    console.error("[API auth/logout] config error", _safeMessage(e))
    return NextResponse.redirect(_appUrl("/auth/sign-in"))
  }
  return NextResponse.redirect(cognitoLogoutUrl)
}

function _appUrl(path: string): URL {
  const base = process.env.NARTHECARE_WEB_BASE_URL ?? "http://localhost:3100"
  return new URL(path, base)
}

function _safeMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
}
