import test from "node:test"
import assert from "node:assert/strict"
import {
  RISK_LEVELS,
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
  CARE_TEAM_PROFILE_ROLES,
  CARE_TEAM_PROFILE_PERMISSIONS,
  isUuid,
} from "../care-recipient-profile.js"

// ---------------------------------------------------------------------------
// Enum constants — must match the TS mirror exactly so the backend, web,
// and iOS clients all decode the same shape.
// ---------------------------------------------------------------------------

test("RISK_LEVELS exposes the canonical risk keys", () => {
  assert.equal(RISK_LEVELS.low, "low")
  assert.equal(RISK_LEVELS.moderate, "moderate")
  assert.equal(RISK_LEVELS.high, "high")
  assert.ok(Object.isFrozen(RISK_LEVELS))
})

test("DATA_SOURCE_TYPES covers every supported integration", () => {
  assert.equal(DATA_SOURCE_TYPES.appleHealth, "apple_health")
  assert.equal(DATA_SOURCE_TYPES.epic, "epic")
  assert.equal(DATA_SOURCE_TYPES.fitbit, "fitbit")
  assert.equal(DATA_SOURCE_TYPES.garmin, "garmin")
  assert.equal(DATA_SOURCE_TYPES.ring, "ring")
  assert.equal(DATA_SOURCE_TYPES.fallDetection, "fall_detection")
  assert.ok(Object.isFrozen(DATA_SOURCE_TYPES))
})

test("DATA_SOURCE_STATUSES covers every UI state", () => {
  assert.equal(DATA_SOURCE_STATUSES.connected, "connected")
  assert.equal(DATA_SOURCE_STATUSES.notConnected, "not_connected")
  assert.equal(DATA_SOURCE_STATUSES.error, "error")
  assert.ok(Object.isFrozen(DATA_SOURCE_STATUSES))
})

test("CARE_TEAM_PROFILE_ROLES matches the TS CareTeamRole union", () => {
  assert.equal(CARE_TEAM_PROFILE_ROLES.primaryCaregiver, "primary_caregiver")
  assert.equal(CARE_TEAM_PROFILE_ROLES.familyMember, "family_member")
  assert.equal(CARE_TEAM_PROFILE_ROLES.clinician, "clinician")
  assert.equal(CARE_TEAM_PROFILE_ROLES.careCoordinator, "care_coordinator")
  assert.ok(Object.isFrozen(CARE_TEAM_PROFILE_ROLES))
})

test("CARE_TEAM_PROFILE_PERMISSIONS matches the TS CareTeamPermission union", () => {
  assert.equal(CARE_TEAM_PROFILE_PERMISSIONS.fullAccess, "full_access")
  assert.equal(CARE_TEAM_PROFILE_PERMISSIONS.limitedAccess, "limited_access")
  assert.equal(CARE_TEAM_PROFILE_PERMISSIONS.clinicalAccess, "clinical_access")
  assert.equal(CARE_TEAM_PROFILE_PERMISSIONS.viewOnly, "view_only")
  assert.ok(Object.isFrozen(CARE_TEAM_PROFILE_PERMISSIONS))
})

// ---------------------------------------------------------------------------
// isUuid — used by every route handler to short-circuit bad ids as 400
// before the service layer runs and the DB sees a malformed param.
// ---------------------------------------------------------------------------

test("isUuid accepts any RFC-4122 form", () => {
  assert.equal(isUuid("11111111-1111-4111-a111-111111111111"), true)
  assert.equal(isUuid("ABCDEF01-2345-6789-abcd-ef0123456789"), true)
})

test("isUuid rejects malformed or non-string input", () => {
  assert.equal(isUuid("not-a-uuid"), false)
  assert.equal(isUuid(""), false)
  assert.equal(isUuid(undefined), false)
  assert.equal(isUuid(null), false)
  assert.equal(isUuid(12345), false)
})
