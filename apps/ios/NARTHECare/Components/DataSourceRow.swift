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
            Text("Last synced \(RelativeTime.format(synced))")
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

// MARK: - Relative time formatting

/// Best-effort ISO-8601 → "3 min ago" formatter.
///
/// Falls back to the raw value when the input is not a datetime — the
/// backend sends a plain `YYYY-MM-DD` for `baseline.lastUpdated`, and
/// we render that as-is rather than mis-parsing it as midnight UTC.
enum RelativeTime {
  private static let formatter: RelativeDateTimeFormatter = {
    let f = RelativeDateTimeFormatter()
    f.unitsStyle = .abbreviated
    return f
  }()

  static func format(_ iso: String) -> String {
    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = isoFormatter.date(from: iso) {
      return formatter.localizedString(for: date, relativeTo: Date())
    }
    isoFormatter.formatOptions = [.withInternetDateTime]
    if let date = isoFormatter.date(from: iso) {
      return formatter.localizedString(for: date, relativeTo: Date())
    }
    return iso
  }
}
