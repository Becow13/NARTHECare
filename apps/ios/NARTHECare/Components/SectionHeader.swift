import SwiftUI

/// Section / sub-section title used inside `InfoCard`s.
///
/// Mirrors the prototype's two-tier section typography:
///
/// - `.main` — primary card title (`text-base font-semibold`).
/// - `.sub`  — sub-block title (`text-sm font-semibold`), e.g.
///   "Emergency Contact" inside the Basic Information card.
///
/// Kept intentionally simple (`Text` + modifiers). If a design iteration
/// needs a leading icon we'll add an `init(title:systemImage:)`
/// overload here rather than peppering call sites with `HStack`s.
struct SectionHeader: View {
  enum Level { case main, sub }

  let title: String
  let level: Level

  init(title: String, level: Level = .main) {
    self.title = title
    self.level = level
  }

  var body: some View {
    Text(title)
      .font(level == .main ? .headline : .subheadline.weight(.semibold))
      .foregroundStyle(.primary)
  }
}
