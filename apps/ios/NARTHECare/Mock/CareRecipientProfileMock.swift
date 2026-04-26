import Foundation

/// Local fallback `CareRecipientProfile` used for SwiftUI previews,
/// offline demos, and pre-auth builds where the API is not reachable.
///
/// Values here must stay in lockstep with
/// `shared/contracts/careRecipientProfile.example.json` and the web
/// stub's mock (`apps/web/app/patients/[id]/profile/mock.ts`). If the
/// schema changes, update all three in the same commit.
///
/// TODO(backend): delete this mock once the backend's
/// `/care-recipients/:id/profile` route is live and seeded in every
/// environment. The view model will then load only from the API and
/// show an empty-state on failure instead of the fallback copy.
enum CareRecipientProfileMock {
  /// Stable UUID for the Margaret Chen sample — identical to the
  /// example payload in `shared/contracts/` so calling the future
  /// `GET /care-recipients/<mockID>/profile` returns the same values
  /// the app renders today.
  static let id: String = "11111111-1111-4111-a111-111111111111"

  /// Canonical mock profile used in previews and `ContentView`'s
  /// default argument to `PatientProfileView`.
  static let margaretChen: CareRecipientProfile = CareRecipientProfile(
    id: id,
    name: "Margaret Chen",
    age: 78,
    dateOfBirth: "1947-02-14",
    gender: "Female",
    primaryConditions: ["Type 2 Diabetes", "Hypertension"],
    riskLevel: .moderate,
    contact: CareRecipientContact(
      phone: "+1-415-555-0142",
      address: "1280 Sunset Blvd, San Francisco, CA 94122"
    ),
    emergencyContact: EmergencyContact(
      name: "Jessie Huang",
      phone: "+1-415-555-0188",
      relationship: "Daughter"
    ),
    careTeam: CareTeam(
      primaryCaregiver: "Jessie Huang",
      members: [
        CareTeamMember(id: "ctm-001", name: "Jessie Huang",
                       role: .primaryCaregiver, permission: .fullAccess),
        CareTeamMember(id: "ctm-002", name: "David Chen",
                       role: .familyMember, permission: .limitedAccess),
        CareTeamMember(id: "ctm-003", name: "Dr. Priya Nair",
                       role: .clinician, permission: .clinicalAccess),
        CareTeamMember(id: "ctm-004", name: "Renee Alvarez",
                       role: .careCoordinator, permission: .viewOnly),
      ]
    ),
    healthBackground: HealthBackground(
      conditions: ["Type 2 Diabetes", "Hypertension", "Mild osteoarthritis"],
      allergies: ["Penicillin"],
      medications: [
        "Metformin 500 mg, twice daily",
        "Lisinopril 10 mg, once daily",
        "Atorvastatin 20 mg, once daily",
      ],
      mobilityStatus: "Ambulatory with cane on longer walks",
      fallRiskNotes: "One near-fall reported in the last 90 days; no injury."
    ),
    dataSources: [
      DataSource(type: .appleHealth, status: .connected,
                 lastSyncedAt: "2026-04-25T09:12:00-07:00", errorMessage: nil),
      DataSource(type: .epic, status: .notConnected,
                 lastSyncedAt: nil, errorMessage: nil),
      DataSource(type: .fallDetection, status: .connected,
                 lastSyncedAt: "2026-04-25T08:45:00-07:00", errorMessage: nil),
      DataSource(type: .fitbit, status: .notConnected,
                 lastSyncedAt: nil, errorMessage: nil),
      DataSource(type: .garmin, status: .notConnected,
                 lastSyncedAt: nil, errorMessage: nil),
      DataSource(type: .ring, status: .notConnected,
                 lastSyncedAt: nil, errorMessage: nil),
    ],
    baseline: Baseline(
      steps: BaselineRange(min: 3500, max: 5500),
      sleepHours: BaselineRange(min: 6.5, max: 8),
      restingHeartRate: BaselineRange(min: 62, max: 74),
      bloodPressure: "125/78",
      lastUpdated: "2026-04-20"
    ),
    recentNotes: [
      RecentNote(
        id: "note-001",
        content: "Reported mild dizziness after lunch. Will monitor hydration.",
        author: "Jessie Huang",
        createdAt: "2026-04-24T13:15:00-07:00"
      ),
      RecentNote(
        id: "note-002",
        content: "Completed morning walk with assistance.",
        author: "Jessie Huang",
        createdAt: "2026-04-24T09:00:00-07:00"
      ),
      RecentNote(
        id: "note-003",
        content: "Medication reminder confirmed.",
        author: "Jessie Huang",
        createdAt: "2026-04-23T20:30:00-07:00"
      ),
    ],
    lastUpdated: "2026-04-25T09:12:00-07:00"
  )
}
