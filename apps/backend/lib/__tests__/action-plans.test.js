import test from "node:test"
import assert from "node:assert/strict"
import {
  ACTION_PLAN_STATUSES,
  ACTION_PLAN_ITEM_STATUSES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  parseActionPlanListQuery,
} from "../action-plans.js"

test("ACTION_PLAN_STATUSES exposes the canonical states and is frozen", () => {
  assert.ok(Object.isFrozen(ACTION_PLAN_STATUSES))
  assert.equal(ACTION_PLAN_STATUSES.active, "active")
  assert.equal(ACTION_PLAN_STATUSES.paused, "paused")
  assert.equal(ACTION_PLAN_STATUSES.completed, "completed")
})

test("ACTION_PLAN_ITEM_STATUSES exposes pending/done/skipped", () => {
  assert.ok(Object.isFrozen(ACTION_PLAN_ITEM_STATUSES))
  assert.equal(ACTION_PLAN_ITEM_STATUSES.pending, "pending")
  assert.equal(ACTION_PLAN_ITEM_STATUSES.done, "done")
  assert.equal(ACTION_PLAN_ITEM_STATUSES.skipped, "skipped")
})

test("parseActionPlanListQuery returns defaults for an empty query", () => {
  const f = parseActionPlanListQuery({})
  assert.equal(f.status, null)
  assert.equal(f.limit, DEFAULT_LIST_LIMIT)
})

test("parseActionPlanListQuery accepts a known status", () => {
  const f = parseActionPlanListQuery({ status: "active" })
  assert.equal(f.status, "active")
})

test("parseActionPlanListQuery rejects an unknown status", () => {
  assert.throws(
    () => parseActionPlanListQuery({ status: "deferred" }),
    /Unknown status/,
  )
})

test("parseActionPlanListQuery caps limit at MAX_LIST_LIMIT", () => {
  assert.equal(
    parseActionPlanListQuery({ limit: 9_999 }).limit,
    MAX_LIST_LIMIT,
  )
})

test("parseActionPlanListQuery rejects a non-positive limit", () => {
  assert.throws(
    () => parseActionPlanListQuery({ limit: 0 }),
    /positive integer/,
  )
})
