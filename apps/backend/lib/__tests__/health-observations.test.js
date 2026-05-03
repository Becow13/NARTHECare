import test from "node:test"
import assert from "node:assert/strict"
import {
  METRIC_TYPES,
  METRIC_UNITS,
  METRIC_UNIT_BY_METRIC_TYPE,
  OBSERVATION_SOURCE_TYPES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  MAX_SYNC_BATCH_SIZE,
  parseObservationListQuery,
  parseSyncRequestBody,
  distinctMetricTypes,
} from "../health-observations.js"

const ALICE_RECIPIENT = "00000000-0000-4000-8000-000000000001"

function validSample(overrides = {}) {
  return {
    sourceType: "healthkit",
    sourceRecordId: "rec-1",
    metricType: "steps",
    value: 1234,
    unit: "count",
    measuredAt: "2026-04-25T00:00:00.000Z",
    ...overrides,
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

test("METRIC_TYPES exposes the eight Phase 4A-supported metric strings", () => {
  assert.equal(METRIC_TYPES.steps, "steps")
  assert.equal(METRIC_TYPES.restingHeartRate, "resting_heart_rate")
  assert.equal(METRIC_TYPES.hrv, "hrv")
  assert.equal(METRIC_TYPES.spo2, "spo2")
  assert.equal(METRIC_TYPES.sleepDuration, "sleep_duration")
  assert.equal(METRIC_TYPES.respiratoryRate, "respiratory_rate")
  assert.equal(METRIC_TYPES.walkingSteadiness, "walking_steadiness")
  assert.equal(METRIC_TYPES.fallEvent, "fall_event")
})

test("constants are frozen so callers cannot mutate them", () => {
  assert.ok(Object.isFrozen(METRIC_TYPES))
  assert.ok(Object.isFrozen(METRIC_UNITS))
  assert.ok(Object.isFrozen(OBSERVATION_SOURCE_TYPES))
  assert.ok(Object.isFrozen(METRIC_UNIT_BY_METRIC_TYPE))
})

test("OBSERVATION_SOURCE_TYPES exposes the iOS-sync and external-origin values", () => {
  assert.equal(OBSERVATION_SOURCE_TYPES.healthkit, "healthkit")
  assert.equal(OBSERVATION_SOURCE_TYPES.appleHealth, "apple_health")
  assert.equal(OBSERVATION_SOURCE_TYPES.epic, "epic")
  assert.equal(OBSERVATION_SOURCE_TYPES.manual, "manual")
  assert.equal(OBSERVATION_SOURCE_TYPES.healthkitLegacy, undefined)
})

test("METRIC_UNIT_BY_METRIC_TYPE pairs every metric with exactly one unit", () => {
  for (const metric of Object.values(METRIC_TYPES)) {
    const unit = METRIC_UNIT_BY_METRIC_TYPE[metric]
    assert.ok(unit, `missing unit pairing for ${metric}`)
    assert.ok(
      Object.values(METRIC_UNITS).includes(unit),
      `unit "${unit}" for ${metric} is not in METRIC_UNITS`,
    )
  }
})

// ─── parseObservationListQuery ──────────────────────────────────────────────

test("parseObservationListQuery applies defaults for an empty query", () => {
  const f = parseObservationListQuery({})
  assert.equal(f.metricType, null)
  assert.equal(f.since, null)
  assert.equal(f.limit, DEFAULT_LIST_LIMIT)
})

test("parseObservationListQuery treats a missing query object as defaults", () => {
  const f = parseObservationListQuery(undefined)
  assert.equal(f.limit, DEFAULT_LIST_LIMIT)
})

test("parseObservationListQuery accepts both metricType and metric_type", () => {
  assert.equal(
    parseObservationListQuery({ metricType: "steps" }).metricType,
    "steps",
  )
  assert.equal(
    parseObservationListQuery({ metric_type: "hrv" }).metricType,
    "hrv",
  )
})

test("parseObservationListQuery rejects an unknown metricType", () => {
  assert.throws(
    () => parseObservationListQuery({ metricType: "blood_pressure" }),
    /Unknown metricType/,
  )
})

test("parseObservationListQuery normalizes `since` to an ISO string", () => {
  const f = parseObservationListQuery({ since: "2026-04-25T00:00:00.000Z" })
  assert.equal(f.since, "2026-04-25T00:00:00.000Z")
})

test("parseObservationListQuery rejects an unparseable `since`", () => {
  assert.throws(
    () => parseObservationListQuery({ since: "not-a-date" }),
    /Invalid since/,
  )
})

test("parseObservationListQuery rejects a non-positive limit", () => {
  assert.throws(
    () => parseObservationListQuery({ limit: 0 }),
    /positive integer/,
  )
  assert.throws(
    () => parseObservationListQuery({ limit: -5 }),
    /positive integer/,
  )
  assert.throws(
    () => parseObservationListQuery({ limit: "abc" }),
    /positive integer/,
  )
})

test("parseObservationListQuery caps limit at MAX_LIST_LIMIT", () => {
  const f = parseObservationListQuery({ limit: 999_999 })
  assert.equal(f.limit, MAX_LIST_LIMIT)
})

test("parseObservationListQuery passes through a valid limit", () => {
  const f = parseObservationListQuery({ limit: 50 })
  assert.equal(f.limit, 50)
})

// ─── parseSyncRequestBody ───────────────────────────────────────────────────

test("parseSyncRequestBody maps a valid body to DB-ready rows", () => {
  const result = parseSyncRequestBody({
    careRecipientId: ALICE_RECIPIENT,
    observations: [validSample()],
  })
  assert.equal(result.careRecipientId, ALICE_RECIPIENT)
  assert.equal(result.rows.length, 1)
  const row = result.rows[0]
  assert.equal(row.metric_type, "steps")
  assert.equal(row.value_numeric, 1234)
  assert.equal(row.value_unit, "count")
  assert.equal(row.observed_at, "2026-04-25T00:00:00.000Z")
  assert.equal(row.source_type, "healthkit")
  assert.equal(row.source_id, null)
  assert.equal(row.source_record_id, "rec-1")
  assert.equal(row.metadata, null)
})

test("parseSyncRequestBody requires a UUID careRecipientId", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: "not-a-uuid",
        observations: [validSample()],
      }),
    /must be a UUID/,
  )
  assert.throws(
    () => parseSyncRequestBody({ observations: [validSample()] }),
    /required/,
  )
})

test("parseSyncRequestBody rejects empty observations array", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [],
      }),
    /at least one sample/,
  )
})

test("parseSyncRequestBody rejects non-array observations", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: { not: "an array" },
      }),
    /required/,
  )
})

test("parseSyncRequestBody enforces the batch-size cap", () => {
  const tooMany = Array.from({ length: MAX_SYNC_BATCH_SIZE + 1 }, (_, i) =>
    validSample({ sourceRecordId: `rec-${i}` }),
  )
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: tooMany,
      }),
    /maximum batch size/,
  )
})

test("parseSyncRequestBody rejects unknown sourceType", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ sourceType: "garmin" })],
      }),
    /unknown sourceType/,
  )
})

test("parseSyncRequestBody rejects unknown metricType", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ metricType: "blood_pressure" })],
      }),
    /unknown metricType/,
  )
})

test("parseSyncRequestBody rejects mismatched unit", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ metricType: "steps", unit: "bpm" })],
      }),
    /unit must be "count" for metricType "steps"/,
  )
})

test("parseSyncRequestBody rejects non-finite value", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ value: "not-a-number" })],
      }),
    /finite number/,
  )
})

test("parseSyncRequestBody rejects a missing measuredAt", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ measuredAt: undefined })],
      }),
    /measuredAt/,
  )
})

test("parseSyncRequestBody rejects a non-string sourceRecordId", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ sourceRecordId: 123 })],
      }),
    /sourceRecordId/,
  )
})

test("parseSyncRequestBody normalizes measuredAt to ISO and folds startAt/endAt into metadata", () => {
  const row = parseSyncRequestBody({
    careRecipientId: ALICE_RECIPIENT,
    observations: [
      validSample({
        metricType: "sleep_duration",
        unit: "hours",
        value: 7.5,
        startAt: "2026-04-24T22:00:00.000Z",
        endAt: "2026-04-25T05:30:00.000Z",
      }),
    ],
  }).rows[0]
  assert.equal(row.observed_at, "2026-04-25T00:00:00.000Z")
  assert.deepEqual(row.metadata, {
    startAt: "2026-04-24T22:00:00.000Z",
    endAt: "2026-04-25T05:30:00.000Z",
  })
})

test("parseSyncRequestBody preserves caller metadata while still folding ranges", () => {
  const row = parseSyncRequestBody({
    careRecipientId: ALICE_RECIPIENT,
    observations: [
      validSample({
        metadata: { device: "AppleWatch" },
        startAt: "2026-04-25T00:00:00.000Z",
      }),
    ],
  }).rows[0]
  assert.deepEqual(row.metadata, {
    device: "AppleWatch",
    startAt: "2026-04-25T00:00:00.000Z",
  })
})

test("parseSyncRequestBody rejects array metadata", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [validSample({ metadata: ["nope"] })],
      }),
    /metadata must be an object/,
  )
})

test("parseSyncRequestBody includes the index in error messages", () => {
  assert.throws(
    () =>
      parseSyncRequestBody({
        careRecipientId: ALICE_RECIPIENT,
        observations: [
          validSample(),
          validSample({ sourceRecordId: "rec-2", metricType: "blood_pressure" }),
        ],
      }),
    /observations\[1\]/,
  )
})

test("parseSyncRequestBody accepts snake_case keys for cross-platform mirrors", () => {
  const row = parseSyncRequestBody({
    care_recipient_id: ALICE_RECIPIENT,
    observations: [
      {
        source_type: "healthkit",
        source_record_id: "rec-1",
        metric_type: "hrv",
        value: 42,
        unit: "ms",
        measured_at: "2026-04-25T00:00:00.000Z",
      },
    ],
  }).rows[0]
  assert.equal(row.metric_type, "hrv")
  assert.equal(row.value_numeric, 42)
})

// ─── distinctMetricTypes ────────────────────────────────────────────────────

test("distinctMetricTypes returns a sorted, deduplicated set", () => {
  const rows = [
    { metric_type: "hrv" },
    { metric_type: "steps" },
    { metric_type: "hrv" },
    { metric_type: "spo2" },
  ]
  assert.deepEqual(distinctMetricTypes(rows), ["hrv", "spo2", "steps"])
})

test("distinctMetricTypes returns [] for an empty batch", () => {
  assert.deepEqual(distinctMetricTypes([]), [])
})
