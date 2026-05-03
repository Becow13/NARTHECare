# apps/ios/NARTHECare

SwiftUI client for NARTHECare.

## Open the project

1. Install **Xcode** (not only Command Line Tools).
2. Open `apps/ios/NARTHECare.xcodeproj` in Xcode
   (or `open apps/ios/NARTHECare.xcodeproj` from the repo root).
3. Select the **NARTHECareApp** target → **Signing & Capabilities**,
   set your Team, and change the Bundle Identifier from
   `com.example.NARTHECareApp` if it's taken.
4. Confirm **HealthKit** appears under Capabilities. The repo already
   ships `NARTHECareApp.entitlements` with the HealthKit entitlement.

HealthKit behaves best on a **physical iPhone** with real data, but
the simulator works if you seed samples in the Health app.

## Layout

```
apps/ios/
  NARTHECare.xcodeproj/                  Xcode project (target: NARTHECareApp)
  NARTHECare/                            source folder for the target
    NARTHECareAppApp.swift               @main app entry point
    ContentView.swift                    root container + Developer Tools sheet
    Info.plist                           HealthKit usage strings
    NARTHECareApp.entitlements           HealthKit capability
    Assets.xcassets/                     AppIcon + AccentColor
    Models/
      CareRecipientProfile.swift         Swift mirror of shared/contracts/careRecipientProfile.schema.json
      HealthObservation.swift            Swift mirror of shared/contracts/healthObservation.schema.json
    Mock/
      CareRecipientProfileMock.swift     Fixture — mirrors shared/contracts/*.example.json
      CareHubMock.swift                  Fixture for the Care Hub dashboard
    Services/
      APIClient.swift                    URLSession wrapper, async-throws API
      HealthKitManager.swift             HealthKit auth + sample queries → normalized observations
      HealthKitSyncService.swift         Batches observations and POSTs them to /healthkit/sync
      HealthKitObserverManager.swift     HKObserverQuery + background delivery + anchored sync
      CareRecipientProfileService.swift  Profile fetch abstraction (mock today)
    ViewModels/
      PatientProfileViewModel.swift      MVVM state holder (@MainActor)
    Views/
      CareHubView.swift                  Care Hub dashboard
      PatientProfileView.swift           Patient profile screen
    Components/
      Theme.swift                        Color + typography tokens
      InfoCard.swift                     Rounded card surface
      SectionHeader.swift                Section / sub-section titles
      RiskBadge.swift                    Pill for riskLevel
      StatusBadge.swift                  Generic tone pill (good/neutral/warning/bad)
      DataSourceRow.swift                Row in Connected Data Sources card
```

## Architecture rules (non-negotiable)

These mirror `.cursor/rules/reference-pattern.mdc` and
`.cursor/rules/ios-style.mdc`.

1. **MVVM with `@MainActor` view-models.**
   Views hold a `@StateObject` view-model; the view-model owns all
   state and all async work. Views are pure renderers.
2. **Codable models match the JSON Schema exactly.**
   Field names are camelCase — no `CodingKeys` remapping. Enum string
   values are snake_case (matches the schema).
3. **Services are injectable and async throws.**
   Every `CareRecipientProfileService` call either returns a decoded
   payload or throws. The default impl returns the mock; a real impl
   will wrap `APIClient`.
4. **No PHI in logs.** Not the name, not the note text, not the
   phone number. Log `error.localizedDescription` only — never the
   profile payload.
5. **No real auth yet.** Cognito, SMART on FHIR, token refresh are
   all TODO comments, not code. Do not add them here without first
   updating `shared/contracts/` and the backend route.

## What to do when the schema changes

If any field is added / renamed / retyped in
`shared/contracts/careRecipientProfile.schema.json`:

1. Update `Models/CareRecipientProfile.swift` in the **same commit**.
2. Update `Mock/CareRecipientProfileMock.swift`.
3. Update the web + backend mirrors (`shared/models/*`).
4. If the UI needs to surface the new field, update the relevant
   section in `Views/PatientProfileView.swift` and a display helper
   (`Components/*` extension) — never stringify enums at call sites.

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| Signing errors | Set a valid **Team** and unique bundle ID. |
| HealthKit entitlement missing | Enable **HealthKit** capability; ensure your Apple Developer App ID includes HealthKit for distribution builds. |
| Network errors | Check the API base URL in Developer Tools, cellular/Wi-Fi, and that the backend is reachable. |
| Empty metrics on simulator | Grant all requested categories; seed sample data in the Health app, or run on a physical device. |

## HealthKit background delivery

`HealthKitObserverManager` registers one `HKObserverQuery` per
contract metric (steps, resting heart rate, HRV, SpO2, respiratory
rate, walking steadiness, fall events, sleep) and asks iOS to wake
the app via `enableBackgroundDelivery` whenever a new sample
arrives. The observer's update handler runs an
`HKAnchoredObjectQuery` keyed on the per-`(recipient, sample-type)`
anchor, maps only the new samples into contract `HealthObservation`
rows, and POSTs them to `/healthkit/sync`. **Anchors are advanced
only on a successful upload** so a network failure never silently
drops a window.

### Lifecycle

1. **App launch.** `AppDelegate.application(_:didFinishLaunching…)`
   calls `HealthKitObserverManager.shared.registerObserversIfPossible`.
   When the Keychain holds an ID token AND `UserDefaults` holds an
   active recipient id, observers are re-attached immediately —
   both the foreground cold-start case and the iOS-woken
   background-launch case.
2. **Sign-in / recipient pick.** `SyncStatusView` calls
   `startObservers(forRecipientId:idTokenProvider:)` whenever a
   recipient is selected (and on the initial single-recipient
   case). This is idempotent.
3. **Sign-out.** `AuthSession.signOut()` calls
   `handleSignOut()` which stops queries, asks iOS to disable
   background delivery, clears the active recipient + per-recipient
   anchors, and resets the diagnostics surface.

### Sync Diagnostics

`SyncStatusView` shows a **Sync Diagnostics** section sourced from
`HealthKitSyncDiagnostics.shared`. Every field is non-PHI:

- HealthKit authorization state (`granted` / `unknown` / `unavailable`).
- Per-metric background-delivery state (`Enabled` / `Failed (N)` /
  `Not registered`) — `N` is the HKError numeric code.
- Last observer-fire timestamp (relative).
- Last successful background sync timestamp (relative).
- Last sync state (`success` / `failure` / `running`).
- Last sync error code (e.g. `http_403`, `obs_5`, `no_session`) —
  short, non-PHI strings only.
- Last samples uploaded (count only — never values).

### Verifying background delivery

A real iPhone with HealthKit data is the only way to verify
end-to-end. Useful checks during bring-up:

| Check | How to verify |
|---|---|
| Authorization | After sign-in, tap **Manage HealthKit access** and grant every category. The Sync Diagnostics row should switch to `Granted`. |
| Foreground manual sync | Tap **Sync now**. Sync Diagnostics' *Last sync state* should switch to `Success` and *Last samples uploaded* should be > 0 if there's recent data on device. The backend's `audit_logs` table writes a `SYNC_HEALTHKIT_OBSERVATIONS` row with counts only (no values). |
| Observer registration | After sign-in, the per-metric rows in Sync Diagnostics should show `Enabled` for every type the OS supports. `Failed (5)` for one or two types is normal on simulator / iPhone-only devices (e.g. HRV / SpO2 require a paired Apple Watch). |
| Background fire | On a real device with the app suspended, complete a workout / log a manual sleep entry / wait for the next resting-HR sample. Re-open the app — *Last observer fire* should show a recent timestamp and *Last background sync* should be set. The backend's `health_observations` table will have the new rows; `audit_logs` should show a `SYNC_HEALTHKIT_OBSERVATIONS` row for each fire. |
| Anchored incremental | Tap **Sync now** twice in succession. First call: *Last samples uploaded > 0*. Second call: *Last samples uploaded == 0* (the anchor advanced past every existing sample). Add new HealthKit data, tap again — the count should reflect only the new samples. |
| Idempotent dedupe | The backend's UNIQUE on `(source_type, source_record_id)` collapses repeat syncs of the same sample. To smoke-test: clear `UserDefaults` keys with prefix `narthecare.healthkit.anchor.`, sign back in, and run **Sync now**. The backend response's `deduped` count should match what was previously persisted; `accepted` is 0. |
| Re-register on relaunch | Force-quit the app (swipe up). Re-launch — the *Last observer fire* timestamp should not regress, and the per-metric rows should re-attach to `Enabled`. This proves the cold-start observer registration in `AppDelegate`. |
| Backend access gate | Sign in as a caregiver who is NOT on the recipient's care team and call **Sync now**. The backend returns `403`; Sync Diagnostics' *Last sync error code* shows `http_403`. The `health_observations` table is unchanged. |

### Backend test parity

`apps/backend/test/healthkit-sync.integration.test.js` covers the
ingest contract end-to-end: status / batch endpoints, partial-index
ON CONFLICT dedupe, audit-row counts, and access-gate enforcement.
Run with `npm test --prefix apps/backend` from the repo root.
