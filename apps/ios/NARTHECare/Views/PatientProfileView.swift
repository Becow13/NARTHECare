import SwiftUI

/// Patient / Care Recipient Profile screen.
///
/// Scroll-driven list of `InfoCard`s — one per profile section
/// (Header, Basic Info, Care Team, Health Background, Connected Data
/// Sources, Baseline Summary, Recent Notes, Actions). Adaptive for
/// iPhone and iPad: the column hugs a readable width on large screens
/// and every section stacks vertically.
///
/// Visual language follows the caregiver dashboard prototype (calm
/// healthcare palette, `#3B5BDB` accent, soft card borders). The view
/// itself owns no data — everything comes from
/// `PatientProfileViewModel`, so previews, offline demos, and real
/// API-backed builds share one layout.
struct PatientProfileView: View {
  @StateObject private var viewModel: PatientProfileViewModel

  /// `@MainActor` so the view-model's main-actor init can run from a
  /// default argument without a hop.
  @MainActor
  init(viewModel: PatientProfileViewModel = PatientProfileViewModel()) {
    _viewModel = StateObject(wrappedValue: viewModel)
  }

  var body: some View {
    ScrollView {
      content
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .frame(maxWidth: 720)
        .frame(maxWidth: .infinity)
    }
    .background(Color.ncBackground.ignoresSafeArea())
    .navigationTitle("Patient Profile")
    #if os(iOS)
      .navigationBarTitleDisplayMode(.inline)
    #endif
    .task {
      if case .idle = viewModel.state {
        await viewModel.load()
      }
    }
  }

  // MARK: - Loading state switch

  @ViewBuilder
  private var content: some View {
    switch viewModel.state {
    case .idle, .loading:
      LoadingView()
    case .loaded(let profile):
      ProfileBody(profile: profile, errorBanner: nil)
    case .error(let message, let fallback):
      if let fallback {
        ProfileBody(profile: fallback, errorBanner: message)
      } else {
        ErrorState(message: message) {
          Task { await viewModel.load() }
        }
      }
    }
  }
}

// MARK: - Profile body

/// Renders every section of the profile once data is available.
///
/// Kept separate from `PatientProfileView` so the body can be
/// previewed directly with a literal `CareRecipientProfile` value.
private struct ProfileBody: View {
  let profile: CareRecipientProfile

  /// When non-nil, a soft warning banner explains that the visible
  /// data is the local fallback (API fetch failed).
  let errorBanner: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      if let errorBanner {
        FallbackBanner(message: errorBanner)
      }

      ProfileHeaderCard(profile: profile)
      BasicInformationCard(profile: profile)
      CareTeamCard(careTeam: profile.careTeam)
      HealthBackgroundCard(health: profile.healthBackground)
      DataSourcesCard(sources: profile.dataSources)
      BaselineCard(baseline: profile.baseline)
      RecentNotesCard(notes: profile.recentNotes)
      ActionButtons()
    }
  }
}

// MARK: - Sections

/// Section 1 — Header. Avatar, name, age, primary conditions, risk
/// badge, last updated, primary CTA.
private struct ProfileHeaderCard: View {
  let profile: CareRecipientProfile

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top, spacing: 12) {
          Avatar(initials: profile.name.ncInitials(max: 2),
                 risk: profile.riskLevel)

          VStack(alignment: .leading, spacing: 6) {
            Text(profile.name)
              .font(.title2.bold())
              .foregroundStyle(.primary)
            Text("Age \(profile.age)")
              .font(.subheadline)
              .foregroundStyle(.secondary)
          }

          Spacer(minLength: 0)
          RiskBadge(level: profile.riskLevel)
        }

        if !profile.primaryConditions.isEmpty {
          ConditionChipRow(conditions: profile.primaryConditions)
        }

        HStack(spacing: 6) {
          Image(systemName: "clock")
          Text("Last updated \(RelativeTime.format(profile.lastUpdated))")
        }
        .font(.footnote)
        .foregroundStyle(.secondary)

        Button {
          // TODO: navigate to edit-profile screen.
        } label: {
          Label("Edit profile", systemImage: "pencil")
            .font(.footnote.weight(.semibold))
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.ncAccent)
        .controlSize(.regular)
      }
    }
  }
}

/// Section 2 — Basic Information. Demographics + emergency contact.
private struct BasicInformationCard: View {
  let profile: CareRecipientProfile

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Basic Information")

        LabeledRow(label: "Full name", value: profile.name)
        LabeledRow(label: "Date of birth", value: profile.dateOfBirth)
        if let gender = profile.gender {
          LabeledRow(label: "Gender", value: gender)
        }
        if let phone = profile.contact.phone {
          LabeledRow(label: "Phone", value: phone)
        }
        if let address = profile.contact.address {
          LabeledRow(label: "Address", value: address)
        }

        Divider().padding(.vertical, 4)

        SectionHeader(title: "Emergency Contact", level: .sub)
        LabeledRow(label: "Name", value: profile.emergencyContact.name)
        LabeledRow(label: "Phone", value: profile.emergencyContact.phone)
        if let relationship = profile.emergencyContact.relationship {
          LabeledRow(label: "Relationship", value: relationship)
        }
      }
    }
  }
}

/// Section 3 — Care Team. Primary caregiver + member list with
/// permission badges.
private struct CareTeamCard: View {
  let careTeam: CareTeam

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Care Team")
        LabeledRow(label: "Primary caregiver", value: careTeam.primaryCaregiver)

        ForEach(careTeam.members) { member in
          HStack(alignment: .top, spacing: 12) {
            Circle()
              .fill(Color.ncAccent.opacity(0.12))
              .frame(width: 36, height: 36)
              .overlay(
                Text(member.name.ncInitials(max: 2))
                  .font(.caption.bold())
                  .foregroundStyle(Color.ncAccent)
              )

            VStack(alignment: .leading, spacing: 2) {
              Text(member.name)
                .font(.subheadline.weight(.semibold))
              Text(member.role.displayName)
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
            StatusBadge(text: member.permission.displayName,
                        tone: member.permission.tone)
          }
        }
      }
    }
  }
}

/// Section 4 — Health Background. Conditions, allergies, medications,
/// mobility status, fall risk notes.
private struct HealthBackgroundCard: View {
  let health: HealthBackground

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Health Background")

        SubSection(title: "Conditions") {
          BulletList(items: health.conditions)
        }
        SubSection(title: "Allergies") {
          BulletList(items: health.allergies)
        }
        SubSection(title: "Current medications") {
          BulletList(items: health.medications)
        }
        if let mobility = health.mobilityStatus {
          LabeledRow(label: "Mobility", value: mobility)
        }
        if let fall = health.fallRiskNotes {
          LabeledRow(label: "Fall risk", value: fall)
        }
      }
    }
  }
}

/// Section 5 — Connected Data Sources. One `DataSourceRow` per
/// integration family.
private struct DataSourcesCard: View {
  let sources: [DataSource]

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Connected Data Sources")
        ForEach(sources) { source in
          DataSourceRow(source: source)
        }
      }
    }
  }
}

/// Section 6 — Baseline Summary. Normal ranges + last calibration date.
private struct BaselineCard: View {
  let baseline: Baseline

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Baseline Summary")

        if let steps = baseline.steps {
          LabeledRow(label: "Normal daily steps",
                     value: formatIntRange(steps))
        }
        if let sleep = baseline.sleepHours {
          LabeledRow(label: "Normal sleep range",
                     value: "\(formatHalf(sleep.min))–\(formatHalf(sleep.max)) hrs")
        }
        if let hr = baseline.restingHeartRate {
          LabeledRow(label: "Resting heart rate",
                     value: "\(formatIntRange(hr)) bpm")
        }
        if let bp = baseline.bloodPressure {
          LabeledRow(label: "Blood pressure baseline",
                     value: "\(bp) mmHg")
        }
        if let updated = baseline.lastUpdated {
          LabeledRow(label: "Last calibration", value: updated)
        }
      }
    }
  }
}

/// Section 7 — Recent Notes. Caregiver / clinician notes (PHI).
private struct RecentNotesCard: View {
  let notes: [RecentNote]

  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Recent Notes")

        if notes.isEmpty {
          Text("No notes recorded.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        } else {
          ForEach(notes) { note in
            VStack(alignment: .leading, spacing: 4) {
              Text(note.content)
                .font(.subheadline)
              HStack(spacing: 8) {
                Text(note.author)
                  .font(.caption.weight(.medium))
                Text("·")
                  .font(.caption)
                  .foregroundStyle(.secondary)
                Text(RelativeTime.format(note.createdAt))
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
            }
            .padding(.vertical, 4)
          }
        }
      }
    }
  }
}

/// Section 8 — Action Buttons. Four bordered CTAs arranged in a 2×2
/// grid so they reflow comfortably on both iPhone and iPad.
private struct ActionButtons: View {
  var body: some View {
    InfoCard {
      VStack(alignment: .leading, spacing: 12) {
        SectionHeader(title: "Actions")
        Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 12) {
          GridRow {
            ActionButton(label: "Edit profile", systemImage: "pencil")
            ActionButton(label: "Add note", systemImage: "note.text.badge.plus")
          }
          GridRow {
            ActionButton(label: "Connect data source",
                         systemImage: "link.badge.plus")
            ActionButton(label: "View dashboard",
                         systemImage: "square.grid.2x2")
          }
        }
      }
    }
  }
}

// MARK: - Small view helpers (private to this file)

/// Avatar used in the profile header. Rounded-square with initials
/// tinted by risk level — mirrors the prototype's avatar treatment.
private struct Avatar: View {
  let initials: String
  let risk: RiskLevel

  var body: some View {
    RoundedRectangle(cornerRadius: 18)
      .fill(risk.bgColor)
      .frame(width: 64, height: 64)
      .overlay(
        Text(initials)
          .font(.title3.bold())
          .foregroundStyle(risk.textColor)
      )
  }
}

/// Horizontal scroll of condition chips in the header. Scroll-capable
/// so a patient with many conditions does not force the layout wider
/// than the phone.
private struct ConditionChipRow: View {
  let conditions: [String]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(conditions, id: \.self) { condition in
          Text(condition)
            .font(.caption.weight(.medium))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Color.ncChipBg)
            .foregroundStyle(Color.ncChipFg)
            .clipShape(Capsule())
        }
      }
    }
  }
}

/// Two-column label + value row used inside sections. Label column has
/// a fixed width so stacked rows visually align.
private struct LabeledRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Text(label)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .frame(width: 140, alignment: .leading)
      Text(value)
        .font(.subheadline)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/// Uppercased sub-section title + arbitrary content below. Used inside
/// Health Background for "Conditions / Allergies / Current medications".
private struct SubSection<Content: View>: View {
  let title: String
  let content: Content

  init(title: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .textCase(.uppercase)
      content
    }
  }
}

/// Simple bullet list. Renders a single "—" line when empty so the
/// section never collapses silently (a blank "Allergies" would read
/// as "no data loaded" rather than "no known allergies").
private struct BulletList: View {
  let items: [String]

  var body: some View {
    if items.isEmpty {
      Text("—")
        .font(.subheadline)
        .foregroundStyle(.secondary)
    } else {
      VStack(alignment: .leading, spacing: 4) {
        ForEach(items, id: \.self) { item in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle().fill(Color.ncAccent).frame(width: 4, height: 4)
            Text(item).font(.subheadline)
          }
        }
      }
    }
  }
}

/// Bordered pill button used in the Actions card.
private struct ActionButton: View {
  let label: String
  let systemImage: String

  var body: some View {
    Button {
      // TODO: wire to concrete actions (edit, add note, connect,
      // dashboard). Each one will navigate to its own screen or
      // present a sheet — all still TODO.
    } label: {
      Label(label, systemImage: systemImage)
        .font(.footnote.weight(.semibold))
        .frame(maxWidth: .infinity, minHeight: 36)
    }
    .buttonStyle(.bordered)
    .controlSize(.regular)
    .tint(Color.ncAccent)
  }
}

/// Soft warning banner shown above the profile when the live fetch
/// failed and we are rendering the local fallback.
private struct FallbackBanner: View {
  let message: String

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "exclamationmark.triangle.fill")
        .foregroundStyle(Color.ncWarning)
      VStack(alignment: .leading, spacing: 2) {
        Text("Showing locally cached profile")
          .font(.footnote.weight(.semibold))
        Text(message)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer()
    }
    .padding(12)
    .background(Color.ncWarningBg)
    .overlay(
      RoundedRectangle(cornerRadius: 10)
        .strokeBorder(Color.ncWarning.opacity(0.4), lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: 10))
  }
}

/// Full-screen empty-state when the fetch failed and there is no
/// fallback to render (e.g. when we later drop the mock).
private struct ErrorState: View {
  let message: String
  let onRetry: () -> Void

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: "wifi.exclamationmark")
        .font(.largeTitle)
        .foregroundStyle(.secondary)
      Text("Unable to load profile")
        .font(.headline)
      Text(message)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      Button("Retry", action: onRetry)
        .buttonStyle(.borderedProminent)
        .tint(Color.ncAccent)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 48)
  }
}

/// Centered progress spinner shown while the profile is loading.
private struct LoadingView: View {
  var body: some View {
    VStack(spacing: 16) {
      ProgressView()
      Text("Loading patient profile…")
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 64)
  }
}

// MARK: - Number / string formatting helpers

private func formatIntRange(_ r: BaselineRange) -> String {
  let lo = Int(r.min.rounded())
  let hi = Int(r.max.rounded())
  return "\(lo)–\(hi)"
}

/// Round to the nearest half (0, 0.5, 1, 1.5, …) and format as an int
/// when the fractional part is zero. Used for the sleep-hours range
/// display so "6.5" stays "6.5" and "8.0" shows as "8".
private func formatHalf(_ value: Double) -> String {
  let rounded = (value * 2).rounded() / 2
  return rounded.truncatingRemainder(dividingBy: 1) == 0
    ? String(Int(rounded))
    : String(format: "%.1f", rounded)
}

// MARK: - Name helpers

private extension String {
  /// Up to `max` uppercase initials from this name. Falls back to the
  /// first `max` characters when the string has no spaces (e.g. mock
  /// data that omits a last name).
  ///
  /// Namespaced (`ncInitials`) to avoid colliding with future extensions
  /// that might add `initials()` to `String` app-wide.
  func ncInitials(max: Int) -> String {
    let parts = self
      .split(separator: " ", omittingEmptySubsequences: true)
      .prefix(max)
    if parts.isEmpty {
      return String(self.prefix(max)).uppercased()
    }
    return parts.map { String($0.first ?? Character(" ")) }.joined().uppercased()
  }
}

// MARK: - Previews

#Preview("Loaded") {
  NavigationStack {
    PatientProfileView(
      viewModel: {
        let vm = PatientProfileViewModel()
        vm.loadMock()
        return vm
      }()
    )
  }
}

#Preview("Error with fallback") {
  NavigationStack {
    PatientProfileView(
      viewModel: {
        /// Forces the error branch so the banner layout can be
        /// visually checked without hitting a real network.
        struct FailingService: CareRecipientProfileService {
          func fetchProfile(id: String) async throws -> CareRecipientProfile {
            throw CareRecipientProfileServiceError.transport("Preview-only simulated failure")
          }
        }
        let vm = PatientProfileViewModel(service: FailingService())
        Task { await vm.load() }
        return vm
      }()
    )
  }
}
