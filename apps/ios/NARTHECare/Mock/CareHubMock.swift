import Foundation

/// Lightweight Swift mirror of the prototype dashboard's snapshot data.
///
/// The web prototype's full mock data lives in
/// `Prototype Code/NARTHECare Dashboard Pages Code/lib/mock-data.ts`, but
/// the iOS Care Hub entry page only needs the handful of fields that are
/// actually rendered on the home screen: identifying info, status,
/// counts of open alerts / upcoming appointments, a heart-rate trend
/// direction, and the latest AI summary blurb. Anything richer (full
/// vitals history, per-alert details) belongs to feature-specific
/// screens loaded on demand.
///
/// Follows the workspace healthcare rules: this mock contains only
/// placeholder demo content, never real patient data. When the backend
/// endpoint for the Care Hub ships, replace `CareHubMock.sample` with a
/// real `CareHubService` + DAO fetch and delete this file.

// MARK: - Enums

/// Per-member triage status. Matches the prototype's `SeniorStatus` in
/// `mock-data.ts` so the visual language (dot + badge color) is
/// interchangeable between iOS and the web dashboard.
enum CareMemberStatus: String, Codable, Sendable, CaseIterable {
  case critical
  case monitor
  case routine
}

/// Caregiver-level roll-up used by the overall status banner in the web
/// prototype. Reserved for future use on iOS (e.g. an accent strip at the
/// top of the Care Hub) — kept here now so the data shape matches the
/// reference.
enum OverallStatus: String, Codable, Sendable, CaseIterable {
  case allStable = "all_stable"
  case needsAttention = "needs_attention"
  case critical
}

/// Three-way trend used by the tiny chevron next to each care member.
/// The prototype derives this from the last two heart-rate readings;
/// we pre-compute it at the mock layer so the view stays dumb.
enum TrendDirection: String, Codable, Sendable {
  case up
  case down
  case flat
}

// MARK: - Snapshot types

/// One row in the Care Member Snapshot list.
///
/// `activeAlertCount` / `upcomingAppointmentCount` are pre-aggregated on
/// purpose — the entry page should never have to enumerate raw alerts
/// or appointments to render a badge.
struct CareMemberSnapshot: Identifiable, Sendable, Hashable {
  let id: String
  let name: String
  let primaryConditions: [String]
  let status: CareMemberStatus
  let lastSeen: Date
  let activeAlertCount: Int
  let upcomingAppointmentCount: Int
  let trend: TrendDirection
  let aiSummary: String
}

/// Top-level payload the Care Hub entry page renders against.
struct CareHubDashboard: Sendable, Hashable {
  let caregiverFirstName: String
  let activeCareMembers: Int
  let alertsToday: Int
  let activeAlertsNow: Int
  let overallStatus: OverallStatus
  let members: [CareMemberSnapshot]
}

// MARK: - Mock instance

/// Static sample used by SwiftUI previews and the current entry page.
///
/// Kept in lockstep with the three seniors in `mock-data.ts`
/// (Eleanor Yang, Robert Chen, Margaret Sullivan) so designers can
/// compare iOS and web side-by-side. When the real backend ships the
/// Care Hub endpoint, delete `sample` and load from the API instead.
enum CareHubMock {
  static let sample: CareHubDashboard = CareHubDashboard(
    caregiverFirstName: "Becca",
    activeCareMembers: 3,
    alertsToday: 12,
    activeAlertsNow: 9,
    overallStatus: .needsAttention,
    members: [
      CareMemberSnapshot(
        id: "senior-001",
        name: "Eleanor Yang",
        primaryConditions: ["Type 2 Diabetes", "Early-stage Dementia"],
        status: .monitor,
        lastSeen: Date(timeIntervalSinceNow: -60 * 47),
        activeAlertCount: 3,
        upcomingAppointmentCount: 1,
        trend: .up,
        aiSummary:
          "Eleanor had a generally stable night with some sleep fragmentation. Morning glucose of 142 mg/dL is within her acceptable range. Her 2:00 PM metformin dose was missed for the second time this week."
      ),
      CareMemberSnapshot(
        id: "senior-002",
        name: "Robert Chen",
        primaryConditions: ["Congestive Heart Failure", "Hypertension"],
        status: .critical,
        lastSeen: Date(timeIntervalSinceNow: -60 * 180),
        activeAlertCount: 3,
        upcomingAppointmentCount: 1,
        trend: .up,
        aiSummary:
          "Robert's morning BP of 178/94 is his third consecutive above-threshold reading, and his overnight resting HR is elevated 16 bpm above baseline. His UCSF cardiologist should be contacted today."
      ),
      CareMemberSnapshot(
        id: "senior-003",
        name: "Margaret Sullivan",
        primaryConditions: ["Mild Cognitive Impairment", "Osteoporosis"],
        status: .routine,
        lastSeen: Date(timeIntervalSinceNow: -60 * 15),
        activeAlertCount: 3,
        upcomingAppointmentCount: 2,
        trend: .down,
        aiSummary:
          "Margaret slept 5.4 hours — her fifth consecutive night below her 6.8-hour baseline. Vitals are otherwise stable. Flag the sleep pattern at Thursday's appointment with Dr. Stein."
      ),
    ]
  )
}
