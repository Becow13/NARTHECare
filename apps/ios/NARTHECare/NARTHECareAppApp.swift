import SwiftUI

@main
struct NARTHECareAppApp: App {
  /// Handles the Cognito Hosted UI redirect URI (narthecare://auth/callback)
  /// delivered by iOS after a successful Hosted UI login. Injected into the
  /// environment so any view in the hierarchy can observe auth-state changes.
  @StateObject private var cognitoCallbackHandler = CognitoCallbackHandler()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(cognitoCallbackHandler)
        // Cognito Hosted UI redirect URI for local iOS login.
        // iOS routes narthecare://auth/callback here after sign-in.
        .onOpenURL { url in
          _ = cognitoCallbackHandler.handleCallbackURL(url)
        }
    }
  }
}
