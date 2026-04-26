import { insertAuditLog, ensureAuditLogSchema } from "./dao/auditLogDao.js"

/**
 * Write a single audit-log row for a user-initiated action.
 *
 * Failures are swallowed and logged so an audit outage never breaks the
 * caller's primary response — audit rows are recoverable from server logs,
 * but a 500 on the main request is a visible regression for the iOS client.
 * Callers should still `await` this so the write completes before the
 * request finishes in the common case.
 */
export async function logAction(
  pool,
  { actorUserId, action, resourceType, resourceId, metadata, ipAddress, userAgent },
) {
  try {
    await insertAuditLog(pool, {
      actor_user_id: actorUserId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
  } catch (err) {
    console.error("[audit] failed to write audit row", {
      action,
      resourceType,
      resourceId,
      err: err instanceof Error ? err.message : err,
    })
  }
}

/**
 * Run the idempotent schema migration for the `audit_logs` table. Must run
 * after `authService.ensureSchema` because `actor_user_id` references
 * `users(id)`.
 */
export async function ensureSchema(pool) {
  return ensureAuditLogSchema(pool)
}
