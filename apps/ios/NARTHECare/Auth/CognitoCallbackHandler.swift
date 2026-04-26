import Foundation

/// Receives and parses the Cognito Hosted UI redirect URI after login.
///
/// The Cognito App Client is configured with the callback URL
/// `narthecare://auth/callback`. When the Hosted UI redirects back to the
/// app iOS delivers the URL through `onOpenURL` (SwiftUI) or
/// `application(_:open:options:)` (UIKit). This handler validates the URL
/// shape, extracts the one-time authorization code and optional state token,
/// and publishes a `CallbackState` change so the rest of the auth flow can
/// proceed.
///
/// **Security constraints:**
/// - The authorization code and state token are never logged.
/// - The `code` value is single-use. Consumers must exchange it for tokens
///   immediately and must not cache or display it.
/// - All token exchange happens server-side or via a dedicated auth service
///   (not inline here), so this handler only owns URL parsing and state
///   publication.
@MainActor
final class CognitoCallbackHandler: ObservableObject {

  // MARK: - Public state

  /// The current state of the Cognito callback lifecycle.
  enum CallbackState: Equatable {
    /// No callback has been received yet.
    case idle
    /// A valid callback URL was received. `code` is the one-time
    /// authorization code; `state` is the CSRF-protection value if present.
    /// Never log or display these values.
    case received(code: String, state: String?)
    /// The callback URL was received but could not be parsed.
    case failed(reason: String)
  }

  @Published private(set) var callbackState: CallbackState = .idle

  // MARK: - URL handling

  /// Attempts to handle a URL delivered by iOS after the Cognito Hosted UI
  /// login completes.
  ///
  /// Returns `true` if the URL matches the `narthecare://auth/callback`
  /// shape and was accepted; `false` if it should be passed to other
  /// handlers (e.g. universal links, other deep links).
  ///
  /// On success, publishes `.received(code:state:)`.
  /// On a recognized-but-malformed URL (missing code), publishes `.failed`.
  /// Never logs the code, state, or any credential value.
  @discardableResult
  func handleCallbackURL(_ url: URL) -> Bool {
    guard
      url.scheme?.lowercased() == "narthecare",
      url.host?.lowercased() == "auth",
      url.path == "/callback"
    else {
      return false
    }

    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []

    guard
      let code = items.first(where: { $0.name == "code" })?.value,
      !code.isEmpty
    else {
      callbackState = .failed(reason: "Cognito callback was missing the authorization code.")
      return true
    }

    let state = items.first(where: { $0.name == "state" })?.value

    // Publish the authorization code without logging it.
    callbackState = .received(code: code, state: state)
    return true
  }

  /// Resets the handler back to `.idle`.
  ///
  /// Call this after the auth flow has consumed the code (successfully or
  /// not) so the state machine does not replay a stale code on the next
  /// app foreground.
  func reset() {
    callbackState = .idle
  }
}
