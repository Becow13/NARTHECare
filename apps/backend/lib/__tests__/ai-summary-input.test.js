import test from "node:test"
import assert from "node:assert/strict"
import {
  SUMMARY_METRIC_TYPES,
  SUMMARY_DEFAULT_WINDOW_DAYS,
  buildStructuredSummaryInput,
} from "../ai-summary-input.js"

const RECIPIENT = "00000000-0000-4000-8000-000000000001"
const NOW = new Date("2026-04-25T12:00:00.000Z")

function obs(overrides = {}) {
  return {
    id: "obs-1",
    metric_type: "resting_heart_rate",
    value_numeric: 70,
    value_unit: "bpm",
    observed_at: "2026-04-25T08:00:00.000Z",
    ...overrides,
  }
}

function baseline(overrides = {}) {
  return {
    id: "base-1",
    metric_type: "resting_heart_rate",
    window_days: 14,
    p10_numeric: 60,
    p50_numeric: 65,
    p90_numeric: 72,
    sample_count: 18,
    ...overrides,
  }
}

// ─── Surface ───────────────────────────────────────────────────────────────

test("SUMMARY_METRIC_TYPES is frozen and excludes fall_event (counted separately)", () => {
  assert.ok(Object.isFrozen(SUMMARY_METRIC_TYPES))
  assert.ok(!SUMMARY_METRIC_TYPES.includes("fall_event"))
  assert.ok(SUMMARY_METRIC_TYPES.includes("steps"))
  assert.ok(SUMMARY_METRIC_TYPES.includes("resting_heart_rate"))
})

test("SUMMARY_DEFAULT_WINDOW_DAYS is 14 (mirrors baseline default)", () => {
  assert.equal(SUMMARY_DEFAULT_WINDOW_DAYS, 14)
})

// ─── Empty / defensive inputs ──────────────────────────────────────────────

test("empty inputs produce an envelope with no observations or baselines", () => {
  const input = buildStructuredSummaryInput({ recipientId: RECIPIENT, now: NOW })
  assert.equal(input.careRecipientId, RECIPIENT)
  assert.equal(input.windowDays, SUMMARY_DEFAULT_WINDOW_DAYS)
  assert.equal(input.generatedAt, NOW.toISOString())
  assert.equal(input.fallEventCount, 0)
  assert.deepEqual(input.evidenceIds, { observations: [], baselines: [] })
  assert.equal(input.metrics.length, SUMMARY_METRIC_TYPES.length)
  for (const m of input.metrics) {
    assert.equal(m.latest, null)
    assert.equal(m.baseline, null)
    assert.equal(m.deviation, "unknown")
  }
})

test("rejects a non-positive windowDays", () => {
  assert.throws(
    () => buildStructuredSummaryInput({ recipientId: RECIPIENT, windowDays: 0 }),
    /positive integer/,
  )
  assert.throws(
    () => buildStructuredSummaryInput({ recipientId: RECIPIENT, windowDays: 7.5 }),
    /positive integer/,
  )
})

// ─── Window trim ───────────────────────────────────────────────────────────

test("observations older than the window are silently trimmed", () => {
  const observations = [
    obs({ id: "old", observed_at: "2026-03-01T00:00:00.000Z" }),
    obs({ id: "fresh", observed_at: "2026-04-24T08:00:00.000Z", value_numeric: 80 }),
  ]
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations,
    baselines: [baseline()],
    now: NOW,
    windowDays: 14,
  })
  const hr = input.metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(hr.latest.evidenceId, "fresh")
  assert.deepEqual(input.evidenceIds.observations, ["fresh"])
  assert.deepEqual(input.evidenceIds.baselines, ["base-1"])
})

// ─── Per-metric entries ────────────────────────────────────────────────────

test("latest observation is picked by newest observed_at within the window", () => {
  const observations = [
    obs({ id: "a", value_numeric: 70, observed_at: "2026-04-23T08:00:00.000Z" }),
    obs({ id: "b", value_numeric: 95, observed_at: "2026-04-25T08:00:00.000Z" }),
  ]
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations,
    baselines: [baseline()],
    now: NOW,
  })
  const hr = input.metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(hr.latest.evidenceId, "b")
  assert.equal(hr.latest.value, 95)
})

test("deviation classification uses the matching window's baseline", () => {
  const observations = [obs({ value_numeric: 95 })]
  const baselines = [
    baseline({ id: "b14", window_days: 14 }),
    // 30-day baseline must be ignored when windowDays = 14.
    baseline({
      id: "b30",
      window_days: 30,
      p10_numeric: 100,
      p50_numeric: 110,
      p90_numeric: 120,
    }),
  ]
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations,
    baselines,
    now: NOW,
    windowDays: 14,
  })
  const hr = input.metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(hr.deviation, "high")
  assert.equal(hr.baseline.evidenceId, "b14")
  assert.equal(hr.baseline.windowDays, 14)
})

test("deviation is `low` below p10, `in_range` between, and `unknown` without a baseline", () => {
  const baselines = [baseline()]
  const lo = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 50 })],
    baselines,
    now: NOW,
  }).metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(lo.deviation, "low")

  const mid = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 65 })],
    baselines,
    now: NOW,
  }).metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(mid.deviation, "in_range")

  const noBaseline = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 65 })],
    baselines: [],
    now: NOW,
  }).metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(noBaseline.deviation, "unknown")
})

test("baseline percentiles still passing through when sampleCount is below the percentile threshold", () => {
  const baselines = [
    baseline({ p10_numeric: null, p50_numeric: null, p90_numeric: null, sample_count: 3 }),
  ]
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 65 })],
    baselines,
    now: NOW,
  })
  const hr = input.metrics.find((m) => m.metricType === "resting_heart_rate")
  assert.equal(hr.baseline.p10, null)
  assert.equal(hr.baseline.sampleCount, 3)
  assert.equal(hr.deviation, "unknown")
})

// ─── Fall events ───────────────────────────────────────────────────────────

test("fall events are surfaced as a count, never as per-event ids", () => {
  const observations = [
    obs({
      metric_type: "fall_event",
      value_numeric: 1,
      value_unit: "event",
      id: "fall-a",
    }),
    obs({
      metric_type: "fall_event",
      value_numeric: 1,
      value_unit: "event",
      id: "fall-b",
    }),
  ]
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations,
    baselines: [],
    now: NOW,
  })
  assert.equal(input.fallEventCount, 2)
  // Per-event ids must NOT be in the evidence envelope (they would be PHI-equivalent timestamps).
  assert.deepEqual(input.evidenceIds.observations, [])
})

// ─── Window timestamps ─────────────────────────────────────────────────────

test("sourceWindowStart and sourceWindowEnd bracket the window deterministically", () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    now: NOW,
    windowDays: 14,
  })
  assert.equal(input.sourceWindowEnd, NOW.toISOString())
  assert.equal(input.sourceWindowStart, "2026-04-11T12:00:00.000Z")
})

// ─── Defensive: no PHI in the audit-friendly counts surface ───────────────

test("evidenceIds carries only internal UUIDs (no values, no timestamps)", () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ id: "obs-x", value_numeric: 99 })],
    baselines: [baseline({ id: "base-x" })],
    now: NOW,
  })
  assert.deepEqual(input.evidenceIds, {
    observations: ["obs-x"],
    baselines: ["base-x"],
  })
})
