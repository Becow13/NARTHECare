import SwiftUI

/// Care Hub — the caregiver-facing entry page.
///
/// Visually mirrors the web prototype at
/// `Prototype Code/NARTHECare Dashboard Pages Code/app/dashboard/page.tsx`:
///
///  * greeting header with "Care Hub" title and a warm subtitle,
///  * dark navy slogan banner with the `Clear AIs / Full Care /
///    Can't Lose.` wordmark,
///  * two compact stat cards (Active Care Members, Alerts Today),
///  * a Care Member Snapshot — the prototype's 9-column grid, re-laid
///    out as a vertical list of cards so it reads well on iPhone.
///
/// The page is intentionally read-only and taps a shared `InfoCard`
/// surface from `PatientProfileView.swift` so the iOS app feels like
/// one product rather than two.
struct CareHubView: View {
  /// Injected so previews and (eventually) the real service layer can
  /// swap in different data without touching the view.
  let dashboard: CareHubDashboard

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        PageHeader(caregiverFirstName: dashboard.caregiverFirstName)
        SloganBanner()
        StatCardRow(
          activeCareMembers: dashboard.activeCareMembers,
          alertsToday: dashboard.alertsToday,
          activeAlertsNow: dashboard.activeAlertsNow
        )
        CareMemberSnapshotCard(members: dashboard.members)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .frame(maxWidth: 720)
      .frame(maxWidth: .infinity)
    }
    .background(Color.ncBackground.ignoresSafeArea())
  }
}

// MARK: - Header

private struct PageHeader: View {
  let caregiverFirstName: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Care Hub")
        .font(.title2.bold())
        .foregroundStyle(.primary)
      Text(
        "Hello \(caregiverFirstName)! Welcome to your Care Circle Care Hub."
      )
      .font(.subheadline)
      .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

// MARK: - Slogan banner

/// Decorative banner that carries the NARTHECare wordmark on the web
/// dashboard. Rebuilt natively so the look matches on iOS without
/// shipping an image asset.
private struct SloganBanner: View {
  var body: some View {
    ZStack {
      Color.ncSloganBg

      HStack {
        Rectangle()
          .fill(Color.ncSloganPrimary)
          .frame(width: 5)
        Spacer()
        Rectangle()
          .fill(Color.ncSloganSecondary)
          .frame(width: 5)
      }

      Circle()
        .fill(Color.ncSloganPrimary.opacity(0.3))
        .frame(width: 70, height: 70)
        .offset(x: -120, y: -45)
      Circle()
        .fill(Color.ncSloganSecondary.opacity(0.15))
        .frame(width: 85, height: 85)
        .offset(x: 130, y: 40)

      VStack(spacing: 4) {
        Text("NARTHECARE")
          .font(.system(size: 13, weight: .bold))
          .tracking(3)
          .foregroundStyle(Color.ncSloganText)

        dividerBar

        VStack(spacing: 2) {
          Text("Clear AIs,")
            .foregroundStyle(Color.ncSloganText)
          Text("Full Care,")
            .foregroundStyle(Color.ncSloganSecondary)
          Text("Can't Lose.")
            .foregroundStyle(Color.ncSloganPrimary)
        }
        .font(.system(size: 17, weight: .bold))

        dividerBar

        Text("◆  UNIFIED  ◆  INTELLIGENT  ◆  CAREGIVER FOCUSED")
          .font(.system(size: 9, weight: .semibold))
          .tracking(1)
          .foregroundStyle(Color.ncSloganSecondary)
      }
      .padding(.vertical, 16)
      .padding(.horizontal, 24)
      .frame(maxWidth: .infinity)
    }
    .frame(minHeight: 150)
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }

  private var dividerBar: some View {
    Rectangle()
      .fill(Color.ncSloganPrimary.opacity(0.5))
      .frame(width: 100, height: 2)
  }
}

// MARK: - Stat cards

private struct StatCardRow: View {
  let activeCareMembers: Int
  let alertsToday: Int
  let activeAlertsNow: Int

  var body: some View {
    HStack(spacing: 12) {
      StatCard(
        title: "Active Care Members",
        value: "\(activeCareMembers)",
        systemImage: "person.2.fill",
        subtitle: nil
      )
      StatCard(
        title: "Alerts Today",
        value: "\(alertsToday)",
        systemImage: "exclamationmark.triangle.fill",
        subtitle: activeAlertsNow > 0
          ? "\(activeAlertsNow) active now"
          : nil
      )
    }
  }
}

private struct StatCard: View {
  let title: String
  let value: String
  let systemImage: String
  let subtitle: String?

  var body: some View {
    InfoCard {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text(title.uppercased())
            .font(.caption2.weight(.semibold))
            .tracking(0.5)
            .foregroundStyle(.secondary)
          Text(value)
            .font(.title.bold())
            .foregroundStyle(.primary)
          if let subtitle {
            Text(subtitle)
              .font(.caption2.weight(.medium))
              .foregroundStyle(.secondary)
          }
        }
        Spacer(minLength: 0)
        RoundedRectangle(cornerRadius: 10)
          .fill(Color.ncAccent.opacity(0.12))
          .frame(width: 36, height: 36)
          .overlay(
            Image(systemName: systemImage)
              .font(.system(size: 16, weight: .semibold))
              .foregroundStyle(Color.ncAccent)
          )
      }
    }
  }
}

// MARK: - Care Member Snapshot

private struct CareMemberSnapshotCard: View {
  let members: [CareMemberSnapshot]

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack {
          SectionHeader(title: "Care Member Snapshot")
          Spacer()
          // TODO: navigate to the full Care Members list once that
          // screen exists — mirrors the `View all` link in the web
          // prototype's dashboard.
          Button {} label: {
            HStack(spacing: 2) {
              Text("View all")
              Image(systemName: "chevron.right")
                .font(.caption2)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.ncAccent)
          }
          .buttonStyle(.plain)
        }

        ForEach(members) { member in
          CareMemberRow(member: member)
          if member.id != members.last?.id {
            Divider()
          }
        }
      }
    }
  }
}

private struct CareMemberRow: View {
  let member: CareMemberSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        Circle()
          .fill(member.status.dotColor)
          .frame(width: 10, height: 10)
          .padding(.top, 4)

        avatar

        VStack(alignment: .leading, spacing: 2) {
          Text(member.name)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.primary)
          Text(member.primaryConditions.prefix(2).joined(separator: ", "))
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        Spacer(minLength: 8)

        StatusPill(status: member.status)
      }

      HStack(spacing: 12) {
        MetricPill(
          systemImage: "bell.fill",
          label: "Alerts",
          value: member.activeAlertCount
        )
        MetricPill(
          systemImage: "calendar",
          label: "Appts",
          value: member.upcomingAppointmentCount
        )
        TrendPill(direction: member.trend)

        Spacer(minLength: 0)

        HStack(spacing: 4) {
          Image(systemName: "clock")
          Text(relativeLastSeen(member.lastSeen))
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
      }

      Text(member.aiSummary)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .lineLimit(3)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.vertical, 6)
    .contentShape(Rectangle())
    // TODO: navigate to the member detail screen once it ships —
    // mirrors the prototype's `/seniors/[id]` Link.
  }

  private var avatar: some View {
    Circle()
      .fill(member.status.avatarBg)
      .frame(width: 36, height: 36)
      .overlay(
        Text(initials(from: member.name))
          .font(.caption.bold())
          .foregroundStyle(member.status.avatarFg)
      )
  }
}

// MARK: - Small UI atoms

private struct StatusPill: View {
  let status: CareMemberStatus
  var body: some View {
    Text(status.displayName)
      .font(.caption2.weight(.semibold))
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(status.pillBg)
      .foregroundStyle(status.pillFg)
      .clipShape(Capsule())
  }
}

private struct MetricPill: View {
  let systemImage: String
  let label: String
  let value: Int
  var body: some View {
    HStack(spacing: 4) {
      Image(systemName: systemImage)
        .font(.caption2)
      Text("\(label) \(value)")
        .font(.caption2.weight(.semibold))
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .foregroundStyle(value > 0 ? Color.ncAccent : Color.secondary)
    .background(
      Capsule()
        .fill(value > 0
              ? Color.ncAccent.opacity(0.10)
              : Color.ncBorder.opacity(0.5))
    )
  }
}

private struct TrendPill: View {
  let direction: TrendDirection
  var body: some View {
    Image(systemName: direction.systemImage)
      .font(.caption.weight(.semibold))
      .foregroundStyle(direction.tint)
      .frame(width: 26, height: 22)
      .background(
        Capsule().fill(direction.tint.opacity(0.12))
      )
  }
}

// MARK: - Display helpers

extension CareMemberStatus {
  var displayName: String {
    switch self {
    case .critical: return "Critical"
    case .monitor: return "Monitor"
    case .routine: return "Routine"
    }
  }

  var dotColor: Color {
    switch self {
    case .critical: return Color.ncError
    case .monitor: return Color.ncWarning
    case .routine: return Color.ncOk
    }
  }

  var pillBg: Color {
    switch self {
    case .critical: return Color.ncError.opacity(0.14)
    case .monitor: return Color.ncWarning.opacity(0.14)
    case .routine: return Color.ncOk.opacity(0.14)
    }
  }

  var pillFg: Color {
    switch self {
    case .critical: return Color.ncErrorFg
    case .monitor: return Color.ncWarningFg
    case .routine: return Color.ncOkFg
    }
  }

  var avatarBg: Color {
    switch self {
    case .critical: return Color.ncError.opacity(0.16)
    case .monitor: return Color.ncWarning.opacity(0.18)
    case .routine: return Color.ncOk.opacity(0.18)
    }
  }

  var avatarFg: Color {
    switch self {
    case .critical: return Color.ncErrorFg
    case .monitor: return Color.ncWarningFg
    case .routine: return Color.ncOkFg
    }
  }
}

extension TrendDirection {
  var systemImage: String {
    switch self {
    case .up: return "arrow.up.right"
    case .down: return "arrow.down.right"
    case .flat: return "minus"
    }
  }

  /// Both `up` and `down` use warm colors — for health vitals, "trend"
  /// on the dashboard means "changing, worth a glance", not
  /// good-vs-bad. A flat trend is the calmest state.
  var tint: Color {
    switch self {
    case .up: return Color.ncOk
    case .down: return Color.ncError
    case .flat: return Color.ncWarning
    }
  }
}

// MARK: - Local helpers

private func initials(from name: String) -> String {
  let parts = name
    .split(separator: " ", omittingEmptySubsequences: true)
    .prefix(2)
  if parts.isEmpty { return String(name.prefix(2)).uppercased() }
  return parts.map { String($0.first ?? Character(" ")) }.joined().uppercased()
}

private let careHubRelativeFormatter: RelativeDateTimeFormatter = {
  let f = RelativeDateTimeFormatter()
  f.unitsStyle = .abbreviated
  return f
}()

private func relativeLastSeen(_ date: Date) -> String {
  careHubRelativeFormatter.localizedString(for: date, relativeTo: Date())
}

// MARK: - Slogan palette

/// Tokens specific to the slogan banner. Kept local because no other
/// surface in the app uses this dark-mode-only palette.
private extension Color {
  static let ncSloganBg = Color(red: 0x0D / 255, green: 0x0F / 255, blue: 0x2B / 255)
  static let ncSloganPrimary = Color(red: 0x3B / 255, green: 0x5B / 255, blue: 0xDB / 255)
  static let ncSloganSecondary = Color(red: 0x91 / 255, green: 0xA7 / 255, blue: 0xFF / 255)
  static let ncSloganText = Color(red: 0xEE / 255, green: 0xF0 / 255, blue: 0xFF / 255)
}

// MARK: - Previews

#Preview("Care Hub") {
  NavigationStack {
    CareHubView(dashboard: CareHubMock.sample)
      .navigationTitle("NARTHECare")
      #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
      #endif
  }
}
