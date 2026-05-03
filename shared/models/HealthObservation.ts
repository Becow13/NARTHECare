/**
 * HealthObservation — cross-platform sync contract.
 *
 * This file is the TypeScript source of truth for the observation
 * payload that flows iOS → backend (`POST /healthkit/sync`) and the
 * status row the backend returns from `GET /healthkit/status`. It is
 * mirrored by `HealthObservation.js` (backend ESM with JSDoc) and by
 * `apps/ios/NARTHECare/Models/HealthObservation.swift` (iOS Codable).
 *
 * Keep this file free of I/O and runtime dependencies. When you change
 * a field here, you MUST update the JS mirror, the JSON schema, and
 * the Swift model in the same change — all four shapes must stay in
 * lockstep so the API request deserializes on every client.
 */

/**
 * Transports that may submit observations. Phase 4A only accepts
 * `healthkit` from the iOS sync companion; `manual` is reserved for
 * caregiver-entered rows in a later phase.
 */
export type HealthObservationSourceType = "healthkit" | "manual"

/** Canonical metric_type strings persisted in `health_observations.metric_type`. */
export type HealthObservationMetricType =
  | "steps"
  | "resting_heart_rate"
  | "hrv"
  | "spo2"
  | "sleep_duration"
  | "respiratory_rate"
  | "walking_steadiness"
  | "fall_event"

/** Canonical units paired with each metric type. */
export type HealthObservationUnit =
  | "count"
  | "bpm"
  | "ms"
  | "hours"
  | "percent"
  | "breaths_per_min"
  | "score"
  | "event"

/**
 * One normalized HealthKit / external sample. PHI — never log
 * `value`, `measuredAt`, or `metadata` contents.
 */
export interface HealthObservation {
  sourceType: HealthObservationSourceType
  sourceRecordId: string
  metricType: HealthObservationMetricType
  value: number
  unit: HealthObservationUnit
  measuredAt: string
  startAt?: string
  endAt?: string
  metadata?: Record<string, unknown>
}

/** Request body for `POST /healthkit/sync`. */
export interface HealthKitSyncRequest {
  careRecipientId: string
  observations: HealthObservation[]
}

/**
 * Response body for `POST /healthkit/sync`. Counts only — never echoes
 * an observation payload back to the client. `lastSyncedAt` is the
 * server's authoritative `care_recipient_data_sources.last_synced_at`
 * value after the upsert.
 */
export interface HealthKitSyncResponse {
  accepted: number
  deduped: number
  rejected: number
  lastSyncedAt: string | null
}

/** Response body for `GET /healthkit/status`. */
export interface HealthKitSyncStatus {
  status: "connected" | "not_connected" | "error"
  lastSyncedAt: string | null
  errorMessage: string | null
}
