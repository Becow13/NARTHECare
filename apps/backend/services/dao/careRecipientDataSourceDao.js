/**
 * DAO for the `care_recipient_data_sources` table.
 *
 * Registry table — one row per (`care_recipient_id`, `source_type`)
 * pair. The actual sample data still lives in `health_observations`;
 * this table only carries connection state (`status`, `last_synced_at`,
 * `error_message`) so the dashboard's Data Sources card has a single
 * row per integration to render even when zero observations exist yet.
 *
 * Phase 4 only ships reads. The Phase 4A HealthKit sync writes a row
 * for `source_type = 'healthkit'` from
 * `careRecipientDataSourceDao#upsertSyncStatus` (added in Phase 4A);
 * the Epic OAuth flow (Phase 6+) writes one for `source_type = 'epic'`.
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS care_recipient_data_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_connected',
    last_synced_at TIMESTAMPTZ,
    external_id TEXT,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

// One registry row per (recipient, source_type). Phase 4A's upsert
// uses this for ON CONFLICT.
const CREATE_INDEX_RECIPIENT_SOURCE_UNIQUE_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS care_recipient_data_sources_recipient_source_uidx
    ON care_recipient_data_sources (care_recipient_id, source_type);
`

const SELECT_BASE_PROJECTION = `
  SELECT id, care_recipient_id, source_type, status, last_synced_at,
         external_id, error_message, metadata, created_at, updated_at
    FROM care_recipient_data_sources
`

const SELECT_BY_RECIPIENT_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1
   ORDER BY source_type ASC;
`

const SELECT_BY_RECIPIENT_TYPE_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND source_type = $2
   LIMIT 1;
`

const SELECT_BY_RECIPIENT_STATUS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND status = $2
   ORDER BY source_type ASC;
`

const SELECT_BY_RECIPIENT_TYPE_STATUS_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND source_type = $2 AND status = $3
   LIMIT 1;
`

/**
 * List data-source registry rows for a single care recipient.
 *
 * Returns an empty array when the recipient has no registry rows yet —
 * the dashboard's Data Sources card already renders neutral defaults
 * for unknown integrations, so we never need to fabricate empty rows
 * here.
 */
export async function fetchDataSourcesForRecipient(
  pool,
  recipientId,
  { sourceType = null, status = null } = {},
) {
  if (sourceType && status) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_TYPE_STATUS_SQL, [
      recipientId,
      sourceType,
      status,
    ])
    return rows
  }
  if (sourceType) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_TYPE_SQL, [
      recipientId,
      sourceType,
    ])
    return rows
  }
  if (status) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_STATUS_SQL, [
      recipientId,
      status,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_BY_RECIPIENT_SQL, [recipientId])
  return rows
}

/**
 * Idempotent migration for `care_recipient_data_sources`.
 * Must run after `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureCareRecipientDataSourceSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_SOURCE_UNIQUE_SQL)
}
