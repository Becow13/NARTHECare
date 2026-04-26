/**
 * Mock `CareRecipientProfile` used while the backend has no profile tables.
 *
 * Kept as a pure module (no I/O) so the service layer can call it in-process
 * without reaching the DB. The shape mirrors
 * `shared/models/CareRecipientProfile.ts` exactly — when that contract
 * changes this mock must change in the same PR so the backend never returns
 * a payload the iOS/web clients cannot decode.
 *
 * TODO(postgres): drop this module once
 * `services/dao/careRecipientProfileDao.js` is wired to real tables. The
 * fallback call-site in `services/careRecipientProfileService.js` should be
 * removed at the same time.
 */

import {
  RISK_LEVELS,
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
  CARE_TEAM_PROFILE_ROLES,
  CARE_TEAM_PROFILE_PERMISSIONS,
  MOCK_CARE_RECIPIENT_PROFILE_ID,
} from "../../lib/care-recipient-profile.js"

const MARGARET_CHEN_PROFILE = Object.freeze({
  id: MOCK_CARE_RECIPIENT_PROFILE_ID,
  name: "Margaret Chen",
  age: 78,
  dateOfBirth: "1947-02-14",
  gender: "Female",

  primaryConditions: ["Type 2 Diabetes", "Hypertension"],
  riskLevel: RISK_LEVELS.moderate,

  contact: {
    phone: "+1-415-555-0142",
    address: "1280 Sunset Blvd, San Francisco, CA 94122",
  },

  emergencyContact: {
    name: "Jessie Huang",
    phone: "+1-415-555-0188",
    relationship: "Daughter",
  },

  careTeam: {
    primaryCaregiver: "Jessie Huang",
    members: [
      {
        id: "ctm-001",
        name: "Jessie Huang",
        role: CARE_TEAM_PROFILE_ROLES.primaryCaregiver,
        permission: CARE_TEAM_PROFILE_PERMISSIONS.fullAccess,
      },
      {
        id: "ctm-002",
        name: "David Chen",
        role: CARE_TEAM_PROFILE_ROLES.familyMember,
        permission: CARE_TEAM_PROFILE_PERMISSIONS.limitedAccess,
      },
      {
        id: "ctm-003",
        name: "Dr. Priya Nair",
        role: CARE_TEAM_PROFILE_ROLES.clinician,
        permission: CARE_TEAM_PROFILE_PERMISSIONS.clinicalAccess,
      },
      {
        id: "ctm-004",
        name: "Renee Alvarez",
        role: CARE_TEAM_PROFILE_ROLES.careCoordinator,
        permission: CARE_TEAM_PROFILE_PERMISSIONS.viewOnly,
      },
    ],
  },

  healthBackground: {
    conditions: ["Type 2 Diabetes", "Hypertension", "Mild osteoarthritis"],
    allergies: ["Penicillin"],
    medications: [
      "Metformin 500 mg, twice daily",
      "Lisinopril 10 mg, once daily",
      "Atorvastatin 20 mg, once daily",
    ],
    mobilityStatus: "Ambulatory with cane on longer walks",
    fallRiskNotes: "One near-fall reported in the last 90 days; no injury.",
  },

  dataSources: [
    {
      type: DATA_SOURCE_TYPES.appleHealth,
      status: DATA_SOURCE_STATUSES.connected,
      lastSyncedAt: "2026-04-25T09:12:00-07:00",
    },
    {
      type: DATA_SOURCE_TYPES.epic,
      status: DATA_SOURCE_STATUSES.notConnected,
    },
    {
      type: DATA_SOURCE_TYPES.fallDetection,
      status: DATA_SOURCE_STATUSES.connected,
      lastSyncedAt: "2026-04-25T08:45:00-07:00",
    },
    {
      type: DATA_SOURCE_TYPES.fitbit,
      status: DATA_SOURCE_STATUSES.notConnected,
    },
    {
      type: DATA_SOURCE_TYPES.garmin,
      status: DATA_SOURCE_STATUSES.notConnected,
    },
    {
      type: DATA_SOURCE_TYPES.ring,
      status: DATA_SOURCE_STATUSES.notConnected,
    },
  ],

  baseline: {
    steps: { min: 3500, max: 5500 },
    sleepHours: { min: 6.5, max: 8 },
    restingHeartRate: { min: 62, max: 74 },
    bloodPressure: "125/78",
    lastUpdated: "2026-04-20",
  },

  recentNotes: [
    {
      id: "note-001",
      content:
        "Reported mild dizziness after lunch. Will monitor hydration.",
      author: "Jessie Huang",
      createdAt: "2026-04-24T13:15:00-07:00",
    },
    {
      id: "note-002",
      content: "Completed morning walk with assistance.",
      author: "Jessie Huang",
      createdAt: "2026-04-24T09:00:00-07:00",
    },
    {
      id: "note-003",
      content: "Medication reminder confirmed.",
      author: "Jessie Huang",
      createdAt: "2026-04-23T20:30:00-07:00",
    },
  ],

  lastUpdated: "2026-04-25T09:12:00-07:00",
})

/**
 * Return the mock profile when `recipientId` matches the stable mock id,
 * otherwise `null` so the service layer can 404 the request.
 *
 * Returns a deep-cloned copy so callers can freely mutate the response
 * (e.g. to redact fields for a role) without corrupting the module-level
 * singleton.
 */
export function getMockCareRecipientProfile(recipientId) {
  if (recipientId !== MOCK_CARE_RECIPIENT_PROFILE_ID) return null
  return structuredClone(MARGARET_CHEN_PROFILE)
}
