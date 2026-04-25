import Foundation

/// Structured API error with a user-readable message.
///
/// Mirrors the error-handling contract used by the web API client: every
/// network call either returns the decoded payload or throws one of these
/// cases, so call-sites can surface `error.localizedDescription` directly
/// in the UI without additional mapping.
enum APIClientError: LocalizedError {
  case invalidURL
  case badStatus(Int, String)
  case decoding

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "Invalid API base URL."
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
  /// Default production API (no trailing slash).
  static let defaultBaseURL = "https://app-107635.on-aptible.com"

  let baseURL: String
  let urlSession: URLSession

  init(baseURL: String = APIClient.defaultBaseURL, urlSession: URLSession = .shared) {
    self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    self.urlSession = urlSession
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
}
