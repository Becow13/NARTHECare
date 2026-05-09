import Foundation

/// Outcome of a single sync attempt — what the SwiftUI surface needs
/// to show "Sync now" feedback without inspecting the raw response.
struct HealthKitSyncOutcome: Sendable, Equatable {
  let accepted: Int
  let deduped: Int
  let rejected: Int
  let lastSyncedAt: String?

  /// `true` when the batch attempted any work (avoids flashing a
  /// success row when HealthKit returned 0 samples in the window).
  var hadSamples: Bool { accepted + deduped + rejected > 0 }
}

/// Errors the sync service surfaces to the UI. Each case has a
/// PHI-safe `errorDescription` so views can render
/// `error.localizedDescription` directly.
///
/// `authorizationDenied` is reserved for the narrow case of
/// `HKHealthStore.requestAuthorization` itself failing — Apple does
/// **not** throw on a user denial of READ permission (denied types
/// silently return empty samples), so a throw here usually indicates
/// missing usage description strings, an unsigned entitlement, or
/// the system being unable to present the prompt.
///
/// `healthKitUnavailable` covers per-metric query failures that
/// surface from `HealthKitManager.readObservations` after
/// authorization has succeeded. Misclassifying these as "denied"
/// produced the long-standing UX bug where granting permission and
/// tapping "Sync now" still showed "HealthKit access was denied."
enum HealthKitSyncError: LocalizedError {
  case healthDataUnavailable
  case noActiveSession
  case noCareRecipient
  case recipientAccessDenied
  case authorizationDenied
  case healthKitUnavailable
  case observationsRejected
  case transport(String)

  var errorDescription: String? {
    switch self {
    case .healthDataUnavailable:
      return "Health data is not available on this device."
    case .noActiveSession:
      return "Please sign in to sync HealthKit observations."
    case .noCareRecipient:
      return "No care recipient is connected to your account yet."
    case .recipientAccessDenied:
      return "You don't have access to this care recipient. Ask the primary caregiver to add you to the team."
    case .authorizationDenied:
      return "HealthKit access was denied. Update permissions in the Health app."
    case .healthKitUnavailable:
      return "Health data is temporarily unavailable. Please try again."
    case .observationsRejected:
      return "Some HealthKit data could not be saved. Please try again."
    case .transport:
      return "Could not reach the server. Check your network and try again."
    }
  }
}

/// Coordinates HealthKit reads, batching, and the authenticated
/// `POST /healthkit/sync` for the iOS sync companion.
///
/// The service is the **only** path that should call
/// `HealthKitManager.readObservations` and `APIClient.postHealthKitSync`
/// in product code — concentrating both ends in one place lets the
/// sync-status surface remain a pure view and gives any future
/// background-fetch hook a single seam to reuse.
///
/// **Constraints (healthcare):**
///   - Never logs `value`, sample contents, sample UUIDs, the request
///     body, or the response body. Only counts and metric-type keys
///     are safe to log; we currently log nothing.
///   - Never persists tokens or PHI on disk; `lastSyncedAt` is a UI
///     hint and the **server's** registry row is the source of truth.
///   - Surface no Cognito or backend internals to the UI — every
///     thrown error is a `HealthKitSyncError` whose
///     `errorDescription` is generic, caregiver-safe copy.
@MainActor
final class HealthKitSyncService {
  private let healthKit: HealthKitManager
  private let apiClient: APIClient
  private let session: AuthSession

  /// In-memory hint of the last successful sync window's high
  /// watermark. Cleared on `signOut()` via the `AuthSession`
  /// transition. Used only as the next call's `since:` argument when
  /// no server-provided last-sync timestamp exists yet.
  private var localLastSync: Date?

  init(
    session: AuthSession,
    healthKit: HealthKitManager = HealthKitManager(),
    apiClient: APIClient = APIClient(),
  ) {
    self.session = session
    self.healthKit = healthKit
    self.apiClient = apiClient
  }

  /// Fire one sync attempt for the given care recipient.
  ///
  /// Steps:
  ///   1. Verify HealthKit is available; surface a generic error otherwise.
  ///   2. Re-request authorization (idempotent — Apple no-ops when
  ///      the user has already granted).
  ///   3. Read every supported metric since the high watermark
  ///      (defaults to 7 days back on a cold start).
  ///   4. Post the batch with the caregiver's Cognito ID token.
  ///   5. On success, advance the local watermark to "now" and
  ///      return the count envelope.
  ///
  /// Errors map to `HealthKitSyncError` cases with caregiver-safe
  /// copy. The function never logs PHI; on transport errors we
  /// drop the underlying message.
  func syncNow(careRecipientId: String) async throws -> HealthKitSyncOutcome {
    guard healthKit.isHealthDataAvailable() else {
      throw HealthKitSyncError.healthDataUnavailable
    }
    guard let idToken = await session.validIdToken() else {
      throw HealthKitSyncError.noActiveSession
    }
    if careRecipientId.isEmpty {
      throw HealthKitSyncError.noCareRecipient
    }

    do {
      try await healthKit.requestAuthorization()
    } catch {
      // Apple distinguishes "denied" from "not requested" only via
      // user prompts; treat any throw here as denied for UI copy.
      throw HealthKitSyncError.authorizationDenied
    }

    let since = localLastSync ?? Date().addingTimeInterval(-7 * 86_400)
    let observations: [HealthObservation]
    do {
      observations = try await healthKit.readObservations(since: since)
    } catch {
      // `readObservations` already swallows per-metric errors and
      // returns empty slices for denied / unavailable types — Apple
      // never throws "denied" for READ permission, denied types
      // simply return no samples. So a throw at THIS layer is a
      // catastrophic HealthKit failure (database inaccessible,
      // sandbox unavailable, etc.), not a permission issue. Showing
      // "denied" here was the original misleading copy.
      throw HealthKitSyncError.healthKitUnavailable
    }

    if observations.isEmpty {
      // Nothing to send — bump the watermark so the next sync only
      // looks forward, and report a no-op outcome to the UI.
      localLastSync = Date()
      return HealthKitSyncOutcome(
        accepted: 0, deduped: 0, rejected: 0, lastSyncedAt: nil)
    }

    let response: HealthKitSyncResponse
    do {
      response = try await apiClient.postHealthKitSync(
        HealthKitSyncRequest(
          careRecipientId: careRecipientId,
          observations: observations,
        ),
        idToken: idToken,
      )
    } catch APIClientError.unauthorized {
      throw HealthKitSyncError.noActiveSession
    } catch APIClientError.badStatus(let code, let reason) {
      // Status code is not PHI; for 400/422 the API client surfaces
      // the parser's structured contract message (e.g.
      // `observations[5] unit must be "score" for metricType ...`),
      // which carries no values, ids, or timestamps and is safe to
      // log so we can diagnose iOS contract drift without
      // round-tripping through the server. Other status codes carry
      // an empty `reason`.
      let suffix = reason.isEmpty ? "" : " reason=\(reason)"
      print(
        "[HealthKit] sync rejected http=\(code) batch=\(observations.count)\(suffix)"
      )
      switch code {
      case 403:
        throw HealthKitSyncError.recipientAccessDenied
      case 400, 422:
        throw HealthKitSyncError.observationsRejected
      default:
        throw HealthKitSyncError.transport("transport")
      }
    } catch {
      print("[HealthKit] sync transport error batch=\(observations.count)")
      throw HealthKitSyncError.transport("transport")
    }

    localLastSync = Date()
    return HealthKitSyncOutcome(
      accepted: response.accepted,
      deduped: response.deduped,
      rejected: response.rejected,
      lastSyncedAt: response.lastSyncedAt,
    )
  }

  /// Read the server-side registry row for the sync-status surface.
  ///
  /// Translates any transport / auth failure into a
  /// `HealthKitSyncError` so the SwiftUI view never has to import
  /// `APIClientError`. Returns the raw response shape on success.
  func fetchStatus(careRecipientId: String) async throws
    -> HealthKitSyncStatusResponse
  {
    guard let idToken = await session.validIdToken() else {
      throw HealthKitSyncError.noActiveSession
    }
    do {
      return try await apiClient.getHealthKitStatus(
        careRecipientId: careRecipientId, idToken: idToken)
    } catch APIClientError.unauthorized {
      throw HealthKitSyncError.noActiveSession
    } catch {
      throw HealthKitSyncError.transport("transport")
    }
  }

  /// Load the caregiver's care recipients so the sync-status surface
  /// can attribute the next sync. Empty array → "no recipient yet"
  /// in the UI.
  func loadCareRecipients() async throws -> [CareRecipientListRow] {
    guard let idToken = await session.validIdToken() else {
      throw HealthKitSyncError.noActiveSession
    }
    do {
      return try await apiClient.fetchCareRecipients(idToken: idToken)
    } catch APIClientError.unauthorized {
      throw HealthKitSyncError.noActiveSession
    } catch {
      throw HealthKitSyncError.transport("transport")
    }
  }

  /// Reset the in-memory high watermark. Called from `AuthSession`
  /// on sign-out so the next signed-in user does not inherit the
  /// previous user's "last sync" hint.
  func resetLocalState() {
    localLastSync = nil
  }
}
