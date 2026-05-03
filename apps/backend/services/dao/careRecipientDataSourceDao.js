/**
 * DAO for the `care_recipient_data_sources` table.
 *
 * Registry table — one row per (`care_recipient_id`, `source_type`)
 * pair. The actual sample data still lives in `health_observations`;
 * this table only carries connection state (`status`, `last_synced_at`,
 * `error_message`) so the dashboard's Data Sources card has a single
 * row per integration to render even when zero observations exist yet.
 *
 * Phase 4 ships the read surface. Phase 4A adds `upsertSyncStatus` so
 * the HealthKit sync writes a row for `source_type = 'healthkit'`; the
 * Epic OAuth flow (Phase 6+) will reuse the same upsert for
 * `source_type = 'epic'`.
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

// Phase 4A — single-row UPSERT. The Phase 4A sync route writes one of
// these per successful or failed sync attempt, keyed on the partial
// UNIQUE `(care_recipient_id, source_type)` declared above. We
// explicitly clear `error_message` when transitioning back to a
// successful state so the dashboard does not stale-display an old
// failure reason after recovery.
const UPSERT_SYNC_STATUS_SQL = `
  INSERT INTO care_recipient_data_sources (
    care_recipient_id,
    source_type,
    status,
    last_synced_at,
    error_message,
    updated_at
  ) VALUES ($1, $2, $3, $4, $5, NOW())
  ON CONFLICT (care_recipient_id, source_type)
  DO UPDATE SET
    status = EXCLUDED.status,
    last_synced_at = COALESCE(EXCLUDED.last_synced_at, care_recipient_data_sources.last_synced_at),
    error_message = EXCLUDED.error_message,
    updated_at = NOW()
  RETURNING id, care_recipient_id, source_type, status, last_synced_at,
            external_id, error_message, metadata, created_at, updated_at;
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
 * Fetch a single registry row for `(care_recipient_id, source_type)`,
 * or `null` if the integration has never been seen for this recipient.
 *
 * `GET /healthkit/status` calls this directly so it can return a
 * neutral `not_connected` shape instead of 404 when the iOS app asks
 * before the first sync. Same call site is reused by the post-sync
 * upsert path to compose the response envelope.
 */
export async function fetchSyncStatus(pool, recipientId, sourceType) {
  const { rows } = await pool.query(SELECT_BY_RECIPIENT_TYPE_SQL, [
    recipientId,
    sourceType,
  ])
  return rows[0] ?? null
}

/**
 * Upsert the sync registry row for `(care_recipient_id, source_type)`.
 *
 * Returns the updated row so the route handler can echo the
 * authoritative `last_synced_at` back to the iOS client without a
 * second query. `lastSyncedAt` is `null`-safe at the DAO layer (a
 * failed sync writes `status = 'error'` without touching the
 * timestamp via the COALESCE clause), so callers do not need to
 * pre-compute "preserve previous value".
 */
export async function upsertSyncStatus(
  pool,
  { careRecipientId, sourceType, status, lastSyncedAt = null, errorMessage = null },
) {
  const { rows } = await pool.query(UPSERT_SYNC_STATUS_SQL, [
    careRecipientId,
    sourceType,
    status,
    lastSyncedAt,
    errorMessage,
  ])
  return rows[0]
}

/**
 * Idempotent migration for `care_recipient_data_sources`.
 * Must run after `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureCareRecipientDataSourceSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_SOURCE_UNIQUE_SQL)
}
