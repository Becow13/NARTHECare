import test from "node:test"
import assert from "node:assert/strict"
import {
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  parseAlertListQuery,
} from "../alerts.js"

test("ALERT_SEVERITIES exposes routine/monitor/critical and is frozen", () => {
  assert.ok(Object.isFrozen(ALERT_SEVERITIES))
  assert.equal(ALERT_SEVERITIES.routine, "routine")
  assert.equal(ALERT_SEVERITIES.monitor, "monitor")
  assert.equal(ALERT_SEVERITIES.critical, "critical")
})

test("ALERT_STATUSES exposes active/acknowledged/resolved", () => {
  assert.ok(Object.isFrozen(ALERT_STATUSES))
  assert.equal(ALERT_STATUSES.active, "active")
  assert.equal(ALERT_STATUSES.acknowledged, "acknowledged")
  assert.equal(ALERT_STATUSES.resolved, "resolved")
})

test("parseAlertListQuery returns defaults for an empty query", () => {
  const f = parseAlertListQuery({})
  assert.equal(f.severity, null)
  assert.equal(f.status, null)
  assert.equal(f.limit, DEFAULT_LIST_LIMIT)
})

test("parseAlertListQuery accepts a known severity and status", () => {
  const f = parseAlertListQuery({ severity: "critical", status: "active" })
  assert.equal(f.severity, "critical")
  assert.equal(f.status, "active")
})

test("parseAlertListQuery rejects an unknown severity", () => {
  assert.throws(
    () => parseAlertListQuery({ severity: "fatal" }),
    /Unknown severity/,
  )
})

test("parseAlertListQuery rejects an unknown status", () => {
  assert.throws(
    () => parseAlertListQuery({ status: "snoozed" }),
    /Unknown status/,
  )
})

test("parseAlertListQuery caps limit at MAX_LIST_LIMIT", () => {
  assert.equal(parseAlertListQuery({ limit: 99_999 }).limit, MAX_LIST_LIMIT)
})

test("parseAlertListQuery rejects a non-positive limit", () => {
  assert.throws(() => parseAlertListQuery({ limit: 0 }), /positive integer/)
})
