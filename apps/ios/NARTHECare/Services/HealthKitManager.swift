import Foundation
import HealthKit

/// Reads a small window of HealthKit data and builds the upload payload.
final class HealthKitManager: @unchecked Sendable {
  private let healthStore = HKHealthStore()

  private var readTypes: Set<HKObjectType> {
    var set = Set<HKObjectType>()
    if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { set.insert(t) }
    if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { set.insert(t) }
    if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { set.insert(t) }
    return set
  }

  func isHealthDataAvailable() -> Bool {
    HKHealthStore.isHealthDataAvailable()
  }

  func requestAuthorization() async throws {
    try await healthStore.requestAuthorization(toShare: [], read: readTypes)
  }

  func buildPayload(userId: String) async throws -> HealthUploadPayload {
    async let steps = fetchDailySteps(days: 7)
    async let heart = fetchRecentHeartRate(limit: 40)
    async let sleep = fetchRecentSleepSegments()
    return try await HealthUploadPayload(
      userId: userId,
      steps: steps,
      heartRate: heart,
      sleep: sleep
    )
  }

  // MARK: - Steps (one row per local calendar day)

  private func fetchDailySteps(days: Int) async throws -> [MetricSample] {
    guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
      return []
    }

    let calendar = Calendar.current
    let dayFormatter = DateFormatter()
    dayFormatter.calendar = Calendar(identifier: .gregorian)
    dayFormatter.locale = Locale(identifier: "en_US_POSIX")
    dayFormatter.timeZone = TimeZone.current
    dayFormatter.dateFormat = "yyyy-MM-dd"

    var samples: [MetricSample] = []

    for dayOffset in 0 ..< days {
      guard
        let dayStart = calendar.date(byAdding: .day, value: -dayOffset, to: calendar.startOfDay(for: Date()))
      else { continue }
      let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart)!
      let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd)

      let stepsValue: Double = try await withCheckedThrowingContinuation { continuation in
        let query = HKStatisticsQuery(
          quantityType: stepType,
          quantitySamplePredicate: predicate,
          options: .cumulativeSum
        ) { _, statistics, error in
          if let error = error {
            continuation.resume(throwing: error)
            return
          }
          let quantity = statistics?.sumQuantity()
          let value = quantity?.doubleValue(for: HKUnit.count()) ?? 0
          continuation.resume(returning: value)
        }
        self.healthStore.execute(query)
      }

      let dateStr = dayFormatter.string(from: dayStart)
      samples.append(MetricSample(value: stepsValue, date: dateStr))
    }

    return samples.reversed()
  }

  // MARK: - Heart rate (recent samples, ISO8601 with time)

  private func fetchRecentHeartRate(limit: Int) async throws -> [MetricSample] {
    guard let heartType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
      return []
    }

    let end = Date()
    let start = end.addingTimeInterval(-86_400)
    let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

    let quantitySamples: [HKQuantitySample] = try await withCheckedThrowingContinuation {
      continuation in
      let query = HKSampleQuery(
        sampleType: heartType,
        predicate: predicate,
        limit: limit,
        sortDescriptors: [sort]
      ) { _, results, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        let typed = (results as? [HKQuantitySample]) ?? []
        continuation.resume(returning: typed)
      }
      self.healthStore.execute(query)
    }

    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime]
    iso.timeZone = TimeZone(secondsFromGMT: 0)

    let bpmUnit = HKUnit.count().unitDivided(by: HKUnit.minute())

    return Array(
      quantitySamples.map { sample in
        let bpm = sample.quantity.doubleValue(for: bpmUnit)
        let dateStr = iso.string(from: sample.endDate)
        return MetricSample(value: bpm, date: dateStr)
      }.reversed())
  }

  // MARK: - Sleep (hours asleep + date label)

  private func fetchRecentSleepSegments() async throws -> [MetricSample] {
    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      return []
    }

    let end = Date()
    let start = end.addingTimeInterval(-86_400 * 2)

    let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: true)

    let categorySamples: [HKCategorySample] = try await withCheckedThrowingContinuation {
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

    var asleepSeconds: TimeInterval = 0
    var lastAsleepEnd: Date?

    for sample in categorySamples {
      guard Self.isAsleep(sample.value) else { continue }
      asleepSeconds += sample.endDate.timeIntervalSince(sample.startDate)
      lastAsleepEnd = sample.endDate
    }

    guard asleepSeconds > 0, let anchor = lastAsleepEnd else {
      return []
    }

    let hours = asleepSeconds / 3600.0

    let dayFormatter = DateFormatter()
    dayFormatter.calendar = Calendar(identifier: .gregorian)
    dayFormatter.locale = Locale(identifier: "en_US_POSIX")
    dayFormatter.timeZone = TimeZone.current
    dayFormatter.dateFormat = "yyyy-MM-dd"

    let dateStr = dayFormatter.string(from: anchor)

    return [MetricSample(value: hours, date: dateStr)]
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
}
