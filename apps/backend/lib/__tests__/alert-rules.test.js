import test from "node:test"
import assert from "node:assert/strict"
import {
  ALERT_CATEGORIES,
  ALERT_SOURCE_TYPE_RULE_ENGINE,
  SPO2_CRITICAL_THRESHOLD,
  evaluateAlertRules,
} from "../alert-rules.js"

const NOW = new Date("2026-04-25T12:00:00.000Z")

function obs(overrides = {}) {
  return {
    id: "obs-1",
    metric_type: "resting_heart_rate",
    value_numeric: 70,
    value_unit: "bpm",
    observed_at: "2026-04-25T08:00:00.000Z",
    source_type: "healthkit",
    source_record_id: "hk-rec-1",
    ...overrides,
  }
}

function baseline(overrides = {}) {
  return {
    metric_type: "resting_heart_rate",
    window_days: 14,
    p10_numeric: 60,
    p50_numeric: 65,
    p90_numeric: 72,
    sample_count: 14,
    ...overrides,
  }
}

// ─── Surface ───────────────────────────────────────────────────────────────

test("ALERT_CATEGORIES is frozen and includes the Phase 4B rule names", () => {
  assert.ok(Object.isFrozen(ALERT_CATEGORIES))
  assert.equal(ALERT_CATEGORIES.fallEvent, "fall_event")
  assert.equal(ALERT_CATEGORIES.restingHeartRateElevated, "resting_heart_rate.elevated")
  assert.equal(ALERT_CATEGORIES.spo2Low, "spo2.low")
  assert.equal(ALERT_CATEGORIES.walkingSteadinessDeclining, "walking_steadiness.declining")
})

test("ALERT_SOURCE_TYPE_RULE_ENGINE is the engine's stable source_type tag", () => {
  assert.equal(ALERT_SOURCE_TYPE_RULE_ENGINE, "rule_engine")
})

test("evaluateAlertRules returns empty alerts for empty inputs", () => {
  assert.deepEqual(evaluateAlertRules({ now: NOW }), { alerts: [] })
  assert.deepEqual(
    evaluateAlertRules({ observations: [], baselines: [], now: NOW }),
    { alerts: [] },
  )
})

// ─── Fall events ───────────────────────────────────────────────────────────

test("each fall_event observation produces one critical alert keyed by source_record_id", () => {
  const observations = [
    obs({
      id: "obs-fall-1",
      metric_type: "fall_event",
      value_unit: "event",
      value_numeric: 1,
      source_record_id: "hk-fall-abc",
    }),
    obs({
      id: "obs-fall-2",
      metric_type: "fall_event",
      value_unit: "event",
      value_numeric: 1,
      source_record_id: "hk-fall-def",
      observed_at: "2026-04-25T09:30:00.000Z",
    }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines: [], now: NOW })
  assert.equal(alerts.length, 2)
  for (const a of alerts) {
    assert.equal(a.severity, "critical")
    assert.equal(a.category, ALERT_CATEGORIES.fallEvent)
    assert.equal(a.source_type, ALERT_SOURCE_TYPE_RULE_ENGINE)
    assert.equal(a.title, "Possible fall detected")
    assert.match(a.source_record_id, /^fall:hk-fall-/)
    // Conservative wording — must NOT diagnose or instruct emergency action.
    assert.doesNotMatch(a.explanation, /emergency|call 911|diagnos/i)
  }
})

test("fall_event observations missing source_record_id are silently skipped (cannot dedupe safely)", () => {
  const observations = [
    obs({
      metric_type: "fall_event",
      value_numeric: 1,
      value_unit: "event",
      source_record_id: null,
    }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines: [], now: NOW })
  assert.deepEqual(alerts, [])
})

// ─── Resting heart rate ────────────────────────────────────────────────────

test("resting_heart_rate above p90 fires a monitor alert with day-bucket dedupe key", () => {
  const observations = [obs({ metric_type: "resting_heart_rate", value_numeric: 95 })]
  const baselines = [baseline()]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.equal(alerts.length, 1)
  const a = alerts[0]
  assert.equal(a.severity, "monitor")
  assert.equal(a.category, ALERT_CATEGORIES.restingHeartRateElevated)
  assert.equal(a.source_record_id, "resting_heart_rate.elevated:2026-04-25")
  assert.match(a.explanation, /above the typical 72/)
})

test("resting_heart_rate below p10 fires a monitor alert with the low category", () => {
  const observations = [obs({ metric_type: "resting_heart_rate", value_numeric: 50 })]
  const baselines = [baseline()]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].category, ALERT_CATEGORIES.restingHeartRateLow)
  assert.match(alerts[0].explanation, /below the typical 60/)
})

test("resting_heart_rate inside [p10, p90] produces no alert", () => {
  const observations = [obs({ metric_type: "resting_heart_rate", value_numeric: 65 })]
  const baselines = [baseline()]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.deepEqual(alerts, [])
})

test("resting_heart_rate alert is suppressed when baseline percentiles are null (not enough samples)", () => {
  const observations = [obs({ value_numeric: 100 })]
  const baselines = [baseline({ p10_numeric: null, p50_numeric: null, p90_numeric: null })]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.deepEqual(alerts, [])
})

// ─── HRV ───────────────────────────────────────────────────────────────────

test("HRV below p10 fires a monitor alert with the hrv.low category", () => {
  const observations = [
    obs({ metric_type: "hrv", value_numeric: 18, value_unit: "ms" }),
  ]
  const baselines = [
    baseline({ metric_type: "hrv", p10_numeric: 25, p50_numeric: 35, p90_numeric: 50 }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].category, ALERT_CATEGORIES.hrvLow)
  assert.equal(alerts[0].severity, "monitor")
})

test("HRV above p10 produces no alert (only the low side is interesting)", () => {
  const observations = [
    obs({ metric_type: "hrv", value_numeric: 60, value_unit: "ms" }),
  ]
  const baselines = [
    baseline({ metric_type: "hrv", p10_numeric: 25, p50_numeric: 35, p90_numeric: 50 }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.deepEqual(alerts, [])
})

// ─── SpO2 ──────────────────────────────────────────────────────────────────

test(`SpO2 below ${SPO2_CRITICAL_THRESHOLD} escalates to critical even without a baseline`, () => {
  const observations = [
    obs({ metric_type: "spo2", value_numeric: 89, value_unit: "percent" }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines: [], now: NOW })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].severity, "critical")
  assert.equal(alerts[0].category, ALERT_CATEGORIES.spo2Low)
  assert.match(alerts[0].explanation, /Consider contacting a clinician/)
})

test("SpO2 above the critical threshold but below personal p10 fires a monitor alert", () => {
  const observations = [
    obs({ metric_type: "spo2", value_numeric: 94, value_unit: "percent" }),
  ]
  const baselines = [
    baseline({
      metric_type: "spo2",
      p10_numeric: 95,
      p50_numeric: 97,
      p90_numeric: 99,
    }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].severity, "monitor")
})

test("SpO2 within personal range and above the floor produces no alert", () => {
  const observations = [
    obs({ metric_type: "spo2", value_numeric: 97, value_unit: "percent" }),
  ]
  const baselines = [
    baseline({
      metric_type: "spo2",
      p10_numeric: 95,
      p50_numeric: 97,
      p90_numeric: 99,
    }),
  ]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.deepEqual(alerts, [])
})

// ─── Walking steadiness ────────────────────────────────────────────────────

test("walking_steadiness short-window p50 below long-window p10 fires a monitor alert", () => {
  const baselines = [
    baseline({
      metric_type: "walking_steadiness",
      window_days: 7,
      p10_numeric: 0.5,
      p50_numeric: 0.55,
      p90_numeric: 0.6,
    }),
    baseline({
      metric_type: "walking_steadiness",
      window_days: 30,
      p10_numeric: 0.7,
      p50_numeric: 0.75,
      p90_numeric: 0.8,
    }),
  ]
  const { alerts } = evaluateAlertRules({ observations: [], baselines, now: NOW })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].category, ALERT_CATEGORIES.walkingSteadinessDeclining)
  assert.equal(alerts[0].source_record_id, "walking_steadiness.declining:2026-04-25")
  assert.equal(alerts[0].observed_at, NOW.toISOString())
})

test("walking_steadiness rule is silent when either window is missing percentiles", () => {
  const baselines = [
    baseline({
      metric_type: "walking_steadiness",
      window_days: 7,
      p10_numeric: 0.5,
      p50_numeric: 0.55,
      p90_numeric: 0.6,
    }),
    baseline({
      metric_type: "walking_steadiness",
      window_days: 30,
      p10_numeric: null,
      p50_numeric: null,
      p90_numeric: null,
    }),
  ]
  const { alerts } = evaluateAlertRules({ observations: [], baselines, now: NOW })
  assert.deepEqual(alerts, [])
})

// ─── Dedupe + safety ───────────────────────────────────────────────────────

test("re-running on identical input produces identical dedupe keys (idempotent)", () => {
  const observations = [obs({ metric_type: "resting_heart_rate", value_numeric: 95 })]
  const baselines = [baseline()]
  const a = evaluateAlertRules({ observations, baselines, now: NOW }).alerts
  const b = evaluateAlertRules({ observations, baselines, now: NOW }).alerts
  assert.equal(a.length, b.length)
  for (let i = 0; i < a.length; i += 1) {
    assert.equal(a[i].source_type, b[i].source_type)
    assert.equal(a[i].source_record_id, b[i].source_record_id)
  }
})

test("alerts use only the rule_engine source_type and never echo PHI in the title", () => {
  const observations = [
    obs({ metric_type: "resting_heart_rate", value_numeric: 100 }),
    obs({
      metric_type: "fall_event",
      value_numeric: 1,
      value_unit: "event",
      source_record_id: "hk-fall-x",
    }),
  ]
  const baselines = [baseline()]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  for (const a of alerts) {
    assert.equal(a.source_type, ALERT_SOURCE_TYPE_RULE_ENGINE)
    // Caregiver-safe wording: titles cannot include diagnostic terms.
    assert.doesNotMatch(a.title, /diagnos|treat|prescribe|emergency/i)
  }
})

test("uses the most recent observation when multiple samples are present", () => {
  const observations = [
    obs({
      metric_type: "resting_heart_rate",
      value_numeric: 65,
      observed_at: "2026-04-24T07:00:00.000Z",
    }),
    obs({
      id: "obs-latest",
      metric_type: "resting_heart_rate",
      value_numeric: 105,
      observed_at: "2026-04-25T07:00:00.000Z",
    }),
  ]
  const baselines = [baseline()]
  const { alerts } = evaluateAlertRules({ observations, baselines, now: NOW })
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].metadata.observationValue, 105)
})
