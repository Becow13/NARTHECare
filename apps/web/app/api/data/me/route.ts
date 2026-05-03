/**
 * GET /api/data/me, PATCH /api/data/me
 *
 * Authenticated proxy for `GET /api/me` and `PATCH /api/me` on the
 * NARTHECare backend. Same Route-Handler rationale as the rest of
 * `/api/data/**`: silent token refresh writes the sealed session
 * cookie via `sessionService.rotateSessionTokens`, and Next.js only
 * permits cookie mutation inside Route Handlers / Server Actions.
 *
 * After a successful GET or PATCH, `session.user.displayName` is
 * rewritten from `user.display_name` so the app shell sidebar (which
 * only reads the sealed cookie) matches PostgreSQL, not just the
 * Cognito claims captured at sign-in.
 *
 * PATCH body is forwarded as-is so the backend's
 * `parseUserProfileUpdate` is the single source of validation truth —
 * no redundant client-side allow-list to drift out of sync.
 *
 * Failure logs are body-free — only HTTP status / error class.
 */

import { NextResponse, type NextRequest } from "next/server"
import { apiClient, authService, sessionService } from "@/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await authService.getMe()
    await sessionService.updateSessionUserDisplayName(user.display_name)
    return NextResponse.json({ user })
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/me]", e.status)
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json({ error: "Unable to complete request." }, { status })
    }
    console.error("[API data/me]", e instanceof Error ? e.name : "unknown")
    return NextResponse.json({ error: "Unable to complete request." }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  try {
    const user = await authService.updateMe(
      (body ?? {}) as authService.UpdateMeInput,
    )
    await sessionService.updateSessionUserDisplayName(user.display_name)
    return NextResponse.json({ user })
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/me PATCH]", e.status)
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json({ error: "Unable to complete request." }, { status })
    }
    console.error("[API data/me PATCH]", e instanceof Error ? e.name : "unknown")
    return NextResponse.json({ error: "Unable to complete request." }, { status: 500 })
  }
}
