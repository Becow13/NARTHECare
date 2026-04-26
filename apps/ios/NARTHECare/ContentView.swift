import SwiftUI

/// App-level container for the iOS NARTHECare app.
///
/// `ContentView` intentionally stays thin: it just hosts the Care Hub
/// entry page (`CareHubView`) and exposes the developer / HealthKit
/// tooling behind a toolbar gear button. The visual language — header,
/// slogan banner, stat cards, and Care Member Snapshot — is defined by
/// the web prototype at
/// `Prototype Code/NARTHECare Dashboard Pages Code/app/dashboard/page.tsx`.
///
/// The dev tooling (API base URL, user id override, HealthKit grant /
/// sync, and the mock patient profile link) is kept one tap away
/// because the product still relies on it until Cognito and the real
/// Care Hub endpoint ship.
struct ContentView: View {
  @State private var showDevTools = false

  var body: some View {
    NavigationStack {
      CareHubView(dashboard: CareHubMock.sample)
        .navigationTitle("NARTHECare")
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

  @State private var userId: String = "iphone-user"
  @State private var baseURL: String = APIClient.defaultBaseURL
  @State private var status: String = "Grant access, then sync."
  @State private var isBusy = false

  private let healthKit = HealthKitManager()

  var body: some View {
    Form {
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
}
