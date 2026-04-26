import test from "node:test"
import assert from "node:assert/strict"
import {
  HEALTH_METRIC_TYPES,
  parseRecordedAt,
  collectHealthRows,
} from "../health-data.js"

// ---------------------------------------------------------------------------
// HEALTH_METRIC_TYPES constant
// ---------------------------------------------------------------------------

test("HEALTH_METRIC_TYPES maps client keys to DB column strings", () => {
  assert.equal(HEALTH_METRIC_TYPES.steps, "steps")
  assert.equal(HEALTH_METRIC_TYPES.heartRate, "heart_rate")
  assert.equal(HEALTH_METRIC_TYPES.sleep, "sleep")
})

test("HEALTH_METRIC_TYPES is frozen so callers cannot mutate it", () => {
  assert.ok(Object.isFrozen(HEALTH_METRIC_TYPES))
})

// ---------------------------------------------------------------------------
// parseRecordedAt
// ---------------------------------------------------------------------------

test("parseRecordedAt returns a Date for a valid ISO-8601 string", () => {
  const d = parseRecordedAt("2026-04-25T00:00:00.000Z")
  assert.ok(d instanceof Date)
  assert.equal(d.toISOString(), "2026-04-25T00:00:00.000Z")
})

test("parseRecordedAt accepts date-only (YYYY-MM-DD) strings", () => {
  const d = parseRecordedAt("2026-04-25")
  assert.ok(d instanceof Date)
  assert.equal(Number.isNaN(d.getTime()), false)
})

test("parseRecordedAt throws with the original string in the message", () => {
  assert.throws(
    () => parseRecordedAt("not-a-date"),
    /Invalid date: not-a-date/,
  )
})

// ---------------------------------------------------------------------------
// collectHealthRows
// ---------------------------------------------------------------------------

test("collectHealthRows returns [] when no metric arrays are provided", () => {
  const rows = collectHealthRows("u1", {})
  assert.deepEqual(rows, [])
})

test("collectHealthRows stamps user_id and canonical type on every row", () => {
  const rows = collectHealthRows("u1", {
    steps: [{ value: 10, date: "2026-04-25T00:00:00Z" }],
    heartRate: [{ value: 70, date: "2026-04-25T01:00:00Z" }],
    sleep: [{ value: 7.5, date: "2026-04-24T22:00:00Z" }],
  })

  assert.equal(rows.length, 3)
  assert.ok(rows.every((r) => r.user_id === "u1"))
  assert.equal(rows[0].type, "steps")
  assert.equal(rows[1].type, "heart_rate")
  assert.equal(rows[2].type, "sleep")
})

test("collectHealthRows coerces string values with Number()", () => {
  const rows = collectHealthRows("u1", {
    steps: [{ value: "1234", date: "2026-04-25T00:00:00Z" }],
  })
  assert.equal(rows[0].value, 1234)
})

test("collectHealthRows throws when any value coerces to NaN", () => {
  assert.throws(
    () =>
      collectHealthRows("u1", {
        steps: [{ value: "oops", date: "2026-04-25T00:00:00Z" }],
      }),
    /numeric value/,
  )
})

test("collectHealthRows throws if any recorded_at is unparseable", () => {
  assert.throws(
    () =>
      collectHealthRows("u1", {
        heartRate: [{ value: 70, date: "nope" }],
      }),
    /Invalid date/,
  )
})

test("collectHealthRows preserves section order: steps, heartRate, sleep", () => {
  const rows = collectHealthRows("u1", {
    sleep: [{ value: 7, date: "2026-04-24T22:00:00Z" }],
    heartRate: [{ value: 70, date: "2026-04-25T01:00:00Z" }],
    steps: [{ value: 10, date: "2026-04-25T00:00:00Z" }],
  })
  assert.deepEqual(
    rows.map((r) => r.type),
    ["steps", "heart_rate", "sleep"],
  )
})
