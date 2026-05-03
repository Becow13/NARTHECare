/**
 * AI summary input shaping — pure helpers.
 *
 * Keep this file free of I/O — it is imported by the daily-summary job,
 * the AI summary service, and unit tests. All DB access lives in
 * `services/dao/aiSummaryDao.js`.
 *
 * **Why a dedicated shaping layer?** Per the AI Safety Rules in
 * `narthecare-general-healthcare.mdc`, AI generation MUST be fed a
 * minimized, structured view of the data — not raw HealthKit dumps,
 * not raw FHIR payloads, not free-text caregiver notes. This module
 * is the single seam where we collapse `health_observations` rows
 * and `metric_baselines` rows into a small, deterministic JSON
 * envelope. Any future provider (template, Claude, …) consumes the
 * same envelope so we never accidentally widen the prompt surface.
 *
 * Output shape (`StructuredSummaryInput`):
 *
 * ```
 * {
 *   careRecipientId: "<uuid>",
 *   windowDays: 14,
 *   generatedAt: "<iso>",
 *   sourceWindowStart: "<iso>",
 *   sourceWindowEnd:   "<iso>",
 *   metrics: [
 *     {
 *       metricType: "resting_heart_rate",
 *       unit: "bpm",
 *       latest:  { value: 72, observedAt: "<iso>", evidenceId: "<uuid>" } | null,
 *       baseline: {
 *         windowDays: 14,
 *         p10: 60, p50: 65, p90: 72,
 *         sampleCount: 18,
 *         evidenceId: "<uuid>",
 *       } | null,
 *       deviation: "high" | "low" | "in_range" | "unknown",
 *     },
 *     ...
 *   ],
 *   evidenceIds: { observations: ["<uuid>", ...], baselines: ["<uuid>", ...] },
 * }
 * ```
 *
 * `evidenceIds` is the citation envelope persisted onto the
 * `ai_summaries.evidence` column so a caregiver-facing UI can later
 * trace any sentence back to a concrete row. No values, no text, no
 * names — internal UUIDs only.
 */

import { METRIC_TYPES, METRIC_UNITS } from "./health-observations.js"
import { BASELINE_WINDOW_DAYS } from "./metric-baselines.js"

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Metrics the daily summary considers. Mirrors the rule engine's
 * coverage but adds `sleep_duration` and `steps` (both meaningful for
 * a daily caregiver rollup even when no rule fires). `fall_event` is
 * surfaced via a separate "events" channel inside the input — counts
 * only, never per-event ids in the input envelope.
 */
export const SUMMARY_METRIC_TYPES = Object.freeze([
  METRIC_TYPES.steps,
  METRIC_TYPES.restingHeartRate,
  METRIC_TYPES.hrv,
  METRIC_TYPES.spo2,
  METRIC_TYPES.sleepDuration,
  METRIC_TYPES.respiratoryRate,
  METRIC_TYPES.walkingSteadiness,
])

/** Default summary window (days). Matches `BASELINE_WINDOW_DAYS.default`. */
export const SUMMARY_DEFAULT_WINDOW_DAYS = BASELINE_WINDOW_DAYS.default

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Build the structured input for a daily AI summary from the raw
 * service-layer reads.
 *
 * Inputs:
 *   - `recipientId`: care recipient id (echoed back so a generator
 *     working on a batch can attribute its output without re-deriving).
 *   - `observations`: rows from `health_observations` for this
 *     recipient over the summary window (any newer-than-window slice
 *     is fine — this function trims internally).
 *   - `baselines`: rows from `metric_baselines` for this recipient
 *     (any window mix; the function picks the right window).
 *   - `now`: reference Date (injected for deterministic tests).
 *   - `windowDays`: window the summary should reason over (default 14).
 *
 * Returns the `StructuredSummaryInput` envelope above. Empty inputs
 * trivially produce `metrics: []` + empty `evidenceIds` so generators
 * can render an honest "no data yet" message without branching.
 *
 * The function is **PHI-aware but not PHI-free** by design — its
 * output IS the prompt body and IS the structured input the
 * `ai_summaries` row is derived from. Both live behind the same
 * Cognito + care-team gate as the underlying observations. What this
 * function MUST NOT do is leak PHI into the audit metadata or any
 * log line — that responsibility is on the service layer.
 */
export function buildStructuredSummaryInput({
  recipientId,
  observations = [],
  baselines = [],
  now = new Date(),
  windowDays = SUMMARY_DEFAULT_WINDOW_DAYS,
} = {}) {
  if (!_isFiniteInteger(windowDays) || windowDays <= 0) {
    throw new Error("windowDays must be a positive integer")
  }
  const generatedAt = _toIso(now)
  const sourceWindowEnd = generatedAt
  const sourceWindowStart = new Date(
    _toMs(generatedAt) - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  const inWindow = observations.filter((o) => {
    const t = _toMs(o?.observed_at)
    return Number.isFinite(t) && t >= _toMs(sourceWindowStart)
  })

  const baselineByMetric = _indexBaselinesByMetricForWindow(baselines, windowDays)
  const observationsByMetric = _indexObservationsByMetric(inWindow)

  const observationEvidenceIds = []
  const baselineEvidenceIds = []
  const metrics = []
  for (const metricType of SUMMARY_METRIC_TYPES) {
    const list = observationsByMetric.get(metricType) ?? []
    const latest = list[0] ?? null // already newest-first
    const baseline = baselineByMetric.get(metricType) ?? null
    const entry = _buildMetricEntry({ metricType, latest, baseline })
    metrics.push(entry)
    if (latest?.id) observationEvidenceIds.push(latest.id)
    if (baseline?.id) baselineEvidenceIds.push(baseline.id)
  }

  // Fall events — counts only, no per-event ids (those would just be
  // PHI-equivalent timestamps in another shape).
  const fallEvents = observationsByMetric.get(METRIC_TYPES.fallEvent) ?? []
  const fallEventCount = fallEvents.length

  return {
    careRecipientId: recipientId ?? null,
    windowDays,
    generatedAt,
    sourceWindowStart,
    sourceWindowEnd,
    metrics,
    fallEventCount,
    evidenceIds: {
      observations: observationEvidenceIds,
      baselines: baselineEvidenceIds,
    },
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _buildMetricEntry({ metricType, latest, baseline }) {
  const unit = _unitForMetric(metricType)
  const latestEntry = latest
    ? {
        value: Number(latest.value_numeric),
        observedAt: _toIso(latest.observed_at),
        evidenceId: latest.id ?? null,
      }
    : null
  const baselineEntry = _buildBaselineEntry(baseline)
  return {
    metricType,
    unit,
    latest: latestEntry,
    baseline: baselineEntry,
    deviation: _classifyDeviation(latestEntry, baselineEntry),
  }
}

function _buildBaselineEntry(baseline) {
  if (baseline == null) return null
  const p10 = _numberOrNull(baseline.p10_numeric)
  const p50 = _numberOrNull(baseline.p50_numeric)
  const p90 = _numberOrNull(baseline.p90_numeric)
  const sampleCount = _isFiniteInteger(baseline.sample_count)
    ? Number(baseline.sample_count)
    : 0
  return {
    windowDays: Number(baseline.window_days),
    p10,
    p50,
    p90,
    sampleCount,
    evidenceId: baseline.id ?? null,
  }
}

function _classifyDeviation(latest, baseline) {
  if (latest == null) return "unknown"
  if (baseline == null) return "unknown"
  if (
    !Number.isFinite(baseline.p10) ||
    !Number.isFinite(baseline.p90) ||
    !Number.isFinite(latest.value)
  ) {
    return "unknown"
  }
  if (latest.value > baseline.p90) return "high"
  if (latest.value < baseline.p10) return "low"
  return "in_range"
}

function _indexObservationsByMetric(observations) {
  const map = new Map()
  for (const obs of observations) {
    if (obs == null || typeof obs.metric_type !== "string") continue
    const list = map.get(obs.metric_type) ?? []
    list.push(obs)
    map.set(obs.metric_type, list)
  }
  for (const list of map.values()) {
    list.sort((a, b) => _toMs(b.observed_at) - _toMs(a.observed_at))
  }
  return map
}

function _indexBaselinesByMetricForWindow(baselines, windowDays) {
  const map = new Map()
  for (const b of baselines) {
    if (b == null || typeof b.metric_type !== "string") continue
    if (Number(b.window_days) !== windowDays) continue
    map.set(b.metric_type, b)
  }
  return map
}

function _unitForMetric(metricType) {
  switch (metricType) {
    case METRIC_TYPES.steps:
      return METRIC_UNITS.count
    case METRIC_TYPES.restingHeartRate:
      return METRIC_UNITS.bpm
    case METRIC_TYPES.hrv:
      return METRIC_UNITS.ms
    case METRIC_TYPES.spo2:
      return METRIC_UNITS.percent
    case METRIC_TYPES.sleepDuration:
      return METRIC_UNITS.hours
    case METRIC_TYPES.respiratoryRate:
      return METRIC_UNITS.breathsPerMin
    case METRIC_TYPES.walkingSteadiness:
      return METRIC_UNITS.score
    default:
      return null
  }
}

function _numberOrNull(value) {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function _isFiniteInteger(value) {
  if (typeof value === "number") return Number.isFinite(value) && Number.isInteger(value)
  if (typeof value === "string" && value !== "") {
    const n = Number(value)
    return Number.isFinite(n) && Number.isInteger(n)
  }
  return false
}

function _toIso(value) {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString()
  }
  throw new Error("ai-summary-input: timestamp must be Date / ISO / number")
}

function _toMs(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") return Date.parse(value)
  if (typeof value === "number" && Number.isFinite(value)) return value
  return NaN
}
