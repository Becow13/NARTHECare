/**
 * DAO for the `audit_logs` table.
 *
 * Audit writes are fire-and-forget from the service layer's perspective — a
 * failure to log must never block the caller's response. The service wraps
 * this insert in a try/catch; this file is only responsible for the SQL
 * shape and the idempotent schema migration.
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    metadata JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

// Auditor read paths — kept here (not in a separate migration file) so
// reads and writes share one source of truth. Both indexes are
// time-descending on `created_at` to match how a compliance auditor
// scrolls (newest first), and partial WHERE clauses keep them lean by
// excluding rows with NULL keys (system actions / pre-resource events).
//
// `actor_user_id, created_at DESC` — "everything user X did, newest first".
// `resource_type, resource_id, created_at DESC` — "every access to this
// resource, newest first" (the polymorphic feed the audit story relies on).
//
// `resource_id` is intentionally NOT a foreign key — it holds ids from
// many tables (care_recipient, user, etc.) keyed by `resource_type`. The
// index gives the auditor query the seek path without taking on any
// referential coupling that would break when (e.g.) a care recipient is
// deleted.
const CREATE_INDEX_ACTOR_CREATED_SQL = `
  CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
    ON audit_logs (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;
`

const CREATE_INDEX_RESOURCE_CREATED_SQL = `
  CREATE INDEX IF NOT EXISTS audit_logs_resource_created_idx
    ON audit_logs (resource_type, resource_id, created_at DESC)
    WHERE resource_id IS NOT NULL;
`

const INSERT_SQL = `
  INSERT INTO audit_logs (
    actor_user_id, action, resource_type, resource_id,
    metadata, ip_address, user_agent
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING id;
`

/**
 * Insert a single audit row.
 *
 * `metadata` is serialized with `JSON.stringify` at the call-site via the
 * `pg` driver's jsonb handling. `resource_id` is optional so system-level
 * actions (e.g. future LIST operations) can still be recorded with a null id.
 */
export async function insertAuditLog(pool, entry) {
  const { rows } = await pool.query(INSERT_SQL, [
    entry.actor_user_id ?? null,
    entry.action,
    entry.resource_type,
    entry.resource_id ?? null,
    entry.metadata ?? null,
    entry.ip_address ?? null,
    entry.user_agent ?? null,
  ])
  return rows[0]
}

/**
 * Ensure the `audit_logs` table and its read-path indexes exist.
 * Must be called after `ensureUserSchema` because `actor_user_id` is a FK
 * into `users(id)`.
 */
export async function ensureAuditLogSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_ACTOR_CREATED_SQL)
  await pool.query(CREATE_INDEX_RESOURCE_CREATED_SQL)
}
