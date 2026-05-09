import Foundation
import HealthKit
import UIKit

/// Background HealthKit sync — `HKObserverQuery` + background delivery
/// + `HKAnchoredObjectQuery` per supported sample type.
///
/// This file is the production sync path:
///
///   - `HealthKitObserverManager.startObservers(forRecipientId:)`
///     registers one `HKObserverQuery` per contract metric and asks
///     HealthKit to wake the app whenever new samples arrive.
///   - On every observer fire we run an `HKAnchoredObjectQuery` using
///     the per-`(recipient, sample-type)` anchor, map only the new
///     samples into normalized `HealthObservation` rows, and POST
///     them to `/healthkit/sync`. Anchors are advanced **only** after
///     the upload succeeds so a network blip never silently drops a
///     window.
///   - The `HealthKitSyncService.syncNow` foreground path remains
///     for the manual "Sync now" button; it is independent and uses
///     daily-aggregation queries for the user-visible list.
///
/// **PHI guardrails (HIPAA):** never log sample contents, sample
/// UUIDs, observation values, recipient names, or token bytes. Only
/// counts, metric-type identifiers (`stepCount`, etc.), and HKError
/// numeric codes are safe to log.

// MARK: - Diagnostics

/// Observable sync-diagnostics state.
///
/// Lives as a `static let shared` so the background observer can update
/// it from any thread (via `MainActor.run`), and SwiftUI views can
/// subscribe via `@ObservedObject` without owning the instance. Every
/// field is intentionally non-PHI: timestamps, counts, sample-type
/// identifiers, and HKError numeric codes only.
@MainActor
final class HealthKitSyncDiagnostics: ObservableObject {
  static let shared = HealthKitSyncDiagnostics()

  /// HealthKit authorization state, from the caller's perspective.
  /// `notDetermined` and `denied` are indistinguishable for read
  /// permissions per Apple's privacy guarantees, so we never claim
  /// a denial — we only mark `granted` once a successful
  /// `requestAuthorization` has returned.
  enum AuthorizationState: String, Sendable, Equatable {
    case unknown
    case granted
    case unavailable
  }

  /// Per-sample-type background-delivery state. `failed(code:)`
  /// carries the HKError numeric code (e.g. 5 = authorization not
  /// determined) so ops can triage without seeing PHI.
  enum BackgroundDeliveryState: Sendable, Equatable {
    case notRegistered
    case enabled
    case failed(code: Int)
    case unsupported
  }

  /// Outcome of the last sync attempt (background or foreground).
  enum LastSyncState: String, Sendable, Equatable {
    case idle
    case running
    case success
    case failure
  }

  @Published private(set) var authorization: AuthorizationState = .unknown
  @Published private(set) var backgroundDeliveryByMetric:
    [HealthObservationMetricType: BackgroundDeliveryState] = [:]
  @Published private(set) var lastObserverFireAt: Date? = nil
  /// Persisted across launches so the UI shows the real last background
  /// delivery time even after a cold start. Written only by
  /// `recordBackgroundSyncSuccess`; never by manual/foreground sync.
  @Published private(set) var lastSuccessfulBackgroundSyncAt: Date? = {
    guard
      let ts = UserDefaults.standard.object(
        forKey: HealthKitSyncDiagnostics.lastBgSyncKey) as? Date
    else { return nil }
    return ts
  }()
  @Published private(set) var lastSyncState: LastSyncState = .idle
  /// Short, non-PHI failure code surfaced after `lastSyncState ==
  /// .failure` (e.g. `"http_403"`, `"obs_5"`, `"no_session"`). Never
  /// contains messages, values, or identifiers.
  @Published private(set) var lastSyncErrorCode: String? = nil
  /// Sample count uploaded in the last successful sync attempt.
  /// Counts only — never values.
  @Published private(set) var lastSyncSamplesUploaded: Int = 0

  private init() {}

  /// UserDefaults key for the persisted background sync timestamp.
  /// Not PHI — stores only a `Date` (no identifiers or health values).
  fileprivate static let lastBgSyncKey = "narthecare.healthkit.lastBackgroundSyncAt"

  func setAuthorization(_ s: AuthorizationState) { authorization = s }

  func setBackgroundDelivery(
    _ state: BackgroundDeliveryState,
    for metric: HealthObservationMetricType,
  ) {
    backgroundDeliveryByMetric[metric] = state
  }

  /// Stamp the moment HealthKit invoked an observer's update handler.
  /// Always paired with a subsequent `recordSyncSuccess` /
  /// `recordSyncFailure` so the UI never shows a stale `running` row.
  func recordObserverFire() {
    lastObserverFireAt = Date()
    lastSyncState = .running
  }

  func recordSyncStart() {
    lastSyncState = .running
  }

  func recordSyncSuccess(samplesUploaded: Int) {
    lastSyncSamplesUploaded = samplesUploaded
    lastSyncState = .success
    lastSyncErrorCode = nil
  }

  /// Records a successful sync triggered by a real HealthKit background
  /// observer delivery.  Updates `lastSuccessfulBackgroundSyncAt` and
  /// persists it to `UserDefaults` so the time survives app restarts.
  func recordBackgroundSyncSuccess(samplesUploaded: Int) {
    let now = Date()
    lastSuccessfulBackgroundSyncAt = now
    UserDefaults.standard.set(now, forKey: HealthKitSyncDiagnostics.lastBgSyncKey)
    lastSyncSamplesUploaded = samplesUploaded
    lastSyncState = .success
    lastSyncErrorCode = nil
  }

  func recordSyncFailure(code: String) {
    lastSyncState = .failure
    lastSyncErrorCode = code
  }

  /// Reset transient state on sign-out so the next signed-in user
  /// does not inherit the previous session's diagnostics. The
  /// authorization state is preserved because it lives in the OS,
  /// not in our app.
  func resetForSignOut() {
    backgroundDeliveryByMetric.removeAll()
    lastObserverFireAt = nil
    lastSuccessfulBackgroundSyncAt = nil
    UserDefaults.standard.removeObject(forKey: HealthKitSyncDiagnostics.lastBgSyncKey)
    lastSyncState = .idle
    lastSyncErrorCode = nil
    lastSyncSamplesUploaded = 0
  }
}

// MARK: - Anchor + active-recipient persistence

/// Persists `HKQueryAnchor` per `(recipient, sample-type)` in
/// `UserDefaults`.
///
/// `HKQueryAnchor` is an opaque token marking the caller's "last
/// seen" position in HealthKit's per-type sample stream. It is **not**
/// PHI and **not** a credential — losing it just causes the next
/// anchored query to refetch whatever falls inside the predicate
/// window. Persisting in `UserDefaults` is the pattern Apple's own
/// HealthKit samples use; the Keychain is reserved for token bytes.
enum HealthKitAnchorStore {
  private static let prefix = "narthecare.healthkit.anchor."

  static func anchor(
    recipientId: String,
    typeIdentifier: String,
  ) -> HKQueryAnchor? {
    let key = makeKey(recipientId: recipientId, typeIdentifier: typeIdentifier)
    guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
    return try? NSKeyedUnarchiver.unarchivedObject(
      ofClass: HKQueryAnchor.self, from: data,
    )
  }

  static func setAnchor(
    _ anchor: HKQueryAnchor,
    recipientId: String,
    typeIdentifier: String,
  ) {
    let key = makeKey(recipientId: recipientId, typeIdentifier: typeIdentifier)
    do {
      let data = try NSKeyedArchiver.archivedData(
        withRootObject: anchor, requiringSecureCoding: true,
      )
      UserDefaults.standard.set(data, forKey: key)
    } catch {
      let nsError = error as NSError
      print(
        "[HealthKit] anchor archive failed type=\(typeIdentifier) "
          + "domain=\(nsError.domain) code=\(nsError.code)"
      )
    }
  }

  /// Remove every stored anchor for a given recipient. Used on
  /// sign-out so the next signed-in caregiver does not inherit a
  /// stale watermark; we keep per-recipient keys so switching
  /// recipients does not silently drop a window.
  static func clearAll(recipientId: String) {
    let scope = makeKey(recipientId: recipientId, typeIdentifier: "")
    let keys = UserDefaults.standard.dictionaryRepresentation().keys
    for key in keys where key.hasPrefix(scope) {
      UserDefaults.standard.removeObject(forKey: key)
    }
  }

  private static func makeKey(recipientId: String, typeIdentifier: String) -> String {
    "\(prefix)\(recipientId).\(typeIdentifier)"
  }
}

/// Persists the "active" care recipient id so a cold-start observer
/// fire (delivered before SwiftUI mounts) can attribute the upload
/// without the SwiftUI state graph being available yet.
///
/// Stored in `UserDefaults` because the recipient id is a UUID — not
/// PHI — and the same value is already echoed across the wire on
/// every API call. The Keychain is reserved for credentials.
enum HealthKitActiveRecipientStore {
  private static let key = "narthecare.healthkit.activeRecipientId"

  static func set(_ recipientId: String?) {
    if let r = recipientId, !r.isEmpty {
      UserDefaults.standard.set(r, forKey: key)
    } else {
      UserDefaults.standard.removeObject(forKey: key)
    }
  }

  static func get() -> String? {
    UserDefaults.standard.string(forKey: key)
  }
}

// MARK: - Sample-type registry

/// One entry in the contract metric → HealthKit sample-type map.
///
/// Encodes everything `HealthKitObserverManager` needs to register an
/// observer and turn raw HK samples into contract-shaped
/// `HealthObservation` rows. The mapper is per-spec so the registry
/// stays a flat declarative list.
struct HealthKitSampleSpec: Sendable {
  let metric: HealthObservationMetricType
  let sampleType: HKSampleType
  let unit: HKUnit?
  let valueTransform: (@Sendable (Double) -> Double)?
  let frequency: HKUpdateFrequency

  /// Build the contract-supported registry, dropping any sample
  /// type Apple has withdrawn on this OS / device — older devices
  /// (e.g. iPhones without paired Apple Watch) silently lack
  /// HRV / SpO2 / fall-detection types and we must not crash.
  static func contractSpecs() -> [HealthKitSampleSpec] {
    var specs: [HealthKitSampleSpec] = []

    if let t = HKQuantityType.quantityType(forIdentifier: .stepCount) {
      specs.append(
        .init(
          metric: .steps,
          sampleType: t,
          unit: .count(),
          valueTransform: nil,
          // HealthKit silently downgrades step-count delivery from
          // `.immediate` to `.hourly` even when we ask — this is
          // documented and honored. Asking `.immediate` keeps every
          // type's intent uniform.
          frequency: .immediate,
        ))
    }
    if let t = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) {
      specs.append(
        .init(
          metric: .restingHeartRate,
          sampleType: t,
          unit: HKUnit.count().unitDivided(by: .minute()),
          valueTransform: nil,
          frequency: .immediate,
        ))
    }
    if let t = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
      specs.append(
        .init(
          metric: .hrv,
          sampleType: t,
          unit: HKUnit.secondUnit(with: .milli),
          valueTransform: nil,
          frequency: .immediate,
        ))
    }
    if let t = HKQuantityType.quantityType(forIdentifier: .oxygenSaturation) {
      specs.append(
        .init(
          metric: .spo2,
          sampleType: t,
          // Apple stores SpO2 as a 0..1 fraction; multiply by 100 to
          // match the contract's `percent` unit (0..100).
          unit: .percent(),
          valueTransform: { $0 * 100 },
          frequency: .immediate,
        ))
    }
    if let t = HKQuantityType.quantityType(forIdentifier: .respiratoryRate) {
      specs.append(
        .init(
          metric: .respiratoryRate,
          sampleType: t,
          unit: HKUnit.count().unitDivided(by: .minute()),
          valueTransform: nil,
          frequency: .immediate,
        ))
    }
    if let t = HKQuantityType.quantityType(forIdentifier: .appleWalkingSteadiness) {
      specs.append(
        .init(
          metric: .walkingSteadiness,
          sampleType: t,
          unit: .percent(),
          valueTransform: { $0 * 100 },
          frequency: .immediate,
        ))
    }
    if let t = HKQuantityType.quantityType(forIdentifier: .numberOfTimesFallen) {
      specs.append(
        .init(
          metric: .fallEvent,
          sampleType: t,
          unit: .count(),
          valueTransform: nil,
          frequency: .immediate,
        ))
    }
    if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      specs.append(
        .init(
          metric: .sleepDuration,
          sampleType: t,
          unit: nil,
          valueTransform: nil,
          frequency: .immediate,
        ))
    }
    return specs
  }

  /// Convert one HealthKit sample into a contract-shaped observation.
  ///
  /// Returns `nil` for samples that don't carry a contract value
  /// (e.g. an "in bed but awake" sleep segment, or a fall-event
  /// sample with a zero count) so the caller never POSTs noise.
  func mapToObservation(
    _ sample: HKSample,
    formatter: ISO8601DateFormatter,
  ) -> HealthObservation? {
    if let q = sample as? HKQuantitySample, let unit = unit {
      let raw = q.quantity.doubleValue(for: unit)
      let value = valueTransform?(raw) ?? raw
      // A zero-fall-count sample is a HealthKit artifact — not a real
      // event — so skip it; otherwise an empty caregiver would
      // accumulate one row per observer fire.
      if metric == .fallEvent && value <= 0 { return nil }
      let measuredAt = formatter.string(from: q.endDate)
      let startAt =
        q.startDate != q.endDate
        ? formatter.string(from: q.startDate)
        : nil
      let endAt =
        q.startDate != q.endDate
        ? formatter.string(from: q.endDate)
        : nil
      return HealthObservation(
        sourceType: .healthkit,
        sourceRecordId: q.uuid.uuidString,
        metricType: metric,
        value: value,
        measuredAt: measuredAt,
        startAt: startAt,
        endAt: endAt,
        metadata: nil,
      )
    }
    if let c = sample as? HKCategorySample, metric == .sleepDuration {
      // Only "asleep" segments contribute to `sleep_duration`. The
      // contract's unit is `hours` so emit segment duration in hours.
      guard let v = HKCategoryValueSleepAnalysis(rawValue: c.value) else {
        return nil
      }
      switch v {
      case .asleepUnspecified, .asleepCore, .asleepDeep, .asleepREM:
        let durationHours =
          c.endDate.timeIntervalSince(c.startDate) / 3600.0
        return HealthObservation(
          sourceType: .healthkit,
          sourceRecordId: c.uuid.uuidString,
          metricType: .sleepDuration,
          value: durationHours,
          measuredAt: formatter.string(from: c.endDate),
          startAt: formatter.string(from: c.startDate),
          endAt: formatter.string(from: c.endDate),
          metadata: nil,
        )
      default:
        return nil
      }
    }
    return nil
  }
}

// MARK: - Observer manager

/// Coordinator for the production HealthKit background-sync path.
///
/// One singleton per process: there's only one HealthKit store and
/// only one set of observer queries we want to keep alive. The
/// manager:
///
///   - Owns the `HKHealthStore`.
///   - Registers one `HKObserverQuery` per contract sample type and
///     calls `enableBackgroundDelivery` so iOS wakes the app
///     whenever new samples arrive.
///   - On every observer fire (and in the foreground "Sync now"
///     path) runs an `HKAnchoredObjectQuery`, maps new samples to
///     contract observations, POSTs the batch to `/healthkit/sync`,
///     and advances the per-`(recipient, type)` anchor only on
///     success.
///   - Updates `HealthKitSyncDiagnostics.shared` so the dev
///     diagnostics surface reflects every observer fire and sync
///     outcome.
///
/// The manager is `@unchecked Sendable` because:
///   - HealthKit invokes observer-update closures on its own
///     internal queue;
///   - the manager's mutable state (`activeQueries`,
///     `idTokenProvider`) is guarded by `lock`;
///   - all `@MainActor` work hops to the main actor through
///     `MainActor.run`.
final class HealthKitObserverManager: @unchecked Sendable {
  static let shared = HealthKitObserverManager()

  private let healthStore = HKHealthStore()
  private let healthKit: HealthKitManager
  private let apiClient: APIClient

  private let lock = NSLock()
  private var activeQueries: [HKObserverQuery] = []

  /// Resolves the current Cognito ID token. Injected at start time
  /// so the manager has no hard dep on `AuthSession`. The closure is
  /// `@Sendable` because the observer fires on a background queue.
  private var idTokenProvider: (@Sendable () async -> String?)?

  init(
    healthKit: HealthKitManager = HealthKitManager(),
    apiClient: APIClient = APIClient(),
  ) {
    self.healthKit = healthKit
    self.apiClient = apiClient
  }

  // MARK: Public API

  /// Re-register observers on launch when both pre-conditions hold:
  /// a Keychain-resident ID token and a previously-saved active
  /// recipient id. Called from `AppDelegate.didFinishLaunching` so
  /// background launches (HealthKit waking the app for an observer
  /// fire) immediately attach our handlers — observer queries are
  /// not persistent across launches per Apple's docs.
  func registerObserversIfPossible(
    idTokenProvider: @escaping @Sendable () async -> String?,
  ) {
    guard
      KeychainHelper.load(key: .idToken) != nil,
      let recipientId = HealthKitActiveRecipientStore.get(),
      !recipientId.isEmpty
    else {
      return
    }
    Task {
      await self.startObservers(
        forRecipientId: recipientId,
        idTokenProvider: idTokenProvider,
      )
    }
  }

  /// Begin (or restart) background HealthKit delivery for the given
  /// care recipient.
  ///
  /// Stops any prior observer queries first so callers can safely
  /// invoke this every time the recipient selection changes. The
  /// recipient id is persisted in `UserDefaults` so a cold-start
  /// observer fire can attribute the upload before SwiftUI mounts.
  func startObservers(
    forRecipientId recipientId: String,
    idTokenProvider: @escaping @Sendable () async -> String?,
  ) async {
    HealthKitActiveRecipientStore.set(recipientId)
    setIdTokenProvider(idTokenProvider)
    stopObservers()

    guard healthKit.isHealthDataAvailable() else {
      await MainActor.run {
        HealthKitSyncDiagnostics.shared.setAuthorization(.unavailable)
      }
      return
    }

    // Ask once — Apple no-ops for already-granted types.
    do {
      try await healthKit.requestAuthorization()
      await MainActor.run {
        HealthKitSyncDiagnostics.shared.setAuthorization(.granted)
      }
    } catch {
      // Apple does NOT throw here on a user denial of READ
      // permission; a throw here typically means missing usage
      // strings or sandbox failure. Don't claim "denied" — keep the
      // status `unknown` so the UI doesn't lie about the user's
      // choice.
      await MainActor.run {
        HealthKitSyncDiagnostics.shared.setAuthorization(.unknown)
      }
    }

    let specs = HealthKitSampleSpec.contractSpecs()
    for spec in specs {
      registerObserver(for: spec)
      enableBackgroundDelivery(for: spec)
    }
  }

  /// Tear down active observer queries (e.g. on sign-out or before
  /// re-registration). Does NOT call `disableBackgroundDelivery` —
  /// that survives the query lifetime in iOS and we re-attach on
  /// next launch. For a hard reset use
  /// `disableAllBackgroundDelivery()`.
  func stopObservers() {
    lock.lock()
    let queries = activeQueries
    activeQueries.removeAll()
    lock.unlock()
    for q in queries {
      healthStore.stop(q)
    }
  }

  /// Hard reset on sign-out: stop queries, ask iOS to stop waking the
  /// app for these types, clear the active recipient + diagnostics +
  /// per-recipient anchors. Anchors are keyed by recipient id so
  /// switching recipients alone does not require this.
  func handleSignOut() async {
    stopObservers()
    let recipientId = HealthKitActiveRecipientStore.get()
    HealthKitActiveRecipientStore.set(nil)
    setIdTokenProvider(nil)
    if let r = recipientId {
      HealthKitAnchorStore.clearAll(recipientId: r)
    }
    await disableAllBackgroundDelivery()
    await MainActor.run {
      HealthKitSyncDiagnostics.shared.resetForSignOut()
    }
  }

  /// Trigger one anchored sync across every contract sample type.
  /// Used by the foreground "Sync now" button so the same code path
  /// drives both manual and background ingestion.
  ///
  /// Returns the total number of observations uploaded across all
  /// types (counts only — never values). Per-type errors are
  /// recorded in diagnostics but do not abort the loop, so a
  /// partial sync still ships the metrics that succeeded.
  @discardableResult
  func syncAllTypesNow(
    forRecipientId recipientId: String,
    idTokenProvider: @escaping @Sendable () async -> String?,
  ) async -> Int {
    HealthKitActiveRecipientStore.set(recipientId)
    setIdTokenProvider(idTokenProvider)
    await MainActor.run { HealthKitSyncDiagnostics.shared.recordSyncStart() }

    var total = 0
    var sawFailure = false
    var lastFailureCode: String? = nil
    let specs = HealthKitSampleSpec.contractSpecs()
    for spec in specs {
      do {
        total += try await runSync(spec: spec)
      } catch let err as SyncError {
        sawFailure = true
        lastFailureCode = err.code
        print(
          "[HealthKit] sync error type=\(spec.sampleType.identifier) code=\(err.code)"
        )
      } catch {
        sawFailure = true
        let code = (error as NSError).code
        lastFailureCode = "err_\(code)"
        print(
          "[HealthKit] sync error type=\(spec.sampleType.identifier) "
            + "domain=\((error as NSError).domain) code=\(code)"
        )
      }
    }

    await MainActor.run {
      if sawFailure {
        HealthKitSyncDiagnostics.shared.recordSyncFailure(
          code: lastFailureCode ?? "unknown",
        )
      } else {
        HealthKitSyncDiagnostics.shared.recordSyncSuccess(samplesUploaded: total)
      }
    }
    return total
  }

  // MARK: - Internals

  private func setIdTokenProvider(
    _ provider: (@Sendable () async -> String?)?,
  ) {
    lock.lock()
    idTokenProvider = provider
    lock.unlock()
  }

  private func currentIdTokenProvider() -> (@Sendable () async -> String?)? {
    lock.lock()
    let p = idTokenProvider
    lock.unlock()
    return p
  }

  private func registerObserver(for spec: HealthKitSampleSpec) {
    let query = HKObserverQuery(
      sampleType: spec.sampleType, predicate: nil,
    ) { [weak self] _, completionHandler, error in
      guard let self else {
        // Defensive: HealthKit requires us to invoke the completion
        // handler so background delivery keeps flowing. The strong
        // capture below in the Task does the same on the success
        // path.
        completionHandler()
        return
      }
      Task { [weak self] in
        await self?.handleObserverFire(spec: spec, error: error)
        // CRITICAL: must always be invoked or iOS stops sending
        // background updates for this type. We call after the
        // sync attempt because Apple recommends finishing the
        // ingest before signaling completion so the system can
        // batch follow-up observer fires.
        completionHandler()
      }
    }
    healthStore.execute(query)
    lock.lock()
    activeQueries.append(query)
    lock.unlock()
  }

  private func enableBackgroundDelivery(for spec: HealthKitSampleSpec) {
    healthStore.enableBackgroundDelivery(
      for: spec.sampleType, frequency: spec.frequency,
    ) { success, error in
      Task { @MainActor in
        if success {
          HealthKitSyncDiagnostics.shared.setBackgroundDelivery(
            .enabled, for: spec.metric,
          )
        } else {
          let code = (error as NSError?)?.code ?? -1
          HealthKitSyncDiagnostics.shared.setBackgroundDelivery(
            .failed(code: code), for: spec.metric,
          )
        }
      }
    }
  }

  private func disableAllBackgroundDelivery() async {
    let specs = HealthKitSampleSpec.contractSpecs()
    for spec in specs {
      _ = await withCheckedContinuation {
        (cont: CheckedContinuation<Void, Never>) in
        healthStore.disableBackgroundDelivery(for: spec.sampleType) { _, _ in
          cont.resume()
        }
      }
    }
  }

  private func handleObserverFire(
    spec: HealthKitSampleSpec, error: Error?,
  ) async {
    // HKObserverQuery fires once immediately on registration (while the app
    // is foregrounded on open) as well as for genuine background deliveries.
    // Capture the app state now so we only update lastSuccessfulBackgroundSyncAt
    // for deliveries that arrive while the app is truly in the background.
    let isBackground = await MainActor.run {
      UIApplication.shared.applicationState == .background
    }
    await MainActor.run { HealthKitSyncDiagnostics.shared.recordObserverFire() }
    if let error = error {
      let code = (error as NSError).code
      print(
        "[HealthKit] observer error type=\(spec.sampleType.identifier) "
          + "domain=\((error as NSError).domain) code=\(code)"
      )
      await MainActor.run {
        HealthKitSyncDiagnostics.shared.recordSyncFailure(code: "obs_\(code)")
      }
      return
    }
    do {
      let count = try await runSync(spec: spec)
      await MainActor.run {
        if isBackground {
          HealthKitSyncDiagnostics.shared.recordBackgroundSyncSuccess(
            samplesUploaded: count)
        } else {
          HealthKitSyncDiagnostics.shared.recordSyncSuccess(samplesUploaded: count)
        }
      }
    } catch let err as SyncError {
      print(
        "[HealthKit] sync error type=\(spec.sampleType.identifier) code=\(err.code)"
      )
      await MainActor.run {
        HealthKitSyncDiagnostics.shared.recordSyncFailure(code: err.code)
      }
    } catch {
      let code = (error as NSError).code
      print(
        "[HealthKit] sync error type=\(spec.sampleType.identifier) "
          + "domain=\((error as NSError).domain) code=\(code)"
      )
      await MainActor.run {
        HealthKitSyncDiagnostics.shared.recordSyncFailure(code: "err_\(code)")
      }
    }
  }

  /// Internal sync errors. Each maps to a short, non-PHI failure
  /// code surfaced in `HealthKitSyncDiagnostics.lastSyncErrorCode`.
  private enum SyncError: Error, Sendable {
    case noRecipient
    case noSession
    case unauthorized
    case http(Int)

    var code: String {
      switch self {
      case .noRecipient: return "no_recipient"
      case .noSession: return "no_session"
      case .unauthorized: return "unauthorized"
      case .http(let c): return "http_\(c)"
      }
    }
  }

  /// Run one anchored query → upload pass for the given sample type.
  /// Returns the number of observations uploaded. Throws `SyncError`
  /// for the small set of categorized failures the diagnostics
  /// surface knows how to render; any HKError is mapped to a
  /// generic `err_<code>` upstream.
  private func runSync(spec: HealthKitSampleSpec) async throws -> Int {
    guard let recipientId = HealthKitActiveRecipientStore.get(),
      !recipientId.isEmpty
    else {
      throw SyncError.noRecipient
    }
    guard let provider = currentIdTokenProvider(),
      let idToken = await provider()
    else {
      throw SyncError.noSession
    }

    let typeId = spec.sampleType.identifier
    let storedAnchor = HealthKitAnchorStore.anchor(
      recipientId: recipientId, typeIdentifier: typeId,
    )

    // First-time backfill window: pull the last 30 days when no
    // anchor is stored. With a stored anchor the predicate is `nil`
    // because the anchor itself bounds the window — passing a
    // predicate would re-filter what HealthKit already trimmed.
    let predicate: NSPredicate?
    if storedAnchor == nil {
      let cutoff = Date().addingTimeInterval(-30 * 86_400)
      predicate = HKQuery.predicateForSamples(withStart: cutoff, end: Date())
    } else {
      predicate = nil
    }

    let result = try await runAnchoredQuery(
      spec: spec, anchor: storedAnchor, predicate: predicate,
    )

    if result.observations.isEmpty {
      // Nothing to upload — still advance the anchor so we don't
      // re-process the same empty window forever (HealthKit
      // reuses the anchor as a high watermark, not just a
      // pointer to unread samples).
      if let newAnchor = result.newAnchor {
        HealthKitAnchorStore.setAnchor(
          newAnchor, recipientId: recipientId, typeIdentifier: typeId,
        )
      }
      return 0
    }

    // The backend caps each request at MAX_SYNC_BATCH_SIZE (1000),
    // and anchored queries can return very large batches on the
    // first run — chunk to stay well below the cap.
    let chunkSize = 500
    var uploaded = 0
    for chunk in result.observations.chunkedForUpload(size: chunkSize) {
      do {
        _ = try await apiClient.postHealthKitSync(
          HealthKitSyncRequest(
            careRecipientId: recipientId, observations: chunk,
          ),
          idToken: idToken,
        )
        uploaded += chunk.count
      } catch APIClientError.unauthorized {
        throw SyncError.unauthorized
      } catch APIClientError.badStatus(let code, _) {
        throw SyncError.http(code)
      } catch {
        // Network / decoding failure — surface as transport.
        throw SyncError.http(-1)
      }
    }

    // Only advance the anchor after every chunk uploaded — partial
    // success would silently drop samples on the next run.
    if let newAnchor = result.newAnchor {
      HealthKitAnchorStore.setAnchor(
        newAnchor, recipientId: recipientId, typeIdentifier: typeId,
      )
    }
    return uploaded
  }

  private struct AnchoredResult: Sendable {
    let observations: [HealthObservation]
    let newAnchor: HKQueryAnchor?
  }

  /// Wraps `HKAnchoredObjectQuery` in an async surface and converts
  /// raw HK samples into contract `HealthObservation` rows inside
  /// the HealthKit callback queue — that way only `Sendable`
  /// `HealthObservation` values cross the actor boundary, never raw
  /// `HKSample` references.
  private func runAnchoredQuery(
    spec: HealthKitSampleSpec,
    anchor: HKQueryAnchor?,
    predicate: NSPredicate?,
  ) async throws -> AnchoredResult {
    try await withCheckedThrowingContinuation {
      (cont: CheckedContinuation<AnchoredResult, Error>) in
      let formatter = Self.iso8601()
      let query = HKAnchoredObjectQuery(
        type: spec.sampleType,
        predicate: predicate,
        anchor: anchor,
        limit: HKObjectQueryNoLimit,
      ) { _, samples, _, newAnchor, error in
        if let error = error {
          cont.resume(throwing: error)
          return
        }
        let observations: [HealthObservation] = (samples ?? []).compactMap {
          spec.mapToObservation($0, formatter: formatter)
        }
        cont.resume(
          returning: AnchoredResult(
            observations: observations, newAnchor: newAnchor,
          ))
      }
      healthStore.execute(query)
    }
  }

  private static func iso8601() -> ISO8601DateFormatter {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    f.timeZone = TimeZone(secondsFromGMT: 0)
    return f
  }
}

// MARK: - Helpers

extension Array where Element == HealthObservation {
  /// Slice a batch into chunks small enough to stay below the
  /// backend's 1000-sample request cap. `size` ≤ 0 falls back to
  /// "single chunk" so callers cannot accidentally infinite-loop.
  func chunkedForUpload(size: Int) -> [[HealthObservation]] {
    guard size > 0, !isEmpty else { return self.isEmpty ? [] : [self] }
    var chunks: [[HealthObservation]] = []
    var i = 0
    while i < count {
      let end = Swift.min(i + size, count)
      chunks.append(Array(self[i..<end]))
      i = end
    }
    return chunks
  }
}
