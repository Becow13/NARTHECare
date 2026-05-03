import SwiftUI
import UIKit

@main
struct NARTHECareAppApp: App {
  /// Primary auth state machine. Manages Cognito sign-in, token exchange,
  /// Keychain storage, and session restoration on launch.
  @StateObject private var authSession = AuthSession()

  /// Observes the Cognito Hosted UI redirect URI so any view in the
  /// hierarchy can react to callback-state changes independently of the
  /// auth flow (e.g., debugging, future deeplink routing).
  @StateObject private var cognitoCallbackHandler = CognitoCallbackHandler()

  /// Observable HealthKit sync diagnostics. The instance lives on
  /// `HealthKitSyncDiagnostics.shared` so the background observer
  /// (which runs without SwiftUI mounted) can update it; we hold a
  /// reference here as a `@StateObject` so SwiftUI views can read
  /// it via `@EnvironmentObject` without owning the singleton.
  @StateObject private var syncDiagnostics = HealthKitSyncDiagnostics.shared

  /// `UIApplicationDelegate` adapter — the only reason we keep one
  /// is to re-register `HKObserverQuery` and background delivery as
  /// soon as the process launches. SwiftUI's `.task` modifier
  /// doesn't fire when iOS wakes the app for an HKObserver fire
  /// because no view tree mounts in that path.
  @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(authSession)
        .environmentObject(cognitoCallbackHandler)
        .environmentObject(syncDiagnostics)
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

/// Minimal `UIApplicationDelegate` whose sole job is to re-register
/// HealthKit observer queries on every process launch.
///
/// `HKObserverQuery` is **not** persistent across launches per Apple's
/// docs — when iOS wakes the app for a background HealthKit update,
/// our observers must already be attached to the running
/// `HKHealthStore` for the update handler to fire. SwiftUI's `.task`
/// modifier is too late here because no view hierarchy mounts in
/// background-launched processes.
///
/// **Security:** the delegate never reads token bytes itself — it
/// hands `HealthKitObserverManager` a closure that pulls the current
/// ID token from the Keychain at fire time, so a refresh between
/// launches is picked up without a re-register.
final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _: UIApplication,
    didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]? = nil,
  ) -> Bool {
    HealthKitObserverManager.shared.registerObserversIfPossible(
      idTokenProvider: AppDelegate.keychainTokenProvider,
    )
    return true
  }

  /// Static, `@Sendable` token provider so the observer manager (which
  /// runs on a HealthKit-internal queue) can safely call it without
  /// crossing main-actor boundaries. The Keychain is the source of
  /// truth even mid-session — `AuthSession` writes there too.
  static let keychainTokenProvider: @Sendable () async -> String? = {
    guard let data = KeychainHelper.load(key: .idToken) else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
