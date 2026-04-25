import Foundation

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

struct HealthDataSuccessResponse: Codable {
  let success: Bool
}

/// Uploads HealthKit-shaped payloads to the Aptible backend.
struct APIClient: Sendable {
  /// Default production API (no trailing slash).
  static let defaultBaseURL = "https://app-107635.on-aptible.com"

  let baseURL: String
  let urlSession: URLSession

  init(baseURL: String = APIClient.defaultBaseURL, urlSession: URLSession = .shared) {
    self.baseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    self.urlSession = urlSession
  }

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
    // Some servers return 200 with plain text; treat 2xx as success if decode fails
    if http.statusCode == 200, bodyText.contains("success") {
      return
    }
    throw APIClientError.decoding
  }
}
