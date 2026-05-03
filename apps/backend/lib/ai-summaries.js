/**
 * AI-summary read-side parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, the future Phase 4B AI generation pipeline, and unit
 * tests. All DB access lives in `services/dao/aiSummaryDao.js`.
 *
 * The AI generation pipeline lives in Phase 4B. Per the AI Safety Rules
 * in `narthecare-general-healthcare.mdc`, summaries:
 *   - never diagnose or prescribe,
 *   - never echo PHI back to logs,
 *   - cite the same `metric_type` strings used by `health_observations`
 *     so caregivers can trace any claim to a source row.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Canonical `summary_type` values persisted in `ai_summaries.summary_type`. */
export const SUMMARY_TYPES = Object.freeze({
  /** Daily caregiver-facing rollup of recent observations and baseline status. */
  daily: "daily",
  /** One-off explanation when an alert fires. */
  anomaly: "anomaly",
  /** Plain-language summary derived from an Epic visit document. */
  postVisit: "post_visit",
})

/** The set of accepted summary_type strings — used for query validation. */
const SUMMARY_TYPE_SET = new Set(Object.values(SUMMARY_TYPES))

/** Server-side defaults / hard caps for the list endpoint. */
export const DEFAULT_LIST_LIMIT = 20
export const MAX_LIST_LIMIT = 100

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?type=&limit=` query string for the list endpoint.
 *
 * Throws a plain `Error` on invalid input so the route handler can
 * translate the message into a 400 response.
 */
export function parseSummaryListQuery(query) {
  const raw = query ?? {}
  const summaryType = _parseSummaryType(raw.type ?? raw.summaryType)
  const limit = _parseLimit(raw.limit)
  return { summaryType, limit }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _parseSummaryType(value) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("type must be a string when provided")
  }
  if (!SUMMARY_TYPE_SET.has(value)) {
    throw new Error(`Unknown summary type: ${value}`)
  }
  return value
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
