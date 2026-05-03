import test from "node:test"
import assert from "node:assert/strict"
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TIME_WINDOWS,
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  parseAppointmentListQuery,
} from "../appointments.js"

test("APPOINTMENT_STATUSES exposes the canonical states and is frozen", () => {
  assert.ok(Object.isFrozen(APPOINTMENT_STATUSES))
  assert.equal(APPOINTMENT_STATUSES.scheduled, "scheduled")
  assert.equal(APPOINTMENT_STATUSES.completed, "completed")
  assert.equal(APPOINTMENT_STATUSES.cancelled, "cancelled")
  assert.equal(APPOINTMENT_STATUSES.missed, "missed")
})

test("APPOINTMENT_TIME_WINDOWS exposes upcoming/past/all", () => {
  assert.ok(Object.isFrozen(APPOINTMENT_TIME_WINDOWS))
  assert.equal(APPOINTMENT_TIME_WINDOWS.upcoming, "upcoming")
  assert.equal(APPOINTMENT_TIME_WINDOWS.past, "past")
  assert.equal(APPOINTMENT_TIME_WINDOWS.all, "all")
})

test("parseAppointmentListQuery defaults timeWindow to `all` and applies default limit", () => {
  const f = parseAppointmentListQuery({})
  assert.equal(f.status, null)
  assert.equal(f.timeWindow, "all")
  assert.equal(f.limit, DEFAULT_LIST_LIMIT)
})

test("parseAppointmentListQuery accepts both `window` and `timeWindow`", () => {
  assert.equal(
    parseAppointmentListQuery({ window: "upcoming" }).timeWindow,
    "upcoming",
  )
  assert.equal(
    parseAppointmentListQuery({ timeWindow: "past" }).timeWindow,
    "past",
  )
})

test("parseAppointmentListQuery rejects an unknown status", () => {
  assert.throws(
    () => parseAppointmentListQuery({ status: "rescheduled" }),
    /Unknown status/,
  )
})

test("parseAppointmentListQuery rejects an unknown time window", () => {
  assert.throws(
    () => parseAppointmentListQuery({ window: "today" }),
    /Unknown window/,
  )
})

test("parseAppointmentListQuery caps limit at MAX_LIST_LIMIT", () => {
  assert.equal(
    parseAppointmentListQuery({ limit: 9_999 }).limit,
    MAX_LIST_LIMIT,
  )
})
