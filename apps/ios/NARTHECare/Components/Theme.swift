import SwiftUI

/// NARTHECare visual tokens.
///
/// Mirrors the Tailwind palette used by the caregiver dashboard
/// prototype so the iOS app and the future web app read as the same
/// product. When the web app is built, it should import these same
/// hex values from its Tailwind config — do not drift.
///
/// - Accent: `#3B5BDB` (indigo) — primary action + navigation active state.
/// - State: emerald (ok) / amber (warning) / red (error). Matches the
///   prototype's `routine / monitor / critical` badge palette.
/// - Surface: soft gray-50 background, white card, gray-200 border in
///   light mode; near-black background, gray-900 card, gray-800 border
///   in dark mode.
extension Color {
  // MARK: Accent + surfaces
  static let ncAccent = rgb(0x3B, 0x5B, 0xDB)
  static let ncBackground = Color(
    light: Color(white: 0.98),
    dark: Color(white: 0.05))
  static let ncCard = Color(
    light: .white,
    dark: Color(white: 0.09))
  static let ncBorder = Color(
    light: Color(white: 0.88),
    dark: Color(white: 0.18))
  static let ncChipBg = Color(
    light: Color(white: 0.94),
    dark: Color(white: 0.18))
  static let ncChipFg = Color.primary.opacity(0.8)

  // MARK: State colors
  static let ncOk = rgb(0x10, 0xB9, 0x81)
  static let ncOkFg = rgb(0x05, 0x7A, 0x55)
  static let ncWarning = rgb(0xF5, 0x9E, 0x0B)
  static let ncWarningFg = rgb(0xB4, 0x53, 0x09)
  static let ncWarningBg = rgb(0xFE, 0xF3, 0xC7, opacity: 0.6)
  static let ncError = rgb(0xEF, 0x44, 0x44)
  static let ncErrorFg = rgb(0x99, 0x1B, 0x1B)

  // MARK: Helpers

  /// 8-bit RGB (0x00–0xFF) to `Color`, preserving the design-system
  /// hex values from the prototype without per-call Double casting.
  fileprivate static func rgb(
    _ r: Int, _ g: Int, _ b: Int, opacity: Double = 1
  ) -> Color {
    Color(
      red: Double(r) / 255.0,
      green: Double(g) / 255.0,
      blue: Double(b) / 255.0,
      opacity: opacity
    )
  }

  /// Pick a different color for light vs. dark color schemes.
  fileprivate init(light: Color, dark: Color) {
    #if canImport(UIKit)
      self = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
          ? UIColor(dark) : UIColor(light)
      })
    #else
      self = light
    #endif
  }
}
