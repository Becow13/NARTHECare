import Foundation

/// Swift mirror of `shared/contracts/careRecipientProfile.schema.json`.
///
/// This file is the iOS side of the cross-platform data contract for
/// `GET /care-recipients/:id/profile`. It is hand-kept in lockstep with:
///
/// - `shared/contracts/careRecipientProfile.schema.json` (source of truth)
/// - `shared/models/CareRecipientProfile.ts` (web TS mirror)
/// - `shared/models/CareRecipientProfile.js` (backend JS mirror)
///
/// Field names are camelCase and match the JSON payload exactly, so no
/// `CodingKeys` remapping is needed. Enum raw values are snake_case to
/// match the schema's enum strings.
///
/// All structs are `Codable, Sendable` so SwiftUI views and view models
/// can hold them across `Task`/actor boundaries without warnings.
/// Never log instances of these structs — most fields are PHI.

// MARK: - Enums

enum RiskLevel: String, Codable, Sendable, CaseIterable {
  case low
  case moderate
  case high
}

enum DataSourceType: String, Codable, Sendable, CaseIterable {
  case appleHealth = "apple_health"
  case epic
  case fitbit
  case garmin
  case ring
  case fallDetection = "fall_detection"
}

enum DataSourceStatus: String, Codable, Sendable, CaseIterable {
  case connected
  case notConnected = "not_connected"
  case error
}

enum CareTeamRole: String, Codable, Sendable, CaseIterable {
  case primaryCaregiver = "primary_caregiver"
  case familyMember = "family_member"
  case clinician
  case careCoordinator = "care_coordinator"
}

enum CareTeamPermission: String, Codable, Sendable, CaseIterable {
  case fullAccess = "full_access"
  case limitedAccess = "limited_access"
  case clinicalAccess = "clinical_access"
  case viewOnly = "view_only"
}

// MARK: - Nested payload types

struct CareTeamMember: Codable, Sendable, Identifiable, Hashable {
  let id: String
  let name: String
  let role: CareTeamRole
  let permission: CareTeamPermission
}

struct CareRecipientContact: Codable, Sendable, Hashable {
  let phone: String?
  let address: String?
}

struct EmergencyContact: Codable, Sendable, Hashable {
  let name: String
  let phone: String
  let relationship: String?
}

struct CareTeam: Codable, Sendable, Hashable {
  let primaryCaregiver: String
  let members: [CareTeamMember]
}

struct HealthBackground: Codable, Sendable, Hashable {
  let conditions: [String]
  let allergies: [String]
  let medications: [String]
  let mobilityStatus: String?
  let fallRiskNotes: String?
}

struct DataSource: Codable, Sendable, Identifiable, Hashable {
  let type: DataSourceType
  let status: DataSourceStatus
  let lastSyncedAt: String?
  let errorMessage: String?

  /// `type` is unique within a profile (the backend never returns two
  /// rows for the same integration family) so it doubles as a stable
  /// id for SwiftUI `ForEach`.
  var id: DataSourceType { type }
}

struct BaselineRange: Codable, Sendable, Hashable {
  let min: Double
  let max: Double
}

struct Baseline: Codable, Sendable, Hashable {
  let steps: BaselineRange?
  let sleepHours: BaselineRange?
  let restingHeartRate: BaselineRange?
  let bloodPressure: String?
  let lastUpdated: String?
}

struct RecentNote: Codable, Sendable, Identifiable, Hashable {
  let id: String
  let content: String
  let author: String
  let createdAt: String
}

// MARK: - Top-level profile

struct CareRecipientProfile: Codable, Sendable, Identifiable, Hashable {
  let id: String
  let name: String
  let age: Int
  let dateOfBirth: String
  let gender: String?

  let primaryConditions: [String]
  let riskLevel: RiskLevel

  let contact: CareRecipientContact
  let emergencyContact: EmergencyContact
  let careTeam: CareTeam
  let healthBackground: HealthBackground
  let dataSources: [DataSource]
  let baseline: Baseline
  let recentNotes: [RecentNote]

  let lastUpdated: String
}

/// Envelope returned by `GET /care-recipients/:id/profile`.
///
/// Kept as its own type so we can add sibling fields (e.g. `warnings`)
/// without a breaking change to the top-level payload.
struct CareRecipientProfileResponse: Codable, Sendable {
  let careRecipient: CareRecipientProfile
}
