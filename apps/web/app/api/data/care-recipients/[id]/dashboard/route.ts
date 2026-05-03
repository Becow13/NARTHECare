/**
 * GET /api/data/care-recipients/:id/dashboard
 *
 * Authenticated proxy for `GET /care-recipients/:id/dashboard` on the
 * NARTHECare backend. Same Route-Handler rationale as the rest of
 * `/api/data/**` — silent token refresh writes the sealed session
 * cookie, which Next only permits here (or a Server Action).
 *
 * Backend returns a single composite envelope (latestObservations,
 * baselines, latestSummary, activeAlerts, upcomingAppointments,
 * dataSources, healthkitSync) so the dashboard renders one round-trip.
 *
 * 403 is mapped to 404 so the client cannot tell whether a recipient
 * exists when the caller is not on its care team — same convention
 * as the profile route.
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
    const dashboard = await careRecipientService.getCareRecipientDashboard(id)
    return NextResponse.json({ dashboard })
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/care-recipients/:id/dashboard]", e.status)
      if (e.status === 403 || e.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json({ error: "Unable to complete request." }, { status })
    }
    console.error(
      "[API data/care-recipients/:id/dashboard]",
      e instanceof Error ? e.name : "unknown",
    )
    return NextResponse.json({ error: "Unable to complete request." }, { status: 500 })
  }
}
