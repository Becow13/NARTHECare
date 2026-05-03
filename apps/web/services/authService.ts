/**
 * Authenticated-user service — wraps `GET /api/me` + `PATCH /api/me` on
 * the NARTHECare backend.
 *
 * Mirrors `careRecipientService.ts`: a thin server-only module that
 * forwards the caller's Cognito ID token via `apiClient`. Route
 * handlers under `/api/data/me` consume these functions so every PHI
 * touch point stays on the server. The browser never sees the bearer
 * token.
 *
 * Body-free logging: `apiClient` already logs method + path + status;
 * we never log the user record (it carries email, phone, display name).
 */

import "server-only"

import { apiClient } from "./index"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Public user projection returned by the backend.
 *
 * Mirrors `_publicUser` in `apps/backend/app.js` — the auth-provider id
 * (`cognito_sub`) is intentionally absent. `phone` / `phone_verified`
 * surface so the Profile page can render a verified badge once Cognito
 * phone sign-in lands.
 */
export interface AuthenticatedUser {
  id: string
  email: string | null
  email_verified: boolean
  phone: string | null
  phone_verified: boolean
  display_name: string | null
  role: string
  status: string
  last_login_at: string | null
  created_at: string
  updated_at: string | null
}

/** Response envelope for `GET /api/me` and `PATCH /api/me`. */
export interface AuthenticatedUserResponse {
  user: AuthenticatedUser
}

/**
 * Editable fields for `PATCH /api/me`.
 *
 * The backend's `parseUserProfileUpdate` helper rejects every other
 * field with a 400 — `role`, `status`, `email`, `cognito_sub` all
 * intentionally cannot be patched from the profile UI.
 */
export interface UpdateMeInput {
  display_name?: string
  phone?: string
}

// ─── Public surface ─────────────────────────────────────────────────────────

/**
 * `GET /api/me` — full DB user row for the caller.
 *
 * Throws `ApiClientError` (or `ApiClientUnauthenticatedError`) on
 * failure; the route handler maps to the right HTTP status. Returns
 * the safe public projection — never the raw `users` row.
 */
export async function getMe(): Promise<AuthenticatedUser> {
  const response = await apiClient.getJson<AuthenticatedUserResponse>("/api/me")
  return response.user
}

/**
 * `PATCH /api/me` — update `display_name` and/or `phone`.
 *
 * Backend rejects unknown / sensitive fields; this helper does NOT
 * filter on the client because the route handler must echo whatever
 * the caller submitted to keep the validation surface single-sourced.
 */
export async function updateMe(input: UpdateMeInput): Promise<AuthenticatedUser> {
  const response = await apiClient.patchJson<AuthenticatedUserResponse, UpdateMeInput>(
    "/api/me",
    input,
  )
  return response.user
}
