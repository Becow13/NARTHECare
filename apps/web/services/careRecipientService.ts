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
