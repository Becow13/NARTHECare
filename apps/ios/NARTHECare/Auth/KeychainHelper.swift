import Foundation
import Security

/// Keys for NARTHECare Keychain items.
///
/// Each case maps to a unique service-scoped account string so items never
/// collide with other apps or with each other. Changing a raw value is a
/// breaking change — existing users would lose their stored tokens.
enum KeychainKey: String {
  case idToken = "com.narthecare.auth.idToken"
  case accessToken = "com.narthecare.auth.accessToken"
  case refreshToken = "com.narthecare.auth.refreshToken"
}

/// Thin, synchronous Keychain wrapper for NARTHECare authentication tokens.
///
/// All operations are fire-and-forget on failure — no throws, no logs —
/// because Keychain errors at this layer are not actionable by the user and
/// must not surface token content or PHI in application logs.
enum KeychainHelper {
  private static let service = "com.narthecare.auth"

  /// Persists `data` under `key`, replacing any pre-existing item.
  static func save(data: Data, key: KeychainKey) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key.rawValue,
    ]
    let attrs: [String: Any] = [kSecValueData as String: data]
    let updateStatus = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
    if updateStatus == errSecItemNotFound {
      var addQuery = query
      addQuery[kSecValueData as String] = data
      SecItemAdd(addQuery as CFDictionary, nil)
    }
  }

  /// Returns the raw `Data` stored under `key`, or `nil` if absent.
  static func load(key: KeychainKey) -> Data? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key.rawValue,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess else { return nil }
    return result as? Data
  }

  /// Removes the Keychain item for `key`. No-op if the item does not exist.
  static func delete(key: KeychainKey) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key.rawValue,
    ]
    SecItemDelete(query as CFDictionary)
  }
}
