import Foundation

/// Reads a `CareRecipientProfile` for the given recipient id.
///
/// Defined as a protocol so `PatientProfileViewModel` can be built and
/// previewed against any implementation — today the only concrete impl
/// is the mock; tomorrow it will be a small wrapper around `APIClient`
/// calling `GET /care-recipients/:id/profile`.
///
/// Methods must be `async throws` — never return an optional on
/// failure. The error becomes `error.localizedDescription` in the UI,
/// which is the only thing we log.
protocol CareRecipientProfileService: Sendable {
  func fetchProfile(id: String) async throws -> CareRecipientProfile
}

// MARK: - Errors

/// Error surface for the profile service. Each case has a
/// human-readable `errorDescription` so the view model can surface it
/// directly without extra mapping.
///
/// Mirrors the error shape from `APIClientError` in
/// `apps/ios/NARTHECare/Services/APIClient.swift`.
enum CareRecipientProfileServiceError: LocalizedError {
  case notImplemented
  case notFound
  case forbidden
  case decoding
  case transport(String)

  var errorDescription: String? {
    switch self {
    case .notImplemented:
      return "Fetching care recipient profiles from the server is not available yet."
    case .notFound:
      return "We couldn't find a profile with that id."
    case .forbidden:
      return "You don't have access to this profile."
    case .decoding:
      return "The server returned a profile in an unexpected shape."
    case .transport(let detail):
      return "Network error: \(detail)"
    }
  }
}

// MARK: - Mock implementation (default today)

/// Returns the bundled Margaret Chen fixture for any id.
///
/// Used for SwiftUI previews, demos, and any build that has not yet
/// wired up the real backend. Intentionally deterministic (no random
/// latency, no random errors) so preview snapshots stay stable.
///
/// TODO(backend): replace the default service in `ContentView` /
/// dependency wiring with `LiveCareRecipientProfileService` as soon as
/// `GET /care-recipients/:id/profile` ships. Keep this mock around for
/// previews and tests.
struct MockCareRecipientProfileService: CareRecipientProfileService {
  private let fixture: CareRecipientProfile

  init(fixture: CareRecipientProfile = CareRecipientProfileMock.margaretChen) {
    self.fixture = fixture
  }

  func fetchProfile(id: String) async throws -> CareRecipientProfile {
    // Ignore the id — the mock is single-recipient by design. If a
    // preview wants a different profile it can construct a new
    // `MockCareRecipientProfileService(fixture:)`.
    _ = id
    return fixture
  }
}

// MARK: - Live implementation (TODO)

/// Placeholder for the eventual networked implementation.
///
/// The real version will:
///
/// - Pull the Cognito access token from Keychain.
/// - Attach `Authorization: Bearer <token>` and a device id header.
/// - Call `GET {baseURL}/care-recipients/{id}/profile`.
/// - Decode `CareRecipientProfileResponse` and return `.careRecipient`.
/// - On 401, trigger a token refresh and retry once.
/// - On 403, map to `.forbidden` so the view shows an access screen.
/// - On 404, map to `.notFound`.
/// - On non-2xx / decoding failure, throw `.transport` / `.decoding`.
///
/// TODO(cognito):   token retrieval + refresh flow.
/// TODO(smart-fhir): add a sibling `fetchFHIRHandshake(id:)` method.
/// TODO(audit):    emit a `careRecipientProfile.read` audit record.
struct LiveCareRecipientProfileService: CareRecipientProfileService {
  func fetchProfile(id: String) async throws -> CareRecipientProfile {
    throw CareRecipientProfileServiceError.notImplemented
  }
}
