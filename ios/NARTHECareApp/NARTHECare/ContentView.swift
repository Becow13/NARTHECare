import SwiftUI

struct ContentView: View {
  @State private var userId: String = "iphone-user"
  @State private var baseURL: String = APIClient.defaultBaseURL
  @State private var status: String = "Grant access, then sync."
  @State private var isBusy = false

  private let healthKit = HealthKitManager()

  var body: some View {
    NavigationStack {
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
      }
      .navigationTitle("NARTHECare")
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
