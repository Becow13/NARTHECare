import Foundation
import HealthKit

/// Reads HealthKit data and assembles upload payloads for the backend.
///
/// Single surface:
///
///   - `readObservations(since:)` — Phase 4A sync. Produces normalized
///     `HealthObservation` rows that travel through `POST /healthkit/sync`
///     and land in the canonical, care-recipient-scoped
///     `health_observations` table.
///
/// **PHI guardrail:** never log values, sample UUIDs, sample contents,
/// or any field of `HealthObservation`. Only counts and metric-type
/// keys are safe to log.
final class HealthKitManager: @unchecked Sendable {
  private let healthStore = HKHealthStore()

  /// HealthKit types we ask permission for. Covers the canonical
  /// Phase 4A metric set (steps, heart rate / resting HR, HRV, SpO2,
  /// respiratory rate, walking steadiness, fall events, sleep
  /// analysis). Each is `if let`-guarded because Apple may withdraw
  /// a type on older OSes; the missing type is silently dropped
  /// from the request.
  private var readTypes: Set<HKObjectType> {
    var set = Set<HKObjectType>()
    if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { set.insert(t) }
    if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { set.insert(t) }
    if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { set.insert(t) }
    if let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
      set.insert(t)
    }
    if let t = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
      set.insert(t)
    }
    if let t = HKObjectType.quantityType(forIdentifier: .oxygenSaturation) {
      set.insert(t)
    }
    if let t = HKObjectType.quantityType(forIdentifier: .respiratoryRate) {
      set.insert(t)
    }
    if let t = HKObjectType.quantityType(forIdentifier: .appleWalkingSteadiness) {
      set.insert(t)
    }
    if let t = HKObjectType.quantityType(forIdentifier: .numberOfTimesFallen) {
      set.insert(t)
    }
    return set
  }

  func isHealthDataAvailable() -> Bool {
    HKHealthStore.isHealthDataAvailable()
  }

  func requestAuthorization() async throws {
    try await healthStore.requestAuthorization(toShare: [], read: readTypes)
  }

  // MARK: - Phase 4A normalized observations

  /// Read every supported metric since `since` and return one
  /// `HealthObservation` per HealthKit sample.
  ///
  /// The function never throws on a single-metric failure — a missing
  /// HealthKit type or a per-metric query error returns an empty
  /// slice for that metric so a partial sync still ships the metrics
  /// the device successfully read. The caller (the sync service)
  /// gets a predictable batch back without writing per-metric error
  /// branches.
  ///
  /// `sourceRecordId` is the HealthKit sample UUID for instant
  /// samples; for derived rows (daily step total, fall count) we
  /// build a deterministic dedupe key from the metric type + day so
  /// the backend's `ON CONFLICT (source_type, source_record_id) DO
  /// NOTHING` collapses repeat syncs into the same row instead of
  /// duplicating per-day buckets.
  func readObservations(since: Date) async throws -> [HealthObservation] {
    async let stepRows = readDailyStepObservations(since: since)
    async let restingHRRows = readQuantityObservations(
      identifier: .restingHeartRate,
      metric: .restingHeartRate,
      unit: HKUnit.count().unitDivided(by: .minute()),
      since: since,
    )
    async let hrvRows = readQuantityObservations(
      identifier: .heartRateVariabilitySDNN,
      metric: .hrv,
      unit: HKUnit.secondUnit(with: .milli),
      since: since,
    )
    async let spo2Rows = readQuantityObservations(
      identifier: .oxygenSaturation,
      metric: .spo2,
      // Apple stores SpO2 as a 0..1 fraction; multiply by 100 to
      // match the contract's `percent` unit (which means 0..100).
      unit: .percent(),
      transform: { $0 * 100 },
      since: since,
    )
    async let respRows = readQuantityObservations(
      identifier: .respiratoryRate,
      metric: .respiratoryRate,
      unit: HKUnit.count().unitDivided(by: .minute()),
      since: since,
    )
    async let walkRows = readQuantityObservations(
      identifier: .appleWalkingSteadiness,
      metric: .walkingSteadiness,
      unit: .percent(),
      transform: { $0 * 100 },
      since: since,
    )
    async let fallRows = readDailyFallObservations(since: since)
    async let sleepRows = readSleepObservations(since: since)

    var all: [HealthObservation] = []
    all.append(contentsOf: try await stepRows)
    all.append(contentsOf: try await restingHRRows)
    all.append(contentsOf: try await hrvRows)
    all.append(contentsOf: try await spo2Rows)
    all.append(contentsOf: try await respRows)
    all.append(contentsOf: try await walkRows)
    all.append(contentsOf: try await fallRows)
    all.append(contentsOf: try await sleepRows)
    return all
  }

  private static func isAsleep(_ value: Int) -> Bool {
    guard let v = HKCategoryValueSleepAnalysis(rawValue: value) else { return false }
    switch v {
    case .asleepUnspecified, .asleepCore, .asleepDeep, .asleepREM:
      return true
    default:
      return false
    }
  }

  // MARK: - Phase 4A: per-sample observation reads

  /// Generic per-sample reader for instant quantity types (HRV,
  /// resting HR, SpO2, respiratory rate, walking steadiness).
  ///
  /// Each HealthKit sample becomes one `HealthObservation` keyed on
  /// the sample's UUID — the backend's `ON CONFLICT (source_type,
  /// source_record_id) DO NOTHING` will silently dedupe re-syncs.
  private func readQuantityObservations(
    identifier: HKQuantityTypeIdentifier,
    metric: HealthObservationMetricType,
    unit: HKUnit,
    transform: (@Sendable (Double) -> Double)? = nil,
    since: Date,
  ) async throws -> [HealthObservation] {
    guard let type = HKQuantityType.quantityType(forIdentifier: identifier) else {
      return []
    }
    let predicate = HKQuery.predicateForSamples(withStart: since, end: Date())
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

    let samples: [HKQuantitySample] = try await withCheckedThrowingContinuation {
      continuation in
      let query = HKSampleQuery(
        sampleType: type,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, results, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: (results as? [HKQuantitySample]) ?? [])
      }
      self.healthStore.execute(query)
    }

    let iso = Self.iso8601Formatter()

    return samples.map { sample in
      let raw = sample.quantity.doubleValue(for: unit)
      let value = transform?(raw) ?? raw
      let measuredAt = iso.string(from: sample.endDate)
      let startAt =
        sample.startDate != sample.endDate
        ? iso.string(from: sample.startDate)
        : nil
      let endAt =
        sample.startDate != sample.endDate
        ? iso.string(from: sample.endDate)
        : nil
      return HealthObservation(
        sourceType: .healthkit,
        sourceRecordId: sample.uuid.uuidString,
        metricType: metric,
        value: value,
        measuredAt: measuredAt,
        startAt: startAt,
        endAt: endAt,
        metadata: nil,
      )
    }
  }

  /// Daily step totals as one observation per local-calendar day.
  ///
  /// `sourceRecordId` is a deterministic `"steps:YYYY-MM-DD"` key
  /// (rather than a HealthKit sample UUID) because the value is the
  /// daily SUM rather than a single sample — the backend's UNIQUE
  /// then collapses repeat syncs of the same day into the existing
  /// row. Days with zero steps are dropped so the table doesn't fill
  /// with no-information rows.
  private func readDailyStepObservations(since: Date) async throws
    -> [HealthObservation]
  {
    guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
      return []
    }
    let calendar = Calendar.current
    let dayFormatter = Self.dayFormatter()
    let iso = Self.iso8601Formatter()

    let startOfWindow = calendar.startOfDay(for: since)
    var observations: [HealthObservation] = []

    var cursor = startOfWindow
    while cursor <= Date() {
      guard
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: cursor)
      else { break }
      let predicate = HKQuery.predicateForSamples(
        withStart: cursor, end: dayEnd)
      let value: Double = try await withCheckedThrowingContinuation {
        continuation in
        let query = HKStatisticsQuery(
          quantityType: stepType,
          quantitySamplePredicate: predicate,
          options: .cumulativeSum,
        ) { _, statistics, error in
          if let error = error {
            continuation.resume(throwing: error)
            return
          }
          let quantity = statistics?.sumQuantity()
          continuation.resume(returning: quantity?.doubleValue(for: .count()) ?? 0)
        }
        self.healthStore.execute(query)
      }

      if value > 0 {
        let dayKey = dayFormatter.string(from: cursor)
        observations.append(
          HealthObservation(
            sourceType: .healthkit,
            sourceRecordId: "steps:\(dayKey)",
            metricType: .steps,
            value: value,
            measuredAt: iso.string(from: dayEnd.addingTimeInterval(-1)),
            startAt: iso.string(from: cursor),
            endAt: iso.string(from: dayEnd),
            metadata: HealthObservationMetadata.make(device: "AppleHealth"),
          ))
      }
      cursor = dayEnd
    }
    return observations
  }

  /// Daily fall counts as one observation per local-calendar day.
  /// Same dedupe-key shape as `readDailyStepObservations` so resync
  /// is safe.
  private func readDailyFallObservations(since: Date) async throws
    -> [HealthObservation]
  {
    guard
      let fallType = HKQuantityType.quantityType(forIdentifier: .numberOfTimesFallen)
    else { return [] }
    let calendar = Calendar.current
    let dayFormatter = Self.dayFormatter()
    let iso = Self.iso8601Formatter()
    let startOfWindow = calendar.startOfDay(for: since)
    var observations: [HealthObservation] = []
    var cursor = startOfWindow
    while cursor <= Date() {
      guard
        let dayEnd = calendar.date(byAdding: .day, value: 1, to: cursor)
      else { break }
      let predicate = HKQuery.predicateForSamples(
        withStart: cursor, end: dayEnd)
      let value: Double = try await withCheckedThrowingContinuation {
        continuation in
        let query = HKStatisticsQuery(
          quantityType: fallType,
          quantitySamplePredicate: predicate,
          options: .cumulativeSum,
        ) { _, statistics, error in
          if let error = error {
            continuation.resume(throwing: error)
            return
          }
          let quantity = statistics?.sumQuantity()
          continuation.resume(returning: quantity?.doubleValue(for: .count()) ?? 0)
        }
        self.healthStore.execute(query)
      }

      if value > 0 {
        let dayKey = dayFormatter.string(from: cursor)
        observations.append(
          HealthObservation(
            sourceType: .healthkit,
            sourceRecordId: "fall_event:\(dayKey)",
            metricType: .fallEvent,
            value: value,
            measuredAt: iso.string(from: dayEnd.addingTimeInterval(-1)),
            startAt: iso.string(from: cursor),
            endAt: iso.string(from: dayEnd),
            metadata: nil,
          ))
      }
      cursor = dayEnd
    }
    return observations
  }

  /// Sleep duration as one observation per night, totaling all
  /// asleep-state segments. `sourceRecordId` keys on the night-end
  /// day so resyncs are idempotent (a partial-night second sync will
  /// dedupe rather than double-count).
  private func readSleepObservations(since: Date) async throws
    -> [HealthObservation]
  {
    guard
      let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    else { return [] }
    let predicate = HKQuery.predicateForSamples(withStart: since, end: Date())
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)
    let samples: [HKCategorySample] = try await withCheckedThrowingContinuation {
      continuation in
      let query = HKSampleQuery(
        sampleType: sleepType,
        predicate: predicate,
        limit: HKObjectQueryNoLimit,
        sortDescriptors: [sort]
      ) { _, results, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        continuation.resume(returning: (results as? [HKCategorySample]) ?? [])
      }
      self.healthStore.execute(query)
    }

    // Bucket asleep segments by the local calendar day of the
    // segment's end (the "morning of"). One observation per day.
    let calendar = Calendar.current
    let dayFormatter = Self.dayFormatter()
    let iso = Self.iso8601Formatter()
    var byDay: [String: (seconds: TimeInterval, lastEnd: Date, firstStart: Date)] =
      [:]
    for sample in samples where Self.isAsleep(sample.value) {
      let key = dayFormatter.string(from: calendar.startOfDay(for: sample.endDate))
      let duration = sample.endDate.timeIntervalSince(sample.startDate)
      let prior = byDay[key]
      byDay[key] = (
        seconds: (prior?.seconds ?? 0) + duration,
        lastEnd: max(prior?.lastEnd ?? sample.endDate, sample.endDate),
        firstStart: min(prior?.firstStart ?? sample.startDate, sample.startDate),
      )
    }

    return byDay
      .sorted { $0.key < $1.key }
      .map { (key, info) in
        HealthObservation(
          sourceType: .healthkit,
          sourceRecordId: "sleep_duration:\(key)",
          metricType: .sleepDuration,
          value: info.seconds / 3600.0,
          measuredAt: iso.string(from: info.lastEnd),
          startAt: iso.string(from: info.firstStart),
          endAt: iso.string(from: info.lastEnd),
          metadata: nil,
        )
      }
  }

  // MARK: - Helpers

  private static func iso8601Formatter() -> ISO8601DateFormatter {
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    iso.timeZone = TimeZone(secondsFromGMT: 0)
    return iso
  }

  private static func dayFormatter() -> DateFormatter {
    let f = DateFormatter()
    f.calendar = Calendar(identifier: .gregorian)
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = "yyyy-MM-dd"
    return f
  }
}
