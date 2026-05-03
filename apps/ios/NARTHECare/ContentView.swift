import SwiftUI

/// App-level auth gate and container for the iOS NARTHECare app.
///
/// Reads `AuthSession.state` from the environment and switches between three
/// surfaces:
///
///  - `.unknown`       — brief splash spinner shown while the Keychain is read
///                       on launch.
///  - `.unauthenticated` / `.loading` — `LoginView`, which opens the Cognito
///                       Hosted UI when the caregiver taps "Sign In".
///  - `.authenticated` — the Phase 4A `SyncStatusView` (HealthKit sync companion).
///
/// **Web-first MVP scope freeze:** post-login routes to `SyncStatusView`,
/// not the legacy `CareHubView`. iOS is a HealthKit sync companion only
/// during the web-first phase — see `docs/web-mvp-plan.md` and
/// `.cursor/rules/ios-style.mdc`. The legacy dashboard surfaces (Care
/// Hub, mock patient profile) remain reachable from the Developer
/// Tools sheet so existing fixtures don't bit-rot.
///
/// This is the only place auth state drives navigation; individual views
/// must not bypass this gate.
struct ContentView: View {
  @EnvironmentObject private var authSession: AuthSession
  @State private var showDevTools = false

  var body: some View {
    switch authSession.state {
    case .unknown:
      splashView

    case .unauthenticated, .loading:
      LoginView()

    case .authenticated:
      mainApp
    }
  }

  // MARK: - Surfaces

  /// Momentary loading spinner shown while `AuthSession` checks the Keychain.
  private var splashView: some View {
    ZStack {
      Color.ncBackground.ignoresSafeArea()
      ProgressView()
        .progressViewStyle(.circular)
        .tint(Color.ncAccent)
    }
  }

  /// Phase 4A sync companion entry point, shown once a session is
  /// confirmed. The legacy CareHub / patient profile surfaces remain
  /// reachable from the Developer Tools sheet — see the class
  /// docstring.
  private var mainApp: some View {
    NavigationStack {
      SyncStatusView()
        #if os(iOS)
          .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
          ToolbarItem(placement: .primaryAction) {
            Button {
              showDevTools = true
            } label: {
              Image(systemName: "gearshape")
            }
            .accessibilityLabel("Developer tools")
          }
        }
        .sheet(isPresented: $showDevTools) {
          NavigationStack {
            DevToolsView()
          }
        }
    }
  }
}

// MARK: - Developer tools sheet

/// Bundles the pre-dashboard developer controls: API base URL display,
/// HealthKit permission re-prompt, and links to the mock patient
/// profile / legacy Care Hub. Exposed as a sheet so the Sync Status
/// surface stays the primary post-login screen while these stay
/// reachable for ad-hoc engineering work.
///
/// Real HealthKit syncing happens on the canonical
/// `SyncStatusView` → `HealthKitSyncService` → `POST /healthkit/sync`
/// path. This sheet intentionally does NOT expose a "sync to server"
/// button so there is one and only one ingest path through the app.
private struct DevToolsView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var authSession: AuthSession

  @State private var status: String =
    "HealthKit syncing happens on Sync Status. Tap below to manage permissions."
  @State private var isBusy = false

  private let healthKit = HealthKitManager()

  var body: some View {
    Form {
      Section("Signed in") {
        signedInRow
      }

      Section("Server") {
        Text(APIClient.defaultBaseURL)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityLabel("API base URL")
      }

      Section {
        Button("Grant Health access") {
          Task { await authorize() }
        }
        .disabled(isBusy || !healthKit.isHealthDataAvailable())
      }

      Section("Status") {
        Text(status)
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      Section {
        Button(role: .destructive) {
          dismiss()
          authSession.signOut()
        } label: {
          Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
        }
      }

      Section("Care Recipients") {
        NavigationLink {
          PatientProfileView(
            viewModel: PatientProfileViewModel(
              recipientId: CareRecipientProfileMock.id,
              service: MockCareRecipientProfileService()
            )
          )
        } label: {
          Label("View patient profile (mock)", systemImage: "person.text.rectangle")
        }
        NavigationLink {
          CareHubView(dashboard: CareHubMock.sample)
        } label: {
          Label("View legacy Care Hub (mock)", systemImage: "rectangle.grid.2x2")
        }
      }
    }
    .navigationTitle("Developer Tools")
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .toolbar {
      ToolbarItem(placement: .cancellationAction) {
        Button("Done") { dismiss() }
      }
    }
  }

  /// Read-only summary of the authenticated caregiver, sourced from
  /// `AuthSession.currentUser` (populated by `GET /api/me`).
  ///
  /// Falls back to a generic "Signed in" line when the backend profile
  /// has not loaded yet — for example on a slow network during the
  /// first launch after sign-in. We intentionally never display the
  /// raw Cognito sub or any token contents here; only the safe,
  /// caregiver-facing fields the backend has approved for display.
  @ViewBuilder
  private var signedInRow: some View {
    if let user = authSession.currentUser {
      VStack(alignment: .leading, spacing: 2) {
        if let name = user.displayName, !name.isEmpty {
          Text(name)
            .font(.body)
        }
        if let email = user.email, !email.isEmpty {
          Text(email)
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        Text("Role: \(user.role) · Status: \(user.status)")
          .font(.caption2)
          .foregroundStyle(.tertiary)
      }
    } else {
      Text("Loading profile…")
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
  }

  @MainActor
  private func authorize() async {
    guard healthKit.isHealthDataAvailable() else {
      status = "Health data not available on this device."
      return
    }
    isBusy = true
    defer { isBusy = false }
    do {
      try await healthKit.requestAuthorization()
      status =
        "Health access granted (or already authorized). Open Sync Status to send data."
    } catch {
      status = "Authorization failed: \(error.localizedDescription)"
    }
  }
}

#Preview {
  ContentView()
    .environmentObject(AuthSession())
    .environmentObject(CognitoCallbackHandler())
}
