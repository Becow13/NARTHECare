import test from "node:test"
import assert from "node:assert/strict"
import {
  RISK_LEVELS,
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
  CARE_TEAM_PROFILE_ROLES,
  CARE_TEAM_PROFILE_PERMISSIONS,
  MOCK_CARE_RECIPIENT_PROFILE_ID,
  canAccessCareRecipient,
  isUuid,
} from "../care-recipient-profile.js"
import { getMockCareRecipientProfile } from "../../services/mock/careRecipientProfileMock.js"

// ---------------------------------------------------------------------------
// Enum constants — must match the TS mirror exactly
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
// isUuid
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

// ---------------------------------------------------------------------------
// canAccessCareRecipient — RBAC placeholder
// ---------------------------------------------------------------------------

test("canAccessCareRecipient allows any authenticated request today (placeholder)", () => {
  assert.equal(
    canAccessCareRecipient("user-1", MOCK_CARE_RECIPIENT_PROFILE_ID),
    true,
  )
})

test("canAccessCareRecipient rejects missing user or recipient ids", () => {
  assert.equal(canAccessCareRecipient("", "recipient"), false)
  assert.equal(canAccessCareRecipient("user", ""), false)
  assert.equal(canAccessCareRecipient(undefined, "recipient"), false)
  assert.equal(canAccessCareRecipient("user", undefined), false)
})

// ---------------------------------------------------------------------------
// Mock profile — shape assertions so drift from the TS contract fails here
// ---------------------------------------------------------------------------

test("getMockCareRecipientProfile returns null for an unknown id", () => {
  assert.equal(getMockCareRecipientProfile("00000000-0000-0000-0000-000000000000"), null)
  assert.equal(getMockCareRecipientProfile(""), null)
  assert.equal(getMockCareRecipientProfile(undefined), null)
})

test("getMockCareRecipientProfile returns the full contract shape for Margaret Chen", () => {
  const profile = getMockCareRecipientProfile(MOCK_CARE_RECIPIENT_PROFILE_ID)
  assert.ok(profile, "expected profile for the mock id")

  // Top-level scalars
  assert.equal(profile.id, MOCK_CARE_RECIPIENT_PROFILE_ID)
  assert.equal(profile.name, "Margaret Chen")
  assert.equal(profile.age, 78)
  assert.equal(profile.dateOfBirth, "1947-02-14")
  assert.equal(profile.gender, "Female")
  assert.equal(profile.riskLevel, RISK_LEVELS.moderate)
  assert.deepEqual(profile.primaryConditions, [
    "Type 2 Diabetes",
    "Hypertension",
  ])

  // Emergency contact
  assert.equal(profile.emergencyContact.name, "Jessie Huang")
  assert.equal(profile.emergencyContact.relationship, "Daughter")

  // Care team
  assert.equal(profile.careTeam.primaryCaregiver, "Jessie Huang")
  assert.ok(Array.isArray(profile.careTeam.members))
  assert.ok(profile.careTeam.members.length >= 1)
  for (const m of profile.careTeam.members) {
    assert.ok(
      Object.values(CARE_TEAM_PROFILE_ROLES).includes(m.role),
      `unknown role: ${m.role}`,
    )
    assert.ok(
      Object.values(CARE_TEAM_PROFILE_PERMISSIONS).includes(m.permission),
      `unknown permission: ${m.permission}`,
    )
  }

  // Data sources — every entry must use an allow-listed type + status
  for (const ds of profile.dataSources) {
    assert.ok(
      Object.values(DATA_SOURCE_TYPES).includes(ds.type),
      `unknown data source type: ${ds.type}`,
    )
    assert.ok(
      Object.values(DATA_SOURCE_STATUSES).includes(ds.status),
      `unknown data source status: ${ds.status}`,
    )
  }

  // Baseline
  assert.deepEqual(profile.baseline.steps, { min: 3500, max: 5500 })
  assert.deepEqual(profile.baseline.sleepHours, { min: 6.5, max: 8 })
  assert.deepEqual(profile.baseline.restingHeartRate, { min: 62, max: 74 })
  assert.equal(profile.baseline.bloodPressure, "125/78")
  assert.equal(profile.baseline.lastUpdated, "2026-04-20")

  // Recent notes
  assert.ok(profile.recentNotes.length >= 3)
})

test("getMockCareRecipientProfile returns a cloned object so mutation cannot leak into future calls", () => {
  const a = getMockCareRecipientProfile(MOCK_CARE_RECIPIENT_PROFILE_ID)
  a.name = "MUTATED"
  a.recentNotes.push({
    id: "x",
    content: "x",
    author: "x",
    createdAt: "x",
  })
  const b = getMockCareRecipientProfile(MOCK_CARE_RECIPIENT_PROFILE_ID)
  assert.equal(b.name, "Margaret Chen")
  assert.equal(b.recentNotes.length, 3)
})
