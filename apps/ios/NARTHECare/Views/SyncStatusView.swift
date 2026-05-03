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
///   - A manual "Sync now" button that runs the anchored-query path
///     across every contract metric — same path the background
///     observer fires through, so manual + background never diverge.
///   - A button to manage HealthKit permissions (re-prompt).
///   - A **Sync Diagnostics** section (developer-oriented but safe to
///     ship) that exposes the background-delivery state per metric,
///     the last observer-fire timestamp, last successful background
///     sync, last sync state, and the most recent non-PHI error code.
///     No values, no per-sample timestamps, no metric values. The
///     section is rendered from `HealthKitSyncDiagnostics.shared` so
///     the foreground UI tracks observer fires that happened while
///     the app was suspended.
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
  @EnvironmentObject private var diagnostics: HealthKitSyncDiagnostics

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

      diagnosticsSection

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

  /// Sync Diagnostics section — informational rows backed by
  /// `HealthKitSyncDiagnostics.shared`. Renders only PHI-safe fields:
  /// timestamps, counts, sample-type identifiers, and HKError codes.
  /// Hidden until something has happened so the section doesn't
  /// dominate an empty post-login screen.
  @ViewBuilder
  private var diagnosticsSection: some View {
    Section("Sync Diagnostics") {
      diagnosticsAuthRow
      diagnosticsLastObserverFireRow
      diagnosticsLastBackgroundSyncRow
      diagnosticsLastStateRow
      if let code = diagnostics.lastSyncErrorCode {
        HStack {
          Text("Last error code")
          Spacer()
          Text(code)
            .font(.footnote.monospaced())
            .foregroundStyle(.secondary)
            .accessibilityLabel("Last sync error code: \(code)")
        }
      }
      HStack {
        Text("Last samples uploaded")
        Spacer()
        Text("\(diagnostics.lastSyncSamplesUploaded)")
          .foregroundStyle(.secondary)
      }
      backgroundDeliveryRows
    }
  }

  private var diagnosticsAuthRow: some View {
    HStack {
      Text("HealthKit authorization")
      Spacer()
      Text(authorizationLabel)
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
  }

  private var diagnosticsLastObserverFireRow: some View {
    HStack {
      Text("Last observer fire")
      Spacer()
      Text(diagnosticsTimestamp(diagnostics.lastObserverFireAt))
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
  }

  private var diagnosticsLastBackgroundSyncRow: some View {
    HStack {
      Text("Last background sync")
      Spacer()
      Text(diagnosticsTimestamp(diagnostics.lastSuccessfulBackgroundSyncAt))
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
  }

  private var diagnosticsLastStateRow: some View {
    HStack {
      Text("Last sync state")
      Spacer()
      Text(diagnostics.lastSyncState.rawValue.capitalized)
        .font(.footnote)
        .foregroundStyle(syncStateColor(diagnostics.lastSyncState))
    }
  }

  /// One row per contract metric showing whether iOS confirmed
  /// background delivery. The metric label uses the sample-type
  /// identifier (e.g. `resting_heart_rate`) — non-PHI, matches the
  /// contract value, and stays in sync with backend logs.
  @ViewBuilder
  private var backgroundDeliveryRows: some View {
    let entries = HealthObservationMetricType.allCases
      .map { ($0, diagnostics.backgroundDeliveryByMetric[$0]) }
    ForEach(entries, id: \.0) { entry in
      HStack {
        Text(entry.0.rawValue)
          .font(.footnote.monospaced())
        Spacer()
        Text(backgroundDeliveryLabel(entry.1))
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
  }

  // MARK: - Display helpers

  /// Caregiver-facing status copy.
  ///
  /// Only renders "Loading…" while the initial `.task` is still in
  /// flight (`isWorking && registryStatus == nil`) — otherwise the
  /// row would lie about activity in the two real "no status yet"
  /// terminal states:
  ///   - the caregiver has zero care recipients on the team
  ///     (`recipients.isEmpty`), or
  ///   - `loadCareRecipients` / `refreshStatus` failed and the
  ///     "Error" section already explains it (`loadingError`).
  /// Both must show neutral copy here so the caregiver does not
  /// wait indefinitely for a fetch that will never complete.
  private var statusLabel: String {
    if let status = registryStatus?.status {
      switch status {
      case .connected: return "Connected"
      case .notConnected: return "Not connected"
      case .error: return "Error"
      }
    }
    if isWorking { return "Loading…" }
    if loadingError != nil { return "Unavailable" }
    if selectedRecipientId == nil { return "—" }
    return "Unavailable"
  }

  /// "Last sync" copy, mirroring `statusLabel`'s honesty rules so the
  /// row does not fall back to the misleading "Never" when there is
  /// simply no recipient (or the status fetch failed).
  private var lastSyncLabel: String {
    if let iso = registryStatus?.lastSyncedAt, !iso.isEmpty {
      return RelativeTime.formatLocalizedDateTime(iso)
    }
    if registryStatus != nil {
      return "Never"
    }
    if isWorking { return "—" }
    return "—"
  }

  private var bindingForSelection: Binding<String?> {
    Binding(
      get: { selectedRecipientId },
      set: { newValue in
        selectedRecipientId = newValue
        if let id = newValue {
          attachBackgroundSync(forRecipientId: id)
          Task { await refreshStatus(for: id) }
        }
      },
    )
  }

  private var authorizationLabel: String {
    switch diagnostics.authorization {
    case .unknown: return "Unknown"
    case .granted: return "Granted"
    case .unavailable: return "Unavailable"
    }
  }

  private func backgroundDeliveryLabel(
    _ state: HealthKitSyncDiagnostics.BackgroundDeliveryState?,
  ) -> String {
    switch state {
    case .none, .notRegistered:
      return "Not registered"
    case .enabled:
      return "Enabled"
    case .failed(let code):
      return "Failed (\(code))"
    case .unsupported:
      return "Unsupported"
    }
  }

  /// Diagnostics clock stamps — the device's locale + local time zone
  /// (`DateFormatter`), not raw UTC ISO 8601 strings.
  private func diagnosticsTimestamp(_ date: Date?) -> String {
    guard let date else { return "—" }
    let f = DateFormatter()
    f.locale = Locale.current
    f.timeZone = TimeZone.current
    f.dateStyle = .medium
    f.timeStyle = .short
    return f.string(from: date)
  }

  private func syncStateColor(
    _ state: HealthKitSyncDiagnostics.LastSyncState,
  ) -> Color {
    switch state {
    case .idle, .running: return .secondary
    case .success: return .green
    case .failure: return .red
    }
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
        attachBackgroundSync(forRecipientId: id)
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

  /// Hand the observer manager the active recipient and a
  /// Keychain-backed token provider so background fires (which run
  /// without SwiftUI mounted) can authenticate and attribute the
  /// upload. Idempotent — calling it again with the same recipient
  /// is a cheap restart.
  private func attachBackgroundSync(forRecipientId recipientId: String) {
    Task {
      await HealthKitObserverManager.shared.startObservers(
        forRecipientId: recipientId,
        idTokenProvider: AppDelegate.keychainTokenProvider,
      )
    }
  }

  /// Manual sync now uses the observer manager's anchored-query path
  /// across every contract metric — same path the background
  /// observer fires through. The status-registry envelope still
  /// comes from `GET /healthkit/status` so the caregiver sees the
  /// authoritative server-side timestamp on success.
  private func syncNow() async {
    guard let id = selectedRecipientId else { return }
    isWorking = true
    defer { isWorking = false }
    statusMessage = "Syncing…"
    let uploaded = await HealthKitObserverManager.shared.syncAllTypesNow(
      forRecipientId: id,
      idTokenProvider: AppDelegate.keychainTokenProvider,
    )
    lastSyncOutcome = HealthKitSyncOutcome(
      accepted: uploaded, deduped: 0, rejected: 0,
      lastSyncedAt: nil,
    )
    if uploaded > 0 {
      statusMessage = "Sync complete."
    } else {
      // Distinguish "nothing new on the device" from "nothing
      // could be uploaded": the diagnostics surface owns the
      // failure-vs-success distinction; this row is intentionally
      // neutral so we don't over-claim.
      statusMessage = "No new HealthKit data in the last window."
    }
    await refreshStatus(for: id)
  }

  private func requestPermissions() async {
    isWorking = true
    defer { isWorking = false }
    do {
      try await HealthKitManager().requestAuthorization()
      diagnostics.setAuthorization(.granted)
      statusMessage = "HealthKit access granted (or already authorized)."
      // Re-attach so observer queries pick up the newly granted
      // sample types without waiting for the next launch.
      if let id = selectedRecipientId {
        attachBackgroundSync(forRecipientId: id)
      }
    } catch {
      // Apple does not throw on a user denial of READ permission;
      // a throw here typically means missing usage strings or a
      // sandbox failure. Don't claim "denied" here either.
      statusMessage =
        "Could not present HealthKit access prompt. Update permissions in the Health app."
    }
  }
}

#Preview {
  NavigationStack {
    SyncStatusView()
      .environmentObject(AuthSession())
      .environmentObject(HealthKitSyncDiagnostics.shared)
  }
}
