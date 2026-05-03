import test from "node:test"
import assert from "node:assert/strict"
import {
  METRIC_TYPES,
  METRIC_UNITS,
  OBSERVATION_SOURCE_TYPES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  parseObservationListQuery,
} from "../health-observations.js"

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
})

test("OBSERVATION_SOURCE_TYPES carries the legacy bridge value", () => {
  assert.equal(OBSERVATION_SOURCE_TYPES.healthkit, "healthkit")
  assert.equal(OBSERVATION_SOURCE_TYPES.healthkitLegacy, "healthkit_legacy")
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
