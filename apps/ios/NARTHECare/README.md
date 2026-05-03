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
