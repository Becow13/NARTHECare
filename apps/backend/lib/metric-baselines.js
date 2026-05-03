/**
 * Metric-baseline read-side parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, the future Phase 4B nightly recompute job, and unit
 * tests, so it must be safe to import from any context without side
 * effects. All DB access lives in `services/dao/metricBaselineDao.js`.
 *
 * Phase 4 only ships the **read** surface; Phase 4B writes one row per
 * `(care_recipient_id, metric_type, window_days)` tuple from a nightly
 * job that reads `health_observations`.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Canonical baseline window sizes (days). 14 is the Phase 1 default per
 * `narthecare-phase1-plan.mdc#4 Nightly Baseline Job`; 7 and 30 are
 * reserved so the same table can hold short-burst and longitudinal
 * baselines without a schema change.
 */
export const BASELINE_WINDOW_DAYS = Object.freeze({
  weekly: 7,
  default: 14,
  monthly: 30,
})

/** The set of accepted window_days values for query validation. */
const BASELINE_WINDOW_SET = new Set(Object.values(BASELINE_WINDOW_DAYS))

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?metricType=&windowDays=` query string for the list
 * endpoint into DB-ready filters.
 *
 * `metricType` is validated against the same `METRIC_TYPES` set that
 * `health_observations` uses — the function takes the set as an argument
 * so this module does not import `health-observations.js` (avoids a
 * cycle if observations ever need a baseline-aware helper).
 */
export function parseBaselineListQuery(query, allowedMetricTypeSet) {
  const raw = query ?? {}
  const metricType = _parseMetricType(
    raw.metricType ?? raw.metric_type,
    allowedMetricTypeSet,
  )
  const windowDays = _parseWindowDays(raw.windowDays ?? raw.window_days)
  return { metricType, windowDays }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _parseMetricType(value, allowedSet) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("metricType must be a string when provided")
  }
  if (allowedSet instanceof Set && !allowedSet.has(value)) {
    throw new Error(`Unknown metricType: ${value}`)
  }
  return value
}

function _parseWindowDays(value) {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("windowDays must be a positive integer when provided")
  }
  if (!BASELINE_WINDOW_SET.has(n)) {
    throw new Error(`Unsupported windowDays: ${n}`)
  }
  return n
}
