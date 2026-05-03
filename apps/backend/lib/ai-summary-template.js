/**
 * Deterministic, conservative AI-summary generator (template-based).
 *
 * Keep this file free of I/O — it is imported by the daily-summary
 * job, the AI summary service, and unit tests. All DB access lives in
 * `services/dao/aiSummaryDao.js`.
 *
 * **Why a template generator as the default?** The Phase 4B plan
 * (`docs/web-mvp-plan.md`) calls for an AI summary pipeline whose
 * output is conservative caregiver-safe wording, sourced from
 * structured input only (recent observations + current baselines —
 * never raw HealthKit / FHIR / free-text). A template generator that
 * derives caregiver-friendly sentences from the same `StructuredSummaryInput`
 * envelope satisfies every shape requirement (caregiver-safe wording,
 * per-row evidence, prompt_version, model identifier) AND keeps the
 * PHI / log surface trivially auditable: there is no LLM round-trip,
 * no API key, no network call, no risk of model output containing
 * PHI in a log line.
 *
 * The function signature is the same one a future Anthropic-backed
 * generator will satisfy:
 *
 *   async generator(input: StructuredSummaryInput, opts?) → {
 *     summary_text: string,
 *     evidence: object,
 *     recommended_actions: { actions: string[] },
 *     model: string,
 *     prompt_version: string,
 *   }
 *
 * Wording rules (per `narthecare-general-healthcare.mdc` AI Safety):
 *   - Summarize, highlight, explain — never diagnose or prescribe.
 *   - Never instruct emergency action ("call 911").
 *   - Suggested next steps are framed as "Consider …" / "Consider
 *     contacting a clinician if this continues."
 *   - Never overstate certainty; never present inference as fact.
 */

import { ALERT_SEVERITIES } from "./alerts.js"

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Identifier persisted onto `ai_summaries.model`. Stable so a
 * regression in copy can be traced back to the generator that
 * produced it.
 */
export const TEMPLATE_GENERATOR_MODEL = "narthecare-template-1"

/**
 * Prompt-version tag persisted onto `ai_summaries.prompt_version`.
 * Bump this string whenever the wording rules in this file change so
 * older rows remain comparable to the version that produced them.
 */
export const TEMPLATE_PROMPT_VERSION = "template-v1"

/**
 * Map deviation classification → caregiver-safe phrase fragment used in
 * the per-metric summary line. Frozen so callers cannot mutate the
 * conservative wording.
 */
const DEVIATION_PHRASES = Object.freeze({
  high: "above the typical range",
  low: "below the typical range",
  in_range: "within the typical range",
  unknown: null,
})

const METRIC_DISPLAY_NAMES = Object.freeze({
  steps: "Steps",
  resting_heart_rate: "Resting heart rate",
  hrv: "Heart-rate variability",
  spo2: "Oxygen saturation",
  sleep_duration: "Sleep duration",
  respiratory_rate: "Respiratory rate",
  walking_steadiness: "Walking steadiness",
})

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Generate a daily summary row from a `StructuredSummaryInput`.
 *
 * Output shape mirrors the columns of `ai_summaries` so the service
 * layer can persist it without reshaping. The `evidence` and
 * `recommended_actions` columns are JSONB on the DB side; we hand
 * back plain objects that the `pg` driver serializes.
 *
 * The generator never mutates its input. It is fully deterministic —
 * the same input always produces the same `summary_text`, which makes
 * idempotent re-runs of the daily job safe (the DAO can dedupe on
 * `(care_recipient_id, summary_type, generated_at)` if a future
 * caller wants to).
 */
export async function generateTemplateDailySummary(input) {
  if (input == null || typeof input !== "object") {
    throw new Error("generateTemplateDailySummary: input is required")
  }
  const lines = [_buildHeaderLine(input)]
  // If every metric is empty, surface the honest single-line empty
  // state rather than a stack of per-metric "no recent readings"
  // lines that would dwarf the actual summary copy.
  const hasAnyReadings = (input.metrics ?? []).some(
    (m) => m?.latest != null && Number.isFinite(m?.latest?.value),
  )
  if (!hasAnyReadings) {
    lines.push(
      "No new readings landed in this window. " +
        "The dashboard will populate as soon as data syncs.",
    )
  } else {
    lines.push(..._buildMetricLines(input.metrics ?? []))
  }
  if (Number.isFinite(input.fallEventCount) && input.fallEventCount > 0) {
    lines.push(_buildFallEventLine(input.fallEventCount))
  }
  lines.push(_DISCLAIMER_LINE)

  const recommendedActions = _buildRecommendedActions(input)

  return {
    summary_text: lines.join("\n\n"),
    evidence: _buildEvidence(input),
    recommended_actions: { actions: recommendedActions },
    model: TEMPLATE_GENERATOR_MODEL,
    prompt_version: TEMPLATE_PROMPT_VERSION,
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

const _DISCLAIMER_LINE =
  "This summary is informational and not a medical diagnosis. " +
  "Consider contacting a clinician for any urgent concerns."

function _buildHeaderLine(input) {
  const window = Number.isFinite(input.windowDays) ? input.windowDays : null
  const range = window != null ? `${window}-day` : "recent"
  return `Daily care summary based on the last ${range} window.`
}

function _buildMetricLines(metrics) {
  const out = []
  for (const m of metrics) {
    const line = _formatMetricLine(m)
    if (line) out.push(line)
  }
  return out
}

function _formatMetricLine(metric) {
  if (metric == null) return null
  const display = METRIC_DISPLAY_NAMES[metric.metricType] ?? metric.metricType
  const latest = metric.latest
  if (latest == null || !Number.isFinite(latest.value)) {
    return `${display}: no recent readings yet.`
  }
  const valueText = _formatValueWithUnit(latest.value, metric.unit)
  const deviation = DEVIATION_PHRASES[metric.deviation] ?? null
  const baseline = metric.baseline
  if (deviation == null) {
    if (baseline?.sampleCount != null && baseline.sampleCount > 0) {
      return `${display}: latest reading was ${valueText}. Baseline still settling (${baseline.sampleCount} reading${baseline.sampleCount === 1 ? "" : "s"} so far).`
    }
    return `${display}: latest reading was ${valueText}. Baseline not yet established.`
  }
  if (metric.deviation === "in_range") {
    return `${display}: latest reading was ${valueText} — ${deviation}.`
  }
  // high / low — use the appropriate baseline percentile in the line.
  const reference =
    metric.deviation === "high" ? baseline?.p90 : baseline?.p10
  const referenceText = Number.isFinite(reference)
    ? _formatValueWithUnit(reference, metric.unit)
    : null
  const tail = referenceText != null ? ` (typical ${metric.deviation === "high" ? "high" : "low"} is around ${referenceText})` : ""
  return `${display}: latest reading was ${valueText} — ${deviation}${tail}.`
}

function _formatValueWithUnit(value, unit) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  const rounded = Number.isInteger(numeric) ? String(numeric) : Number(numeric.toFixed(1)).toString()
  if (!unit) return rounded
  switch (unit) {
    case "percent":
      return `${rounded}%`
    case "bpm":
      return `${rounded} bpm`
    case "ms":
      return `${rounded} ms`
    case "hours":
      return `${rounded} h`
    case "breaths_per_min":
      return `${rounded} breaths/min`
    case "count":
      return `${rounded}`
    case "score":
      return `${rounded}`
    default:
      return `${rounded} ${unit}`
  }
}

function _buildFallEventLine(count) {
  return `${count} fall event${count === 1 ? "" : "s"} reported in this window. Consider checking in with the care recipient.`
}

function _buildRecommendedActions(input) {
  const actions = new Set()
  for (const m of input.metrics ?? []) {
    if (m.deviation === "high" || m.deviation === "low") {
      actions.add(
        "Review the highlighted metric and consider checking in with the care recipient.",
      )
    }
  }
  if (Number.isFinite(input.fallEventCount) && input.fallEventCount > 0) {
    actions.add(
      "A fall event was reported. Check in with the care recipient and consider contacting a clinician if needed.",
    )
  }
  if (actions.size === 0) {
    actions.add("No urgent action suggested. Continue monitoring as usual.")
  }
  return [...actions]
}

function _buildEvidence(input) {
  const ids = input.evidenceIds ?? {}
  return {
    promptVersion: TEMPLATE_PROMPT_VERSION,
    windowDays: input.windowDays ?? null,
    sourceWindowStart: input.sourceWindowStart ?? null,
    sourceWindowEnd: input.sourceWindowEnd ?? null,
    observationIds: Array.isArray(ids.observations) ? [...ids.observations] : [],
    baselineIds: Array.isArray(ids.baselines) ? [...ids.baselines] : [],
    severityHints: _deriveSeverityHints(input),
  }
}

/**
 * Tiny conservative severity hint set mirrored from the rule engine's
 * vocabulary so a downstream UI can color the summary card without
 * re-running the alert engine. Hints are about the structured input
 * only — they are NOT alert rows and do NOT replace the alert engine.
 */
function _deriveSeverityHints(input) {
  const hints = []
  for (const m of input.metrics ?? []) {
    if (m.deviation === "high" || m.deviation === "low") {
      hints.push({
        metricType: m.metricType,
        deviation: m.deviation,
        severity: ALERT_SEVERITIES.monitor,
      })
    }
  }
  if (Number.isFinite(input.fallEventCount) && input.fallEventCount > 0) {
    hints.push({
      metricType: "fall_event",
      deviation: "event",
      severity: ALERT_SEVERITIES.critical,
    })
  }
  return hints
}
