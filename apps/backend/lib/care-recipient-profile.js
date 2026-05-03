/**
 * Care-recipient profile shared constants.
 *
 * Keep this file free of I/O — it is imported by the route handler,
 * service layer, and unit tests, so it must be safe to import from any
 * context without side effects. All DB access lives in the DAO layer
 * (`services/dao/careRecipientProfileDao.js`).
 *
 * The enum constants come from `shared/models/CareRecipientProfile.js`
 * — the JS mirror of `shared/contracts/careRecipientProfile.schema.json`
 * — so the backend, web, and iOS mirrors never drift. The relative
 * path reaches out of `apps/backend/` into the monorepo root; both
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

// RFC-4122 form — any case, with hyphens. Kept local so this module
// does not depend on the route-handler's copy. Version digit is not
// enforced — any well-formed UUID-shaped string is accepted so legacy
// ids do not break.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Return `true` when `value` is a UUID-shaped string safe to pass
 * into SQL queries. Route handlers use this to short-circuit bad ids
 * as a 400 before the service layer runs so the DB never sees a
 * malformed param.
 */
export function isUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value)
}
