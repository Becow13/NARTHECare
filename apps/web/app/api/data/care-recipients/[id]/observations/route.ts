/**
 * GET /api/data/care-recipients/:id/observations
 *
 * Authenticated proxy for `GET /care-recipients/:id/observations`.
 * Same Route-Handler rationale as the sibling `profile` proxy — the
 * Cognito ID-token refresh writes to the sealed session cookie, which
 * Next.js only permits inside Route Handlers / Server Actions / Middleware.
 *
 * Query forwarding:
 *   - `metricType` — one of the eight Phase 4A metric strings.
 *   - `since`      — ISO timestamp; backend normalises.
 *   - `limit`      — positive integer; backend caps at 1000.
 *
 * Response body matches the backend envelope `{ observations: […] }`
 * so the Phase 4B vitals adapter parses one shape regardless of which
 * environment serves the request.
 */

import { NextResponse, type NextRequest } from "next/server"
import { apiClient, careRecipientService } from "@/services"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }
  const search = new URL(req.url).searchParams
  const options: { metricType?: string; since?: string; limit?: number } = {}
  const metricType = search.get("metricType")
  if (metricType) options.metricType = metricType
  const since = search.get("since")
  if (since) options.since = since
  const limitRaw = search.get("limit")
  if (limitRaw) {
    const n = Number(limitRaw)
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
      options.limit = n
    }
  }
  try {
    const data = await careRecipientService.listObservations(id, options)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/care-recipients/:id/observations]", e.status)
      // Collapse 403 into 404 so the proxy never leaks "this recipient
      // exists, you just can't see them" to a probing client.
      if (e.status === 403 || e.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      const status = e.status >= 500 ? 502 : e.status
      return NextResponse.json(
        { error: "Unable to complete request." },
        { status },
      )
    }
    console.error(
      "[API data/care-recipients/:id/observations]",
      e instanceof Error ? e.name : "unknown",
    )
    return NextResponse.json(
      { error: "Unable to complete request." },
      { status: 500 },
    )
  }
}
