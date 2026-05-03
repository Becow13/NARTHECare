import Foundation

/// Structured API error with a user-readable message.
///
/// Mirrors the error-handling contract used by the web API client: every
/// network call either returns the decoded payload or throws one of these
/// cases, so call-sites can surface `error.localizedDescription` directly
/// in the UI without additional mapping.
///
/// `unauthorized` is broken out from the generic `badStatus` case so
/// `AuthSession` can branch on "session expired" vs every other transport
/// error without parsing status codes back out at the call site.
enum APIClientError: LocalizedError {
  case invalidURL
  case unauthorized
  case badStatus(Int, String)
  case decoding

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "Invalid API base URL."
    case .unauthorized:
      return "Your session has expired. Please sign in again."
    case .badStatus(let code, let body):
      return "Server returned \(code): \(body)"
    case .decoding:
      return "Could not read server response."
    }
  }
}

/// Response shape for `POST /health-data`.
struct HealthDataSuccessResponse: Codable {
  let success: Bool
  let inserted: Int?
}

/// Uploads HealthKit-shaped payloads to the NARTHECare backend.
///
/// Keeps all transport concerns (URL construction, headers, status-code
/// checks, error translation) in one place so the view layer only deals in
/// typed payloads and thrown errors.
struct APIClient: Sendable {
  /// Production API (no trailing slash). Used when no per-build override
  /// is supplied via the `NARTHECareAPIBaseURL` Info.plist key.
  static let productionBaseURL = "https://app-107635.on-aptible.com"

  /// Effective default base URL — the build-time `NARTHECareAPIBaseURL`
  /// Info.plist value when present and non-empty, otherwise
  /// `productionBaseURL`. The Info.plist value flows from the
  /// `API_BASE_URL` build setting in `Config.local.xcconfig`, mirroring
  /// how the Cognito values are injected. This lets a developer point
  /// the app at `http://localhost:3000` for local backend testing
  /// without editing source.
  static var defaultBaseURL: String {
    if let raw = Bundle.main.object(forInfoDictionaryKey: "NARTHECareAPIBaseURL")
      as? String,
      !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    return productionBaseURL
  }

  let baseURL: String
  let urlSession: URLSession

  init(baseURL: String = APIClient.defaultBaseURL, urlSession: URLSession = .shared) {
    self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    self.urlSession = urlSession
  }

  /// GET the authenticated caregiver's backend profile.
  ///
  /// Sends `Authorization: Bearer <idToken>` and decodes the response
  /// into `BackendUser`. The backend route (`GET /api/me`) verifies the
  /// Cognito JWT, upserts the local `users` row, stamps `last_login_at`,
  /// writes an `AUTHENTICATE_USER` audit row, and returns the safe
  /// public profile.
  ///
  /// **Security:** the `idToken` value MUST NEVER be logged. We pass it
  /// in the `Authorization` header only, and the only data we surface
  /// from this method is a typed `BackendUser` (no token contents, no
  /// raw response body). On 401 we throw `.unauthorized` so
  /// `AuthSession` can sign the user out without inspecting the body.
  func fetchMe(idToken: String) async throws -> BackendUser {
    guard let url = URL(string: "\(baseURL)/api/me") else {
      throw APIClientError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await urlSession.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIClientError.badStatus(-1, "No HTTP response")
    }

    if http.statusCode == 401 {
      throw APIClientError.unauthorized
    }
    guard (200 ... 299).contains(http.statusCode) else {
      let bodyText = String(data: data, encoding: .utf8) ?? ""
      throw APIClientError.badStatus(http.statusCode, bodyText)
    }

    do {
      let envelope = try JSONDecoder().decode(BackendUserResponse.self, from: data)
      return envelope.user
    } catch {
      throw APIClientError.decoding
    }
  }

  /// GET the full care-recipient profile for the given id.
  ///
  /// Returns the decoded `CareRecipientProfile` on 2xx; throws
  /// `APIClientError` on any other outcome. The view layer is expected
  /// to surface `error.localizedDescription` directly and optionally
  /// fall back to `CareRecipientProfileMock.margaretChen` for offline /
  /// pre-auth builds.
  ///
  /// TODO(cognito): once the app ships Cognito JWTs, inject a
  /// `Bearer <token>` Authorization header here (the backend
  /// middleware already returns 401 when the header is absent unless
  /// DEV_AUTH_BYPASS is active). Never log the token value.
  func fetchCareRecipientProfile(id: String) async throws -> CareRecipientProfile {
    guard let url = URL(string: "\(baseURL)/care-recipients/\(id)/profile") else {
      throw APIClientError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    let (data, response) = try await urlSession.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIClientError.badStatus(-1, "No HTTP response")
    }

    guard (200 ... 299).contains(http.statusCode) else {
      // Do not log the response body — it may contain identifying or
      // audit-sensitive server messages. The error type carries it so
      // the UI can choose whether to display it.
      let bodyText = String(data: data, encoding: .utf8) ?? ""
      throw APIClientError.badStatus(http.statusCode, bodyText)
    }

    do {
      let envelope = try JSONDecoder().decode(
        CareRecipientProfileResponse.self, from: data)
      return envelope.careRecipient
    } catch {
      throw APIClientError.decoding
    }
  }

  /// POST a batch of HealthKit samples to the server.
  ///
  /// Returns silently on any 2xx response whose body either decodes as
  /// `HealthDataSuccessResponse { success: true }` or — for older servers
  /// that reply with plain text — contains the string "success". Any other
  /// outcome throws an `APIClientError` describing the exact failure.
  func uploadHealthData(_ payload: HealthUploadPayload) async throws {
    guard let url = URL(string: "\(baseURL)/health-data") else {
      throw APIClientError.invalidURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONEncoder().encode(payload)

    let (data, response) = try await urlSession.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIClientError.badStatus(-1, "No HTTP response")
    }

    let bodyText = String(data: data, encoding: .utf8) ?? ""

    guard (200 ... 299).contains(http.statusCode) else {
      throw APIClientError.badStatus(http.statusCode, bodyText)
    }

    if let decoded = try? JSONDecoder().decode(HealthDataSuccessResponse.self, from: data),
      decoded.success
    {
      return
    }
    // Fallback for servers that return 2xx with plain text instead of JSON —
    // treat the response as success if the body mentions "success".
    if http.statusCode == 200, bodyText.contains("success") {
      return
    }
    throw APIClientError.decoding
  }

  /// POST a batch of normalized HealthKit observations to the
  /// authenticated Phase 4A sync route.
  ///
  /// Sends `Authorization: Bearer <idToken>` and the JSON-encoded
  /// `HealthKitSyncRequest`. The backend validates the body against
  /// `shared/contracts/healthObservation.schema.json`, gates on
  /// `requireCareRecipientAccess`, and performs an idempotent
  /// `INSERT … ON CONFLICT (source_type, source_record_id) DO NOTHING`,
  /// so re-sending the same window is always safe.
  ///
  /// **PHI guardrails:**
  ///   - The `idToken` MUST NEVER be logged.
  ///   - The encoded request body MUST NEVER be logged.
  ///   - On non-2xx we surface only `APIClientError.badStatus(code, "")`
  ///     (the body is dropped) so accidental logger captures never
  ///     leak server messages that may include audit-sensitive
  ///     details.
  ///
  /// Returns the count envelope (`accepted`, `deduped`, `rejected`,
  /// `lastSyncedAt`) so the sync-status surface can render a fresh
  /// "last synced" line without a follow-up GET.
  func postHealthKitSync(
    _ payload: HealthKitSyncRequest,
    idToken: String,
  ) async throws -> HealthKitSyncResponse {
    guard let url = URL(string: "\(baseURL)/healthkit/sync") else {
      throw APIClientError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    request.httpBody = try JSONEncoder().encode(payload)

    let (data, response) = try await urlSession.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIClientError.badStatus(-1, "No HTTP response")
    }
    if http.statusCode == 401 {
      throw APIClientError.unauthorized
    }
    guard (200 ... 299).contains(http.statusCode) else {
      // Drop body — sync responses may carry caregiver-safe error
      // copy that should never reach app logs.
      throw APIClientError.badStatus(http.statusCode, "")
    }
    do {
      return try JSONDecoder().decode(HealthKitSyncResponse.self, from: data)
    } catch {
      throw APIClientError.decoding
    }
  }

  /// GET the registry row for the iOS sync companion's status surface.
  ///
  /// Returns a neutral `not_connected` envelope when no sync has run
  /// yet (the backend never 404s for this), so the UI does not have
  /// to branch on missing data. The `idToken` MUST NEVER be logged.
  func getHealthKitStatus(
    careRecipientId: String,
    idToken: String,
  ) async throws -> HealthKitSyncStatusResponse {
    guard
      let escaped = careRecipientId.addingPercentEncoding(
        withAllowedCharacters: .urlQueryAllowed),
      let url = URL(
        string: "\(baseURL)/healthkit/status?careRecipientId=\(escaped)")
    else {
      throw APIClientError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await urlSession.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIClientError.badStatus(-1, "No HTTP response")
    }
    if http.statusCode == 401 {
      throw APIClientError.unauthorized
    }
    guard (200 ... 299).contains(http.statusCode) else {
      throw APIClientError.badStatus(http.statusCode, "")
    }
    do {
      return try JSONDecoder().decode(HealthKitSyncStatusResponse.self, from: data)
    } catch {
      throw APIClientError.decoding
    }
  }

  /// GET the list of care recipients the authenticated caregiver is
  /// on the team for.
  ///
  /// The sync companion uses this to learn which recipient HealthKit
  /// observations should be attributed to. Returns an empty array
  /// when the caregiver has no recipients yet — the UI then shows a
  /// "no care recipient selected" state instead of crashing on a
  /// nil id. Never logs the response body (names are PHI).
  func fetchCareRecipients(idToken: String) async throws -> [CareRecipientListRow]
  {
    guard let url = URL(string: "\(baseURL)/care-recipients") else {
      throw APIClientError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")

    let (data, response) = try await urlSession.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw APIClientError.badStatus(-1, "No HTTP response")
    }
    if http.statusCode == 401 {
      throw APIClientError.unauthorized
    }
    guard (200 ... 299).contains(http.statusCode) else {
      throw APIClientError.badStatus(http.statusCode, "")
    }
    do {
      let envelope = try JSONDecoder().decode(
        CareRecipientListResponse.self, from: data)
      return envelope.careRecipients
    } catch {
      throw APIClientError.decoding
    }
  }
}

/// Thin row from `GET /care-recipients`. Mirrors the backend list
/// projection (`id`, `name`, `date_of_birth`, `primary_condition`,
/// `role`, `permission_level`, `updated_at`). PHI — never log.
struct CareRecipientListRow: Codable, Sendable, Identifiable, Hashable {
  let id: String
  let name: String
  let dateOfBirth: String?
  let primaryCondition: String?
  let role: String
  let permissionLevel: String
  let updatedAt: String

  enum CodingKeys: String, CodingKey {
    case id
    case name
    case dateOfBirth = "date_of_birth"
    case primaryCondition = "primary_condition"
    case role
    case permissionLevel = "permission_level"
    case updatedAt = "updated_at"
  }
}

private struct CareRecipientListResponse: Codable, Sendable {
  let careRecipients: [CareRecipientListRow]
}
