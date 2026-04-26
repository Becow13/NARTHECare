/**
 * CareRecipientProfile — cross-platform data contract.
 *
 * This file is the single TypeScript source of truth for the
 * `GET /care-recipients/:id/profile` response shape. It is consumed by the
 * web app (TypeScript) and mirrored by `CareRecipientProfile.js` for the
 * backend (ESM JavaScript with JSDoc) and by
 * `apps/ios/NARTHECare/Models/CareRecipientProfile.swift` for iOS.
 *
 * Keep this file free of I/O and runtime dependencies. When you change a
 * field here, you MUST update the JS mirror AND the Swift model in the
 * same change — all three shapes must stay in lockstep so the API
 * response deserializes on every client.
 */

export type RiskLevel = "low" | "moderate" | "high"

export type DataSourceType =
  | "apple_health"
  | "epic"
  | "fitbit"
  | "garmin"
  | "ring"
  | "fall_detection"

export type DataSourceStatus = "connected" | "not_connected" | "error"

export type CareTeamRole =
  | "primary_caregiver"
  | "family_member"
  | "clinician"
  | "care_coordinator"

export type CareTeamPermission =
  | "full_access"
  | "limited_access"
  | "clinical_access"
  | "view_only"

export interface CareTeamMember {
  id: string
  name: string
  role: CareTeamRole
  permission: CareTeamPermission
}

export interface CareRecipientContact {
  phone?: string
  address?: string
}

export interface EmergencyContact {
  name: string
  phone: string
  relationship?: string
}

export interface CareTeam {
  primaryCaregiver: string
  members: CareTeamMember[]
}

export interface HealthBackground {
  conditions: string[]
  allergies: string[]
  medications: string[]
  mobilityStatus?: string
  fallRiskNotes?: string
}

export interface DataSource {
  type: DataSourceType
  status: DataSourceStatus
  lastSyncedAt?: string
  errorMessage?: string
}

export interface BaselineRange {
  min: number
  max: number
}

export interface Baseline {
  steps?: BaselineRange
  sleepHours?: BaselineRange
  restingHeartRate?: BaselineRange
  bloodPressure?: string
  lastUpdated?: string
}

export interface RecentNote {
  id: string
  content: string
  author: string
  createdAt: string
}

export interface CareRecipientProfile {
  id: string
  name: string
  age: number
  dateOfBirth: string
  gender?: string

  primaryConditions: string[]
  riskLevel: RiskLevel

  contact: CareRecipientContact
  emergencyContact: EmergencyContact
  careTeam: CareTeam
  healthBackground: HealthBackground
  dataSources: DataSource[]
  baseline: Baseline
  recentNotes: RecentNote[]

  lastUpdated: string
}

/** Response envelope for `GET /care-recipients/:id/profile`. */
export interface CareRecipientProfileResponse {
  careRecipient: CareRecipientProfile
}
