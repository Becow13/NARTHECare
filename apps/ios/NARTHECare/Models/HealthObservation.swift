import Foundation

/// Swift mirror of `shared/contracts/healthObservation.schema.json`.
///
/// This file is the iOS side of the cross-platform sync contract for
/// `POST /healthkit/sync`. It is hand-kept in lockstep with:
///
/// - `shared/contracts/healthObservation.schema.json` (source of truth)
/// - `shared/models/HealthObservation.ts` (web TS mirror)
/// - `shared/models/HealthObservation.js` (backend JS mirror)
///
/// Field names are camelCase and match the JSON payload exactly so no
/// `CodingKeys` remapping is needed — same convention as
/// `CareRecipientProfile.swift`. Enum raw values are snake_case to
/// match the schema's enum strings.
///
/// All structs are `Codable, Sendable` so SwiftUI views and view models
/// can hand them across `Task`/actor boundaries without warnings.
/// **Never log instances of these types** — `value`, `measuredAt`,
/// `metadata`, and `sourceRecordId` are PHI under the HIPAA framing
/// this app operates under.

// MARK: - Enums

/// Transport that delivered the sample. Phase 4A only ships
/// `.healthkit` from iOS; `.manual` is reserved for future
/// caregiver-entered rows.
enum HealthObservationSourceType: String, Codable, Sendable, CaseIterable {
  case healthkit
  case manual
}

/// Canonical metric_type strings persisted in
/// `health_observations.metric_type` on the backend.
enum HealthObservationMetricType: String, Codable, Sendable, CaseIterable {
  case steps
  case restingHeartRate = "resting_heart_rate"
  case hrv
  case spo2
  case sleepDuration = "sleep_duration"
  case respiratoryRate = "respiratory_rate"
  case walkingSteadiness = "walking_steadiness"
  case fallEvent = "fall_event"

  /// The unit string that must accompany this metric in the contract.
  /// Encoded once here so the sync service cannot accidentally pair
  /// a metric with the wrong unit (the backend rejects mismatches
  /// with a 400).
  var unit: HealthObservationUnit {
    switch self {
    case .steps: return .count
    case .restingHeartRate: return .bpm
    case .hrv: return .ms
    case .spo2: return .percent
    case .sleepDuration: return .hours
    case .respiratoryRate: return .breathsPerMin
    case .walkingSteadiness: return .score
    case .fallEvent: return .event
    }
  }
}

/// Canonical units paired with each metric type.
enum HealthObservationUnit: String, Codable, Sendable, CaseIterable {
  case count
  case bpm
  case ms
  case hours
  case percent
  case breathsPerMin = "breaths_per_min"
  case score
  case event
}

// MARK: - Observation

/// One normalized HealthKit / external sample.
///
/// PHI — never log `value`, `measuredAt`, `sourceRecordId`, or
/// `metadata`. Use `Hashable` for SwiftUI `ForEach` keys without
/// echoing the field values in logs.
struct HealthObservation: Codable, Sendable, Hashable {
  let sourceType: HealthObservationSourceType
  let sourceRecordId: String
  let metricType: HealthObservationMetricType
  let value: Double
  let unit: HealthObservationUnit
  let measuredAt: String
  let startAt: String?
  let endAt: String?

  /// Optional non-PHI structured extensions (e.g.
  /// `["device": "AppleWatch"]`). Carried as a JSON-encoded string so
  /// the struct stays `Hashable` — `[String: Any]` is not Codable and
  /// the contract treats this as an opaque object the backend stores
  /// verbatim. The sync service builds this from a typed dictionary.
  let metadata: HealthObservationMetadata?

  init(
    sourceType: HealthObservationSourceType = .healthkit,
    sourceRecordId: String,
    metricType: HealthObservationMetricType,
    value: Double,
    measuredAt: String,
    startAt: String? = nil,
    endAt: String? = nil,
    metadata: HealthObservationMetadata? = nil,
  ) {
    self.sourceType = sourceType
    self.sourceRecordId = sourceRecordId
    self.metricType = metricType
    self.value = value
    self.unit = metricType.unit
    self.measuredAt = measuredAt
    self.startAt = startAt
    self.endAt = endAt
    self.metadata = metadata
  }
}

/// Typed wrapper around the optional `metadata` object.
///
/// Restricts callers to the small, non-PHI key set the contract
/// allows (`device`, `motionContext`). Adding a free-form `[String:
/// Any]` here would defeat the contract — and would also break
/// `Codable` synthesis. Extend this struct deliberately when a new
/// non-PHI extension is needed.
struct HealthObservationMetadata: Codable, Sendable, Hashable {
  let device: String?
  let motionContext: String?

  init(device: String? = nil, motionContext: String? = nil) {
    self.device = device
    self.motionContext = motionContext
  }

  /// `nil` when no fields are set so the JSON encoder omits the
  /// `metadata` key entirely instead of writing `{}`.
  static func make(device: String? = nil, motionContext: String? = nil)
    -> HealthObservationMetadata?
  {
    if device == nil, motionContext == nil { return nil }
    return HealthObservationMetadata(device: device, motionContext: motionContext)
  }
}

// MARK: - Sync envelope types

/// Request body for `POST /healthkit/sync`.
struct HealthKitSyncRequest: Codable, Sendable {
  let careRecipientId: String
  let observations: [HealthObservation]
}

/// Response body for `POST /healthkit/sync`. Counts only — never
/// echoes per-sample contents back to the client.
struct HealthKitSyncResponse: Codable, Sendable, Hashable {
  let accepted: Int
  let deduped: Int
  let rejected: Int
  let lastSyncedAt: String?
}

/// Response body for `GET /healthkit/status`.
struct HealthKitSyncStatusResponse: Codable, Sendable, Hashable {
  let status: HealthKitSyncStatusValue
  let lastSyncedAt: String?
  let errorMessage: String?
}

/// Discriminated registry status value.
///
/// Mirrors `DataSourceStatus` from `CareRecipientProfile.swift`
/// (intentionally a separate type so a future Phase 4B status drift
/// on the registry side does not silently change the dashboard's
/// view-model contract).
enum HealthKitSyncStatusValue: String, Codable, Sendable, CaseIterable {
  case connected
  case notConnected = "not_connected"
  case error
}
