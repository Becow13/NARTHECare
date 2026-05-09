/**
 * Care-recipient backend surface.
 *
 * Mirrors the reference project's `services/sessionService.ts` shape:
 * a thin, server-only module that wraps `apiClient` so Server
 * Components and route handlers consume one named function per
 * endpoint. Phase 3 wires two endpoints; Phase 4 will add sibling
 * readers for observations, summaries, alerts, appointments, and
 * action plans against the same `care_recipient_id` key — they land
 * here, not scattered across components.
 *
 * Why server-only:
 *   - Every call forwards the caregiver's Cognito ID token via
 *     `apiClient`. That token must never reach the browser (see
 *     `services/apiClient.ts`).
 *   - The responses carry PHI (names, conditions, notes). We keep
 *     them on the server so a page render can decide what to expose.
 *
 * PHI-safe logging: this module does not log payloads. `apiClient`
 * already logs method + path + status only; additional logs here
 * would duplicate that and risk adding PHI (names, ids → ids are ok,
 * payload shape is not).
 */

import "server-only"

import type {
  CareRecipientProfile,
  CareRecipientProfileResponse,
} from "@models/CareRecipientProfile"
import { apiClient } from "./index"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Row shape returned by `GET /care-recipients`.
 *
 * The backend DAO (`apps/backend/services/dao/careRecipientDao.js`)
 * projects raw snake_case columns onto this response, so field names
 * here intentionally match the SQL columns rather than the camelCase
 * `CareRecipientProfile` contract. Do NOT rename these on the fly —
 * the adapter at `lib/adapters/careRecipientToSenior.ts` is the
 * single place that translates this shape to the view model.
 *
 * This list endpoint is deliberately thin. Fields the web UI wants
 * (status, `lastSeen`, `primaryConditions[]`, alert counts) live in
 * Phase 4 tables that do not exist yet — the list page must render
 * gracefully without them.
 */
export interface CareRecipientListRow {
  id: string
  name: string
  date_of_birth: string | null
  primary_condition: string | null
  created_at: string
  updated_at: string
  role: string
  permission_level: string
}

/** Response envelope for `GET /care-recipients`. */
export interface CareRecipientListResponse {
  careRecipients: CareRecipientListRow[]
}

/**
 * Row shape returned by `GET /care-recipients/:id/observations`.
 *
 * Mirrors the projection in `apps/backend/services/dao/healthObservationDao.js`
 * (snake_case columns, JSON-passthrough `metadata`). Adapter code is
 * the only thing that should reshape this into a view model — the
 * raw shape preserves the unit + source provenance the dashboard's
 * vitals card needs to render trustworthy "where did this come from?"
 * copy.
 */
export interface HealthObservationRow {
  id: string
  care_recipient_id: string
  metric_type: string
  value_numeric: number | null
  value_unit: string
  observed_at: string
  source_type: string
  source_id: string | null
  source_record_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Response envelope for `GET /care-recipients/:id/observations`. */
export interface HealthObservationListResponse {
  observations: HealthObservationRow[]
}

/**
 * Row shape returned by `GET /care-recipients/:id/data-sources`.
 *
 * Mirrors the registry projection in `apps/backend/services/dao/
 * careRecipientDataSourceDao.js`. The Phase 4A sync path writes one
 * row for `source_type = "healthkit"`; the dashboard's adapter maps
 * that to the "Apple Health" view-model display so the existing
 * `DataSource` contract is unchanged.
 */
export interface DataSourceRegistryRow {
  id: string
  care_recipient_id: string
  source_type: string
  status: "connected" | "not_connected" | "error" | string
  last_synced_at: string | null
  external_id: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

/** Response envelope for `GET /care-recipients/:id/data-sources`. */
export interface DataSourceListResponse {
  dataSources: DataSourceRegistryRow[]
}

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * `GET /care-recipients` — every recipient the caller is on the
 * care team for.
 *
 * Returns the raw envelope from the backend so callers decide whether
 * to map to a view model (`/seniors` list) or to a different surface
 * later (sidebar selector, switcher, etc.). Throws `ApiClientError`
 * (or `ApiClientUnauthenticatedError`) from `apiClient`; the caller
 * is responsible for translating those into the right UI state.
 */
export async function listCareRecipients(): Promise<CareRecipientListResponse> {
  return apiClient.getJson<CareRecipientListResponse>("/care-recipients")
}

/**
 * `GET /care-recipients/:id/profile` — full `CareRecipientProfile`.
 *
 * Backend enforces `requireCareRecipientAccess` server-side, so a
 * caller that has no care-team membership gets a 403 that surfaces
 * here as an `ApiClientError` with status 403. The Server Component
 * that owns the route MUST translate that to `notFound()` or a
 * friendly "no access" page — never render a 403 body through.
 *
 * `:id` must be a UUID v4. `apiClient` does not validate for us;
 * callers should assert before calling so an obviously-bad id does
 * not round-trip.
 */
export async function getCareRecipientProfile(
  id: string,
): Promise<CareRecipientProfile> {
  const response = await apiClient.getJson<CareRecipientProfileResponse>(
    `/care-recipients/${encodeURIComponent(id)}/profile`,
  )
  return response.careRecipient
}

/**
 * `GET /care-recipients/:id/observations` — newest-first per-sample
 * health signals for the given recipient.
 *
 * Pass `metricType` (`steps`, `resting_heart_rate`, …) and `since`
 * (ISO timestamp) to narrow. `limit` is capped server-side at 1000;
 * callers pass the natural number, the backend clamps. Returns the
 * raw envelope so the adapter at `lib/adapters/careRecipientToSenior.ts`
 * (Phase 4B) can shape vitals cards from one place.
 */
export async function listObservations(
  id: string,
  options: { metricType?: string; since?: string; limit?: number } = {},
): Promise<HealthObservationListResponse> {
  const search = new URLSearchParams()
  if (options.metricType) search.set("metricType", options.metricType)
  if (options.since) search.set("since", options.since)
  if (options.limit !== undefined) search.set("limit", String(options.limit))
  const query = search.toString()
  const path =
    `/care-recipients/${encodeURIComponent(id)}/observations` +
    (query ? `?${query}` : "")
  return apiClient.getJson<HealthObservationListResponse>(path)
}

/**
 * `GET /care-recipients/:id/data-sources` — every registry row for
 * the recipient (Apple Health / HealthKit, Epic, Fitbit, …).
 *
 * Optional `type` and `status` map to the same filter the backend's
 * `parseDataSourceListQuery` exposes (validated server-side). The
 * response shape is the raw registry; the dashboard adapter merges
 * these rows with the profile's static `dataSources` array so a
 * never-synced recipient still renders a neutral row.
 */
export async function listDataSources(
  id: string,
  options: { type?: string; status?: string } = {},
): Promise<DataSourceListResponse> {
  const search = new URLSearchParams()
  if (options.type) search.set("type", options.type)
  if (options.status) search.set("status", options.status)
  const query = search.toString()
  const path =
    `/care-recipients/${encodeURIComponent(id)}/data-sources` +
    (query ? `?${query}` : "")
  return apiClient.getJson<DataSourceListResponse>(path)
}

/**
 * Editable fields for `PATCH /care-recipients/:id/profile`.
 *
 * Backend's `parseCareRecipientProfileUpdate` rejects identity-
 * defining fields (id, name, audit timestamps). Empty strings are
 * normalised to "leave unchanged" by the parser — sending one is
 * effectively a no-op for that field today.
 */
export interface UpdateCareRecipientProfileInput {
  date_of_birth?: string
  primary_condition?: string
  relationship?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
}

/**
 * `PATCH /care-recipients/:id/profile` — caregiver edits.
 *
 * Returns the freshly assembled `CareRecipientProfile` so the caller
 * can render the updated row without a second round-trip. Throws
 * `ApiClientError` for 400 (bad payload), 403 (no membership), 404
 * (recipient gone).
 */
export async function updateCareRecipientProfile(
  id: string,
  input: UpdateCareRecipientProfileInput,
): Promise<CareRecipientProfile> {
  const response = await apiClient.patchJson<
    CareRecipientProfileResponse,
    UpdateCareRecipientProfileInput
  >(`/care-recipients/${encodeURIComponent(id)}/profile`, input)
  return response.careRecipient
}

/** Input for `POST /care-recipients/:id/observations` — single manual reading. */
export interface CreateObservationInput {
  metricType: string
  value: number
  observedAt: string
}

/** Response envelope for `POST /care-recipients/:id/observations`. */
export interface CreateObservationResponse {
  accepted: number
}

/**
 * `POST /care-recipients/:id/observations` — caregiver-entered manual reading.
 *
 * The unit is resolved server-side from `metricType`; callers supply only the
 * metric type name, a numeric value, and an ISO timestamp. Throws
 * `ApiClientError` for 400 (bad payload), 403 (no membership), 404 (gone).
 */
export async function createObservation(
  id: string,
  input: CreateObservationInput,
): Promise<CreateObservationResponse> {
  return apiClient.postJson<CreateObservationResponse, CreateObservationInput>(
    `/care-recipients/${encodeURIComponent(id)}/observations`,
    input,
  )
}

/**
 * Composite envelope returned by `GET /care-recipients/:id/dashboard`.
 *
 * Each section is sourced from PostgreSQL — empty arrays / null fields
 * mean "no data yet", never mock fallback. The dashboard MUST render
 * honest empty states from these.
 */
export interface CareRecipientDashboard {
  latestObservations: HealthObservationRow[]
  baselines: Array<{
    metric_type: string
    p10_numeric: number | null
    p50_numeric: number | null
    p90_numeric: number | null
    sample_count: number
    computed_at: string
    [k: string]: unknown
  }>
  latestSummary: {
    id: string
    summary_type: string
    summary_text: string
    generated_at: string
    [k: string]: unknown
  } | null
  activeAlerts: Array<{
    id: string
    rule_id: string
    severity: string
    status: string
    title: string
    body: string | null
    [k: string]: unknown
  }>
  upcomingAppointments: Array<{
    id: string
    title: string
    starts_at: string
    [k: string]: unknown
  }>
  dataSources: DataSourceRegistryRow[]
  healthkitSync: {
    status: string
    lastSyncedAt: string | null
    errorMessage: string | null
  }
  counts: {
    observations: number
    baselines: number
    summaries: number
    alerts: number
    appointments: number
    dataSources: number
  }
}

/** Response envelope for `GET /care-recipients/:id/dashboard`. */
export interface CareRecipientDashboardResponse {
  dashboard: CareRecipientDashboard
}

/**
 * `GET /care-recipients/:id/dashboard` — composite dashboard read.
 *
 * Always validates RBAC server-side. Returns honest empty arrays /
 * `null` summary when the underlying tables have no rows — no mock
 * fallback. Throws `ApiClientError` (403/404/etc.) on failure.
 */
export async function getCareRecipientDashboard(
  id: string,
): Promise<CareRecipientDashboard> {
  const response = await apiClient.getJson<CareRecipientDashboardResponse>(
    `/care-recipients/${encodeURIComponent(id)}/dashboard`,
  )
  return response.dashboard
}
