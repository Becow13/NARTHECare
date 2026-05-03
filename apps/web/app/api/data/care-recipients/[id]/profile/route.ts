/**
 * GET /api/data/care-recipients/:id/profile
 * PATCH /api/data/care-recipients/:id/profile
 *
 * Authenticated proxy for the backend's GET + PATCH profile endpoints.
 * Same Route-Handler rationale as `../route.ts` — token refresh
 * mutates the sealed session cookie, which Next only permits here
 * (or a Server Action), not inside a Server Component.
 *
 * Response body matches the backend envelope `{ careRecipient: … }`
 * so the client parses the same shape the backend returns. PATCH body
 * is forwarded as-is so the backend's
 * `parseCareRecipientProfileUpdate` is the single source of validation
 * truth.
 */

import { NextResponse, type NextRequest } from "next/server"
import { apiClient, careRecipientService } from "@/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }
  try {
    const profile = await careRecipientService.getCareRecipientProfile(id)
    return NextResponse.json({ careRecipient: profile })
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/care-recipients/:id/profile]", e.status)
      if (e.status === 403 || e.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json({ error: "Unable to complete request." }, { status })
    }
    console.error(
      "[API data/care-recipients/:id/profile]",
      e instanceof Error ? e.name : "unknown",
    )
    return NextResponse.json({ error: "Unable to complete request." }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  try {
    const profile = await careRecipientService.updateCareRecipientProfile(
      id,
      (body ?? {}) as careRecipientService.UpdateCareRecipientProfileInput,
    )
    return NextResponse.json({ careRecipient: profile })
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/care-recipients/:id/profile PATCH]", e.status)
      if (e.status === 403 || e.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json({ error: "Unable to complete request." }, { status })
    }
    console.error(
      "[API data/care-recipients/:id/profile PATCH]",
      e instanceof Error ? e.name : "unknown",
    )
    return NextResponse.json({ error: "Unable to complete request." }, { status: 500 })
  }
}
