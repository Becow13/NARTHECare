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
