/**
 * Data-source registry parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, the future Phase 4A HealthKit sync registry update,
 * and unit tests. All DB access lives in
 * `services/dao/careRecipientDataSourceDao.js`.
 *
 * `DATA_SOURCE_TYPES` and `DATA_SOURCE_STATUSES` are re-exported from
 * `shared/models/CareRecipientProfile.js` so the registry table never
 * drifts from the dashboard's `DataSource[]` view model. The relative
 * path mirrors `lib/care-recipient-profile.js` — both Dockerfiles stage
 * `shared/models/` alongside `apps/backend/`.
 */

import {
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
} from "../../../shared/models/CareRecipientProfile.js"

// ─── Constants ──────────────────────────────────────────────────────────────

export { DATA_SOURCE_TYPES, DATA_SOURCE_STATUSES }

const DATA_SOURCE_TYPE_SET = new Set(Object.values(DATA_SOURCE_TYPES))
const DATA_SOURCE_STATUS_SET = new Set(Object.values(DATA_SOURCE_STATUSES))

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?type=&status=` query string for the list endpoint
 * into DB-ready filters. Both filters are optional — the registry is
 * usually returned in full so the dashboard's Data Sources card can
 * render every supported integration in one shot.
 */
export function parseDataSourceListQuery(query) {
  const raw = query ?? {}
  const sourceType = _parseEnum(
    raw.type ?? raw.sourceType,
    DATA_SOURCE_TYPE_SET,
    "type",
  )
  const status = _parseEnum(raw.status, DATA_SOURCE_STATUS_SET, "status")
  return { sourceType, status }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function _parseEnum(value, allowedSet, fieldName) {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string when provided`)
  }
  if (!allowedSet.has(value)) {
    throw new Error(`Unknown ${fieldName}: ${value}`)
  }
  return value
}
