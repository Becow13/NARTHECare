import test from "node:test"
import assert from "node:assert/strict"
import {
  parseCareRecipientInput,
  CARE_TEAM_ROLES,
  CARE_TEAM_PERMISSION_LEVELS,
} from "../care-recipients.js"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

test("CARE_TEAM_ROLES exposes the canonical role keys", () => {
  assert.equal(CARE_TEAM_ROLES.primaryCaregiver, "primary_caregiver")
  assert.equal(CARE_TEAM_ROLES.caregiver, "caregiver")
  assert.equal(CARE_TEAM_ROLES.familyMember, "family_member")
  assert.equal(CARE_TEAM_ROLES.clinician, "clinician")
})

test("CARE_TEAM_ROLES is frozen so callers cannot mutate it", () => {
  assert.ok(Object.isFrozen(CARE_TEAM_ROLES))
})

test("CARE_TEAM_PERMISSION_LEVELS exposes the canonical levels", () => {
  assert.equal(CARE_TEAM_PERMISSION_LEVELS.fullAccess, "full_access")
  assert.equal(CARE_TEAM_PERMISSION_LEVELS.readWrite, "read_write")
  assert.equal(CARE_TEAM_PERMISSION_LEVELS.readOnly, "read_only")
})

test("CARE_TEAM_PERMISSION_LEVELS is frozen", () => {
  assert.ok(Object.isFrozen(CARE_TEAM_PERMISSION_LEVELS))
})

// ---------------------------------------------------------------------------
// parseCareRecipientInput
// ---------------------------------------------------------------------------

test("parseCareRecipientInput returns a DB-ready row for a valid body", () => {
  const row = parseCareRecipientInput({
    name: "Grace Hopper",
    date_of_birth: "1906-12-09",
    primary_condition: "Heart failure",
  })
  assert.deepEqual(row, {
    name: "Grace Hopper",
    date_of_birth: "1906-12-09",
    primary_condition: "Heart failure",
  })
})

test("parseCareRecipientInput accepts camelCase aliases from the iOS client", () => {
  const row = parseCareRecipientInput({
    name: "Grace Hopper",
    dateOfBirth: "1906-12-09",
    primaryCondition: "Heart failure",
  })
  assert.equal(row.date_of_birth, "1906-12-09")
  assert.equal(row.primary_condition, "Heart failure")
})

test("parseCareRecipientInput trims whitespace around name and condition", () => {
  const row = parseCareRecipientInput({
    name: "  Grace Hopper  ",
    primary_condition: "  Heart failure  ",
  })
  assert.equal(row.name, "Grace Hopper")
  assert.equal(row.primary_condition, "Heart failure")
})

test("parseCareRecipientInput allows optional fields to be absent", () => {
  const row = parseCareRecipientInput({ name: "Grace Hopper" })
  assert.equal(row.name, "Grace Hopper")
  assert.equal(row.date_of_birth, null)
  assert.equal(row.primary_condition, null)
})

test("parseCareRecipientInput coerces empty optional strings to null", () => {
  const row = parseCareRecipientInput({
    name: "Grace Hopper",
    date_of_birth: "",
    primary_condition: "   ",
  })
  assert.equal(row.date_of_birth, null)
  assert.equal(row.primary_condition, null)
})

test("parseCareRecipientInput throws when name is missing", () => {
  assert.throws(() => parseCareRecipientInput({}), /name .* required/)
  assert.throws(() => parseCareRecipientInput({ name: "" }), /name .* required/)
  assert.throws(() => parseCareRecipientInput({ name: "   " }), /name .* required/)
})

test("parseCareRecipientInput throws when date_of_birth is not a string", () => {
  assert.throws(
    () => parseCareRecipientInput({ name: "x", date_of_birth: 19061209 }),
    /YYYY-MM-DD/,
  )
})

test("parseCareRecipientInput throws when date_of_birth is unparseable", () => {
  assert.throws(
    () => parseCareRecipientInput({ name: "x", date_of_birth: "not-a-date" }),
    /Invalid date_of_birth/,
  )
})

test("parseCareRecipientInput throws when primary_condition is not a string", () => {
  assert.throws(
    () => parseCareRecipientInput({ name: "x", primary_condition: 123 }),
    /primary_condition must be a string/,
  )
})
