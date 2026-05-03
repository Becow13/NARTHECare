/**
 * Data-source registry parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, the Phase 4A HealthKit sync registry upsert, and unit
 * tests. All DB access lives in
 * `services/dao/careRecipientDataSourceDao.js`.
 *
 * `DATA_SOURCE_TYPES` and `DATA_SOURCE_STATUSES` are re-exported from
 * `shared/models/CareRecipientProfile.js` so the dashboard's `DataSource[]`
 * view model never drifts from the registry. Phase 4A introduces a
 * second registry-only key, `"healthkit"`, that records the inbound
 * transport (`POST /healthkit/sync`); the web adapter
 * (`apps/web/lib/adapters/careRecipientToSenior.ts`) maps it to the
 * "Apple Health" UI display so the dashboard contract is unchanged.
 */

import {
  DATA_SOURCE_TYPES,
  DATA_SOURCE_STATUSES,
} from "../../../shared/models/CareRecipientProfile.js"
import { SYNC_SOURCE_TYPES } from "../../../shared/models/HealthObservation.js"

// ─── Constants ──────────────────────────────────────────────────────────────

export { DATA_SOURCE_TYPES, DATA_SOURCE_STATUSES }

/**
 * Registry-level transport identifier for the iOS HealthKit sync path.
 * Stored in `care_recipient_data_sources.source_type`. Distinct from
 * the dashboard's `apple_health` view-model value: the registry tracks
 * *how* data arrives (HealthKit framework on iOS), the view model
 * tracks *what* it represents to the caregiver (Apple Health). See the
 * adapter for the mapping.
 */
export const REGISTRY_SOURCE_HEALTHKIT = SYNC_SOURCE_TYPES.healthkit

/**
 * Filter validation set — the union of dashboard-visible types AND the
 * registry-only `healthkit` row Phase 4A writes. Keeps the read
 * endpoint accepting `?type=healthkit` so iOS / web can introspect the
 * sync registry directly.
 */
const DATA_SOURCE_TYPE_SET = new Set([
  ...Object.values(DATA_SOURCE_TYPES),
  REGISTRY_SOURCE_HEALTHKIT,
])
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
