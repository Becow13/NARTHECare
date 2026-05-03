import test from "node:test"
import assert from "node:assert/strict"
import {
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
  parseDataSourceListQuery,
} from "../data-sources.js"

test("DATA_SOURCE_TYPES re-exports the shared registry of source types", () => {
  // Sanity-check a few — full set is verified in the shared model tests.
  assert.equal(DATA_SOURCE_TYPES.appleHealth, "apple_health")
  assert.equal(DATA_SOURCE_TYPES.epic, "epic")
  assert.equal(DATA_SOURCE_TYPES.fallDetection, "fall_detection")
  assert.ok(Object.isFrozen(DATA_SOURCE_TYPES))
})

test("DATA_SOURCE_STATUSES re-exports the canonical connection states", () => {
  assert.equal(DATA_SOURCE_STATUSES.connected, "connected")
  assert.equal(DATA_SOURCE_STATUSES.notConnected, "not_connected")
  assert.equal(DATA_SOURCE_STATUSES.error, "error")
  assert.ok(Object.isFrozen(DATA_SOURCE_STATUSES))
})

test("parseDataSourceListQuery returns null/null for an empty query", () => {
  const f = parseDataSourceListQuery({})
  assert.equal(f.sourceType, null)
  assert.equal(f.status, null)
})

test("parseDataSourceListQuery accepts both `type` and `sourceType`", () => {
  assert.equal(
    parseDataSourceListQuery({ type: "apple_health" }).sourceType,
    "apple_health",
  )
  assert.equal(
    parseDataSourceListQuery({ sourceType: "epic" }).sourceType,
    "epic",
  )
})

test("parseDataSourceListQuery rejects an unknown type", () => {
  assert.throws(
    () => parseDataSourceListQuery({ type: "smartwatch" }),
    /Unknown type/,
  )
})

test("parseDataSourceListQuery rejects an unknown status", () => {
  assert.throws(
    () => parseDataSourceListQuery({ status: "syncing" }),
    /Unknown status/,
  )
})

test("parseDataSourceListQuery accepts the canonical statuses", () => {
  for (const s of ["connected", "not_connected", "error"]) {
    assert.equal(parseDataSourceListQuery({ status: s }).status, s)
  }
})
