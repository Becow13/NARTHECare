import SwiftUI

/// Standard card surface used by every section of the profile.
///
/// Mirrors the `.border-border .rounded-lg` card from the caregiver
/// dashboard prototype: soft border, subtle corner radius, consistent
/// internal padding. Holding this in one place means a future global
/// tweak (e.g. elevating cards with a shadow on iPad) ships everywhere
/// at once.
struct InfoCard<Content: View>: View {
  private let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    content
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.ncCard)
      .overlay(
        RoundedRectangle(cornerRadius: 14)
          .strokeBorder(Color.ncBorder, lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: 14))
  }
}
