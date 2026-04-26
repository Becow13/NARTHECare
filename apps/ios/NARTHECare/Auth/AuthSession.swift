import AuthenticationServices
import Foundation

/// Central authentication state machine for NARTHECare.
///
/// Manages the full Cognito Hosted UI authorization-code flow:
///   1. On launch — restore session from Keychain.
///   2. Sign-in — open Cognito Hosted UI via `ASWebAuthenticationSession`.
///   3. Callback — exchange the one-time code for tokens at `/oauth2/token`.
///   4. Storage — persist tokens in the iOS Keychain (never in logs).
///   5. Sign-out — wipe all Keychain tokens and reset to `.unauthenticated`.
///   6. Cold-start URL — handle `narthecare://auth/callback` delivered via
///      `onOpenURL` when the app was not in memory at redirect time.
///
/// **HIPAA / security constraints:**
/// - Authorization codes, ID tokens, access tokens, and refresh tokens are
///   NEVER logged. Keychain is the only persistent store.
/// - `errorMessage` contains only generic caregiver-facing strings; no OAuth
///   details, server responses, or token fragments.
/// - Cognito client ID and domain are sourced from `CognitoConfig`
///   (xcconfig → Info.plist), never hardcoded in source.
@MainActor
final class AuthSession: NSObject, ObservableObject {

  // MARK: - Public state

  enum State: Equatable {
    /// Initial state while the Keychain is checked on launch.
    case unknown
    /// No valid session found. The login screen should be shown.
    case unauthenticated
    /// A sign-in is in progress (Hosted UI open or token exchange running).
    case loading
    /// A valid session is present. The main app should be shown.
    case authenticated
  }

  @Published private(set) var state: State = .unknown

  /// Generic, PHI-free message suitable for display in the UI.
  /// Never contains token values, server internals, or user identifiers.
  @Published private(set) var errorMessage: String? = nil

  /// The caregiver's backend profile (`GET /api/me`). Populated after a
  /// successful Cognito sign-in and on session restore. `nil` while
  /// unauthenticated, while a refresh is in flight, or when the most
  /// recent backend call failed (we do not stale-serve profile data
  /// beyond the current authenticated session).
  @Published private(set) var currentUser: BackendUser? = nil

  // MARK: - Private

  private let config: CognitoConfig?
  private let apiClient: APIClient

  /// Retained so `ASWebAuthenticationSession` is not released while the
  /// user completes sign-in in the Hosted UI browser.
  private var activeAuthSession: ASWebAuthenticationSession?

  // MARK: - Init

  /// Designated initializer.
  ///
  /// `apiClient` is injected so previews and unit tests can stub the
  /// network. Production callers (`NARTHECareAppApp`) construct the
  /// session as `AuthSession()` and let the default value kick in,
  /// which preserves the call-site shape from the pre-backend wiring.
  init(apiClient: APIClient = APIClient()) {
    self.config = try? CognitoConfig.load()
    self.apiClient = apiClient
    super.init()
    restoreSession()
  }

  // MARK: - Public API

  /// Launches the Cognito Hosted UI in an in-app `ASWebAuthenticationSession`.
  ///
  /// On success, tokens are stored in the Keychain and `state` transitions to
  /// `.authenticated`. On cancellation `state` silently returns to
  /// `.unauthenticated`. On failure, `errorMessage` is set to a generic string.
  func signIn() {
    guard let config else {
      errorMessage = "Authentication is not configured. Please contact support."
      return
    }
    guard let loginURL = hostedUILoginURL(config: config) else {
      errorMessage = "Could not construct the sign-in URL. Please try again."
      return
    }

    state = .loading
    errorMessage = nil

    let session = ASWebAuthenticationSession(
      url: loginURL,
      callbackURLScheme: "narthecare"
    ) { [weak self] callbackURL, error in
      Task { @MainActor [weak self] in
        await self?.finishSignIn(callbackURL: callbackURL, error: error)
      }
    }

    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false
    activeAuthSession = session
    session.start()
  }

  /// Clears all stored tokens and resets to `.unauthenticated`.
  func signOut() {
    KeychainHelper.delete(key: .idToken)
    KeychainHelper.delete(key: .accessToken)
    KeychainHelper.delete(key: .refreshToken)
    activeAuthSession?.cancel()
    activeAuthSession = nil
    currentUser = nil
    state = .unauthenticated
    errorMessage = nil
  }

  /// Returns the stored ID token if a session is active, otherwise `nil`.
  ///
  /// Call sites must treat the returned value as a credential: never log it,
  /// never display it, and use it only to set `Authorization: Bearer` headers.
  func idToken() -> String? {
    guard let data = KeychainHelper.load(key: .idToken) else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// Handles a `narthecare://auth/callback` URL delivered via a cold-start
  /// deep link — i.e. iOS launched the app from background to handle the
  /// redirect. Under normal operation, `ASWebAuthenticationSession` intercepts
  /// the URL before iOS can deliver it here, so this path is a safety net.
  func handleColdStartURL(_ url: URL) {
    guard
      url.scheme?.lowercased() == "narthecare",
      url.host?.lowercased() == "auth",
      url.path == "/callback"
    else { return }

    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard
      let code = items.first(where: { $0.name == "code" })?.value,
      !code.isEmpty,
      let config
    else {
      state = .unauthenticated
      errorMessage = "Sign-in failed. Please try again."
      return
    }

    state = .loading
    Task { await exchangeCode(code, config: config) }
  }

  // MARK: - Private helpers

  private func restoreSession() {
    // Presence of an ID token in the Keychain is treated as a valid
    // session. The authoritative check is `GET /api/me`: if the backend
    // rejects the token (expired, revoked, pool rotated, or config
    // drift like a dev-bypass flip) we sign the user out from
    // `refreshBackendUser` so they land back on the login screen
    // instead of seeing a stale dashboard.
    if KeychainHelper.load(key: .idToken) != nil {
      state = .authenticated
      Task { await refreshBackendUser(trigger: .coldStart) }
    } else {
      state = .unauthenticated
    }
  }

  private func finishSignIn(callbackURL: URL?, error: Error?) async {
    defer { activeAuthSession = nil }

    if let error = error as NSError? {
      if error.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
        // User cancelled — return silently, no error message.
        state = .unauthenticated
        return
      }
      state = .unauthenticated
      errorMessage = "Sign-in failed. Please try again."
      return
    }

    guard
      let url = callbackURL,
      let config,
      let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
      let code = items.first(where: { $0.name == "code" })?.value,
      !code.isEmpty
    else {
      state = .unauthenticated
      errorMessage = "Sign-in failed. Please try again."
      return
    }

    await exchangeCode(code, config: config)
  }

  /// Exchanges the one-time authorization code for Cognito tokens.
  ///
  /// Sends a `POST /oauth2/token` request to the Cognito token endpoint and
  /// stores the resulting tokens in the Keychain. Never logs the code, the
  /// request body, the response body, or any token value.
  private func exchangeCode(_ code: String, config: CognitoConfig) async {
    guard let tokenURL = URL(string: "https://\(config.domain)/oauth2/token") else {
      state = .unauthenticated
      errorMessage = "Authentication configuration error. Please contact support."
      return
    }

    var request = URLRequest(url: tokenURL)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

    // Percent-encode the redirect URI for the form body.
    let encodedRedirect =
      config.redirectUri.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
    let body =
      "grant_type=authorization_code"
      + "&client_id=\(config.clientId)"
      + "&redirect_uri=\(encodedRedirect)"
      + "&code=\(code)"
    request.httpBody = body.data(using: .utf8)

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard
        let http = response as? HTTPURLResponse,
        (200 ... 299).contains(http.statusCode)
      else {
        state = .unauthenticated
        errorMessage = "Authentication failed. Please try again."
        return
      }

      guard let tokens = try? JSONDecoder().decode(CognitoTokenResponse.self, from: data) else {
        state = .unauthenticated
        errorMessage = "Authentication failed. Please try again."
        return
      }

      // Store tokens in Keychain — never log these values.
      KeychainHelper.save(data: Data(tokens.idToken.utf8), key: .idToken)
      KeychainHelper.save(data: Data(tokens.accessToken.utf8), key: .accessToken)
      if let refresh = tokens.refreshToken {
        KeychainHelper.save(data: Data(refresh.utf8), key: .refreshToken)
      }

      state = .authenticated
      // Bind the Cognito identity to a backend `users` row before the
      // dashboard renders. If the backend rejects the token we sign the
      // user out so they don't see a half-authenticated UI.
      await refreshBackendUser(trigger: .freshSignIn)
    } catch {
      state = .unauthenticated
      errorMessage = "Connection failed. Check your network and try again."
    }
  }

  /// Discriminator for `refreshBackendUser` 401-handling. The same
  /// "token rejected by `/api/me`" outcome should produce different
  /// caregiver-facing copy depending on what just happened in the app:
  /// a launch-time stale token is not the same UX event as a 401 on a
  /// token we just minted, and "Your session has expired" only makes
  /// sense if the user actually had a visible session.
  private enum RefreshTrigger {
    /// Called from `restoreSession()` on launch — Keychain held a
    /// token from a prior install / session / config era. The user
    /// has not seen any authenticated UI in this app instance yet, so
    /// a "session expired" banner is misleading; we silently clear
    /// the stale credentials and land them on the normal login
    /// screen.
    case coldStart

    /// Called from `exchangeCode()` immediately after a fresh Cognito
    /// sign-in. A 401 here is a verification failure on a token we
    /// just minted (config drift, pool mismatch, clock skew) — not a
    /// real session expiry — so we surface a generic, honest "could
    /// not complete sign-in" message instead.
    case freshSignIn
  }

  /// Calls `GET /api/me` to load the caregiver's backend profile.
  ///
  /// Behavior:
  ///
  /// - **Success** — `currentUser` is published and `errorMessage` is
  ///   cleared. The state stays `.authenticated`.
  /// - **401** — the Cognito token was rejected by the backend
  ///   (expired, revoked, pool rotated, dev-bypass flipped, etc.).
  ///   We always sign the user out so they don't see a stale
  ///   dashboard; the `trigger` parameter then decides whether to
  ///   show a banner and which copy to use (see `RefreshTrigger`).
  ///   We never retry: a known-bad token will only produce more
  ///   401s and more audit noise.
  /// - **Any other error** — the auth state is preserved and a
  ///   generic, PHI-free error message is published. The user can
  ///   retry from the dev tools sheet (or any future profile-refresh
  ///   affordance).
  ///
  /// Never logs the token, the response body, or the decoded user.
  private func refreshBackendUser(trigger: RefreshTrigger) async {
    guard let token = idToken() else {
      // No token in Keychain — treat as unauthenticated. This guards
      // against `restoreSession` racing with a manual sign-out.
      currentUser = nil
      state = .unauthenticated
      return
    }

    do {
      let user = try await apiClient.fetchMe(idToken: token)
      currentUser = user
      errorMessage = nil
    } catch APIClientError.unauthorized {
      currentUser = nil
      // Sign-out clears state + tokens AND wipes `errorMessage`, so we
      // assign the trigger-specific copy AFTER it runs.
      signOut()
      switch trigger {
      case .coldStart:
        // Intentionally no banner — see `RefreshTrigger.coldStart`.
        break
      case .freshSignIn:
        errorMessage = "Sign-in could not be completed. Please try again."
      }
    } catch {
      currentUser = nil
      errorMessage =
        "Could not load your profile. Check your network and try again."
    }
  }

  private func hostedUILoginURL(config: CognitoConfig) -> URL? {
    // Normalise domain: strip any leading scheme or trailing slashes so we
    // always produce exactly one "https://<host>" prefix.
    let rawDomain = config.domain
      .trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "https://", with: "")
      .replacingOccurrences(of: "http://", with: "")
      .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

    // Percent-encode ":" and "/" in the redirect URI. Required because
    // iOS 17's URL parser mishandles unencoded "://" inside a query value
    // and silently truncates redirect_uri at the first colon. Cognito
    // decodes "narthecare%3A%2F%2Fauth%2Fcallback" back to
    // "narthecare://auth/callback" — functionally identical to the raw
    // form, RFC 3986 compliant, and the only form that survives the
    // ASWebAuthenticationSession round-trip on iOS 17+.
    let encodedRedirect = config.redirectUri
      .replacingOccurrences(of: ":", with: "%3A")
      .replacingOccurrences(of: "/", with: "%2F")

    // Build the Cognito Hosted UI login URL manually for exact control.
    // - Path: /login (Cognito Hosted UI).
    // - Scope separator: "+" (both "+" and "%20" are accepted by Cognito).
    let urlString =
      "https://\(rawDomain)/login"
      + "?client_id=\(config.clientId)"
      + "&redirect_uri=\(encodedRedirect)"
      + "&response_type=code"
      + "&scope=openid+email+profile"

    let url = URL(string: urlString)

    // Verbose debug log so we can verify each piece survived URL parsing.
    // Safe to log — only public OAuth parameters (client_id, scope,
    // redirect_uri). Never log tokens, authorization codes, or PHI.
    print("[AuthSession] ===== authorize URL debug =====")
    print("[AuthSession] domain         : \(rawDomain)")
    print("[AuthSession] redirect (raw) : \(config.redirectUri)")
    print("[AuthSession] redirect (enc) : \(encodedRedirect)")
    print("[AuthSession] urlString.count: \(urlString.count)")
    print("[AuthSession] urlString      : \(urlString)")
    print("[AuthSession] parsed URL     : \(url?.absoluteString ?? "nil")")
    print("[AuthSession] ==============================")

    return url
  }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuthSession: ASWebAuthenticationPresentationContextProviding {
  /// Returns the key window for presenting the Cognito Hosted UI browser.
  /// Called on the main thread by `ASWebAuthenticationSession`.
  nonisolated func presentationAnchor(
    for session: ASWebAuthenticationSession
  ) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first(where: { $0.activationState == .foregroundActive })?
        .windows
        .first(where: { $0.isKeyWindow }) ?? UIWindow()
    }
  }
}

// MARK: - Token response

/// Decodes the JSON body returned by `POST /oauth2/token`.
/// Never instantiate for logging — all fields are credential values.
private struct CognitoTokenResponse: Decodable {
  let idToken: String
  let accessToken: String
  let refreshToken: String?

  enum CodingKeys: String, CodingKey {
    case idToken = "id_token"
    case accessToken = "access_token"
    case refreshToken = "refresh_token"
  }
}
