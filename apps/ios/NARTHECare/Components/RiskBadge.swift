import SwiftUI

/// Pill badge for the profile's `riskLevel`.
///
/// Mirrors the prototype's status pill (colored dot + label in a soft
/// tinted capsule). Drives color from `RiskLevel` display helpers so
/// the rule "every risk level has exactly one color" lives in one
/// place and is easy to QA.
struct RiskBadge: View {
  let level: RiskLevel

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(level.dotColor)
        .frame(width: 8, height: 8)
      Text(level.displayName)
        .font(.caption.weight(.semibold))
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(level.bgColor)
    .foregroundStyle(level.textColor)
    .clipShape(Capsule())
  }
}

// MARK: - RiskLevel display tokens

extension RiskLevel {
  var displayName: String {
    switch self {
    case .low: return "Low"
    case .moderate: return "Moderate"
    case .high: return "High"
    }
  }

  var dotColor: Color {
    switch self {
    case .low: return Color.ncOk
    case .moderate: return Color.ncWarning
    case .high: return Color.ncError
    }
  }

  var bgColor: Color {
    switch self {
    case .low: return Color.ncOk.opacity(0.12)
    case .moderate: return Color.ncWarning.opacity(0.12)
    case .high: return Color.ncError.opacity(0.12)
    }
  }

  var textColor: Color {
    switch self {
    case .low: return Color.ncOkFg
    case .moderate: return Color.ncWarningFg
    case .high: return Color.ncErrorFg
    }
  }
}
