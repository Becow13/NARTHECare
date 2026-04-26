import Foundation

/// Mirrors the JSON shape expected by `POST /health-data` on the server.
struct MetricSample: Codable, Sendable {
  let value: Double
  let date: String
}

struct HealthUploadPayload: Codable, Sendable {
  let userId: String
  let steps: [MetricSample]
  let heartRate: [MetricSample]
  let sleep: [MetricSample]
}
