/**
 * Audit-log parsing helpers and action constants.
 *
 * Keep this file free of I/O — it is imported by the route handler, service
 * layer, and unit tests. The actual row insert lives in
 * `services/dao/auditLogDao.js`; this module only defines the canonical action
 * strings and request-context extraction so every call site stays consistent.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Canonical audit-log actions. Every new write must use a value from here. */
export const AUDIT_ACTIONS = Object.freeze({
  authenticateUser: "AUTHENTICATE_USER",
  /** Cognito `sub` moved onto an existing row after verified-email collision. */
  mergeCognitoIdentity: "AUTH_MERGE_COGNITO_IDENTITY",
  createCareRecipient: "CREATE_CARE_RECIPIENT",
  viewCareRecipient: "VIEW_CARE_RECIPIENT",
  viewCareRecipientProfile: "VIEW_CARE_RECIPIENT_PROFILE",
  listCareRecipients: "LIST_CARE_RECIPIENTS",
  // Phase 4 read endpoints. Every list/get of care-recipient-scoped
  // signal data writes one of these; metadata carries non-PHI counts only.
  listHealthObservations: "LIST_HEALTH_OBSERVATIONS",
  listMetricBaselines: "LIST_METRIC_BASELINES",
  listAiSummaries: "LIST_AI_SUMMARIES",
  listAlerts: "LIST_ALERTS",
  /** Cross-recipient alert feed (`GET /alerts`) — no resource id. */
  listAlertsAcrossRecipients: "LIST_ALERTS_ACROSS_RECIPIENTS",
  listAppointments: "LIST_APPOINTMENTS",
  listActionPlans: "LIST_ACTION_PLANS",
  listDataSources: "LIST_DATA_SOURCES",
  // Phase 4A — HealthKit sync companion. Successful and failed sync
  // attempts both write one row; metadata carries `{ accepted, deduped,
  // rejected, metricTypes }` only — no values, no ids, no timestamps
  // of individual samples.
  syncHealthkitObservations: "SYNC_HEALTHKIT_OBSERVATIONS",
  /** Read of the HealthKit sync registry row from `GET /healthkit/status`. */
  viewHealthkitStatus: "VIEW_HEALTHKIT_STATUS",
  // Phase 4B — background-job actions. `actor_user_id` is null
  // (the job runs without a Cognito user). `resource_id` is the
  // care_recipient_id when the row reflects a per-recipient run, or
  // null for a sweep-summary row. Metadata carries non-PHI counts /
  // durations only — never metric values, summary text, alert
  // titles, or per-sample identifiers.
  recomputeMetricBaselines: "RECOMPUTE_METRIC_BASELINES",
  generateAiSummary: "GENERATE_AI_SUMMARY",
  evaluateAlerts: "EVALUATE_ALERTS",
})

/** Canonical resource types so analytics queries can filter by kind. */
export const AUDIT_RESOURCE_TYPES = Object.freeze({
  user: "user",
  careRecipient: "care_recipient",
  // Phase 4 — one row per signal domain. Audited resource_id is the
  // care_recipient_id (the partition key), not an individual row id, so
  // analytics can filter "all access to care recipient X" in one query.
  healthObservation: "health_observation",
  metricBaseline: "metric_baseline",
  aiSummary: "ai_summary",
  alert: "alert",
  appointment: "appointment",
  actionPlan: "action_plan",
  dataSource: "data_source",
})

// ─── Request-context extraction ──────────────────────────────────────────────

/**
 * Pull IP + User-Agent out of an Express request for the audit row.
 *
 * We prefer `X-Forwarded-For`'s first hop because the API runs behind
 * Aptible's edge proxy, but fall back to `req.ip` for local dev where the
 * header is absent. Values are truncated to `null` when empty so the DB
 * gets a clean NULL instead of an empty string.
 */
export function extractRequestContext(req) {
  const forwarded = req?.headers?.["x-forwarded-for"]
  const ipAddress = _firstHop(forwarded) ?? _emptyToNull(req?.ip)
  const userAgent = _emptyToNull(req?.headers?.["user-agent"])
  return { ipAddress, userAgent }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function _firstHop(forwardedHeader) {
  if (typeof forwardedHeader !== "string") return null
  const first = forwardedHeader.split(",")[0]?.trim()
  return first && first.length > 0 ? first : null
}

function _emptyToNull(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
