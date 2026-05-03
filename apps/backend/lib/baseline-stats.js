/**
 * Baseline statistics — pure percentile + windowing helpers.
 *
 * Keep this file free of I/O — it is imported by the Phase 4B nightly
 * recompute job, the alert engine (for threshold-vs-baseline checks),
 * and unit tests, so it must be safe to import from any context without
 * side effects. All DB access lives in `services/dao/metricBaselineDao.js`
 * and `services/dao/healthObservationDao.js`.
 *
 * Algorithm choice: linear-interpolation percentile (NumPy / Excel
 * `PERCENTILE.INC` shape) so the same input always produces the same
 * `p10 / p50 / p90` triple regardless of node arithmetic order. We
 * deliberately do NOT pull in a stats package for three values — it
 * would expand the dependency surface for a function that fits in a
 * few lines.
 */

import { METRIC_TYPES } from "./health-observations.js"
import { BASELINE_WINDOW_DAYS } from "./metric-baselines.js"

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Subset of `METRIC_TYPES` whose values are continuous / ordinal and
 * therefore benefit from a percentile baseline. `fall_event` is a
 * binary occurrence count — its baseline is always "0 falls expected"
 * so the alert engine treats every event as significant on its own and
 * does not need a `metric_baselines` row for it.
 */
export const BASELINE_METRIC_TYPES = Object.freeze([
  METRIC_TYPES.steps,
  METRIC_TYPES.restingHeartRate,
  METRIC_TYPES.hrv,
  METRIC_TYPES.spo2,
  METRIC_TYPES.sleepDuration,
  METRIC_TYPES.respiratoryRate,
  METRIC_TYPES.walkingSteadiness,
])

/**
 * Windows the nightly job recomputes. Mirrors the schema-side
 * `BASELINE_WINDOW_DAYS` constants from `lib/metric-baselines.js` so the
 * job and the read endpoint can never disagree on which buckets exist.
 */
export const BASELINE_WINDOWS = Object.freeze([
  BASELINE_WINDOW_DAYS.weekly,
  BASELINE_WINDOW_DAYS.default,
  BASELINE_WINDOW_DAYS.monthly,
])

/**
 * Minimum samples required before percentile values are populated.
 * Below this we still upsert the baseline row (so `sample_count` is
 * trustworthy for "no data yet" UI), but `p10 / p50 / p90` come out
 * `null` so a thin sample never produces a misleadingly tight
 * baseline that the alert engine would then trip on.
 */
export const MIN_SAMPLES_FOR_PERCENTILES = 5

// ─── Time helpers ───────────────────────────────────────────────────────────

/**
 * ISO timestamp `now - windowDays * 24h`. The job passes `now` in
 * explicitly so tests are deterministic and a long-running job uses a
 * single reference clock for every recipient.
 */
export function windowStartIso(now, windowDays) {
  const ts = _toMs(now)
  if (!Number.isFinite(ts)) {
    throw new Error("windowStartIso: `now` must be a Date or ISO string")
  }
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new Error("windowStartIso: `windowDays` must be a positive integer")
  }
  return new Date(ts - windowDays * 24 * 60 * 60 * 1000).toISOString()
}

// ─── Percentile math ────────────────────────────────────────────────────────

/**
 * Compute `{ p10, p50, p90, sampleCount }` from a numeric array.
 *
 * Skips non-finite entries (covers the rare HealthKit row whose
 * `value_numeric` somehow landed as `NaN` despite the parser guard).
 * Returns `null` percentiles when fewer than `MIN_SAMPLES_FOR_PERCENTILES`
 * usable values remain — `sample_count` still reflects what landed in
 * the table so the caller can show "X readings collected (need Y for a
 * stable baseline)" without re-reading the observations.
 */
export function computeBaseline(values) {
  const finite = values.filter((v) => Number.isFinite(v))
  const sampleCount = finite.length
  if (sampleCount < MIN_SAMPLES_FOR_PERCENTILES) {
    return { p10: null, p50: null, p90: null, sampleCount }
  }
  const sorted = [...finite].sort((a, b) => a - b)
  return {
    p10: _percentile(sorted, 10),
    p50: _percentile(sorted, 50),
    p90: _percentile(sorted, 90),
    sampleCount,
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _toMs(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") return Date.parse(value)
  if (typeof value === "number" && Number.isFinite(value)) return value
  return NaN
}

/**
 * Linear-interpolation percentile (PERCENTILE.INC). `sorted` must be
 * pre-sorted ascending and non-empty; both invariants are enforced by
 * `computeBaseline`'s `MIN_SAMPLES_FOR_PERCENTILES` gate.
 */
function _percentile(sorted, p) {
  const n = sorted.length
  if (n === 1) return sorted[0]
  const rank = (p / 100) * (n - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) return sorted[lower]
  const weight = rank - lower
  return sorted[lower] + weight * (sorted[upper] - sorted[lower])
}
