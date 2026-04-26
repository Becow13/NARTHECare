/**
 * CareRecipientProfile — ESM/JS mirror of the TypeScript contract.
 *
 * This file is the backend-consumable mirror of
 * `./CareRecipientProfile.ts`. JSDoc `@typedef` blocks give the backend
 * editor-level type awareness without pulling TypeScript into the Node
 * build. The frozen constant objects below are the runtime enum values —
 * import them from route handlers and validators so every call site agrees
 * on the same strings the TS + Swift contracts use.
 *
 * Rule: if you change a field or value here, you MUST update the `.ts`
 * and the Swift model in the same change. Three files, one shape.
 */

// ─── Enum constants (runtime) ───────────────────────────────────────────────

/** Risk stratification surfaced on the profile header. */
export const RISK_LEVELS = Object.freeze({
  low: "low",
  moderate: "moderate",
  high: "high",
})

/** Supported data-source integrations. Must match `DataSourceType` in TS. */
export const DATA_SOURCE_TYPES = Object.freeze({
  appleHealth: "apple_health",
  epic: "epic",
  fitbit: "fitbit",
  garmin: "garmin",
  ring: "ring",
  fallDetection: "fall_detection",
})

/** Connection state the UI renders for each data source. */
export const DATA_SOURCE_STATUSES = Object.freeze({
  connected: "connected",
  notConnected: "not_connected",
  error: "error",
})

/** Roles a care-team member can hold. Must match `CareTeamRole` in TS. */
export const CARE_TEAM_PROFILE_ROLES = Object.freeze({
  primaryCaregiver: "primary_caregiver",
  familyMember: "family_member",
  clinician: "clinician",
  careCoordinator: "care_coordinator",
})

/** Access levels for care-team members. Must match `CareTeamPermission` in TS. */
export const CARE_TEAM_PROFILE_PERMISSIONS = Object.freeze({
  fullAccess: "full_access",
  limitedAccess: "limited_access",
  clinicalAccess: "clinical_access",
  viewOnly: "view_only",
})

// ─── Type aliases for editor tooling (JSDoc) ────────────────────────────────

/**
 * @typedef {"low" | "moderate" | "high"} RiskLevel
 *
 * @typedef {"apple_health" | "epic" | "fitbit" | "garmin" | "ring" | "fall_detection"} DataSourceType
 *
 * @typedef {"connected" | "not_connected" | "error"} DataSourceStatus
 *
 * @typedef {"primary_caregiver" | "family_member" | "clinician" | "care_coordinator"} CareTeamRole
 *
 * @typedef {"full_access" | "limited_access" | "clinical_access" | "view_only"} CareTeamPermission
 *
 * @typedef {Object} CareTeamMember
 * @property {string} id
 * @property {string} name
 * @property {CareTeamRole} role
 * @property {CareTeamPermission} permission
 *
 * @typedef {Object} CareRecipientContact
 * @property {string} [phone]
 * @property {string} [address]
 *
 * @typedef {Object} EmergencyContact
 * @property {string} name
 * @property {string} phone
 * @property {string} [relationship]
 *
 * @typedef {Object} CareTeam
 * @property {string} primaryCaregiver
 * @property {CareTeamMember[]} members
 *
 * @typedef {Object} HealthBackground
 * @property {string[]} conditions
 * @property {string[]} allergies
 * @property {string[]} medications
 * @property {string} [mobilityStatus]
 * @property {string} [fallRiskNotes]
 *
 * @typedef {Object} DataSource
 * @property {DataSourceType} type
 * @property {DataSourceStatus} status
 * @property {string} [lastSyncedAt]
 * @property {string} [errorMessage]
 *
 * @typedef {Object} BaselineRange
 * @property {number} min
 * @property {number} max
 *
 * @typedef {Object} Baseline
 * @property {BaselineRange} [steps]
 * @property {BaselineRange} [sleepHours]
 * @property {BaselineRange} [restingHeartRate]
 * @property {string} [bloodPressure]
 * @property {string} [lastUpdated]
 *
 * @typedef {Object} RecentNote
 * @property {string} id
 * @property {string} content
 * @property {string} author
 * @property {string} createdAt
 *
 * @typedef {Object} CareRecipientProfile
 * @property {string} id
 * @property {string} name
 * @property {number} age
 * @property {string} dateOfBirth
 * @property {string} [gender]
 * @property {string[]} primaryConditions
 * @property {RiskLevel} riskLevel
 * @property {CareRecipientContact} contact
 * @property {EmergencyContact} emergencyContact
 * @property {CareTeam} careTeam
 * @property {HealthBackground} healthBackground
 * @property {DataSource[]} dataSources
 * @property {Baseline} baseline
 * @property {RecentNote[]} recentNotes
 * @property {string} lastUpdated
 */

export {}
