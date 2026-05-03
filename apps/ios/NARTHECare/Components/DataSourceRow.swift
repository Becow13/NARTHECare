import SwiftUI

/// Single row inside the Connected Data Sources card.
///
/// Mirrors the prototype's `data-sources-list.tsx`: icon on the left,
/// integration name + last-sync / error line, status pill on the right.
/// The icon uses SF Symbols (prototype uses `lucide-react`); the glyph
/// mapping lives on `DataSourceType.iconName` so the rule "each
/// integration has exactly one icon" is enforced in one place.
struct DataSourceRow: View {
  let source: DataSource

  var body: some View {
    HStack(alignment: .center, spacing: 12) {
      Image(systemName: source.type.iconName)
        .font(.title3)
        .foregroundStyle(Color.ncAccent)
        .frame(width: 28, height: 28)

      VStack(alignment: .leading, spacing: 2) {
        Text(source.type.displayName)
          .font(.subheadline.weight(.semibold))

        Group {
          if let synced = source.lastSyncedAt {
            Text("Last synced \(RelativeTime.formatLocalizedDateTime(synced))")
              .foregroundStyle(.secondary)
          } else if let err = source.errorMessage {
            Text(err)
              .foregroundStyle(Color.ncError)
          } else {
            Text("Not connected")
              .foregroundStyle(.secondary)
          }
        }
        .font(.caption)
      }

      Spacer(minLength: 0)

      StatusBadge(text: source.status.displayName, tone: source.status.tone)
    }
    .padding(.vertical, 4)
  }
}

// MARK: - DataSourceType display tokens

extension DataSourceType {
  var displayName: String {
    switch self {
    case .appleHealth: return "Apple Health"
    case .epic: return "MyChart / Epic"
    case .fitbit: return "Fitbit"
    case .garmin: return "Garmin"
    case .ring: return "Ring"
    case .fallDetection: return "Fall Detection"
    }
  }

  var iconName: String {
    switch self {
    case .appleHealth: return "heart.text.square"
    case .epic: return "cross.case"
    case .fitbit, .garmin: return "applewatch"
    case .ring: return "circle.hexagongrid"
    case .fallDetection: return "figure.fall"
    }
  }
}

// MARK: - Server timestamp formatting

/// Parse and present backend ISO timestamps for in-app surfaces.
///
/// `formatLocalizedDateTime` shows the instant in **the device's
/// calendar locale and local time zone** (Settings → Language &
/// Region + Time Zone) so caregivers never see unwieldy raw UTC
/// strings (`…Z`).
///
/// Falls back to the raw value when the input is not a parseable ISO
/// instant — some fields use a plain `YYYY-MM-DD` for `baseline.
/// lastUpdated`, and we render that as-is.
enum RelativeTime {
  private static let relativeFormatter: RelativeDateTimeFormatter = {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f
  }()

  private static func localDateTimeFormatter() -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale.current
    f.timeZone = TimeZone.current
    f.dateStyle = .medium
    f.timeStyle = .short
    return f
  }

  /// Best-effort ISO-8601 string → instant. Supports fractional seconds.
  static func parseServerIso8601(_ iso: String) -> Date? {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = isoFormatter.date(from: iso) { return date }
    isoFormatter.formatOptions = [.withInternetDateTime]
    return isoFormatter.date(from: iso)
  }

  /// ISO-8601 → "May 3, 2026 at 7:54 PM"-style copy in **local TZ**.
  static func formatLocalizedDateTime(_ iso: String) -> String {
    guard let date = parseServerIso8601(iso) else { return iso }
    return localDateTimeFormatter().string(from: date)
  }

  /// ISO-8601 → abbreviated relative phrase ("3 min ago") in user's locale.
  static func format(_ iso: String) -> String {
    guard let date = parseServerIso8601(iso) else { return iso }
    return relativeFormatter.localizedString(for: date, relativeTo: Date())
  }
}
