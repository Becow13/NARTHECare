import SwiftUI

@main
struct NARTHECareAppApp: App {
  /// Primary auth state machine. Manages Cognito sign-in, token exchange,
  /// Keychain storage, and session restoration on launch.
  @StateObject private var authSession = AuthSession()

  /// Observes the Cognito Hosted UI redirect URI so any view in the
  /// hierarchy can react to callback-state changes independently of the
  /// auth flow (e.g., debugging, future deeplink routing).
  @StateObject private var cognitoCallbackHandler = CognitoCallbackHandler()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(authSession)
        .environmentObject(cognitoCallbackHandler)
        // Cognito Hosted UI redirect URI for local iOS login.
        // iOS routes narthecare://auth/callback here after sign-in.
        // Under normal operation ASWebAuthenticationSession intercepts
        // the URL before it reaches here; this handles cold-start edge cases.
        .onOpenURL { url in
          authSession.handleColdStartURL(url)
          _ = cognitoCallbackHandler.handleCallbackURL(url)
        }
    }
  }
}
