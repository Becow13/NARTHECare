/**
 * Appointment read-side parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, the future Epic FHIR Encounter sync (Phase 6+), and
 * unit tests. All DB access lives in `services/dao/appointmentDao.js`.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Canonical `status` values persisted in `appointments.status`. */
export const APPOINTMENT_STATUSES = Object.freeze({
  scheduled: "scheduled",
  completed: "completed",
  cancelled: "cancelled",
  /** Auto-set by a Phase 4B / 4C job when the scheduled_for has passed. */
  missed: "missed",
})

/**
 * Canonical `time_window` filter values for the list endpoint. We keep
 * them here rather than fold them into a generic `status` filter so the
 * dashboard's "upcoming" view can use a half-open range without having
 * to enumerate every status combination.
 */
export const APPOINTMENT_TIME_WINDOWS = Object.freeze({
  upcoming: "upcoming",
  past: "past",
  all: "all",
})

const APPOINTMENT_STATUS_SET = new Set(Object.values(APPOINTMENT_STATUSES))
const APPOINTMENT_TIME_WINDOW_SET = new Set(Object.values(APPOINTMENT_TIME_WINDOWS))

/** Server-side defaults / hard caps for the list endpoint. */
export const DEFAULT_LIST_LIMIT = 50
export const MAX_LIST_LIMIT = 200

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?status=&window=&limit=` query string for the list
 * endpoint into DB-ready filters.
 */
export function parseAppointmentListQuery(query) {
  const raw = query ?? {}
  const status = _parseEnum(raw.status, APPOINTMENT_STATUS_SET, "status")
  const timeWindow = _parseEnum(
    raw.window ?? raw.timeWindow,
    APPOINTMENT_TIME_WINDOW_SET,
    "window",
  )
  const limit = _parseLimit(raw.limit)
  return {
    status,
    timeWindow: timeWindow ?? APPOINTMENT_TIME_WINDOWS.all,
    limit,
  }
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
