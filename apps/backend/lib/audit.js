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
})

/** Canonical resource types so analytics queries can filter by kind. */
export const AUDIT_RESOURCE_TYPES = Object.freeze({
  user: "user",
  careRecipient: "care_recipient",
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
