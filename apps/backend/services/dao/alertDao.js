/**
 * DAO for the `alerts` table.
 *
 * Two read shapes:
 *   - per-recipient: filtered by `care_recipient_id` (the partition key).
 *   - cross-recipient: scoped to the set of recipients the caller is on
 *     the care team for. The recipient-id list is computed at the
 *     service layer and passed in here as `$1::uuid[]` so the SQL stays
 *     parameter-only (no string interpolation).
 *
 * Phase 4 only ships reads; the rule + AI alert engine in Phase 4B
 * lands the write side.
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    severity TEXT NOT NULL,
    category TEXT,
    title TEXT NOT NULL,
    explanation TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    observed_at TIMESTAMPTZ NOT NULL,
    source_type TEXT,
    source_record_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );
`

// Read path index — covers the common "active alerts for one recipient,
// newest first" query without a sort.
const CREATE_INDEX_RECIPIENT_OBSERVED_SQL = `
  CREATE INDEX IF NOT EXISTS alerts_recipient_observed_idx
    ON alerts (care_recipient_id, observed_at DESC);
`

// Cross-recipient feed index — `WHERE care_recipient_id = ANY($1)` plus
// optional `status =` benefits from a (status, observed_at) shape.
const CREATE_INDEX_STATUS_OBSERVED_SQL = `
  CREATE INDEX IF NOT EXISTS alerts_status_observed_idx
    ON alerts (status, observed_at DESC);
`

const SELECT_BASE_PROJECTION = `
  SELECT id, care_recipient_id, severity, category, title, explanation,
         status, observed_at, source_type, source_record_id, metadata,
         created_at, resolved_at
    FROM alerts
`

// ── Per-recipient list ─────────────────────────────────────────────────────

const SELECT_BY_RECIPIENT_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1
   ORDER BY observed_at DESC
   LIMIT $2;
`

const SELECT_BY_RECIPIENT_SEVERITY_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND severity = $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_BY_RECIPIENT_STATUS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND status = $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_BY_RECIPIENT_SEVERITY_STATUS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND severity = $2 AND status = $3
   ORDER BY observed_at DESC
   LIMIT $4;
`

// ── Cross-recipient list ───────────────────────────────────────────────────

const SELECT_FOR_USER_RECIPIENTS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = ANY($1::uuid[])
   ORDER BY observed_at DESC
   LIMIT $2;
`

const SELECT_FOR_USER_RECIPIENTS_SEVERITY_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = ANY($1::uuid[]) AND severity = $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_FOR_USER_RECIPIENTS_STATUS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = ANY($1::uuid[]) AND status = $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_FOR_USER_RECIPIENTS_SEVERITY_STATUS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = ANY($1::uuid[]) AND severity = $2 AND status = $3
   ORDER BY observed_at DESC
   LIMIT $4;
`

/**
 * List alerts for a single care recipient, newest-first.
 *
 * Filters are layered server-side as a defense-in-depth backstop — the
 * route handler is the primary access gate.
 */
export async function fetchAlertsForRecipient(
  pool,
  recipientId,
  { severity = null, status = null, limit },
) {
  if (severity && status) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_SEVERITY_STATUS_SQL, [
      recipientId,
      severity,
      status,
      limit,
    ])
    return rows
  }
  if (severity) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_SEVERITY_SQL, [
      recipientId,
      severity,
      limit,
    ])
    return rows
  }
  if (status) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_STATUS_SQL, [
      recipientId,
      status,
      limit,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_BY_RECIPIENT_SQL, [recipientId, limit])
  return rows
}

/**
 * Cross-recipient alert feed scoped to a user's accessible recipients.
 *
 * The caller (service layer) must compute `recipientIds` from the user's
 * care-team rows; this DAO never derives them. Empty `recipientIds`
 * short-circuits to `[]` so the SQL never runs with `ANY('{}')`.
 */
export async function fetchAlertsAcrossRecipients(
  pool,
  recipientIds,
  { severity = null, status = null, limit },
) {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return []
  if (severity && status) {
    const { rows } = await pool.query(SELECT_FOR_USER_RECIPIENTS_SEVERITY_STATUS_SQL, [
      recipientIds,
      severity,
      status,
      limit,
    ])
    return rows
  }
  if (severity) {
    const { rows } = await pool.query(SELECT_FOR_USER_RECIPIENTS_SEVERITY_SQL, [
      recipientIds,
      severity,
      limit,
    ])
    return rows
  }
  if (status) {
    const { rows } = await pool.query(SELECT_FOR_USER_RECIPIENTS_STATUS_SQL, [
      recipientIds,
      status,
      limit,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_FOR_USER_RECIPIENTS_SQL, [
    recipientIds,
    limit,
  ])
  return rows
}

/**
 * Idempotent migration for `alerts`. Must run after
 * `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureAlertSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_OBSERVED_SQL)
  await pool.query(CREATE_INDEX_STATUS_OBSERVED_SQL)
}
