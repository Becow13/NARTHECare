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
 * Phase 4 shipped the read surface; Phase 4B adds `insertAlerts` which
 * batch-inserts engine-derived rows under the partial UNIQUE
 * `(source_type, source_record_id) WHERE source_record_id IS NOT NULL`
 * declared below. The `INSERT … ON CONFLICT DO NOTHING` shape mirrors
 * the Phase 4A `health_observations` ingest pattern so re-running the
 * engine on the same evidence collapses to a single row.
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

// Phase 4B — partial UNIQUE on (source_type, source_record_id). Lets
// the alert engine's `INSERT … ON CONFLICT DO NOTHING` collapse repeat
// runs on the same evidence to a single row. Manual / future
// caregiver-authored alerts pass `source_record_id = NULL` and slip
// past the index (as intended — the partial WHERE clause keeps the
// index small and avoids accidental NULL collisions).
const CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS alerts_source_record_uidx
    ON alerts (source_type, source_record_id)
    WHERE source_record_id IS NOT NULL;
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

// Phase 4B — single-row INSERT used by `insertAlerts`. `ON CONFLICT
// DO NOTHING` keys on the partial UNIQUE above so re-running the
// engine on the same evidence quietly dedupes. `RETURNING id` lets the
// caller count "actually inserted" vs "deduped" without a follow-up
// SELECT, mirroring the Phase 4A observation insert pattern.
const INSERT_ALERT_SQL = `
  INSERT INTO alerts (
    care_recipient_id,
    severity,
    category,
    title,
    explanation,
    status,
    observed_at,
    source_type,
    source_record_id,
    metadata
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  ON CONFLICT (source_type, source_record_id) DO NOTHING
  RETURNING id;
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
 * Insert a batch of engine-derived alerts for a single recipient inside
 * one transaction.
 *
 * Returns `{ accepted, deduped }` — `accepted` counts rows the partial
 * UNIQUE accepted (newly stored), `deduped` counts rows silently
 * dropped because a prior engine run already wrote the same
 * `(source_type, source_record_id)` pair. The whole batch commits or
 * rolls back together; partial writes would silently misreport the
 * engine's progress on the next run.
 */
export async function insertAlerts(pool, recipientId, rows) {
  if (rows.length === 0) {
    return { accepted: 0, deduped: 0 }
  }

  const client = await pool.connect()
  let accepted = 0
  try {
    await client.query("BEGIN")
    for (const row of rows) {
      const result = await client.query(INSERT_ALERT_SQL, [
        recipientId,
        row.severity,
        row.category ?? null,
        row.title,
        row.explanation ?? null,
        row.status ?? "active",
        row.observed_at,
        row.source_type ?? null,
        row.source_record_id ?? null,
        row.metadata ?? null,
      ])
      // ON CONFLICT DO NOTHING returns 0 rows for deduped inserts.
      if (result.rows.length > 0) accepted += 1
    }
    await client.query("COMMIT")
  } catch (err) {
    try {
      await client.query("ROLLBACK")
    } catch {
      /* ignore — surface the original error */
    }
    throw err
  } finally {
    client.release()
  }

  return { accepted, deduped: rows.length - accepted }
}

/**
 * Idempotent migration for `alerts`. Must run after
 * `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureAlertSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_OBSERVED_SQL)
  await pool.query(CREATE_INDEX_STATUS_OBSERVED_SQL)
  await pool.query(CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL)
}
