import test from "node:test"
import assert from "node:assert/strict"
import {
  BASELINE_WINDOW_DAYS,
  parseBaselineListQuery,
} from "../metric-baselines.js"

const ALLOWED = new Set(["steps", "hrv"])

test("BASELINE_WINDOW_DAYS is frozen and exposes 7/14/30", () => {
  assert.ok(Object.isFrozen(BASELINE_WINDOW_DAYS))
  assert.equal(BASELINE_WINDOW_DAYS.weekly, 7)
  assert.equal(BASELINE_WINDOW_DAYS.default, 14)
  assert.equal(BASELINE_WINDOW_DAYS.monthly, 30)
})

test("parseBaselineListQuery returns null/null for an empty query", () => {
  const f = parseBaselineListQuery({}, ALLOWED)
  assert.equal(f.metricType, null)
  assert.equal(f.windowDays, null)
})

test("parseBaselineListQuery accepts metricType from the allowed set", () => {
  const f = parseBaselineListQuery({ metricType: "steps" }, ALLOWED)
  assert.equal(f.metricType, "steps")
})

test("parseBaselineListQuery rejects metricType outside the allowed set", () => {
  assert.throws(
    () => parseBaselineListQuery({ metricType: "weight" }, ALLOWED),
    /Unknown metricType/,
  )
})

test("parseBaselineListQuery accepts the canonical window sizes", () => {
  for (const w of [7, 14, 30]) {
    assert.equal(
      parseBaselineListQuery({ windowDays: w }, ALLOWED).windowDays,
      w,
    )
  }
})

test("parseBaselineListQuery rejects an unsupported window", () => {
  assert.throws(
    () => parseBaselineListQuery({ windowDays: 21 }, ALLOWED),
    /Unsupported windowDays/,
  )
})

test("parseBaselineListQuery rejects a non-integer window", () => {
  assert.throws(
    () => parseBaselineListQuery({ windowDays: "abc" }, ALLOWED),
    /positive integer/,
  )
  assert.throws(
    () => parseBaselineListQuery({ windowDays: 0 }, ALLOWED),
    /positive integer/,
  )
})

test("parseBaselineListQuery accepts the snake_case alias", () => {
  const f = parseBaselineListQuery({ window_days: 14 }, ALLOWED)
  assert.equal(f.windowDays, 14)
})
