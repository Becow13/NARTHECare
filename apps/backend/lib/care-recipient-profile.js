/**
 * Care-recipient profile parsing, validation, and RBAC helpers.
 *
 * Keep this file free of I/O — it is imported by the route handler,
 * service layer, and unit tests, so it must be safe to import from any
 * context without side effects. All DB access lives in the DAO layer
 * (`services/dao/careRecipientProfileDao.js`). Mock data lives in
 * `services/mock/careRecipientProfileMock.js`.
 *
 * The enum constants (RISK_LEVELS, DATA_SOURCE_TYPES, etc.) come from
 * `shared/models/CareRecipientProfile.js` — the JS mirror of
 * `shared/contracts/careRecipientProfile.schema.json` — so the
 * backend, web, and iOS mirrors never drift. The relative path
 * reaches out of `apps/backend/` into the monorepo root; both
 * Dockerfiles stage `shared/models/` alongside `apps/backend/` so the
 * import resolves at runtime.
 */

import {
  RISK_LEVELS,
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
  CARE_TEAM_PROFILE_ROLES,
  CARE_TEAM_PROFILE_PERMISSIONS,
} from "../../../shared/models/CareRecipientProfile.js"

// ─── Constants ──────────────────────────────────────────────────────────────

export {
  RISK_LEVELS,
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
  CARE_TEAM_PROFILE_ROLES,
  CARE_TEAM_PROFILE_PERMISSIONS,
}

/** Stable mock id used while the feature runs off `careRecipientProfileMock.js`. */
export const MOCK_CARE_RECIPIENT_PROFILE_ID =
  "11111111-1111-4111-a111-111111111111"

// RFC-4122 form — any case, with hyphens. Kept local so this module does not
// depend on the route-handler's copy. Version digit is not enforced — any
// well-formed UUID-shaped string is accepted so legacy ids do not break.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Return `true` when `value` is a UUID-shaped string safe to pass into SQL
 * queries. Route handlers use this to short-circuit bad ids as a 400
 * before the service layer runs so the DB never sees a malformed param.
 */
export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value)
}

// ─── RBAC placeholder ───────────────────────────────────────────────────────

/**
 * Decide whether `userId` is allowed to read the profile of
 * `careRecipientId`.
 *
 * Placeholder policy while real care-team membership lives in the
 * database without any mock rows for the mock profile. Today it only
 * requires a non-empty user id (the `requireCognitoUser` middleware
 * guarantees that when it sets `req.user`). Once the profile is backed
 * by real rows, this MUST be replaced with a query against
 * `care_team_members` so non-members cannot read a recipient.
 *
 * TODO(rbac): replace the body with a PostgreSQL query against
 * `care_team_members` keyed on (user_id, care_recipient_id). Fail
 * closed when no row exists.
 */
export function canAccessCareRecipient(userId, careRecipientId) {
  if (typeof userId !== "string" || userId.length === 0) return false
  if (typeof careRecipientId !== "string" || careRecipientId.length === 0) {
    return false
  }
  return true
}
