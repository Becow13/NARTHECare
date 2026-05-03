/**
 * Health-observation read-side parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, future ingest pipelines, and unit tests, so it must be
 * safe to import from any context without side effects. All DB access
 * lives in `services/dao/healthObservationDao.js`.
 *
 * Phase 4 only ships the **read** surface; the write path lands in
 * Phase 4A (iOS HealthKit sync) using these same metric-type and unit
 * strings so the contract never drifts between read and write.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Canonical `metric_type` values persisted in `health_observations.metric_type`. */
export const METRIC_TYPES = Object.freeze({
  steps: "steps",
  restingHeartRate: "resting_heart_rate",
  hrv: "hrv",
  spo2: "spo2",
  sleepDuration: "sleep_duration",
  respiratoryRate: "respiratory_rate",
  walkingSteadiness: "walking_steadiness",
  fallEvent: "fall_event",
})

/** The set of accepted metric_type strings — used for query validation. */
const METRIC_TYPE_SET = new Set(Object.values(METRIC_TYPES))

/** Canonical units paired with each metric type; the DB never has to interpret iOS-side enums. */
export const METRIC_UNITS = Object.freeze({
  count: "count",
  bpm: "bpm",
  ms: "ms",
  percent: "percent",
  hours: "hours",
  breathsPerMin: "breaths_per_min",
  score: "score",
  event: "event",
})

/** Canonical `source_type` values for any row referencing an external origin. */
export const OBSERVATION_SOURCE_TYPES = Object.freeze({
  appleHealth: "apple_health",
  /** Reserved for the new Phase 4A sync path (`POST /healthkit/sync`). */
  healthkit: "healthkit",
  /** Backfilled rows from the legacy `health_data` table (Phase 4B cleanup). */
  healthkitLegacy: "healthkit_legacy",
  epic: "epic",
  manual: "manual",
})

/** Server-side defaults / hard caps for the list endpoint. */
export const DEFAULT_LIST_LIMIT = 200
export const MAX_LIST_LIMIT = 1000

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?metricType=&since=&limit=` query string for the list
 * endpoint into DB-ready filters.
 *
 * Throws a plain `Error` on invalid input so the route handler can
 * translate the message into a 400 response (mirrors `parseCareRecipientInput`).
 * Unknown keys are ignored — the handler must rely on this single function
 * rather than reading `req.query` directly so future filters land in one place.
 */
export function parseObservationListQuery(query) {
  const raw = query ?? {}
  const metricType = _parseMetricType(raw.metricType ?? raw.metric_type)
  const since = _parseSince(raw.since)
  const limit = _parseLimit(raw.limit)
  return { metricType, since, limit }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _parseMetricType(value) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("metricType must be a string when provided")
  }
  if (!METRIC_TYPE_SET.has(value)) {
    throw new Error(`Unknown metricType: ${value}`)
  }
  return value
}

function _parseSince(value) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("since must be an ISO timestamp string when provided")
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid since: ${value}`)
  }
  return new Date(ms).toISOString()
}

function _parseLimit(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIST_LIMIT
  }
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("limit must be a positive integer")
  }
  return Math.min(n, MAX_LIST_LIMIT)
}
