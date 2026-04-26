import Foundation

/// Cognito Hosted UI configuration for NARTHECare.
///
/// All values are read from `Info.plist` build settings that are populated
/// by `Config.xcconfig` (see `apps/ios/Config.xcconfig`). This keeps every
/// Cognito parameter out of source code and out of version control.
///
/// Never log any field of this struct — `clientId` and `userPoolId` are
/// identifiers that must not appear in application logs.
struct CognitoConfig: Sendable {
  let userPoolId: String
  let clientId: String
  let region: String
  /// The Cognito Hosted UI redirect URI registered in the AWS App Client.
  /// Must be `narthecare://auth/callback` for local iOS login.
  let redirectUri: String

  // MARK: - Loading

  /// Loads Cognito configuration from the app's `Info.plist`.
  ///
  /// Throws `CognitoConfigError.missingConfiguration` if any required key
  /// is absent or empty — this surfaces a clear startup failure rather than
  /// a silent mis-configuration.
  static func load() throws -> CognitoConfig {
    guard
      let dict = Bundle.main.infoDictionary,
      let userPoolId = dict["NARTHECareCognitoUserPoolId"] as? String, !userPoolId.isEmpty,
      let clientId = dict["NARTHECareCognitoClientId"] as? String, !clientId.isEmpty,
      let region = dict["NARTHECareCognitoRegion"] as? String, !region.isEmpty,
      let redirectUri = dict["NARTHECareCognitoRedirectUri"] as? String, !redirectUri.isEmpty
    else {
      throw CognitoConfigError.missingConfiguration
    }
    return CognitoConfig(
      userPoolId: userPoolId,
      clientId: clientId,
      region: region,
      redirectUri: redirectUri
    )
  }
}

// MARK: - Errors

/// Errors thrown when loading Cognito configuration.
enum CognitoConfigError: LocalizedError {
  /// One or more required Cognito keys are missing from Info.plist / Config.xcconfig.
  case missingConfiguration

  var errorDescription: String? {
    "Cognito configuration is incomplete. Copy Config.xcconfig to Config.local.xcconfig and fill in all values, then link it to the Xcode target."
  }
}
