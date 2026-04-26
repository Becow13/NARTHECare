import SwiftUI

/// The login screen shown to caregivers who have no active NARTHECare session.
///
/// Presents a single "Sign In" action that opens the Cognito Hosted UI via
/// `AuthSession.signIn()`. No credentials are collected or displayed here —
/// all authentication happens inside the Cognito-managed browser session.
///
/// Visual language mirrors the Care Hub banner palette so the transition
/// from login to the main app feels cohesive.
struct LoginView: View {
  @EnvironmentObject private var authSession: AuthSession

  var body: some View {
    ZStack {
      Color.ncBackground.ignoresSafeArea()

      ScrollView {
        VStack(spacing: 0) {
          brandBanner

          VStack(spacing: 28) {
            welcomeSection
            signInCard
            disclaimerText
          }
          .padding(.horizontal, 24)
          .padding(.top, 36)
          .padding(.bottom, 48)
        }
        .frame(maxWidth: 480)
        .frame(maxWidth: .infinity)
      }
    }
  }

  // MARK: - Brand banner

  private var brandBanner: some View {
    ZStack {
      loginBannerBackground

      VStack(spacing: 8) {
        Text("NARTHECARE")
          .font(.system(size: 15, weight: .bold))
          .tracking(4)
          .foregroundStyle(Color.loginBannerTitle)

        Rectangle()
          .fill(Color.loginBannerAccent.opacity(0.55))
          .frame(width: 72, height: 2)

        Text("Caregiver Health Intelligence")
          .font(.system(size: 12, weight: .medium))
          .tracking(0.4)
          .foregroundStyle(Color.loginBannerSubtitle)
      }
      .padding(.vertical, 32)
    }
    .frame(maxWidth: .infinity)
    .frame(height: 120)
  }

  private var loginBannerBackground: some View {
    ZStack {
      Color.loginBannerBg

      Circle()
        .fill(Color.loginBannerAccent.opacity(0.22))
        .frame(width: 110, height: 110)
        .offset(x: -140, y: -28)

      Circle()
        .fill(Color.loginBannerSubtitle.opacity(0.10))
        .frame(width: 130, height: 130)
        .offset(x: 145, y: 38)
    }
  }

  // MARK: - Welcome

  private var welcomeSection: some View {
    VStack(spacing: 10) {
      Image(systemName: "heart.text.clipboard.fill")
        .font(.system(size: 40))
        .foregroundStyle(Color.ncAccent)

      Text("Welcome Back")
        .font(.title2.bold())
        .foregroundStyle(.primary)

      Text("Sign in to monitor your care circle and stay connected to the people who matter.")
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
    }
  }

  // MARK: - Sign-in card

  private var signInCard: some View {
    VStack(spacing: 14) {
      if let message = authSession.errorMessage {
        errorBanner(message)
      }

      signInButton
    }
    .padding(20)
    .background(Color.ncCard)
    .clipShape(RoundedRectangle(cornerRadius: 16))
    .overlay(
      RoundedRectangle(cornerRadius: 16)
        .stroke(Color.ncBorder, lineWidth: 1)
    )
  }

  private func errorBanner(_ message: String) -> some View {
    HStack(spacing: 8) {
      Image(systemName: "exclamationmark.circle.fill")
        .foregroundStyle(Color.ncError)
      Text(message)
        .font(.footnote)
        .foregroundStyle(Color.ncErrorFg)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.ncError.opacity(0.08))
    .clipShape(RoundedRectangle(cornerRadius: 10))
  }

  private var signInButton: some View {
    Button {
      authSession.signIn()
    } label: {
      HStack(spacing: 10) {
        if authSession.state == .loading {
          ProgressView()
            .progressViewStyle(.circular)
            .tint(.white)
            .scaleEffect(0.85)
        } else {
          Image(systemName: "person.badge.key.fill")
            .font(.system(size: 16, weight: .semibold))
        }

        Text(authSession.state == .loading ? "Signing in…" : "Sign In with NARTHECare")
          .fontWeight(.semibold)
      }
      .frame(maxWidth: .infinity)
      .padding(.vertical, 15)
      .background(
        authSession.state == .loading
          ? Color.ncAccent.opacity(0.7)
          : Color.ncAccent
      )
      .foregroundStyle(.white)
      .clipShape(RoundedRectangle(cornerRadius: 12))
    }
    .disabled(authSession.state == .loading)
    .animation(.easeInOut(duration: 0.15), value: authSession.state)
  }

  // MARK: - Disclaimer

  private var disclaimerText: some View {
    Text(
      "NARTHECare is a caregiver information tool. "
        + "It does not provide medical diagnosis, treatment recommendations, "
        + "or emergency guidance."
    )
    .font(.caption2)
    .foregroundStyle(.tertiary)
    .multilineTextAlignment(.center)
  }
}

// MARK: - Login banner palette

/// Local palette for the login banner. Mirrors the navy slogan banner
/// in `CareHubView` so both screens share the same brand identity.
private extension Color {
  static let loginBannerBg = Color(
    red: 0x0D / 255, green: 0x0F / 255, blue: 0x2B / 255)
  static let loginBannerAccent = Color(
    red: 0x3B / 255, green: 0x5B / 255, blue: 0xDB / 255)
  static let loginBannerSubtitle = Color(
    red: 0x91 / 255, green: 0xA7 / 255, blue: 0xFF / 255)
  static let loginBannerTitle = Color(
    red: 0xEE / 255, green: 0xF0 / 255, blue: 0xFF / 255)
}

// MARK: - Previews

#Preview("Login — idle") {
  LoginView()
    .environmentObject(AuthSession())
}
