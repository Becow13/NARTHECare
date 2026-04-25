# NARTHECare iOS app

Minimal **SwiftUI** client that reads **HealthKit** (steps, heart rate, sleep) and `POST`s JSON to your Aptible API (`/health-data`).

## Open the project

1. On your Mac, install **Xcode** from the App Store (not only Command Line Tools).
2. Double-click `NARTHECareApp/NARTHECare.xcodeproj` (or open it via **File -> Open** in Xcode).

## Signing and HealthKit

1. In Xcode, select the **NARTHECareApp** target -> **Signing & Capabilities**.
2. Choose your **Team** so Xcode can sign the app. Change **Bundle Identifier** from `com.example.NARTHECareApp` if the name is taken.
3. Confirm **HealthKit** appears under Capabilities. This repo already includes `NARTHECareApp.entitlements` with the HealthKit entitlement; if Xcode does not show HealthKit, click **+ Capability** -> **HealthKit**.

## Run on a device (recommended)

HealthKit behaves best on a **physical iPhone** with real data.

1. Connect the phone, select it as the run destination, press **Run**.
2. On first use, tap **Grant Health access** and allow read access for **Steps**, **Heart Rate**, and **Sleep**.
3. Tap **Sync to server**. You should see a success message; your backend should insert rows into Postgres.

The default API URL is `https://app-107449.on-aptible.com`. You can change it in the **API base URL** field.

## Simulator

You can run in the **Simulator**, but you may need to add sample data (**Health** app in the simulator, or Xcode’s HealthKit samples). If a metric has no data, the app still uploads; some arrays may be empty.

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| Signing errors | Set a valid **Team** and unique bundle ID. |
| HealthKit entitlement | Enable **HealthKit** capability; ensure your Apple Developer App ID includes HealthKit for distribution builds. |
| Network errors | Check the URL, cellular/Wi‑Fi, and that the Aptible app is up. |
| Empty metrics | Grant all requested categories; add data in Health or use a physical device. |
