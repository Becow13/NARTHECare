import SwiftUI

/// Generic tone pill used for data-source status, care-team permission,
/// and any future small-status badge.
///
/// Tones map to the prototype's state palette:
///
/// - `.good`    — emerald. "Connected", "Full access".
/// - `.neutral` — gray. "Not connected", "View only".
/// - `.warning` — amber. reserved for future pending / stale states.
/// - `.bad`     — red. "Error".
///
/// Prefer this over stacking custom `Text` + capsule combinations at
/// call sites so every tone is QA'd once.
struct StatusBadge: View {
  enum Tone { case good, neutral, warning, bad }

  let text: String
  let tone: Tone

  var body: some View {
    Text(text)
      .font(.caption2.weight(.semibold))
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(tone.bg)
      .foregroundStyle(tone.fg)
      .clipShape(Capsule())
  }
}

// MARK: - Tone palette

extension StatusBadge.Tone {
  var bg: Color {
    switch self {
    case .good: return Color.ncOk.opacity(0.14)
    case .neutral: return Color.ncBorder.opacity(0.6)
    case .warning: return Color.ncWarning.opacity(0.14)
    case .bad: return Color.ncError.opacity(0.14)
    }
  }

  var fg: Color {
    switch self {
    case .good: return Color.ncOkFg
    case .neutral: return Color.primary.opacity(0.7)
    case .warning: return Color.ncWarningFg
    case .bad: return Color.ncErrorFg
    }
  }
}

// MARK: - DataSourceStatus display tokens

extension DataSourceStatus {
  var displayName: String {
    switch self {
    case .connected: return "Connected"
    case .notConnected: return "Not connected"
    case .error: return "Error"
    }
  }

  var tone: StatusBadge.Tone {
    switch self {
    case .connected: return .good
    case .notConnected: return .neutral
    case .error: return .bad
    }
  }
}

// MARK: - CareTeamPermission display tokens

extension CareTeamPermission {
  var displayName: String {
    switch self {
    case .fullAccess: return "Full access"
    case .limitedAccess: return "Limited access"
    case .clinicalAccess: return "Clinical access"
    case .viewOnly: return "View only"
    }
  }

  var tone: StatusBadge.Tone {
    switch self {
    case .fullAccess, .clinicalAccess: return .good
    case .limitedAccess, .viewOnly: return .neutral
    }
  }
}

// MARK: - CareTeamRole display tokens

extension CareTeamRole {
  var displayName: String {
    switch self {
    case .primaryCaregiver: return "Primary caregiver"
    case .familyMember: return "Family member"
    case .clinician: return "Clinician"
    case .careCoordinator: return "Care coordinator"
    }
  }
}
