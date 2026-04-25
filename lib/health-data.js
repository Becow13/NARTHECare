/**
 * Health-data ingestion parsing and validation helpers.
 *
 * Keep this file free of I/O — it is imported by the route handler, future
 * background jobs, and unit tests, so it must be safe to import from any
 * context without side effects.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Canonical metric type strings persisted in the `health_data.type` column. */
export const HEALTH_METRIC_TYPES = Object.freeze({
  steps: "steps",
  heartRate: "heart_rate",
  sleep: "sleep",
})

/** Body-size limit (bytes) applied by the route's JSON parser. */
export const MAX_PAYLOAD_BYTES = "1mb"

// ─── Date parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an ISO-8601 or date-only string into a Date object.
 *
 * Throws on an unparseable input — callers should translate the thrown error
 * into a 400 response so the client sees exactly which date value failed.
 */
export function parseRecordedAt(dateStr) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`)
  }
  return d
}

// ─── Row collection ───────────────────────────────────────────────────────────

/**
 * Flatten a HealthKit-shaped request body into DB-ready `health_data` rows.
 *
 * Each metric section (steps / heartRate / sleep) is optional; a missing
 * array defaults to []. All numeric values are coerced with `Number()` and
 * validated — any NaN short-circuits with a 400-friendly error message so
 * the client can correct the offending field.
 *
 * The returned rows already include `user_id` so the caller can hand them
 * directly to the DAO layer without another map.
 */
export function collectHealthRows(userId, body) {
  const { steps = [], heartRate = [], sleep = [] } = body ?? {}
  const rows = [
    ...steps.map((item) => _toRow(userId, HEALTH_METRIC_TYPES.steps, item)),
    ...heartRate.map((item) => _toRow(userId, HEALTH_METRIC_TYPES.heartRate, item)),
    ...sleep.map((item) => _toRow(userId, HEALTH_METRIC_TYPES.sleep, item)),
  ]

  for (const row of rows) {
    if (Number.isNaN(row.value)) {
      throw new Error("Each metric must have a numeric value")
    }
  }

  return rows
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _toRow(userId, type, item) {
  return {
    user_id: userId,
    type,
    value: Number(item?.value),
    recorded_at: parseRecordedAt(item?.date),
  }
}
