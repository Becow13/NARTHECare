/**
 * User profile parsing and validation helpers.
 *
 * Keep this file free of I/O — it is imported by the route handler,
 * service layer, and unit tests, so it must be safe to import from
 * any context without side effects. All DB access lives in the DAO
 * layer (`services/dao/userDao.js`).
 *
 * Editable surface is intentionally minimal:
 *   - `display_name`  — what the sidebar shows
 *   - `phone`         — caregiver's contact number for SMS / call
 *
 * Cognito-bound fields (`email`, `email_verified`, `cognito_sub`)
 * and security-sensitive fields (`role`, `status`, `id`,
 * `last_login_at`) are deliberately rejected here — those flow
 * through Cognito (email) or admin tooling (role/status) so a
 * hijacked session cannot escalate privileges via the profile UI.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Cap so a runaway form cannot fill the column with megabytes. */
const MAX_DISPLAY_NAME_LENGTH = 120
const MAX_PHONE_LENGTH = 32

/** Phone fields that the profile PATCH MUST refuse to update. */
const REJECTED_FIELDS = Object.freeze([
  "id",
  "cognito_sub",
  "cognitoSub",
  "email",
  "email_verified",
  "emailVerified",
  "phone_verified",
  "phoneVerified",
  "role",
  "status",
  "last_login_at",
  "lastLoginAt",
  "created_at",
  "createdAt",
])

// ─── Payload parsing ────────────────────────────────────────────────────────

/**
 * Normalize a `PATCH /api/me` body into the DAO's camelCase update shape.
 *
 * `displayName` and `phone` are optional. `undefined` / `null` / empty
 * string all map to a null sentinel so the DAO's COALESCE leaves the
 * previous value alone. Phase 1 deliberately does NOT support clearing
 * a stored value through the profile PATCH; admin tooling owns that.
 *
 * Throws a plain `Error` on invalid input so the route handler can
 * translate the message into a 400 response.
 */
export function parseUserProfileUpdate(body) {
  const raw = body ?? {}
  for (const field of REJECTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      throw new Error(`Field "${field}" is not editable from the profile UI`)
    }
  }
  return {
    displayName: _parsePatchText(
      raw.display_name ?? raw.displayName,
      "display_name",
      MAX_DISPLAY_NAME_LENGTH,
    ),
    phone: _parsePatchText(raw.phone, "phone", MAX_PHONE_LENGTH),
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _parsePatchText(value, label, maxLength) {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string when provided`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`)
  }
  return trimmed
}
