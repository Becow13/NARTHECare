/**
 * Phase 4B alert engine — pure rule definitions.
 *
 * Keep this file free of I/O — it is imported by `alertService` (write
 * side), the `evaluate-alerts` background job, and unit tests. All
 * DB access lives in `services/dao/alertDao.js`.
 *
 * Vocabulary (mirrors `lib/alerts.js`):
 *   severity = `routine` | `monitor` | `critical`
 *   status   = `active` | `acknowledged` | `resolved` (engine writes
 *              `active`; caregiver acks via UI later)
 *
 * Each rule is a small pure function that takes the per-recipient
 * structured input (recent observations + current baselines) and
 * returns zero or more alert candidates. The job layer collects the
 * candidates, hands them to the DAO's `INSERT … ON CONFLICT` so
 * re-runs collapse to one row per (source_type, source_record_id), and
 * audits the count.
 *
 * AI-assisted alerts are NOT in this drop. The plan
 * (`docs/web-mvp-plan.md` Phase 4B) names rule-based first / AI-assisted
 * second — landing the rule engine on its own keeps the PHI / log
 * surface trivially auditable. AI-assisted scoring can layer on top of
 * the same `evaluateAlertRules` shape later.
 *
 * AI safety reminder (per `narthecare-general-healthcare.mdc`):
 *   - Titles and explanations summarize and suggest "consider checking
 *     in" — they MUST NOT diagnose, prescribe, or instruct emergency
 *     action.
 *   - Alert rows live behind the same Cognito + care-team gate as every
 *     other care-recipient-scoped resource. The values themselves are
 *     PHI and stay inside `alerts.*`; `audit_logs.metadata` only ever
 *     carries the count.
 */

import { ALERT_SEVERITIES } from "./alerts.js"
import { METRIC_TYPES } from "./health-observations.js"
import { BASELINE_WINDOW_DAYS } from "./metric-baselines.js"

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Stable category strings persisted in `alerts.category`. Frozen so
 * downstream consumers (web rendering, audit dashboards) can switch on
 * them without worrying about typos.
 */
export const ALERT_CATEGORIES = Object.freeze({
  fallEvent: "fall_event",
  restingHeartRateElevated: "resting_heart_rate.elevated",
  restingHeartRateLow: "resting_heart_rate.low",
  hrvLow: "hrv.low",
  spo2Low: "spo2.low",
  walkingSteadinessDeclining: "walking_steadiness.declining",
})

/**
 * `source_type` value the engine writes onto every alert row it creates.
 * Lets ops queries answer "show me all engine-derived alerts" in one
 * `WHERE source_type = 'rule_engine'`. Fall events are still derived
 * ("we noticed it; here is a caregiver-facing alert about it") so they
 * use the same source_type — the source observation's id is encoded
 * into `source_record_id` for traceability.
 */
export const ALERT_SOURCE_TYPE_RULE_ENGINE = "rule_engine"

/**
 * SpO2 threshold (percent) below which a `spo2.low` excursion escalates
 * from `monitor` to `critical`. 92 is the conservative "consider
 * contacting a clinician" floor commonly cited in pulse-oximetry
 * caregiver guidance — kept as a constant so a future product
 * decision can adjust it in one place. Not a diagnostic threshold.
 */
export const SPO2_CRITICAL_THRESHOLD = 92

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Evaluate every Phase 4B rule against a recipient's recent
 * observations and current baselines.
 *
 * Inputs (all already gated by `requireCareRecipientAccess` upstream):
 *   - `observations`: recent observation rows for this recipient
 *     (newest-first preferred but not required).
 *   - `baselines`: every baseline row this recipient has — the engine
 *     picks the right (metric, window) tuple per rule.
 *   - `now`: reference Date (injected for deterministic tests).
 *
 * Returns `{ alerts: [...] }` where each alert is shaped 1:1 for the
 * `alerts` table insert. The function NEVER touches the DB and NEVER
 * logs — both responsibilities live in `alertService`. Empty inputs
 * trivially return `{ alerts: [] }` so callers can run the engine on
 * a brand-new recipient without branching.
 */
export function evaluateAlertRules({
  observations = [],
  baselines = [],
  now = new Date(),
} = {}) {
  const baselineIndex = _indexBaselines(baselines)
  const obsByMetric = _indexObservationsByMetric(observations)

  const alerts = [
    ..._evaluateFallEvents(obsByMetric.get(METRIC_TYPES.fallEvent) ?? []),
    ..._evaluateOutOfBand({
      latest: _firstOrNull(obsByMetric.get(METRIC_TYPES.restingHeartRate)),
      baseline: baselineIndex.get(
        _baselineKey(METRIC_TYPES.restingHeartRate, BASELINE_WINDOW_DAYS.default),
      ),
      categoryHigh: ALERT_CATEGORIES.restingHeartRateElevated,
      categoryLow: ALERT_CATEGORIES.restingHeartRateLow,
      titleHigh: "Resting heart rate above usual range",
      titleLow: "Resting heart rate below usual range",
      severity: ALERT_SEVERITIES.monitor,
    }),
    ..._evaluateBelowP10({
      latest: _firstOrNull(obsByMetric.get(METRIC_TYPES.hrv)),
      baseline: baselineIndex.get(
        _baselineKey(METRIC_TYPES.hrv, BASELINE_WINDOW_DAYS.default),
      ),
      category: ALERT_CATEGORIES.hrvLow,
      title: "Heart-rate variability below usual range",
      severity: ALERT_SEVERITIES.monitor,
    }),
    ..._evaluateSpo2Low({
      latest: _firstOrNull(obsByMetric.get(METRIC_TYPES.spo2)),
      baseline: baselineIndex.get(
        _baselineKey(METRIC_TYPES.spo2, BASELINE_WINDOW_DAYS.default),
      ),
    }),
    ..._evaluateWalkingSteadinessDecline({
      shortBaseline: baselineIndex.get(
        _baselineKey(
          METRIC_TYPES.walkingSteadiness,
          BASELINE_WINDOW_DAYS.weekly,
        ),
      ),
      longBaseline: baselineIndex.get(
        _baselineKey(
          METRIC_TYPES.walkingSteadiness,
          BASELINE_WINDOW_DAYS.monthly,
        ),
      ),
      now,
    }),
  ]

  return { alerts }
}

// ─── Individual rules ───────────────────────────────────────────────────────

/**
 * Every fall_event observation becomes one critical alert. Dedupe key
 * is the observation's `source_record_id` so re-running the engine
 * against the same data collapses to the same alert row.
 */
function _evaluateFallEvents(fallObservations) {
  const out = []
  for (const obs of fallObservations) {
    const sourceRecordId = obs.source_record_id ?? null
    if (!sourceRecordId) continue
    out.push({
      severity: ALERT_SEVERITIES.critical,
      category: ALERT_CATEGORIES.fallEvent,
      title: "Possible fall detected",
      explanation:
        "A fall event was reported by a connected device. " +
        "Consider checking in with the care recipient.",
      status: "active",
      observed_at: _toIso(obs.observed_at),
      source_type: ALERT_SOURCE_TYPE_RULE_ENGINE,
      source_record_id: `fall:${sourceRecordId}`,
      metadata: {
        rule: ALERT_CATEGORIES.fallEvent,
        sourceObservationId: obs.id ?? null,
        deviceSourceType: obs.source_type ?? null,
      },
    })
  }
  return out
}

/**
 * Out-of-band rule: emit an alert if `latest.value_numeric` falls
 * outside `[baseline.p10_numeric, baseline.p90_numeric]`. Used for
 * resting heart rate where both directions are interesting.
 */
function _evaluateOutOfBand({
  latest,
  baseline,
  categoryHigh,
  categoryLow,
  titleHigh,
  titleLow,
  severity,
}) {
  if (!_isReadyBaseline(baseline) || !_isFiniteNumber(latest?.value_numeric)) {
    return []
  }
  const value = Number(latest.value_numeric)
  const p10 = Number(baseline.p10_numeric)
  const p90 = Number(baseline.p90_numeric)
  if (value > p90) {
    return [
      _bucketedAlert({
        severity,
        category: categoryHigh,
        title: titleHigh,
        explanation: _outOfBandExplanation({ value, p10, p90, direction: "high" }),
        observation: latest,
        baseline,
      }),
    ]
  }
  if (value < p10) {
    return [
      _bucketedAlert({
        severity,
        category: categoryLow,
        title: titleLow,
        explanation: _outOfBandExplanation({ value, p10, p90, direction: "low" }),
        observation: latest,
        baseline,
      }),
    ]
  }
  return []
}

/**
 * Below-p10 rule: only the low side is interesting (HRV, where lower
 * indicates higher autonomic load).
 */
function _evaluateBelowP10({ latest, baseline, category, title, severity }) {
  if (!_isReadyBaseline(baseline) || !_isFiniteNumber(latest?.value_numeric)) {
    return []
  }
  const value = Number(latest.value_numeric)
  const p10 = Number(baseline.p10_numeric)
  if (value >= p10) return []
  return [
    _bucketedAlert({
      severity,
      category,
      title,
      explanation:
        `Latest reading was ${_fmt(value)} (typical low is around ${_fmt(p10)}). ` +
        "Consider checking in with the care recipient.",
      observation: latest,
      baseline,
    }),
  ]
}

/**
 * SpO2 has a clinical-floor escalation: below the personal p10 is a
 * `monitor` alert; below `SPO2_CRITICAL_THRESHOLD` is `critical`. The
 * engine never says "this is dangerous" — only "consider contacting a
 * clinician" — per the AI safety rules.
 */
function _evaluateSpo2Low({ latest, baseline }) {
  if (!_isFiniteNumber(latest?.value_numeric)) return []
  const value = Number(latest.value_numeric)
  const baselineReady = _isReadyBaseline(baseline)
  const belowP10 = baselineReady && value < Number(baseline.p10_numeric)
  const belowFloor = value < SPO2_CRITICAL_THRESHOLD
  if (!belowP10 && !belowFloor) return []
  const severity = belowFloor
    ? ALERT_SEVERITIES.critical
    : ALERT_SEVERITIES.monitor
  const explanation = belowFloor
    ? `Latest oxygen saturation reading was ${_fmt(value)}%. ` +
      "Consider contacting a clinician if this continues."
    : `Latest oxygen saturation reading was ${_fmt(value)}% — below the typical low of ${_fmt(
        baseline.p10_numeric,
      )}%. Consider checking in with the care recipient.`
  return [
    _bucketedAlert({
      severity,
      category: ALERT_CATEGORIES.spo2Low,
      title: belowFloor
        ? "Oxygen saturation below 92%"
        : "Oxygen saturation below usual range",
      explanation,
      observation: latest,
      baseline: baselineReady ? baseline : null,
    }),
  ]
}

/**
 * Walking steadiness "declining" rule: the short-window baseline
 * median (`p50`) sits below the long-window p10. Sustained drift
 * downward — Apple's own steadiness signal is already a risk score, so
 * this does not need a per-sample comparison. Dedupe bucket is the
 * day of `now` (the job's reference clock).
 */
function _evaluateWalkingSteadinessDecline({ shortBaseline, longBaseline, now }) {
  if (!_isReadyBaseline(shortBaseline) || !_isReadyBaseline(longBaseline)) {
    return []
  }
  const shortP50 = Number(shortBaseline.p50_numeric)
  const longP10 = Number(longBaseline.p10_numeric)
  if (shortP50 >= longP10) return []
  const observedAt = _toIso(now)
  return [
    {
      severity: ALERT_SEVERITIES.monitor,
      category: ALERT_CATEGORIES.walkingSteadinessDeclining,
      title: "Walking steadiness trending down",
      explanation:
        "The 7-day walking-steadiness median has fallen below the 30-day low. " +
        "Consider checking in with the care recipient about mobility.",
      status: "active",
      observed_at: observedAt,
      source_type: ALERT_SOURCE_TYPE_RULE_ENGINE,
      source_record_id: `${ALERT_CATEGORIES.walkingSteadinessDeclining}:${_dayBucket(
        observedAt,
      )}`,
      metadata: {
        rule: ALERT_CATEGORIES.walkingSteadinessDeclining,
        shortP50,
        longP10,
      },
    },
  ]
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Build the alert envelope shared by the threshold rules. The dedupe
 * key collapses repeated job runs on the same evidence day to a single
 * row — fresh excursions on a later day produce a fresh alert because
 * the bucket key changes.
 */
function _bucketedAlert({
  severity,
  category,
  title,
  explanation,
  observation,
  baseline,
}) {
  const observedAt = _toIso(observation.observed_at)
  return {
    severity,
    category,
    title,
    explanation,
    status: "active",
    observed_at: observedAt,
    source_type: ALERT_SOURCE_TYPE_RULE_ENGINE,
    source_record_id: `${category}:${_dayBucket(observedAt)}`,
    metadata: {
      rule: category,
      observationValue: Number(observation.value_numeric),
      observationUnit: observation.value_unit ?? null,
      baselineP10: baseline?.p10_numeric ?? null,
      baselineP50: baseline?.p50_numeric ?? null,
      baselineP90: baseline?.p90_numeric ?? null,
      baselineWindowDays: baseline?.window_days ?? null,
    },
  }
}

function _outOfBandExplanation({ value, p10, p90, direction }) {
  const tail = direction === "high" ? `above the typical ${_fmt(p90)}` : `below the typical ${_fmt(p10)}`
  return (
    `Latest reading was ${_fmt(value)} (${tail}). ` +
    "Consider checking in with the care recipient."
  )
}

function _indexBaselines(baselines) {
  const map = new Map()
  for (const b of baselines) {
    if (b == null) continue
    const w = Number(b.window_days)
    if (!Number.isFinite(w)) continue
    map.set(_baselineKey(b.metric_type, w), b)
  }
  return map
}

function _baselineKey(metricType, windowDays) {
  return `${metricType}|${windowDays}`
}

/**
 * Group recent observations by metric_type so each rule grabs its own
 * slice without re-walking the array. Within each group we sort
 * newest-first so `_firstOrNull` returns the latest sample.
 */
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

function _firstOrNull(list) {
  if (!Array.isArray(list) || list.length === 0) return null
  return list[0]
}

function _isReadyBaseline(b) {
  return (
    b != null &&
    _isFiniteNumber(b.p10_numeric) &&
    _isFiniteNumber(b.p50_numeric) &&
    _isFiniteNumber(b.p90_numeric)
  )
}

function _isFiniteNumber(value) {
  if (value == null) return false
  const n = Number(value)
  return Number.isFinite(n)
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
  throw new Error("alert-rules: observation timestamp must be Date / ISO / number")
}

function _toMs(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "string") return Date.parse(value)
  if (typeof value === "number" && Number.isFinite(value)) return value
  return 0
}

function _dayBucket(iso) {
  return iso.slice(0, 10) // YYYY-MM-DD; ISO is always UTC at this point.
}

function _fmt(n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return String(n)
  // Trim trailing zeros so "62" reads cleanly but "62.5" keeps its tail.
  return Number.isInteger(num) ? String(num) : Number(num.toFixed(1)).toString()
}
