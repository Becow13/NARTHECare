/**
 * GET /api/data/care-recipients
 *
 * Authenticated proxy for `GET /care-recipients` on the Aptible
 * backend. Lives in a Route Handler (not a Server Component) so
 * `services/apiClient.ts` may refresh the Cognito ID token and persist
 * the rotation via `sessionService.rotateSessionTokens` — Next.js only
 * allows `cookies().set` / iron-session `save()` inside Route Handlers,
 * Server Actions, or Middleware, never during a Server Component render.
 *
 * The browser calls this route (see `app/(app)/seniors/page.tsx`) so
 * any `Set-Cookie` from the refresh path is applied to the document
 * response. A Server Component calling `careRecipientService` directly
 * would throw the same restriction error the user saw on `/seniors`.
 *
 * Failure logs are body-free — only HTTP status / error class.
 */

import { NextResponse } from "next/server"
import { apiClient, careRecipientService } from "@/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await careRecipientService.listCareRecipients()
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/care-recipients]", e.status)
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json({ error: "Unable to complete request." }, { status })
    }
    console.error("[API data/care-recipients]", e instanceof Error ? e.name : "unknown")
    return NextResponse.json({ error: "Unable to complete request." }, { status: 500 })
  }
}
