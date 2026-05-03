import SwiftUI

/// Minimal sync-status surface for the iOS HealthKit sync companion.
///
/// This is the **only** caregiver-facing iOS surface that may grow in
/// Phase 4A — the rest of the app is frozen per
/// `.cursor/rules/ios-style.mdc`. It shows:
///
///   - The connected care recipient (or a "no recipient" empty state).
///   - The current registry row from `GET /healthkit/status`
///     (`status`, `lastSyncedAt`, `errorMessage`).
///   - A manual "Sync now" button that runs `HealthKitSyncService.syncNow`.
///   - A button to manage HealthKit permissions (re-prompt).
///
/// **Display constraints (healthcare):**
///   - No PHI is shown beyond the care recipient's display name —
///     the registry status is not PHI.
///   - No values, no per-sample timestamps, no metric names; only
///     counts from the most recent sync attempt.
///   - Errors render the generic `error.localizedDescription` from
///     `HealthKitSyncError`; never a raw transport message.
struct SyncStatusView: View {
  @EnvironmentObject private var authSession: AuthSession

  @State private var recipients: [CareRecipientListRow] = []
  @State private var selectedRecipientId: String? = nil
  @State private var registryStatus: HealthKitSyncStatusResponse? = nil
  @State private var lastSyncOutcome: HealthKitSyncOutcome? = nil
  @State private var statusMessage: String =
    "Tap Sync now to send the latest HealthKit data."
  @State private var isWorking: Bool = false
  @State private var loadingError: String? = nil

  private var syncService: HealthKitSyncService {
    HealthKitSyncService(session: authSession)
  }

  var body: some View {
    Form {
      Section("Care Recipient") {
        recipientPicker
      }

      Section("HealthKit Sync") {
        statusRow
        lastSyncRow
        if let outcome = lastSyncOutcome, outcome.hadSamples {
          countsRow(outcome: outcome)
        }
      }

      Section {
        Button {
          Task { await syncNow() }
        } label: {
          Label("Sync now", systemImage: "arrow.triangle.2.circlepath")
        }
        .disabled(isWorking || selectedRecipientId == nil)

        Button {
          Task { await requestPermissions() }
        } label: {
          Label("Manage HealthKit access", systemImage: "lock.shield")
        }
        .disabled(isWorking)
      }

      Section("Status") {
        Text(statusMessage)
          .font(.footnote)
          .foregroundStyle(.secondary)
      }

      if let loadingError {
        Section("Error") {
          Text(loadingError)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
    }
    .navigationTitle("Sync Status")
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .task {
      await loadInitialState()
    }
  }

  // MARK: - Subviews

  @ViewBuilder
  private var recipientPicker: some View {
    if recipients.isEmpty {
      Text("No care recipient is connected to your account yet.")
        .font(.footnote)
        .foregroundStyle(.secondary)
    } else if recipients.count == 1, let only = recipients.first {
      // Single recipient — render as a label, not a picker, so the
      // caregiver doesn't waste a tap on a one-option list.
      Text(only.name)
    } else {
      Picker("Care recipient", selection: bindingForSelection) {
        ForEach(recipients) { row in
          Text(row.name).tag(Optional(row.id))
        }
      }
      .pickerStyle(.menu)
    }
  }

  private var statusRow: some View {
    HStack {
      Text("Status")
      Spacer()
      Text(statusLabel)
        .foregroundStyle(.secondary)
    }
  }

  private var lastSyncRow: some View {
    HStack {
      Text("Last sync")
      Spacer()
      Text(lastSyncLabel)
        .foregroundStyle(.secondary)
    }
  }

  private func countsRow(outcome: HealthKitSyncOutcome) -> some View {
    HStack {
      Text("Latest")
      Spacer()
      Text(
        "Accepted \(outcome.accepted) · Deduped \(outcome.deduped) · Rejected \(outcome.rejected)"
      )
      .font(.footnote)
      .foregroundStyle(.secondary)
    }
  }

  // MARK: - Display helpers

  private var statusLabel: String {
    guard let status = registryStatus?.status else { return "Loading…" }
    switch status {
    case .connected: return "Connected"
    case .notConnected: return "Not connected"
    case .error: return "Error"
    }
  }

  private var lastSyncLabel: String {
    if let iso = registryStatus?.lastSyncedAt, !iso.isEmpty {
      return iso
    }
    return "Never"
  }

  private var bindingForSelection: Binding<String?> {
    Binding(
      get: { selectedRecipientId },
      set: { selectedRecipientId = $0 },
    )
  }

  // MARK: - Actions

  private func loadInitialState() async {
    isWorking = true
    defer { isWorking = false }
    do {
      let recipients = try await syncService.loadCareRecipients()
      self.recipients = recipients
      // Default to the first recipient — the picker lets the
      // caregiver switch when they have several.
      selectedRecipientId = selectedRecipientId ?? recipients.first?.id
      if let id = selectedRecipientId {
        await refreshStatus(for: id)
      } else {
        registryStatus = nil
      }
      loadingError = nil
    } catch let err as HealthKitSyncError {
      loadingError = err.errorDescription
    } catch {
      loadingError = "Could not load care recipients."
    }
  }

  private func refreshStatus(for recipientId: String) async {
    do {
      registryStatus = try await syncService.fetchStatus(
        careRecipientId: recipientId)
    } catch let err as HealthKitSyncError {
      statusMessage = err.errorDescription ?? statusMessage
    } catch {
      statusMessage = "Could not load sync status."
    }
  }

  private func syncNow() async {
    guard let id = selectedRecipientId else { return }
    isWorking = true
    defer { isWorking = false }
    statusMessage = "Syncing…"
    do {
      let outcome = try await syncService.syncNow(careRecipientId: id)
      lastSyncOutcome = outcome
      if outcome.hadSamples {
        statusMessage = "Sync complete."
      } else {
        statusMessage = "No new HealthKit data in the last window."
      }
      await refreshStatus(for: id)
    } catch let err as HealthKitSyncError {
      statusMessage = err.errorDescription ?? "Sync failed."
    } catch {
      statusMessage = "Sync failed."
    }
  }

  private func requestPermissions() async {
    isWorking = true
    defer { isWorking = false }
    do {
      try await HealthKitManager().requestAuthorization()
      statusMessage = "HealthKit access granted (or already authorized)."
    } catch {
      statusMessage =
        "HealthKit access was denied. Update permissions in the Health app."
    }
  }
}

#Preview {
  NavigationStack {
    SyncStatusView()
      .environmentObject(AuthSession())
  }
}
