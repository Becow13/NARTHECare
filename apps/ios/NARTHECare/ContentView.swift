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

/// Bundles the pre-dashboard controls that used to live directly on the
/// entry page: API base URL, user id, HealthKit grant / sync, and a
/// link to the mock patient profile. Exposed as a sheet so the Care Hub
/// dashboard stays the primary surface on launch while these stay
/// reachable until the auth and backend layers stabilise.
private struct DevToolsView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var authSession: AuthSession

  @State private var userId: String = "iphone-user"
  @State private var baseURL: String = APIClient.defaultBaseURL
  @State private var status: String = "Grant access, then sync."
  @State private var isBusy = false

  private let healthKit = HealthKitManager()

  var body: some View {
    Form {
      Section("Signed in") {
        signedInRow
      }

      Section("Server") {
        TextField("API base URL (no trailing slash)", text: $baseURL)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
          #if os(iOS)
            .keyboardType(.URL)
          #endif
      }

      Section("Identity") {
        TextField("User ID sent to API", text: $userId)
          .textInputAutocapitalization(.never)
      }

      Section {
        Button("Grant Health access") {
          Task { await authorize() }
        }
        .disabled(isBusy || !healthKit.isHealthDataAvailable())

        Button("Sync to server") {
          Task { await sync() }
        }
        .disabled(isBusy || userId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
      status = "Health access granted (or already authorized). Tap Sync."
    } catch {
      status = "Authorization failed: \(error.localizedDescription)"
    }
  }

  @MainActor
  private func sync() async {
    guard healthKit.isHealthDataAvailable() else {
      status = "Health data not available on this device."
      return
    }

    isBusy = true
    defer { isBusy = false }

    do {
      let uid = userId.trimmingCharacters(in: .whitespacesAndNewlines)
      let payload = try await healthKit.buildPayload(userId: uid)
      let client = APIClient(baseURL: baseURL)
      try await client.uploadHealthData(payload)
      let summary =
        "Sent steps: \(payload.steps.count), HR: \(payload.heartRate.count), sleep rows: \(payload.sleep.count)."
      status = "Success. \(summary)"
    } catch {
      status = "Sync failed: \(error.localizedDescription)"
    }
  }
}

#Preview {
  ContentView()
    .environmentObject(AuthSession())
    .environmentObject(CognitoCallbackHandler())
}
