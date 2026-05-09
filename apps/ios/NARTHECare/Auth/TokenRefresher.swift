import Foundation

/// Coalesces Cognito ID-token refreshes so the app can keep running
/// past the ~1-hour Hosted UI ID-token expiry without forcing the
/// caregiver back through `ASWebAuthenticationSession`.
///
/// **Why this exists.** Cognito Hosted UI ID tokens have a fixed
/// lifetime (default 60 minutes). The app's bearer-auth surfaces
/// (`/api/me`, `/healthkit/sync`, `/care-recipients`) all reject
/// expired tokens with HTTP 401. Without a refresh path that 401
/// surfaced as a forced sign-out on the next cold-start
/// `refreshBackendUser`, and as a stuck `unauthorized` /
/// `http_401` background-sync diagnostic. Because the Hosted UI
/// also issues a refresh token whose lifetime is measured in days
/// to months, we can mint a fresh ID token without a user
/// round-trip whenever the cached one is near expiry.
///
/// Mirrors `apps/web/services/cognitoService.ts#refreshTokens` +
/// `apps/web/services/sessionService.ts#REFRESH_LEEWAY_SECONDS`,
/// adjusted for the iOS Keychain instead of an iron-session cookie.
///
/// **Behavior.**
///   - `validIdToken()` returns the cached Keychain ID token
///     unchanged when it has more than `refreshLeewaySeconds` left,
///     and otherwise drives a refresh-token grant against
///     `https://<domain>/oauth2/token` and persists the rotated
///     tokens in the Keychain before returning the new ID token.
///   - Concurrent callers (e.g. a HealthKit observer firing while
///     `refreshBackendUser` is in flight) coalesce onto a single
///     in-flight `Task`, so the refresh endpoint is hit at most
///     once per expiry window.
///   - On a 4xx refresh response (refresh token revoked, password
///     rotated, account deleted) we wipe every Keychain key so the
///     next launch lands on the login screen instead of looping
///     401 → sign out → 401.
///   - On a network failure we keep the existing tokens — the next
///     call gets to retry from the same starting point.
///
/// **Security / PHI.**
///   - Token bytes (id, access, refresh, code) are NEVER logged.
///   - On any error path we log the HTTP status only — the response
///     body is dropped because Cognito error envelopes can echo
///     the refresh token back.
actor TokenRefresher {
  /// Process-wide singleton. The Keychain is the only persistent
  /// store, so we only need one coordinator regardless of which
  /// SwiftUI scene or background-launched `AppDelegate` is asking
  /// for the token.
  static let shared = TokenRefresher()

  /// Refresh whenever the cached ID token is within this many
  /// seconds of `exp`. 60s mirrors the reference project's
  /// `REFRESH_LEEWAY_SECONDS` and absorbs typical clock skew
  /// without forcing a refresh on every API call.
  private static let refreshLeewaySeconds: TimeInterval = 60

  private let urlSession: URLSession

  /// Coalesces in-flight refreshes. While set, every concurrent
  /// `validIdToken()` call awaits this same `Task` instead of
  /// minting a duplicate refresh request.
  private var ongoingRefresh: Task<String?, Never>?

  init(urlSession: URLSession = .shared) {
    self.urlSession = urlSession
  }

  /// Returns a non-expired Cognito ID token, refreshing first if
  /// the cached token is missing, expired, or within the leeway
  /// window.
  ///
  /// Returns `nil` when the user has no Keychain credentials
  /// (signed out) or when the refresh token itself was rejected by
  /// Cognito — the caller should treat both cases as
  /// `.unauthenticated` and never retry.
  func validIdToken() async -> String? {
    let stored = currentIdToken()
    if let token = stored,
      let exp = TokenRefresher.expiry(of: token),
      Date().timeIntervalSince1970 + Self.refreshLeewaySeconds < exp
    {
      return token
    }
    return await refreshAndPersist(previousIdToken: stored)
  }

  // MARK: - Internals

  private func refreshAndPersist(previousIdToken: String?) async -> String? {
    if let ongoing = ongoingRefresh { return await ongoing.value }
    let task = Task<String?, Never> { [weak self] in
      guard let self else { return nil }
      let result = await self._performRefresh(previousIdToken: previousIdToken)
      await self._clearOngoing()
      return result
    }
    ongoingRefresh = task
    return await task.value
  }

  private func _clearOngoing() {
    ongoingRefresh = nil
  }

  private func _performRefresh(previousIdToken: String?) async -> String? {
    guard let config = try? CognitoConfig.load() else { return previousIdToken }
    guard let refreshToken = currentRefreshToken() else { return nil }
    guard let url = URL(string: "https://\(config.domain)/oauth2/token") else {
      return previousIdToken
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue(
      "application/x-www-form-urlencoded",
      forHTTPHeaderField: "Content-Type",
    )
    let body =
      "grant_type=refresh_token"
      + "&client_id=\(config.clientId)"
      + "&refresh_token=\(refreshToken)"
    request.httpBody = body.data(using: .utf8)

    do {
      let (data, response) = try await urlSession.data(for: request)
      guard let http = response as? HTTPURLResponse else {
        print("[Auth] refresh: no HTTP response")
        return previousIdToken
      }
      if (400 ... 499).contains(http.statusCode) {
        // Refresh token has been revoked / expired. Wipe Keychain
        // so the next cold-start lands on the login screen instead
        // of looping 401 → signOut → 401.
        print("[Auth] refresh rejected status=\(http.statusCode)")
        wipeKeychain()
        return nil
      }
      guard (200 ... 299).contains(http.statusCode) else {
        // Server-side hiccup — preserve tokens and let the caller
        // try again on the next observer fire / API call.
        print("[Auth] refresh transport status=\(http.statusCode)")
        return previousIdToken
      }
      guard
        let decoded = try? JSONDecoder().decode(
          CognitoRefreshResponse.self, from: data,
        )
      else {
        return previousIdToken
      }
      // Defend against a sign-out racing with the in-flight
      // refresh: if the refresh token in the Keychain was wiped
      // or replaced while we were on the wire, do not write the
      // new tokens — otherwise the sign-out would silently undo
      // itself and the caregiver would auto-resurrect on next
      // launch.
      guard currentRefreshToken() == refreshToken else { return nil }

      KeychainHelper.save(data: Data(decoded.idToken.utf8), key: .idToken)
      KeychainHelper.save(data: Data(decoded.accessToken.utf8), key: .accessToken)
      // Cognito only rotates the refresh token when the App Client
      // is configured to do so; preserve the existing one when the
      // response omits it (matches the web project's behavior).
      if let rotated = decoded.refreshToken {
        KeychainHelper.save(data: Data(rotated.utf8), key: .refreshToken)
      }
      return decoded.idToken
    } catch {
      // Treat any URLError / decoding throw as transport — the
      // existing tokens stay in the Keychain so the caller can
      // retry on the next fire.
      print("[Auth] refresh network error")
      return previousIdToken
    }
  }

  private func currentIdToken() -> String? {
    guard let data = KeychainHelper.load(key: .idToken) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func currentRefreshToken() -> String? {
    guard let data = KeychainHelper.load(key: .refreshToken) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  private func wipeKeychain() {
    KeychainHelper.delete(key: .idToken)
    KeychainHelper.delete(key: .accessToken)
    KeychainHelper.delete(key: .refreshToken)
  }

  // MARK: - JWT exp parsing

  /// Pulls the `exp` claim out of a JWS payload without verifying
  /// the signature.
  ///
  /// Signature verification is the backend's job (`aws-jwt-verify`
  /// in `apps/backend/lib/cognito-auth.js`); on the device we only
  /// use the `exp` claim to decide whether to proactively refresh,
  /// so a forged `exp` would just cause more refreshes — never an
  /// auth bypass.
  static func expiry(of jwt: String) -> TimeInterval? {
    let parts = jwt.split(separator: ".")
    guard parts.count == 3 else { return nil }
    guard let data = base64UrlDecode(String(parts[1])) else { return nil }
    guard
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    if let exp = json["exp"] as? Double { return exp }
    if let exp = json["exp"] as? Int { return TimeInterval(exp) }
    return nil
  }

  private static func base64UrlDecode(_ s: String) -> Data? {
    var padded = s.replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let mod = padded.count % 4
    if mod != 0 { padded += String(repeating: "=", count: 4 - mod) }
    return Data(base64Encoded: padded)
  }
}

// MARK: - Token-endpoint response

/// JSON body returned by `POST /oauth2/token` for both
/// `authorization_code` and `refresh_token` grants. Only the fields
/// the app actually uses are decoded; `expires_in`, `token_type`,
/// and `id_token` issuer claims are ignored. Never log this struct
/// — every field is a credential value.
private struct CognitoRefreshResponse: Decodable, Sendable {
  let idToken: String
  let accessToken: String
  let refreshToken: String?

  enum CodingKeys: String, CodingKey {
    case idToken = "id_token"
    case accessToken = "access_token"
    case refreshToken = "refresh_token"
  }
}
