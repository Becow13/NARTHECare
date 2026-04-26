import Foundation
import SwiftUI

/// Loading state for `PatientProfileView`.
///
/// The view switches on this to render a skeleton, the real profile,
/// or an empty-state with a retry button. `.error` carries an optional
/// fallback profile so the UI can keep rendering the shape when the
/// network fetch fails — important in a calm healthcare app where a
/// blank screen creates anxiety.
enum PatientProfileState: Equatable {
  case idle
  case loading
  case loaded(CareRecipientProfile)
  case error(message: String, fallback: CareRecipientProfile?)
}

/// View-owned state holder for the patient profile screen.
///
/// Follows MVVM: the view renders, the view model owns state + async
/// work + service dependencies. `CareRecipientProfileService` is
/// injectable so previews, tests, and live builds can share the same
/// view model.
///
/// Healthcare rules: the loaded profile is PHI. Never log the
/// payload — log only `error.localizedDescription`.
@MainActor
final class PatientProfileViewModel: ObservableObject {
  @Published private(set) var state: PatientProfileState = .idle

  private let recipientId: String
  private let service: CareRecipientProfileService
  private let fallback: CareRecipientProfile

  /// `nonisolated` so callers outside the main actor (e.g. a SwiftUI
  /// view's default-argument construction) can instantiate the view
  /// model without a hop. No field the init touches is actor-isolated.
  nonisolated init(
    recipientId: String = CareRecipientProfileMock.id,
    service: CareRecipientProfileService = MockCareRecipientProfileService(),
    fallback: CareRecipientProfile = CareRecipientProfileMock.margaretChen
  ) {
    self.recipientId = recipientId
    self.service = service
    self.fallback = fallback
  }

  /// Populate `state` with the mock synchronously — used by SwiftUI
  /// previews so the preview canvas does not need to await an async
  /// task before rendering.
  func loadMock() {
    state = .loaded(fallback)
  }

  /// Fetch the profile from the service.
  ///
  /// On failure the fallback is attached to `.error` so the view can
  /// render the shape (behind a warning banner) instead of going
  /// blank. Only `error.localizedDescription` is surfaced — never the
  /// profile payload.
  func load() async {
    state = .loading
    do {
      let profile = try await service.fetchProfile(id: recipientId)
      state = .loaded(profile)
    } catch {
      // TODO(audit): log a sanitized audit record here once audit
      // logging is wired up. Never include the profile payload.
      state = .error(
        message: error.localizedDescription,
        fallback: fallback
      )
    }
  }
}
