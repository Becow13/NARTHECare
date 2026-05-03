import test from "node:test"
import assert from "node:assert/strict"
import {
  SUMMARY_TYPES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  parseSummaryListQuery,
} from "../ai-summaries.js"

test("SUMMARY_TYPES is frozen and exposes the canonical strings", () => {
  assert.ok(Object.isFrozen(SUMMARY_TYPES))
  assert.equal(SUMMARY_TYPES.daily, "daily")
  assert.equal(SUMMARY_TYPES.anomaly, "anomaly")
  assert.equal(SUMMARY_TYPES.postVisit, "post_visit")
})

test("parseSummaryListQuery returns defaults for an empty query", () => {
  const f = parseSummaryListQuery({})
  assert.equal(f.summaryType, null)
  assert.equal(f.limit, DEFAULT_LIST_LIMIT)
})

test("parseSummaryListQuery accepts both `type` and `summaryType`", () => {
  assert.equal(parseSummaryListQuery({ type: "daily" }).summaryType, "daily")
  assert.equal(
    parseSummaryListQuery({ summaryType: "post_visit" }).summaryType,
    "post_visit",
  )
})

test("parseSummaryListQuery rejects an unknown type", () => {
  assert.throws(
    () => parseSummaryListQuery({ type: "diagnosis" }),
    /Unknown summary type/,
  )
})

test("parseSummaryListQuery caps limit at MAX_LIST_LIMIT", () => {
  assert.equal(parseSummaryListQuery({ limit: 1_000_000 }).limit, MAX_LIST_LIMIT)
})

test("parseSummaryListQuery rejects a non-positive limit", () => {
  assert.throws(() => parseSummaryListQuery({ limit: 0 }), /positive integer/)
  assert.throws(
    () => parseSummaryListQuery({ limit: "abc" }),
    /positive integer/,
  )
})
