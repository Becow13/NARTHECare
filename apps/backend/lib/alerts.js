/**
 * Alert read-side parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, the future Phase 4B alert evaluation engine, and unit
 * tests. All DB access lives in `services/dao/alertDao.js`.
 *
 * Vocabulary mirrors `docs/web-mvp-plan.md §6 Terminology`:
 *   severity = `routine` | `monitor` | `critical`
 *   status   = `active` | `acknowledged` | `resolved`
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Canonical `severity` values persisted in `alerts.severity`. */
export const ALERT_SEVERITIES = Object.freeze({
  /** All-good check-in / informational signal. */
  routine: "routine",
  /** Worth a caregiver glance — not emergent. */
  monitor: "monitor",
  /** Caregiver attention needed now. */
  critical: "critical",
})

/** Canonical `status` values persisted in `alerts.status`. */
export const ALERT_STATUSES = Object.freeze({
  active: "active",
  acknowledged: "acknowledged",
  resolved: "resolved",
})

const ALERT_SEVERITY_SET = new Set(Object.values(ALERT_SEVERITIES))
const ALERT_STATUS_SET = new Set(Object.values(ALERT_STATUSES))

/** Server-side defaults / hard caps for the list endpoints. */
export const DEFAULT_LIST_LIMIT = 50
export const MAX_LIST_LIMIT = 200

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?severity=&status=&limit=` query string for the alerts
 * list endpoints (per-recipient and cross-recipient).
 *
 * Throws a plain `Error` on invalid input so the route handler can
 * translate the message into a 400 response.
 */
export function parseAlertListQuery(query) {
  const raw = query ?? {}
  const severity = _parseEnum(raw.severity, ALERT_SEVERITY_SET, "severity")
  const status = _parseEnum(raw.status, ALERT_STATUS_SET, "status")
  const limit = _parseLimit(raw.limit)
  return { severity, status, limit }
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

function _parseLimit(value) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIST_LIMIT
  }
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error("limit must be a positive integer")
  }
  return Math.min(n, MAX_LIST_LIMIT)
}
