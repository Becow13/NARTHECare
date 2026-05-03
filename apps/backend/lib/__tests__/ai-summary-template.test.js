import test from "node:test"
import assert from "node:assert/strict"
import {
  TEMPLATE_GENERATOR_MODEL,
  TEMPLATE_PROMPT_VERSION,
  generateTemplateDailySummary,
} from "../ai-summary-template.js"
import { buildStructuredSummaryInput } from "../ai-summary-input.js"

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

test("template constants are stable strings", () => {
  assert.equal(TEMPLATE_GENERATOR_MODEL, "narthecare-template-1")
  assert.equal(TEMPLATE_PROMPT_VERSION, "template-v1")
})

test("rejects null / undefined input", async () => {
  await assert.rejects(generateTemplateDailySummary(null), /input is required/)
  await assert.rejects(generateTemplateDailySummary(undefined), /input is required/)
})

// ─── Empty input ───────────────────────────────────────────────────────────

test("empty input still produces a valid `ai_summaries`-shaped row", async () => {
  const input = buildStructuredSummaryInput({ recipientId: RECIPIENT, now: NOW })
  const row = await generateTemplateDailySummary(input)
  assert.equal(row.model, TEMPLATE_GENERATOR_MODEL)
  assert.equal(row.prompt_version, TEMPLATE_PROMPT_VERSION)
  assert.match(row.summary_text, /Daily care summary/)
  // Honest empty state — no fabricated numbers.
  assert.match(row.summary_text, /No new readings/)
  assert.deepEqual(row.evidence.observationIds, [])
  assert.deepEqual(row.evidence.baselineIds, [])
  assert.ok(row.recommended_actions.actions.length >= 1)
})

// ─── Wording rules ─────────────────────────────────────────────────────────

test("wording is conservative — never diagnoses, prescribes, or instructs emergency action", async () => {
  const observations = [
    obs({ value_numeric: 105 }),
    obs({
      metric_type: "spo2",
      value_numeric: 88,
      value_unit: "percent",
      id: "obs-spo2",
    }),
    obs({
      metric_type: "fall_event",
      value_numeric: 1,
      value_unit: "event",
      id: "obs-fall",
    }),
  ]
  const baselines = [
    baseline(),
    baseline({
      id: "base-spo2",
      metric_type: "spo2",
      p10_numeric: 95,
      p50_numeric: 97,
      p90_numeric: 99,
    }),
  ]
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations,
    baselines,
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  // The phrase "not a medical diagnosis" is required by the
  // disclaimer; what we forbid is the summary CLAIMING a diagnosis or
  // a prescription, or instructing emergency action.
  assert.doesNotMatch(row.summary_text, /\bdiagnose[ds]?\b/i)
  assert.doesNotMatch(row.summary_text, /\bprescribe[ds]?\b/i)
  assert.doesNotMatch(row.summary_text, /call 911|emergency services/i)
  assert.match(row.summary_text, /not a medical diagnosis/i)
  assert.match(row.summary_text, /Consider/i)
})

test("high-side excursion produces an `above the typical range` line", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 95 })],
    baselines: [baseline()],
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  assert.match(row.summary_text, /Resting heart rate.*above the typical range/)
  assert.match(row.summary_text, /typical high is around 72 bpm/)
})

test("low-side excursion produces a `below the typical range` line", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 50 })],
    baselines: [baseline()],
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  assert.match(row.summary_text, /Resting heart rate.*below the typical range/)
})

test("in-range readings are summarized but not flagged", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 65 })],
    baselines: [baseline()],
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  assert.match(row.summary_text, /Resting heart rate.*within the typical range/)
})

test("baseline-not-yet-established is acknowledged honestly", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 65 })],
    baselines: [], // no baseline rows yet
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  assert.match(row.summary_text, /Baseline not yet established/)
})

// ─── Evidence + recommended actions ────────────────────────────────────────

test("evidence cites only internal UUIDs from the input", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ id: "obs-x", value_numeric: 95 })],
    baselines: [baseline({ id: "base-x" })],
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  assert.deepEqual(row.evidence.observationIds, ["obs-x"])
  assert.deepEqual(row.evidence.baselineIds, ["base-x"])
  assert.equal(row.evidence.windowDays, 14)
  assert.equal(row.evidence.sourceWindowEnd, NOW.toISOString())
})

test("recommended actions stay caregiver-safe and deduplicated", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [
      obs({ value_numeric: 95 }),
      obs({
        metric_type: "hrv",
        value_numeric: 18,
        value_unit: "ms",
        id: "obs-hrv",
      }),
    ],
    baselines: [
      baseline(),
      baseline({
        id: "base-hrv",
        metric_type: "hrv",
        p10_numeric: 25,
        p50_numeric: 35,
        p90_numeric: 50,
      }),
    ],
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  // Two rule excursions but only ONE "review the highlighted metric" action — deduped.
  const reviewActions = row.recommended_actions.actions.filter((a) =>
    /Review the highlighted metric/.test(a),
  )
  assert.equal(reviewActions.length, 1)
})

test("fall events surface a dedicated caregiver-safe action without instructing emergency response", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [
      obs({
        metric_type: "fall_event",
        value_numeric: 1,
        value_unit: "event",
        id: "fall-1",
      }),
    ],
    baselines: [],
    now: NOW,
  })
  const row = await generateTemplateDailySummary(input)
  assert.match(row.summary_text, /1 fall event reported/)
  const fallActions = row.recommended_actions.actions.filter((a) => /fall event/i.test(a))
  assert.equal(fallActions.length, 1)
  assert.doesNotMatch(fallActions[0], /call 911|emergency services/i)
})

// ─── Determinism ───────────────────────────────────────────────────────────

test("same input always produces the same summary_text (idempotent generator)", async () => {
  const input = buildStructuredSummaryInput({
    recipientId: RECIPIENT,
    observations: [obs({ value_numeric: 95 })],
    baselines: [baseline()],
    now: NOW,
  })
  const a = await generateTemplateDailySummary(input)
  const b = await generateTemplateDailySummary(input)
  assert.equal(a.summary_text, b.summary_text)
  assert.deepEqual(a.evidence, b.evidence)
})
