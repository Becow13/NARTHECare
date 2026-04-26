import Foundation

/// Caregiver profile returned by `GET /api/me`.
///
/// Mirrors the `_publicUser` shape produced by the backend
/// (`apps/backend/app.js`) — only fields that are safe to expose to the
/// iOS client land here, so the type cannot accidentally be used to
/// surface Cognito claims, tokens, or `cognito_sub`.
///
/// The struct is `Codable, Sendable, Equatable` so the auth state
/// machine can publish it across actor boundaries and SwiftUI can diff
/// it for view updates without warnings. Never log instances of this
/// type — `email` and `displayName` are PHI-adjacent identifiers under
/// the HIPAA framing this app operates under.
struct BackendUser: Codable, Sendable, Equatable, Identifiable {
  let id: String
  let email: String?
  let emailVerified: Bool
  let displayName: String?
  let role: String
  let status: String
  let lastLoginAt: String?
  let createdAt: String

  enum CodingKeys: String, CodingKey {
    case id
    case email
    case emailVerified = "email_verified"
    case displayName = "display_name"
    case role
    case status
    case lastLoginAt = "last_login_at"
    case createdAt = "created_at"
  }
}

/// Envelope returned by `GET /api/me`.
///
/// Kept as its own type so we can add sibling fields (e.g. `warnings`,
/// `featureFlags`) without a breaking change to the user payload.
struct BackendUserResponse: Codable, Sendable {
  let user: BackendUser
}
