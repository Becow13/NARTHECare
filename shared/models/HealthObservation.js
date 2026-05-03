/**
 * HealthObservation — ESM/JS mirror of the cross-platform sync contract.
 *
 * This file is the backend-consumable mirror of
 * `./HealthObservation.ts`. JSDoc `@typedef` blocks give the backend
 * editor-level type awareness without pulling TypeScript into the Node
 * build. The frozen constant objects below are the runtime enum values —
 * import them from route handlers, validators, and ingest pipelines so
 * every call site agrees on the same strings the TS + Swift contracts use.
 *
 * Rule: if you change a field or value here, you MUST update the `.ts`
 * file, the JSON schema in `shared/contracts/healthObservation.schema.json`,
 * and the Swift model in the same change. Four files, one shape.
 *
 * Phase 4A wires this contract end-to-end:
 *   iOS HealthKitSyncService → POST /healthkit/sync → health_observations
 * Phase 4B will read these rows for baseline + AI summary generation.
 */

// ─── Enum constants (runtime) ───────────────────────────────────────────────

/**
 * Transports that may submit observations. Phase 4A only accepts
 * `healthkit` from the iOS sync companion; `manual` is reserved for
 * caregiver-entered rows in a later phase. Mirrors the
 * `OBSERVATION_SOURCE_TYPES` superset in `apps/backend/lib/
 * health-observations.js` — that constant carries additional values
 * (`apple_health`, `epic`, `healthkit_legacy`) that are not legal for
 * inbound writes from this contract.
 */
export const SYNC_SOURCE_TYPES = Object.freeze({
  healthkit: "healthkit",
  manual: "manual",
})

/**
 * Canonical metric_type strings. Must match `METRIC_TYPES` in
 * `apps/backend/lib/health-observations.js` and the Swift
 * `HealthObservationMetricType` raw values.
 */
export const HEALTH_OBSERVATION_METRIC_TYPES = Object.freeze({
  steps: "steps",
  restingHeartRate: "resting_heart_rate",
  hrv: "hrv",
  spo2: "spo2",
  sleepDuration: "sleep_duration",
  respiratoryRate: "respiratory_rate",
  walkingSteadiness: "walking_steadiness",
  fallEvent: "fall_event",
})

/**
 * Canonical unit strings. Pair 1:1 with metric types so the DB never
 * has to interpret iOS-side enums; see `METRIC_UNIT_BY_METRIC_TYPE`
 * for the allowed pairings.
 */
export const HEALTH_OBSERVATION_UNITS = Object.freeze({
  count: "count",
  bpm: "bpm",
  ms: "ms",
  hours: "hours",
  percent: "percent",
  breathsPerMin: "breaths_per_min",
  score: "score",
  event: "event",
})

/**
 * Allowed unit per metric. Validated server-side at ingest so a
 * contract-broken iOS build cannot insert a `bpm`-typed steps row.
 * The map is the single source of truth — both the JSON schema's
 * `unit` enum and the iOS Codable struct ride this table.
 */
export const HEALTH_OBSERVATION_UNIT_BY_METRIC_TYPE = Object.freeze({
  steps: "count",
  resting_heart_rate: "bpm",
  hrv: "ms",
  spo2: "percent",
  sleep_duration: "hours",
  respiratory_rate: "breaths_per_min",
  walking_steadiness: "score",
  fall_event: "event",
})

// ─── Type aliases for editor tooling (JSDoc) ────────────────────────────────

/**
 * @typedef {"healthkit" | "manual"} HealthObservationSourceType
 *
 * @typedef {"steps" | "resting_heart_rate" | "hrv" | "spo2" | "sleep_duration" | "respiratory_rate" | "walking_steadiness" | "fall_event"} HealthObservationMetricType
 *
 * @typedef {"count" | "bpm" | "ms" | "hours" | "percent" | "breaths_per_min" | "score" | "event"} HealthObservationUnit
 *
 * @typedef {Object} HealthObservation
 * @property {HealthObservationSourceType} sourceType
 * @property {string} sourceRecordId
 * @property {HealthObservationMetricType} metricType
 * @property {number} value
 * @property {HealthObservationUnit} unit
 * @property {string} measuredAt
 * @property {string} [startAt]
 * @property {string} [endAt]
 * @property {Object<string, *>} [metadata]
 *
 * @typedef {Object} HealthKitSyncRequest
 * @property {string} careRecipientId
 * @property {HealthObservation[]} observations
 *
 * @typedef {Object} HealthKitSyncResponse
 * @property {number} accepted
 * @property {number} deduped
 * @property {number} rejected
 * @property {string|null} lastSyncedAt
 *
 * @typedef {Object} HealthKitSyncStatus
 * @property {"connected" | "not_connected" | "error"} status
 * @property {string|null} lastSyncedAt
 * @property {string|null} errorMessage
 */

export {}
