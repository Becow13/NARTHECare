/**
 * Care-recipient parsing and validation helpers.
 *
 * Keep this file free of I/O — it is imported by the route handler, future
 * background jobs, and unit tests, so it must be safe to import from any
 * context without side effects. All DB access lives in the DAO layer.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Canonical care-team roles persisted in the `care_team_members.role` column. */
export const CARE_TEAM_ROLES = Object.freeze({
  primaryCaregiver: "primary_caregiver",
  caregiver: "caregiver",
  familyMember: "family_member",
  clinician: "clinician",
})

/** Canonical permission levels persisted in `care_team_members.permission_level`. */
export const CARE_TEAM_PERMISSION_LEVELS = Object.freeze({
  fullAccess: "full_access",
  readWrite: "read_write",
  readOnly: "read_only",
})

// ─── Payload parsing ─────────────────────────────────────────────────────────

/**
 * Normalize a `POST /care-recipients` body into DB-ready columns.
 *
 * Throws a plain `Error` on invalid input so the route handler can translate
 * the message into a 400 response (mirrors the `collectHealthRows` contract).
 * `name` is required; `date_of_birth` and `primary_condition` are optional.
 */
export function parseCareRecipientInput(body) {
  const raw = body ?? {}
  const name = typeof raw.name === "string" ? raw.name.trim() : ""
  if (name.length === 0) {
    throw new Error("name (non-empty string) is required")
  }

  const dateOfBirth = _parseDateOfBirth(raw.date_of_birth ?? raw.dateOfBirth)
  const primaryCondition = _parseOptionalText(
    raw.primary_condition ?? raw.primaryCondition,
  )

  return {
    name,
    date_of_birth: dateOfBirth,
    primary_condition: primaryCondition,
  }
}

/**
 * Normalize a `PATCH /care-recipients/:id/profile` body into the DAO's
 * camelCase update shape.
 *
 * Returns `null` for any field the caller did not include so the DAO's
 * `COALESCE` keeps the previous value. An explicit empty string is
 * preserved as `""` so a caregiver can clear a previously-stored
 * value (e.g. emergency contact phone). Throws on type errors so the
 * route handler can return a 400.
 *
 * Cognito-bound and identity-defining fields (`name`, `id`, member
 * `role`, `permission_level`) are intentionally rejected here — the
 * profile UI must not be a backdoor for renaming or escalation.
 */
export function parseCareRecipientProfileUpdate(body) {
  const raw = body ?? {}
  const reject = ["id", "name", "role", "permission_level", "permissionLevel"]
  for (const field of reject) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) {
      throw new Error(`Field "${field}" is not editable from the profile UI`)
    }
  }
  return {
    dateOfBirth: _parsePatchDateOfBirth(raw.date_of_birth ?? raw.dateOfBirth),
    primaryCondition: _parsePatchText(
      raw.primary_condition ?? raw.primaryCondition,
      "primary_condition",
    ),
    relationship: _parsePatchText(raw.relationship, "relationship"),
    emergencyContactName: _parsePatchText(
      raw.emergency_contact_name ?? raw.emergencyContactName,
      "emergency_contact_name",
    ),
    emergencyContactPhone: _parsePatchText(
      raw.emergency_contact_phone ?? raw.emergencyContactPhone,
      "emergency_contact_phone",
    ),
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _parseDateOfBirth(value) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error("date_of_birth must be a YYYY-MM-DD string")
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date_of_birth: ${value}`)
  }
  return value
}

function _parseOptionalText(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") {
    throw new Error("primary_condition must be a string when provided")
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// PATCH-shaped DOB. `undefined` / `null` / empty string all map to
// the null sentinel so the DAO's COALESCE leaves the previous value
// alone. Phase 1 deliberately does NOT support clearing a stored
// value through the profile PATCH — caregivers cannot wipe a recipient
// down to empty fields by accident; admin tooling owns that path.
function _parsePatchDateOfBirth(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") {
    throw new Error("date_of_birth must be a YYYY-MM-DD string")
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date_of_birth: ${trimmed}`)
  }
  return trimmed
}

// PATCH-shaped optional text. `undefined` / `null` / empty string
// all → null (DAO leaves unchanged) — see DOB note above for why
// "clear" is not supported in Phase 1. Cap length so a runaway form
// cannot fill the column with megabytes of payload.
const MAX_PROFILE_TEXT_LENGTH = 200

function _parsePatchText(value, label) {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string when provided`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > MAX_PROFILE_TEXT_LENGTH) {
    throw new Error(
      `${label} must be ${MAX_PROFILE_TEXT_LENGTH} characters or fewer`,
    )
  }
  return trimmed
}
