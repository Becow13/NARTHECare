/**
 * GET /api/data/care-recipients/:id/data-sources
 *
 * Authenticated proxy for `GET /care-recipients/:id/data-sources`.
 * Same Route-Handler rationale as the sibling `profile` proxy — token
 * refresh writes to the sealed session cookie, only legal here.
 *
 * Query forwarding:
 *   - `type`   — registry source type (`apple_health`, `epic`,
 *                `healthkit`, …); backend validates against the union
 *                of dashboard view-model types and the registry-only
 *                `healthkit` transport identifier.
 *   - `status` — `connected` | `not_connected` | `error`.
 *
 * Response body matches the backend envelope `{ dataSources: […] }`
 * so the dashboard's Data Sources card / adapter consume the same
 * shape regardless of which environment serves the request.
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
  const options: { type?: string; status?: string } = {}
  const type = search.get("type")
  if (type) options.type = type
  const status = search.get("status")
  if (status) options.status = status
  try {
    const data = await careRecipientService.listDataSources(id, options)
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof apiClient.ApiClientUnauthenticatedError) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
    }
    if (e instanceof apiClient.ApiClientError) {
      console.error("[API data/care-recipients/:id/data-sources]", e.status)
      if (e.status === 403 || e.status === 404) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }
      const upstream = e.status >= 500 ? 502 : e.status
      return NextResponse.json(
        { error: "Unable to complete request." },
        { status: upstream },
      )
    }
    console.error(
      "[API data/care-recipients/:id/data-sources]",
      e instanceof Error ? e.name : "unknown",
    )
    return NextResponse.json(
      { error: "Unable to complete request." },
      { status: 500 },
    )
  }
}
