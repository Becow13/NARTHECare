import test from "node:test"
import assert from "node:assert/strict"
import {
  BASELINE_METRIC_TYPES,
  BASELINE_WINDOWS,
  MIN_SAMPLES_FOR_PERCENTILES,
  windowStartIso,
  computeBaseline,
} from "../baseline-stats.js"

// ─── Constants ──────────────────────────────────────────────────────────────

test("BASELINE_METRIC_TYPES excludes fall_event (binary signal)", () => {
  assert.ok(!BASELINE_METRIC_TYPES.includes("fall_event"))
  assert.ok(BASELINE_METRIC_TYPES.includes("steps"))
  assert.ok(BASELINE_METRIC_TYPES.includes("resting_heart_rate"))
  assert.ok(BASELINE_METRIC_TYPES.includes("walking_steadiness"))
})

test("BASELINE_WINDOWS exposes 7 / 14 / 30 in canonical order", () => {
  assert.deepEqual([...BASELINE_WINDOWS], [7, 14, 30])
})

test("BASELINE_METRIC_TYPES and BASELINE_WINDOWS are frozen", () => {
  assert.ok(Object.isFrozen(BASELINE_METRIC_TYPES))
  assert.ok(Object.isFrozen(BASELINE_WINDOWS))
})

// ─── windowStartIso ─────────────────────────────────────────────────────────

test("windowStartIso subtracts whole-day windows in UTC", () => {
  const now = new Date("2026-04-25T12:00:00.000Z")
  assert.equal(windowStartIso(now, 14), "2026-04-11T12:00:00.000Z")
  assert.equal(windowStartIso(now, 7), "2026-04-18T12:00:00.000Z")
  assert.equal(windowStartIso(now, 30), "2026-03-26T12:00:00.000Z")
})

test("windowStartIso accepts an ISO string for `now`", () => {
  assert.equal(
    windowStartIso("2026-04-25T00:00:00.000Z", 14),
    "2026-04-11T00:00:00.000Z",
  )
})

test("windowStartIso rejects non-positive or non-integer windows", () => {
  assert.throws(() => windowStartIso(new Date(), 0), /positive integer/)
  assert.throws(() => windowStartIso(new Date(), -7), /positive integer/)
  assert.throws(() => windowStartIso(new Date(), 7.5), /positive integer/)
})

test("windowStartIso rejects an unparseable `now`", () => {
  assert.throws(() => windowStartIso("not-a-date", 14), /Date or ISO string/)
})

// ─── computeBaseline ────────────────────────────────────────────────────────

test("computeBaseline returns null percentiles when sampleCount < threshold", () => {
  const r = computeBaseline([60, 62, 65])
  assert.equal(r.sampleCount, 3)
  assert.equal(r.p10, null)
  assert.equal(r.p50, null)
  assert.equal(r.p90, null)
})

test("computeBaseline marks empty input with sampleCount 0", () => {
  const r = computeBaseline([])
  assert.deepEqual(r, { p10: null, p50: null, p90: null, sampleCount: 0 })
})

test("computeBaseline returns sorted percentiles for a stable input", () => {
  const values = [60, 62, 64, 66, 68, 70, 72, 74, 76, 78]
  const r = computeBaseline(values)
  assert.equal(r.sampleCount, 10)
  assert.ok(r.p10 < r.p50)
  assert.ok(r.p50 < r.p90)
})

test("computeBaseline matches the linear-interpolation reference for [1..10]", () => {
  const r = computeBaseline([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  // PERCENTILE.INC([1..10], 0.10) = 1.9, 0.50 = 5.5, 0.90 = 9.1
  assert.equal(r.p10, 1.9)
  assert.equal(r.p50, 5.5)
  assert.equal(r.p90, 9.1)
})

test("computeBaseline handles a single repeated value", () => {
  const values = Array.from({ length: 10 }, () => 70)
  const r = computeBaseline(values)
  assert.equal(r.p10, 70)
  assert.equal(r.p50, 70)
  assert.equal(r.p90, 70)
  assert.equal(r.sampleCount, 10)
})

test("computeBaseline ignores non-finite entries in sampleCount and percentile math", () => {
  const r = computeBaseline([60, 65, NaN, Infinity, 70, 75, 80])
  assert.equal(r.sampleCount, 5)
  assert.ok(Number.isFinite(r.p10))
  assert.ok(Number.isFinite(r.p50))
  assert.ok(Number.isFinite(r.p90))
})

test("computeBaseline does not mutate the input array", () => {
  const values = [10, 5, 30, 1, 25, 40, 35]
  const snapshot = [...values]
  computeBaseline(values)
  assert.deepEqual(values, snapshot)
})

test("MIN_SAMPLES_FOR_PERCENTILES is exposed as a positive integer", () => {
  assert.ok(Number.isInteger(MIN_SAMPLES_FOR_PERCENTILES))
  assert.ok(MIN_SAMPLES_FOR_PERCENTILES >= 1)
})
