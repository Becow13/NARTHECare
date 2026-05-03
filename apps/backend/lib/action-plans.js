/**
 * Action-plan read-side parsing and constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, the
 * service layer, and unit tests. All DB access lives in
 * `services/dao/actionPlanDao.js`.
 *
 * An action plan is a small, vetted set of "Ways To Support" the
 * caregiver can work through. The dashboard groups plans by `status`
 * (`active` / `paused` / `completed`).
 */

// ─── Constants ──────────────────────────────────────────────────────────────

/** Canonical `status` values persisted in `action_plans.status`. */
export const ACTION_PLAN_STATUSES = Object.freeze({
  active: "active",
  paused: "paused",
  completed: "completed",
})

/** Canonical `status` values persisted in `action_plan_items.status`. */
export const ACTION_PLAN_ITEM_STATUSES = Object.freeze({
  pending: "pending",
  done: "done",
  skipped: "skipped",
})

const ACTION_PLAN_STATUS_SET = new Set(Object.values(ACTION_PLAN_STATUSES))

/** Server-side defaults / hard caps for the list endpoint. */
export const DEFAULT_LIST_LIMIT = 25
export const MAX_LIST_LIMIT = 100

// ─── Query parsing ──────────────────────────────────────────────────────────

/**
 * Normalize the `?status=&limit=` query string for the list endpoint
 * into DB-ready filters.
 */
export function parseActionPlanListQuery(query) {
  const raw = query ?? {}
  const status = _parseEnum(raw.status, ACTION_PLAN_STATUS_SET, "status")
  const limit = _parseLimit(raw.limit)
  return { status, limit }
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
