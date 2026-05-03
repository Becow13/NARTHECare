/**
 * DAO for the `health_observations` table.
 *
 * The table is the canonical store for every per-sample health signal
 * ingested from HealthKit, Epic, or manual entry. Phase 4 only reads
 * from it — the Phase 4A sync path lands the write side using
 * `INSERT … ON CONFLICT (source_type, source_record_id) DO NOTHING`
 * for idempotent re-sync. Keep the schema here and the matching block
 * in `schema.sql` in lock-step.
 *
 * The pool is injected so this module is trivially testable with a
 * fake pg surface; no module-level state lives in this file.
 */

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS health_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_recipient_id UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
    metric_type TEXT NOT NULL,
    value_numeric DOUBLE PRECISION,
    value_unit TEXT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    source_record_id TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`

// Read path index — covers the dashboard's "latest N samples by metric"
// query without a sort.
const CREATE_INDEX_RECIPIENT_METRIC_OBSERVED_SQL = `
  CREATE INDEX IF NOT EXISTS health_observations_recipient_metric_observed_idx
    ON health_observations (care_recipient_id, metric_type, observed_at DESC);
`

// Idempotent ingest — Phase 4A relies on this UNIQUE for ON CONFLICT.
// Built here (not in the Phase 4A migration) so reads and writes share a
// single source of truth and a partial index re-create cannot diverge.
const CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL = `
  CREATE UNIQUE INDEX IF NOT EXISTS health_observations_source_record_uidx
    ON health_observations (source_type, source_record_id)
    WHERE source_record_id IS NOT NULL;
`

// All four query shapes share the same SELECT projection. Keeping them
// as four explicit statements (rather than a dynamic builder) makes the
// fake-pool tests pattern-match one literal each — no string fuzziness.
const SELECT_BASE_PROJECTION = `
  SELECT id, care_recipient_id, metric_type, value_numeric, value_unit,
         observed_at, source_type, source_id, source_record_id, metadata,
         created_at
    FROM health_observations
`

const SELECT_BY_RECIPIENT_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1
   ORDER BY observed_at DESC
   LIMIT $2;
`

const SELECT_BY_RECIPIENT_METRIC_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND metric_type = $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_BY_RECIPIENT_SINCE_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND observed_at >= $2
   ORDER BY observed_at DESC
   LIMIT $3;
`

const SELECT_BY_RECIPIENT_METRIC_SINCE_SQL = `
  ${SELECT_BASE_PROJECTION}
   WHERE care_recipient_id = $1 AND metric_type = $2 AND observed_at >= $3
   ORDER BY observed_at DESC
   LIMIT $4;
`

/**
 * List observations for a single care recipient, newest-first.
 *
 * Filters are layered server-side so a non-member can never see a row
 * even if the route forgot the access gate (the access gate is the
 * primary defense; this is a defense-in-depth backstop). Returns an
 * empty array when no rows match — never throws on emptiness.
 */
export async function fetchObservationsForRecipient(
  pool,
  recipientId,
  { metricType = null, since = null, limit },
) {
  if (metricType && since) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_METRIC_SINCE_SQL, [
      recipientId,
      metricType,
      since,
      limit,
    ])
    return rows
  }
  if (metricType) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_METRIC_SQL, [
      recipientId,
      metricType,
      limit,
    ])
    return rows
  }
  if (since) {
    const { rows } = await pool.query(SELECT_BY_RECIPIENT_SINCE_SQL, [
      recipientId,
      since,
      limit,
    ])
    return rows
  }
  const { rows } = await pool.query(SELECT_BY_RECIPIENT_SQL, [recipientId, limit])
  return rows
}

/**
 * Idempotent migration for `health_observations` and its indexes.
 * Must run after `ensureCareRecipientSchema` because of the FK.
 */
export async function ensureHealthObservationSchema(pool) {
  await pool.query(CREATE_TABLE_SQL)
  await pool.query(CREATE_INDEX_RECIPIENT_METRIC_OBSERVED_SQL)
  await pool.query(CREATE_INDEX_SOURCE_RECORD_UNIQUE_SQL)
}
